import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createDatabase } from "../src/database.js";

function executable(name) {
  for (const directory of (process.env.PATH || "").split(":")) {
    const path = join(directory, name);
    try { accessSync(path, constants.X_OK); return path; } catch { /* Next PATH entry. */ }
  }
  return null;
}
const initdb = executable("initdb");
const postgres = executable("postgres");
const occurrence = {
  schemaVersion: 2, appVersion: "1.5.0", appBuild: "10", platform: "ios",
  analyticsEnvironment: "production", distributionChannel: "app_store", sessionId: randomUUID()
};
const day = 86_400_000;

// An isolated, task-created PostgreSQL cluster. It listens only on its own Unix
// socket; it never reads DATABASE_URL or connects to an existing service.
describe("synthetic PostgreSQL telemetry cohorts", { skip: !initdb || !postgres ? "Local PostgreSQL binaries unavailable" : false }, () => {
  let directory;
  let server;
  let pool;
  let database;
  let serverOutput = "";
  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "fe-pg-"));
    const data = join(directory, "data");
    const socket = join(directory, "socket");
    await mkdir(socket);
    const username = userInfo().username;
    execFileSync(initdb, ["-D", data, "-A", "trust", "-U", username, "--no-instructions"], { stdio: "pipe" });
    server = spawn(postgres, ["-D", data, "-F", "-k", socket, "-h", "", "-p", "5432"], { stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (chunk) => { serverOutput = (serverOutput + chunk).slice(-10_000); });
    server.stderr.on("data", (chunk) => { serverOutput = (serverOutput + chunk).slice(-10_000); });
    const connection = `postgresql://${encodeURIComponent(username)}@localhost/postgres?host=${encodeURIComponent(socket)}&port=5432`;
    pool = new pg.Pool({ connectionString: connection });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try { await pool.query("SELECT 1"); ready = true; break; } catch {
        if (server.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.equal(ready, true, serverOutput);
    await pool.query(await readFile(new URL("../migrations/001_football_era.sql", import.meta.url), "utf8"));
    database = createDatabase(connection);
  });
  after(async () => {
    await database?.close();
    await pool?.end();
    if (server && server.exitCode === null) {
      const stopped = new Promise((resolve) => server.once("exit", resolve));
      server.kill("SIGTERM");
      await stopped;
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  beforeEach(async () => { await pool.query("TRUNCATE installations CASCADE"); });

  async function installation(ageDays = 3) {
    const result = await pool.query(`INSERT INTO installations (token_hash, platform, app_version, created_at)
      VALUES ($1, 'ios', '9.9.9', date_trunc('milliseconds', now()) - $2::double precision * interval '1 day') RETURNING id, created_at`, [randomUUID(), ageDays]);
    return result.rows[0];
  }
  function row(name, properties, occurredAt, receivedAt = null) {
    return { eventId: randomUUID(), eventName: name, properties: { ...occurrence, ...properties }, occurredAt: new Date(occurredAt).toISOString(), receivedAt };
  }
  async function put(owner, rows) {
    for (const event of rows) {
      await pool.query(`INSERT INTO analytics_events (installation_id, event_id, event_name, properties, occurred_at, received_at)
        VALUES ($1,$2,$3,$4::jsonb,$5,COALESCE($6::timestamptz,now()))`,
      [owner.id, event.eventId, event.eventName, JSON.stringify(event.properties), event.occurredAt, event.receivedAt]);
    }
  }
  function flow({ at = Date.now() - day, itemId = "DOUBLE_XP", analyticsEnvironment = "production", storeEnvironment = "production", source = "purchase", variant = "none", experimentId = "none", opportunityId = randomUUID(), surface = "shop", offerId = "permanent_v1" } = {}) {
    const context = { opportunityId, presentationId: randomUUID(), itemId, surface, offerId,
      experimentId, experimentVersion: experimentId === "none" ? 0 : 1, variant, analyticsEnvironment };
    const attemptId = randomUUID();
    const saleReference = randomUUID();
    return [
      row("offer_eligible", { ...context, availability: "loaded" }, at),
      row("offer_visible", context, at + 1000),
      row("product_selected", { ...context, attemptId }, at + 2000),
      row("purchase_requested", { itemId, attemptId, analyticsEnvironment }, at + 3000),
      row("purchase_verified", { itemId, attemptId, saleReference, source, storeEnvironment, analyticsEnvironment }, at + 4000),
      row("benefit_delivered", { itemId, saleReference, source, analyticsEnvironment, deliveryDelayBucket: "under_1s" }, at + 5000)
    ];
  }
  function paidCounts(rows, group = "paid_opportunity") {
    return [1,2,3,4,5].map((stage) => rows.filter((row) => row.group === group && row.stage === stage)
      .reduce((sum, row) => sum + row.opportunities, 0));
  }

  it("uses complete observation windows at ages 1.5/2, 7.5/8, and 30.5/31 days", async () => {
    for (const age of [1.5, 2, 7.5, 8, 30.5, 31]) {
      const owner = await installation(age);
      const start = new Date(owner.created_at).getTime();
      const events = [row("session_started", {}, start + 1.25 * day)];
      if (age >= 7.5) events.push(row("session_started", {}, start + 7.25 * day));
      if (age >= 30.5) events.push(row("session_started", {}, start + 30.25 * day));
      await put(owner, events);
    }
    const result = await database.getRetention();
    assert.equal(result.d1_eligible, 5); assert.equal(result.d1_retained, 5);
    assert.equal(result.d7_eligible, 3); assert.equal(result.d7_retained, 3);
    assert.equal(result.d30_eligible, 1); assert.equal(result.d30_retained, 1);
  });

  it("uses half-open windows from registration, includes late valid events, and cascades deletion", async () => {
    const included = await installation(40);
    const excluded = await installation(40);
    const beforeRegistration = await installation(40);
    const start = new Date(included.created_at).getTime();
    await put(included, [1,7,30].map((offset) => row("session_started", {}, start + offset * day)));
    await put(excluded, [2,8,31].map((offset) => row("session_started", {}, new Date(excluded.created_at).getTime() + offset * day)));
    await put(beforeRegistration, [row("session_started", {}, new Date(beforeRegistration.created_at).getTime() - day)]);
    const result = await database.getRetention();
    assert.equal(result.d1_eligible, 3); assert.equal(result.d1_retained, 1);
    assert.equal(result.d7_retained, 1); assert.equal(result.d30_retained, 1);
    await database.deleteInstallation(included.id);
    const deleted = await pool.query("SELECT count(*)::int AS count FROM analytics_events WHERE installation_id=$1", [included.id]);
    assert.equal(deleted.rows[0].count, 0);
    assert.equal((await database.getRetention()).d1_retained, 0);
  });

  it("counts ordered visible/request/verified/delivered opportunities and keeps occurrence versions", async () => {
    const owner = await installation();
    const events = flow();
    assert.equal(await database.insertEvents(owner.id, events), 6);
    assert.equal(await database.insertEvents(owner.id, events), 0);
    await put(owner, events.map((event) => ({ ...event, eventId: randomUUID() })));
    const result = await database.getFunnel();
    assert.deepEqual(paidCounts(result), [1,1,1,1,1]);
    assert.equal(result.find((row) => row.group === "paid_opportunity").appVersion, "1.5.0");
    assert.equal(result.find((row) => row.group === "paid_opportunity").appBuild, "10");
    assert.equal(result.find((row) => row.group === "career_activity").label, "Consented registered installations");
  });

  it("requires predecessors, chronological order, matching attempts, products, and sale references", async () => {
    const owner = await installation();
    const missing = flow(); await put(owner, missing.filter((row) => row.eventName !== "offer_visible"));
    const reversed = flow(); reversed[1].occurredAt = new Date(new Date(reversed[0].occurredAt).getTime() - 1000).toISOString(); await put(owner, reversed);
    const wrongAttempt = flow(); wrongAttempt[4].properties.attemptId = randomUUID(); await put(owner, wrongAttempt);
    const wrongProduct = flow(); wrongProduct[4].properties.itemId = "DOUBLE_MONEY"; await put(owner, wrongProduct);
    const wrongSale = flow(); wrongSale[5].properties.saleReference = randomUUID(); await put(owner, wrongSale);
    assert.deepEqual(paidCounts(await database.getFunnel()), [5,3,3,1,0]);
  });

  it("keeps non-buyers eligible while quarantining unknown/test verification and excluding restores", async () => {
    const owner = await installation();
    const nonBuyer = flow(); await put(owner, nonBuyer.slice(0,1));
    for (const storeEnvironment of ["unknown", "sandbox", "local_test"]) await put(owner, flow({ storeEnvironment }));
    await put(owner, flow({ source: "restore" }));
    await put(owner, flow({ analyticsEnvironment: "test" }));
    const result = await database.getFunnel();
    assert.deepEqual(paidCounts(result), [5,4,4,0,0]);
    assert.deepEqual(paidCounts(result, "quarantined_opportunity"), [1,1,1,0,0]);
    assert.equal(result.filter((row) => row.group === "measurement_diagnostic" && row.label === "verification_context")
      .reduce((sum,row) => sum + row.count, 0), 5);
  });

  async function enroll(owner, { age = 50, variant = "control", experimentId = "career_capacity" } = {}) {
    const at = Date.now() - age * day;
    const context = { opportunityId: randomUUID(), presentationId: randomUUID(), itemId: "EXTRA_CAREER_SLOTS",
      offerId: "capacity_v1", surface: "career_capacity", experimentId, experimentVersion: 1, variant };
    await put(owner, [row("experiment_assigned", context, at, new Date(at + day).toISOString()),
      row("offer_eligible", { ...context, availability: "loading" }, at + 1000, new Date(at + day).toISOString())]);
    return { at: at + 1000, context };
  }

  it("counts natural control purchases and treatment route purchases in assigned all-SKU cohorts", async () => {
    const control = await installation(60);
    const treatment = await installation(60);
    const nonBuyer = await installation(60);
    const c = await enroll(control); const t = await enroll(treatment, { variant: "treatment" }); await enroll(nonBuyer);
    // Control goes through the ordinary Shop with a new unassigned opportunity.
    const natural = flow({ at: c.at + 10 * day, itemId: "ALL_ACCESS" });
    const directed = flow({ at: t.at + 10 * day, itemId: "EXTRA_CAREER_SLOTS", opportunityId: t.context.opportunityId,
      experimentId: "career_capacity", variant: "treatment" });
    for (const event of [...natural, ...directed]) event.receivedAt = new Date(c.at + 20 * day).toISOString();
    await put(control, natural); await put(treatment, directed);
    const result = await database.getFunnel();
    const rows = result.filter((row) => row.group === "assigned_35_day_cohort");
    const a = rows.find((row) => row.variant === "control"); const b = rows.find((row) => row.variant === "treatment");
    assert.equal(a.enrolled, 2); assert.equal(a.final49, 2); assert.equal(a.deliveredBuyers35, 1); assert.equal(a.conversionFinal, 0.5);
    assert.equal(a.deliveredSkuBuyers35.ALL_ACCESS, 1);
    assert.equal(b.enrolled, 1); assert.equal(b.deliveredBuyers35, 1); assert.equal(b.conversionFinal, 1);
    assert.equal(b.deliveredSkuBuyers35.EXTRA_CAREER_SLOTS, 1);
    assert.deepEqual(paidCounts(result.filter((row) => row.experimentId === "career_capacity" && row.variant === "treatment")), [1,1,1,1,1]);
  });

  it("matures at 35 days, finalizes at 49, and excludes outside-window and late-cutoff delivery", async () => {
    for (const age of [34.5, 35.5, 48.5, 49.5, 60]) {
      const owner = await installation(70);
      const cohort = await enroll(owner, { age });
      const events = flow({ at: cohort.at + (age === 60 ? 36 : 10) * day });
      for (const event of events) event.receivedAt = new Date(cohort.at + (age === 49.5 ? 49.25 : 20) * day).toISOString();
      await put(owner, events);
    }
    const result = (await database.getFunnel()).find((row) => row.group === "assigned_35_day_cohort");
    assert.equal(result.enrolled, 5); assert.equal(result.mature35, 4); assert.equal(result.final49, 2);
    assert.equal(result.deliveredBuyers35, 2); assert.equal(result.deliveredBuyersFinal, 0);
    assert.equal(result.conversion35, 0.5); assert.equal(result.conversionFinal, 0);
  });

  it("uses the latest cumulative queue report rather than summing callbacks", async () => {
    const owner = await installation();
    const at = Date.now() - day;
    await put(owner, [row("telemetry_queue_status", { droppedCount: 3, oldestAgeBucket: "1h_to_1d" }, at),
      row("telemetry_queue_status", { droppedCount: 7, oldestAgeBucket: "over_7d" }, at + 1000)]);
    const result = await database.getFunnel();
    assert.equal(result.find((row) => row.label === "reported_queue_drops").count, 7);
  });
});
