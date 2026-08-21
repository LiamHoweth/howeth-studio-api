import pg from "pg";

const { Pool } = pg;

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

    async findInstallationByTokenHash(tokenHash) {
      const result = await pool.query(
        `UPDATE installations
         SET last_seen_at = now()
         WHERE token_hash = $1
         RETURNING id, platform, app_version`,
        [tokenHash]
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

    async upsertCareer(installationId, career) {
      await pool.query(
        `INSERT INTO career_snapshots (
           installation_id, career_id, display_name, leaderboard_opt_in, position, team_id,
           season_year, career_year, games_played, yards, touchdowns, championships,
           overall, followers, net_worth, legacy_score, retired, client_updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
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
          career.retired,
          career.clientUpdatedAt
        ]
      );
    },

    async deleteInstallation(installationId) {
      await pool.query("DELETE FROM installations WHERE id = $1", [installationId]);
    },

    async getLeaderboard({ metric, position, limit }) {
      const metricColumn = {
        legacy_score: "legacy_score",
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
         WHERE leaderboard_opt_in = true ${positionFilter}
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
          (SELECT count(*)::int FROM career_snapshots WHERE leaderboard_opt_in = true) AS public_careers
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

    async close() {
      if (pool) await pool.end();
    }
  };
}
