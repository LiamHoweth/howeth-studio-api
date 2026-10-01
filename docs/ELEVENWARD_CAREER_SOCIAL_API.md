# Elevenward career and social APIs

All paths below are under `/v1/elevenward`. All routes require an account bearer token except feedback. No endpoint accepts an authoritative client score. Dates use ISO 8601 UTC. Errors are HTTP 4xx/5xx with `{error}`; submitted requests must be treated as failed until a success response arrives.

- `GET /leaderboards?position=...&difficulty=...&rulesVersion=...&limit=25&careerId=<optional owned uuid>` retains `board,entries,notice`, and adds `myEntry` (nullable), `nearbyEntries` (up to five around that entry), `totalEntries`. Every entry uses existing `rank,alias,profileId,isCurrentUser,reportable,careerId,legacyScore,aggregateMetrics,updatedAt`. Global order is score descending, update time ascending, submission UUID ascending. When careerId is absent, selects the account's highest ranked career. No consent means no My rank.
- `POST /feedback`: `{submissionId:<uuid>,category:'bug'|'feature'|'purchase'|'other',message,contactEmail:<optional>,platform:'ios'|'android'|'web'|'macos'|'other',appVersion,supportCode:<optional>,diagnostics:<optional object>}`. Diagnostics are included only after user reviews them, and accept exactly `schemaVersion,rulesVersion,contentVersion,locale,area,errorCode,syncState` (bounded scalar values). Returns 201 for new or 200 for retry `{received:true,submissionId,supportCode}`. Guest-capable; do not include saves/tokens/player names. Limit five submissions/hour/IP.
- `GET /career-archives`: `{archives:[{careerId,snapshot,legacyScore,archivedAt}]}`. `POST /career-archives`: `{snapshot:<retired career>}` returns 201 `{archive:{...}}`; retries with identical snapshot return 200. Archives are private, independent of slots; maximum 40/account. `DELETE /career-archives/:careerId` returns 204. Archive before freeing slot; network failure must preserve career.
- `PUT /account/friend-comparison-sharing`: `{enabled:<bool>}` returns `{enabled}`. Default false; this consent is independent of public leaderboard sharing.
- `GET /friends`: `{comparisonSharingEnabled,friends:[{profileId,alias,comparisonAvailable,careers:[{position,difficulty,rulesVersion,legacyScore,aggregateMetrics}]}],incomingRequests:[{requestId,profileId,alias,createdAt}],outgoingRequests:[...],blocked:[{profileId}]}`. Comparisons require accepted friendship and both accounts' explicit comparison consent. Only bounded server-derived metrics leave account; no names, saves, seeds, email or account IDs.
- `POST /friends/invite-code`: body `{}` -> `{inviteCode,expiresAt}` (24h; issuing new code invalidates old). Invite code is an 8-character uppercase random code stored as hash.
- `POST /friends/requests`: `{inviteCode}` -> 201/200 `{requestId,status:'pending'|'accepted'}`. No searchable public user directory.
- `POST /friends/requests/:requestId/respond`: `{accept:<bool>}` -> `{status:'accepted'|'rejected'}`; only recipient may respond.
- `DELETE /friends/:profileId`: 204 removes accepted/pending relation.
- `POST /friends/:profileId/block`: 204 removes relation and prevents new requests both ways. `DELETE /friends/:profileId/block`: 204 unblocks only caller's block.
- `GET /challenges/current`: `{challenge:{id,title,startsAt,endsAt,rulesVersion,contentVersion,matchCount:8,configuration},attempt:<nullable>,entries:[{rank,alias,score,isCurrentUser}]}`. Configuration is pinned at week creation. Week is Monday 00:00 UTC through next Monday; server creation is lazy/idempotent.
- `POST /challenges/:id/enroll`: `{}` -> 201/200 `{challenge,attempt:{attemptId,seed,careerId,status,score:<nullable>,enrolledAt}}`. One immutable attempt/account/week; same standardized seed/configuration for all players.
- `POST /challenges/:id/submit`: `{attemptId,actions:[{focus:<attribute>,intensity:'light'|'balanced'|'intensive',spotlightApproach:'safe'|'balanced'|'bold'}]}` -> `{accepted:true,attemptId,score,rank}`. Server executes pinned pure Dart engine using stored initial configuration and actions, verifies exactly eight match-completing advances, and stores derived score. Identical retries are idempotent; a different replay after submission returns 409. Closed weeks refuse enrollment/submission. Prize-free, identical progression with no paid boosts.

Account deletion cascades archives, social links/requests/blocks/invites and challenge attempts. Feedback retention is twelve months and stores no account link. Admin feedback filters accept `product=elevenward|football_era|studio` on the shared inbox. Build must install the verified pinned Dart replay executable; unavailable replay returns HTTP 503 and never accepts scores.

## Conflict resolution without losing continued local progress

`POST /career-slots/:slotIndex/conflicts/:conflictId/resolve` accepts the existing
`{choice,publishLeaderboard}` contract. A current client choosing local should send
`localSnapshot:<latest durable snapshot>` and `expectedRemoteRevision:<conflict.remoteRevision>`.
The server verifies pending conflict ownership, slot and current cloud revision,
then requires matching career ID, rules/content/position/difficulty and
nondecreasing schema/revision/season/career totals. RNG seed may evolve through
ordinary matches. It publishes a freshly server-derived score. A changed cloud
returns 409 `conflict_remote_changed`; an invalid lineage returns 422
`conflict_local_snapshot_mismatch`. Both leave the pending conflict and cloud save
untouched. Clients must also guard their own local save generation while awaiting
the response so a later local action cannot be overwritten by an earlier receipt.
