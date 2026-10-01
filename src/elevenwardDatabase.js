import { randomBytes } from "node:crypto";
import pg from "pg";
import { createElevenwardFeaturesDatabase } from "./elevenwardFeaturesDatabase.js";
import { leaderboardSubmissionFromSync, sha256 } from "./elevenwardValidation.js";

const { Pool } = pg;

const ALIAS_ADJECTIVES = [
  "Amber", "Brave", "Calm", "Cobalt", "Crimson", "Emerald", "Golden", "Ivory",
  "Lucky", "Mighty", "Rapid", "Royal", "Silver", "Steady", "Swift", "Vivid"
];
const ALIAS_NOUNS = [
  "Anchor", "Comet", "Falcon", "Finisher", "Fox", "Lion", "Maestro", "Meteor",
  "Navigator", "Oak", "Phoenix", "Raven", "Spark", "Stag", "Star", "Voyager"
];

export function createPlayerAlias() {
  const bytes = randomBytes(4);
  return `${ALIAS_ADJECTIVES[bytes[0] % ALIAS_ADJECTIVES.length]} ${ALIAS_NOUNS[bytes[1] % ALIAS_NOUNS.length]} ${bytes.readUInt16BE(2).toString().padStart(5, "0")}`;
}

function slotResponse(row) {
  if (!row) return null;
  return {
    slotIndex: Number(row.slot_index),
    snapshot: row.snapshot,
    checksum: row.checksum,
    revision: Number(row.revision),
    clientUpdatedAt: new Date(row.client_updated_at).toISOString(),
    serverUpdatedAt: new Date(row.server_updated_at).toISOString()
  };
}

function conflictResponse(row) {
  if (!row) return null;
  return {
    conflictId: row.id,
    slotIndex: Number(row.slot_index),
    baseRevision: Number(row.base_revision),
    remoteRevision: Number(row.remote_revision),
    localSnapshot: row.local_snapshot,
    remoteSnapshot: row.remote_snapshot,
    status: row.status,
    resolution: row.resolution ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null
  };
}

async function replaceLeaderboardSubmission(client, accountId, careerId, submission) {
  await client.query(
    "DELETE FROM elevenward.leaderboard_submissions WHERE account_id=$1 AND career_id=$2",
    [accountId, careerId]
  );
  if (!submission) return;
  await client.query(
    `INSERT INTO elevenward.leaderboard_submissions
       (account_id, career_id, alias, position, difficulty, rules_version, seasons, matches,
        legacy_score, aggregate_metrics, validation_evidence, accepted, rejection_reason)
     VALUES ($1,$2,(SELECT alias FROM elevenward.accounts WHERE id=$1),$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,true,NULL)`,
    [accountId, careerId, submission.position, submission.difficulty,
      submission.rulesVersion, submission.seasons, submission.matches, submission.legacyScore,
      JSON.stringify(submission.aggregateMetrics), JSON.stringify(submission.validationEvidence)]
  );
}

// One account lock serializes sync/resolve/delete before conflict and slot locks.
async function accountSharingEnabled(client, accountId) {
  const result = await client.query(
    "SELECT leaderboard_sharing_enabled FROM elevenward.accounts WHERE id=$1 FOR UPDATE",
    [accountId]
  );
  return result.rows[0]?.leaderboard_sharing_enabled === true;
}

