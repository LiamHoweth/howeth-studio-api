import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import express from "express";
import { createContentSigner, createContentStore, prepareContentRelease } from "./elevenwardContent.js";
import {
  canonicalJson,
  leaderboardRejection,
  sha256,
  validateAnalytics,
  validateConflictResolution,
  validateConsent,
  validateContentBundle,
  validateLeaderboardQuery,
  validateLeaderboardSubmission,
  validateRevenueCatEvent,
  validateSyncRequest
} from "./elevenwardValidation.js";
import { validateProviderCredential } from "./validation.js";

const SESSION_DAYS = 90;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function bearer(req) {
  const value = req.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function secureEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function basic(req) {
  const value = req.get("authorization");
  if (!value?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    return separator > 0 ? { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) } : null;
  } catch {
    return null;
  }
}

function staffActor(req, env) {
  if (env.ADMIN_API_KEY && secureEqual(bearer(req), env.ADMIN_API_KEY)) {
    return hash(`api-key:${env.ADMIN_API_KEY}`);
  }
  const credentials = basic(req);
  if (
    credentials && env.ADMIN_DASHBOARD_USER && env.ADMIN_DASHBOARD_PASSWORD &&
    secureEqual(credentials.username, env.ADMIN_DASHBOARD_USER) &&
    secureEqual(credentials.password, env.ADMIN_DASHBOARD_PASSWORD)
  ) {
    return hash(`staff:${credentials.username}`);
  }
  return null;
}

function releaseResponse(row) {
  if (!row) return null;
  return {
    releaseVersion: row.release_version,
    compatibleClient: { minimum: row.min_client_version, maximum: row.max_client_version ?? null },
    checksum: `sha256:${row.checksum}`,
    signature: row.signature,
    signatureAlgorithm: "Ed25519",
    locales: row.locales,
    assets: [{ kind: "content-bundle", url: row.public_url, checksum: `sha256:${row.checksum}` }],
    status: row.status,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null
  };
}

