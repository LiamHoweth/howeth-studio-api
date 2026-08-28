import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { exportPKCS8, generateKeyPair, SignJWT } from "jose";
import {
  createProviderAuth,
  decryptProviderToken,
  encryptProviderToken
} from "../src/providerAuth.js";

describe("provider token encryption", () => {
  it("round-trips Apple refresh tokens without storing plaintext", () => {
    const secret = "test-encryption-key-with-at-least-32-characters";
    const encrypted = encryptProviderToken("apple-refresh-token", secret);
    assert.ok(encrypted);
    assert.doesNotMatch(encrypted, /apple-refresh-token/);
    assert.equal(decryptProviderToken(encrypted, secret), "apple-refresh-token");
  });

  it("rejects decryption with a different server key", () => {
    const encrypted = encryptProviderToken("apple-refresh-token", "first-long-test-secret");
    assert.throws(() => decryptProviderToken(encrypted, "different-long-test-secret"));
  });
});

describe("provider identity verification", () => {
  const env = {
    APPLE_CLIENT_ID: "com.footballera.game",
    APPLE_TEAM_ID: "TEAM123456",
    APPLE_KEY_ID: "KEY1234567",
    AUTH_ENCRYPTION_KEY: "provider-auth-encryption-test-key-with-32-bytes",
    GOOGLE_OAUTH_CLIENT_IDS: "football-era.apps.googleusercontent.com"
  };
  let appleIdentityPrivateKey;
  let appleIdentityPublicKey;
  let googleIdentityPrivateKey;
  let googleIdentityPublicKey;

  before(async () => {
    ({ privateKey: appleIdentityPrivateKey, publicKey: appleIdentityPublicKey } = await generateKeyPair("RS256"));
    ({ privateKey: googleIdentityPrivateKey, publicKey: googleIdentityPublicKey } = await generateKeyPair("RS256"));
    const appleClientKeys = await generateKeyPair("ES256", { extractable: true });
    env.APPLE_PRIVATE_KEY = await exportPKCS8(appleClientKeys.privateKey);
  });

  async function appleToken({ audience = env.APPLE_CLIENT_ID, nonce = "nonce-value" } = {}) {
    return new SignJWT({ nonce, email: "PLAYER@EXAMPLE.COM" })
      .setProtectedHeader({ alg: "RS256", kid: "apple-test" })
      .setIssuer("https://appleid.apple.com")
      .setAudience(audience)
      .setSubject("apple-subject")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(appleIdentityPrivateKey);
  }

  async function googleToken({ audience = env.GOOGLE_OAUTH_CLIENT_IDS, nonce } = {}) {
    return new SignJWT({ email: "PLAYER@GMAIL.COM", email_verified: true, ...(nonce ? { nonce } : {}) })
      .setProtectedHeader({ alg: "RS256", kid: "google-test" })
      .setIssuer("https://accounts.google.com")
      .setAudience(audience)
      .setSubject("google-subject")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(googleIdentityPrivateKey);
  }

  it("verifies Apple signature, issuer, audience, nonce, and exchanges the authorization code", async () => {
    const auth = createProviderAuth(
      env,
      async () => new Response(JSON.stringify({ refresh_token: "apple-refresh-token" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }),
      { appleKeys: appleIdentityPublicKey }
    );
    const identity = await auth.verifyApple({
      identityToken: await appleToken(),
      authorizationCode: "authorization-code",
      nonce: "nonce-value"
    });
    assert.equal(identity.subject, "apple-subject");
    assert.equal(identity.email, "player@example.com");
    assert.equal(decryptProviderToken(identity.refreshTokenCiphertext, env.AUTH_ENCRYPTION_KEY), "apple-refresh-token");
  });

  it("rejects Apple nonce and audience mismatches", async () => {
    const auth = createProviderAuth(env, fetch, { appleKeys: appleIdentityPublicKey });
    await assert.rejects(async () => auth.verifyApple({
      identityToken: await appleToken(), authorizationCode: "authorization-code", nonce: "wrong-nonce"
    }));
    await assert.rejects(async () => auth.verifyApple({
      identityToken: await appleToken({ audience: "wrong-client" }),
      authorizationCode: "authorization-code",
      nonce: "nonce-value"
    }), (error) => error.code === "ERR_JWT_CLAIM_VALIDATION_FAILED");
  });

  it("verifies Google issuer, audience, signature, verified email, and an OIDC nonce when supplied", async () => {
    const auth = createProviderAuth(env, fetch, { googleKeys: googleIdentityPublicKey });
    const identity = await auth.verifyGoogle({ idToken: await googleToken({ nonce: "google-nonce" }), nonce: "google-nonce" });
    assert.deepEqual(identity, {
      provider: "google",
      subject: "google-subject",
      email: "player@gmail.com",
      refreshTokenCiphertext: null
    });
    await assert.rejects(async () => auth.verifyGoogle({ idToken: await googleToken({ audience: "wrong-client" }) }));
    await assert.rejects(async () => auth.verifyGoogle({ idToken: await googleToken({ nonce: "token-nonce" }), nonce: "wrong-nonce" }));
  });

  it("rejects a Google token signed by an untrusted key", async () => {
    const attacker = await generateKeyPair("RS256");
    const token = await new SignJWT({ email_verified: true })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience(env.GOOGLE_OAUTH_CLIENT_IDS)
      .setSubject("attacker")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(attacker.privateKey);
    const auth = createProviderAuth(env, fetch, { googleKeys: googleIdentityPublicKey });
    await assert.rejects(() => auth.verifyGoogle({ idToken: token }), (error) => error.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED");
  });
});
