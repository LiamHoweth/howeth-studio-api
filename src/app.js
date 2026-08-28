import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { adminDashboardCss, adminDashboardJs, renderAdminDashboard } from "./adminDashboard.js";
import { createDatabase } from "./database.js";
import { createProviderAuth } from "./providerAuth.js";
import {
  assessCareerPlausibility,
  parseLeaderboardQuery,
  validateAccountCareer,
  validateAppVersion,
  validateCareer,
  validateCloudSaveSlots,
  validateEvents,
  validateInstallation,
  validateProviderCredential
} from "./validation.js";

const ACCOUNT_SESSION_DAYS = 90;

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function leaderboardAlias(ownerId, careerId, position) {
  const suffix = createHash("sha256")
    .update(`${ownerId}:${careerId}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  return `${position} Player ${suffix}`;
}

function secureEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerToken(req) {
  const value = req.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function basicCredentials(req) {
  const value = req.get("authorization");
  if (!value?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 1) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

export function createApp({
  database = createDatabase(),
  env = process.env,
  providerAuth = createProviderAuth(env)
} = {}) {
  const app = express();
  const frontendOrigins = (env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (env.TRUST_PROXY) app.set("trust proxy", Number(env.TRUST_PROXY) || 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: frontendOrigins.length ? frontendOrigins : false }));
  app.use("/api/v2/save-slots", express.json({ limit: "6mb" }));
  app.use(express.json({ limit: "64kb" }));

  const apiLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false });
  const registrationLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
  app.use("/api/", apiLimiter);

  async function requireInstallation(req, res, next) {
    try {
      const token = bearerToken(req);
      if (!token || token.length < 32 || token.length > 200) return res.status(401).json({ error: "Unauthorized" });
      const appVersion = validateAppVersion(req.get("x-app-version"));
      const installation = await database.findInstallationByTokenHash(tokenHash(token), appVersion);
      if (!installation) return res.status(401).json({ error: "Unauthorized" });
      req.installation = installation;
      next();
    } catch (error) {
      next(error);
    }
  }

  async function requireAccount(req, res, next) {
    try {
      const token = bearerToken(req);
      if (!token || token.length < 32 || token.length > 200) return res.status(401).json({ error: "Unauthorized" });
      const account = await database.findAccountBySessionTokenHash(tokenHash(token));
      if (!account) return res.status(401).json({ error: "Unauthorized" });
      req.account = account;
      req.accountSessionTokenHash = tokenHash(token);
      next();
    } catch (error) {
      next(error);
    }
  }

  function requireAdmin(req, res, next) {
    const configuredKey = env.ADMIN_API_KEY;
    if (configuredKey && secureEqual(bearerToken(req), configuredKey)) return next();
    const basic = basicCredentials(req);
    if (
      basic && env.ADMIN_DASHBOARD_USER && env.ADMIN_DASHBOARD_PASSWORD &&
      secureEqual(basic.username, env.ADMIN_DASHBOARD_USER) &&
      secureEqual(basic.password, env.ADMIN_DASHBOARD_PASSWORD)
    ) return next();
    res.set("WWW-Authenticate", 'Basic realm="Football Era developer dashboard", charset="UTF-8"');
    return res.status(401).json({ error: "Unauthorized" });
  }

  function requireDashboard(req, res, next) {
    const basic = basicCredentials(req);
    if (
      basic && env.ADMIN_DASHBOARD_USER && env.ADMIN_DASHBOARD_PASSWORD &&
      secureEqual(basic.username, env.ADMIN_DASHBOARD_USER) &&
      secureEqual(basic.password, env.ADMIN_DASHBOARD_PASSWORD)
    ) return next();
    res.set("WWW-Authenticate", 'Basic realm="Football Era developer dashboard", charset="UTF-8"');
    return res.status(401).send("Authentication required");
  }

  app.get("/health", async (_req, res, next) => {
    try {
      const databaseReady = await database.ping();
      res.status(databaseReady ? 200 : 503).json({
        ok: databaseReady,
        service: "howethstudio-api",
        database: databaseReady ? "ready" : "unavailable",
        uptimeSec: Math.round(process.uptime())
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/contact", (req, res) => {
    const { name, email, subject, message } = req.body || {};
    const values = [name, email, subject, message];
    if (values.some((value) => typeof value !== "string" || !value.trim())) {
      return res.status(400).json({ error: "Invalid payload" });
    }
    if (name.length > 100 || email.length > 254 || subject.length > 160 || message.length > 5000) {
      return res.status(400).json({ error: "Payload too long" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "Invalid email" });
    }
    return res.status(202).json({ received: true });
  });

  app.post("/api/v1/installations", registrationLimiter, async (req, res, next) => {
    try {
      const installation = validateInstallation(req.body);
      if (!installation) return res.status(400).json({ error: "Invalid installation payload" });
      const token = randomBytes(32).toString("base64url");
      const created = await database.createInstallation({ ...installation, tokenHash: tokenHash(token) });
      return res.status(201).json({
        installationId: created.id,
        token,
        createdAt: new Date(created.created_at).toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  async function signIn(provider, req, res, next) {
    try {
      const credential = validateProviderCredential(provider, req.body);
      if (!credential) return res.status(400).json({ error: "Invalid provider credential" });
      const identity = provider === "apple"
        ? await providerAuth.verifyApple(credential)
        : await providerAuth.verifyGoogle(credential);
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + ACCOUNT_SESSION_DAYS * 86_400_000);
      const account = await database.createAccountSession({
        identity,
        tokenHash: tokenHash(token),
        expiresAt
      });
      return res.status(200).json({
        account: { id: account.id, provider: account.provider, email: account.email ?? null },
        accessToken: token,
        expiresAt: expiresAt.toISOString()
      });
    } catch (error) {
      if (error?.code?.startsWith("ERR_J") || /identity|credential|token exchange/i.test(error?.message ?? "")) {
        return res.status(401).json({ error: "Provider authentication failed" });
      }
      next(error);
    }
  }

  app.post("/api/v2/auth/apple", authLimiter, (req, res, next) => signIn("apple", req, res, next));
  app.post("/api/v2/auth/google", authLimiter, (req, res, next) => signIn("google", req, res, next));

  app.get("/api/v2/account", requireAccount, (req, res) => {
    res.json({
      account: {
        id: req.account.id,
        provider: req.account.provider,
        email: req.account.verified_email ?? null
      },
      expiresAt: new Date(req.account.expires_at).toISOString()
    });
  });

  app.post("/api/v2/auth/sign-out", requireAccount, async (req, res, next) => {
    try {
      await database.revokeAccountSession(req.accountSessionTokenHash);
      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/v2/account", requireAccount, async (req, res, next) => {
    try {
      const identities = await database.getAccountIdentities(req.account.id);
      for (const identity of identities) {
        if (identity.provider !== "apple" || !identity.apple_refresh_token_ciphertext) continue;
        await providerAuth.revokeApple(identity.apple_refresh_token_ciphertext);
      }
      await database.deleteAccount(req.account.id);
      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  function mapSaveSlot(row) {
    return {
      slotIndex: Number(row.slot_index),
      saveVersion: Number(row.save_version),
      isOccupied: row.is_occupied,
      payload: row.payload,
      updatedAt: new Date(row.client_updated_at).toISOString(),
      revision: Number(row.revision),
      serverUpdatedAt: new Date(row.server_updated_at).toISOString()
    };
  }

  app.get("/api/v2/save-slots", requireAccount, async (req, res, next) => {
    try {
      const rows = await database.getCloudSaveSlots(req.account.id);
      return res.json({ slots: rows.map(mapSaveSlot) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/v2/save-slots", requireAccount, async (req, res, next) => {
    try {
      const slots = validateCloudSaveSlots(req.body);
      if (!slots) return res.status(400).json({ error: "Invalid cloud save payload" });
      const rows = await database.syncCloudSaveSlots(req.account.id, slots);
      return res.json({ slots: rows.map(mapSaveSlot) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/v2/careers/:careerId", requireAccount, async (req, res, next) => {
    try {
      const career = validateAccountCareer({ ...req.body, careerId: req.params.careerId });
      if (!career) return res.status(400).json({ error: "Invalid career payload" });
      const plausibilityReason = assessCareerPlausibility(career);
      if (plausibilityReason) {
        await database.recordRejectedAccountCareer(req.account.id, career.careerId, plausibilityReason, career);
        return res.status(422).json({ error: "Career snapshot rejected", reason: plausibilityReason });
      }
      const publishedCareer = {
        ...career,
        displayName: leaderboardAlias(req.account.id, career.careerId, career.position)
      };
      const result = await database.upsertAccountCareer(req.account.id, publishedCareer);
      if (result?.accepted === false) {
        return res.status(422).json({ error: "Career snapshot rejected", reason: result.reason });
      }
      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/v2/careers/:careerId", requireAccount, async (req, res, next) => {
    try {
      await database.deleteAccountCareer(req.account.id, req.params.careerId);
      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v2/leaderboards", requireAccount, async (req, res, next) => {
    try {
      const query = parseLeaderboardQuery(req.query);
      if (!query) return res.status(400).json({ error: "Invalid leaderboard query" });
      const rows = await database.getAccountLeaderboard(query);
      return res.json({
        metric: query.metric,
        position: query.position,
        entries: rows.map((row, index) => ({
          rank: index + 1,
          displayName: row.display_name,
          position: row.position,
          teamId: row.team_id,
          score: Number(row.score),
          updatedAt: new Date(row.updated_at).toISOString()
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/events", requireInstallation, async (req, res, next) => {
    try {
      const events = validateEvents(req.body);
      if (!events) return res.status(400).json({ error: "Invalid events payload" });
      const accepted = await database.insertEvents(req.installation.id, events);
      return res.status(202).json({ accepted });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/v1/careers/:careerId", requireInstallation, async (req, res, next) => {
    try {
      if (env.LEGACY_LEADERBOARDS_ENABLED === "false") return res.status(410).json({ error: "Account required" });
      const career = validateCareer({ ...req.body, careerId: req.params.careerId });
      if (!career) return res.status(400).json({ error: "Invalid career payload" });
      const plausibilityReason = assessCareerPlausibility(career);
      if (plausibilityReason) {
        await database.recordRejectedCareer(req.installation.id, career.careerId, plausibilityReason, career);
        return res.status(422).json({ error: "Career snapshot rejected", reason: plausibilityReason });
      }
      const publishedCareer = career.leaderboardOptIn
        ? {
            ...career,
            displayName: leaderboardAlias(req.installation.id, career.careerId, career.position)
          }
        : career;
      const result = await database.upsertCareer(req.installation.id, publishedCareer);
      if (result?.accepted === false) {
        return res.status(422).json({ error: "Career snapshot rejected", reason: result.reason });
      }
      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/v1/installations/me", requireInstallation, async (req, res, next) => {
    try {
      await database.deleteInstallation(req.installation.id);
      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/leaderboards", async (req, res, next) => {
    try {
      if (env.LEGACY_LEADERBOARDS_ENABLED === "false") return res.status(410).json({ error: "Account required" });
      const query = parseLeaderboardQuery(req.query);
      if (!query) return res.status(400).json({ error: "Invalid leaderboard query" });
      const rows = await database.getLeaderboard(query);
      return res.json({
        metric: query.metric,
        position: query.position,
        entries: rows.map((row, index) => ({
          rank: index + 1,
          displayName: row.display_name,
          position: row.position,
          teamId: row.team_id,
          score: Number(row.score),
          updatedAt: new Date(row.updated_at).toISOString()
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/admin/stats/overview", requireAdmin, async (_req, res, next) => {
    try {
      res.json(await database.getOverview());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/admin/stats/retention", requireAdmin, async (_req, res, next) => {
    try {
      const data = await database.getRetention();
      const rate = (retained, eligible) => eligible > 0 ? Number((retained / eligible).toFixed(4)) : null;
      res.json({
        d1: { eligible: data.d1_eligible, retained: data.d1_retained, rate: rate(data.d1_retained, data.d1_eligible) },
        d7: { eligible: data.d7_eligible, retained: data.d7_retained, rate: rate(data.d7_retained, data.d7_eligible) },
        d30: { eligible: data.d30_eligible, retained: data.d30_retained, rate: rate(data.d30_retained, data.d30_eligible) },
        dailyActiveInstallations: data.daily.map((row) => ({ day: row.day, count: row.active_installations }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/admin/stats/funnel", requireAdmin, async (_req, res, next) => {
    try {
      const steps = await database.getFunnel();
      res.json({ steps });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/admin/stats/balance", requireAdmin, async (_req, res, next) => {
    try {
      const positions = await database.getBalance();
      res.json({ positions });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/admin/stats/leaderboard-health", requireAdmin, async (_req, res, next) => {
    try {
      res.json(await database.getLeaderboardHealth());
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin", requireDashboard, (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.type("html").send(renderAdminDashboard());
  });
  app.get("/admin/dashboard.css", requireDashboard, (_req, res) => {
    res.set("Cache-Control", "private, max-age=300");
    res.type("css").send(adminDashboardCss);
  });
  app.get("/admin/dashboard.js", requireDashboard, (_req, res) => {
    res.set("Cache-Control", "private, max-age=300");
    res.type("js").send(adminDashboardJs);
  });

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
