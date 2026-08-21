# Howeth Studio API

Railway-ready Express + PostgreSQL API for the Howeth Studio site and Football Era. Football Era stays local-first: the server stores an anonymous installation, a small allowlisted set of retention events, aggregate career snapshots, and only publishes a career name when the player opts into public leaderboards.

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
- Private overview: `GET /api/v1/admin/stats/overview` (`ADMIN_API_KEY` bearer token)
- Private retention: `GET /api/v1/admin/stats/retention` (`ADMIN_API_KEY` bearer token)

## Deploy on Railway

1. Create a Railway project from this backend GitHub repository.
2. Add a PostgreSQL service.
3. Add a `DATABASE_URL` reference on the API service pointing to the Postgres service.
4. Add `ADMIN_API_KEY` with a long random value and `FRONTEND_ORIGIN=https://howethstudio.com,https://www.howethstudio.com`.
5. Railway reads `railway.toml`, runs migrations before deploy, starts the API, and checks `/health`.
6. Generate a Railway domain, then optionally map `api.howethstudio.com`.

Do not expose `ADMIN_API_KEY` to the iOS app or any `EXPO_PUBLIC_` variable.

## Connect the marketing contact form

Set `NEXT_PUBLIC_CARENOTE_SUPPORT_FORM_ENDPOINT` on the frontend to the deployed URL plus `/api/contact`. Set Football Era's `EXPO_PUBLIC_API_URL` to the API origin only when building the next App Store release.
