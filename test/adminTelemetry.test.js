import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Script } from "node:vm";
import { adminDashboardJs, renderAdminDashboard } from "../src/adminDashboard.js";

describe("private telemetry dashboard definitions", () => {
  it("renders separate cohort, ordered-opportunity, and marginal-activity surfaces", () => {
    const html = renderAdminDashboard();
    assert.match(html, /Consented registered installations/);
    assert.match(html, /fully observed D1 \[1,2\), D7 \[7,8\), and D30 \[30,31\)/);
    assert.match(html, /All-time marginal career activity/);
    assert.match(html, /Ordered paid opportunities/);
    assert.match(html, /Assigned 35-day directional buyer cohorts/);
    assert.match(html, /including later ordinary Shop purchases by control players/);
    assert.match(html, /Events received after that cutoff are excluded/);
    assert.match(html, /not revenue, proceeds, refunds/);
    assert.match(html, /noindex,nofollow/);
  });

  it("compiles generated dashboard JavaScript and never inserts telemetry as HTML", () => {
    assert.doesNotThrow(() => new Script(adminDashboardJs));
    assert.equal(adminDashboardJs.includes("innerHTML"), false);
    for (const group of ["career_activity", "paid_opportunity", "quarantined_opportunity", "assigned_35_day_cohort", "measurement_diagnostic"]) {
      assert.equal(adminDashboardJs.includes(group), true);
    }
  });
});
