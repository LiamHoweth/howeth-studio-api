import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { validateEvents } from "../src/validation.js";

const context = {
  schemaVersion: 2, appVersion: "1.5.0", appBuild: "10", platform: "ios",
  analyticsEnvironment: "production", distributionChannel: "app_store", sessionId: randomUUID()
};
const offer = {
  opportunityId: randomUUID(), presentationId: randomUUID(), itemId: "DOUBLE_XP",
  offerId: "permanent_v1", surface: "shop", experimentId: "none", experimentVersion: 0, variant: "none"
};
const attemptId = randomUUID();
const saleReference = randomUUID();
function event(eventName, properties = {}, occurrence = context) {
  return { eventId: randomUUID(), eventName, occurredAt: new Date().toISOString(), properties: { ...properties, ...occurrence } };
}
function validate(row) { return validateEvents({ events: [row] }); }

describe("paid telemetry privacy contract", () => {
  it("accepts every bounded paid event with occurrence context and strips private extras", () => {
    const rows = [
      event("offer_eligible", { ...offer, availability: "loading" }),
      event("offer_visible", offer),
      event("capacity_action_visible", { ...offer, itemId: "EXTRA_CAREER_SLOTS", offerId: "capacity_v1", surface: "career_capacity" }),
      event("capacity_action_selected", { ...offer, itemId: "EXTRA_CAREER_SLOTS", offerId: "capacity_v1", surface: "career_capacity" }),
      event("product_selected", { ...offer, attemptId }),
      event("store_catalog_result", { operationId: randomUUID(), surface: "shop", result: "partial", availableItems: ["DOUBLE_XP", "DOUBLE_XP", "PRIVATE_ITEM"], latencyBucket: "5_to_30s" }),
      event("purchase_requested", { attemptId, itemId: "DOUBLE_XP", ...offer }),
      event("purchase_outcome", { attemptId, itemId: "DOUBLE_XP", outcome: "pending" }),
      event("purchase_verified", { attemptId, saleReference, itemId: "DOUBLE_XP", source: "purchase", storeEnvironment: "unknown", ...offer }),
      event("benefit_delivered", { saleReference, itemId: "DOUBLE_XP", source: "purchase", deliveryDelayBucket: "over_30s", ...offer }),
      event("entitlement_reconciled", { operationId: randomUUID(), source: "restore", storeReached: false, verifiedCount: 0, preservedCount: 5 }),
      event("experiment_assigned", { opportunityId: randomUUID(), experimentId: "xp_shop_copy", experimentVersion: 1, variant: "control" }),
      event("telemetry_queue_status", { droppedCount: 17, oldestAgeBucket: "over_7d" })
    ].map((row) => ({ ...row, properties: { ...row.properties,
      accountId: "private-account", careerId: "private-career", playerName: "private-name",
      revenueCatCustomerId: "private-customer", receipt: "private-receipt", transactionId: "private-store-id",
      token: "private-token", priceString: "$3.99", currency: "USD", semanticKey: "private-local-key"
    } }));
    const result = validateEvents({ events: rows });
    assert.equal(result.length, rows.length);
    for (const row of result) {
      assert.equal(row.properties.appVersion, "1.5.0");
      assert.equal(row.properties.appBuild, "10");
      assert.equal(row.properties.schemaVersion, 2);
      assert.equal(JSON.stringify(row).includes("private-"), false);
      assert.equal(row.properties.priceString, undefined);
      assert.equal(row.properties.currency, undefined);
    }
    assert.deepEqual(result.find((row) => row.eventName === "store_catalog_result").properties.availableItems, ["DOUBLE_XP"]);
    assert.equal(result.find((row) => row.eventName === "purchase_verified").properties.storeEnvironment, "unknown");
  });

  it("requires explicit occurrence context for paid events while accepting old gameplay queues", () => {
    assert.equal(validate(event("offer_visible", offer, {})), null);
    assert.equal(validate(event("offer_visible", offer, { ...context, analyticsEnvironment: undefined })), null);
    assert.equal(validate(event("offer_visible", offer, { ...context, appVersion: "x".repeat(33) })), null);
    assert.equal(validate(event("offer_visible", offer, { ...context, distributionChannel: "guessed_release" })), null);
    const legacy = validate(event("session_started", { accountId: "private-account" }, {}));
    assert.deepEqual(legacy[0].properties, {});
    assert.equal(validate(event("session_started", {}, { ...context, schemaVersion: 99 })), null);
  });

  it("rejects store IDs, unsupported products and environments, and oversized collections", () => {
    assert.equal(validate(event("purchase_verified", { itemId: "DOUBLE_XP", source: "purchase", storeEnvironment: "production", saleReference: "real-store-transaction-123" })), null);
    assert.equal(validate(event("purchase_requested", { itemId: "NEW_CURRENCY", attemptId })), null);
    assert.equal(validate(event("purchase_verified", { itemId: "DOUBLE_XP", source: "purchase", storeEnvironment: "release_build", saleReference })), null);
    assert.equal(validate(event("purchase_outcome", { itemId: "DOUBLE_XP", attemptId, outcome: "raw SDK message" })), null);
    assert.equal(validate(event("store_catalog_result", { operationId: randomUUID(), surface: "shop", result: "complete", availableItems: Array(6).fill("DOUBLE_XP"), latencyBucket: "under_1s" })), null);
    assert.equal(validate(event("telemetry_queue_status", { droppedCount: 1_000_001, oldestAgeBucket: "empty" })), null);
    assert.equal(validate(event("entitlement_reconciled", { operationId: randomUUID(), source: "store_sync", storeReached: true, verifiedCount: 6, preservedCount: 0 })), null);
  });

  it("validates experiment assignments and complete optional attempt context", () => {
    assert.equal(validate(event("offer_visible", { ...offer, experimentId: "xp_shop_copy", experimentVersion: 1 })), null);
    assert.equal(validate(event("offer_visible", { ...offer, experimentVersion: 1 })), null);
    assert.equal(validate(event("experiment_assigned", { opportunityId: randomUUID(), experimentId: "none", experimentVersion: 0, variant: "none" })), null);
    assert.equal(validate(event("purchase_requested", { itemId: "DOUBLE_XP", attemptId, opportunityId: randomUUID() })), null);
    assert.equal(validate(event("capacity_action_visible", offer)), null);
    assert.equal(validate(event("offer_visible", { ...offer, experimentId: "career_capacity", experimentVersion: 1, variant: "treatment" }))[0].properties.variant, "treatment");
  });

  it("allows commit identity only on durable state-transition events", () => {
    const commitId = randomUUID();
    const row = validate(event("daily_reward_claimed", { rewardType: "xp", commitId }));
    assert.equal(row[0].properties.commitId, commitId);
    assert.equal(validate(event("session_started", { commitId })), null);
    assert.equal(validate(event("daily_reward_claimed", { rewardType: "xp", commitId: "career-id" })), null);
  });
});
