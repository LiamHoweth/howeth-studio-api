import assert from "node:assert/strict";
import { replayWeeklyChallenge } from "../src/elevenwardChallengeReplay.js";

// Run in the final production image as its unprivileged user. A successful
// compiler stage alone does not prove the executable's shared-library linkage.
const input = {
  seed: 42,
  careerId: "00000000-0000-4000-8000-000000000042",
  enrolledAt: "2026-10-01T00:00:00.000Z",
  rulesVersion: "2026.5",
  contentVersion: "2026.4.0",
  actions: Array.from({ length: 8 }, () => ({
    focus: "finishing",
    intensity: "balanced",
    spotlightApproach: "balanced",
  })),
};
const first = await replayWeeklyChallenge(input);
const second = await replayWeeklyChallenge(input);
assert.deepEqual(first, second, "identical pinned replay must produce the same score");
assert.ok(Number.isSafeInteger(first.score) && first.score >= 0);
console.log("Final-image Dart executable passed an actual deterministic eight-match replay.");
