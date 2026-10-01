import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createHash } from "node:crypto";
import { createElevenwardRouter } from "../src/elevenwardRoutes.js";
import {
  validateFeedback,
  validateArchive,
  validateChallengeSubmission,
  weekDefinition,
} from "../src/elevenwardFeaturesValidation.js";
import { replayWeeklyChallenge } from "../src/elevenwardChallengeReplay.js";

const id = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(43);
const feedback = {
  submissionId: id,
  category: "bug",
  message: "A match recap had an incorrect score.",
  platform: "ios",
  appVersion: "1.2.0",
};

test("feedback allows reviewed diagnostics and rejects raw saves or tokens", () => {
  assert.ok(
    validateFeedback({
      ...feedback,
      diagnostics: {
        schemaVersion: 14,
        rulesVersion: "2026.5",
        syncState: "pending",
      },
    }),
  );
  assert.equal(
    validateFeedback({ ...feedback, diagnostics: { sessionToken: "secret" } }),
    null,
  );
  assert.equal(
    validateFeedback({ ...feedback, diagnostics: { snapshot: {} } }),
    null,
  );
  assert.equal(
    validateFeedback({ ...feedback, diagnostics: { schemaVersion: -1 } }),
    null,
  );
  assert.equal(validateFeedback({ ...feedback, contactEmail: "bad" }), null);
  assert.equal(
    validateFeedback({ ...feedback, supportCode: "../../file" }),
    null,
  );
});
test("feedback prose preserves paragraphs and tabs without relaxing metadata controls", () => {
  const message = "First line\n\nSecond paragraph\r\n\tObserved a wrong score.";
  assert.equal(validateFeedback({ ...feedback, message }).message, message);
  for (const control of ["\u0000", "\u0007", "\u000b", "\u000c", "\u001b", "\u007f"]) {
    assert.equal(validateFeedback({ ...feedback, message: `${message}${control}` }), null);
  }
  assert.equal(validateFeedback({ ...feedback, appVersion: "1.2\n0" }), null);
  assert.equal(validateFeedback({ ...feedback, diagnostics: { area: "recap\nscore" } }), null);
});
test("weekly definition uses Monday UTC boundaries even across year rollover", () => {
  const week = weekDefinition(new Date("2027-01-01T23:59:59Z"));
  assert.equal(week.id, "2026-12-28");
  assert.equal(week.endsAt, "2027-01-04T00:00:00.000Z");
  assert.deepEqual(week, weekDefinition(new Date("2026-12-29T01:00:00Z")));
  assert.notEqual(
    week.seed,
    weekDefinition(new Date("2027-01-04T00:00:00Z")).seed,
  );
});
test("weekly submissions require one bounded eight-action replay and UUID", () => {
  assert.ok(
    validateChallengeSubmission({
      attemptId: id,
      actions: Array.from({ length: 8 }, () => ({
        focus: "finishing",
        intensity: "balanced",
        spotlightApproach: "balanced",
      })),
    }),
  );
  assert.equal(
    validateChallengeSubmission({ attemptId: id, actions: [] }),
    null,
  );
  assert.equal(
    validateChallengeSubmission({
      attemptId: "bad",
      actions: Array.from({ length: 8 }, () => ({
        focus: "finishing",
        intensity: "balanced",
        spotlightApproach: "balanced",
      })),
    }),
    null,
  );
  assert.equal(
    validateChallengeSubmission({
      attemptId: id,
      actions: Array.from({ length: 8 }, () => ({ text: "x".repeat(40000) })),
    }),
    null,
  );
});
test("unconfigured verifier rejects rather than accepting a score", async () => {
  await assert.rejects(replayWeeklyChallenge({}, { executable: null }), {
    code: "REPLAY_UNAVAILABLE",
  });
});
test("archives only accept retired bounded snapshots with server-calculable metrics", () => {
  assert.equal(validateArchive({ snapshot: { retired: false } }), null);
  assert.equal(validateArchive({ snapshot: { retired: true } }), null);
});

