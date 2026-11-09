import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Script } from "node:vm";
import { createApp } from "../src/app.js";
import { adminApps } from "../src/adminApps.js";
import { adminDashboardJs, renderAdminDashboard } from "../src/adminDashboard.js";

const basic = { authorization: `Basic ${Buffer.from("console:console-test-password").toString("base64")}` };
const apiKey = { authorization: "Bearer console-test-api-key" };
const queries = [];
let server;
let origin;

describe("studio console authorization and app isolation", () => {
  before(async () => {
    const app = createApp({
      env: { ADMIN_DASHBOARD_USER: "console", ADMIN_DASHBOARD_PASSWORD: "console-test-password", ADMIN_API_KEY: "console-test-api-key" },
      database: {
        async getFeedbackSummary({ product }) { queries.push(product); return { unread: 0, total: 0 }; },
        async getFeedback({ product }) { queries.push(product); return []; }
      },
      elevenwardDatabase: {}
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise(resolve => server.close(resolve)));

  it("keeps the shell and assets private; API keys cannot open the dashboard", async () => {
    for (const path of ["/admin", "/admin/dashboard.css", "/admin/dashboard.js"]) {
      assert.equal((await fetch(origin + path)).status, 401);
      assert.equal((await fetch(origin + path, { headers: apiKey })).status, 401);
      const response = await fetch(origin + path, { headers: basic });
      assert.equal(response.status, 200);
      if (path === "/admin") {
        assert.match(response.headers.get("cache-control"), /no-store/);
        assert.match(await response.text(), /noindex,nofollow/);
      }
    }
  });

  it("protects the app directory and exposes capabilities without credentials", async () => {
    assert.equal((await fetch(origin + "/api/v1/admin/apps")).status, 401);
    for (const headers of [basic, apiKey]) {
      const response = await fetch(origin + "/api/v1/admin/apps", { headers });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).apps, adminApps);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
    assert.equal(new Set(adminApps.map(app => app.id)).size, adminApps.length);
    assert.deepEqual(adminApps.filter(app => app.adapter).map(app => app.id), ["football_era", "elevenward"]);
    for (const app of adminApps) assert.deepEqual(Object.keys(app).sort(), ["adapter", "category", "feedback", "id", "name"]);
  });

  it("passes the exact selected app to both inbox queries, including unconnected apps", async () => {
    for (const product of ["football_era", "elevenward", "noctara", "superlife"]) {
      queries.length = 0;
      const response = await fetch(origin + "/api/v1/admin/feedback?product=" + product, { headers: basic });
      assert.equal(response.status, 200);
      assert.deepEqual(queries, [product, product]);
    }
    queries.length = 0;
    assert.equal((await fetch(origin + "/api/v1/admin/feedback", { headers: basic })).status, 200);
    assert.deepEqual(queries, [null, null]);
  });

  it("rejects malformed and unknown app filters without falling back to all inboxes", async () => {
    for (const query of ["product=other", "product=", "product=elevenward&product=football_era", "product%5Bx%5D=elevenward"]) {
      queries.length = 0;
      assert.equal((await fetch(origin + "/api/v1/admin/feedback?" + query, { headers: basic })).status, 400);
      assert.equal(queries.length, 0);
    }
  });

  it("serves parseable external JavaScript and versions assets together", () => {
    assert.doesNotThrow(() => new Script(adminDashboardJs));
    assert.equal(adminDashboardJs.includes("innerHTML"), false);
    const html = renderAdminDashboard();
    const versions = [...html.matchAll(/dashboard\.(?:css|js)\?v=([a-f0-9]+)/g)].map(match => match[1]);
    assert.equal(versions.length, 2);
    assert.equal(versions[0], versions[1]);
  });
});
