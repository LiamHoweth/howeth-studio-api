# Both official images are pinned to the manifests verified during implementation.
FROM dart:3.13.2@sha256:1f86408456fbcdc5f9c33fa267d3680d86e79c255ec338b9a215459224769770 AS replay-build
WORKDIR /core
COPY vendor/elevenward_core/ ./
RUN dart pub get && dart compile exe bin/replay_weekly_challenge.dart -o /challenge-replay

FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS api
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY migrations/ ./migrations/
COPY vendor/elevenward_core/ ./vendor/elevenward_core/
RUN node scripts/verifyReplaySource.js
COPY --from=replay-build /runtime/ /
COPY --from=replay-build /challenge-replay /app/bin/challenge-replay
ENV NODE_ENV=production ELEVENWARD_REPLAY_EXECUTABLE=/app/bin/challenge-replay
USER node
CMD ["npm", "start"]
