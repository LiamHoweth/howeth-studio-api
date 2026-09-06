import { createHash } from "node:crypto";

export const ELEVENWARD_POSITIONS = new Set(["striker", "winger", "midfielder", "defender"]);
export const ELEVENWARD_DIFFICULTIES = new Set(["story", "balanced", "elite"]);
export const ELEVENWARD_ENTITLEMENTS = new Set(["extra_career_slots", "supporter_pack"]);
export const ELEVENWARD_LOCALES = ["en", "es", "pt-BR", "fr"];

const ANALYTICS_EVENTS = {
  app_started: [],
  career_started: ["position", "difficulty"],
  week_completed: ["position", "difficulty", "season", "week", "result"],
  season_completed: ["position", "difficulty", "season", "placement"],
  career_retired: ["position", "difficulty", "seasons", "legacyScore"],
  purchase_screen_opened: ["product"],
  entitlement_restored: ["product"],
  client_error: ["area", "category", "code"]
};

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, min = 1, max = 100) {
  if (typeof value !== "string") return null;
  const result = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return result.length >= min && result.length <= max ? result : null;
}

function int(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function uuid(value) {
  const result = cleanText(value, 36, 36);
  return result && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)
    ? result.toLowerCase()
    : null;
}

function iso(value, { futureMinutes = 1440, pastDays = 36500 } = {}) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const now = Date.now();
  if (parsed.getTime() > now + futureMinutes * 60_000 || parsed.getTime() < now - pastDays * 86_400_000) return null;
  return parsed.toISOString();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value)).digest("hex");
}

