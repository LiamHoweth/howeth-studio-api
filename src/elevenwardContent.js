import { createPrivateKey, sign } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { canonicalJson, sha256, validateContentBundle } from "./elevenwardValidation.js";

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is not configured`);
  return value.trim();
}

function normalizePem(value) {
  return value.replace(/\\n/g, "\n");
}

export function createContentSigner(env = process.env) {
  return {
    sign(bytes) {
      const key = createPrivateKey(normalizePem(required(
        env.ELEVENWARD_CONTENT_SIGNING_PRIVATE_KEY,
        "ELEVENWARD_CONTENT_SIGNING_PRIVATE_KEY"
      )));
      if (key.asymmetricKeyType !== "ed25519") throw new Error("Elevenward content key must be Ed25519");
      return sign(null, Buffer.from(bytes), key).toString("base64url");
    }
  };
}

export function createContentStore(env = process.env) {
  const bucket = env.ELEVENWARD_CONTENT_BUCKET;
  const endpoint = env.ELEVENWARD_CONTENT_ENDPOINT;
  const publicBaseUrl = env.ELEVENWARD_CONTENT_PUBLIC_BASE_URL;
  const configured = Boolean(
    bucket && endpoint && publicBaseUrl && env.ELEVENWARD_CONTENT_ACCESS_KEY_ID &&
    env.ELEVENWARD_CONTENT_SECRET_ACCESS_KEY
  );
  const client = configured ? new S3Client({
    endpoint,
    region: env.ELEVENWARD_CONTENT_REGION || "auto",
    forcePathStyle: env.ELEVENWARD_CONTENT_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: env.ELEVENWARD_CONTENT_ACCESS_KEY_ID,
      secretAccessKey: env.ELEVENWARD_CONTENT_SECRET_ACCESS_KEY
    }
  }) : null;

  return {
    configured,
    async put(key, bytes) {
      if (!client) throw new Error("Elevenward content object storage is not configured");
      try {
        await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(bytes),
        IfNoneMatch: "*",
        ContentType: "application/json; charset=utf-8",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: { sha256: sha256(bytes) }
        }));
      } catch (error) {
        if (error?.$metadata?.httpStatusCode !== 412) throw error;
        // An interrupted stage may retry the same content-addressed object.
        // Never overwrite it; verify that the existing bytes really match.
        const existing = await this.get(key);
        if (sha256(existing) !== sha256(bytes)) throw new Error('Immutable content collision');
      }
      return `${publicBaseUrl.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
    },
    async get(key) {
      if (!client) throw new Error("Elevenward content object storage is not configured");
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (response.ContentLength > 5_000_000) throw new Error('Content object exceeds size limit');
      const chunks = [];
      let size = 0;
      for await (const chunk of response.Body) {
        size += chunk.length;
        if (size > 5_000_000) {
          response.Body.destroy?.();
          throw new Error('Content object exceeds size limit');
        }
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf8');
    }
  };
}

export function prepareContentRelease(bundle, signer) {
  const validation = validateContentBundle(bundle);
  if (!validation.valid) return { validation };
  const bytes = canonicalJson(bundle);
  const checksum = sha256(bytes);
  const signature = signer.sign(bytes);
  const objectKey = `elevenward/content/${validation.releaseVersion}/${checksum}.json`;
  const manifest = {
    releaseVersion: validation.releaseVersion,
    compatibleClient: {
      minimum: validation.minClientVersion,
      maximum: validation.maxClientVersion
    },
    checksum: `sha256:${checksum}`,
    signatureAlgorithm: "Ed25519",
    signature,
    locales: validation.locales,
    assets: [{ kind: "content-bundle", path: objectKey, checksum: `sha256:${checksum}` }]
  };
  return { validation, bytes, checksum, signature, objectKey, manifest };
}
