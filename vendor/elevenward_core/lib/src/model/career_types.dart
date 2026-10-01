enum Difficulty { story, professional, worldClass }

enum CareerPhase {
  inSeason,
  internationalCallup,
  internationalTournament,
  offseason,
  contractDecision,
  retirementDecision,
  retired
}

enum LegacyTier { localFavorite, clubIcon, nationalStar, worldGreat, immortal }

enum NationalTeamDecision { undecided, accepted, declined }

/// Durable international-career state. A call-up decision applies only to the
/// recorded season, while caps and contributions follow the player forever.
final class NationalTeamCareerState {
  const NationalTeamCareerState({
    this.decision = NationalTeamDecision.undecided,
    this.decisionSeason,
    this.caps = 0,
    this.goals = 0,
    this.assists = 0,
    this.tournamentMatchday = 1,
    this.cycleAppearances = 0,
  });

  factory NationalTeamCareerState.fromJson(Map<String, Object?> json) =>
      NationalTeamCareerState(
        decision: NationalTeamDecision.values.firstWhere(
          (value) => value.name == json['decision'],
          orElse: () => NationalTeamDecision.undecided,
        ),
        decisionSeason: json['decisionSeason'] as int?,
        caps: json['caps'] as int? ?? 0,
        goals: json['goals'] as int? ?? 0,
        assists: json['assists'] as int? ?? 0,
        tournamentMatchday: json['tournamentMatchday'] as int? ?? 1,
        cycleAppearances: json['cycleAppearances'] as int? ?? 0,
      );

  final NationalTeamDecision decision;
  final int? decisionSeason;
  final int caps;
  final int goals;
  final int assists;
  final int tournamentMatchday;
  final int cycleAppearances;

  bool acceptedFor(int season) =>
      decision == NationalTeamDecision.accepted && decisionSeason == season;

  bool declinedFor(int season) =>
      decision == NationalTeamDecision.declined && decisionSeason == season;

  NationalTeamCareerState copyWith({
    NationalTeamDecision? decision,
    int? decisionSeason,
    int? caps,
    int? goals,
    int? assists,
    int? tournamentMatchday,
    int? cycleAppearances,
  }) =>
      NationalTeamCareerState(
        decision: decision ?? this.decision,
        decisionSeason: decisionSeason ?? this.decisionSeason,
        caps: caps ?? this.caps,
        goals: goals ?? this.goals,
        assists: assists ?? this.assists,
        tournamentMatchday: tournamentMatchday ?? this.tournamentMatchday,
        cycleAppearances: cycleAppearances ?? this.cycleAppearances,
      );

  Map<String, Object?> toJson() => {
        'decision': decision.name,
        'decisionSeason': decisionSeason,
        'caps': caps,
        'goals': goals,
        'assists': assists,
        'tournamentMatchday': tournamentMatchday,
        'cycleAppearances': cycleAppearances,
      };
}

final class RelationshipState {
  const RelationshipState({
    this.manager = 50,
    this.teammates = 50,
    this.agent = 50,
    this.family = 60,
    this.community = 40,
  });

  factory RelationshipState.fromJson(Map<String, Object?> json) =>
      RelationshipState(
        manager: json['manager'] as int? ?? 50,
        teammates: json['teammates'] as int? ?? 50,
        agent: json['agent'] as int? ?? 50,
        family: json['family'] as int? ?? 60,
        community: json['community'] as int? ?? 40,
      );

  final int manager;
  final int teammates;
  final int agent;
  final int family;
  final int community;

  RelationshipState copyWith({
    int? manager,
    int? teammates,
    int? agent,
    int? family,
    int? community,
  }) =>
      RelationshipState(
        manager: (manager ?? this.manager).clamp(0, 100),
        teammates: (teammates ?? this.teammates).clamp(0, 100),
        agent: (agent ?? this.agent).clamp(0, 100),
        family: (family ?? this.family).clamp(0, 100),
        community: (community ?? this.community).clamp(0, 100),
      );

  Map<String, Object?> toJson() => {
        'manager': manager,
        'teammates': teammates,
        'agent': agent,
        'family': family,
        'community': community,
      };
}

