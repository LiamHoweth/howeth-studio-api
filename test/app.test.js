import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app.js";

const installation = { id: "11111111-1111-4111-8111-111111111111", platform: "ios", app_version: "1.2.0" };
const account = {
  id: "44444444-4444-4444-8444-444444444444",
  provider: "apple",
  verified_email: "player@example.com",
  expires_at: new Date("2027-01-01T00:00:00Z")
};
const calls = {
  events: [], careers: [], rejections: [], accountCareers: [], accountRejections: [],
  accountSessions: [], saveSlots: [], deletedAccounts: [], revokedSessions: [],
  expireNextAccountSession: false
};

const database = {
  async ping() { return true; },
  async createInstallation() {
    return { id: installation.id, created_at: new Date("2026-08-21T12:00:00Z") };
  },
  async findInstallationByTokenHash() { return installation; },
  async createAccountSession(input) {
    calls.accountSessions.push(input);
    return { id: account.id, provider: input.identity.provider, email: input.identity.email };
  },
  async findAccountBySessionTokenHash() {
    if (calls.expireNextAccountSession) {
      calls.expireNextAccountSession = false;
      return null;
    }
    return account;
  },
  async revokeAccountSession(hash) { calls.revokedSessions.push(hash); },
  async getAccountIdentities() { return [{ provider: "apple", apple_refresh_token_ciphertext: "encrypted" }]; },
  async deleteAccount(id) { calls.deletedAccounts.push(id); },
  async getCloudSaveSlots() { return calls.saveSlots; },
  async syncCloudSaveSlots(_accountId, slots) {
    calls.saveSlots = slots.map((slot, index) => ({
      slot_index: slot.slotIndex,
      save_version: slot.saveVersion,
      is_occupied: slot.isOccupied,
      payload: slot.payload,
      client_updated_at: slot.updatedAt,
      revision: index + 1,
      server_updated_at: new Date("2026-08-22T12:00:00Z")
    }));
    return calls.saveSlots;
  },
  async insertEvents(installationId, events) {
    calls.events.push({ installationId, events });
    return events.length;
  },
  async upsertCareer(installationId, career) {
    calls.careers.push({ installationId, career });
    return { accepted: true };
  },
  async recordRejectedCareer(installationId, careerId, reason, career) {
    calls.rejections.push({ installationId, careerId, reason, career });
  },
  async upsertAccountCareer(accountId, career) {
    calls.accountCareers.push({ accountId, career });
    return { accepted: true };
  },
  async recordRejectedAccountCareer(accountId, careerId, reason, career) {
    calls.accountRejections.push({ accountId, careerId, reason, career });
  },
  async deleteAccountCareer() {},
  async getAccountLeaderboard() {
    return [{
      display_name: "Account QB", position: "QB", team_id: "AUS", score: 4321,
      updated_at: new Date("2026-08-22T12:00:00Z")
    }];
  },
  async deleteInstallation() {},
  async getLeaderboard() {
    return [{
      display_name: "Liam QB",
      position: "QB",
      team_id: "AUS",
      score: 1234,
      updated_at: new Date("2026-08-21T12:00:00Z")
    }];
  },
  async getOverview() { return { installations: 1 }; },
  async getRetention() {
    return {
      d1_eligible: 1,
      d1_retained: 1,
      d7_eligible: 0,
      d7_retained: 0,
      d30_eligible: 0,
      d30_retained: 0,
      daily: []
    };
  },
  async getFunnel() { return [{ stage: 1, label: "Installed", installations: 1, conversion: 1 }]; },
  async getBalance() { return [{ position: "QB", careers: 1, win_rate: 0.5 }]; },
  async getLeaderboardHealth() { return { public_careers: 1, rejection_reasons: [] }; },
  async purgeExpiredData() { return { audits: 0, events: 0, installations: 0 }; }
};

