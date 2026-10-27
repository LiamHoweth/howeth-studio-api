# Football save-format coexistence validation

This implementation is validated locally and has not been deployed.

Football clients declare `x-football-era-save-version`; missing headers mean the
released reader capability of 8. Current Football source declares envelope 9 on
both compatibility GET and save PUT. GET returns 426 without career payloads when
any stored slot exceeds that reader. PUT rejects a target format downgrade with
409, and rejects unreadable account-wide responses with 426, including empty
uploads and updates to a different slot. The client preserves local careers and
reports the existing unsupported-format status on either response.

The database transaction locks the Football account row before reading existing
slots. This serializes absent-slot first inserts. It checks all inputs and stored
versions before writing, captures the entire response and validates its version
while still locked, then commits and returns that capture. Timestamp ties retain
the cloud snapshot. A rejected mixed batch rolls back completely. No database
migration, new cloud field, personal-data collection, authentication policy or
Elevenward route/schema change was introduced.

## Validation

- Fresh `npm ci` passed with the final lock.
- Full service tests passed **70/70**, zero skipped, with the actual isolated
  PostgreSQL suite enabled. This includes ten protected first-insert races, an
  immediately queued future writer whose data cannot enter the earlier reader's
  captured response, mixed-batch rollback, empty/all-slot response checks,
  unchanged Elevenward tests and the existing authentication/privacy tests.
- Football's focused account suite passed **33/33**, including headers on GET/PUT,
  preflight rejection and 409/426 responses preserving local state.
- Final `npm audit --audit-level=high --json` exited 0 with zero findings.

The initial audit exited 1 with one critical `proxy-addr` advisory. The lock-only
repair changes its official patch release from 2.0.7 to 2.0.8 within Express's
existing `^2.0.7` consumer range. Direct dependencies and trust-proxy configuration
are unchanged. Regression tests reject IPv4-mapped clients borrowing native IPv6
subnet trust while retaining valid explicit IPv4/mapped trust. The fixed release
is documented by the [official GitHub advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).

Initial lock SHA-256: `70707cf24945215ad1f8e36530f2f405f079f95e8e64d8063181979a2181d512`.
Final lock SHA-256: `d298f2827d943dcbbbce3724f8a3b55fec0aa154cdd77374a3bebf1cdeb08b72`.
Original source/dirty-note snapshots and raw gate reports are retained under
`/tmp/football-era-save-version-20261013/`. The disposable PostgreSQL cluster was
stopped and removed after validation; no real accounts or production database
operations occurred.

## Release boundary

Deploy the guarded service before distributing the envelope-9 client. Until this
server implementation is deployed, an already released client that ignores cloud
version metadata can still misread or replace a newer slot. After guarded rollout,
older clients retain local play and receive a failed cloud sync for accounts that
contain a newer format. Local source/tests do not establish live deployment,
physical-device acceptance or App Store distribution.
