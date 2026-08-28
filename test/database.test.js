import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { incomingCloudSaveWins } from "../src/database.js";

describe("cloud save ordering", () => {
  it("accepts the first or strictly newer slot and lets cloud win ties", () => {
    assert.equal(incomingCloudSaveWins(null, "2026-08-22T12:00:00Z"), true);
    assert.equal(incomingCloudSaveWins("2026-08-22T11:00:00Z", "2026-08-22T12:00:00Z"), true);
    assert.equal(incomingCloudSaveWins("2026-08-22T12:00:00Z", "2026-08-22T12:00:00Z"), false);
    assert.equal(incomingCloudSaveWins("2026-08-22T13:00:00Z", "2026-08-22T12:00:00Z"), false);
  });
});
