import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { createElevenwardDatabase } from "../src/elevenwardDatabase.js";
import { validateSyncRequest, sha256 } from "../src/elevenwardValidation.js";
const url = process.env.TASK_TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Use an explicit disposable local TASK_TEST_DATABASE_URL");
const executable = process.env.ELEVENWARD_REPLAY_EXECUTABLE;
if (!executable) throw new Error("Use the actual pinned compiled Dart helper");
const pool = new pg.Pool({ connectionString: url }),
  db = createElevenwardDatabase(url),
  accountId = randomUUID(),
  careerId = randomUUID();
const choice = {
  focus: "finishing",
  intensity: "balanced",
  spotlightApproach: "bold",
};
function engineSnapshot(matches) {
  const result = spawnSync(executable, [], {
    encoding: "utf8",
    maxBuffer: 10000000,
    input: JSON.stringify({
      seed: 42,
      careerId,
      enrolledAt: new Date("2026-10-01T00:00:00Z").toISOString(),
      actions: Array.from({ length: matches }, () => choice),
      allowPartial: true,
      includeSnapshot: true,
    }),
  });
  assert.equal(result.status, 0);
  return JSON.parse(result.stdout).snapshot;
}
const original = engineSnapshot(1),
  cloud = engineSnapshot(2),
  latest = engineSnapshot(3);
const metadata = (snapshot) =>
  validateSyncRequest(0, {
    baseRevision: 0,
    idempotencyKey: randomUUID(),
    snapshot,
    publishLeaderboard: true,
  });
try {
  await pool.query(
    "INSERT INTO elevenward.accounts(id,alias,leaderboard_sharing_enabled) VALUES($1,$2,true)",
    [accountId, `Conflict-${accountId}`],
  );
  const sync = (snapshot, baseRevision) =>
    db.syncCareer(
      accountId,
      validateSyncRequest(0, {
        baseRevision,
        idempotencyKey: randomUUID(),
        snapshot,
        publishLeaderboard: true,
      }),
    );
  assert.equal((await sync(original, 0)).status, 200);
  assert.equal((await sync(cloud, 1)).status, 200);
  const conflict = (await sync(original, 1)).body.conflict;
  assert.ok(conflict);
  assert.equal(conflict.remoteRevision, 2);
  assert.notEqual(
    latest.seed,
    original.seed,
    "Actual engine RNG state changes with local progression",
  );
  await assert.rejects(
    db.resolveConflict(
      accountId,
      0,
      conflict.conflictId,
      "local",
      true,
      metadata,
      { ...latest, careerId: randomUUID() },
      2,
    ),
    { code: "CONFLICT_LOCAL_MISMATCH" },
  );
  assert.equal(
    (await db.getCareerSlots(accountId))[0].snapshot.revision,
    cloud.revision,
  );
  const resolved = await db.resolveConflict(
    accountId,
    0,
    conflict.conflictId,
    "local",
    true,
    metadata,
    latest,
    2,
  );
  assert.equal(resolved.snapshot.revision, latest.revision);
  assert.equal(resolved.snapshot.seed, latest.seed);
  assert.equal(resolved.snapshot.matchJournal.length, 3);
  assert.equal(resolved.revision, 3);
  const next = (await sync(cloud, 2)).body.conflict;
  assert.ok(next);
  const blockedDelete = await db.deleteCareerSlot(accountId, 0, 0);
  assert.equal(blockedDelete.status, 409);
  assert.equal(blockedDelete.body.conflict.conflictId, next.conflictId);
  assert.equal(
    blockedDelete.body.conflict.localSnapshot.revision,
    cloud.revision,
  );
  const otherCareer = { ...latest, careerId: randomUUID() };
  const simultaneous = await Promise.all(
    Array.from({ length: 3 }, () =>
      db.syncCareer(
        accountId,
        validateSyncRequest(1, {
          baseRevision: 5,
          idempotencyKey: randomUUID(),
          snapshot: otherCareer,
        }),
      ),
    ),
  );
  assert.ok(simultaneous.every((result) => result.status === 409));
  assert.equal(
    new Set(simultaneous.map((result) => result.body.conflict.conflictId)).size,
    1,
  );
  const emptySlotConflict = simultaneous[0].body.conflict;
  const emptySlotLatest = {
    ...otherCareer,
    revision: otherCareer.revision + 1,
  };
  const emptySlotResolved = await db.resolveConflict(
    accountId,
    1,
    emptySlotConflict.conflictId,
    "local",
    true,
    metadata,
    emptySlotLatest,
    0,
  );
  assert.equal(emptySlotResolved.revision, 1);
  assert.equal(emptySlotResolved.snapshot.revision, emptySlotLatest.revision);

  await pool.query(
    "UPDATE elevenward.career_slots SET checksum=$2 WHERE account_id=$1 AND slot_index=0",
    [accountId, sha256({ ...latest, careerId: randomUUID() })],
  );
  await assert.rejects(
    db.resolveConflict(
      accountId,
      0,
      next.conflictId,
      "local",
      true,
      metadata,
      latest,
      3,
    ),
    { code: "CONFLICT_REMOTE_CHANGED" },
  );
  await pool.query(
    "UPDATE elevenward.career_slots SET checksum=$2 WHERE account_id=$1 AND slot_index=0",
    [accountId, sha256(latest)],
  );
  await pool.query(
    "UPDATE elevenward.career_slots SET revision=revision+1 WHERE account_id=$1 AND slot_index=0",
    [accountId],
  );
  await assert.rejects(
    db.resolveConflict(
      accountId,
      0,
      next.conflictId,
      "local",
      true,
      metadata,
      latest,
      3,
    ),
    { code: "CONFLICT_REMOTE_CHANGED" },
  );
  assert.equal(
    (await db.listConflicts(accountId, 0)).find(
      (row) => row.conflictId === next.conflictId,
    ).status,
    "pending",
  );
  assert.equal((await db.getCareerSlots(accountId))[0].revision, 4);
  console.log(
    "Actual engine + PostgreSQL conflict regression passed: newer local progress with evolved seed retained, wrong career refused, changed cloud CAS refused, pending deletion preserved and concurrent conflicts serialized.",
  );
} finally {
  await pool.query("DELETE FROM elevenward.accounts WHERE id=$1", [accountId]);
  await db.close();
  await pool.end();
}
