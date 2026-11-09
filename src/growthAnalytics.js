// All input values are bound parameters. No account/career identity is returned.
const scope = `properties->>'analyticsEnvironment' = $1
  AND ($2 = 'all' OR properties->>'distributionChannel' = $2)`;
const eventScope = `${scope} AND ($3 = '' OR properties->>'appVersion' = $3)`;
export async function getGrowthStats(pool, filters) {
  const params = [filters.environment, filters.channel, filters.version];
  const cohort = `WITH first_observations AS (
    SELECT DISTINCT ON (installation_id)
      installation_id, occurred_at, properties
    FROM analytics_events WHERE event_name = 'growth_cohort_started' AND ${scope}
    ORDER BY installation_id, occurred_at, id
  ), cohorts AS (
    SELECT * FROM first_observations WHERE occurred_at >= now() - interval '90 days'
      AND ($3 = '' OR properties->>'appVersion' = $3)
  )`;
  const summary = await pool.query(`${cohort}
    SELECT count(*)::int AS observed,
      count(*) FILTER (WHERE properties->>'existingProgress' = 'true')::int AS existing,
      count(*) FILTER (WHERE properties->>'existingProgress' = 'false')::int AS new_players,
      count(*) FILTER (WHERE properties->>'existingProgress' = 'false' AND occurred_at <= now() - interval '1 day')::int AS activation_eligible,
      count(*) FILTER (WHERE properties->>'existingProgress' = 'false' AND occurred_at <= now() - interval '1 day'
        AND EXISTS (SELECT 1 FROM analytics_events e WHERE e.installation_id = cohorts.installation_id
          AND e.event_name = 'first_game_completed' AND e.occurred_at >= cohorts.occurred_at
          AND e.occurred_at < cohorts.occurred_at + interval '1 day'
          AND e.properties->>'analyticsEnvironment' = cohorts.properties->>'analyticsEnvironment'
          AND ($2='all' OR e.properties->>'distributionChannel' = cohorts.properties->>'distributionChannel')))::int AS activated
    FROM cohorts`, params);
  const retention = await pool.query(`${cohort}
    SELECT horizon,
      count(*) FILTER (WHERE c.occurred_at <= now() - (horizon+1)*interval '1 day')::int AS eligible,
      count(*) FILTER (WHERE c.occurred_at <= now() - (horizon+1)*interval '1 day' AND EXISTS (
        SELECT 1 FROM analytics_events e WHERE e.installation_id=c.installation_id AND e.event_name='session_started'
        AND e.properties->>'analyticsEnvironment'=c.properties->>'analyticsEnvironment'
        AND ($2='all' OR e.properties->>'distributionChannel'=c.properties->>'distributionChannel')
        AND e.occurred_at >= c.occurred_at+horizon*interval '1 day'
        AND e.occurred_at < c.occurred_at+(horizon+1)*interval '1 day'
      ))::int AS retained
    FROM cohorts c CROSS JOIN (VALUES (1),(7),(30)) windows(horizon)
    GROUP BY horizon ORDER BY horizon`, params);
  const onboarding = await pool.query(`WITH starts AS (
      SELECT installation_id, properties->>'attemptId' AS attempt_id, min(occurred_at) AS started_at
      FROM analytics_events WHERE event_name='onboarding_started' AND ${eventScope}
        AND occurred_at >= now()-interval '90 days' GROUP BY 1,2
    ), completions AS (
      SELECT s.installation_id,s.attempt_id,e.event_name,e.properties->>'step' AS step
      FROM starts s JOIN analytics_events e ON e.installation_id=s.installation_id
        AND e.properties->>'attemptId'=s.attempt_id AND e.occurred_at >= s.started_at
        AND e.event_name IN ('onboarding_step_completed','onboarding_completed')
        AND e.properties->>'analyticsEnvironment'=$1 AND ($2='all' OR e.properties->>'distributionChannel'=$2)
    )
    SELECT 'started' AS step, count(*)::int AS attempts FROM starts
    UNION ALL SELECT step, count(DISTINCT (installation_id,attempt_id))::int FROM completions WHERE event_name='onboarding_step_completed' GROUP BY step
    UNION ALL SELECT 'completed', count(DISTINCT (installation_id,attempt_id))::int FROM completions WHERE event_name='onboarding_completed'`, params);
  const modes = await pool.query(`WITH starts AS (
      SELECT DISTINCT ON (installation_id,properties->>'gameAttemptId') installation_id, properties,occurred_at
      FROM analytics_events WHERE event_name='career_game_started' AND ${eventScope}
        AND occurred_at >= now()-interval '90 days' ORDER BY installation_id,properties->>'gameAttemptId',occurred_at,id
    )
    SELECT s.properties->>'position' AS position,s.properties->>'mode' AS mode,
      count(*)::int AS started, count(DISTINCT s.installation_id)::int AS installations,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e
        WHERE e.installation_id=s.installation_id AND e.event_name='career_game_completed'
        AND e.properties->>'gameAttemptId'=s.properties->>'gameAttemptId' AND e.occurred_at >= s.occurred_at
        AND e.properties->>'analyticsEnvironment'=s.properties->>'analyticsEnvironment'
        AND e.properties->>'distributionChannel'=s.properties->>'distributionChannel'))::int AS completed
    FROM starts s GROUP BY 1,2 ORDER BY 1,2`, params);
  const timing = await pool.query(`${cohort}
    SELECT e.properties->>'elapsedBucket' AS bucket,count(DISTINCT e.installation_id)::int AS installations
    FROM cohorts c JOIN LATERAL (SELECT e.* FROM analytics_events e WHERE e.installation_id=c.installation_id
      AND e.event_name='first_game_completed' AND e.occurred_at >= c.occurred_at
      AND e.properties->>'analyticsEnvironment'=c.properties->>'analyticsEnvironment'
      AND ($2='all' OR e.properties->>'distributionChannel'=c.properties->>'distributionChannel')
      ORDER BY e.occurred_at,e.id LIMIT 1) e ON true
    WHERE c.properties->>'existingProgress'='false' GROUP BY 1`, params);
  const reliability = await pool.query(`SELECT properties->>'operation' AS operation, properties->>'result' AS result,
      properties->>'latencyBucket' AS latency_bucket, count(*)::int AS observations,
      count(DISTINCT installation_id)::int AS installations
    FROM analytics_events WHERE event_name='reliability_result' AND ${eventScope}
      AND occurred_at >= now()-interval '90 days' GROUP BY 1,2,3 ORDER BY 1,2,3`, params);
  const coverage = await pool.query(`SELECT coalesce(properties->>'analyticsEnvironment','legacy_unknown') AS environment,
      coalesce(properties->>'distributionChannel','legacy_unknown') AS channel,
      coalesce(properties->>'appVersion','unknown') AS version,count(*)::int AS events
    FROM analytics_events WHERE occurred_at >= now()-interval '90 days' GROUP BY 1,2,3 ORDER BY 1,2,3`);
  const result = summary.rows[0];
  const rate = (n,d) => d > 0 ? Number((n/d).toFixed(4)) : null;
  return {definitionVersion:1,filters,windowDays:90,cohortBasis:'first_consented_growth_observation',
    summary:{...result,activationRate:rate(result.activated,result.activation_eligible)},
    retention:retention.rows.map(r=>({...r,rate:rate(r.retained,r.eligible)})),onboarding:onboarding.rows,
    modes:modes.rows.map(r=>({...r,completionRate:rate(r.completed,r.started)})),timing:timing.rows,reliability:reliability.rows,coverage:coverage.rows};
}
