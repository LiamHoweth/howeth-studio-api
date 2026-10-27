import pg from "pg";

const { Pool } = pg;

function verifiedLegacyScore(career) {
  return Math.max(0, Math.round(
    career.overall * 1.2 + career.touchdowns * 0.9 + career.yards * 0.02 +
    career.championships * 55 + Math.log10(Math.max(1, career.followers)) * 25
  ));
}

function progressionRejection(existing, career) {
  if (!existing) return null;
  if (career.clientUpdatedAt < new Date(existing.client_updated_at).toISOString()) return "stale_snapshot";
  if (career.careerYear < existing.career_year || career.gamesPlayed < existing.games_played) return "career_progress_reversed";
  if (career.yards < existing.yards || career.touchdowns < existing.touchdowns || career.championships < existing.championships) return "career_totals_reversed";
  const addedGames = career.gamesPlayed - existing.games_played;
  if (career.yards - existing.yards > addedGames * 650) return "yards_jump_exceeds_games";
  if (career.touchdowns - existing.touchdowns > addedGames * 10) return "touchdown_jump_exceeds_games";
  if (career.championships - existing.championships > Math.max(1, career.careerYear - existing.career_year)) return "championship_jump_exceeds_years";
  if (career.overall - existing.overall > Math.max(20, addedGames * 2)) return "overall_jump_implausible";
  return null;
}

export function incomingCloudSaveWins(currentUpdatedAt, incomingUpdatedAt) {
  if (!currentUpdatedAt) return true;
  return new Date(incomingUpdatedAt).getTime() > new Date(currentUpdatedAt).getTime();
}