test("feature routes are authenticated, guest feedback is scoped, replay failure remains failure", async () => {
  const calls = [];
  const db = {
    findAccountBySessionTokenHash: async () => ({
      id,
      alias: "Generated Alias",
    }),
    createElevenwardFeedback: async (value) => {
      calls.push(value);
      return { created: true, supportCode: value.supportCode };
    },
    getFriends: async () => ({
      comparisonSharingEnabled: false,
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      blocked: [],
    }),
    setFriendComparisonSharing: async () => {},
    getChallengeReplayInput: async () => ({
      seed: 42,
      career_id: id,
      rules_version: "2026.5",
      content_version: "2026.4.0",
      configuration: {},
      enrolled_at: new Date(),
      status: "enrolled",
      ends_at: new Date(Date.now() + 3600000),
    }),
    submitChallenge: async () => {
      throw new Error("Must never store an unavailable replay");
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    createElevenwardRouter({
      database: db,
      env: {},
      providerAuth: {},
      replayChallenge: async () => {
        const error = new Error("unavailable");
        error.code = "REPLAY_UNAVAILABLE";
        throw error;
      },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/friends")).status, 401);
    const sent = await fetch(base + "/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(feedback),
    });
    assert.equal(sent.status, 201);
    assert.equal((await sent.json()).received, true);
    assert.equal(calls.length, 1);
    const activeCareerReport = {
      ...feedback,
      submissionId: "22222222-2222-4222-8222-222222222222",
      message: "The recap shows the wrong score.\n\nSteps:\r\n\tAdvance one match.",
      supportCode: createHash("sha256").update(id).digest("hex").substring(0, 8).toUpperCase(),
      diagnostics: { schemaVersion: 14, rulesVersion: "2026.5", contentVersion: "2026.4.0" },
    };
    const activeReportResponse = await fetch(base + "/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(activeCareerReport),
    });
    assert.equal(activeReportResponse.status, 201);
    assert.equal((await activeReportResponse.json()).supportCode, activeCareerReport.supportCode);
    assert.equal(calls[1].message, activeCareerReport.message);
    assert.deepEqual(calls[1].diagnostics, activeCareerReport.diagnostics);
    const authenticated = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    assert.equal(
      (
        await fetch(base + "/account/friend-comparison-sharing", {
          method: "PUT",
          headers: authenticated,
          body: JSON.stringify({ enabled: "yes" }),
        })
      ).status,
      400,
    );
    const replay = await fetch(base + "/challenges/2026-09-28/submit", {
      method: "POST",
      headers: authenticated,
      body: JSON.stringify({
        attemptId: id,
        actions: Array.from({ length: 8 }, () => ({
          focus: "finishing",
          intensity: "balanced",
          spotlightApproach: "balanced",
        })),
      }),
    });
    assert.equal(replay.status, 503);
    assert.equal((await replay.json()).error, "challenge_verifier_unavailable");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("modern role-specific legacy score parity preserves prior rules scoring", async () => {
  const { validateSyncRequest, leaderboardSubmissionFromSync } =
    await import("../src/elevenwardValidation.js");
  const expected = {
    striker: 814,
    winger: 816,
    midfielder: 806,
    defender: 806,
  };
  for (const position of Object.keys(expected)) {
    const snapshot = {
      id,
      schemaVersion: 14,
      rulesVersion: "2026.5",
      contentVersion: "2026.4.0",
      difficulty: "professional",
      seed: 42,
      revision: 10,
      updatedAt: new Date().toISOString(),
      season: 1,
      retired: true,
      player: {
        position,
        appearances: 10,
        goals: 5,
        assists: 3,
        reputation: 40,
        attributes: Object.fromEntries(
          [
            "pace",
            "technique",
            "passing",
            "finishing",
            "defending",
            "strength",
            "stamina",
            "composure",
          ].map((key) => [key, 60]),
        ),
      },
      seasonHistory: [],
      roleStats: {
        keyPasses: 15,
        chancesCreated: 10,
        successfulDribbles: 12,
        tackles: 20,
        interceptions: 15,
        cleanSheets: 5,
        playerOfMatchAwards: 2,
      },
      matchJournal: [],
      decisionJournal: [],
      storyFlags: {},
    };
    const sync = validateSyncRequest(0, {
      snapshot,
      baseRevision: 0,
      idempotencyKey: id,
    });
    assert.ok(sync);
    assert.equal(
      leaderboardSubmissionFromSync(sync).legacyScore,
      expected[position],
    );
    const prior = validateSyncRequest(0, {
      snapshot: { ...snapshot, rulesVersion: "2026.4" },
      baseRevision: 0,
      idempotencyKey: id,
    });
    assert.equal(leaderboardSubmissionFromSync(prior).legacyScore, 784);
    assert.equal(
      validateSyncRequest(0, {
        snapshot: { ...snapshot, roleStats: { tackles: 61 } },
        baseRevision: 0,
        idempotencyKey: id,
      }),
      null,
    );
    assert.equal(
      validateSyncRequest(0, {
        snapshot: {
          ...snapshot,
          storyFlags: { "private.token": { raw: "x" } },
        },
        baseRevision: 0,
        idempotencyKey: id,
      }),
      null,
    );
    assert.equal(
      validateSyncRequest(0, {
        snapshot: {
          ...snapshot,
          matchJournal: Array.from({ length: 41 }, () => ({})),
        },
        baseRevision: 0,
        idempotencyKey: id,
      }),
      null,
    );
  }
});

test("conflict latest snapshot requires explicit cloud CAS and forwards the validated override", async () => {
  const { validateConflictResolution } =
    await import("../src/elevenwardValidation.js");
  const localSnapshot = {
    careerId: id,
    schemaVersion: 2,
    rulesVersion: "2026.3",
    contentVersion: "2026.2.0",
    difficulty: "professional",
    seed: 42,
    revision: 3,
    updatedAt: new Date().toISOString(),
    player: { position: "striker" },
  };
  assert.equal(
    validateConflictResolution({ choice: "local", localSnapshot }),
    null,
  );
  assert.equal(
    validateConflictResolution({
      choice: "remote",
      localSnapshot,
      expectedRemoteRevision: 2,
    }),
    null,
  );
  assert.equal(
    validateConflictResolution({
      choice: "local",
      localSnapshot,
      expectedRemoteRevision: -1,
    }),
    null,
  );
  let forwarded;
  const database = {
    findAccountBySessionTokenHash: async () => ({
      id,
      alias: "Generated Alias",
    }),
    resolveConflict: async (...args) => {
      forwarded = args;
      return { slotIndex: 0, revision: 3, snapshot: localSnapshot };
    },
  };
  const app = express();
  app.use(express.json());
  app.use(createElevenwardRouter({ database, env: {}, providerAuth: {} }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/career-slots/0/conflicts/${id}/resolve`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          choice: "local",
          localSnapshot,
          expectedRemoteRevision: 2,
          publishLeaderboard: true,
        }),
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(forwarded[6], localSnapshot);
    assert.equal(forwarded[7], 2);
    assert.equal(forwarded[5](localSnapshot).careerId, id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
