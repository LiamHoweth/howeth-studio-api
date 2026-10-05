import { leaderboardSubmissionFromSync } from "./elevenwardValidation.js";

const iso = (value) => new Date(value).toISOString();
const archive = (row) => ({
  careerId: row.career_id,
  snapshot: row.snapshot,
  legacyScore: Number(row.legacy_score),
  archivedAt: iso(row.archived_at),
});
const challenge = (row) => ({
  id: row.id,
  title: row.title,
  startsAt: iso(row.starts_at),
  endsAt: iso(row.ends_at),
  rulesVersion: row.rules_version,
  contentVersion: row.content_version,
  configuration: row.configuration,
  matchCount: 8,
});
const attempt = (row, seed) =>
  row
    ? {
        attemptId: row.id,
        careerId: row.career_id,
        seed: Number(seed),
        status: row.status,
        score: row.score == null ? null : Number(row.score),
        enrolledAt: iso(row.enrolled_at),
      }
    : null;
const safeAlias =
  "CASE WHEN a.public_username IS NOT NULL AND a.username_suspended_at IS NULL THEN a.public_username ELSE a.alias END";
const rankedBoard = `SELECT CASE WHEN a.public_username IS NOT NULL AND a.username_suspended_at IS NULL THEN a.public_username ELSE s.position || ' Player ' || upper(substring(encode(digest(s.account_id::text || ':' || s.career_id,'sha256'),'hex') FROM 1 FOR 6)) END alias,
 a.public_profile_id,a.id account_id,TRUE reportable,s.career_id,s.legacy_score,s.aggregate_metrics,s.updated_at,
 row_number() OVER(ORDER BY s.legacy_score DESC,s.updated_at ASC,s.id ASC)::int rank
 FROM elevenward.leaderboard_submissions s JOIN elevenward.accounts a ON a.id=s.account_id
 JOIN elevenward.career_slots c ON c.account_id=s.account_id AND c.career_id=s.career_id
 WHERE s.position=$1 AND s.difficulty=$2 AND s.rules_version=$3 AND s.accepted=true AND a.leaderboard_sharing_enabled=true`;

