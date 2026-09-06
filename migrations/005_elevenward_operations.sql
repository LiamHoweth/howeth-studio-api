CREATE TABLE IF NOT EXISTS elevenward.staff_actions (
  id bigserial PRIMARY KEY,
  actor_hash text NOT NULL CHECK (actor_hash ~ '^[a-f0-9]{64}$'),
  action text NOT NULL CHECK (action IN ('content_release_created', 'content_release_published', 'content_release_rollback')),
  resource_type text NOT NULL CHECK (resource_type IN ('content_release')),
  resource_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS elevenward_staff_actions_created_idx
  ON elevenward.staff_actions (created_at DESC);

CREATE INDEX IF NOT EXISTS elevenward_pending_conflicts_created_idx
  ON elevenward.sync_conflicts (created_at DESC) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS elevenward_webhook_receipts_unprocessed_idx
  ON elevenward.webhook_receipts (received_at DESC) WHERE processed_at IS NULL;
