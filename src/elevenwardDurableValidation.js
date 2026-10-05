const object = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const integer = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;
const text = (value, max) =>
  typeof value === "string" &&
  value.length >= 1 &&
  value.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const roleBounds = {
  keyPasses: 3,
  chancesCreated: 3,
  successfulDribbles: 3,
  tackles: 6,
  interceptions: 2,
  cleanSheets: 1,
  playerOfMatchAwards: 1,
};
export function boundedRoleStats(value, maxMatches) {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !Object.hasOwn(roleBounds, key))
  )
    return false;
  return Object.entries(roleBounds).every(([key, bound]) =>
    integer(value[key] ?? 0, 0, maxMatches * bound),
  );
}
export function modernRoleContribution(position, stats = {}) {
  stats ??= {};
  const r = Object.fromEntries(
    Object.keys(roleBounds).map((key) => [key, stats[key] ?? 0]),
  );
  switch (position) {
    case "striker":
      return r.playerOfMatchAwards * 15;
    case "winger":
      return (
        r.successfulDribbles * 0.4 +
        r.chancesCreated * 0.5 +
        r.playerOfMatchAwards * 15
      );
    case "midfielder":
      return (
        r.keyPasses * 0.5 + r.chancesCreated * 0.75 + r.playerOfMatchAwards * 15
      );
    case "defender":
      return (
        r.tackles * 0.25 +
        r.interceptions * 0.5 +
        r.cleanSheets * 4 +
        r.playerOfMatchAwards * 15
      );
    default:
      return 0;
  }
}
export function validateCareerFeatures(snapshot) {
  if (snapshot.schemaVersion < 14 && snapshot.rulesVersion !== "2026.5")
    return true;
  const appearances = snapshot.player?.appearances ?? 0,
    caps = snapshot.nationalTeam?.caps ?? 0;
  if (!integer(appearances, 0, 800) || !integer(caps, 0, 200)) return false;
  if (!boundedRoleStats(snapshot.roleStats ?? {}, appearances + caps))
    return false;
  const matches = snapshot.matchJournal ?? [],
    decisions = snapshot.decisionJournal ?? [];
  if (
    !Array.isArray(matches) ||
    matches.length > 40 ||
    !Array.isArray(decisions) ||
    decisions.length > 40
  )
    return false;
  for (const item of matches) {
    if (
      !object(item) ||
      !text(item.id, 180) ||
      !integer(item.season, 1, 21) ||
      !integer(item.week, 0, 60) ||
      !text(item.clubName, 160) ||
      !text(item.opponentName, 160) ||
      typeof item.isHome !== "boolean" ||
      typeof item.appeared !== "boolean" ||
      !integer(item.homeScore, 0, 20) ||
      !integer(item.awayScore, 0, 20) ||
      !integer(item.goals, 0, 8) ||
      !integer(item.assists, 0, 8) ||
      typeof item.rating !== "number" ||
      !Number.isFinite(item.rating) ||
      item.rating < 0 ||
      item.rating > 10 ||
      !text(item.headline, 2000) ||
      !text(item.report, 8000) ||
      (item.competitionId != null && !text(item.competitionId, 128)) ||
      !boundedRoleStats(item.roleStats ?? {}, item.appeared ? 1 : 0)
    )
      return false;
    const teamGoals = item.isHome ? item.homeScore : item.awayScore;
    if (item.goals + item.assists > teamGoals) return false;
    const metrics = item.metrics ?? {};
    if (
      !object(metrics) ||
      Object.keys(metrics).some(
        (key) =>
          ![
            "possession",
            "shots",
            "shotsOnTarget",
            "expectedGoals",
            "opponentExpectedGoals",
            "bigChances",
            "momentumSwings",
            "lateDrama",
            "comeback",
          ].includes(key),
      )
    )
      return false;
    for (const [key, value] of Object.entries(metrics)) {
      if (["lateDrama", "comeback"].includes(key)) {
        if (typeof value !== "boolean") return false;
      } else if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100
      )
        return false;
    }
  }
  for (const item of decisions)
    if (
      !object(item) ||
      !integer(item.season, 1, 21) ||
      !integer(item.week, 0, 60) ||
      !text(item.eventId, 128) ||
      !text(item.choiceId, 128) ||
      !text(item.title, 2000) ||
      !text(item.choiceLabel, 2000) ||
      !text(item.outcome, 8000)
    )
      return false;
  const flags = snapshot.storyFlags ?? {};
  if (
    !object(flags) ||
    Object.keys(flags).length > 64 ||
    Object.entries(flags).some(
      ([key, value]) => !text(key, 128) || !text(value, 200),
    )
  )
    return false;
  if (
    flags["career.promotions"] != null &&
    !/^\d{1,2}$/.test(flags["career.promotions"])
  )
    return false;
  const goal = snapshot.careerGoal;
  if (
    goal != null &&
    (!object(goal) ||
      ![
        "appearances",
        "goals",
        "assists",
        "cleanSheets",
        "nationalSelection",
        "trophy",
        "promotion",
      ].includes(goal.kind) ||
      !integer(goal.target, 1, 5000) ||
      !integer(goal.startValue, 0, 5000) ||
      !integer(goal.chosenSeason, 1, 21) ||
      (goal.completedSeason != null &&
        !integer(goal.completedSeason, goal.chosenSeason, 21)))
  )
    return false;
  const loan = snapshot.activeLoan;
  if (loan != null) {
    const contract = loan.parentContract;
    if (
      !object(loan) ||
      !text(loan.parentClubId, 128) ||
      !text(loan.hostClubId, 128) ||
      loan.parentClubId === loan.hostClubId ||
      !integer(loan.returnSeason, 1, 21) ||
      !integer(loan.hostWageSharePercent ?? 100, 0, 100) ||
      !object(contract) ||
      !text(contract.clubId, 128) ||
      contract.clubId !== loan.parentClubId ||
      !integer(contract.seasonsRemaining, 0, 20) ||
      !integer(contract.weeklyWage, 0, 2 ** 52) ||
      !integer(contract.appearanceBonus, 0, 2 ** 52) ||
      !text(contract.promisedRole, 64) ||
      !integer(contract.roleSatisfaction, 0, 100)
    )
      return false;
  }
  return true;
}
