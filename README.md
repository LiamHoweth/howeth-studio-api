# Howeth Studio API

Railway-ready Express + PostgreSQL API for the Howeth Studio site and Football Era. Football Era stays local-first and playable as a guest. Anonymous analytics remain separate from optional Apple/Google accounts; signed-in accounts receive cloud career slots and automatically publish validated career summaries under an optional moderated account username or a stable generated alias. User-entered career names are never displayed on the online leaderboards.

## Run locally

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

- Health: `GET /health`
- Contact: `POST /api/contact`
- Anonymous app registration: `POST /api/v1/installations`
- Batched app events: `POST /api/v1/events` (installation bearer token)
- Career sync: `PUT /api/v1/careers/:careerId` (installation bearer token)
- Public leaderboard: `GET /api/v1/leaderboards?metric=legacy_score&position=QB`
- Anonymous player feedback: `POST /api/v1/feedback`
- Apple/Google sign-in: `POST /api/v2/auth/apple` and `POST /api/v2/auth/google`
- Account/session: `GET /api/v2/account`, `POST /api/v2/auth/sign-out`, `DELETE /api/v2/account`
- Public username: `PUT /api/v2/account/username`
- Cloud career slots: `GET/PUT /api/v2/save-slots` (account bearer token)
- Account career publication: `PUT/DELETE /api/v2/careers/:careerId`
- Account leaderboard: `GET /api/v2/leaderboards?metric=legacy_score&position=QB`
- Username report: `POST /api/v2/leaderboard-reports`
- Private overview: `GET /api/v1/admin/stats/overview` (`ADMIN_API_KEY` bearer token)
- Private retention: `GET /api/v1/admin/stats/retention` (`ADMIN_API_KEY` bearer token)
- Private career funnel: `GET /api/v1/admin/stats/funnel`
- Private balance report: `GET /api/v1/admin/stats/balance`
- Private leaderboard health: `GET /api/v1/admin/stats/leaderboard-health`
- Private feedback: `GET/PATCH /api/v1/admin/feedback...`
- Private username moderation: `GET/PATCH /api/v1/admin/username-reports...`
- Private dashboard: `GET /admin` (HTTP Basic using the dashboard credentials)

Leaderboard legacy scores are calculated again on the server. Static ceilings and
monotonic progression checks reject impossible career totals, and rejection reasons
are retained without accepting the submitted score into public results.

## Deploy on Railway

1. Use `.railway/railway.ts` in the neighboring `howeth-studio-web` repository as
   the canonical production topology.
2. Pull production state and reject any plan that replaces or deletes the existing
   Postgres service, volume, backup bucket, or domains.
3. Confirm the API service `DATABASE_URL` references the existing Postgres resource.
4. Preserve `ADMIN_API_KEY`, `ADMIN_DASHBOARD_PASSWORD`, and a non-default
   `ADMIN_DASHBOARD_USER`. Configure `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`,
   `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `GOOGLE_OAUTH_CLIENT_IDS`, and
   `AUTH_ENCRYPTION_KEY`. Set `FRONTEND_ORIGIN=https://howethstudio.com,https://www.howethstudio.com`.
5. Railway runs `npm run db:migrate` before deploy, starts the API, and checks `/health`.
6. Map `api.howethstudio.com` to the API service and use that stable origin in native release builds.
7. Enable Railway Postgres point-in-time recovery before collecting production events.

Keep `LEGACY_LEADERBOARDS_ENABLED=true` while the account-enabled app rolls out,
then set it to `false` so anonymous v1 leaderboard reads/writes return HTTP 410.
Do not expose admin keys, Apple private keys, or encryption secrets to the app or
any `EXPO_PUBLIC_` variable.

## Connect the marketing contact form

Set `NEXT_PUBLIC_CARENOTE_SUPPORT_FORM_ENDPOINT` on the frontend to the deployed URL plus `/api/contact`. Set Football Era's `EXPO_PUBLIC_API_URL` to the API origin only when building the next App Store release.

## Elevenward career and social features

`migrations/010_elevenward_career_social.sql` adds account-private Hall of Fame
archives, bilateral opt-in friend comparisons, hashed expiring invitation codes,
blocking, and immutable weekly challenge definitions/attempts. It extends the
shared feedback inbox with product filters, support codes and strictly allowlisted
diagnostics. Account deletion cascades all new account-owned records. Archives
are never automatically published; deleting a playable slot does not delete its
explicit archive. Feedback has no account link and retains the shared twelve-month
retention policy. Existing career/rules versions retain their legacy scoring.

See [the API contract](docs/ELEVENWARD_CAREER_SOCIAL_API.md) for client behavior.
The Dockerfile builds the vendored pure Dart 2026.5/2026.4.0 replay helper and uses
`ELEVENWARD_REPLAY_EXECUTABLE=/app/bin/challenge-replay`. Challenge scoring executes
the actual deterministic engine; unavailable verifiers return 503 and never store
an unverified submission. Weekly definitions are created lazily using Monday UTC
boundaries, so no cron is required. All participants receive the same immutable
seed and standard eight-match configuration, with no purchase modifiers or prizes.
The Docker build requires a new deployment; these routes cannot become live solely
through a client release.

Additional local verification with a disposable migrated PostgreSQL instance:

```bash
node scripts/verifyReplaySource.js
TASK_TEST_DATABASE_URL=postgresql://localhost/disposable node scripts/verifyElevenwardFeatures.js
ELEVENWARD_REPLAY_EXECUTABLE=/path/to/compiled-helper TASK_TEST_DATABASE_URL=postgresql://localhost/disposable node scripts/verifyWeeklyChallenge.js
ELEVENWARD_REPLAY_EXECUTABLE=/path/to/compiled-helper TASK_TEST_DATABASE_URL=postgresql://localhost/disposable node scripts/verifyLatestConflict.js
```

The `linux-runtime` CI job builds the production Dockerfile and runs these checks
inside the Linux image against a disposable PostgreSQL 17 service. It requires no
production credentials and does not deploy to Railway.
