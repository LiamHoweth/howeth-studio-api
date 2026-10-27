ALTER TABLE elevenward.accounts
  ADD COLUMN IF NOT EXISTS public_profile_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS public_username text,
  ADD COLUMN IF NOT EXISTS public_username_normalized text,
  ADD COLUMN IF NOT EXISTS username_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS username_suspended_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS elevenward_accounts_public_profile_id_idx
  ON elevenward.accounts (public_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS elevenward_accounts_public_username_normalized_idx
  ON elevenward.accounts (public_username_normalized)
  WHERE public_username_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS elevenward.leaderboard_username_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  reported_account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('offensive_username', 'impersonation', 'harassment', 'other')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'dismissed', 'actioned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_account_id <> reported_account_id)
);

CREATE INDEX IF NOT EXISTS elevenward_username_reports_status_created_idx
  ON elevenward.leaderboard_username_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS elevenward_username_reports_target_idx
  ON elevenward.leaderboard_username_reports (reported_account_id, created_at DESC);
