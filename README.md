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

## Private studio console

`/admin` uses the existing dashboard credentials and provides a shared app
workspace, feedback inbox and app-scoped username moderation. The app directory
is declared in `src/adminApps.js`; update this inventory when projects change.
A project can be listed before its backend is connected. Only configured adapters
request data: Football Era aggregates remain Football-only, and Elevenward uses
its existing operations, content release and moderation APIs. Other projects show
an explicit missing-connection state, never another app's metrics or invented zeros.

Console HTML, CSS and browser behavior are in `src/adminDashboard.js` and
`src/admin/`. The protected `GET /api/v1/admin/apps` supplies the capability map.
The shared feedback GET accepts an exact catalog `product` ID; unknown or malformed
filters return 400. Omitting `product` selects the existing shared inbox.

## Football Era growth measurement

`GET /api/v1/admin/stats/growth?environment=production&channel=app_store&version=`
uses the existing admin bearer/Basic authentication. The Football Era console
workspace displays it with environment, channel and optional version filters.
Unconfigured/legacy data is identified in coverage, never silently relabeled as
production. Existing legacy ingestion remains valid, and the bounded schema-2
paid event contract is accepted so mixed client batches do not block gameplay
measurement. No schema migration, account linkage, infrastructure or commerce
verification behavior changes.

Growth events: `growth_cohort_started`, `onboarding_started`,
`onboarding_step_completed`, `onboarding_completed`, `career_game_started`,
`career_game_completed`, `first_game_completed`, `reliability_result`. Properties
are explicitly projected in `growthValidation.js`; session/provenance fields are
validated by the shared event boundary. Matching references are random UUIDs,
not career/account IDs. Event retries keep their IDs and existing unique event
constraints deduplicate them; installation deletion continues to cascade.

The cohort is the earliest retained consented growth observation in the selected
environment/channel, within the last 90 days. It is not an install/download date.
“No existing progress” means no occupied career at observation, not proof of a
new person/device. Existing careers are excluded from 24-hour activation. Its
eligible denominator has elapsed 24 hours; D1/D7/D30 session-return denominators
have elapsed 2/8/31 days. Version filters apply to cohort entry; returns after
updates are included. Creation is confirmed after a durable local save. Step
counts are explicit forward confirmations within observed attempts, which may
begin at a resumed step. Gameplay pairs start/completion UUIDs and displays the
starting mode; completion can follow a fallback to decision simulation. Batch or
resumed games without an observed start receive a paired start at commit time;
these are not play-duration or abandonment metrics. First-game timing is coarse
wall time since observation, including background time. Reliability categories
are sampled once per session/operation/result/timing bucket, not operation
success rates, crash rates or raw exception collection.

Run real PostgreSQL metric tests with `TEST_DATABASE_URL` pointing only to a
disposable database. Tests use a connection-local temporary events table; CI
provides PostgreSQL 17. Never run fixture scripts against production. Current
production players will supply new metrics only after an updated app is released
and they opt into analytics. App Store analytics remain a separate source.