final class ContractState {
  const ContractState({
    this.clubId = 'england-northstar-athletic',
    this.seasonsRemaining = 2,
    this.weeklyWage = 1200,
    this.appearanceBonus = 250,
    this.promisedRole = 'rotation',
    this.roleSatisfaction = 60,
  });

  factory ContractState.fromJson(Map<String, Object?> json) => ContractState(
        clubId: json['clubId'] as String? ?? 'england-northstar-athletic',
        seasonsRemaining: json['seasonsRemaining'] as int? ?? 2,
        weeklyWage: json['weeklyWage'] as int? ?? 1200,
        appearanceBonus: json['appearanceBonus'] as int? ?? 250,
        promisedRole: json['promisedRole'] as String? ?? 'rotation',
        roleSatisfaction: json['roleSatisfaction'] as int? ?? 60,
      );

  final String clubId;
  final int seasonsRemaining;
  final int weeklyWage;
  final int appearanceBonus;
  final String promisedRole;
  final int roleSatisfaction;

  bool get isExpired => seasonsRemaining <= 0;

  ContractState copyWith({
    String? clubId,
    int? seasonsRemaining,
    int? weeklyWage,
    int? appearanceBonus,
    String? promisedRole,
    int? roleSatisfaction,
  }) =>
      ContractState(
        clubId: clubId ?? this.clubId,
        seasonsRemaining: seasonsRemaining ?? this.seasonsRemaining,
        weeklyWage: weeklyWage ?? this.weeklyWage,
        appearanceBonus: appearanceBonus ?? this.appearanceBonus,
        promisedRole: promisedRole ?? this.promisedRole,
        roleSatisfaction:
            (roleSatisfaction ?? this.roleSatisfaction).clamp(0, 100),
      );

  Map<String, Object?> toJson() => {
        'clubId': clubId,
        'seasonsRemaining': seasonsRemaining,
        'weeklyWage': weeklyWage,
        'appearanceBonus': appearanceBonus,
        'promisedRole': promisedRole,
        'roleSatisfaction': roleSatisfaction,
      };
}

/// A player-filed instruction that directs the next offseason club search.
///
/// The league is the primary destination. [preferredClubId] is only considered
/// while that club remains in the requested league and meets normal interest
/// requirements.
final class TransferRequest {
  const TransferRequest({
    required this.targetLeagueId,
    required this.filedSeason,
    required this.filedWeek,
    this.preferredClubId,
  });

  factory TransferRequest.fromJson(Map<String, Object?> json) =>
      TransferRequest(
        targetLeagueId: json['targetLeagueId'] as String,
        preferredClubId: json['preferredClubId'] as String?,
        filedSeason: json['filedSeason'] as int,
        filedWeek: json['filedWeek'] as int,
      );

  final String targetLeagueId;
  final String? preferredClubId;
  final int filedSeason;
  final int filedWeek;

  Map<String, Object?> toJson() => {
        'targetLeagueId': targetLeagueId,
        'preferredClubId': preferredClubId,
        'filedSeason': filedSeason,
        'filedWeek': filedWeek,
      };
}

enum NegotiationPriority { wage, role, term }

/// A durable news story generated from a simulated football event.
final class CareerNewsItem {
  const CareerNewsItem({
    required this.id,
    required this.season,
    required this.week,
    required this.category,
    required this.title,
    required this.body,
  });

  factory CareerNewsItem.fromJson(Map<String, Object?> json) => CareerNewsItem(
        id: json['id'] as String,
        season: json['season'] as int,
        week: json['week'] as int,
        category: json['category'] as String,
        title: json['title'] as String,
        body: json['body'] as String,
      );

  final String id;
  final int season;
  final int week;
  final String category;
  final String title;
  final String body;

  Map<String, Object?> toJson() => {
        'id': id,
        'season': season,
        'week': week,
        'category': category,
        'title': title,
        'body': body,
      };
}

final class SponsorContract {
  const SponsorContract({
    required this.id,
    required this.weeksRemaining,
    required this.weeklyPayout,
    required this.obligation,
  });