export function createElevenwardRouter({
  database,
  env = process.env,
  providerAuth,
  contentStore = createContentStore(env),
  contentSigner = createContentSigner(env)
}) {
  const router = express.Router();

  router.get("/health", async (_req, res, next) => {
    try {
      const ready = await database.ping();
      return res.status(ready ? 200 : 503).json({ ok: ready, service: "elevenward-api", schema: "elevenward" });
    } catch (error) {
      return next(error);
    }
  });

  async function requireAccount(req, res, next) {
    try {
      const token = bearer(req);
      if (!token || token.length < 32 || token.length > 200) return res.status(401).json({ error: "Unauthorized" });
      const account = await database.findAccountBySessionTokenHash(hash(token));
      if (!account) return res.status(401).json({ error: "Unauthorized" });
      req.elevenwardAccount = account;
      req.elevenwardSessionHash = hash(token);
      return next();
    } catch (error) {
      return next(error);
    }
  }

  function requireStaff(req, res, next) {
    const actorHash = staffActor(req, env);
    if (actorHash) {
      req.elevenwardStaffActorHash = actorHash;
      return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="Elevenward content studio", charset="UTF-8"');
    return res.status(401).json({ error: "Unauthorized" });
  }

  async function auditStaff(req, action, resourceId, metadata = {}) {
    if (!database.recordStaffAction) return;
    await database.recordStaffAction({
      actorHash: req.elevenwardStaffActorHash,
      action,
      resourceType: "content_release",
      resourceId,
      metadata
    });
  }

  async function signIn(provider, req, res, next) {
    try {
      const credential = validateProviderCredential(provider, req.body);
      if (!credential) return res.status(400).json({ error: "Invalid provider credential" });
      const identity = provider === "apple"
        ? await providerAuth.verifyApple(credential)
        : await providerAuth.verifyGoogle(credential);
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
      const account = await database.createAccountSession({ identity, tokenHash: hash(token), expiresAt });
      return res.json({
        account: { id: account.id, alias: account.alias, provider: account.provider, email: account.email ?? null },
        accessToken: token,
        expiresAt: expiresAt.toISOString()
      });
    } catch (error) {
      if (error?.code?.startsWith("ERR_J") || /identity|credential|token exchange/i.test(error?.message ?? "")) {
        return res.status(401).json({ error: "Provider authentication failed" });
      }
      return next(error);
    }
  }

  router.post("/auth/apple", (req, res, next) => signIn("apple", req, res, next));
  router.post("/auth/google", (req, res, next) => signIn("google", req, res, next));

  router.get("/account", requireAccount, (req, res) => {
    const account = req.elevenwardAccount;
    res.json({
      account: { id: account.id, alias: account.alias, provider: account.provider, email: account.verified_email ?? null },
      expiresAt: new Date(account.expires_at).toISOString()
    });
  });

  router.post("/auth/sign-out", requireAccount, async (req, res, next) => {
    try {
      await database.revokeSession(req.elevenwardSessionHash);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/account", requireAccount, async (req, res, next) => {
    try {
      const identities = await database.getAccountIdentities(req.elevenwardAccount.id);
      for (const identity of identities) {
        if (identity.provider === "apple" && identity.apple_refresh_token_ciphertext) {
          await providerAuth.revokeApple(identity.apple_refresh_token_ciphertext);
        }
      }
      await database.deleteAccount(req.elevenwardAccount.id, hash(req.elevenwardAccount.id));
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.post("/account/deletion-challenge", requireAccount, async (req, res, next) => {
    try {
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      const challenge = await database.createDeletionChallenge(req.elevenwardAccount.id, hash(code), expiresAt);
      return res.status(201).json({
        accountId: req.elevenwardAccount.id,
        deletionCode: code,
        expiresAt: new Date(challenge.expires_at).toISOString()
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/account/deletion-confirm", async (req, res, next) => {
    try {
      const accountId = typeof req.body?.accountId === "string" && /^[0-9a-f-]{36}$/i.test(req.body.accountId)
        ? req.body.accountId.toLowerCase()
        : null;
      const code = typeof req.body?.deletionCode === "string" && /^\d{6}$/.test(req.body.deletionCode)
        ? req.body.deletionCode
        : null;
      if (!accountId || !code) return res.status(400).json({ error: "Invalid deletion confirmation" });
      if (database.verifyDeletionChallenge && !await database.verifyDeletionChallenge(accountId, hash(code))) {
        return res.status(400).json({ error: "Deletion code is invalid or expired" });
      }
      const identities = await database.getAccountIdentities(accountId);
      for (const identity of identities) {
        if (identity.provider === "apple" && identity.apple_refresh_token_ciphertext) {
          await providerAuth.revokeApple(identity.apple_refresh_token_ciphertext);
        }
      }
      const deleted = await database.confirmDeletion(accountId, hash(code), hash(accountId));
      return deleted ? res.status(204).end() : res.status(400).json({ error: "Deletion code is invalid or expired" });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/career-slots", requireAccount, async (req, res, next) => {
    try {
      return res.json({ slots: await database.getCareerSlots(req.elevenwardAccount.id) });
    } catch (error) {
      return next(error);
    }
  });

  router.put("/career-slots/:slotIndex/sync", requireAccount, async (req, res, next) => {
    try {
      const sync = validateSyncRequest(req.params.slotIndex, req.body);
      if (!sync) return res.status(400).json({ error: "Invalid SyncRequest" });
      const result = await database.syncCareer(req.elevenwardAccount.id, sync);
      return res.status(result.status).json(result.body);
    } catch (error) {
      if (error?.code === "IDEMPOTENCY_MISMATCH") return res.status(422).json({ error: error.message });
      return next(error);
    }
  });

  router.delete("/career-slots/:slotIndex", requireAccount, async (req, res, next) => {
    try {
      const slotIndex = Number(req.params.slotIndex);
      const baseRevision = Number(req.query.baseRevision);
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 4 ||
          !Number.isSafeInteger(baseRevision) || baseRevision < 0) {
        return res.status(400).json({ error: "Invalid slot deletion request" });
      }
      const result = await database.deleteCareerSlot(
        req.elevenwardAccount.id,
        slotIndex,
        baseRevision
      );
      return result.status === 204
        ? res.status(204).end()
        : res.status(result.status).json(result.body);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/career-slots/:slotIndex/conflicts", requireAccount, async (req, res, next) => {
    try {
      const slotIndex = Number(req.params.slotIndex);
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 4) return res.status(400).json({ error: "Invalid slot" });
      return res.json({ conflicts: await database.listConflicts(req.elevenwardAccount.id, slotIndex) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/career-slots/:slotIndex/conflicts/:conflictId/resolve", requireAccount, async (req, res, next) => {
    try {
      const slotIndex = Number(req.params.slotIndex);
      const resolution = validateConflictResolution(req.body);
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 4 ||
          !/^[0-9a-f-]{36}$/i.test(req.params.conflictId) || !resolution) {
        return res.status(400).json({ error: "Invalid conflict resolution" });
      }
      const slot = await database.resolveConflict(
        req.elevenwardAccount.id,
        slotIndex,
        req.params.conflictId,
        resolution.choice,
        (snapshot) => validateSyncRequest(slotIndex, {
          baseRevision: 0,
          idempotencyKey: "00000000-0000-4000-8000-000000000000",
          snapshot
        })
      );
      return slot === undefined
        ? res.status(404).json({ error: "Pending conflict not found" })
        : res.json({ slot, resolution: resolution.choice });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/content/manifest", async (_req, res, next) => {
    try {
      const release = await database.getContentManifest();
      if (!release) return res.status(404).json({ error: "No published content release" });
      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
      return res.json(releaseResponse(release));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/content/manifests/:releaseVersion", async (req, res, next) => {
    try {
      const version = typeof req.params.releaseVersion === "string" && req.params.releaseVersion.length <= 64
        ? req.params.releaseVersion : null;
      if (!version) return res.status(400).json({ error: "Invalid release version" });
      const release = await database.getContentManifest(version);
      return release && release.published_at ? res.json(releaseResponse(release)) : res.status(404).json({ error: "Content release not found" });
    } catch (error) {
      return next(error);
    }
  });

  // Railway buckets are private. Expose only exact, previously published
  // content-addressed objects; never proxy arbitrary bucket keys or drafts.
  router.get("/content/objects/elevenward/content/:releaseVersion/:filename", async (req, res, next) => {
    try {
      const { releaseVersion, filename } = req.params;
      if (releaseVersion.length > 32 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/.test(releaseVersion) || !/^[a-f0-9]{64}\.json$/.test(filename)) {
        return res.status(404).json({ error: "Content object not found" });
      }
      const key = `elevenward/content/${releaseVersion}/${filename}`;
      const release = await database.getContentManifest(releaseVersion);
      if (!release?.published_at || release.object_key !== key) {
        return res.status(404).json({ error: "Content object not found" });
      }
      const bytes = await contentStore.get(key);
      if (Buffer.byteLength(bytes) > 5_000_000 || `${sha256(bytes)}.json` !== filename) {
        return res.status(502).json({ error: "Content object failed integrity verification" });
      }
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      res.set("X-Content-Type-Options", "nosniff");
      return res.type("application/json").send(bytes);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/leaderboards/submissions", requireAccount, async (req, res, next) => {
    try {
      const submission = validateLeaderboardSubmission(req.body);
      if (!submission) return res.status(400).json({ error: "Invalid LeaderboardSubmission" });
      const rejection = leaderboardRejection(submission);
      await database.upsertLeaderboardSubmission(
        req.elevenwardAccount.id,
        req.elevenwardAccount.alias,
        submission,
        rejection
      );
      return rejection
        ? res.status(422).json({ error: "Submission rejected", reason: rejection })
        : res.status(202).json({ accepted: true, alias: req.elevenwardAccount.alias });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/leaderboards", async (req, res, next) => {
    try {
      const query = validateLeaderboardQuery(req.query);
      if (!query) return res.status(400).json({ error: "position, difficulty, and rulesVersion are required" });
      const rows = await database.getLeaderboard(query);
      return res.json({
        board: { position: query.position, difficulty: query.difficulty, rulesVersion: query.rulesVersion },
        entries: rows.map((row, index) => ({
          rank: index + 1,
          alias: row.alias,
          careerId: row.career_id,
          legacyScore: Number(row.legacy_score),
          aggregateMetrics: row.aggregate_metrics,
          updatedAt: new Date(row.updated_at).toISOString()
        })),
        notice: "Offline careers cannot be perfectly cheat-proof; this board awards no prizes."
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/entitlements", requireAccount, async (req, res, next) => {
    try {
      const rows = await database.getEntitlements(req.elevenwardAccount.id);
      return res.json({ entitlements: rows.map((row) => ({
        id: row.entitlement_id,
        productId: row.product_id,
        sourceStore: row.source_store,
        transactionId: row.transaction_id,
        state: row.state,
        purchasedAt: row.purchased_at ? new Date(row.purchased_at).toISOString() : null,
        updatedAt: new Date(row.updated_at).toISOString()
      })) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/webhooks/revenuecat", async (req, res, next) => {
    try {
      if (!env.REVENUECAT_WEBHOOK_SECRET || !secureEqual(bearer(req), env.REVENUECAT_WEBHOOK_SECRET)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const event = validateRevenueCatEvent(req.body);
      if (!event) return res.status(400).json({ error: "Invalid RevenueCat event" });
      const result = await database.processRevenueCatEvent(event, sha256(canonicalJson(req.body)));
      return res.status(202).json({ accepted: true, duplicate: result.duplicate });
    } catch (error) {
      return next(error);
    }
  });

  router.put("/analytics/consent", requireAccount, async (req, res, next) => {
    try {
      const consent = validateConsent(req.body);
      if (!consent) return res.status(400).json({ error: "Invalid analytics consent" });
      const row = await database.setAnalyticsConsent(req.elevenwardAccount.id, consent);
      return res.json({ state: row.state, policyVersion: row.policy_version, updatedAt: new Date(row.updated_at).toISOString() });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/analytics/events", requireAccount, async (req, res, next) => {
    try {
      const events = validateAnalytics(req.body);
      if (!events) return res.status(400).json({ error: "Invalid analytics events" });
      const result = await database.insertAnalyticsEvents(req.elevenwardAccount.id, events);
      return result.consent
        ? res.status(202).json({ accepted: result.accepted })
        : res.status(403).json({ error: "Analytics consent not granted" });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/admin/content/validate", requireStaff, (req, res) => {
    const report = validateContentBundle(req.body);
    return res.status(report.valid ? 200 : 422).json(report);
  });

  router.post("/admin/content/preview", requireStaff, (req, res) => {
    const report = validateContentBundle(req.body);
    return res.status(report.valid ? 200 : 422).json({
      ...report,
      preview: report.valid ? {
        featuredClubs: req.body.clubs.slice(0, 6),
        featuredSituations: req.body.matchSituations.slice(0, 4),
        featuredEvents: req.body.events.slice(0, 4)
      } : null
    });
  });

  router.post("/admin/content/releases", requireStaff, async (req, res, next) => {
    try {
      const prepared = prepareContentRelease(req.body, contentSigner);
      if (!prepared.validation.valid) return res.status(422).json(prepared.validation);
      const publicUrl = await contentStore.put(prepared.objectKey, prepared.bytes);
      const row = await database.createContentRelease({
        releaseVersion: prepared.validation.releaseVersion,
        minClientVersion: prepared.validation.minClientVersion,
        maxClientVersion: prepared.validation.maxClientVersion,
        locales: prepared.validation.locales,
        checksum: prepared.checksum,
        signature: prepared.signature,
        objectKey: prepared.objectKey,
        publicUrl,
        manifest: { ...prepared.manifest, assets: [{ ...prepared.manifest.assets[0], url: publicUrl }] },
        validationReport: prepared.validation
      });
      await auditStaff(req, "content_release_created", prepared.validation.releaseVersion, {
        checksum: prepared.checksum,
        locales: prepared.validation.locales
      });
      return res.status(201).json(releaseResponse(row));
    } catch (error) {
      if (error?.code === "23505") return res.status(409).json({ error: "Release version already exists" });
      return next(error);
    }
  });

  router.get("/admin/content/releases", requireStaff, async (_req, res, next) => {
    try {
      const rows = await database.listContentReleases();
      return res.json({ releases: rows.map(releaseResponse) });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/admin/operations", requireStaff, async (_req, res, next) => {
    try {
      const summary = database.getOperationalSummary
        ? await database.getOperationalSummary()
        : null;
      const actions = database.listStaffActions
        ? await database.listStaffActions(25)
        : [];
      return res.json({ summary, actions, generatedAt: new Date().toISOString() });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/admin/content/releases/:releaseVersion/preview", requireStaff, async (req, res, next) => {
    try {
      const row = await database.getContentManifest(req.params.releaseVersion);
      if (!row) return res.status(404).json({ error: "Content release not found" });
      const bundle = JSON.parse(await contentStore.get(row.object_key));
      return res.json({ release: releaseResponse(row), validation: row.validation_report, bundle });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/admin/content/releases/:releaseVersion/publish", requireStaff, async (req, res, next) => {
    try {
      const row = await database.publishContentRelease(req.params.releaseVersion);
      if (row) {
        await auditStaff(req, "content_release_published", req.params.releaseVersion);
      }
      return row ? res.json(releaseResponse(row)) : res.status(404).json({ error: "Content release not found" });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/admin/content/releases/:releaseVersion/rollback", requireStaff, async (req, res, next) => {
    try {
      const row = await database.rollbackContentRelease(req.params.releaseVersion);
      if (row) {
        await auditStaff(req, "content_release_rollback", req.params.releaseVersion);
      }
      return row ? res.json({ rolledBackTo: releaseResponse(row) }) : res.status(404).json({ error: "Content release not found" });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
