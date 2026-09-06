CREATE SCHEMA IF NOT EXISTS elevenward;

CREATE TABLE IF NOT EXISTS elevenward.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS elevenward.auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('apple', 'google')),
  provider_subject text NOT NULL,
  verified_email text,
  apple_refresh_token_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS elevenward_auth_identities_account_idx
  ON elevenward.auth_identities (account_id);

CREATE TABLE IF NOT EXISTS elevenward.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS elevenward_sessions_account_idx
  ON elevenward.sessions (account_id);
CREATE INDEX IF NOT EXISTS elevenward_sessions_expiry_idx
  ON elevenward.sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS elevenward.career_slots (
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  slot_index smallint NOT NULL CHECK (slot_index BETWEEN 0 AND 4),
  career_id uuid NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  rules_version text NOT NULL,
  content_version text NOT NULL,
  position text NOT NULL CHECK (position IN ('striker', 'winger', 'midfielder', 'defender')),
  difficulty text NOT NULL CHECK (difficulty IN ('story', 'balanced', 'elite')),
  seed bigint NOT NULL,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  client_updated_at timestamptz NOT NULL,
  server_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, slot_index),
  UNIQUE (account_id, career_id)
);

CREATE INDEX IF NOT EXISTS elevenward_career_slots_updated_idx
  ON elevenward.career_slots (account_id, server_updated_at DESC);

CREATE TABLE IF NOT EXISTS elevenward.sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  slot_index smallint NOT NULL CHECK (slot_index BETWEEN 0 AND 4),
  base_revision bigint NOT NULL,
  remote_revision bigint NOT NULL,
  local_snapshot jsonb NOT NULL,
  remote_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  resolution text CHECK (resolution IN ('local', 'remote')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS elevenward_one_pending_conflict_per_slot_idx
  ON elevenward.sync_conflicts (account_id, slot_index) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS elevenward.idempotency_keys (
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  PRIMARY KEY (account_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS elevenward_idempotency_expiry_idx
  ON elevenward.idempotency_keys (expires_at);

CREATE TABLE IF NOT EXISTS elevenward.leaderboard_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  career_id uuid NOT NULL,
  alias text NOT NULL,
  position text NOT NULL CHECK (position IN ('striker', 'winger', 'midfielder', 'defender')),
  difficulty text NOT NULL CHECK (difficulty IN ('story', 'balanced', 'elite')),
  rules_version text NOT NULL,
  seasons integer NOT NULL CHECK (seasons BETWEEN 1 AND 20),
  matches integer NOT NULL CHECK (matches >= 0),
  legacy_score integer NOT NULL CHECK (legacy_score >= 0),
  aggregate_metrics jsonb NOT NULL,
  validation_evidence jsonb NOT NULL,
  accepted boolean NOT NULL,
  rejection_reason text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, career_id, difficulty, rules_version)
);

CREATE INDEX IF NOT EXISTS elevenward_leaderboard_board_idx
  ON elevenward.leaderboard_submissions
  (position, difficulty, rules_version, accepted, legacy_score DESC, updated_at ASC);

CREATE TABLE IF NOT EXISTS elevenward.entitlements (
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  entitlement_id text NOT NULL CHECK (entitlement_id IN ('extra_career_slots', 'supporter_pack')),
  product_id text NOT NULL,
  source_store text NOT NULL CHECK (source_store IN ('app_store', 'play_store', 'promotional')),
  transaction_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'refunded', 'revoked', 'expired')),
  purchased_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, entitlement_id),
  UNIQUE (source_store, transaction_id)
);

CREATE TABLE IF NOT EXISTS elevenward.webhook_receipts (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload_checksum text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS elevenward.analytics_consents (
  account_id uuid PRIMARY KEY REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('granted', 'denied')),
  policy_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS elevenward.analytics_events (
  id bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  event_name text NOT NULL,
  occurred_at timestamptz NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, event_id)
);

CREATE INDEX IF NOT EXISTS elevenward_analytics_events_retention_idx
  ON elevenward.analytics_events (occurred_at);

CREATE TABLE IF NOT EXISTS elevenward.content_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_version text NOT NULL UNIQUE,
  min_client_version text NOT NULL,
  max_client_version text,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  locales text[] NOT NULL,
  object_key text NOT NULL,
  public_url text NOT NULL,
  signature text NOT NULL,
  manifest jsonb NOT NULL,
  validation_report jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'rolled_back')),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  rolled_back_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS elevenward_one_published_content_idx
  ON elevenward.content_releases ((status)) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS elevenward.deletion_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS elevenward_deletion_challenges_account_idx
  ON elevenward.deletion_challenges (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS elevenward.deletion_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id_hash text NOT NULL,
  method text NOT NULL CHECK (method IN ('app', 'web')),
  completed_at timestamptz NOT NULL DEFAULT now()
);