export function validateSyncRequest(slotParam, body) {
  if (!object(body) || !object(body.snapshot)) return null;
  const slotIndex = int(Number(slotParam), 0, 4);
  const baseRevision = int(body.baseRevision, 0, Number.MAX_SAFE_INTEGER);
  const idempotencyKey = uuid(body.idempotencyKey);
  const snapshot = body.snapshot;
  const careerId = uuid(snapshot.careerId ?? snapshot.id);
  const schemaVersion = int(snapshot.schemaVersion, 1, 1000);
  const rulesVersion = cleanText(snapshot.rulesVersion, 1, 64);
  const contentVersion = cleanText(snapshot.contentVersion, 1, 64);
  const position = cleanText(snapshot?.player?.position, 1, 32)?.toLowerCase();
  const rawDifficulty = cleanText(snapshot.difficulty, 1, 32)?.toLowerCase();
  // Preserve the signed/canonical snapshot exactly; normalize only the indexed
  // API partition to match the native client's durable enum names.
  const difficulty = { professional: "balanced", worldclass: "elite" }[rawDifficulty] ?? rawDifficulty;
  const seed = int(snapshot.seed, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const revision = int(snapshot.revision, 0, Number.MAX_SAFE_INTEGER);
  const updatedAt = iso(snapshot.updatedAt);
  if (slotIndex == null || baseRevision == null || !idempotencyKey || !careerId || schemaVersion == null ||
      !rulesVersion || !contentVersion || !ELEVENWARD_POSITIONS.has(position) ||
      !ELEVENWARD_DIFFICULTIES.has(difficulty) || seed == null || revision == null || !updatedAt) return null;
  const encoded = canonicalJson(snapshot);
  if (Buffer.byteLength(encoded, "utf8") > 5_000_000) return null;
  return {
    slotIndex, baseRevision, idempotencyKey, snapshot, careerId, schemaVersion,
    rulesVersion, contentVersion, position, difficulty, seed, updatedAt,
    checksum: sha256(encoded), requestHash: sha256({ slotIndex, baseRevision, snapshot })
  };
}

export function validateConflictResolution(body) {
  return object(body) && ["local", "remote"].includes(body.choice) ? { choice: body.choice } : null;
}

export function validateLeaderboardSubmission(body) {
  if (!object(body) || !object(body.aggregateMetrics) || !object(body.validationEvidence)) return null;
  const careerId = uuid(body.careerId);
  const position = cleanText(body.position, 1, 32)?.toLowerCase();
  const difficulty = cleanText(body.difficulty, 1, 32)?.toLowerCase();
  const rulesVersion = cleanText(body.rulesVersion, 1, 64);
  const seasons = int(body.aggregateMetrics.seasons, 1, 20);
  const matches = int(body.aggregateMetrics.matches, 0, 800);
  const legacyScore = int(body.aggregateMetrics.legacyScore, 0, 10_000_000);
  const goals = int(body.aggregateMetrics.goals ?? 0, 0, 5000);
  const assists = int(body.aggregateMetrics.assists ?? 0, 0, 5000);
  const trophies = int(body.aggregateMetrics.trophies ?? 0, 0, 200);
  const evidenceSeed = int(body.validationEvidence.seed, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const finalRevision = int(body.validationEvidence.finalRevision, 1, Number.MAX_SAFE_INTEGER);
  const checksum = cleanText(body.validationEvidence.snapshotChecksum, 64, 64);
  if (!careerId || !ELEVENWARD_POSITIONS.has(position) || !ELEVENWARD_DIFFICULTIES.has(difficulty) ||
      !rulesVersion || seasons == null || matches == null || legacyScore == null || goals == null ||
      assists == null || trophies == null || evidenceSeed == null || finalRevision == null ||
      !checksum || !/^[a-f0-9]{64}$/.test(checksum)) return null;
  return {
    careerId, position, difficulty, rulesVersion, seasons, matches, legacyScore,
    aggregateMetrics: { seasons, matches, legacyScore, goals, assists, trophies },
    validationEvidence: { seed: evidenceSeed, finalRevision, snapshotChecksum: checksum }
  };
}

export function leaderboardRejection(submission) {
  if (submission.matches > submission.seasons * 60) return "matches_exceed_calendar";
  if (submission.aggregateMetrics.goals > submission.matches * 8) return "goals_exceed_match_bound";
  if (submission.aggregateMetrics.assists > submission.matches * 8) return "assists_exceed_match_bound";
  if (submission.aggregateMetrics.trophies > submission.seasons * 5) return "trophies_exceed_season_bound";
  const scoreCeiling = 5000 + submission.matches * 750 + submission.aggregateMetrics.trophies * 10_000;
  if (submission.legacyScore > scoreCeiling) return "legacy_score_implausible";
  return null;
}

export function validateLeaderboardQuery(query) {
  const position = cleanText(query.position, 1, 32)?.toLowerCase();
  const difficulty = cleanText(query.difficulty, 1, 32)?.toLowerCase();
  const rulesVersion = cleanText(query.rulesVersion, 1, 64);
  const limit = query.limit == null ? 100 : int(Number(query.limit), 1, 100);
  return ELEVENWARD_POSITIONS.has(position) && ELEVENWARD_DIFFICULTIES.has(difficulty) && rulesVersion && limit
    ? { position, difficulty, rulesVersion, limit }
    : null;
}

export function validateConsent(body) {
  if (!object(body)) return null;
  const state = cleanText(body.state, 1, 16);
  const policyVersion = cleanText(body.policyVersion, 1, 32);
  return ["granted", "denied"].includes(state) && policyVersion ? { state, policyVersion } : null;
}

export function validateAnalytics(body) {
  if (!object(body) || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 50) return null;
  const events = [];
  for (const raw of body.events) {
    if (!object(raw)) return null;
    const eventId = uuid(raw.eventId);
    const eventName = cleanText(raw.eventName, 1, 48);
    const occurredAt = iso(raw.occurredAt, { futureMinutes: 10, pastDays: 90 });
    if (!eventId || !eventName || !occurredAt || !Object.hasOwn(ANALYTICS_EVENTS, eventName)) return null;
    const allowed = ANALYTICS_EVENTS[eventName];
    const source = object(raw.properties) ? raw.properties : {};
    if (Object.keys(source).some((key) => !allowed.includes(key))) return null;
    const properties = {};
    for (const key of allowed) {
      const value = source[key];
      if (typeof value === "string") {
        const cleaned = cleanText(value, 1, 64);
        if (!cleaned) return null;
        properties[key] = cleaned;
      } else if (Number.isInteger(value) && value >= 0 && value <= 10_000_000) {
        properties[key] = value;
      } else {
        return null;
      }
    }
    events.push({ eventId, eventName, occurredAt, properties });
  }
  return events;
}

export function validateRevenueCatEvent(body) {
  if (!object(body) || !object(body.event)) return null;
  const raw = body.event;
  const eventId = cleanText(raw.id, 1, 200);
  const eventType = cleanText(raw.type, 1, 80);
  const appUserId = uuid(raw.app_user_id);
  const entitlementIds = Array.isArray(raw.entitlement_ids) ? raw.entitlement_ids : [];
  const entitlementId = entitlementIds.map((item) => cleanText(item, 1, 64)).find((item) => ELEVENWARD_ENTITLEMENTS.has(item));
  const sourceStore = { APP_STORE: "app_store", PLAY_STORE: "play_store", PROMOTIONAL: "promotional" }[raw.store];
  const transactionId = cleanText(raw.transaction_id ?? raw.original_transaction_id, 1, 240);
  const productId = cleanText(raw.product_id, 1, 160);
  if (!eventId || !eventType || !appUserId || !entitlementId || !sourceStore || !transactionId || !productId) return null;
  const state = ["CANCELLATION", "REFUND", "EXPIRATION"].includes(eventType)
    ? (eventType === "REFUND" ? "refunded" : eventType === "EXPIRATION" ? "expired" : "revoked")
    : "active";
  const purchasedAt = Number.isInteger(raw.purchased_at_ms) ? new Date(raw.purchased_at_ms).toISOString() : null;
  return { eventId, eventType, accountId: appUserId, entitlementId, sourceStore, transactionId, productId, state, purchasedAt };
}

function translated(record) {
  return object(record?.text) && ELEVENWARD_LOCALES.every((locale) => cleanText(record.text[locale], 1, 4000));
}

function translatedField(value) {
  return object(value) && ELEVENWARD_LOCALES.every((locale) => cleanText(value[locale], 1, 4000));
}

function semver(value) {
  const cleaned = cleanText(value, 1, 32);
  const match = cleaned?.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function validateContentBundle(body) {
  if (!object(body) || !object(body.metadata)) return { valid: false, errors: ["Bundle metadata is required."] };
  const releaseVersion = cleanText(body.metadata.releaseVersion, 1, 64);
  const minClientVersion = cleanText(body.metadata.minClientVersion, 1, 32);
  const maxClientVersion = body.metadata.maxClientVersion == null ? null : cleanText(body.metadata.maxClientVersion, 1, 32);
  const collections = [
    ["clubs", 120], ["nationalTeams", 24], ["matchSituations", 160],
    ["events", 200], ["lifestyleItems", 120]
  ];
  const errors = [];
  const releaseSemver = semver(releaseVersion);
  const minimumSemver = semver(minClientVersion);
  const maximumSemver = maxClientVersion == null ? null : semver(maxClientVersion);
  if (!releaseSemver || !minimumSemver || (maxClientVersion != null && !maximumSemver)) {
    errors.push("Release and compatible client versions must use semantic versions.");
  } else if (maximumSemver && compareVersion(minimumSemver, maximumSemver) > 0) {
    errors.push("Minimum client version cannot exceed maximum client version.");
  }
  if (body.metadata.rulesVersion !== "2026.2") {
    errors.push("Content may only target the executable 2026.2 rules version.");
  }
  const ids = new Set();
  for (const [key, exact] of collections) {
    const rows = body[key];
    if (!Array.isArray(rows) || rows.length !== exact) {
      errors.push(`${key} must contain exactly ${exact} records.`);
      continue;
    }
    for (const row of rows) {
      const id = cleanText(row?.id, 1, 100);
      if (!id) errors.push(`${key} contains a missing or invalid id.`);
      else if (ids.has(id)) errors.push(`Duplicate id: ${id}.`);
      else ids.add(id);
      if (!translated(row)) errors.push(`${key}/${id ?? "unknown"} is missing a launch locale.`);
    }
  }

  const clubIds = new Set(Array.isArray(body.clubs) ? body.clubs.map((club) => club?.id).filter(Boolean) : []);
  const nationalIds = new Set(Array.isArray(body.nationalTeams) ? body.nationalTeams.map((team) => team?.id).filter(Boolean) : []);
  const positionCounts = new Map(ELEVENWARD_POSITIONS.values().map((position) => [position, 0]));
  for (const situation of Array.isArray(body.matchSituations) ? body.matchSituations : []) {
    if (!ELEVENWARD_POSITIONS.has(situation?.position)) errors.push(`Match situation ${situation?.id ?? "unknown"} has an invalid position.`);
    else positionCounts.set(situation.position, positionCounts.get(situation.position) + 1);
    if (!translatedField(situation?.prompt)) errors.push(`Match situation ${situation?.id ?? "unknown"} has an incomplete prompt.`);
    if (!int(situation?.minuteFrom, 1, 90) || !int(situation?.minuteTo, 1, 90) || situation.minuteFrom > situation.minuteTo) {
      errors.push(`Match situation ${situation?.id ?? "unknown"} has an impossible minute range.`);
    }
    if (!Array.isArray(situation?.options) || situation.options.length !== 3 ||
        new Set(situation.options?.map((option) => option?.approach)).size !== 3) {
      errors.push(`Match situation ${situation?.id ?? "unknown"} must have safe, balanced, and bold options.`);
    } else {
      for (const option of situation.options) {
        if (!["safe", "balanced", "bold"].includes(option?.approach) || !translatedField(option?.title)) {
          errors.push(`Match situation ${situation.id} has an invalid or untranslated option.`);
        }
      }
    }
  }
  for (const [position, count] of positionCounts) {
    if (count !== 40) errors.push(`Position ${position} must have exactly 40 match situations.`);
  }

  const eventCategories = new Set(["manager", "teammate", "agent", "sponsor", "press", "family", "reputation", "wellness", "community", "contract"]);
  for (const event of Array.isArray(body.events) ? body.events : []) {
    if (!eventCategories.has(event?.category) || !translatedField(event?.title) || !translatedField(event?.body)) {
      errors.push(`Event ${event?.id ?? "unknown"} has invalid category or translations.`);
    }
    if (!Array.isArray(event?.choices) || event.choices.length < 2) {
      errors.push(`Event ${event?.id ?? "unknown"} needs at least two choices.`);
    } else {
      const choiceIds = new Set();
      for (const choice of event.choices) {
        if (!cleanText(choice?.id, 1, 80) || choiceIds.has(choice.id) || !translatedField(choice?.label)) {
          errors.push(`Event ${event.id} has an invalid, duplicate, or untranslated choice.`);
        }
        choiceIds.add(choice?.id);
        for (const field of ["trustDelta", "reputationDelta", "moneyDelta", "wellnessDelta"]) {
          if (!Number.isInteger(choice?.[field]) || Math.abs(choice[field]) > (field === "moneyDelta" ? 1_000_000 : 25)) {
            errors.push(`Event ${event.id}/${choice?.id ?? "unknown"} has an unsafe ${field}.`);
          }
        }
      }
    }
  }

  const itemCategories = new Set(["home", "transportation", "style", "wellness"]);
  const rarity = new Set(["common", "uncommon", "rare", "epic", "legendary"]);
  const itemCategoryCounts = new Map([...itemCategories].map((category) => [category, 0]));
  for (const item of Array.isArray(body.lifestyleItems) ? body.lifestyleItems : []) {
    if (!itemCategories.has(item?.category)) errors.push(`Lifestyle item ${item?.id ?? "unknown"} has an invalid category.`);
    else itemCategoryCounts.set(item.category, itemCategoryCounts.get(item.category) + 1);
    if (!rarity.has(item?.rarity) || !translatedField(item?.name) || !translatedField(item?.description)) {
      errors.push(`Lifestyle item ${item?.id ?? "unknown"} has invalid metadata or translations.`);
    }
    if (int(item?.price, 0, 5_000_000) == null || int(item?.reputationEffect, -20, 20) == null || int(item?.wellnessEffect, -20, 20) == null) {
      errors.push(`Lifestyle item ${item?.id ?? "unknown"} is outside the launch economy bounds.`);
    }
  }
  for (const [category, count] of itemCategoryCounts) {
    if (count !== 30) errors.push(`Lifestyle category ${category} must contain exactly 30 items.`);
  }

  const leagues = Array.isArray(body.leagues) ? body.leagues : [];
  if (leagues.length !== 12) errors.push("Exactly 12 league divisions are required.");
  const leagueIds = new Set();
  const assignedClubs = new Set();
  for (const league of leagues) {
    if (!cleanText(league?.id, 1, 100) || leagueIds.has(league.id)) errors.push(`League ${league?.id ?? "unknown"} has an invalid or duplicate id.`);
    leagueIds.add(league?.id);
    if (!Array.isArray(league?.clubIds) || league.clubIds.length !== 10 || new Set(league.clubIds).size !== 10) {
      errors.push(`League ${league?.id ?? "unknown"} must contain ten unique clubs.`);
      continue;
    }
    for (const clubId of league.clubIds) {
      if (!clubIds.has(clubId)) errors.push(`League ${league.id} references unknown club ${clubId}.`);
      if (assignedClubs.has(clubId)) errors.push(`Club ${clubId} is assigned to more than one league.`);
      assignedClubs.add(clubId);
    }
  }
  if (assignedClubs.size !== 120) errors.push("Every launch club must be assigned to exactly one league.");

  const fixtures = Array.isArray(body.fixtures) ? body.fixtures : [];
  if (fixtures.length !== 1080) errors.push("The launch world requires 1,080 league fixtures.");
  const fixtureIds = new Set();
  const fixturesByLeague = new Map([...leagueIds].map((id) => [id, []]));
  for (const fixture of fixtures) {
    if (!cleanText(fixture?.id, 1, 140) || fixtureIds.has(fixture.id)) errors.push(`Fixture ${fixture?.id ?? "unknown"} has an invalid or duplicate id.`);
    fixtureIds.add(fixture?.id);
    if (!leagueIds.has(fixture?.competitionId)) errors.push(`Fixture ${fixture?.id ?? "unknown"} references an unknown league.`);
    else fixturesByLeague.get(fixture.competitionId).push(fixture);
    if (!clubIds.has(fixture?.homeId) || !clubIds.has(fixture?.awayId) || fixture.homeId === fixture.awayId || int(fixture?.matchweek, 1, 18) == null ||
        !["regulation", "extraTime", "penalties"].includes(fixture?.decision)) {
      errors.push(`Fixture ${fixture?.id ?? "unknown"} has invalid participants or matchweek.`);
    }
  }
  for (const league of leagues) {
    const leagueFixtures = fixturesByLeague.get(league.id) ?? [];
    if (leagueFixtures.length !== 90) errors.push(`League ${league.id} must have exactly 90 fixtures.`);
    const appearances = new Map((league.clubIds ?? []).map((id) => [id, 0]));
    const opponents = new Map((league.clubIds ?? []).map((id) => [id, new Map()]));
    for (const fixture of leagueFixtures) {
      if (!appearances.has(fixture.homeId) || !appearances.has(fixture.awayId)) {
        errors.push(`Fixture ${fixture.id} uses a club outside ${league.id}.`);
        continue;
      }
      appearances.set(fixture.homeId, appearances.get(fixture.homeId) + 1);
      appearances.set(fixture.awayId, appearances.get(fixture.awayId) + 1);
      opponents.get(fixture.homeId).set(fixture.awayId, (opponents.get(fixture.homeId).get(fixture.awayId) ?? 0) + 1);
      opponents.get(fixture.awayId).set(fixture.homeId, (opponents.get(fixture.awayId).get(fixture.homeId) ?? 0) + 1);
    }
    for (const clubId of league.clubIds ?? []) {
      if (appearances.get(clubId) !== 18 || [...opponents.get(clubId).values()].some((count) => count !== 2) || opponents.get(clubId).size !== 9) {
        errors.push(`League ${league.id} does not give ${clubId} a valid double round robin schedule.`);
      }
    }
  }

  const cups = Array.isArray(body.domesticCups) ? body.domesticCups : [];
  if (cups.length !== 6) errors.push("Exactly six domestic cups are required.");
  const competitionIds = new Set(leagueIds);
  const validateCompetitionFixture = (fixture, competitionId, participants) => {
    if (!cleanText(fixture?.id, 1, 140) || fixtureIds.has(fixture.id)) {
      errors.push(`Fixture ${fixture?.id ?? "unknown"} has an invalid or duplicate id.`);
    }
    fixtureIds.add(fixture?.id);
    if (fixture?.competitionId !== competitionId ||
        !participants.has(fixture?.homeId) ||
        !participants.has(fixture?.awayId) ||
        fixture.homeId === fixture.awayId ||
        int(fixture?.matchweek, 1, 52) == null ||
        !["regulation", "extraTime", "penalties"].includes(fixture?.decision)) {
      errors.push(`Fixture ${fixture?.id ?? "unknown"} is invalid for ${competitionId}.`);
    }
  };
  for (const cup of cups) {
    const cupId = cleanText(cup?.id, 1, 100);
    if (!cupId || competitionIds.has(cupId)) errors.push(`Domestic cup ${cup?.id ?? "unknown"} has an invalid or duplicate id.`);
    else competitionIds.add(cupId);
    const participants = new Set(Array.isArray(cup?.participantIds) ? cup.participantIds : []);
    if (!Array.isArray(cup?.participantIds) || cup.participantIds.length !== 20 || participants.size !== 20 || cup.participantIds.some((id) => !clubIds.has(id))) {
      errors.push(`Domestic cup ${cup?.id ?? "unknown"} must reference twenty unique clubs.`);
    }
    if (!Array.isArray(cup?.openingFixtures) || cup.openingFixtures.length !== 4) {
      errors.push(`Domestic cup ${cup?.id ?? "unknown"} must contain four opening fixtures.`);
    } else {
      for (const fixture of cup.openingFixtures) validateCompetitionFixture(fixture, cupId, participants);
    }
  }
  const international = body.internationalClubCompetition;
  const internationalId = cleanText(international?.id, 1, 100);
  const internationalParticipants = new Set(Array.isArray(international?.participantIds) ? international.participantIds : []);
  if (!object(international) || !internationalId || competitionIds.has(internationalId) || !Array.isArray(international.participantIds) || international.participantIds.length !== 12 ||
      internationalParticipants.size !== 12 || international.participantIds.some((id) => !clubIds.has(id))) {
    errors.push("The international club competition must reference twelve unique clubs.");
  } else {
    competitionIds.add(internationalId);
  }
  if (!Array.isArray(international?.fixtures) || international.fixtures.length !== 18) {
    errors.push("The international club competition must contain eighteen group fixtures.");
  } else {
    const appearances = new Map([...internationalParticipants].map((id) => [id, 0]));
    for (const fixture of international.fixtures) {
      validateCompetitionFixture(fixture, internationalId, internationalParticipants);
      if (appearances.has(fixture.homeId)) appearances.set(fixture.homeId, appearances.get(fixture.homeId) + 1);
      if (appearances.has(fixture.awayId)) appearances.set(fixture.awayId, appearances.get(fixture.awayId) + 1);
    }
    if ([...appearances.values()].some((count) => count !== 3)) {
      errors.push("Every international club must have exactly three group fixtures.");
    }
  }
  if (nationalIds.size !== 24) errors.push("National team identifiers must be unique.");
  if (errors.length > 100) errors.splice(100, errors.length - 100, "Additional validation errors omitted.");
  return {
    valid: errors.length === 0,
    errors,
    releaseVersion,
    minClientVersion,
    maxClientVersion,
    locales: ELEVENWARD_LOCALES,
    counts: Object.fromEntries(collections.map(([key]) => [key, Array.isArray(body[key]) ? body[key].length : 0]))
  };
}