export function createElevenwardFeaturesDatabase(requirePool) {
  async function transaction(work) {
    const client = await requirePool().connect();
    try {
      await client.query("BEGIN");
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async function lockPair(client, a, b) {
    await client.query(
      "SELECT id FROM elevenward.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [[a, b]],
    );
  }
  return {
    async getLeaderboardContext(
      accountId,
      { position, difficulty, rulesVersion, limit },
      careerId = null,
    ) {
      const result = await requirePool().query(
        `WITH ranked AS (${rankedBoard}), mine AS (
       SELECT * FROM ranked WHERE account_id=$4 AND ($5::uuid IS NULL OR career_id=$5) ORDER BY rank LIMIT 1)
       SELECT (SELECT count(*)::int FROM ranked) total,
         COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rank) FROM ranked r WHERE r.rank<=$6),'[]'::jsonb) entries,
         (SELECT to_jsonb(mine) FROM mine) mine,
         COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rank) FROM ranked r,mine WHERE r.rank BETWEEN GREATEST(1,mine.rank-2) AND mine.rank+2),'[]'::jsonb) nearby`,
        [position, difficulty, rulesVersion, accountId, careerId, limit],
      );
      const row = result.rows[0];
      return {
        totalEntries: row.total,
        entries: row.entries,
        myEntry: row.mine,
        nearbyEntries: row.nearby,
      };
    },
    async createElevenwardFeedback(value) {
      const result = await requirePool().query(
        `INSERT INTO feedback_submissions(id,category,message,contact_email,source,platform,app_version,product,support_code,diagnostics)
       VALUES($1,$2,$3,$4,'settings',$5,$6,'elevenward',$7,$8::jsonb) ON CONFLICT(id) DO NOTHING RETURNING support_code`,
        [
          value.submissionId,
          { feature: "feature_idea", purchase: "store_purchase" }[
            value.category
          ] ?? value.category,
          value.message,
          value.contactEmail,
          value.platform,
          value.appVersion,
          value.supportCode,
          JSON.stringify(value.diagnostics),
        ],
      );
      if (result.rowCount)
        return { created: true, supportCode: result.rows[0].support_code };
      const existing = await requirePool().query(
        "SELECT support_code FROM feedback_submissions WHERE id=$1 AND product='elevenward'",
        [value.submissionId],
      );
      return existing.rowCount
        ? { created: false, supportCode: existing.rows[0].support_code }
        : { conflict: true };
    },
    async getCareerArchives(accountId) {
      const result = await requirePool().query(
        "SELECT * FROM elevenward.career_archives WHERE account_id=$1 ORDER BY archived_at DESC,career_id",
        [accountId],
      );
      return result.rows.map(archive);
    },
    async archiveCareer(accountId, value) {
      return transaction(async (client) => {
        await client.query(
          "SELECT id FROM elevenward.accounts WHERE id=$1 FOR UPDATE",
          [accountId],
        );
        const existing = await client.query(
          "SELECT * FROM elevenward.career_archives WHERE account_id=$1 AND career_id=$2",
          [accountId, value.careerId],
        );
        if (existing.rowCount)
          return existing.rows[0].checksum === value.checksum
            ? { status: 200, archive: archive(existing.rows[0]) }
            : { status: 409, error: "archive_already_exists" };
        const count = await client.query(
          "SELECT count(*)::int n FROM elevenward.career_archives WHERE account_id=$1",
          [accountId],
        );
        if (count.rows[0].n >= 40)
          return { status: 409, error: "archive_limit_reached" };
        const inserted = await client.query(
          "INSERT INTO elevenward.career_archives(account_id,career_id,snapshot,checksum,legacy_score) VALUES($1,$2,$3::jsonb,$4,$5) RETURNING *",
          [
            accountId,
            value.careerId,
            JSON.stringify(value.snapshot),
            value.checksum,
            value.legacyScore,
          ],
        );
        return { status: 201, archive: archive(inserted.rows[0]) };
      });
    },
    async deleteCareerArchive(accountId, careerId) {
      await requirePool().query(
        "DELETE FROM elevenward.career_archives WHERE account_id=$1 AND career_id=$2",
        [accountId, careerId],
      );
    },
    async setFriendComparisonSharing(accountId, enabled) {
      await requirePool().query(
        "UPDATE elevenward.accounts SET friend_comparison_sharing_enabled=$2 WHERE id=$1",
        [accountId, enabled],
      );
    },
    async issueFriendInvite(accountId, codeHash, expiresAt) {
      await transaction(async (client) => {
        await client.query(
          "SELECT id FROM elevenward.accounts WHERE id=$1 FOR UPDATE",
          [accountId],
        );
        await client.query(
          "INSERT INTO elevenward.friend_invites(account_id,code_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET code_hash=$2,expires_at=$3",
          [accountId, codeHash, expiresAt],
        );
      });
    },
    async requestFriend(accountId, codeHash) {
      return transaction(async (client) => {
        const target = await client.query(
          "SELECT account_id FROM elevenward.friend_invites WHERE code_hash=$1 AND expires_at>now()",
          [codeHash],
        );
        const recipient = target.rows[0]?.account_id;
        if (!recipient) return { status: 404, error: "invite_not_found" };
        if (recipient === accountId)
          return { status: 400, error: "cannot_add_self" };
        await lockPair(client, accountId, recipient);
        const currentInvite = await client.query(
          "SELECT 1 FROM elevenward.friend_invites WHERE account_id=$1 AND code_hash=$2 AND expires_at>now()",
          [recipient, codeHash],
        );
        if (!currentInvite.rowCount)
          return { status: 404, error: "invite_not_found" };
        const blocked = await client.query(
          "SELECT 1 FROM elevenward.friend_blocks WHERE (account_id=$1 AND blocked_account_id=$2) OR (account_id=$2 AND blocked_account_id=$1)",
          [accountId, recipient],
        );
        if (blocked.rowCount) return { status: 404, error: "invite_not_found" };
        const existing = await client.query(
          "SELECT * FROM elevenward.friendships WHERE LEAST(requester_id,recipient_id)=LEAST($1::uuid,$2::uuid) AND GREATEST(requester_id,recipient_id)=GREATEST($1::uuid,$2::uuid)",
          [accountId, recipient],
        );
        if (existing.rowCount && existing.rows[0].status !== "rejected")
          return {
            status: 200,
            requestId: existing.rows[0].id,
            relationStatus: existing.rows[0].status,
          };
        const count = await client.query(
          "SELECT count(*)::int n FROM elevenward.friendships WHERE (requester_id=$1 OR recipient_id=$1 OR requester_id=$2 OR recipient_id=$2) AND status IN ('pending','accepted')",
          [accountId, recipient],
        );
        if (count.rows[0].n >= 200)
          return { status: 409, error: "friend_limit_reached" };
        // Rejected requests require a freshly issued code before contacting again.
        if (existing.rowCount) {
          const invite = await client.query(
            "SELECT expires_at FROM elevenward.friend_invites WHERE account_id=$1",
            [recipient],
          );
          if (
            new Date(invite.rows[0].expires_at).getTime() - 86400000 <=
            new Date(existing.rows[0].updated_at).getTime()
          )
            return { status: 409, error: "request_rejected" };
          await client.query("DELETE FROM elevenward.friendships WHERE id=$1", [
            existing.rows[0].id,
          ]);
        }
        const inserted = await client.query(
          "INSERT INTO elevenward.friendships(requester_id,recipient_id) VALUES($1,$2) RETURNING id,status",
          [accountId, recipient],
        );
        return {
          status: 201,
          requestId: inserted.rows[0].id,
          relationStatus: inserted.rows[0].status,
        };
      });
    },
    async respondFriend(accountId, requestId, accept) {
      return transaction(async (client) => {
        const found = await client.query(
          "SELECT * FROM elevenward.friendships WHERE id=$1 AND recipient_id=$2",
          [requestId, accountId],
        );
        if (!found.rowCount) return null;
        const row = found.rows[0];
        await lockPair(client, row.requester_id, row.recipient_id);
        const current = await client.query(
          "SELECT status FROM elevenward.friendships WHERE id=$1 AND recipient_id=$2 FOR UPDATE",
          [requestId, accountId],
        );
        if (!current.rowCount) return null;
        if (current.rows[0].status !== "pending") return current.rows[0];
        const changed = await client.query(
          "UPDATE elevenward.friendships SET status=$3,updated_at=now() WHERE id=$1 AND recipient_id=$2 AND status='pending' RETURNING status",
          [requestId, accountId, accept ? "accepted" : "rejected"],
        );
        return changed.rows[0];
      });
    },
    async changeFriend(
      accountId,
      profileId,
      { block = false, unblock = false } = {},
    ) {
      return transaction(async (client) => {
        const target = await client.query(
          "SELECT id FROM elevenward.accounts WHERE public_profile_id=$1 AND id<>$2",
          [profileId, accountId],
        );
        if (!target.rowCount) return;
        const other = target.rows[0].id;
        await lockPair(client, accountId, other);
        if (unblock) {
          await client.query(
            "DELETE FROM elevenward.friend_blocks WHERE account_id=$1 AND blocked_account_id=$2",
            [accountId, other],
          );
          return;
        }
        await client.query(
          "DELETE FROM elevenward.friendships WHERE LEAST(requester_id,recipient_id)=LEAST($1::uuid,$2::uuid) AND GREATEST(requester_id,recipient_id)=GREATEST($1::uuid,$2::uuid)",
          [accountId, other],
        );
        if (block)
          await client.query(
            "INSERT INTO elevenward.friend_blocks(account_id,blocked_account_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [accountId, other],
          );
      });
    },
    async getFriends(accountId) {
      // A single repeatable-read transaction prevents a revoked consent leaking into a later metrics read.
      return transaction(async (client) => {
        await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        const me = await client.query(
          "SELECT friend_comparison_sharing_enabled FROM elevenward.accounts WHERE id=$1",
          [accountId],
        );
        const enabled = me.rows[0]?.friend_comparison_sharing_enabled === true;
        const relations = await client.query(
          `SELECT f.*,a.public_profile_id,${safeAlias} alias,a.friend_comparison_sharing_enabled FROM elevenward.friendships f JOIN elevenward.accounts a ON a.id=CASE WHEN f.requester_id=$1 THEN f.recipient_id ELSE f.requester_id END WHERE (f.requester_id=$1 OR f.recipient_id=$1) AND f.status IN ('pending','accepted') ORDER BY f.created_at`,
          [accountId],
        );
        const result = {
          comparisonSharingEnabled: enabled,
          friends: [],
          incomingRequests: [],
          outgoingRequests: [],
          blocked: [],
        };
        for (const row of relations.rows) {
          const base = { profileId: row.public_profile_id, alias: row.alias };
          if (row.status === "pending") {
            result[
              row.recipient_id === accountId
                ? "incomingRequests"
                : "outgoingRequests"
            ].push({
              ...base,
              requestId: row.id,
              createdAt: iso(row.created_at),
            });
            continue;
          }
          const available =
            enabled && row.friend_comparison_sharing_enabled === true;
          const careers = [];
          if (available) {
            const slots = await client.query(
              "SELECT career_id,position,difficulty,rules_version,seed,checksum,snapshot FROM elevenward.career_slots WHERE account_id=$1 ORDER BY slot_index",
              [
                row.requester_id === accountId
                  ? row.recipient_id
                  : row.requester_id,
              ],
            );
            for (const slot of slots.rows) {
              const projected = leaderboardSubmissionFromSync({
                careerId: slot.career_id,
                position: slot.position,
                difficulty: slot.difficulty,
                rulesVersion: slot.rules_version,
                seed: Number(slot.seed),
                checksum: slot.checksum,
                snapshot: slot.snapshot,
              });
              if (projected)
                careers.push({
                  position: slot.position,
                  difficulty: slot.difficulty,
                  rulesVersion: slot.rules_version,
                  legacyScore: projected.legacyScore,
                  aggregateMetrics: projected.aggregateMetrics,
                });
            }
          }
          result.friends.push({
            ...base,
            comparisonAvailable: available,
            careers,
          });
        }
        const blocks = await client.query(
          "SELECT a.public_profile_id FROM elevenward.friend_blocks b JOIN elevenward.accounts a ON a.id=b.blocked_account_id WHERE b.account_id=$1",
          [accountId],
        );
        result.blocked = blocks.rows.map((row) => ({
          profileId: row.public_profile_id,
        }));
        return result;
      });
    },
    async ensureWeeklyChallenge(definition) {
      await requirePool().query(
        "INSERT INTO elevenward.weekly_challenges(id,title,starts_at,ends_at,rules_version,content_version,configuration,seed) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(id) DO NOTHING",
        [
          definition.id,
          definition.title,
          definition.startsAt,
          definition.endsAt,
          definition.rulesVersion,
          definition.contentVersion,
          JSON.stringify(definition.configuration),
          definition.seed,
        ],
      );
      const result = await requirePool().query(
        "SELECT * FROM elevenward.weekly_challenges WHERE id=$1",
        [definition.id],
      );
      return result.rows[0];
    },
    async getWeeklyChallenge(challengeId, accountId) {
      const result = await requirePool().query(
        "SELECT * FROM elevenward.weekly_challenges WHERE id=$1",
        [challengeId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const own = await requirePool().query(
        "SELECT * FROM elevenward.challenge_attempts WHERE challenge_id=$1 AND account_id=$2",
        [challengeId, accountId],
      );
      const entries = await requirePool().query(
        `SELECT ${safeAlias} alias,t.account_id,t.score,row_number() OVER(ORDER BY t.score DESC,t.submitted_at ASC,t.id ASC)::int rank FROM elevenward.challenge_attempts t JOIN elevenward.accounts a ON a.id=t.account_id WHERE t.challenge_id=$1 AND t.status='submitted' AND a.leaderboard_sharing_enabled=true ORDER BY t.score DESC,t.submitted_at ASC,t.id ASC LIMIT 25`,
        [challengeId],
      );
      return {
        challenge: challenge(row),
        attempt: attempt(own.rows[0], row.seed),
        entries: entries.rows.map((entry) => ({
          rank: entry.rank,
          alias: entry.alias,
          score: entry.score,
          isCurrentUser: entry.account_id === accountId,
        })),
      };
    },
    async enrollChallenge(accountId, challengeId) {
      return transaction(async (client) => {
        const found = await client.query(
          "SELECT * FROM elevenward.weekly_challenges WHERE id=$1 AND starts_at<=now() AND ends_at>now()",
          [challengeId],
        );
        if (!found.rowCount) return null;
        const row = found.rows[0];
        const added = await client.query(
          "INSERT INTO elevenward.challenge_attempts(challenge_id,account_id) VALUES($1,$2) ON CONFLICT(challenge_id,account_id) DO NOTHING RETURNING *",
          [challengeId, accountId],
        );
        const own = added.rowCount
          ? added
          : await client.query(
              "SELECT * FROM elevenward.challenge_attempts WHERE challenge_id=$1 AND account_id=$2",
              [challengeId, accountId],
            );
        return {
          created: added.rowCount === 1,
          challenge: challenge(row),
          attempt: attempt(own.rows[0], row.seed),
        };
      });
    },
    async getChallengeReplayInput(accountId, challengeId, attemptId) {
      const result = await requirePool().query(
        "SELECT t.*,c.seed,c.rules_version,c.content_version,c.configuration,c.starts_at,c.ends_at FROM elevenward.challenge_attempts t JOIN elevenward.weekly_challenges c ON c.id=t.challenge_id WHERE t.account_id=$1 AND t.challenge_id=$2 AND t.id=$3",
        [accountId, challengeId, attemptId],
      );
      return result.rows[0] ?? null;
    },
    async submitChallenge(
      accountId,
      challengeId,
      attemptId,
      actionsHash,
      score,
    ) {
      return transaction(async (client) => {
        const found = await client.query(
          "SELECT t.*,c.ends_at FROM elevenward.challenge_attempts t JOIN elevenward.weekly_challenges c ON c.id=t.challenge_id WHERE t.account_id=$1 AND t.challenge_id=$2 AND t.id=$3 FOR UPDATE OF t",
          [accountId, challengeId, attemptId],
        );
        if (!found.rowCount) return { status: 404, error: "attempt_not_found" };
        const row = found.rows[0];
        if (row.status === "submitted" && row.actions_hash !== actionsHash)
          return { status: 409, error: "attempt_already_submitted" };
        if (row.status !== "submitted" && new Date(row.ends_at) <= new Date())
          return { status: 409, error: "challenge_closed" };
        if (row.status !== "submitted")
          await client.query(
            "UPDATE elevenward.challenge_attempts SET status='submitted',actions_hash=$2,score=$3,submitted_at=now() WHERE id=$1",
            [attemptId, actionsHash, score],
          );
        const ranked = await client.query(
          "SELECT rank FROM (SELECT id,row_number() OVER(ORDER BY score DESC,submitted_at ASC,id ASC)::int rank FROM elevenward.challenge_attempts WHERE challenge_id=$1 AND status='submitted') x WHERE id=$2",
          [challengeId, attemptId],
        );
        return {
          status: 200,
          accepted: true,
          attemptId,
          score: row.status === "submitted" ? Number(row.score) : score,
          rank: ranked.rows[0]?.rank ?? null,
        };
      });
    },
  };
}
