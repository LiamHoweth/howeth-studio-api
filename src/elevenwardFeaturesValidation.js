import { randomBytes } from "node:crypto";
import {
  sha256,
  validateSyncRequest,
  leaderboardSubmissionFromSync,
} from "./elevenwardValidation.js";

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value, min, max) =>
  typeof value === "string" &&
  value.trim().length >= min &&
  value.trim().length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value)
    ? value.trim()
    : null;
export function validateFeedback(body) {
  if (
    !object(body) ||
    !uuidPattern.test(body.submissionId ?? "") ||
    !["bug", "feature", "purchase", "other"].includes(body.category)
  )
    return null;
  // Reports are multiline prose; keep all other fields single-line and reject
  // non-text controls while permitting ordinary LF, CR and tab characters.
  const message =
    typeof body.message === "string" &&
    body.message.trim().length >= 5 &&
    body.message.trim().length <= 4000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.message)
      ? body.message.trim()
      : null;
  const appVersion = text(body.appVersion, 1, 32);
  const contactEmail =
    body.contactEmail == null || body.contactEmail === ""
      ? null
      : text(body.contactEmail, 3, 254);
  if (
    !message ||
    !appVersion ||
    !["ios", "android", "web", "macos", "other"].includes(body.platform) ||
    (body.contactEmail &&
      (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)))
  )
    return null;
  const supportCode =
    body.supportCode == null
      ? `EW-${randomBytes(6).toString("hex").toUpperCase()}`
      : text(body.supportCode, 6, 32);
  if (!supportCode || !/^[A-Z0-9-]+$/.test(supportCode)) return null;
  const diagnostics = body.diagnostics ?? {};
  if (
    !object(diagnostics) ||
    Object.keys(diagnostics).some(
      (key) =>
        ![
          "schemaVersion",
          "rulesVersion",
          "contentVersion",
          "locale",
          "area",
          "errorCode",
          "syncState",
        ].includes(key),
    )
  )
    return null;
  for (const [key, value] of Object.entries(diagnostics)) {
    if (
      key === "schemaVersion"
        ? !Number.isInteger(value) || value < 1 || value > 1000
        : !text(value, 1, 64)
    )
      return null;
  }
  return {
    submissionId: body.submissionId.toLowerCase(),
    category: body.category,
    message,
    appVersion,
    contactEmail,
    platform: body.platform,
    supportCode,
    diagnostics,
  };
}
export function validateArchive(body) {
  const sync = validateSyncRequest(0, {
    snapshot: body?.snapshot,
    baseRevision: 0,
    idempotencyKey: "00000000-0000-4000-8000-000000000000",
  });
  if (!sync || sync.snapshot.retired !== true) return null;
  const score = leaderboardSubmissionFromSync(sync);
  return score ? { ...sync, legacyScore: score.legacyScore } : null;
}
export function validateChallengeSubmission(body) {
  if (
    !object(body) ||
    !uuidPattern.test(body.attemptId ?? "") ||
    !Array.isArray(body.actions) ||
    body.actions.length !== 8
  )
    return null;
  if (
    Buffer.byteLength(JSON.stringify(body.actions)) > 32000 ||
    body.actions.some(
      (action) =>
        !object(action) ||
        Object.keys(action).length !== 3 ||
        ![
          "pace",
          "technique",
          "passing",
          "finishing",
          "defending",
          "strength",
          "stamina",
          "composure",
        ].includes(action.focus) ||
        !["light", "balanced", "intensive"].includes(action.intensity) ||
        !["safe", "balanced", "bold"].includes(action.spotlightApproach),
    )
  )
    return null;
  return {
    attemptId: body.attemptId.toLowerCase(),
    actions: body.actions,
    actionsHash: sha256(body.actions),
  };
}
export function weekDefinition(now = new Date()) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start.getTime() + 7 * 86400000);
  const id = start.toISOString().slice(0, 10);
  return {
    id,
    title: "Eight-match underdog challenge",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    rulesVersion: "2026.5",
    contentVersion: "2026.4.0",
    matchCount: 8,
    configuration: {
      position: "striker",
      difficulty: "professional",
      archetype: "poacher",
      matchCount: 8,
      boosts: [],
    },
    seed: parseInt(sha256(`elevenward:weekly:2026.5:${id}`).slice(0, 12), 16),
  };
}
