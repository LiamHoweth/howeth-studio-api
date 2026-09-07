import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { createPlayerAlias } from "../src/elevenwardDatabase.js";
import { prepareContentRelease } from "../src/elevenwardContent.js";
import {
  canonicalJson,
  leaderboardRejection,
  validateContentBundle,
  validateLeaderboardSubmission,
  validateSyncRequest
} from "../src/elevenwardValidation.js";

const account = {
  id: "11111111-1111-4111-8111-111111111111",
  alias: "Swift Falcon 01234",
  provider: "apple",
  verified_email: "player@example.com",
  expires_at: new Date("2027-12-01T00:00:00Z")
};
const elevenwardToken = "s".repeat(43);
const elevenwardTokenHash = createHash("sha256").update(elevenwardToken).digest("hex");

const launchBundle = JSON.parse(readFileSync(
  new URL("./fixtures/elevenward-launch.json", import.meta.url),
  "utf8"
));

function bundle() {
  return structuredClone(launchBundle);
}

function syncBody(baseRevision = 0) {
  return {
    baseRevision,
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    snapshot: {
      id: "33333333-3333-4333-8333-333333333333",
      schemaVersion: 2,
      rulesVersion: "rules-1",
      contentVersion: "launch-1",
      difficulty: "balanced",
      seed: 42,
      revision: baseRevision,
      updatedAt: new Date().toISOString(),
      player: { position: "striker" }
    }
  };
}

const calls = { sync: [], leaderboard: [], events: [], webhook: [], deletion: [], staff: [] };
let analyticsGranted = false;
let contentRow = null;

const elevenwardDatabase = {
  async ping() { return true; },
  async findAccountBySessionTokenHash(tokenHash) {
    return tokenHash === elevenwardTokenHash ? account : null;
  },
  async createAccountSession(input) {
    return { id: account.id, alias: account.alias, provider: input.identity.provider, email: input.identity.email };
  },
  async revokeSession() {},
  async getAccountIdentities() { return []; },
  async deleteAccount() { calls.deletion.push("app"); },
  async createDeletionChallenge(_accountId, _codeHash, expiresAt) { return { expires_at: expiresAt }; },
  async verifyDeletionChallenge() { return true; },
  async confirmDeletion() { calls.deletion.push("web"); return true; },
  async getCareerSlots() { return []; },
  async syncCareer(_accountId, request) {
    calls.sync.push(request);
    if (request.baseRevision === 99) {
      return { status: 409, body: { conflict: { conflictId: "44444444-4444-4444-8444-444444444444", localSnapshot: request.snapshot, remoteSnapshot: { id: "remote" } } } };
    }
    return { status: 200, body: { slot: { slotIndex: request.slotIndex, snapshot: request.snapshot, revision: 1 } } };
  },
  async deleteCareerSlot(_accountId, slotIndex, baseRevision) {
    if (baseRevision === 99) {
      return {
        status: 409,
        body: {
          conflict: {
            conflictId: "66666666-6666-4666-8666-666666666666",
            slotIndex,
            localSnapshot: null,
            remoteSnapshot: syncBody().snapshot
          }
        }
      };
    }
    return { status: 204, body: null };
  },
  async listConflicts() { return []; },
  async resolveConflict() { return { slotIndex: 0, revision: 2 }; },
  async upsertLeaderboardSubmission(_accountId, alias, submission, rejection) {
    calls.leaderboard.push({ alias, submission, rejection });
    return { accepted: !rejection };
  },
  async getLeaderboard() {
    return [{
      alias: account.alias,
      career_id: "33333333-3333-4333-8333-333333333333",
      legacy_score: 32000,
      aggregate_metrics: { goals: 40 },
      updated_at: new Date("2026-09-01T00:00:00Z")
    }];
  },
  async getEntitlements() { return []; },
  async processRevenueCatEvent(event) {
    calls.webhook.push(event);
    return { duplicate: calls.webhook.length > 1 };
  },
  async setAnalyticsConsent(_accountId, consent) {
    analyticsGranted = consent.state === "granted";
    return { state: consent.state, policy_version: consent.policyVersion, updated_at: new Date() };
  },
  async insertAnalyticsEvents(_accountId, events) {
    calls.events.push(...events);
    return { consent: analyticsGranted, accepted: analyticsGranted ? events.length : 0 };
  },
  async getContentManifest(version = null) {
    if (!contentRow || (version && contentRow.release_version !== version)) return null;
    return contentRow;
  },
  async createContentRelease(release) {
    contentRow = {
      release_version: release.releaseVersion,
      min_client_version: release.minClientVersion,
      max_client_version: release.maxClientVersion,
      checksum: release.checksum,
      locales: release.locales,
      object_key: release.objectKey,
      public_url: release.publicUrl,
      signature: release.signature,
      manifest: release.manifest,
      validation_report: release.validationReport,
      status: "draft",
      published_at: null
    };
    return contentRow;
  },
  async publishContentRelease() {
    if (!contentRow) return null;
    contentRow = { ...contentRow, status: "published", published_at: new Date() };
    return contentRow;
  },
  async rollbackContentRelease() {
    if (!contentRow?.published_at) return null;
    contentRow = { ...contentRow, status: "published", published_at: new Date() };
    return contentRow;
  },
  async recordStaffAction(action) { calls.staff.push(action); },
  async getOperationalSummary() {
    return {
      accounts: 1,
      activeSessions: 1,
      careerSlots: 0,
      pendingConflicts: 0,
      activeEntitlements: 0,
      analyticsEvents24h: calls.events.length,
      unprocessedWebhooks: 0,
      publishedRelease: contentRow?.release_version ?? null
    };
  },
  async listStaffActions() { return calls.staff; },
  async listContentReleases() { return contentRow ? [contentRow] : []; }
};