describe("Football Era API", () => {
  let server;
  let origin;

  before(async () => {
    const providerAuth = {
      async verifyApple() {
        return { provider: "apple", subject: "apple-subject", email: "player@example.com", refreshTokenCiphertext: "encrypted" };
      },
      async verifyGoogle() {
        return { provider: "google", subject: "google-subject", email: "player@gmail.com", refreshTokenCiphertext: null };
      },
      async revokeApple(value) { assert.equal(value, "encrypted"); }
    };
    const app = createApp({ database, env: {
      ADMIN_API_KEY: "test-admin-key",
      ADMIN_DASHBOARD_USER: "developer",
      ADMIN_DASHBOARD_PASSWORD: "test-dashboard-password"
    }, providerAuth });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    origin = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("reports database health", async () => {
    const response = await fetch(`${origin}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).database, "ready");
  });

  it("registers an anonymous installation", async () => {
    const response = await fetch(`${origin}/api/v1/installations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "ios", appVersion: "1.2.0" })
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.installationId, installation.id);
    assert.ok(body.token.length >= 40);
  });

  it("creates separate Apple and Google account sessions", async () => {
    for (const provider of ["apple", "google"]) {
      const response = await fetch(`${origin}/api/v2/auth/${provider}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(provider === "apple" ? {
          identityToken: "i".repeat(120), authorizationCode: "authorization-code", nonce: "n".repeat(32)
        } : {
          idToken: "g".repeat(120), nonce: "n".repeat(32)
        })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.account.provider, provider);
      assert.ok(body.accessToken.length >= 40);
    }
    assert.notEqual(calls.accountSessions.at(-2).identity.subject, calls.accountSessions.at(-1).identity.subject);
  });

  it("requires an account for v2 leaderboards", async () => {
    const unauthorized = await fetch(`${origin}/api/v2/leaderboards`);
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(`${origin}/api/v2/leaderboards?metric=legacy_score&position=QB`, {
      headers: { authorization: `Bearer ${"s".repeat(43)}` }
    });
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).entries[0].displayName, "Account QB");
  });

  it("rejects an expired or revoked account session", async () => {
    calls.expireNextAccountSession = true;
    const response = await fetch(`${origin}/api/v2/account`, {
      headers: { authorization: `Bearer ${"s".repeat(43)}` }
    });
    assert.equal(response.status, 401);
  });

  it("syncs structurally validated cloud save slots", async () => {
    const updatedAt = new Date().toISOString();
    const response = await fetch(`${origin}/api/v2/save-slots`, {
      method: "PUT",
      headers: { authorization: `Bearer ${"s".repeat(43)}`, "content-type": "application/json" },
      body: JSON.stringify({ slots: [{
        slotIndex: 0, saveVersion: 7, isOccupied: true, updatedAt,
        payload: {
          id: "SLOT_1", slotIndex: 0, isOccupied: true,
          createdAt: updatedAt, updatedAt, player: {}, league: {}
        }
      }] })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).slots[0].revision, 1);

    const entitlementLeak = await fetch(`${origin}/api/v2/save-slots`, {
      method: "PUT",
      headers: { authorization: `Bearer ${"s".repeat(43)}`, "content-type": "application/json" },
      body: JSON.stringify({ slots: [{
        slotIndex: 0, saveVersion: 7, isOccupied: true, updatedAt,
        payload: {
          id: "SLOT_1", slotIndex: 0, isOccupied: true,
          createdAt: updatedAt, updatedAt, player: {}, league: {}, purchases: {}
        }
      }] })
    });
    assert.equal(entitlementLeak.status, 400);

    const nestedEntitlementLeak = await fetch(`${origin}/api/v2/save-slots`, {
      method: "PUT",
      headers: { authorization: `Bearer ${"s".repeat(43)}`, "content-type": "application/json" },
      body: JSON.stringify({ slots: [{
        slotIndex: 0, saveVersion: 7, isOccupied: true, updatedAt,
        payload: {
          id: "SLOT_1", slotIndex: 0, isOccupied: true,
          createdAt: updatedAt, updatedAt, player: { preferences: {} }, league: {}
        }
      }] })
    });
    assert.equal(nestedEntitlementLeak.status, 400);
  });

  it("revokes only the active opaque account session on sign-out", async () => {
    const response = await fetch(`${origin}/api/v2/auth/sign-out`, {
      method: "POST",
      headers: { authorization: `Bearer ${"s".repeat(43)}` }
    });
    assert.equal(response.status, 204);
    assert.equal(calls.revokedSessions.length, 1);
    assert.match(calls.revokedSessions[0], /^[a-f0-9]{64}$/);
  });

  it("automatically publishes authenticated careers", async () => {
    const response = await fetch(`${origin}/api/v2/careers/ACCOUNT_CAREER`, {
      method: "PUT",
      headers: { authorization: `Bearer ${"s".repeat(43)}`, "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Account Player", position: "QB", teamId: "AUS", seasonYear: 2026,
        careerYear: 1, gamesPlayed: 3, yards: 900, touchdowns: 7, championships: 0,
        overall: 74, followers: 1200, netWorth: 250000, legacyScore: 155,
        retired: false, clientUpdatedAt: new Date().toISOString()
      })
    });
    assert.equal(response.status, 204);
    assert.equal(calls.accountCareers.at(-1).career.leaderboardOptIn, true);
    assert.match(calls.accountCareers.at(-1).career.displayName, /^QB Player [A-F0-9]{6}$/);
    assert.notEqual(calls.accountCareers.at(-1).career.displayName, "Account Player");
  });

  it("deletes account-owned server data", async () => {
    const response = await fetch(`${origin}/api/v2/account`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${"s".repeat(43)}` }
    });
    assert.equal(response.status, 204);
    assert.equal(calls.deletedAccounts.at(-1), account.id);
  });

  it("accepts allowlisted retention events", async () => {
    const response = await fetch(`${origin}/api/v1/events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${"a".repeat(43)}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        events: [{
          eventId: "22222222-2222-4222-8222-222222222222",
          eventName: "session_started",
          occurredAt: new Date().toISOString(),
          properties: { ignored: "not persisted" }
        }]
      })
    });
    assert.equal(response.status, 202);
    assert.equal(calls.events.at(-1).events[0].properties.ignored, undefined);
  });

  it("rejects arbitrary analytics events", async () => {
    const response = await fetch(`${origin}/api/v1/events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${"a".repeat(43)}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        events: [{
          eventId: "22222222-2222-4222-8222-222222222222",
          eventName: "email_entered",
          occurredAt: new Date().toISOString(),
          properties: { email: "person@example.com" }
        }]
      })
    });
    assert.equal(response.status, 400);
  });

  it("accepts allowlisted gameplay aggregates and strips extra properties", async () => {
    const response = await fetch(`${origin}/api/v1/events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${"a".repeat(43)}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        events: [{
          eventId: "33333333-3333-4333-8333-333333333333",
          eventName: "week_completed",
          occurredAt: new Date().toISOString(),
          properties: {
            position: "QB", archetypeId: "qb_field_general", seasonYear: 2026,
            careerYear: 1, week: 2, won: true, yards: 310, touchdowns: 3,
            overall: 72, health: 94, momentsResolved: 4, playerName: "Must not persist"
          }
        }]
      })
    });
    assert.equal(response.status, 202);
    assert.equal(calls.events.at(-1).events[0].properties.playerName, undefined);
  });

  it("publishes only opted-in career names", async () => {
    const response = await fetch(`${origin}/api/v1/careers/CAREER_1`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${"a".repeat(43)}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        displayName: "Should Not Be Stored",
        leaderboardOptIn: false,
        position: "QB",
        teamId: "AUS",
        seasonYear: 2026,
        careerYear: 1,
        gamesPlayed: 3,
        yards: 900,
        touchdowns: 7,
        championships: 0,
        overall: 74,
        followers: 1200,
        netWorth: 250000,
        legacyScore: 155,
        retired: false,
        clientUpdatedAt: new Date().toISOString()
      })
    });
    assert.equal(response.status, 204);
    assert.equal(calls.careers.at(-1).career.displayName, null);
  });

  it("replaces opted-in legacy names with a stable public alias", async () => {
    const payload = {
      displayName: "Player Entered Name", leaderboardOptIn: true, position: "RB",
      teamId: "AUS", seasonYear: 2026, careerYear: 1, gamesPlayed: 3,
      yards: 250, touchdowns: 2, championships: 0, overall: 70,
      followers: 100, netWorth: 1000, legacyScore: 90, retired: false,
      clientUpdatedAt: new Date().toISOString()
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${origin}/api/v1/careers/CAREER_ALIAS`, {
        method: "PUT",
        headers: { authorization: `Bearer ${"a".repeat(43)}`, "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, 204);
    }
    const latest = calls.careers.at(-1).career.displayName;
    const previous = calls.careers.at(-2).career.displayName;
    assert.match(latest, /^RB Player [A-F0-9]{6}$/);
    assert.equal(latest, previous);
    assert.notEqual(latest, payload.displayName);
  });

  it("rejects implausible leaderboard totals and records the reason", async () => {
    const response = await fetch(`${origin}/api/v1/careers/CHEAT`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${"a".repeat(43)}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        displayName: "Impossible Player", leaderboardOptIn: true, position: "QB",
        teamId: "AUS", seasonYear: 2026, careerYear: 1, gamesPlayed: 1,
        yards: 999999, touchdowns: 999, championships: 1, overall: 99,
        followers: 100, netWorth: 100, legacyScore: 999999, retired: false,
        clientUpdatedAt: new Date().toISOString()
      })
    });
    assert.equal(response.status, 422);
    assert.equal(calls.rejections.at(-1).reason, "yards_exceed_game_ceiling");
  });

  it("protects private retention stats", async () => {
    const unauthorized = await fetch(`${origin}/api/v1/admin/stats/retention`);
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(`${origin}/api/v1/admin/stats/retention`, {
      headers: { authorization: "Bearer test-admin-key" }
    });
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).d1.rate, 1);
  });

  it("serves the developer dashboard only with dashboard credentials", async () => {
    const unauthorized = await fetch(`${origin}/admin`);
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(`${origin}/admin`, {
      headers: { authorization: `Basic ${Buffer.from("developer:test-dashboard-password").toString("base64")}` }
    });
    assert.equal(authorized.status, 200);
    assert.match(await authorized.text(), /Football Era telemetry/);
  });
});
