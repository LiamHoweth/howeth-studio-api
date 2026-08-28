const EVENT_NAMES = new Set([
  "session_started",
  "session_ended",
  "career_started",
  "week_completed",
  "season_completed",
  "career_retired",
  "feature_opened",
  "life_purchase",
  "skill_upgraded",
  "contract_signed",
  "daily_reward_claimed"
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
const FEATURES = new Set(["Career", "League", "Life", "More"]);
const LIFE_CATEGORIES = new Set(["homes", "cars", "luxury", "services"]);
const RARITIES = new Set(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]);
const ATTRIBUTES = new Set([
  "speed", "strength", "awareness", "durability", "clutch", "throwPower",
  "throwAccuracy", "decisionMaking", "breakTackle", "elusiveness", "vision",
  "catching", "routeRunning", "separation"
]);
const REWARD_TYPES = new Set(["xp", "money", "xp_boost", "money_boost"]);

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

const FORBIDDEN_CLOUD_KEYS = new Set([
  "purchases", "accountEntitlements", "preferences", "reminders",
  "accessToken", "providerSubject", "verifiedEmail"
]);

function containsForbiddenCloudKey(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenCloudKey);
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, nested]) => (
    FORBIDDEN_CLOUD_KEYS.has(key) || containsForbiddenCloudKey(nested)
  ));
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

export function validateAppVersion(value) {
  return text(value, { min: 1, max: 32 });
}

export function validateProviderCredential(provider, body) {
  if (!isObject(body)) return null;
  if (provider === "apple") {
    const nonce = text(body.nonce, { min: 16, max: 200 });
    const identityToken = text(body.identityToken, { min: 100, max: 10_000 });
    const authorizationCode = text(body.authorizationCode, { min: 8, max: 4_000 });
    return identityToken && authorizationCode && nonce ? { identityToken, authorizationCode, nonce } : null;
  }
  if (provider === "google") {
    const idToken = text(body.idToken, { min: 100, max: 10_000 });
    const nonce = body.nonce == null ? undefined : text(body.nonce, { min: 16, max: 200 });
    if (body.nonce != null && !nonce) return null;
    return idToken ? { idToken, ...(nonce ? { nonce } : {}) } : null;
  }
  return null;
}

