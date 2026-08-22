# Howeth Studio API

Railway-ready Express + PostgreSQL API for the Howeth Studio site and Football Era. Football Era stays local-first and playable as a guest. Anonymous analytics remain separate from optional Apple/Google accounts; signed-in accounts receive cloud career slots and automatically publish verified career summaries to the online leaderboards.

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
- Apple/Google sign-in: `POST /api/v2/auth/apple` and `POST /api/v2/auth/google`
- Account/session: `GET /api/v2/account`, `POST /api/v2/auth/sign-out`, `DELETE /api/v2/account`
- Cloud career slots: `GET/PUT /api/v2/save-slots` (account bearer token)
- Account career publication: `PUT/DELETE /api/v2/careers/:careerId`
- Account leaderboard: `GET /api/v2/leaderboards?metric=legacy_score&position=QB`
- Private overview: `GET /api/v1/admin/stats/overview` (`ADMIN_API_KEY` bearer token)
- Private retention: `GET /api/v1/admin/stats/retention` (`ADMIN_API_KEY` bearer token)
- Private career funnel: `GET /api/v1/admin/stats/funnel`
- Private balance report: `GET /api/v1/admin/stats/balance`
- Private leaderboard health: `GET /api/v1/admin/stats/leaderboard-health`
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
