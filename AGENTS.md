# Repository guide for coding agents

## Purpose

This is the Howeth Studio API deployed as a Railway service with Railway Postgres.
It serves the studio contact endpoint, Football Era anonymous analytics, optional
accounts, cloud career saves, and authenticated leaderboards.

## Architecture

- `src/app.js`: HTTP routes, authentication, rate limits, and response mapping.
- `src/database.js`: parameterized PostgreSQL queries only.
- `src/validation.js`: allowlisted payload validation and property stripping.
- `migrations/`: append-only SQL migrations applied by `npm run db:migrate` before deployment.
- The canonical production topology is `.railway/railway.ts` in the neighboring
  `howeth-studio-web` repository. This repository must not maintain a second copy.

## Privacy and security invariants

- Football Era remains guest-capable and local-first. Account cloud sync accepts only
  bounded, versioned durable career slots and excludes purchases, preferences,
  reminders, and transient UI state.
- Store only SHA-256 hashes of installation bearer tokens.
- Store only SHA-256 hashes of account session tokens. Provider subjects and verified
  emails must remain attached to their provider-specific accounts.
- Event names and properties must be explicitly allowlisted. Do not accept arbitrary analytics properties.
- Authenticated occupied careers publish automatically; guests cannot use online
  leaderboard endpoints.
- `ADMIN_API_KEY` must remain server-side and must never be placed in an app or public environment variable.
- Use parameterized SQL. Never interpolate request input into SQL identifiers or values.
- Deleting an installation must cascade to events and anonymous career snapshots.
  Deleting an account must cascade to sessions, identities, cloud saves, published
  careers, and leaderboard audits.

## Required validation

```bash
npm ci
npm test
npm audit --audit-level=high
```

For schema changes, add a new numbered migration; never rewrite a migration that may have run in production.

## Commit and pull request descriptions

Explain the API contract, migration behavior, privacy/security impact, Railway configuration impact, and validation performed.
