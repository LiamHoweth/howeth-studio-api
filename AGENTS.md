# Repository guide for coding agents

## Purpose

This is the Howeth Studio API deployed as a Railway service with Railway Postgres. It serves the studio contact endpoint and Football Era's anonymous retention and opt-in leaderboard features.

## Architecture

- `src/app.js`: HTTP routes, authentication, rate limits, and response mapping.
- `src/database.js`: parameterized PostgreSQL queries only.
- `src/validation.js`: allowlisted payload validation and property stripping.
- `migrations/`: append-only SQL migrations applied by `npm run db:migrate` before deployment.
- `railway.toml`: Railway build, migration, start, restart, and health-check policy.

## Privacy and security invariants

- Football Era remains anonymous and local-first; never accept or store a complete save file.
- Store only SHA-256 hashes of installation bearer tokens.
- Event names and properties must be explicitly allowlisted. Do not accept arbitrary analytics properties.
- Career display names are stored only when `leaderboardOptIn` is true.
- `ADMIN_API_KEY` must remain server-side and must never be placed in an app or public environment variable.
- Use parameterized SQL. Never interpolate request input into SQL identifiers or values.
- Deleting an installation must cascade to events and career snapshots.

## Required validation

```bash
npm ci
npm test
npm audit --audit-level=high
```

For schema changes, add a new numbered migration; never rewrite a migration that may have run in production.

## Commit and pull request descriptions

Explain the API contract, migration behavior, privacy/security impact, Railway configuration impact, and validation performed.