  factory SponsorContract.fromJson(Map<String, Object?> json) =>
      SponsorContract(
        id: json['id'] as String,
        weeksRemaining: json['weeksRemaining'] as int,
        weeklyPayout: json['weeklyPayout'] as int,
        obligation: json['obligation'] as String,
      );

  final String id;
  final int weeksRemaining;
  final int weeklyPayout;
  final String obligation;

  SponsorContract copyWith({int? weeksRemaining}) => SponsorContract(
        id: id,
        weeksRemaining: weeksRemaining ?? this.weeksRemaining,
        weeklyPayout: weeklyPayout,
        obligation: obligation,
      );

  Map<String, Object?> toJson() => {
        'id': id,
        'weeksRemaining': weeksRemaining,
        'weeklyPayout': weeklyPayout,
        'obligation': obligation,
      };
}

final class ContractOffer {
  const ContractOffer({
    required this.clubId,
    required this.seasons,
    required this.weeklyWage,
    required this.appearanceBonus,
    required this.promisedRole,
    required this.tacticalFit,
    required this.interestReason,
  });

  final String clubId;
  final int seasons;
  final int weeklyWage;
  final int appearanceBonus;
  final String promisedRole;
  final int tacticalFit;
  final String interestReason;
}

/// A transparent, deterministic representation of an agent's tradeoffs.
final class AgentDefinition {
  const AgentDefinition({
    required this.id,
    required this.name,
    required this.monthlyFee,
    required this.marketReachBonus,
    required this.wageBonusPercent,
    required this.relationshipBonus,
  });

  final String id;
  final String name;
  final int monthlyFee;
  final int marketReachBonus;
  final int wageBonusPercent;
  final int relationshipBonus;
}

const launchAgents = <AgentDefinition>[
  AgentDefinition(
    id: 'agent-independent',
    name: 'Independent',
    monthlyFee: 0,
    marketReachBonus: 0,
    wageBonusPercent: 0,
    relationshipBonus: 0,
  ),
  AgentDefinition(
    id: 'agent-player-first',
    name: 'Player First',
    monthlyFee: 400,
    marketReachBonus: 2,
    wageBonusPercent: 0,
    relationshipBonus: 10,
  ),
  AgentDefinition(
    id: 'agent-global-network',
    name: 'Global Network',
    monthlyFee: 1000,
    marketReachBonus: 10,
    wageBonusPercent: 0,
    relationshipBonus: -5,
  ),
  AgentDefinition(
    id: 'agent-negotiator',
    name: 'The Negotiator',
    monthlyFee: 750,
    marketReachBonus: 4,
    wageBonusPercent: 10,
    relationshipBonus: -2,
  ),
];

final class TransferInterest {
  const TransferInterest({
    required this.clubId,
    required this.interest,
    required this.accepted,
    required this.reason,
  });

  final String clubId;
  final int interest;
  final bool accepted;
  final String reason;
}

final class LegacyVerdict {
  const LegacyVerdict({
    required this.score,
    required this.tier,
    required this.headline,
    required this.reasons,
  });

  final int score;
  final LegacyTier tier;
  final String headline;
  final List<String> reasons;
}

final class SeasonSummary {
  const SeasonSummary({
    required this.season,
    required this.age,
    required this.clubId,
    required this.appearances,
    required this.goals,
    required this.assists,
    required this.averageRating,
    required this.trophies,
  });

  factory SeasonSummary.fromJson(Map<String, Object?> json) => SeasonSummary(
        season: json['season'] as int,
        age: json['age'] as int,
        clubId: json['clubId'] as String,
        appearances: json['appearances'] as int,
        goals: json['goals'] as int,
        assists: json['assists'] as int,
        averageRating: (json['averageRating'] as num).toDouble(),
        trophies: (json['trophies'] as List<Object?>).cast<String>(),
      );

  final int season;
  final int age;
  final String clubId;
  final int appearances;
  final int goals;
  final int assists;
  final double averageRating;
  final List<String> trophies;

  Map<String, Object?> toJson() => {
        'season': season,
        'age': age,
        'clubId': clubId,
        'appearances': appearances,
        'goals': goals,
        'assists': assists,
        'averageRating': averageRating,
        'trophies': trophies,
      };
}