export function validateCloudSaveSlots(body) {
  if (!isObject(body) || !Array.isArray(body.slots) || body.slots.length > 5) return null;
  const seen = new Set();
  const slots = [];
  for (const raw of body.slots) {
    if (!isObject(raw) || !isObject(raw.payload)) return null;
    const slotIndex = integer(raw.slotIndex, { min: 0, max: 4 });
    const saveVersion = integer(raw.saveVersion, { min: 1, max: 1000 });
    const updatedAt = isoDate(raw.updatedAt, { maxFutureMinutes: 1_440, maxPastDays: 36500 });
    if (slotIndex == null || saveVersion == null || !updatedAt || seen.has(slotIndex)) return null;
    const payloadId = text(raw.payload.id, { min: 1, max: 100 });
    const createdAt = isoDate(raw.payload.createdAt, { maxFutureMinutes: 1_440, maxPastDays: 36500 });
    const payloadUpdatedAt = isoDate(raw.payload.updatedAt, { maxFutureMinutes: 1_440, maxPastDays: 36500 });
    const allowedSlotKeys = new Set([
      "id", "slotIndex", "isOccupied", "cloudTombstone", "pendingDraftReveal",
      "createdAt", "updatedAt", "preview", "player", "league"
    ]);
    if (!payloadId || !createdAt || !payloadUpdatedAt || payloadUpdatedAt !== updatedAt) return null;
    if (Object.keys(raw.payload).some((key) => !allowedSlotKeys.has(key))) return null;
    if (typeof raw.isOccupied !== "boolean" || raw.payload.slotIndex !== slotIndex || raw.payload.isOccupied !== raw.isOccupied) return null;
    if (raw.isOccupied && (!isObject(raw.payload.player) || !isObject(raw.payload.league))) return null;
    if (!raw.isOccupied && (raw.payload.player != null || raw.payload.league != null)) return null;
    if (raw.payload.cloudTombstone != null && typeof raw.payload.cloudTombstone !== "boolean") return null;
    if (containsForbiddenCloudKey(raw.payload)) return null;
    if (Buffer.byteLength(JSON.stringify(raw.payload), "utf8") > 1_000_000) return null;
    seen.add(slotIndex);
    slots.push({ slotIndex, saveVersion, updatedAt, isOccupied: raw.isOccupied, payload: raw.payload });
  }
  return slots;
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
      return position && text(properties.archetypeId, { min: 2, max: 48 }) && text(properties.teamId, { min: 1, max: 40 })
        ? { position, archetypeId: text(properties.archetypeId, { min: 2, max: 48 }), teamId: text(properties.teamId, { min: 1, max: 40 }) }
        : null;
    case "week_completed": {
      const seasonYear = integer(properties.seasonYear, { min: 1, max: 9999 });
      const week = integer(properties.week, { min: 1, max: 30 });
      const careerYear = integer(properties.careerYear, { min: 1, max: 20 });
      const yards = integer(properties.yards, { min: 0, max: 800 });
      const touchdowns = integer(properties.touchdowns, { min: 0, max: 12 });
      const overall = integer(properties.overall, { min: 60, max: 99 });
      const health = integer(properties.health, { min: 0, max: 100 });
      const momentsResolved = integer(properties.momentsResolved, { min: 0, max: 20 });
      const archetypeId = text(properties.archetypeId, { min: 2, max: 48 });
      if (!position || !archetypeId || seasonYear == null || careerYear == null || week == null || yards == null || touchdowns == null || overall == null || health == null || momentsResolved == null || typeof properties.won !== "boolean") return null;
      return { position, archetypeId, seasonYear, careerYear, week, won: properties.won, yards, touchdowns, overall, health, momentsResolved };
    }
    case "season_completed": {
      const seasonYear = integer(properties.seasonYear, { min: 1, max: 9999 });
      const careerYear = integer(properties.careerYear, { min: 1, max: 20 });
      const gamesPlayed = integer(properties.gamesPlayed, { min: 0, max: 30 });
      const championships = integer(properties.championships, { min: 0, max: 20 });
      const wins = integer(properties.wins, { min: 0, max: 30 });
      const losses = integer(properties.losses, { min: 0, max: 30 });
      const yards = integer(properties.yards, { min: 0, max: 20_000 });
      const touchdowns = integer(properties.touchdowns, { min: 0, max: 250 });
      const overall = integer(properties.overall, { min: 60, max: 99 });
      const archetypeId = text(properties.archetypeId, { min: 2, max: 48 });
      if (!position || !archetypeId || seasonYear == null || careerYear == null || gamesPlayed == null || championships == null || wins == null || losses == null || yards == null || touchdowns == null || overall == null || typeof properties.madePlayoffs !== "boolean" || typeof properties.wonChampionship !== "boolean") return null;
      return { position, archetypeId, seasonYear, careerYear, gamesPlayed, championships, wins, losses, yards, touchdowns, overall, madePlayoffs: properties.madePlayoffs, wonChampionship: properties.wonChampionship };
    }
    case "career_retired": {
      const seasons = integer(properties.seasons, { min: 1, max: 20 });
      const legacyScore = integer(properties.legacyScore, { min: 0, max: 10_000_000 });
      const championships = integer(properties.championships, { min: 0, max: 20 });
      const archetypeId = text(properties.archetypeId, { min: 2, max: 48 });
      if (!position || !archetypeId || seasons == null || legacyScore == null || championships == null || typeof properties.hallOfFame !== "boolean") return null;
      return { position, archetypeId, seasons, legacyScore, championships, hallOfFame: properties.hallOfFame };
    }
    case "feature_opened":
      return FEATURES.has(properties.feature) ? { feature: properties.feature } : null;
    case "life_purchase":
      return LIFE_CATEGORIES.has(properties.category) && RARITIES.has(properties.rarity)
        ? { category: properties.category, rarity: properties.rarity }
        : null;
    case "skill_upgraded": {
      const overall = integer(properties.overall, { min: 60, max: 99 });
      return ATTRIBUTES.has(properties.attribute) && overall != null ? { attribute: properties.attribute, overall } : null;
    }
    case "contract_signed": {
      const years = integer(properties.years, { min: 1, max: 10 });
      const careerYear = integer(properties.careerYear, { min: 1, max: 20 });
      return years != null && careerYear != null && typeof properties.teamChanged === "boolean"
        ? { years, careerYear, teamChanged: properties.teamChanged }
        : null;
    }
    case "daily_reward_claimed":
      return REWARD_TYPES.has(properties.rewardType) ? { rewardType: properties.rewardType } : null;
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

export function validateAccountCareer(body) {
  return validateCareer({ ...body, leaderboardOptIn: true });
}

export function assessCareerPlausibility(career) {
  if (career.gamesPlayed > career.careerYear * 25) return "games_exceed_career_year";
  if (career.championships > career.careerYear) return "championships_exceed_career_year";
  if (career.gamesPlayed === 0 && (career.yards > 0 || career.touchdowns > 0)) return "stats_without_games";
  if (career.yards > career.gamesPlayed * 650) return "yards_exceed_game_ceiling";
  if (career.touchdowns > career.gamesPlayed * 10) return "touchdowns_exceed_game_ceiling";
  const scoreCeiling = Math.round(
    career.overall * 2 + career.touchdowns * 1.5 + career.yards * 0.04 +
    career.championships * 100 + Math.log10(Math.max(1, career.followers)) * 50 + 1_000
  );
  if (career.legacyScore > scoreCeiling) return "legacy_score_exceeds_aggregate_ceiling";
  if (career.leaderboardOptIn && !/^[\p{L}\p{N} .'-]+$/u.test(career.displayName)) return "display_name_not_allowed";
  return null;
}

export function parseLeaderboardQuery(query) {
  const metric = typeof query.metric === "string" ? query.metric : "legacy_score";
  if (!Object.hasOwn(LEADERBOARD_METRICS, metric)) return null;
  const position = typeof query.position === "string" && POSITIONS.has(query.position) ? query.position : null;
  const requestedLimit = Number(query.limit ?? 50);
  const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
  return { metric, position, limit };
}
