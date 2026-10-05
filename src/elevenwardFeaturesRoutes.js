import { randomBytes } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { sha256 } from "./elevenwardValidation.js";
import {
  validateFeedback,
  validateArchive,
  validateChallengeSubmission,
  uuidPattern,
  weekDefinition,
} from "./elevenwardFeaturesValidation.js";
import { replayWeeklyChallenge } from "./elevenwardChallengeReplay.js";

export function installElevenwardFeatureRoutes(
  router,
  {
    database,
    requireAccount,
    requireStaff,
    replayChallenge = replayWeeklyChallenge,
  },
) {
  const feedbackLimit = rateLimit({
    windowMs: 3600000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const socialLimit = rateLimit({
    windowMs: 900000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const replayLimit = rateLimit({
    windowMs: 900000,
    limit: 6,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const wrap = (handler) => async (req, res, next) => {
    try {
      return await handler(req, res);
    } catch (error) {
      return next(error);
    }
  };
  const accountId = (req) => req.elevenwardAccount.id;
  router.post(
    "/feedback",
    feedbackLimit,
    wrap(async (req, res) => {
      const value = validateFeedback(req.body);
      if (!value) return res.status(400).json({ error: "invalid_feedback" });
      const result = await database.createElevenwardFeedback(value);
      if (result.conflict)
        return res.status(409).json({ error: "submission_id_conflict" });
      return res.status(result.created ? 201 : 200).json({
        received: true,
        submissionId: value.submissionId,
        supportCode: result.supportCode,
      });
    }),
  );
  router.get(
    "/career-archives",
    requireAccount,
    wrap(async (req, res) =>
      res.json({ archives: await database.getCareerArchives(accountId(req)) }),
    ),
  );
  router.post(
    "/career-archives",
    requireAccount,
    wrap(async (req, res) => {
      const value = validateArchive(req.body);
      if (!value)
        return res.status(422).json({ error: "invalid_retired_career" });
      const result = await database.archiveCareer(accountId(req), value);
      const { status, ...body } = result;
      return res.status(status).json(body);
    }),
  );
  router.delete(
    "/career-archives/:careerId",
    requireAccount,
    wrap(async (req, res) => {
      if (!uuidPattern.test(req.params.careerId))
        return res.status(400).json({ error: "invalid_career_id" });
      await database.deleteCareerArchive(accountId(req), req.params.careerId);
      return res.status(204).end();
    }),
  );
  router.put(
    "/account/friend-comparison-sharing",
    requireAccount,
    wrap(async (req, res) => {
      if (typeof req.body?.enabled !== "boolean")
        return res.status(400).json({ error: "enabled_must_be_boolean" });
      await database.setFriendComparisonSharing(
        accountId(req),
        req.body.enabled,
      );
      return res.json({ enabled: req.body.enabled });
    }),
  );
  router.get(
    "/friends",
    requireAccount,
    wrap(async (req, res) =>
      res.json(await database.getFriends(accountId(req))),
    ),
  );
  router.post(
    "/friends/invite-code",
    requireAccount,
    socialLimit,
    wrap(async (req, res) => {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const expiresAt = new Date(Date.now() + 86400000);
      for (let attempt = 0; attempt < 5; attempt++) {
        const inviteCode = Array.from(
          randomBytes(8),
          (byte) => alphabet[byte % 32],
        ).join("");
        try {
          await database.issueFriendInvite(
            accountId(req),
            sha256(inviteCode),
            expiresAt,
          );
          return res.json({ inviteCode, expiresAt: expiresAt.toISOString() });
        } catch (error) {
          if (error?.code !== "23505" || attempt === 4) throw error;
        }
      }
    }),
  );
  router.post(
    "/friends/requests",
    requireAccount,
    socialLimit,
    wrap(async (req, res) => {
      const code =
        typeof req.body?.inviteCode === "string"
          ? req.body.inviteCode.trim().toUpperCase()
          : null;
      if (!code || !/^\w{8}$/.test(code))
        return res.status(400).json({ error: "invalid_invite_code" });
      const result = await database.requestFriend(accountId(req), sha256(code));
      return result.error
        ? res.status(result.status).json({ error: result.error })
        : res.status(result.status).json({
            requestId: result.requestId,
            status: result.relationStatus,
          });
    }),
  );
  router.post(
    "/friends/requests/:requestId/respond",
    requireAccount,
    socialLimit,
    wrap(async (req, res) => {
      if (
        !uuidPattern.test(req.params.requestId) ||
        typeof req.body?.accept !== "boolean"
      )
        return res.status(400).json({ error: "invalid_friend_response" });
      const result = await database.respondFriend(
        accountId(req),
        req.params.requestId,
        req.body.accept,
      );
      return result
        ? res.json(result)
        : res.status(404).json({ error: "request_not_found" });
    }),
  );
  for (const [method, path, options] of [
    ["delete", "/friends/:profileId", {}],
    ["post", "/friends/:profileId/block", { block: true }],
    ["delete", "/friends/:profileId/block", { unblock: true }],
  ]) {
    router[method](
      path,
      requireAccount,
      socialLimit,
      wrap(async (req, res) => {
        if (!uuidPattern.test(req.params.profileId))
          return res.status(400).json({ error: "invalid_profile_id" });
        await database.changeFriend(
          accountId(req),
          req.params.profileId,
          options,
        );
        return res.status(204).end();
      }),
    );
  }
  router.get(
    "/challenges/current",
    requireAccount,
    wrap(async (req, res) => {
      const definition = weekDefinition();
      await database.ensureWeeklyChallenge(definition);
      return res.json(
        await database.getWeeklyChallenge(definition.id, accountId(req)),
      );
    }),
  );
  router.post(
    "/challenges/:challengeId/enroll",
    requireAccount,
    wrap(async (req, res) => {
      const definition = weekDefinition();
      if (req.params.challengeId !== definition.id)
        return res.status(409).json({ error: "challenge_closed" });
      await database.ensureWeeklyChallenge(definition);
      const result = await database.enrollChallenge(
        accountId(req),
        definition.id,
      );
      if (!result) return res.status(409).json({ error: "challenge_closed" });
      const { created, ...body } = result;
      return res.status(created ? 201 : 200).json(body);
    }),
  );
  router.post(
    "/challenges/:challengeId/submit",
    requireAccount,
    replayLimit,
    wrap(async (req, res) => {
      const submission = validateChallengeSubmission(req.body);
      if (!submission)
        return res.status(400).json({ error: "invalid_challenge_submission" });
      const input = await database.getChallengeReplayInput(
        accountId(req),
        req.params.challengeId,
        submission.attemptId,
      );
      if (!input) return res.status(404).json({ error: "attempt_not_found" });
      if (
        input.status === "submitted" &&
        input.actions_hash !== submission.actionsHash
      )
        return res.status(409).json({ error: "attempt_already_submitted" });
      if (input.status !== "submitted" && new Date(input.ends_at) <= new Date())
        return res.status(409).json({ error: "challenge_closed" });
      let score = Number(input.score);
      if (input.status !== "submitted") {
        try {
          const replay = await replayChallenge({
            seed: Number(input.seed),
            careerId: input.career_id,
            rulesVersion: input.rules_version,
            contentVersion: input.content_version,
            configuration: input.configuration,
            enrolledAt: new Date(input.enrolled_at).toISOString(),
            actions: submission.actions,
          });
          score = replay.score;
        } catch (error) {
          if (error.code === "REPLAY_UNAVAILABLE")
            return res
              .status(503)
              .json({ error: "challenge_verifier_unavailable" });
          if (error.code === "REPLAY_INVALID")
            return res.status(422).json({ error: "challenge_replay_invalid" });
          throw error;
        }
      }
      const result = await database.submitChallenge(
        accountId(req),
        req.params.challengeId,
        submission.attemptId,
        submission.actionsHash,
        score,
      );
      const { status, ...body } = result;
      return res.status(status).json(body);
    }),
  );
}
