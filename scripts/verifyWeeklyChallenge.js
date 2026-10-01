import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import express from "express";
import { createElevenwardDatabase } from "../src/elevenwardDatabase.js";
import { createElevenwardRouter } from "../src/elevenwardRoutes.js";
import { replayWeeklyChallenge } from "../src/elevenwardChallengeReplay.js";
import { sha256 } from "../src/elevenwardValidation.js";
import { weekDefinition } from "../src/elevenwardFeaturesValidation.js";
const url = process.env.TASK_TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Use an explicit disposable local TASK_TEST_DATABASE_URL");
if (!process.env.ELEVENWARD_REPLAY_EXECUTABLE)
  throw new Error(
    "Build and configure the actual pinned Dart executable first",
  );
const pool = new pg.Pool({ connectionString: url }),
  db = createElevenwardDatabase(url),
  id = randomUUID(),
  token = randomBytes(32).toString("hex");
const app = express();
app.use(express.json());
app.use(createElevenwardRouter({ database: db, env: {}, providerAuth: {} }));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`,
  headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
const actions = Array.from({ length: 8 }, () => ({
  focus: "finishing",
  intensity: "balanced",
  spotlightApproach: "bold",
}));
try {
  await pool.query(
    "INSERT INTO elevenward.accounts(id,alias,leaderboard_sharing_enabled) VALUES($1,$2,true)",
    [id, `Replay-${id}`],
  );
  await pool.query(
    "INSERT INTO elevenward.auth_identities(account_id,provider,provider_subject) VALUES($1,'apple',$2)",
    [id, id],
  );
  await pool.query(
    "INSERT INTO elevenward.sessions(account_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [id, sha256(token)],
  );
  const current = await fetch(base + "/challenges/current", { headers });
  assert.equal(current.status, 200);
  const definition = (await current.json()).challenge;
  const enrolled = await fetch(`${base}/challenges/${definition.id}/enroll`, {
    method: "POST",
    headers,
    body: "{}",
  });
  assert.equal(enrolled.status, 201);
  const attempt = (await enrolled.json()).attempt;
  const direct = await replayWeeklyChallenge({
    seed: attempt.seed,
    careerId: attempt.careerId,
    enrolledAt: attempt.enrolledAt,
    rulesVersion: definition.rulesVersion,
    contentVersion: definition.contentVersion,
    configuration: definition.configuration,
    actions,
  });
  const submit = await fetch(`${base}/challenges/${definition.id}/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      attemptId: attempt.attemptId,
      actions,
      score: 999999,
    }),
  });
  assert.equal(submit.status, 200);
  const outcome = await submit.json();
  assert.equal(outcome.score, direct.score);
  assert.equal(outcome.accepted, true);
  const again = await fetch(`${base}/challenges/${definition.id}/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify({ attemptId: attempt.attemptId, actions }),
  });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).score, direct.score);
  const changed = actions.map((action, index) =>
    index === 0 ? { ...action, spotlightApproach: "safe" } : action,
  );
  assert.equal(
    (
      await fetch(`${base}/challenges/${definition.id}/submit`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          attemptId: attempt.attemptId,
          actions: changed,
        }),
      })
    ).status,
    409,
  );
  await assert.rejects(
    replayWeeklyChallenge({
      seed: attempt.seed,
      careerId: attempt.careerId,
      enrolledAt: attempt.enrolledAt,
      rulesVersion: "forged",
      contentVersion: definition.contentVersion,
      configuration: definition.configuration,
      actions,
    }),
    { code: "REPLAY_INVALID" },
  );
  const board = await fetch(base + "/challenges/current", { headers });
  assert.equal(
    (await board.json()).entries.some(
      (entry) => entry.isCurrentUser && entry.score === direct.score,
    ),
    true,
  );
  console.log(
    `Real Dart+HTTP+PostgreSQL challenge passed: server-derived score ${direct.score}; forged score ignored, altered replay rejected, version pins enforced and identical retries retained.`,
  );
} finally {
  await pool.query("DELETE FROM elevenward.accounts WHERE id=$1", [id]);
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  await pool.end();
}
