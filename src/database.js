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
          (SELECT count(*)::int FROM career_snapshots) AS careers,
          (SELECT count(*)::int FROM career_snapshots WHERE leaderboard_opt_in = true) AS public_careers,
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
          count(*) FILTER (WHERE created_at <= now() - interval '1 day')::int AS d1_eligible,
          count(*) FILTER (
            WHERE created_at <= now() - interval '1 day'
            AND EXISTS (
              SELECT 1 FROM analytics_events e
              WHERE e.installation_id = cohort.id
              AND e.occurred_at >= cohort.created_at + interval '1 day'
              AND e.occurred_at < cohort.created_at + interval '2 days'
            )
          )::int AS d1_retained,
          count(*) FILTER (WHERE created_at <= now() - interval '7 days')::int AS d7_eligible,
          count(*) FILTER (
            WHERE created_at <= now() - interval '7 days'
            AND EXISTS (
              SELECT 1 FROM analytics_events e
              WHERE e.installation_id = cohort.id
              AND e.occurred_at >= cohort.created_at + interval '7 days'
              AND e.occurred_at < cohort.created_at + interval '8 days'
            )
          )::int AS d7_retained,
          count(*) FILTER (WHERE created_at <= now() - interval '30 days')::int AS d30_eligible,
          count(*) FILTER (
            WHERE created_at <= now() - interval '30 days'
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
        WHERE occurred_at >= now() - interval '30 days'
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
          SELECT 1 AS stage, 'Installed' AS label, (SELECT installations FROM total) AS count
          UNION ALL SELECT 2, 'Career started', COALESCE((SELECT installations FROM event_counts WHERE event_name='career_started'),0)
          UNION ALL SELECT 3, 'Week completed', COALESCE((SELECT installations FROM event_counts WHERE event_name='week_completed'),0)
          UNION ALL SELECT 4, 'Season completed', COALESCE((SELECT installations FROM event_counts WHERE event_name='season_completed'),0)
          UNION ALL SELECT 5, 'Career retired', COALESCE((SELECT installations FROM event_counts WHERE event_name='career_retired'),0)
        ) steps ORDER BY stage
      `);
      const installed = Number(result.rows[0]?.count ?? 0);
      return result.rows.map((row) => ({
        stage: row.stage,
        label: row.label,
        installations: Number(row.count),
        conversion: installed > 0 ? Number((Number(row.count) / installed).toFixed(4)) : null
      }));
    },

    async getBalance() {
      const result = await pool.query(`
        WITH career AS (
          SELECT position, count(*)::int AS careers,
                 avg(games_played)::float AS avg_games,
                 avg(yards)::float AS avg_yards,
                 avg(touchdowns)::float AS avg_touchdowns,
                 avg(overall)::float AS avg_overall
          FROM career_snapshots GROUP BY position
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
          (SELECT count(*)::int FROM career_snapshots WHERE leaderboard_opt_in=true) AS public_careers,
          (SELECT count(*)::int FROM career_snapshots WHERE leaderboard_opt_in=true AND updated_at >= now()-interval '7 days') AS active_public_careers,
          (SELECT count(*)::int FROM leaderboard_submission_audits WHERE submitted_at >= now()-interval '24 hours') AS rejected_24h,
          (SELECT count(*)::int FROM leaderboard_submission_audits) AS rejected_total
      `);
      const reasons = await pool.query(`
        SELECT reason, count(*)::int AS count FROM leaderboard_submission_audits
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
        const events = await client.query(
          "DELETE FROM analytics_events WHERE occurred_at < now() - interval '13 months'"
        );
        const installations = await client.query(
          "DELETE FROM installations WHERE last_seen_at < now() - interval '24 months'"
        );
        await client.query("COMMIT");
        return { audits: audits.rowCount, events: events.rowCount, installations: installations.rowCount };
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
