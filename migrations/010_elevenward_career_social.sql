-- Private durable archives and opt-in friend comparisons are separate from public boards.
ALTER TABLE elevenward.accounts ADD COLUMN friend_comparison_sharing_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE feedback_submissions ADD COLUMN product text NOT NULL DEFAULT 'football_era' CHECK (product IN ('football_era','elevenward','studio'));
ALTER TABLE feedback_submissions ADD COLUMN support_code text;
ALTER TABLE feedback_submissions ADD COLUMN diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX feedback_product_status_created_idx ON feedback_submissions(product,status,created_at DESC);

CREATE TABLE elevenward.career_archives (
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  career_id uuid NOT NULL,
  snapshot jsonb NOT NULL CHECK (octet_length(snapshot::text)<=5000000),
  checksum text NOT NULL,
  legacy_score integer NOT NULL CHECK (legacy_score>=0),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,career_id)
);
CREATE TABLE elevenward.friend_invites (
  account_id uuid PRIMARY KEY REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  code_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE elevenward.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(requester_id<>recipient_id)
);
CREATE UNIQUE INDEX elevenward_friendships_pair_idx ON elevenward.friendships(LEAST(requester_id,recipient_id),GREATEST(requester_id,recipient_id));
CREATE INDEX elevenward_friendships_recipient_idx ON elevenward.friendships(recipient_id,status);
CREATE TABLE elevenward.friend_blocks (
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  blocked_account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  PRIMARY KEY(account_id,blocked_account_id), CHECK(account_id<>blocked_account_id)
);
CREATE TABLE elevenward.weekly_challenges (
  id text PRIMARY KEY,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  rules_version text NOT NULL,
  content_version text NOT NULL,
  configuration jsonb NOT NULL,
  seed bigint NOT NULL,
  CHECK(ends_at>starts_at)
);
CREATE TABLE elevenward.challenge_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id text NOT NULL REFERENCES elevenward.weekly_challenges(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES elevenward.accounts(id) ON DELETE CASCADE,
  career_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'enrolled' CHECK(status IN ('enrolled','submitted')),
  actions_hash text,
  score integer CHECK(score>=0),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  UNIQUE(challenge_id,account_id)
);
CREATE INDEX elevenward_challenge_rank_idx ON elevenward.challenge_attempts(challenge_id,score DESC,submitted_at,id) WHERE status='submitted';
ALTER TABLE feedback_submissions DROP CONSTRAINT feedback_submissions_platform_check;
ALTER TABLE feedback_submissions ADD CONSTRAINT feedback_submissions_platform_check CHECK(platform IN ('ios','android','web','macos','other'));
