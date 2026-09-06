UPDATE career_snapshots
SET display_name = position || ' Player ' || upper(substring(
  encode(digest(installation_id::text || ':' || career_id, 'sha256'), 'hex')
  FROM 1 FOR 6
))
WHERE leaderboard_opt_in = true;

UPDATE account_career_snapshots
SET display_name = position || ' Player ' || upper(substring(
  encode(digest(account_id::text || ':' || career_id, 'sha256'), 'hex')
  FROM 1 FOR 6
));