export function createDatabase(connectionString = process.env.DATABASE_URL) {
  const pool = connectionString ? new Pool({ connectionString }) : null;

  return {
    configured: Boolean(pool),

    async ping() {
      if (!pool) return false;
      await pool.query("SELECT 1");
      return true;
    },

    async createInstallation({ tokenHash, platform, appVersion }) {
      const result = await pool.query(
        `INSERT INTO installations (token_hash, platform, app_version)
         VALUES ($1, $2, $3)
         RETURNING id, created_at`,
        [tokenHash, platform, appVersion]
      );
      return result.rows[0];
    },

    async findInstallationByTokenHash(tokenHash, appVersion) {
      const result = await pool.query(
        `UPDATE installations
         SET last_seen_at = now(), app_version = COALESCE($2, app_version)
         WHERE token_hash = $1
         RETURNING id, platform, app_version`,
        [tokenHash, appVersion]
      );
      return result.rows[0] ?? null;
    },

    async createAccountSession({ identity, tokenHash, expiresAt }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          `SELECT account_id, verified_email FROM auth_identities
           WHERE provider = $1 AND provider_subject = $2 FOR UPDATE`,
          [identity.provider, identity.subject]
        );
        let accountId = existing.rows[0]?.account_id;
        let verifiedEmail = identity.email ?? existing.rows[0]?.verified_email ?? null;
        if (!accountId) {
          const account = await client.query("INSERT INTO accounts DEFAULT VALUES RETURNING id");
          accountId = account.rows[0].id;
          await client.query(
            `INSERT INTO auth_identities
               (account_id, provider, provider_subject, verified_email, apple_refresh_token_ciphertext)
             VALUES ($1,$2,$3,$4,$5)`,
            [accountId, identity.provider, identity.subject, identity.email, identity.refreshTokenCiphertext]
          );
        } else {
          const updatedIdentity = await client.query(
            `UPDATE auth_identities SET
               verified_email = COALESCE($3, verified_email),
               apple_refresh_token_ciphertext = COALESCE($4, apple_refresh_token_ciphertext),
               last_login_at = now()
             WHERE provider = $1 AND provider_subject = $2
             RETURNING verified_email`,
            [identity.provider, identity.subject, identity.email, identity.refreshTokenCiphertext]
          );
          verifiedEmail = updatedIdentity.rows[0]?.verified_email ?? verifiedEmail;
        }
        await client.query(
          `INSERT INTO account_sessions (account_id, token_hash, expires_at)
           VALUES ($1,$2,$3)`,
          [accountId, tokenHash, expiresAt]
        );
        const profile = await client.query(
          `UPDATE accounts SET updated_at = now() WHERE id = $1
           RETURNING public_profile_id, public_username, username_updated_at, username_suspended_at`,
          [accountId]
        );
        await client.query("COMMIT");
        return { id: accountId, provider: identity.provider, email: verifiedEmail, ...profile.rows[0] };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async findAccountBySessionTokenHash(tokenHash) {
      const result = await pool.query(
        `WITH active_session AS (
           UPDATE account_sessions
           SET last_seen_at = now(), expires_at = now() + interval '90 days'
           WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
           RETURNING account_id, expires_at
         )
         SELECT a.id, a.public_profile_id, a.public_username, a.username_updated_at,
                a.username_suspended_at, ai.provider, ai.verified_email, s.expires_at
         FROM active_session s
         JOIN accounts a ON a.id = s.account_id
         JOIN auth_identities ai ON ai.account_id = a.id`,
        [tokenHash]
      );
      return result.rows[0] ?? null;
    },

    async revokeAccountSession(tokenHash) {
      await pool.query(
        "UPDATE account_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
        [tokenHash]
      );
    },

    async getAccountIdentities(accountId) {
      const result = await pool.query(
        `SELECT provider, provider_subject, verified_email, apple_refresh_token_ciphertext
         FROM auth_identities WHERE account_id = $1`,
        [accountId]
      );
      return result.rows;
    },

    async deleteAccount(accountId) {
      await pool.query("DELETE FROM accounts WHERE id = $1", [accountId]);
    },

    async setPublicUsername(accountId, username, normalized) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query(
          `SELECT public_username, username_updated_at, username_suspended_at
           FROM accounts WHERE id = $1 FOR UPDATE`,
          [accountId]
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
          `UPDATE accounts SET public_username = $2, public_username_normalized = $3,
             username_updated_at = now(), updated_at = now()
           WHERE id = $1
           RETURNING public_profile_id, public_username, username_updated_at, username_suspended_at`,
          [accountId, username, normalized]
        );
        await client.query(
          "UPDATE account_career_snapshots SET display_name = $2, updated_at = now() WHERE account_id = $1",
          [accountId, username]
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

    async createFeedback(feedback) {
      const result = await pool.query(
        `INSERT INTO feedback_submissions
           (id, category, message, contact_email, source, platform, app_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO NOTHING
         RETURNING id, created_at`,
        [feedback.submissionId, feedback.category, feedback.message, feedback.contactEmail,
          feedback.source, feedback.platform, feedback.appVersion]
      );
      return result.rows[0] ?? null;
    },

    async getFeedback({ status = null, limit = 50 } = {}) {
      const params = status ? [status, limit] : [limit];
      const where = status ? "WHERE status = $1" : "";
      const limitParam = status ? "$2" : "$1";
      const result = await pool.query(
        `SELECT id, category, message, contact_email, source, platform, app_version,
                status, created_at, updated_at
         FROM feedback_submissions ${where}
         ORDER BY created_at DESC LIMIT ${limitParam}`,
        params
      );
      return result.rows;
    },

    async getFeedbackSummary() {
      const result = await pool.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'new')::int AS unread
         FROM feedback_submissions`
      );
      return result.rows[0];
    },

    async updateFeedbackStatus(id, status) {
      const result = await pool.query(
        `UPDATE feedback_submissions SET status = $2, updated_at = now()
         WHERE id = $1 RETURNING id, status, updated_at`,
        [id, status]
      );
      return result.rows[0] ?? null;
    },

    async createUsernameReport(reporterAccountId, profileId, reason) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const target = await client.query(
          `SELECT id FROM accounts
           WHERE public_profile_id = $1
           FOR UPDATE`,
          [profileId]
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
          `SELECT id FROM leaderboard_username_reports
           WHERE reporter_account_id = $1 AND reported_account_id = $2
             AND created_at >= now() - interval '30 days'`,
          [reporterAccountId, reportedAccountId]
        );
        if (recent.rowCount) {
          await client.query("ROLLBACK");
          return { status: "duplicate" };
        }
        const result = await client.query(
          `INSERT INTO leaderboard_username_reports
             (reporter_account_id, reported_account_id, reason)
           VALUES ($1,$2,$3) RETURNING id, created_at`,
          [reporterAccountId, reportedAccountId, reason]
        );
        await client.query("COMMIT");
        return { status: "created", report: result.rows[0] };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getUsernameReports({ status = "new", limit = 50 } = {}) {
      const result = await pool.query(
        `SELECT r.id, r.reason, r.status, r.created_at, r.updated_at,
                target.public_profile_id, target.public_username,
                target.username_suspended_at
         FROM leaderboard_username_reports r
         JOIN accounts target ON target.id = r.reported_account_id
         WHERE r.status = $1
         ORDER BY r.created_at ASC LIMIT $2`,
        [status, limit]
      );
      return result.rows;
    },

    async resolveUsernameReport(reportId, action) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const report = await client.query(
          "SELECT reported_account_id FROM leaderboard_username_reports WHERE id = $1 FOR UPDATE",
          [reportId]
        );
        if (!report.rowCount) {
          await client.query("ROLLBACK");
          return null;
        }
        if (action === "suspend") {
          await client.query(
            `UPDATE accounts SET username_suspended_at = now(), updated_at = now()
             WHERE id = $1`,
            [report.rows[0].reported_account_id]
          );
        } else if (action === "restore") {
          await client.query(
            `UPDATE accounts SET username_suspended_at = NULL, updated_at = now()
             WHERE id = $1`,
            [report.rows[0].reported_account_id]
          );
        }
        const updated = await client.query(
          `UPDATE leaderboard_username_reports
           SET status = $2, updated_at = now() WHERE id = $1
           RETURNING id, status, updated_at`,
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

    async getCloudSaveSlots(accountId) {
      const result = await pool.query(
        `SELECT slot_index, save_version, is_occupied, payload, client_updated_at, revision, server_updated_at
         FROM cloud_save_slots WHERE account_id = $1 ORDER BY slot_index`,
        [accountId]
      );
      return result.rows;
    },

    async syncCloudSaveSlots(accountId, slots) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const slot of slots) {
          const current = await client.query(
            `SELECT client_updated_at FROM cloud_save_slots
             WHERE account_id = $1 AND slot_index = $2 FOR UPDATE`,
            [accountId, slot.slotIndex]
          );
          if (!incomingCloudSaveWins(current.rows[0]?.client_updated_at, slot.updatedAt)) continue;
          await client.query(
            `INSERT INTO cloud_save_slots
               (account_id, slot_index, save_version, is_occupied, payload, client_updated_at)
             VALUES ($1,$2,$3,$4,$5::jsonb,$6)
             ON CONFLICT (account_id, slot_index) DO UPDATE SET
               save_version = EXCLUDED.save_version,
               is_occupied = EXCLUDED.is_occupied,
               payload = EXCLUDED.payload,
               client_updated_at = EXCLUDED.client_updated_at,
               revision = cloud_save_slots.revision + 1,
               server_updated_at = now()`,
            [accountId, slot.slotIndex, slot.saveVersion, slot.isOccupied, JSON.stringify(slot.payload), slot.updatedAt]
          );
        }
        const result = await client.query(
          `SELECT slot_index, save_version, is_occupied, payload, client_updated_at, revision, server_updated_at
           FROM cloud_save_slots WHERE account_id = $1 ORDER BY slot_index`,
          [accountId]
        );
        await client.query("COMMIT");
        return result.rows;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async insertEvents(installationId, events) {
      const client = await pool.connect();
      let inserted = 0;
      try {
        await client.query("BEGIN");
        for (const event of events) {
          const result = await client.query(
            `INSERT INTO analytics_events
               (installation_id, event_id, event_name, occurred_at, properties)
             VALUES ($1, $2, $3, $4, $5::jsonb)
             ON CONFLICT (installation_id, event_id) DO NOTHING`,
            [installationId, event.eventId, event.eventName, event.occurredAt, JSON.stringify(event.properties)]
          );
          inserted += result.rowCount;
        }
        await client.query("COMMIT");
        return inserted;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async recordRejectedCareer(installationId, careerId, reason, career = {}) {
      await pool.query(
        `INSERT INTO leaderboard_submission_audits (
           installation_id, career_id, reason, games_played, yards, touchdowns,
           championships, overall, legacy_score
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [installationId, careerId, reason, career.gamesPlayed ?? null, career.yards ?? null,
          career.touchdowns ?? null, career.championships ?? null, career.overall ?? null,
          career.legacyScore ?? null]
      );
    },

    async upsertCareer(installationId, career) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query(
          `SELECT career_year, games_played, yards, touchdowns, championships, overall, client_updated_at
           FROM career_snapshots WHERE installation_id = $1 AND career_id = $2 FOR UPDATE`,
          [installationId, career.careerId]
        );
        const reason = progressionRejection(current.rows[0], career);
        if (reason) {
          await client.query(
            `INSERT INTO leaderboard_submission_audits (
               installation_id, career_id, reason, games_played, yards, touchdowns,
               championships, overall, legacy_score
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [installationId, career.careerId, reason, career.gamesPlayed, career.yards,
              career.touchdowns, career.championships, career.overall, career.legacyScore]
          );
          await client.query("COMMIT");
          return { accepted: false, reason };
        }
        await client.query(
        `INSERT INTO career_snapshots (
           installation_id, career_id, display_name, leaderboard_opt_in, position, team_id,
           season_year, career_year, games_played, yards, touchdowns, championships,
           overall, followers, net_worth, legacy_score, verified_legacy_score, retired, client_updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
         )
         ON CONFLICT (installation_id, career_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           leaderboard_opt_in = EXCLUDED.leaderboard_opt_in,
           position = EXCLUDED.position,
           team_id = EXCLUDED.team_id,
           season_year = EXCLUDED.season_year,
           career_year = EXCLUDED.career_year,
           games_played = EXCLUDED.games_played,
           yards = EXCLUDED.yards,
           touchdowns = EXCLUDED.touchdowns,
           championships = EXCLUDED.championships,
           overall = EXCLUDED.overall,
           followers = EXCLUDED.followers,
           net_worth = EXCLUDED.net_worth,
           legacy_score = EXCLUDED.legacy_score,
           verified_legacy_score = EXCLUDED.verified_legacy_score,
           retired = EXCLUDED.retired,
           client_updated_at = EXCLUDED.client_updated_at,
           updated_at = now()
         WHERE career_snapshots.client_updated_at <= EXCLUDED.client_updated_at`,
        [
          installationId,
          career.careerId,
          career.displayName,
          career.leaderboardOptIn,
          career.position,
          career.teamId,
          career.seasonYear,
          career.careerYear,
          career.gamesPlayed,
          career.yards,
          career.touchdowns,
          career.championships,
          career.overall,
          career.followers,
          career.netWorth,
          career.legacyScore,
          verifiedLegacyScore(career),
          career.retired,
          career.clientUpdatedAt
        ]
      );
        await client.query("COMMIT");
        return { accepted: true };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteInstallation(installationId) {
      await pool.query("DELETE FROM installations WHERE id = $1", [installationId]);
    },

    async recordRejectedAccountCareer(accountId, careerId, reason, career = {}) {
      await pool.query(
        `INSERT INTO account_leaderboard_submission_audits (
           account_id, career_id, reason, games_played, yards, touchdowns,
           championships, overall, legacy_score
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [accountId, careerId, reason, career.gamesPlayed ?? null, career.yards ?? null,
          career.touchdowns ?? null, career.championships ?? null, career.overall ?? null,
          career.legacyScore ?? null]
      );
    },

    async upsertAccountCareer(accountId, career) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query(
          `SELECT career_year, games_played, yards, touchdowns, championships, overall, client_updated_at
           FROM account_career_snapshots WHERE account_id = $1 AND career_id = $2 FOR UPDATE`,
          [accountId, career.careerId]
        );
        const reason = progressionRejection(current.rows[0], career);
        if (reason) {
          await client.query(
            `INSERT INTO account_leaderboard_submission_audits (
               account_id, career_id, reason, games_played, yards, touchdowns,
               championships, overall, legacy_score
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [accountId, career.careerId, reason, career.gamesPlayed, career.yards,
              career.touchdowns, career.championships, career.overall, career.legacyScore]
          );
          await client.query("COMMIT");
          return { accepted: false, reason };
        }
        await client.query(
          `INSERT INTO account_career_snapshots (
             account_id, career_id, display_name, position, team_id, season_year, career_year,
             games_played, yards, touchdowns, championships, overall, followers, net_worth,
             legacy_score, verified_legacy_score, retired, client_updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (account_id, career_id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             position = EXCLUDED.position,
             team_id = EXCLUDED.team_id,
             season_year = EXCLUDED.season_year,
             career_year = EXCLUDED.career_year,
             games_played = EXCLUDED.games_played,
             yards = EXCLUDED.yards,
             touchdowns = EXCLUDED.touchdowns,
             championships = EXCLUDED.championships,
             overall = EXCLUDED.overall,
             followers = EXCLUDED.followers,
             net_worth = EXCLUDED.net_worth,
             legacy_score = EXCLUDED.legacy_score,
             verified_legacy_score = EXCLUDED.verified_legacy_score,
             retired = EXCLUDED.retired,
             client_updated_at = EXCLUDED.client_updated_at,
             updated_at = now()
           WHERE account_career_snapshots.client_updated_at <= EXCLUDED.client_updated_at`,
          [accountId, career.careerId, career.displayName, career.position, career.teamId,
            career.seasonYear, career.careerYear, career.gamesPlayed, career.yards,
            career.touchdowns, career.championships, career.overall, career.followers,
            career.netWorth, career.legacyScore, verifiedLegacyScore(career), career.retired,
            career.clientUpdatedAt]
        );
        await client.query("COMMIT");
        return { accepted: true };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteAccountCareer(accountId, careerId) {
      await pool.query(
        "DELETE FROM account_career_snapshots WHERE account_id = $1 AND career_id = $2",
        [accountId, careerId]
      );
    },

    async getAccountLeaderboard({ metric, position, limit }) {
      const metricColumn = {
        legacy_score: "verified_legacy_score",
        yards: "yards",
        touchdowns: "touchdowns",
        championships: "championships",
        overall: "overall",
        followers: "followers",
        net_worth: "net_worth"
      }[metric];
      const params = position ? [position, limit] : [limit];
      const positionFilter = position ? "WHERE c.position = $1" : "";
      const limitParam = position ? "$2" : "$1";
      const result = await pool.query(
        `SELECT CASE
                   WHEN a.public_username IS NOT NULL AND a.username_suspended_at IS NULL
                     THEN a.public_username
                   ELSE c.position || ' Player ' || upper(substring(
                     encode(digest(c.account_id::text || ':' || c.career_id, 'sha256'), 'hex')
                     FROM 1 FOR 6))
                END AS display_name,
                a.public_profile_id, a.id AS account_id,
                TRUE AS reportable,
                c.position, c.team_id, c.${metricColumn} AS score, c.updated_at
         FROM account_career_snapshots c
         JOIN accounts a ON a.id = c.account_id
         ${positionFilter}
         ORDER BY c.${metricColumn} DESC, c.updated_at ASC
         LIMIT ${limitParam}`,
        params
      );
      return result.rows;
    },

    async getLeaderboard({ metric, position, limit }) {
      const metricColumn = {
        legacy_score: "verified_legacy_score",
        yards: "yards",
        touchdowns: "touchdowns",
        championships: "championships",
        overall: "overall",
        followers: "followers",
        net_worth: "net_worth"
      }[metric];
      const params = position ? [position, limit] : [limit];
      const positionFilter = position ? "AND position = $1" : "";
      const limitParam = position ? "$2" : "$1";
      const result = await pool.query(
        `SELECT display_name, position, team_id, ${metricColumn} AS score, updated_at
         FROM career_snapshots
         WHERE leaderboard_opt_in = true AND display_name IS NOT NULL ${positionFilter}
         ORDER BY ${metricColumn} DESC, updated_at ASC
         LIMIT ${limitParam}`,
        params
      );
      return result.rows;
    },

    async getOverview() {
      const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM installations) AS installations,
          (SELECT count(*)::int FROM installations WHERE last_seen_at >= now() - interval '1 day') AS dau,
          (SELECT count(*)::int FROM installations WHERE last_seen_at >= now() - interval '7 days') AS wau,
          (SELECT count(*)::int FROM installations WHERE last_seen_at >= now() - interval '30 days') AS mau,
          (SELECT count(*)::int FROM analytics_events) AS events,
          (SELECT count(*)::int FROM accounts) AS accounts,
          (SELECT count(*)::int FROM cloud_save_slots) AS cloud_slots,
          ((SELECT count(*) FROM career_snapshots) + (SELECT count(*) FROM account_career_snapshots))::int AS careers,
          ((SELECT count(*) FROM career_snapshots WHERE leaderboard_opt_in = true) +
           (SELECT count(*) FROM account_career_snapshots))::int AS public_careers,
          (SELECT app_version FROM installations GROUP BY app_version ORDER BY count(*) DESC, app_version DESC LIMIT 1) AS current_app_version
      `);
      return result.rows[0];
    },

    async getRetention() {
      const summary = await pool.query(`
        WITH cohort AS (
          SELECT id, created_at FROM installations
          WHERE created_at >= now() - interval '90 days'
        )
        SELECT
          count(*) FILTER (WHERE created_at <= now() - interval '2 days')::int AS d1_eligible,
          count(*) FILTER (
            WHERE created_at <= now() - interval '2 days'
            AND EXISTS (
              SELECT 1 FROM analytics_events e
              WHERE e.installation_id = cohort.id
              AND e.occurred_at >= cohort.created_at + interval '1 day'
              AND e.occurred_at < cohort.created_at + interval '2 days'
            )
          )::int AS d1_retained,
          count(*) FILTER (WHERE created_at <= now() - interval '8 days')::int AS d7_eligible,
          count(*) FILTER (
            WHERE created_at <= now() - interval '8 days'
            AND EXISTS (
              SELECT 1 FROM analytics_events e
              WHERE e.installation_id = cohort.id
              AND e.occurred_at >= cohort.created_at + interval '7 days'
              AND e.occurred_at < cohort.created_at + interval '8 days'
            )
          )::int AS d7_retained,
          count(*) FILTER (WHERE created_at <= now() - interval '31 days')::int AS d30_eligible,
          count(*) FILTER (
            WHERE created_at <= now() - interval '31 days'
            AND EXISTS (
              SELECT 1 FROM analytics_events e
              WHERE e.installation_id = cohort.id
              AND e.occurred_at >= cohort.created_at + interval '30 days'
              AND e.occurred_at < cohort.created_at + interval '31 days'
            )
          )::int AS d30_retained
        FROM cohort
      `);
      const daily = await pool.query(`
        SELECT date_trunc('day', occurred_at)::date AS day,
               count(DISTINCT installation_id)::int AS active_installations
        FROM analytics_events
        WHERE occurred_at >= now() - interval '30 days' AND occurred_at <= now()
        GROUP BY 1
        ORDER BY 1
      `);
      return { ...summary.rows[0], daily: daily.rows };
    },

    async getFunnel() {
      const result = await pool.query(`
        WITH event_counts AS (
          SELECT event_name, count(DISTINCT installation_id)::int AS installations
          FROM analytics_events
          WHERE event_name IN ('career_started','week_completed','season_completed','career_retired')
          GROUP BY event_name
        ), total AS (SELECT count(*)::int AS installations FROM installations)
        SELECT stage, label, count FROM (
          SELECT 1 AS stage, 'Consented registered installations' AS label, (SELECT installations FROM total) AS count
          UNION ALL SELECT 2, 'Career started', COALESCE((SELECT installations FROM event_counts WHERE event_name='career_started'),0)
          UNION ALL SELECT 3, 'Week completed', COALESCE((SELECT installations FROM event_counts WHERE event_name='week_completed'),0)
          UNION ALL SELECT 4, 'Season completed', COALESCE((SELECT installations FROM event_counts WHERE event_name='season_completed'),0)
          UNION ALL SELECT 5, 'Career retired', COALESCE((SELECT installations FROM event_counts WHERE event_name='career_retired'),0)
        ) steps ORDER BY stage
      `);
      const installed = Number(result.rows[0]?.count ?? 0);
      const careerSteps = result.rows.map((row) => ({
        group: "career_activity",
        stage: row.stage,
        label: row.label,
        installations: Number(row.count),
        conversion: installed > 0 ? Number((Number(row.count) / installed).toFixed(4)) : null
      }));
      // Occurrence metadata is captured before queueing. Never join the latest
      // installation version to historical offers or treat restores as sales.
      const paid = await pool.query(`
        WITH paid_events AS (
          SELECT id, installation_id, event_name, occurred_at, properties
          FROM analytics_events
          WHERE occurred_at >= now() - interval '90 days' AND occurred_at <= now()
          AND properties->>'schemaVersion' = '2'
          AND event_name IN ('offer_eligible','offer_visible','product_selected',
            'purchase_requested','purchase_verified','benefit_delivered')
        ), attempt_selections AS (
          SELECT DISTINCT ON (installation_id, properties->>'attemptId', properties->>'itemId') *
          FROM paid_events WHERE event_name = 'product_selected'
          ORDER BY installation_id, properties->>'attemptId', properties->>'itemId', occurred_at, id
        ), verifications AS (
          SELECT DISTINCT ON (installation_id, properties->>'saleReference', properties->>'itemId') *
          FROM paid_events WHERE event_name = 'purchase_verified'
          ORDER BY installation_id, properties->>'saleReference', properties->>'itemId', occurred_at, id
        ), eligible AS (
          SELECT DISTINCT ON (installation_id, properties->>'opportunityId', properties->>'itemId') *
          FROM paid_events
          WHERE event_name = 'offer_eligible'
          AND properties->>'opportunityId' IS NOT NULL AND properties->>'itemId' IS NOT NULL
          ORDER BY installation_id, properties->>'opportunityId', properties->>'itemId', occurred_at, id
        ), milestones AS (
          SELECT e.id, e.properties,
            bool_or(v.id IS NOT NULL) AS visible,
            bool_or(r.id IS NOT NULL) AS requested,
            bool_or(p.id IS NOT NULL) AS verified,
            bool_or(d.id IS NOT NULL) AS delivered
          FROM eligible e
          LEFT JOIN paid_events v ON v.installation_id = e.installation_id
            AND v.event_name = 'offer_visible' AND v.occurred_at >= e.occurred_at
            AND v.properties->>'opportunityId' = e.properties->>'opportunityId'
            AND v.properties->>'itemId' = e.properties->>'itemId'
            AND ((v.properties->>'offerId' = e.properties->>'offerId'
              AND v.properties->>'surface' = e.properties->>'surface') OR (
              e.properties->>'experimentId' = 'career_capacity'
              AND e.properties->>'experimentVersion' = '1'
              AND e.properties->>'offerId' = 'capacity_v1' AND e.properties->>'surface' = 'career_capacity'
              AND v.properties->>'offerId' = 'permanent_v1' AND v.properties->>'surface' = 'shop'))
            AND v.properties->>'experimentId' = e.properties->>'experimentId'
            AND v.properties->>'experimentVersion' = e.properties->>'experimentVersion'
            AND v.properties->>'variant' = e.properties->>'variant'
            AND v.properties->>'analyticsEnvironment' = e.properties->>'analyticsEnvironment'
          LEFT JOIN attempt_selections s ON s.installation_id = e.installation_id
            AND s.event_name = 'product_selected' AND s.occurred_at >= v.occurred_at
            AND s.properties->>'presentationId' = v.properties->>'presentationId'
            AND s.properties->>'opportunityId' = e.properties->>'opportunityId'
            AND s.properties->>'itemId' = e.properties->>'itemId'
            AND s.properties->>'offerId' = v.properties->>'offerId'
            AND s.properties->>'surface' = v.properties->>'surface'
            AND s.properties->>'experimentId' = v.properties->>'experimentId'
            AND s.properties->>'experimentVersion' = v.properties->>'experimentVersion'
            AND s.properties->>'variant' = v.properties->>'variant'
            AND s.properties->>'analyticsEnvironment' = e.properties->>'analyticsEnvironment'
          LEFT JOIN paid_events r ON r.installation_id = e.installation_id
            AND r.event_name = 'purchase_requested' AND r.occurred_at >= s.occurred_at
            AND r.properties->>'attemptId' = s.properties->>'attemptId'
            AND r.properties->>'itemId' = e.properties->>'itemId'
            AND r.properties->>'analyticsEnvironment' = e.properties->>'analyticsEnvironment'
          LEFT JOIN verifications p ON p.installation_id = e.installation_id
            AND p.event_name = 'purchase_verified' AND p.occurred_at >= r.occurred_at
            AND p.properties->>'attemptId' = r.properties->>'attemptId'
            AND p.properties->>'itemId' = e.properties->>'itemId'
            AND p.properties->>'source' = 'purchase'
            AND p.properties->>'analyticsEnvironment' = 'production'
            AND e.properties->>'analyticsEnvironment' = 'production'
            AND p.properties->>'storeEnvironment' = 'production'
          LEFT JOIN paid_events d ON d.installation_id = e.installation_id
            AND d.event_name = 'benefit_delivered' AND d.occurred_at >= p.occurred_at
            AND d.properties->>'saleReference' = p.properties->>'saleReference'
            AND d.properties->>'itemId' = e.properties->>'itemId'
            AND d.properties->>'source' = 'purchase'
            AND d.properties->>'analyticsEnvironment' = 'production'
          GROUP BY e.id, e.properties
        )
        SELECT properties->>'analyticsEnvironment' AS analytics_environment,
          properties->>'appVersion' AS app_version, properties->>'appBuild' AS app_build,
          properties->>'distributionChannel' AS distribution_channel,
          properties->>'experimentId' AS experiment_id,
          properties->>'experimentVersion' AS experiment_version,
          properties->>'variant' AS variant, properties->>'surface' AS surface,
          properties->>'itemId' AS item_id,
          count(*)::int AS eligible_count,
          count(*) FILTER (WHERE visible)::int AS visible_count,
          count(*) FILTER (WHERE requested)::int AS requested_count,
          count(*) FILTER (WHERE verified)::int AS verified_count,
          count(*) FILTER (WHERE delivered)::int AS delivered_count
        FROM milestones
        GROUP BY 1,2,3,4,5,6,7,8,9 ORDER BY 1,2,3,4,5,6,7,8,9
      `);
      const paidSteps = paid.rows.flatMap((row) => {
        const counts = [row.eligible_count, row.visible_count, row.requested_count, row.verified_count, row.delivered_count];
        const labels = ["Eligible opportunities", "Actually visible", "Native request", "Production verified", "Durably delivered"];
        return counts.map((count, index) => ({
          group: row.analytics_environment === "production" ? "paid_opportunity" : "quarantined_opportunity",
          stage: index + 1, label: labels[index], opportunities: Number(count),
          conversion: Number(row.eligible_count) > 0 ? Number((Number(count) / Number(row.eligible_count)).toFixed(4)) : null,
          analyticsEnvironment: row.analytics_environment, appVersion: row.app_version, appBuild: row.app_build,
          distributionChannel: row.distribution_channel, experimentId: row.experiment_id,
          experimentVersion: Number(row.experiment_version), variant: row.variant, surface: row.surface, itemId: row.item_id
        }));
      });
      // Assignment is installation-scoped. A control player who later opens the
      // Shop normally can buy under a different opportunity; that still belongs
      // to the assigned directional 35-day cohort, including all SKUs.
      const cohorts = await pool.query(`
        WITH assignments AS (
          SELECT DISTINCT ON (installation_id, properties->>'experimentId', properties->>'experimentVersion') *
          FROM analytics_events
          WHERE event_name = 'experiment_assigned' AND properties->>'schemaVersion' = '2'
            AND properties->>'analyticsEnvironment' = 'production'
            AND occurred_at >= now() - interval '90 days' AND occurred_at <= now()
            AND received_at <= occurred_at + interval '49 days'
          ORDER BY installation_id, properties->>'experimentId', properties->>'experimentVersion', occurred_at, id
        ), enrollment AS (
          SELECT a.id, a.installation_id, a.properties, min(e.occurred_at) AS enrolled_at
          FROM assignments a JOIN analytics_events e ON e.installation_id = a.installation_id
            AND e.event_name = 'offer_eligible' AND e.occurred_at >= a.occurred_at
            AND e.received_at <= e.occurred_at + interval '49 days'
            AND e.properties->>'analyticsEnvironment' = 'production'
            AND e.properties->>'opportunityId' = a.properties->>'opportunityId'
            AND e.properties->>'experimentId' = a.properties->>'experimentId'
            AND e.properties->>'experimentVersion' = a.properties->>'experimentVersion'
            AND e.properties->>'variant' = a.properties->>'variant'
          GROUP BY a.id, a.installation_id, a.properties
        ), verified AS (
          SELECT DISTINCT ON (installation_id, properties->>'saleReference', properties->>'itemId') *
          FROM analytics_events WHERE event_name = 'purchase_verified'
            AND properties->>'schemaVersion' = '2'
          ORDER BY installation_id, properties->>'saleReference', properties->>'itemId', occurred_at, id
        ), observations AS (
          SELECT c.id, c.properties, c.enrolled_at,
            bool_or(p.id IS NOT NULL) AS verified_buyer,
            bool_or(d.id IS NOT NULL) AS delivered_buyer,
            array_agg(DISTINCT p.properties->>'itemId') FILTER (WHERE d.id IS NOT NULL) AS delivered_items
          FROM enrollment c LEFT JOIN verified p ON p.installation_id = c.installation_id
            AND p.occurred_at >= c.enrolled_at AND p.occurred_at < c.enrolled_at + interval '35 days'
            AND p.received_at <= c.enrolled_at + interval '49 days'
            AND p.properties->>'analyticsEnvironment' = 'production'
            AND p.properties->>'storeEnvironment' = 'production' AND p.properties->>'source' = 'purchase'
          LEFT JOIN analytics_events d ON d.installation_id = c.installation_id
            AND d.event_name = 'benefit_delivered' AND d.occurred_at >= p.occurred_at
            AND d.occurred_at < c.enrolled_at + interval '35 days'
            AND d.received_at <= c.enrolled_at + interval '49 days'
            AND d.properties->>'saleReference' = p.properties->>'saleReference'
            AND d.properties->>'itemId' = p.properties->>'itemId'
            AND d.properties->>'analyticsEnvironment' = 'production' AND d.properties->>'source' = 'purchase'
          GROUP BY c.id, c.properties, c.enrolled_at
        )
        SELECT properties->>'experimentId' AS experiment_id,
          properties->>'experimentVersion' AS experiment_version, properties->>'variant' AS variant,
          properties->>'appVersion' AS app_version, properties->>'appBuild' AS app_build,
          properties->>'distributionChannel' AS distribution_channel,
          count(*)::int AS enrolled,
          count(*) FILTER (WHERE enrolled_at <= now() - interval '35 days')::int AS mature_35,
          count(*) FILTER (WHERE enrolled_at <= now() - interval '49 days')::int AS final_49,
          count(*) FILTER (WHERE enrolled_at <= now() - interval '35 days' AND verified_buyer)::int AS verified_buyers_35,
          count(*) FILTER (WHERE enrolled_at <= now() - interval '35 days' AND delivered_buyer)::int AS delivered_buyers_35,
          count(*) FILTER (WHERE enrolled_at <= now() - interval '49 days' AND delivered_buyer)::int AS delivered_buyers_final,
          count(*) FILTER (WHERE enrolled_at <= now() - interval '35 days' AND 'VIP' = ANY(delivered_items))::int AS vip_buyers,
          count(*) FILTER (WHERE enrolled_at <= now() - interval '35 days' AND 'DOUBLE_XP' = ANY(delivered_items))::int AS xp_buyers,
          count(*) FILTER (WHERE enrolled_at <= now() - interval '35 days' AND 'DOUBLE_MONEY' = ANY(delivered_items))::int AS money_buyers,
          count(*) FILTER (WHERE enrolled_at <= now() - interval '35 days' AND 'EXTRA_CAREER_SLOTS' = ANY(delivered_items))::int AS slots_buyers,
          count(*) FILTER (WHERE enrolled_at <= now() - interval '35 days' AND 'ALL_ACCESS' = ANY(delivered_items))::int AS all_access_buyers
        FROM observations GROUP BY 1,2,3,4,5,6 ORDER BY 1,2,3,4,5,6
      `);
      const cohortRows = cohorts.rows.map((row) => ({
        group: "assigned_35_day_cohort", experimentId: row.experiment_id,
        experimentVersion: Number(row.experiment_version), variant: row.variant,
        appVersion: row.app_version, appBuild: row.app_build, distributionChannel: row.distribution_channel,
        enrolled: Number(row.enrolled), mature35: Number(row.mature_35), final49: Number(row.final_49),
        verifiedBuyers35: Number(row.verified_buyers_35), deliveredBuyers35: Number(row.delivered_buyers_35),
        deliveredBuyersFinal: Number(row.delivered_buyers_final),
        conversion35: Number(row.mature_35) > 0 ? Number((Number(row.delivered_buyers_35) / Number(row.mature_35)).toFixed(4)) : null,
        conversionFinal: Number(row.final_49) > 0 ? Number((Number(row.delivered_buyers_final) / Number(row.final_49)).toFixed(4)) : null,
        deliveredSkuBuyers35: { VIP: Number(row.vip_buyers), DOUBLE_XP: Number(row.xp_buyers),
          DOUBLE_MONEY: Number(row.money_buyers), EXTRA_CAREER_SLOTS: Number(row.slots_buyers), ALL_ACCESS: Number(row.all_access_buyers) }
      }));
      const diagnostics = await pool.query(`
        WITH verified AS (
          SELECT DISTINCT ON (installation_id, properties->>'saleReference', properties->>'itemId') *
          FROM analytics_events
          WHERE event_name = 'purchase_verified' AND properties->>'schemaVersion' = '2'
          AND occurred_at >= now() - interval '90 days' AND occurred_at <= now()
          ORDER BY installation_id, properties->>'saleReference', properties->>'itemId', occurred_at, id
        ), queue_status AS (
          SELECT DISTINCT ON (installation_id) * FROM analytics_events
          WHERE event_name = 'telemetry_queue_status' AND properties->>'schemaVersion' = '2'
          AND occurred_at >= now() - interval '90 days' AND occurred_at <= now()
          ORDER BY installation_id, occurred_at DESC, id DESC
        )
        SELECT 'verification_context' AS diagnostic, properties->>'analyticsEnvironment' AS analytics_environment,
          properties->>'storeEnvironment' AS store_environment, properties->>'source' AS source,
          properties->>'appVersion' AS app_version, properties->>'appBuild' AS app_build,
          count(*)::bigint AS count
        FROM verified GROUP BY 2,3,4,5,6
        UNION ALL
        SELECT 'reported_queue_drops', properties->>'analyticsEnvironment', NULL, NULL,
          properties->>'appVersion', properties->>'appBuild', sum((properties->>'droppedCount')::bigint)
        FROM queue_status GROUP BY 2,5,6
        UNION ALL
        SELECT 'events_arrived_after_24h', COALESCE(properties->>'analyticsEnvironment','legacy_unknown'), NULL, NULL,
          COALESCE(properties->>'appVersion','unknown'), COALESCE(properties->>'appBuild','unknown'), count(*)::bigint
        FROM analytics_events
        WHERE occurred_at >= now() - interval '90 days' AND occurred_at <= now()
          AND received_at > occurred_at + interval '24 hours'
        GROUP BY 2,5,6
        UNION ALL
        SELECT event_name, properties->>'analyticsEnvironment', NULL, NULL,
          properties->>'appVersion', properties->>'appBuild',
          count(DISTINCT (installation_id, properties->>'presentationId', properties->>'itemId'))::bigint
        FROM analytics_events WHERE event_name IN ('capacity_action_visible','capacity_action_selected')
          AND properties->>'schemaVersion' = '2'
          AND occurred_at >= now() - interval '90 days' AND occurred_at <= now()
        GROUP BY 1,2,5,6
      `);
      return [...careerSteps, ...paidSteps, ...cohortRows, ...diagnostics.rows.map((row) => ({
        group: "measurement_diagnostic", label: row.diagnostic, count: Number(row.count),
        analyticsEnvironment: row.analytics_environment, storeEnvironment: row.store_environment,
        source: row.source, appVersion: row.app_version, appBuild: row.app_build
      }))];
    },

    async getBalance() {
      const result = await pool.query(`
        WITH career AS (
          SELECT position, count(*)::int AS careers,
                 avg(games_played)::float AS avg_games,
                 avg(yards)::float AS avg_yards,
                 avg(touchdowns)::float AS avg_touchdowns,
                 avg(overall)::float AS avg_overall
          FROM (
            SELECT position, games_played, yards, touchdowns, overall FROM career_snapshots
            UNION ALL
            SELECT position, games_played, yards, touchdowns, overall FROM account_career_snapshots
          ) snapshots GROUP BY position
        ), games AS (
          SELECT properties->>'position' AS position,
                 avg(CASE WHEN (properties->>'won')::boolean THEN 1.0 ELSE 0.0 END)::float AS win_rate
          FROM analytics_events WHERE event_name='week_completed' GROUP BY 1
        )
        SELECT career.*, games.win_rate FROM career LEFT JOIN games USING (position)
        ORDER BY career.position
      `);
      return result.rows;
    },

    async getLeaderboardHealth() {
      const summary = await pool.query(`
        SELECT
          ((SELECT count(*) FROM career_snapshots WHERE leaderboard_opt_in=true) +
           (SELECT count(*) FROM account_career_snapshots))::int AS public_careers,
          ((SELECT count(*) FROM career_snapshots WHERE leaderboard_opt_in=true AND updated_at >= now()-interval '7 days') +
           (SELECT count(*) FROM account_career_snapshots WHERE updated_at >= now()-interval '7 days'))::int AS active_public_careers,
          ((SELECT count(*) FROM leaderboard_submission_audits WHERE submitted_at >= now()-interval '24 hours') +
           (SELECT count(*) FROM account_leaderboard_submission_audits WHERE submitted_at >= now()-interval '24 hours'))::int AS rejected_24h,
          ((SELECT count(*) FROM leaderboard_submission_audits) +
           (SELECT count(*) FROM account_leaderboard_submission_audits))::int AS rejected_total
      `);
      const reasons = await pool.query(`
        SELECT reason, count(*)::int AS count FROM (
          SELECT reason FROM leaderboard_submission_audits
          UNION ALL
          SELECT reason FROM account_leaderboard_submission_audits
        ) audits
        GROUP BY reason ORDER BY count(*) DESC, reason LIMIT 12
      `);
      return { ...summary.rows[0], rejection_reasons: reasons.rows };
    },

    async purgeExpiredData() {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const audits = await client.query(
          "DELETE FROM leaderboard_submission_audits WHERE submitted_at < now() - interval '90 days'"
        );
        const accountAudits = await client.query(
          "DELETE FROM account_leaderboard_submission_audits WHERE submitted_at < now() - interval '90 days'"
        );
        const sessions = await client.query(
          "DELETE FROM account_sessions WHERE expires_at < now() OR revoked_at < now() - interval '30 days'"
        );
        const events = await client.query(
          "DELETE FROM analytics_events WHERE occurred_at < now() - interval '13 months'"
        );
        const installations = await client.query(
          "DELETE FROM installations WHERE last_seen_at < now() - interval '24 months'"
        );
        const feedback = await client.query(
          "DELETE FROM feedback_submissions WHERE created_at < now() - interval '12 months'"
        );
        const usernameReports = await client.query(
          "DELETE FROM leaderboard_username_reports WHERE created_at < now() - interval '12 months'"
        );
        await client.query("COMMIT");
        return {
          audits: audits.rowCount,
          accountAudits: accountAudits.rowCount,
          sessions: sessions.rowCount,
          events: events.rowCount,
          installations: installations.rowCount,
          feedback: feedback.rowCount,
          usernameReports: usernameReports.rowCount
        };
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
