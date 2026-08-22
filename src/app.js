import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { adminDashboardCss, adminDashboardJs, renderAdminDashboard } from "./adminDashboard.js";
import { createDatabase } from "./database.js";
import {
  assessCareerPlausibility,
  parseLeaderboardQuery,
  validateAppVersion,
  validateCareer,
  validateEvents,
  validateInstallation
} from "./validation.js";

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
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

export function createApp({ database = createDatabase(), env = process.env } = {}) {
  const app = express();
  const frontendOrigins = (env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (env.TRUST_PROXY) app.set("trust proxy", Number(env.TRUST_PROXY) || 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: frontendOrigins.length ? frontendOrigins : false }));
  app.use(express.json({ limit: "64kb" }));

  const apiLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false });
  const registrationLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
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
      const career = validateCareer({ ...req.body, careerId: req.params.careerId });
      if (!career) return res.status(400).json({ error: "Invalid career payload" });
      const plausibilityReason = assessCareerPlausibility(career);
      if (plausibilityReason) {
        await database.recordRejectedCareer(req.installation.id, career.careerId, plausibilityReason, career);
        return res.status(422).json({ error: "Career snapshot rejected", reason: plausibilityReason });
      }
      const result = await database.upsertCareer(req.installation.id, career);
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
