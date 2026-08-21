CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  app_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id bigserial PRIMARY KEY,
  installation_id uuid NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  event_name text NOT NULL,
  occurred_at timestamptz NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, event_id)
);

CREATE INDEX IF NOT EXISTS analytics_events_installation_occurred_idx
  ON analytics_events (installation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_occurred_idx
  ON analytics_events (event_name, occurred_at DESC);

CREATE TABLE IF NOT EXISTS career_snapshots (
  installation_id uuid NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  career_id text NOT NULL,
  display_name text,
  leaderboard_opt_in boolean NOT NULL DEFAULT false,
  position text NOT NULL CHECK (position IN ('QB', 'RB', 'WR')),
  team_id text NOT NULL,
  season_year integer NOT NULL CHECK (season_year BETWEEN 1 AND 9999),
  career_year integer NOT NULL CHECK (career_year BETWEEN 1 AND 20),
  games_played integer NOT NULL CHECK (games_played >= 0),
  yards integer NOT NULL CHECK (yards >= 0),
  touchdowns integer NOT NULL CHECK (touchdowns >= 0),
  championships integer NOT NULL CHECK (championships >= 0),
  overall integer NOT NULL CHECK (overall BETWEEN 0 AND 100),
  followers bigint NOT NULL CHECK (followers >= 0),
  net_worth bigint NOT NULL CHECK (net_worth >= 0),
  legacy_score integer NOT NULL CHECK (legacy_score >= 0),
  retired boolean NOT NULL DEFAULT false,
  client_updated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (installation_id, career_id)
);

CREATE INDEX IF NOT EXISTS career_snapshots_legacy_leaderboard_idx
  ON career_snapshots (legacy_score DESC, updated_at ASC)
  WHERE leaderboard_opt_in = true;
CREATE INDEX IF NOT EXISTS career_snapshots_yards_leaderboard_idx
  ON career_snapshots (yards DESC, updated_at ASC)
  WHERE leaderboard_opt_in = true;
CREATE INDEX IF NOT EXISTS career_snapshots_touchdowns_leaderboard_idx
  ON career_snapshots (touchdowns DESC, updated_at ASC)
  WHERE leaderboard_opt_in = true;
