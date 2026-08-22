import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is not configured`);
  return value.trim();
}

function normalizePrivateKey(value) {
  return value.replace(/\\n/g, "\n");
}

function encryptionKey(secret) {
  return createHash("sha256").update(required(secret, "AUTH_ENCRYPTION_KEY")).digest();
}

export function encryptProviderToken(token, secret) {
  if (!token) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptProviderToken(value, secret) {
  if (!value) return null;
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted provider token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

async function appleClientSecret(env) {
  const clientId = required(env.APPLE_CLIENT_ID, "APPLE_CLIENT_ID");
  const teamId = required(env.APPLE_TEAM_ID, "APPLE_TEAM_ID");
  const keyId = required(env.APPLE_KEY_ID, "APPLE_KEY_ID");
  const privateKey = await importPKCS8(normalizePrivateKey(required(env.APPLE_PRIVATE_KEY, "APPLE_PRIVATE_KEY")), "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
}

async function appleTokenRequest(env, fetchImpl, values) {
  const body = new URLSearchParams({
    client_id: required(env.APPLE_CLIENT_ID, "APPLE_CLIENT_ID"),
    client_secret: await appleClientSecret(env),
    ...values
  });
  const response = await fetchImpl(`${APPLE_ISSUER}/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Apple token exchange failed: ${payload.error ?? response.status}`);
  return payload;
}

export function createProviderAuth(
  env = process.env,
  fetchImpl = fetch,
  { appleKeys = APPLE_KEYS, googleKeys = GOOGLE_KEYS } = {}
) {
  return {
    async verifyApple({ identityToken, authorizationCode, nonce }) {
      const audience = required(env.APPLE_CLIENT_ID, "APPLE_CLIENT_ID");
      const { payload } = await jwtVerify(identityToken, appleKeys, {
        issuer: APPLE_ISSUER,
        audience
      });
      if (!payload.sub || payload.nonce !== nonce) throw new Error("Apple identity nonce mismatch");
      const tokenResponse = await appleTokenRequest(env, fetchImpl, {
        grant_type: "authorization_code",
        code: authorizationCode
      });
      return {
        provider: "apple",
        subject: payload.sub,
        email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
        refreshTokenCiphertext: encryptProviderToken(tokenResponse.refresh_token, env.AUTH_ENCRYPTION_KEY)
      };
    },

    async verifyGoogle({ idToken, nonce }) {
      const audiences = required(env.GOOGLE_OAUTH_CLIENT_IDS, "GOOGLE_OAUTH_CLIENT_IDS")
        .split(",").map((value) => value.trim()).filter(Boolean);
      const { payload } = await jwtVerify(idToken, googleKeys, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: audiences
      });
      if (!payload.sub || (nonce && payload.nonce !== nonce)) throw new Error("Google identity nonce mismatch");
      if (payload.email_verified === false) throw new Error("Google email is not verified");
      return {
        provider: "google",
        subject: payload.sub,
        email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
        refreshTokenCiphertext: null
      };
    },

    async revokeApple(refreshTokenCiphertext) {
      if (!refreshTokenCiphertext) return;
      const token = decryptProviderToken(refreshTokenCiphertext, env.AUTH_ENCRYPTION_KEY);
      const body = new URLSearchParams({
        client_id: required(env.APPLE_CLIENT_ID, "APPLE_CLIENT_ID"),
        client_secret: await appleClientSecret(env),
        token,
        token_type_hint: "refresh_token"
      });
      const response = await fetchImpl(`${APPLE_ISSUER}/auth/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      });
      if (!response.ok) throw new Error(`Apple token revocation failed: ${response.status}`);
    }
  };
}
