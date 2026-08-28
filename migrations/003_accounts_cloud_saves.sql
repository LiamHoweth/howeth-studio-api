CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('apple', 'google')),
  provider_subject text NOT NULL,
  verified_email text,
  apple_refresh_token_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS auth_identities_account_idx
  ON auth_identities (account_id);

CREATE TABLE IF NOT EXISTS account_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS account_sessions_account_idx
  ON account_sessions (account_id);
CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx
  ON account_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS cloud_save_slots (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slot_index smallint NOT NULL CHECK (slot_index BETWEEN 0 AND 4),
  save_version integer NOT NULL CHECK (save_version BETWEEN 1 AND 1000),
  is_occupied boolean NOT NULL,
  payload jsonb NOT NULL,
  client_updated_at timestamptz NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  server_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, slot_index)
);

CREATE TABLE IF NOT EXISTS account_career_snapshots (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  career_id text NOT NULL,
  display_name text NOT NULL,
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
  verified_legacy_score integer NOT NULL CHECK (verified_legacy_score >= 0),
  retired boolean NOT NULL DEFAULT false,
  client_updated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, career_id)
);

CREATE INDEX IF NOT EXISTS account_careers_legacy_leaderboard_idx
  ON account_career_snapshots (verified_legacy_score DESC, updated_at ASC);
CREATE INDEX IF NOT EXISTS account_careers_yards_leaderboard_idx
  ON account_career_snapshots (yards DESC, updated_at ASC);
CREATE INDEX IF NOT EXISTS account_careers_touchdowns_leaderboard_idx
  ON account_career_snapshots (touchdowns DESC, updated_at ASC);

CREATE TABLE IF NOT EXISTS account_leaderboard_submission_audits (
  id bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  career_id text NOT NULL,
  reason text NOT NULL,
  games_played integer,
  yards integer,
  touchdowns integer,
  championships integer,
  overall integer,
  legacy_score integer,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_leaderboard_audits_submitted_idx
  ON account_leaderboard_submission_audits (submitted_at DESC);
CREATE INDEX IF NOT EXISTS account_leaderboard_audits_account_idx
  ON account_leaderboard_submission_audits (account_id, submitted_at DESC);
