-- Existing accounts have no durable sharing choice. Keep them private until
-- they explicitly enable publication; newly created accounts follow the
-- disclosed signed-in flow.
ALTER TABLE elevenward.accounts
  ADD COLUMN IF NOT EXISTS leaderboard_sharing_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE elevenward.accounts
  ALTER COLUMN leaderboard_sharing_enabled SET DEFAULT true;
