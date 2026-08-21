import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app.js";

const installation = { id: "11111111-1111-4111-8111-111111111111", platform: "ios", app_version: "1.2.0" };
const calls = { events: [], careers: [] };

const database = {
  async ping() { return true; },
  async createInstallation() {
    return { id: installation.id, created_at: new Date("2026-08-21T12:00:00Z") };
  },
  async findInstallationByTokenHash() { return installation; },
  async insertEvents(installationId, events) {
    calls.events.push({ installationId, events });
    return events.length;
  },
  async upsertCareer(installationId, career) {
    calls.careers.push({ installationId, career });
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
  }
};

describe("Football Era API", () => {
  let server;
  let origin;

  before(async () => {
    const app = createApp({ database, env: { ADMIN_API_KEY: "test-admin-key" } });
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

  it("protects private retention stats", async () => {
    const unauthorized = await fetch(`${origin}/api/v1/admin/stats/retention`);
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(`${origin}/api/v1/admin/stats/retention`, {
      headers: { authorization: "Bearer test-admin-key" }
    });
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).d1.rate, 1);
  });
});
