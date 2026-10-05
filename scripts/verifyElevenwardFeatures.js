import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import { createElevenwardDatabase } from "../src/elevenwardDatabase.js";
import { createElevenwardRouter } from "../src/elevenwardRoutes.js";
import { sha256, validateSyncRequest } from "../src/elevenwardValidation.js";
import {
  validateArchive,
  weekDefinition,
} from "../src/elevenwardFeaturesValidation.js";
const url = process.env.TASK_TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Use an explicit disposable local TASK_TEST_DATABASE_URL");
const pool = new pg.Pool({ connectionString: url });
const db = createElevenwardDatabase(url);
const ids = [randomUUID(), randomUUID(), randomUUID()];
const careers = ids.map(() => randomUUID());
const feedbackId = randomUUID();
function snapshot(index) {
  return {
    id: careers[index],
    schemaVersion: 13,
    rulesVersion: "2026.4",
    contentVersion: "2026.3.0",
    difficulty: "professional",
    seed: 42,
    revision: 10,
    updatedAt: new Date().toISOString(),
    season: 1,
    retired: true,
    player: {
      position: "striker",
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
  };
}
try {
  for (let i = 0; i < ids.length; i++) {
    await pool.query(
      "INSERT INTO elevenward.accounts(id,alias,leaderboard_sharing_enabled) VALUES($1,$2,true)",
      [ids[i], `Integration-${ids[i]}`],
    );
    const sync = validateSyncRequest(0, {
      baseRevision: 0,
      idempotencyKey: randomUUID(),
      snapshot: snapshot(i),
      publishLeaderboard: true,
    });
    assert.ok(sync);
    assert.equal((await db.syncCareer(ids[i], sync)).status, 200);
  }
  await pool.query(
    "UPDATE elevenward.leaderboard_submissions SET updated_at='2026-01-01T00:00:00Z' WHERE account_id=ANY($1::uuid[])",
    [ids],
  );
  const partition = {
    position: "striker",
    difficulty: "balanced",
    rulesVersion: "2026.4",
    limit: 1,
  };
  for (let i = 0; i < ids.length; i++) {
    const context = await db.getLeaderboardContext(
      ids[i],
      partition,
      careers[i],
    );
    assert.equal(context.totalEntries, 3);
    assert.equal(context.entries.length, 1);
    assert.ok(context.myEntry.rank >= 1);
    assert.equal(context.nearbyEntries.length, 3);
  }
  await db.setLeaderboardSharing(ids[2], false);
  assert.equal(
    (await db.getLeaderboardContext(ids[2], partition)).myEntry,
    null,
  );
  assert.equal(
    (await db.getLeaderboardContext(ids[0], partition)).totalEntries,
    2,
  );
  const retired = snapshot(0);
  const archived = await db.archiveCareer(
    ids[0],
    validateArchive({ snapshot: retired }),
  );
  assert.equal(archived.status, 201);
  assert.equal(
    (await db.archiveCareer(ids[0], validateArchive({ snapshot: retired })))
      .status,
    200,
  );
  assert.equal(
    (
      await db.archiveCareer(
        ids[0],
        validateArchive({
          snapshot: { ...retired, revision: retired.revision + 1 },
        }),
      )
    ).status,
    409,
    "changed snapshot must reject mutation of permanent archive",
  );
  assert.equal((await db.getCareerArchives(ids[1])).length, 0);
  await db.deleteCareerSlot(ids[0], 0, 1);
  assert.equal(
    (await db.getCareerArchives(ids[0])).length,
    1,
    "archive survives free slot",
  );
  const invite = "ABCDEF12";
  await db.issueFriendInvite(
    ids[1],
    sha256(invite),
    new Date(Date.now() + 86400000),
  );
  const request = await db.requestFriend(ids[0], sha256(invite));
  assert.equal(request.status, 201);
  assert.equal(
    await db.respondFriend(ids[0], request.requestId, true),
    null,
    "requester cannot accept own request",
  );
  assert.equal(
    (await db.respondFriend(ids[1], request.requestId, true)).status,
    "accepted",
  );
  let friends = await db.getFriends(ids[0]);
  assert.equal(friends.friends.length, 1);
  assert.equal(friends.friends[0].comparisonAvailable, false);
  assert.equal(friends.friends[0].careers.length, 0);
  await db.setFriendComparisonSharing(ids[0], true);
  await db.setFriendComparisonSharing(ids[1], true);
  friends = await db.getFriends(ids[0]);
  assert.equal(friends.friends[0].careers.length, 1);
  assert.equal("snapshot" in friends.friends[0].careers[0], false);
  await db.setLeaderboardSharing(ids[1], false);
  assert.equal(
    (await db.getFriends(ids[0])).friends[0].careers.length,
    1,
    "private consent is independent of public publishing",
  );
  await db.setFriendComparisonSharing(ids[1], false);
  assert.equal((await db.getFriends(ids[0])).friends[0].careers.length, 0);
  const profile = (
    await pool.query(
      "SELECT public_profile_id FROM elevenward.accounts WHERE id=$1",
      [ids[1]],
    )
  ).rows[0].public_profile_id;
  await db.changeFriend(ids[0], profile, { block: true });
  assert.equal((await db.getFriends(ids[0])).friends.length, 0);
  assert.equal((await db.requestFriend(ids[0], sha256(invite))).status, 404);
  await db.changeFriend(ids[0], profile, { unblock: true });
  assert.equal((await db.requestFriend(ids[0], sha256(invite))).status, 201);
  const definition = weekDefinition();
  await db.ensureWeeklyChallenge(definition);
  const enrolled = await db.enrollChallenge(ids[0], definition.id);
  assert.equal(enrolled.created, true);
  const retry = await db.enrollChallenge(ids[0], definition.id);
  assert.equal(retry.created, false);
  assert.equal(retry.attempt.attemptId, enrolled.attempt.attemptId);
  assert.equal(
    (await db.enrollChallenge(ids[1], definition.id)).attempt.seed,
    enrolled.attempt.seed,
  );
  const stored = await db.submitChallenge(
    ids[0],
    definition.id,
    enrolled.attempt.attemptId,
    sha256("actions"),
    500,
  );
  assert.equal(stored.score, 500);
  assert.equal(
    (
      await db.submitChallenge(
        ids[0],
        definition.id,
        enrolled.attempt.attemptId,
        sha256("different"),
        999,
      )
    ).status,
    409,
  );
  const feedback = {
    submissionId: feedbackId,
    category: "feature",
    message: "The match recap shows the wrong score.\n\nSteps:\r\n\tAdvance one match.",
    contactEmail: null,
    platform: "macos",
    appVersion: "1.2.0",
    supportCode: createHash("sha256").update(careers[0]).digest("hex").substring(0, 8).toUpperCase(),
    diagnostics: { schemaVersion: 14, rulesVersion: "2026.5", contentVersion: "2026.4.0", syncState: "pending" },
  };
  const app = express();
  app.use(express.json());
  app.use(createElevenwardRouter({ database: db, env: {}, providerAuth: {} }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const send = () => fetch(`${base}/feedback`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(feedback),
    });
    const response = await send();
    assert.equal(response.status, 201, "active career multiline feedback must pass the actual HTTP contract");
    assert.equal((await response.json()).supportCode, feedback.supportCode);
    assert.equal((await send()).status, 200, "retry must remain idempotent");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  const storedFeedback = (await pool.query(
    "SELECT product,message,support_code,diagnostics FROM feedback_submissions WHERE id=$1", [feedbackId],
  )).rows[0];
  assert.equal(storedFeedback.product, "elevenward");
  assert.equal(storedFeedback.message, feedback.message);
  assert.equal(storedFeedback.support_code, feedback.supportCode);
  assert.deepEqual(storedFeedback.diagnostics, feedback.diagnostics);
  await db.deleteAccount(ids[0], sha256(ids[0]));
  for (const table of [
    "career_archives",
    "friend_invites",
    "challenge_attempts",
  ])
    assert.equal(
      (
        await pool.query(
          `SELECT count(*)::int n FROM elevenward.${table} WHERE account_id=$1`,
          [ids[0]],
        )
      ).rows[0].n,
      0,
    );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM elevenward.friendships WHERE requester_id=$1 OR recipient_id=$1",
        [ids[0]],
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "PostgreSQL integration passed: rank ordering/privacy, archive isolation/free slots, bilateral comparison consent, invitations/blocking, weekly attempt idempotency, multiline active-career feedback HTTP contract and account deletion cascades.",
  );
} finally {
  await pool.query("DELETE FROM elevenward.accounts WHERE id=ANY($1::uuid[])", [
    ids,
  ]);
  await pool.query("DELETE FROM feedback_submissions WHERE id=$1", [
    feedbackId,
  ]);
  await db.close();
  await pool.end();
}