describe("Elevenward isolated API", () => {
  let server;
  let origin;

  before(async () => {
    const providerAuth = {
      async verifyApple() { return { provider: "apple", subject: "elevenward-apple", email: account.verified_email }; },
      async verifyGoogle() { return { provider: "google", subject: "elevenward-google", email: "player@gmail.com" }; },
      async revokeApple() {}
    };
    const app = createApp({
      database: {},
      env: {
        ADMIN_API_KEY: "elevenward-admin",
        REVENUECAT_WEBHOOK_SECRET: "revenuecat-secret"
      },
      providerAuth,
      elevenwardDatabase,
      elevenwardProviderAuth: providerAuth,
      elevenwardContentStore: {
        async put(key) { return `https://content.example/${key}`; },
        async get() { return canonicalJson(bundle()); }
      },
      elevenwardContentSigner: { sign() { return "test-ed25519-signature"; } }
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  const auth = { authorization: `Bearer ${elevenwardToken}`, "content-type": "application/json" };

  it("reports readiness for only the Elevenward schema", async () => {
    const response = await fetch(`${origin}/v1/elevenward/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).schema, "elevenward");
  });

  it("rejects a token that exists only in a sibling product", async () => {
    const response = await fetch(`${origin}/v1/elevenward/account`, {
      headers: { authorization: `Bearer ${"f".repeat(43)}` }
    });
    assert.equal(response.status, 401);
  });

  it("creates a product-specific identity session with a generated alias", async () => {
    const response = await fetch(`${origin}/v1/elevenward/auth/apple`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: "i".repeat(120), authorizationCode: "authorization-code", nonce: "n".repeat(32) })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.account.alias, account.alias);
    assert.ok(body.accessToken.length >= 40);
  });

  it("accepts a versioned SyncRequest and surfaces a 409 preserving both snapshots", async () => {
    const accepted = await fetch(`${origin}/v1/elevenward/career-slots/0/sync`, {
      method: "PUT", headers: auth, body: JSON.stringify(syncBody())
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).slot.revision, 1);

    const conflicted = await fetch(`${origin}/v1/elevenward/career-slots/0/sync`, {
      method: "PUT", headers: auth, body: JSON.stringify(syncBody(99))
    });
    assert.equal(conflicted.status, 409);
    const conflict = (await conflicted.json()).conflict;
    assert.equal(conflict.localSnapshot.id, "33333333-3333-4333-8333-333333333333");
    assert.equal(conflict.remoteSnapshot.id, "remote");
  });

  it("syncs offline deletions and conflicts instead of resurrecting a changed cloud career", async () => {
    const deleted = await fetch(`${origin}/v1/elevenward/career-slots/0?baseRevision=1`, {
      method: "DELETE", headers: auth
    });
    assert.equal(deleted.status, 204);

    const conflicted = await fetch(`${origin}/v1/elevenward/career-slots/0?baseRevision=99`, {
      method: "DELETE", headers: auth
    });
    assert.equal(conflicted.status, 409);
    const conflict = (await conflicted.json()).conflict;
    assert.equal(conflict.localSnapshot, null);
    assert.equal(conflict.remoteSnapshot.id, "33333333-3333-4333-8333-333333333333");
  });

  it("partitions prize-free leaderboards by position, difficulty, and rules", async () => {
    const submission = {
      careerId: "33333333-3333-4333-8333-333333333333",
      position: "striker",
      difficulty: "balanced",
      rulesVersion: "rules-1",
      aggregateMetrics: { seasons: 4, matches: 100, legacyScore: 32000, goals: 90, assists: 20, trophies: 2 },
      validationEvidence: { seed: 42, finalRevision: 300, snapshotChecksum: "a".repeat(64) }
    };
    const posted = await fetch(`${origin}/v1/elevenward/leaderboards/submissions`, {
      method: "POST", headers: auth, body: JSON.stringify(submission)
    });
    assert.equal(posted.status, 202);
    assert.equal((await posted.json()).alias, account.alias);

    const board = await fetch(`${origin}/v1/elevenward/leaderboards?position=striker&difficulty=balanced&rulesVersion=rules-1`);
    assert.equal(board.status, 200);
    const body = await board.json();
    assert.match(body.notice, /no prizes/i);
    assert.equal(body.entries[0].alias, account.alias);
  });

  it("accepts bounded boost evidence and legitimate boosted leaderboard ranges", () => {
    const submission = validateLeaderboardSubmission({
      careerId: "33333333-3333-4333-8333-333333333333",
      position: "striker",
      difficulty: "balanced",
      rulesVersion: "2026.3",
      aggregateMetrics: {
        seasons: 1,
        matches: 20,
        legacyScore: 42_000,
        goals: 30,
        assists: 10,
        trophies: 0
      },
      validationEvidence: {
        seed: 42,
        finalRevision: 80,
        snapshotChecksum: "b".repeat(64),
        boostIdsUsed: ["vip", "doubleDevelopment", "doubleMoney"],
        developmentProgress: { finishing: 0.5, pace: 0 }
      }
    });
    assert.ok(submission);
    assert.equal(leaderboardRejection(submission), null);
    assert.deepEqual(submission.validationEvidence.boostIdsUsed, [
      "vip", "doubleDevelopment", "doubleMoney"
    ]);
  });

  it("rejects malformed boost evidence and scores above the 3x ceiling", () => {
    const invalidEvidence = validateLeaderboardSubmission({
      careerId: "33333333-3333-4333-8333-333333333333",
      position: "striker",
      difficulty: "balanced",
      rulesVersion: "2026.3",
      aggregateMetrics: { seasons: 1, matches: 20, legacyScore: 10_000 },
      validationEvidence: {
        seed: 42,
        finalRevision: 80,
        snapshotChecksum: "b".repeat(64),
        boostIdsUsed: ["allAccess", "vip"],
        developmentProgress: { finishing: 1 }
      }
    });
    assert.equal(invalidEvidence, null);

    const unknownAttribute = validateLeaderboardSubmission({
      careerId: "33333333-3333-4333-8333-333333333333",
      position: "striker",
      difficulty: "balanced",
      rulesVersion: "2026.3",
      aggregateMetrics: { seasons: 1, matches: 20, legacyScore: 10_000 },
      validationEvidence: {
        seed: 42,
        finalRevision: 80,
        snapshotChecksum: "b".repeat(64),
        boostIdsUsed: ["vip"],
        developmentProgress: { shooting: 0.5 }
      }
    });
    assert.equal(unknownAttribute, null);

    const aboveCeiling = validateLeaderboardSubmission({
      careerId: "33333333-3333-4333-8333-333333333333",
      position: "striker",
      difficulty: "balanced",
      rulesVersion: "2026.3",
      aggregateMetrics: {
        seasons: 1,
        matches: 20,
        legacyScore: 60_001,
        goals: 30,
        assists: 10,
        trophies: 0
      },
      validationEvidence: {
        seed: 42,
        finalRevision: 80,
        snapshotChecksum: "b".repeat(64),
        boostIdsUsed: ["allAccess"],
        developmentProgress: {}
      }
    });
    assert.ok(aboveCeiling);
    assert.equal(leaderboardRejection(aboveCeiling), "legacy_score_implausible");
  });

  it("enforces consent before accepting allowlisted, scrubbed analytics", async () => {
    const event = {
      events: [{
        eventId: "55555555-5555-4555-8555-555555555555",
        eventName: "week_completed",
        occurredAt: new Date().toISOString(),
        properties: { position: "striker", difficulty: "balanced", season: 1, week: 1, result: "win" }
      }]
    };
    const denied = await fetch(`${origin}/v1/elevenward/analytics/events`, {
      method: "POST", headers: auth, body: JSON.stringify(event)
    });
    assert.equal(denied.status, 403);

    const consent = await fetch(`${origin}/v1/elevenward/analytics/consent`, {
      method: "PUT", headers: auth, body: JSON.stringify({ state: "granted", policyVersion: "2026-09" })
    });
    assert.equal(consent.status, 200);
    const accepted = await fetch(`${origin}/v1/elevenward/analytics/events`, {
      method: "POST", headers: auth, body: JSON.stringify(event)
    });
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).accepted, 1);
  });

  it("processes RevenueCat updates idempotently behind a webhook secret", async () => {
    const event = {
      event: {
        id: "event-1",
        type: "INITIAL_PURCHASE",
        app_user_id: account.id,
        entitlement_ids: ["extra_career_slots"],
        store: "APP_STORE",
        transaction_id: "transaction-1",
        product_id: "com.howethstudio.elevenward.extra_slots",
        purchased_at_ms: Date.now()
      }
    };
    const unauthorized = await fetch(`${origin}/v1/elevenward/webhooks/revenuecat`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event)
    });
    assert.equal(unauthorized.status, 401);
    for (const duplicate of [false, true]) {
      const response = await fetch(`${origin}/v1/elevenward/webhooks/revenuecat`, {
        method: "POST",
        headers: { authorization: "Bearer revenuecat-secret", "content-type": "application/json" },
        body: JSON.stringify(event)
      });
      assert.equal(response.status, 202);
      assert.equal((await response.json()).duplicate, duplicate);
    }
  });

  it("maps the new permanent gamepass webhook entitlement to its exact product", async () => {
    const accepted = await fetch(`${origin}/v1/elevenward/webhooks/revenuecat`, {
      method: "POST",
      headers: { authorization: "Bearer revenuecat-secret", "content-type": "application/json" },
      body: JSON.stringify({
        event: {
          id: "event-vip",
          type: "INITIAL_PURCHASE",
          app_user_id: account.id,
          entitlement_ids: ["vip_starter_pack"],
          store: "PLAY_STORE",
          transaction_id: "transaction-vip",
          product_id: "com.howethstudio.elevenward.vip",
          purchased_at_ms: Date.now()
        }
      })
    });
    assert.equal(accepted.status, 202);

    const mismatched = await fetch(`${origin}/v1/elevenward/webhooks/revenuecat`, {
      method: "POST",
      headers: { authorization: "Bearer revenuecat-secret", "content-type": "application/json" },
      body: JSON.stringify({
        event: {
          id: "event-mismatch",
          type: "INITIAL_PURCHASE",
          app_user_id: account.id,
          entitlement_ids: ["all_access"],
          store: "APP_STORE",
          transaction_id: "transaction-mismatch",
          product_id: "com.howethstudio.elevenward.double_money"
        }
      })
    });
    assert.equal(mismatched.status, 400);
  });

  it("validates, stores, signs, publishes, and rolls back complete content", async () => {
    const invalid = structuredClone(bundle());
    delete invalid.clubs[0].text.fr;
    const validation = await fetch(`${origin}/v1/elevenward/admin/content/validate`, {
      method: "POST",
      headers: { authorization: "Bearer elevenward-admin", "content-type": "application/json" },
      body: JSON.stringify(invalid)
    });
    assert.equal(validation.status, 422);

    const created = await fetch(`${origin}/v1/elevenward/admin/content/releases`, {
      method: "POST",
      headers: { authorization: "Bearer elevenward-admin", "content-type": "application/json" },
      body: JSON.stringify(bundle())
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).signatureAlgorithm, "Ed25519");
    const objectUrl = `${origin}/v1/elevenward/content/objects/${contentRow.object_key}`;
    assert.equal((await fetch(objectUrl)).status, 404, 'draft objects stay private');
    assert.equal((await fetch(`${origin}/v1/elevenward/content/manifests/2026.2.0`)).status, 404);

    const published = await fetch(`${origin}/v1/elevenward/admin/content/releases/2026.2.0/publish`, {
      method: "POST", headers: { authorization: "Bearer elevenward-admin" }
    });
    assert.equal(published.status, 200);
    const objectResponse = await fetch(objectUrl);
    assert.equal(objectResponse.status, 200);
    assert.match(objectResponse.headers.get('cache-control'), /immutable/);
    assert.deepEqual(await objectResponse.json(), bundle());
    assert.equal((await fetch(objectUrl.replace(/[^/]+$/, `${'0'.repeat(64)}.json`))).status, 404);
    const manifest = await fetch(`${origin}/v1/elevenward/content/manifest`);
    assert.equal(manifest.status, 200);
    assert.equal((await manifest.json()).releaseVersion, "2026.2.0");

    const rolledBack = await fetch(`${origin}/v1/elevenward/admin/content/releases/2026.2.0/rollback`, {
      method: "POST", headers: { authorization: "Bearer elevenward-admin" }
    });
    assert.equal(rolledBack.status, 200);
    const operations = await fetch(`${origin}/v1/elevenward/admin/operations`, {
      headers: { authorization: "Bearer elevenward-admin" }
    });
    assert.equal(operations.status, 200);
    const operationsBody = await operations.json();
    assert.equal(operationsBody.summary.publishedRelease, "2026.2.0");
    assert.deepEqual(
      operationsBody.actions.map((action) => action.action),
      ["content_release_created", "content_release_published", "content_release_rollback"]
    );
  });

  it("supports authenticated app-to-web account deletion codes", async () => {
    const challenge = await fetch(`${origin}/v1/elevenward/account/deletion-challenge`, {
      method: "POST", headers: auth
    });
    assert.equal(challenge.status, 201);
    const challengeBody = await challenge.json();
    assert.match(challengeBody.deletionCode, /^\d{6}$/);
    const confirmed = await fetch(`${origin}/v1/elevenward/account/deletion-confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: challengeBody.accountId, deletionCode: challengeBody.deletionCode })
    });
    assert.equal(confirmed.status, 204);

    for (let attempt = 1; attempt < 12; attempt += 1) {
      const repeated = await fetch(`${origin}/v1/elevenward/account/deletion-confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      assert.equal(repeated.status, 400);
    }
    const rateLimited = await fetch(`${origin}/v1/elevenward/account/deletion-confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(rateLimited.status, 429);
  });
});

describe("Elevenward content and aliases", () => {
  it("normalizes native difficulties without rewriting durable snapshots", () => {
    for (const [native, partition] of [['story', 'story'], ['professional', 'balanced'], ['worldClass', 'elite']]) {
      const body = syncBody();
      body.snapshot.difficulty = native;
      const validated = validateSyncRequest('0', body);
      assert.equal(validated.difficulty, partition);
      assert.equal(validated.snapshot.difficulty, native);
    }
  });
  it("creates opaque public aliases without player-supplied free text", () => {
    assert.match(createPlayerAlias(), /^[A-Z][a-z]+ [A-Z][a-z]+ \d{5}$/);
  });

  it("canonicalizes equivalent content and signs only valid launch-scale bundles", () => {
    assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
    assert.equal(validateContentBundle(bundle()).valid, true);
    const impossible = bundle();
    impossible.domesticCups[0].openingFixtures[0].awayId = "unknown-club";
    impossible.internationalClubCompetition.fixtures[0].homeId =
      impossible.internationalClubCompetition.fixtures[0].awayId;
    const report = validateContentBundle(impossible);
    assert.equal(report.valid, false);
    assert.ok(report.errors.some((error) => error.includes("invalid for")));
    const prepared = prepareContentRelease(bundle(), { sign: () => "signature" });
    assert.equal(prepared.signature, "signature");
    assert.match(prepared.checksum, /^[a-f0-9]{64}$/);
  });
});
