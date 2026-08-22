ALTER TABLE career_snapshots
  ADD COLUMN IF NOT EXISTS verified_legacy_score integer NOT NULL DEFAULT 0;

UPDATE career_snapshots
SET verified_legacy_score = greatest(
  0,
  round(
    overall * 1.2 +
    touchdowns * 0.9 +
    yards * 0.02 +
    championships * 55 +
    log(greatest(1, followers)) * 25
  )::integer
)
WHERE verified_legacy_score = 0;

CREATE TABLE IF NOT EXISTS leaderboard_submission_audits (
  id bigserial PRIMARY KEY,
  installation_id uuid NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS leaderboard_submission_audits_submitted_idx
  ON leaderboard_submission_audits (submitted_at DESC);
CREATE INDEX IF NOT EXISTS leaderboard_submission_audits_installation_idx
  ON leaderboard_submission_audits (installation_id, submitted_at DESC);

DROP INDEX IF EXISTS career_snapshots_legacy_leaderboard_idx;
CREATE INDEX IF NOT EXISTS career_snapshots_verified_legacy_leaderboard_idx
  ON career_snapshots (verified_legacy_score DESC, updated_at ASC)
  WHERE leaderboard_opt_in = true;