export function createElevenwardDatabase(connectionString = process.env.DATABASE_URL) {
  const pool = connectionString ? new Pool({ connectionString }) : null;
  const requirePool = () => {
    if (!pool) throw new Error("DATABASE_URL is not configured");
    return pool;
  };

  return {
    configured: Boolean(pool),
    ...createElevenwardFeaturesDatabase(requirePool),

    async ping() {
      if (!pool) return false;
      await pool.query("SELECT 1 FROM elevenward.accounts LIMIT 1");
      return true;
    },

    async createAccountSession({ identity, tokenHash, expiresAt }) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          `SELECT account_id, verified_email FROM elevenward.auth_identities
           WHERE provider = $1 AND provider_subject = $2 FOR UPDATE`,
          [identity.provider, identity.subject]
        );
        let accountId = existing.rows[0]?.account_id;
        let email = identity.email ?? existing.rows[0]?.verified_email ?? null;
        if (!accountId) {
          let account;
          for (let attempt = 0; attempt < 5 && !account; attempt += 1) {
            const candidate = await client.query(
              `INSERT INTO elevenward.accounts (alias) VALUES ($1)
               ON CONFLICT (alias) DO NOTHING RETURNING id, alias`,
              [createPlayerAlias()]
            );
            if (candidate.rowCount) account = candidate;
          }
          if (!account) throw new Error("Unable to allocate player alias");
          accountId = account.rows[0].id;
          await client.query(
            `INSERT INTO elevenward.auth_identities
               (account_id, provider, provider_subject, verified_email, apple_refresh_token_ciphertext)
             VALUES ($1,$2,$3,$4,$5)`,
            [accountId, identity.provider, identity.subject, identity.email, identity.refreshTokenCiphertext]
          );
        } else {
          const updated = await client.query(
            `UPDATE elevenward.auth_identities SET
               verified_email = COALESCE($3, verified_email),
               apple_refresh_token_ciphertext = COALESCE($4, apple_refresh_token_ciphertext),
               last_login_at = now()
             WHERE provider = $1 AND provider_subject = $2 RETURNING verified_email`,
            [identity.provider, identity.subject, identity.email, identity.refreshTokenCiphertext]
          );
          email = updated.rows[0]?.verified_email ?? email;
        }
        await client.query(
          "INSERT INTO elevenward.sessions (account_id, token_hash, expires_at) VALUES ($1,$2,$3)",
          [accountId, tokenHash, expiresAt]
        );
        const account = await client.query(
          `SELECT alias, public_profile_id, public_username, username_updated_at,
                  username_suspended_at, leaderboard_sharing_enabled
           FROM elevenward.accounts WHERE id = $1`, [accountId]
        );
        await client.query("COMMIT");
        return { id: accountId, ...account.rows[0], provider: identity.provider, email };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async findAccountBySessionTokenHash(tokenHash) {
      const result = await requirePool().query(
        `WITH active AS (
           UPDATE elevenward.sessions
           SET last_seen_at = now(), expires_at = now() + interval '90 days'
           WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
           RETURNING account_id, expires_at
         )
         SELECT a.id, a.alias, a.public_profile_id, a.public_username,
                a.username_updated_at, a.username_suspended_at, a.leaderboard_sharing_enabled,
                i.provider, i.verified_email, active.expires_at
         FROM active JOIN elevenward.accounts a ON a.id = active.account_id
         JOIN elevenward.auth_identities i ON i.account_id = a.id
         ORDER BY i.last_login_at DESC LIMIT 1`,
        [tokenHash]
      );
      return result.rows[0] ?? null;
    },

    async revokeSession(tokenHash) {
      await requirePool().query(
        "UPDATE elevenward.sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
        [tokenHash]
      );
    },

    async setLeaderboardSharing(accountId, enabled) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const updated = await client.query(
          `UPDATE elevenward.accounts SET leaderboard_sharing_enabled=$2, updated_at=now()
           WHERE id=$1 RETURNING leaderboard_sharing_enabled`, [accountId, enabled]
        );
        if (!updated.rowCount) {
          await client.query("ROLLBACK");
          return null;
        }
        await client.query("DELETE FROM elevenward.leaderboard_submissions WHERE account_id=$1", [accountId]);
        if (enabled) {
          const slots = await client.query(
            `SELECT career_id, position, difficulty, rules_version, seed, checksum, snapshot
             FROM elevenward.career_slots WHERE account_id=$1 ORDER BY slot_index`, [accountId]
          );
          for (const row of slots.rows) {
            const projected = leaderboardSubmissionFromSync({
              careerId: row.career_id, position: row.position, difficulty: row.difficulty,
              rulesVersion: row.rules_version, seed: Number(row.seed), checksum: row.checksum,
              snapshot: row.snapshot
            });
            if (projected) await replaceLeaderboardSubmission(client, accountId, row.career_id, projected);
          }
        }
        await client.query("COMMIT");
        return updated.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async setPublicUsername(accountId, username, normalized) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const current = await client.query(
          `SELECT public_username, username_updated_at, username_suspended_at
           FROM elevenward.accounts WHERE id=$1 FOR UPDATE`, [accountId]
        );
        if (!current.rowCount) {
          await client.query("ROLLBACK");
          return { status: "missing" };
        }
        const row = current.rows[0];
        if (row.username_suspended_at) {
          await client.query("ROLLBACK");
          return { status: "suspended" };
        }
        if (row.public_username && row.username_updated_at) {
          const canChangeAt = new Date(new Date(row.username_updated_at).getTime() + 30 * 86_400_000);
          if (canChangeAt.getTime() > Date.now()) {
            await client.query("ROLLBACK");
            return { status: "cooldown", canChangeAt: canChangeAt.toISOString() };
          }
        }
        const updated = await client.query(
          `UPDATE elevenward.accounts
           SET public_username=$2, public_username_normalized=$3,
               username_updated_at=now(), updated_at=now()
           WHERE id=$1
           RETURNING public_profile_id, public_username, username_updated_at, username_suspended_at`,
          [accountId, username, normalized]
        );
        await client.query("COMMIT");
        return { status: "updated", account: updated.rows[0] };
      } catch (error) {
        await client.query("ROLLBACK");
        if (error?.code === "23505") return { status: "taken" };
        throw error;
      } finally {
        client.release();
      }
    },

    async createUsernameReport(reporterAccountId, profileId, reason) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const target = await client.query(
          `SELECT id FROM elevenward.accounts WHERE public_profile_id=$1 FOR UPDATE`, [profileId]
        );
        if (!target.rowCount) {
          await client.query("ROLLBACK");
          return { status: "missing" };
        }
        const reportedAccountId = target.rows[0].id;
        if (reportedAccountId === reporterAccountId) {
          await client.query("ROLLBACK");
          return { status: "self" };
        }
        const recent = await client.query(
          `SELECT id FROM elevenward.leaderboard_username_reports
           WHERE reporter_account_id=$1 AND reported_account_id=$2
             AND created_at >= now() - interval '30 days'`,
          [reporterAccountId, reportedAccountId]
        );
        if (recent.rowCount) {
          await client.query("ROLLBACK");
          return { status: "duplicate" };
        }
        await client.query(
          `INSERT INTO elevenward.leaderboard_username_reports
             (reporter_account_id, reported_account_id, reason) VALUES ($1,$2,$3)`,
          [reporterAccountId, reportedAccountId, reason]
        );
        await client.query("COMMIT");
        return { status: "created" };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getUsernameReports({ status = "new", limit = 50 } = {}) {
      const result = await requirePool().query(
        `SELECT r.id, r.reason, r.status, r.created_at, r.updated_at,
                target.public_profile_id, target.public_username, target.username_suspended_at
         FROM elevenward.leaderboard_username_reports r
         JOIN elevenward.accounts target ON target.id=r.reported_account_id
         WHERE r.status=$1 ORDER BY r.created_at ASC LIMIT $2`,
        [status, limit]
      );
      return result.rows;
    },

    async resolveUsernameReport(reportId, action) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const report = await client.query(
          `SELECT reported_account_id FROM elevenward.leaderboard_username_reports
           WHERE id=$1 FOR UPDATE`, [reportId]
        );
        if (!report.rowCount) {
          await client.query("ROLLBACK");
          return null;
        }
        if (action === "suspend" || action === "restore") {
          await client.query(
            `UPDATE elevenward.accounts
             SET username_suspended_at=CASE WHEN $2 THEN now() ELSE NULL END, updated_at=now()
             WHERE id=$1`, [report.rows[0].reported_account_id, action === "suspend"]
          );
        }
        const updated = await client.query(
          `UPDATE elevenward.leaderboard_username_reports
           SET status=$2, updated_at=now() WHERE id=$1 RETURNING id, status, updated_at`,
          [reportId, action === "suspend" ? "actioned" : "dismissed"]
        );
        await client.query("COMMIT");
        return updated.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getAccountIdentities(accountId) {
      const result = await requirePool().query(
        `SELECT provider, provider_subject, verified_email, apple_refresh_token_ciphertext
         FROM elevenward.auth_identities WHERE account_id = $1`,
        [accountId]
      );
      return result.rows;
    },

    async getCareerSlots(accountId) {
      const result = await requirePool().query(
        `SELECT slot_index, snapshot, checksum, revision, client_updated_at, server_updated_at
         FROM elevenward.career_slots WHERE account_id = $1 ORDER BY slot_index`,
        [accountId]
      );
      return result.rows.map(slotResponse);
    },

    async syncCareer(accountId, request) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const sharingEnabled = await accountSharingEnabled(client, accountId);
        const replay = await client.query(
          `SELECT request_hash, response_status, response_body FROM elevenward.idempotency_keys
           WHERE account_id = $1 AND idempotency_key = $2 AND expires_at > now()`,
          [accountId, request.idempotencyKey]
        );
        if (replay.rowCount) {
          if (replay.rows[0].request_hash !== request.requestHash) {
            const error = new Error("Idempotency key was reused for a different request");
            error.code = "IDEMPOTENCY_MISMATCH";
            throw error;
          }
          await client.query("COMMIT");
          return { replay: true, status: replay.rows[0].response_status, body: replay.rows[0].response_body };
        }

        const pending = await client.query(
          `SELECT * FROM elevenward.sync_conflicts
           WHERE account_id = $1 AND slot_index = $2 AND status = 'pending' FOR UPDATE`,
          [accountId, request.slotIndex]
        );
        if (pending.rowCount) {
          const body = { conflict: conflictResponse(pending.rows[0]) };
          await client.query(
            `INSERT INTO elevenward.idempotency_keys
               (account_id, idempotency_key, request_hash, response_status, response_body)
             VALUES ($1,$2,$3,409,$4::jsonb)`,
            [accountId, request.idempotencyKey, request.requestHash, JSON.stringify(body)]
          );
          await client.query("COMMIT");
          return { status: 409, body };
        }

        const currentResult = await client.query(
          `SELECT * FROM elevenward.career_slots
           WHERE account_id = $1 AND slot_index = $2 FOR UPDATE`,
          [accountId, request.slotIndex]
        );
        const current = currentResult.rows[0];
        if ((current && Number(current.revision) !== request.baseRevision) || (!current && request.baseRevision !== 0)) {
          const conflictResult = await client.query(
            `INSERT INTO elevenward.sync_conflicts
               (account_id, slot_index, base_revision, remote_revision, local_snapshot, remote_snapshot)
             VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
             RETURNING *`,
            [accountId, request.slotIndex, request.baseRevision, Number(current?.revision ?? 0),
              JSON.stringify(request.snapshot), JSON.stringify(current?.snapshot ?? null)]
          );
          const body = { conflict: conflictResponse(conflictResult.rows[0]) };
          await client.query(
            `INSERT INTO elevenward.idempotency_keys
               (account_id, idempotency_key, request_hash, response_status, response_body)
             VALUES ($1,$2,$3,409,$4::jsonb)`,
            [accountId, request.idempotencyKey, request.requestHash, JSON.stringify(body)]
          );
          await client.query("COMMIT");
          return { status: 409, body };
        }

        const revision = Number(current?.revision ?? 0) + 1;
        const saved = await client.query(
          `INSERT INTO elevenward.career_slots
             (account_id, slot_index, career_id, schema_version, rules_version, content_version,
              position, difficulty, seed, checksum, snapshot, revision, client_updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
           ON CONFLICT (account_id, slot_index) DO UPDATE SET
             career_id = EXCLUDED.career_id,
             schema_version = EXCLUDED.schema_version,
             rules_version = EXCLUDED.rules_version,
             content_version = EXCLUDED.content_version,
             position = EXCLUDED.position,
             difficulty = EXCLUDED.difficulty,
             seed = EXCLUDED.seed,
             checksum = EXCLUDED.checksum,
             snapshot = EXCLUDED.snapshot,
             revision = EXCLUDED.revision,
             client_updated_at = EXCLUDED.client_updated_at,
             server_updated_at = now()
           RETURNING slot_index, snapshot, checksum, revision, client_updated_at, server_updated_at`,
          [accountId, request.slotIndex, request.careerId, request.schemaVersion, request.rulesVersion,
            request.contentVersion, request.position, request.difficulty, request.seed, request.checksum,
            JSON.stringify(request.snapshot), revision, request.updatedAt]
        );
        const projected = request.publishLeaderboard && sharingEnabled
          ? leaderboardSubmissionFromSync(request) : null;
        const body = { slot: slotResponse(saved.rows[0]), leaderboardPublished: Boolean(projected) };
        if (current && current.career_id !== request.careerId) {
          await replaceLeaderboardSubmission(client, accountId, current.career_id, null);
        }
        await replaceLeaderboardSubmission(
          client, accountId, request.careerId, projected
        );
        await client.query(
          `INSERT INTO elevenward.idempotency_keys
             (account_id, idempotency_key, request_hash, response_status, response_body)
           VALUES ($1,$2,$3,200,$4::jsonb)`,
          [accountId, request.idempotencyKey, request.requestHash, JSON.stringify(body)]
        );
        await client.query("COMMIT");
        return { status: 200, body };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listConflicts(accountId, slotIndex) {
      const result = await requirePool().query(
        `SELECT * FROM elevenward.sync_conflicts
         WHERE account_id = $1 AND slot_index = $2 ORDER BY created_at DESC`,
        [accountId, slotIndex]
      );
      return result.rows.map(conflictResponse);
    },

    async resolveConflict(accountId, slotIndex, conflictId, choice, publishLeaderboard, metadataForSnapshot, latestLocalSnapshot, expectedRemoteRevision = null) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const sharingEnabled = await accountSharingEnabled(client, accountId);
        const result = await client.query(
          `SELECT * FROM elevenward.sync_conflicts
           WHERE id = $1 AND account_id = $2 AND slot_index = $3 AND status = 'pending' FOR UPDATE`,
          [conflictId, accountId, slotIndex]
        );
        if (!result.rowCount) {
          await client.query("ROLLBACK");
          return undefined;
        }
        const conflict = result.rows[0];
        const existing = await client.query(
          "SELECT career_id, revision, checksum FROM elevenward.career_slots WHERE account_id=$1 AND slot_index=$2 FOR UPDATE",
          [accountId, slotIndex]
        );
        const currentRevision = Number(existing.rows[0]?.revision ?? 0);
        const unchangedRemote = existing.rows[0]
          ? conflict.remote_snapshot != null && existing.rows[0].checksum === sha256(conflict.remote_snapshot)
          : conflict.remote_snapshot == null;
        if (!unchangedRemote || currentRevision !== Number(conflict.remote_revision) ||
            (expectedRemoteRevision != null && expectedRemoteRevision !== currentRevision)) {
          const error = new Error("Cloud career changed since this conflict was shown");
          error.code = "CONFLICT_REMOTE_CHANGED";
          throw error;
        }
        let selectedLocal = conflict.local_snapshot;
        if (latestLocalSnapshot !== undefined) {
          const original = metadataForSnapshot(conflict.local_snapshot);
          const latest = metadataForSnapshot(latestLocalSnapshot);
          if (choice !== "local" || !original || !latest || expectedRemoteRevision == null ||
              ["careerId", "rulesVersion", "contentVersion", "position", "difficulty"].some(key => original[key] !== latest[key]) ||
              latest.schemaVersion < original.schemaVersion ||
              latest.snapshot.revision < original.snapshot.revision ||
              Number(latest.snapshot.season ?? 0) < Number(original.snapshot.season ?? 0) ||
              ["appearances", "goals", "assists"].some(key => Number(latest.snapshot.player?.[key] ?? 0) < Number(original.snapshot.player?.[key] ?? 0)) ||
              (latest.snapshot.seasonHistory?.length ?? 0) < (original.snapshot.seasonHistory?.length ?? 0)) {
            const error = new Error("Latest local career does not descend from the conflict career");
            error.code = "CONFLICT_LOCAL_MISMATCH";
            throw error;
          }
          selectedLocal = latestLocalSnapshot;
        }
        if (choice === "local") {
          if (selectedLocal == null) {
            await client.query(
              "DELETE FROM elevenward.career_slots WHERE account_id=$1 AND slot_index=$2",
              [accountId, slotIndex]
            );
          } else {
            const local = metadataForSnapshot(selectedLocal);
            if (!local) throw new Error("Conflict contains an invalid local snapshot");
            await client.query(
            `INSERT INTO elevenward.career_slots
               (account_id, slot_index, career_id, schema_version, rules_version, content_version,
                position, difficulty, seed, checksum, snapshot, revision, client_updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
             ON CONFLICT (account_id, slot_index) DO UPDATE SET
               career_id=EXCLUDED.career_id, schema_version=EXCLUDED.schema_version,
               rules_version=EXCLUDED.rules_version, content_version=EXCLUDED.content_version,
               position=EXCLUDED.position, difficulty=EXCLUDED.difficulty, seed=EXCLUDED.seed,
               checksum=EXCLUDED.checksum, snapshot=EXCLUDED.snapshot,
               revision=EXCLUDED.revision, client_updated_at=EXCLUDED.client_updated_at,
               server_updated_at=now()`,
            [accountId, slotIndex, local.careerId, local.schemaVersion, local.rulesVersion,
              local.contentVersion, local.position, local.difficulty, local.seed, local.checksum,
              JSON.stringify(local.snapshot), Number(conflict.remote_revision) + 1, local.updatedAt]
            );
          }
        }
        await client.query(
          `UPDATE elevenward.sync_conflicts SET status='resolved', resolution=$4, resolved_at=now()
           WHERE id=$1 AND account_id=$2 AND slot_index=$3`,
          [conflictId, accountId, slotIndex, choice]
        );
        const slot = await client.query(
          `SELECT slot_index, career_id, position, difficulty, rules_version, seed,
                  snapshot, checksum, revision, client_updated_at, server_updated_at
           FROM elevenward.career_slots WHERE account_id=$1 AND slot_index=$2`,
          [accountId, slotIndex]
        );
        if (existing.rows[0] && existing.rows[0].career_id !== slot.rows[0]?.career_id) {
          await replaceLeaderboardSubmission(client, accountId, existing.rows[0].career_id, null);
        }
        if (slot.rows[0]) {
          const row = slot.rows[0];
          const sync = {
            careerId: row.career_id, position: row.position, difficulty: row.difficulty,
            rulesVersion: row.rules_version, seed: Number(row.seed), checksum: row.checksum,
            snapshot: row.snapshot
          };
          await replaceLeaderboardSubmission(
            client, accountId, row.career_id,
            publishLeaderboard && sharingEnabled ? leaderboardSubmissionFromSync(sync) : null
          );
        }
        await client.query("COMMIT");
        return slotResponse(slot.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteCareerSlot(accountId, slotIndex, baseRevision) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        // Serialize career mutations per account before locking conflicts/slots.
        await client.query("SELECT id FROM elevenward.accounts WHERE id=$1 FOR UPDATE", [accountId]);
        const pending = await client.query(
          "SELECT * FROM elevenward.sync_conflicts WHERE account_id=$1 AND slot_index=$2 AND status='pending' FOR UPDATE",
          [accountId, slotIndex]
        );
        if (pending.rowCount) {
          await client.query("COMMIT");
          return { status: 409, body: { conflict: conflictResponse(pending.rows[0]) } };
        }
        const currentResult = await client.query(
          `SELECT * FROM elevenward.career_slots
           WHERE account_id=$1 AND slot_index=$2 FOR UPDATE`,
          [accountId, slotIndex]
        );
        const current = currentResult.rows[0];
        if (!current) {
          await client.query("COMMIT");
          return { status: 204, body: null };
        }
        if (Number(current.revision) !== baseRevision) {
          const conflictResult = await client.query(
            `INSERT INTO elevenward.sync_conflicts
               (account_id, slot_index, base_revision, remote_revision, local_snapshot, remote_snapshot)
             VALUES ($1,$2,$3,$4,'null'::jsonb,$5::jsonb)
             ON CONFLICT (account_id, slot_index) WHERE status='pending'
             DO UPDATE SET base_revision=EXCLUDED.base_revision,
               remote_revision=EXCLUDED.remote_revision,
               local_snapshot=EXCLUDED.local_snapshot,
               remote_snapshot=EXCLUDED.remote_snapshot,
               created_at=now()
             RETURNING *`,
            [accountId, slotIndex, baseRevision, Number(current.revision), JSON.stringify(current.snapshot)]
          );
          const body = { conflict: conflictResponse(conflictResult.rows[0]) };
          await client.query("COMMIT");
          return { status: 409, body };
        }
        await client.query(
          "DELETE FROM elevenward.career_slots WHERE account_id=$1 AND slot_index=$2",
          [accountId, slotIndex]
        );
        await replaceLeaderboardSubmission(client, accountId, current.career_id, null);
        await client.query("COMMIT");
        return { status: 204, body: null };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async upsertLeaderboardSubmission(accountId, submission) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        if (!await accountSharingEnabled(client, accountId)) {
          await client.query("ROLLBACK");
          return { status: "disabled" };
        }
        const owned = await client.query(
          `SELECT career_id, position, difficulty, rules_version, seed, checksum, snapshot
           FROM elevenward.career_slots WHERE account_id=$1 AND career_id=$2 FOR UPDATE`,
          [accountId, submission.careerId]
        );
        if (!owned.rowCount) {
          await client.query("ROLLBACK");
          return { status: "missing" };
        }
        const row = owned.rows[0];
        if (row.position !== submission.position || row.difficulty !== submission.difficulty ||
            row.rules_version !== submission.rulesVersion) {
          await client.query("ROLLBACK");
          return { status: "stale" };
        }
        const projected = leaderboardSubmissionFromSync({
          careerId: row.career_id, position: row.position, difficulty: row.difficulty,
          rulesVersion: row.rules_version, seed: Number(row.seed), checksum: row.checksum,
          snapshot: row.snapshot
        });
        if (!projected) {
          await client.query("ROLLBACK");
          return { status: "invalid" };
        }
        await replaceLeaderboardSubmission(client, accountId, row.career_id, projected);
        await client.query("COMMIT");
        return { status: "accepted" };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getLeaderboard({ position, difficulty, rulesVersion, limit }) {
      const result = await requirePool().query(
        `SELECT CASE
                  WHEN a.public_username IS NOT NULL AND a.username_suspended_at IS NULL
                    THEN a.public_username
                  ELSE s.position || ' Player ' || upper(substring(
                    encode(digest(s.account_id::text || ':' || s.career_id, 'sha256'), 'hex')
                    FROM 1 FOR 6))
                END AS alias,
                a.public_profile_id, a.id AS account_id, TRUE AS reportable,
                s.career_id, s.position, s.legacy_score, s.aggregate_metrics, s.updated_at
         FROM elevenward.leaderboard_submissions s
         JOIN elevenward.accounts a ON a.id=s.account_id
         JOIN elevenward.career_slots c ON c.account_id=s.account_id AND c.career_id=s.career_id
         WHERE s.position=$1 AND s.difficulty=$2 AND s.rules_version=$3 AND s.accepted=true
           AND a.leaderboard_sharing_enabled=true
         ORDER BY s.legacy_score DESC, s.updated_at ASC, s.id ASC LIMIT $4`,
        [position, difficulty, rulesVersion, limit]
      );
      return result.rows;
    },

    async getEntitlements(accountId) {
      const result = await requirePool().query(
        `SELECT entitlement_id, product_id, source_store, transaction_id, state, purchased_at, updated_at
         FROM elevenward.entitlements WHERE account_id=$1 ORDER BY entitlement_id`,
        [accountId]
      );
      return result.rows;
    },

    async processRevenueCatEvent(event, payloadChecksum) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const receipt = await client.query(
          `INSERT INTO elevenward.webhook_receipts (event_id, event_type, payload_checksum)
           VALUES ($1,$2,$3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
          [event.eventId, event.eventType, payloadChecksum]
        );
        if (!receipt.rowCount) {
          await client.query("COMMIT");
          return { duplicate: true };
        }
        await client.query(
          `INSERT INTO elevenward.entitlements
             (account_id, entitlement_id, product_id, source_store, transaction_id, state, purchased_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (account_id, entitlement_id) DO UPDATE SET
             product_id=EXCLUDED.product_id, source_store=EXCLUDED.source_store,
             transaction_id=EXCLUDED.transaction_id, state=EXCLUDED.state,
             purchased_at=COALESCE(EXCLUDED.purchased_at, elevenward.entitlements.purchased_at),
             updated_at=now()`,
          [event.accountId, event.entitlementId, event.productId, event.sourceStore,
            event.transactionId, event.state, event.purchasedAt]
        );
        await client.query(
          "UPDATE elevenward.webhook_receipts SET processed_at=now() WHERE event_id=$1",
          [event.eventId]
        );
        await client.query("COMMIT");
        return { duplicate: false };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async setAnalyticsConsent(accountId, consent) {
      const result = await requirePool().query(
        `INSERT INTO elevenward.analytics_consents (account_id, state, policy_version)
         VALUES ($1,$2,$3) ON CONFLICT (account_id) DO UPDATE SET
           state=EXCLUDED.state, policy_version=EXCLUDED.policy_version, updated_at=now()
         RETURNING state, policy_version, updated_at`,
        [accountId, consent.state, consent.policyVersion]
      );
      return result.rows[0];
    },

    async insertAnalyticsEvents(accountId, events) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const consent = await client.query(
          "SELECT state FROM elevenward.analytics_consents WHERE account_id=$1",
          [accountId]
        );
        if (consent.rows[0]?.state !== "granted") {
          await client.query("COMMIT");
          return { consent: false, accepted: 0 };
        }
        let accepted = 0;
        for (const event of events) {
          const result = await client.query(
            `INSERT INTO elevenward.analytics_events
               (account_id, event_id, event_name, occurred_at, properties)
             VALUES ($1,$2,$3,$4,$5::jsonb)
             ON CONFLICT (account_id, event_id) DO NOTHING`,
            [accountId, event.eventId, event.eventName, event.occurredAt, JSON.stringify(event.properties)]
          );
          accepted += result.rowCount;
        }
        await client.query("COMMIT");
        return { consent: true, accepted };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async createDeletionChallenge(accountId, codeHash, expiresAt) {
      await requirePool().query(
        "DELETE FROM elevenward.deletion_challenges WHERE account_id=$1 OR expires_at <= now()",
        [accountId]
      );
      const result = await requirePool().query(
        `INSERT INTO elevenward.deletion_challenges (account_id, code_hash, expires_at)
         VALUES ($1,$2,$3) RETURNING id, expires_at`,
        [accountId, codeHash, expiresAt]
      );
      return result.rows[0];
    },

    async verifyDeletionChallenge(accountId, codeHash) {
      const result = await requirePool().query(
        `SELECT 1 FROM elevenward.deletion_challenges
         WHERE account_id=$1 AND code_hash=$2 AND used_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1`,
        [accountId, codeHash]
      );
      return result.rowCount > 0;
    },

    async confirmDeletion(accountId, codeHash, accountIdHash) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const challenge = await client.query(
          `SELECT id FROM elevenward.deletion_challenges
           WHERE account_id=$1 AND code_hash=$2 AND used_at IS NULL AND expires_at > now()
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [accountId, codeHash]
        );
        if (!challenge.rowCount) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query(
          "INSERT INTO elevenward.deletion_audits (account_id_hash, method) VALUES ($1,'web')",
          [accountIdHash]
        );
        await client.query("DELETE FROM elevenward.accounts WHERE id=$1", [accountId]);
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteAccount(accountId, accountIdHash) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO elevenward.deletion_audits (account_id_hash, method) VALUES ($1,'app')",
          [accountIdHash]
        );
        await client.query("DELETE FROM elevenward.accounts WHERE id=$1", [accountId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async createContentRelease(release) {
      const result = await requirePool().query(
        `INSERT INTO elevenward.content_releases
           (release_version, min_client_version, max_client_version, checksum, locales,
            object_key, public_url, signature, manifest, validation_report)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)
         RETURNING *`,
        [release.releaseVersion, release.minClientVersion, release.maxClientVersion,
          release.checksum, release.locales, release.objectKey, release.publicUrl,
          release.signature, JSON.stringify(release.manifest), JSON.stringify(release.validationReport)]
      );
      return result.rows[0];
    },

    async publishContentRelease(releaseVersion) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const target = await client.query(
          "SELECT id FROM elevenward.content_releases WHERE release_version=$1 FOR UPDATE",
          [releaseVersion]
        );
        if (!target.rowCount) {
          await client.query("ROLLBACK");
          return null;
        }
        await client.query(
          `UPDATE elevenward.content_releases SET status='rolled_back', rolled_back_at=now()
           WHERE status='published' AND release_version<>$1`,
          [releaseVersion]
        );
        const result = await client.query(
          `UPDATE elevenward.content_releases SET status='published', published_at=now(), rolled_back_at=NULL
           WHERE release_version=$1 RETURNING *`,
          [releaseVersion]
        );
        await client.query("COMMIT");
        return result.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async rollbackContentRelease(releaseVersion) {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const target = await client.query(
          `SELECT id FROM elevenward.content_releases
           WHERE release_version=$1 AND published_at IS NOT NULL FOR UPDATE`,
          [releaseVersion]
        );
        if (!target.rowCount) {
          await client.query("ROLLBACK");
          return null;
        }
        await client.query(
          `UPDATE elevenward.content_releases SET status='rolled_back', rolled_back_at=now()
           WHERE status='published' AND release_version<>$1`,
          [releaseVersion]
        );
        const result = await client.query(
          `UPDATE elevenward.content_releases
           SET status='published', published_at=now(), rolled_back_at=NULL
           WHERE release_version=$1 RETURNING *`,
          [releaseVersion]
        );
        await client.query("COMMIT");
        return result.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getContentManifest(releaseVersion = null) {
      const params = releaseVersion ? [releaseVersion] : [];
      const where = releaseVersion ? "release_version=$1" : "status='published'";
      const result = await requirePool().query(
        `SELECT * FROM elevenward.content_releases WHERE ${where}
         ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 1`,
        params
      );
      return result.rows[0] ?? null;
    },

    async listContentReleases() {
      const result = await requirePool().query(
        `SELECT release_version, min_client_version, max_client_version, checksum, locales,
                object_key, public_url, signature, manifest, validation_report, status,
                created_at, published_at, rolled_back_at
         FROM elevenward.content_releases ORDER BY created_at DESC LIMIT 100`
      );
      return result.rows;
    },

    async recordStaffAction({ actorHash, action, resourceType, resourceId, metadata = {} }) {
      await requirePool().query(
        `INSERT INTO elevenward.staff_actions
           (actor_hash, action, resource_type, resource_id, metadata)
         VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [actorHash, action, resourceType, resourceId, JSON.stringify(metadata)]
      );
    },

    async getOperationalSummary() {
      const result = await requirePool().query(
        `SELECT
           (SELECT count(*)::int FROM elevenward.accounts) AS accounts,
           (SELECT count(*)::int FROM elevenward.sessions
             WHERE revoked_at IS NULL AND expires_at > now()) AS active_sessions,
           (SELECT count(*)::int FROM elevenward.career_slots) AS career_slots,
           (SELECT count(*)::int FROM elevenward.sync_conflicts
             WHERE status='pending') AS pending_conflicts,
           (SELECT count(*)::int FROM elevenward.entitlements
             WHERE state='active') AS active_entitlements,
           (SELECT count(*)::int FROM elevenward.analytics_events
             WHERE occurred_at > now()-interval '24 hours') AS analytics_events_24h,
           (SELECT count(*)::int FROM elevenward.webhook_receipts
             WHERE processed_at IS NULL) AS unprocessed_webhooks,
           (SELECT release_version FROM elevenward.content_releases
             WHERE status='published' ORDER BY published_at DESC LIMIT 1) AS published_release`
      );
      const row = result.rows[0];
      return {
        accounts: Number(row.accounts),
        activeSessions: Number(row.active_sessions),
        careerSlots: Number(row.career_slots),
        pendingConflicts: Number(row.pending_conflicts),
        activeEntitlements: Number(row.active_entitlements),
        analyticsEvents24h: Number(row.analytics_events_24h),
        unprocessedWebhooks: Number(row.unprocessed_webhooks),
        publishedRelease: row.published_release ?? null
      };
    },

    async listStaffActions(limit = 25) {
      const result = await requirePool().query(
        `SELECT action, resource_type, resource_id, metadata, created_at
         FROM elevenward.staff_actions ORDER BY created_at DESC LIMIT $1`,
        [Math.min(Math.max(Number(limit) || 25, 1), 100)]
      );
      return result.rows.map((row) => ({
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        metadata: row.metadata,
        createdAt: new Date(row.created_at).toISOString()
      }));
    },

    async purgeExpiredData() {
      if (!pool) return { sessions: 0, idempotencyKeys: 0, analyticsEvents: 0, deletionChallenges: 0, staffActions: 0 };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const sessions = await client.query(
          "DELETE FROM elevenward.sessions WHERE expires_at < now() OR revoked_at < now()-interval '30 days'"
        );
        const keys = await client.query("DELETE FROM elevenward.idempotency_keys WHERE expires_at < now()");
        const events = await client.query("DELETE FROM elevenward.analytics_events WHERE occurred_at < now()-interval '13 months'");
        const challenges = await client.query("DELETE FROM elevenward.deletion_challenges WHERE expires_at < now()");
        const staffActions = await client.query("DELETE FROM elevenward.staff_actions WHERE created_at < now()-interval '24 months'");
        await client.query("COMMIT");
        return { sessions: sessions.rowCount, idempotencyKeys: keys.rowCount, analyticsEvents: events.rowCount, deletionChallenges: challenges.rowCount, staffActions: staffActions.rowCount };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async close() {
      if (pool) await pool.end();
    }
  };
}
