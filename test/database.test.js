import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCloudSaveNotDowngraded, assertCloudSaveReadable, incomingCloudSaveWins } from "../src/database.js";

describe("cloud save ordering", () => {
  it("accepts the first or strictly newer slot and lets cloud win ties", () => {
    assert.equal(incomingCloudSaveWins(null, "2026-08-22T12:00:00Z"), true);
    assert.equal(incomingCloudSaveWins("2026-08-22T11:00:00Z", "2026-08-22T12:00:00Z"), true);
    assert.equal(incomingCloudSaveWins("2026-08-22T12:00:00Z", "2026-08-22T12:00:00Z"), false);
    assert.equal(incomingCloudSaveWins("2026-08-22T13:00:00Z", "2026-08-22T12:00:00Z"), false);
  });
});

describe("Football save-format compatibility", () => {
  it("defaults legacy readers to 8 and guards every returned slot, including empty tombstones", () => {
    assert.doesNotThrow(() => assertCloudSaveReadable([{ save_version: 8 }]));
    assert.throws(() => assertCloudSaveReadable([{ save_version: 8 }, { save_version: 9, is_occupied: false }]), { code: "CLOUD_SAVE_UPGRADE_REQUIRED", requiredSaveVersion: 9 });
    assert.doesNotThrow(() => assertCloudSaveReadable([{ save_version: 9 }], 9));
    assert.throws(() => assertCloudSaveReadable([{ save_version: 10 }], 9), { code: "CLOUD_SAVE_UPGRADE_REQUIRED" });
  });
  it("rejects downgrade independently of timestamps or claimed read capability", () => {
    assert.throws(() => assertCloudSaveNotDowngraded({ save_version: 9 }, { saveVersion: 8 }), { code: "CLOUD_SAVE_DOWNGRADE", requiredSaveVersion: 9 });
    assert.doesNotThrow(() => assertCloudSaveNotDowngraded({ save_version: 8 }, { saveVersion: 9 }));
    assert.doesNotThrow(() => assertCloudSaveNotDowngraded(undefined, { saveVersion: 8 }));
  });
});
