const EVENT_NAMES = new Set([
  "session_started",
  "session_ended",
  "career_started",
  "week_completed",
  "season_completed",
  "career_retired"
]);

export const LEADERBOARD_METRICS = {
  legacy_score: "legacy_score",
  yards: "yards",
  touchdowns: "touchdowns",
  championships: "championships",
  overall: "overall",
  followers: "followers",
  net_worth: "net_worth"
};

const POSITIONS = new Set(["QB", "RB", "WR"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, { min = 0, max = 100 } = {}) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return cleaned.length >= min && cleaned.length <= max ? cleaned : null;
}

function integer(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function isoDate(value, { maxFutureMinutes = 10, maxPastDays = 90 } = {}) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const now = Date.now();
  if (date.getTime() > now + maxFutureMinutes * 60_000) return null;
  if (date.getTime() < now - maxPastDays * 86_400_000) return null;
  return date.toISOString();
}

export function validateInstallation(body) {
  if (!isObject(body)) return null;
  const platform = text(body.platform, { min: 2, max: 12 });
  const appVersion = text(body.appVersion, { min: 1, max: 32 });
  if (!platform || !["ios", "android"].includes(platform) || !appVersion) return null;
  return { platform, appVersion };
}

function validateEventProperties(name, raw) {
  const properties = isObject(raw) ? raw : {};
  const position = POSITIONS.has(properties.position) ? properties.position : undefined;

  switch (name) {
    case "session_started":
      return {};
    case "session_ended": {
      const durationSeconds = integer(properties.durationSeconds, { min: 0, max: 86_400 });
      return durationSeconds == null ? null : { durationSeconds };
    }
    case "career_started":
      return position ? { position } : null;
    case "week_completed": {
      const seasonYear = integer(properties.seasonYear, { min: 1, max: 9999 });
      const week = integer(properties.week, { min: 1, max: 30 });
      if (!position || seasonYear == null || week == null || typeof properties.won !== "boolean") return null;
      return { position, seasonYear, week, won: properties.won };
    }
    case "season_completed": {
      const seasonYear = integer(properties.seasonYear, { min: 1, max: 9999 });
      const gamesPlayed = integer(properties.gamesPlayed, { min: 0, max: 30 });
      const championships = integer(properties.championships, { min: 0, max: 20 });
      if (!position || seasonYear == null || gamesPlayed == null || championships == null) return null;
      return { position, seasonYear, gamesPlayed, championships };
    }
    case "career_retired": {
      const seasons = integer(properties.seasons, { min: 1, max: 20 });
      const legacyScore = integer(properties.legacyScore, { min: 0, max: 10_000_000 });
      if (!position || seasons == null || legacyScore == null) return null;
      return { position, seasons, legacyScore };
    }
    default:
      return null;
  }
}

export function validateEvents(body) {
  if (!isObject(body) || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 50) {
    return null;
  }

  const events = [];
  for (const raw of body.events) {
    if (!isObject(raw)) return null;
    const eventId = text(raw.eventId, { min: 36, max: 36 });
    const eventName = text(raw.eventName, { min: 3, max: 40 });
    const occurredAt = isoDate(raw.occurredAt);
    if (!eventId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) return null;
    if (!eventName || !EVENT_NAMES.has(eventName) || !occurredAt) return null;
    const properties = validateEventProperties(eventName, raw.properties);
    if (!properties) return null;
    events.push({ eventId, eventName, occurredAt, properties });
  }
  return events;
}

export function validateCareer(body) {
  if (!isObject(body)) return null;
  const careerId = text(body.careerId, { min: 1, max: 80 });
  const leaderboardOptIn = body.leaderboardOptIn === true;
  const displayName = leaderboardOptIn ? text(body.displayName, { min: 1, max: 32 }) : null;
  const position = POSITIONS.has(body.position) ? body.position : null;
  const teamId = text(body.teamId, { min: 1, max: 40 });
  const seasonYear = integer(body.seasonYear, { min: 1, max: 9999 });
  const careerYear = integer(body.careerYear, { min: 1, max: 20 });
  const gamesPlayed = integer(body.gamesPlayed, { min: 0, max: 500 });
  const yards = integer(body.yards, { min: 0, max: 1_000_000 });
  const touchdowns = integer(body.touchdowns, { min: 0, max: 10_000 });
  const championships = integer(body.championships, { min: 0, max: 20 });
  const overall = integer(body.overall, { min: 0, max: 100 });
  const followers = integer(body.followers, { min: 0, max: 10_000_000_000 });
  const netWorth = integer(body.netWorth, { min: 0, max: 10_000_000_000 });
  const legacyScore = integer(body.legacyScore, { min: 0, max: 10_000_000 });
  const clientUpdatedAt = isoDate(body.clientUpdatedAt, { maxPastDays: 3650 });

  if (
    !careerId ||
    (leaderboardOptIn && !displayName) ||
    !position ||
    !teamId ||
    seasonYear == null ||
    careerYear == null ||
    gamesPlayed == null ||
    yards == null ||
    touchdowns == null ||
    championships == null ||
    overall == null ||
    followers == null ||
    netWorth == null ||
    legacyScore == null ||
    typeof body.retired !== "boolean" ||
    !clientUpdatedAt
  ) return null;

  return {
    careerId,
    displayName,
    leaderboardOptIn,
    position,
    teamId,
    seasonYear,
    careerYear,
    gamesPlayed,
    yards,
    touchdowns,
    championships,
    overall,
    followers,
    netWorth,
    legacyScore,
    retired: body.retired,
    clientUpdatedAt
  };
}

export function parseLeaderboardQuery(query) {
  const metric = typeof query.metric === "string" ? query.metric : "legacy_score";
  if (!Object.hasOwn(LEADERBOARD_METRICS, metric)) return null;
  const position = typeof query.position === "string" && POSITIONS.has(query.position) ? query.position : null;
  const requestedLimit = Number(query.limit ?? 50);
  const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
  return { metric, position, limit };
}
