import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createDatabase } from "../src/database.js";

const connectionString = process.env.FOOTBALL_COMPAT_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^\/football_compat_test_[a-z0-9_]+$/.test(url.pathname)) {
    throw new Error("Compatibility SQL tests require an explicitly named disposable localhost database");
  }
}

describe("Football compatibility on actual isolated PostgreSQL", { skip: !connectionString }, () => {
  let pool;
  let database;
  const slot = (slotIndex, saveVersion, offset = 0) => ({ slotIndex, saveVersion, isOccupied: true,
    updatedAt: new Date(Date.now() + offset).toISOString(), payload: { synthetic: true, format: saveVersion } });
  const account = async () => {
    const id = randomUUID();
    await pool.query("INSERT INTO accounts(id) VALUES ($1)", [id]);
    return id;
  };
  before(async () => {
    pool = new pg.Pool({ connectionString });
    database = createDatabase(connectionString);
    // This database is created solely for this test. Refuse existing tables rather
    // than resetting or modifying an unknown/shared database.
    await pool.query("CREATE TABLE accounts (id uuid PRIMARY KEY)");
    await pool.query(`CREATE TABLE cloud_save_slots (
      account_id uuid REFERENCES accounts(id), slot_index smallint, save_version integer,
      is_occupied boolean, payload jsonb, client_updated_at timestamptz,
      revision bigint NOT NULL DEFAULT 1, server_updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(account_id,slot_index))`);
  });
  after(async () => { await database?.close(); await pool?.end(); });

  it("rolls back a whole mixed-format batch and protects empty/all-slot responses", async () => {
    const id = await account();
    await database.syncCloudSaveSlots(id, [slot(0, 9), slot(1, 8)], 9);
    const before = await database.getCloudSaveSlots(id);
    await assert.rejects(database.syncCloudSaveSlots(id, [slot(1, 9, 1000), slot(0, 8, 2000)], 9), { code: "CLOUD_SAVE_DOWNGRADE" });
    assert.deepEqual(await database.getCloudSaveSlots(id), before);
    await assert.rejects(database.syncCloudSaveSlots(id, [], 8), { code: "CLOUD_SAVE_UPGRADE_REQUIRED" });
    await assert.rejects(database.syncCloudSaveSlots(id, [slot(2, 8, 3000)], 8), { code: "CLOUD_SAVE_UPGRADE_REQUIRED" });
    await assert.rejects(database.syncCloudSaveSlots(id, [slot(2, 10)], 9), { code: "CLOUD_SAVE_UPGRADE_REQUIRED" });
    assert.deepEqual(await database.getCloudSaveSlots(id), before);
  });

  it("keeps cloud timestamp ties and rejects a newer-timestamp format downgrade", async () => {
    const id = await account();
    const initial = slot(0, 8);
    await database.syncCloudSaveSlots(id, [initial], 8);
    const first = await database.getCloudSaveSlots(id);
    await database.syncCloudSaveSlots(id, [{ ...initial, payload: { changed: true } }], 8);
    assert.deepEqual(await database.getCloudSaveSlots(id), first);
    await database.syncCloudSaveSlots(id, [slot(0, 9, 1000)], 9);
    await assert.rejects(database.syncCloudSaveSlots(id, [slot(0, 8, 2000)], 9), { code: "CLOUD_SAVE_DOWNGRADE" });
    assert.equal((await database.getCloudSaveSlots(id))[0].save_version, 9);
  });

  it("serializes the absent-slot first-insert race before deciding compatibility", async () => {
    let protectedRaces = 0;
    for (let iteration = 0; iteration < 10; iteration++) {
      const id = await account();
      const blocker = await pool.connect();
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [id]);
      const modern = database.syncCloudSaveSlots(id, [slot(0, 9)], 9);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const legacy = database.syncCloudSaveSlots(id, [slot(0, 8, 2000)], 8);
      const results = Promise.allSettled([modern, legacy]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await blocker.query("COMMIT");
      blocker.release();
      const [modernResult, legacyResult] = await results;
      assert.equal(modernResult.status, "fulfilled");
      assert.equal(legacyResult.status, "rejected");
      assert.equal(legacyResult.reason.code, "CLOUD_SAVE_DOWNGRADE");
      assert.equal((await database.getCloudSaveSlots(id))[0].save_version, 9);
      protectedRaces++;
    }
    console.log(JSON.stringify({ isolatedPostgres: true, protectedFirstInsertRaces: protectedRaces, realAccounts: 0, deployment: false }));
  });

  it("returns only the captured compatible response when a future writer runs immediately afterward", async () => {
    const id = await account();
    const blocker = await pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [id]);
    const current = database.syncCloudSaveSlots(id, [slot(0, 9)], 9);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const future = database.syncCloudSaveSlots(id, [slot(0, 10, 1000)], 10);
    const results = Promise.all([current, future]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await blocker.query("COMMIT");
    blocker.release();
    const [currentCapture, futureCapture] = await results;
    assert.equal(currentCapture[0].save_version, 9);
    assert.equal(futureCapture[0].save_version, 10);
    assert.equal((await database.getCloudSaveSlots(id))[0].save_version, 10);
    assert.equal(currentCapture[0].save_version, 9);
  });
});
