enum FootballRegion {
  europe,
  southAmerica,
  northAmerica,
  asia,
  africa,
  oceania,
}

enum FootballConfederation { uefa, conmebol, concacaf, afc, caf, ofc }

/// Kept only for decoding and source compatibility with 2026.1/2026.2 UI
/// tests. New world content and simulation use stable string country IDs.
enum FootballNation { england, spain, france, germany, brazil, unitedStates }

enum DivisionLevel { first, second }

enum CompetitionKind {
  league,
  domesticCup,
  internationalClub,
  nationalQualifier,
  nationalTournament,
}

enum FixtureDecision { regulation, extraTime, penalties }

final class CountryDefinition {
  CountryDefinition({
    required this.id,
    required Map<String, String> names,
    required this.region,
    required this.confederation,
    required List<String> mapUnitCodes,
    this.leagueRank,
    this.playableLeague = false,
  })  : names = Map.unmodifiable(names),
        mapUnitCodes = List.unmodifiable(mapUnitCodes);

  final String id;
  final Map<String, String> names;
  final FootballRegion region;
  final FootballConfederation confederation;
  final List<String> mapUnitCodes;
  final int? leagueRank;
  final bool playableLeague;

  String nameFor(String locale) => names[locale] ?? names['en'] ?? id;
  String get name => nameFor('en');
  bool get hasLeague => playableLeague;

  Map<String, Object?> toJson() => {
        'id': id,
        'names': names,
        'region': region.name,
        'confederation': confederation.name,
        'mapUnitCodes': mapUnitCodes,
        'leagueRank': leagueRank,
        'playableLeague': playableLeague,
      };
}

enum ClubPlayingStyle {
  possession,
  highPress,
  counterAttack,
  direct,
  defensive
}

extension ClubPlayingStyleLabel on ClubPlayingStyle {
  String get label => switch (this) {
        ClubPlayingStyle.possession => 'Possession football',
        ClubPlayingStyle.highPress => 'High press',
        ClubPlayingStyle.counterAttack => 'Counter attack',
        ClubPlayingStyle.direct => 'Direct football',
        ClubPlayingStyle.defensive => 'Defensive structure',
      };
}

final class ClubDefinition {
  const ClubDefinition({
    required this.id,
    required this.name,
    required this.shortName,
    required this.countryId,
    required this.division,
    required this.quality,
    required this.attack,
    required this.defense,
    required this.primaryColor,
    required this.secondaryColor,
  });

  final String id;
  final String name;
  final String shortName;
  final String countryId;
  final DivisionLevel division;
  final int quality;
  final int attack;
  final int defense;
  final int primaryColor;
  final int secondaryColor;

  // A stable authored identity derived from immutable club data; seed and
  // current opponents never change the club's system.
  ClubPlayingStyle get playingStyle => ClubPlayingStyle
      .values[(attack + defense + quality) % ClubPlayingStyle.values.length];

  Map<String, Object?> toJson() => {
        'id': id,
        'name': name,
        'shortName': shortName,
        'countryId': countryId,
        'division': division.name,
        'quality': quality,
        'attack': attack,
        'defense': defense,
        'primaryColor': primaryColor,
        'secondaryColor': secondaryColor,
      };
}

final class NationalTeamDefinition {
  const NationalTeamDefinition({
    required this.id,
    required this.countryId,
    required this.countryName,
    required this.region,
    required this.confederation,
    required this.quality,
  });

  final String id;
  final String countryId;
  final String countryName;
  final FootballRegion region;
  final FootballConfederation confederation;
  final int quality;

  Map<String, Object?> toJson() => {
        'id': id,
        'countryId': countryId,
        'countryName': countryName,
        'region': region.name,
        'confederation': confederation.name,
        'quality': quality,
      };
}

final class NationalQualificationResult {
  const NationalQualificationResult({
    required this.tables,
    required this.fixtures,
    required this.qualifiedTeamIds,
  });

  final Map<String, List<StandingRow>> tables;
  final Map<String, List<Fixture>> fixtures;
  final List<String> qualifiedTeamIds;
}

final class NationalCallupRequirements {
  const NationalCallupRequirements({
    required this.overall,
    required this.reputation,
  });

  final int overall;
  final int reputation;
}

final class Fixture {
  const Fixture({
    required this.id,
    required this.competitionId,
    required this.matchweek,
    required this.homeId,
    required this.awayId,
    this.homeGoals,
    this.awayGoals,
    this.decision = FixtureDecision.regulation,
  });

  factory Fixture.fromJson(Map<String, Object?> json) => Fixture(
        id: json['id'] as String,
        competitionId: json['competitionId'] as String,
        matchweek: json['matchweek'] as int,
        homeId: json['homeId'] as String,
        awayId: json['awayId'] as String,
        homeGoals: json['homeGoals'] as int?,
        awayGoals: json['awayGoals'] as int?,
        decision: FixtureDecision.values.firstWhere(
          (value) => value.name == json['decision'],
          orElse: () => FixtureDecision.regulation,
        ),
      );

  final String id;
  final String competitionId;
  final int matchweek;
  final String homeId;
  final String awayId;
  final int? homeGoals;
  final int? awayGoals;
  final FixtureDecision decision;

  bool get isPlayed => homeGoals != null && awayGoals != null;

  Fixture withScore(
    int home,
    int away, {
    FixtureDecision decision = FixtureDecision.regulation,
  }) =>
      Fixture(
        id: id,
        competitionId: competitionId,
        matchweek: matchweek,
        homeId: homeId,
        awayId: awayId,
        homeGoals: home,
        awayGoals: away,
        decision: decision,
      );

  Map<String, Object?> toJson() => {
        'id': id,
        'competitionId': competitionId,
        'matchweek': matchweek,
        'homeId': homeId,
        'awayId': awayId,
        'homeGoals': homeGoals,
        'awayGoals': awayGoals,
        'decision': decision.name,
      };
}

final class StandingRow {
  const StandingRow({
    required this.clubId,
    this.played = 0,
    this.won = 0,
    this.drawn = 0,
    this.lost = 0,
    this.goalsFor = 0,
    this.goalsAgainst = 0,
  });

  factory StandingRow.fromJson(Map<String, Object?> json) => StandingRow(
        clubId: json['clubId'] as String,
        played: json['played'] as int? ?? 0,
        won: json['won'] as int? ?? 0,
        drawn: json['drawn'] as int? ?? 0,
        lost: json['lost'] as int? ?? 0,
        goalsFor: json['goalsFor'] as int? ?? 0,
        goalsAgainst: json['goalsAgainst'] as int? ?? 0,
      );

  final String clubId;
  final int played;
  final int won;
  final int drawn;
  final int lost;
  final int goalsFor;
  final int goalsAgainst;

  int get points => won * 3 + drawn;
  int get goalDifference => goalsFor - goalsAgainst;

  StandingRow record(int scored, int conceded) => StandingRow(
        clubId: clubId,
        played: played + 1,
        won: won + (scored > conceded ? 1 : 0),
        drawn: drawn + (scored == conceded ? 1 : 0),
        lost: lost + (scored < conceded ? 1 : 0),
        goalsFor: goalsFor + scored,
        goalsAgainst: goalsAgainst + conceded,
      );

  Map<String, Object?> toJson() => {
        'clubId': clubId,
        'played': played,
        'won': won,
        'drawn': drawn,
        'lost': lost,
        'goalsFor': goalsFor,
        'goalsAgainst': goalsAgainst,
        'goalDifference': goalDifference,
        'points': points,
      };
}

final class LeagueDefinition {
  LeagueDefinition({
    required this.id,
    required this.name,
    required this.countryId,
    required this.systemRank,
    required this.division,
    required List<String> clubIds,
    required List<Fixture> fixtures,
  })  : clubIds = List.unmodifiable(clubIds),
        fixtures = List.unmodifiable(fixtures);

  final String id;
  final String name;
  final String countryId;
  final int? systemRank;
  final DivisionLevel division;
  final List<String> clubIds;
  final List<Fixture> fixtures;

  int get matchweeks => fixtures.fold<int>(0, (max, fixture) {
        return fixture.matchweek > max ? fixture.matchweek : max;
      });
}

final class CupTie {
  const CupTie({
    required this.id,
    required this.round,
    required this.homeId,
    required this.awayId,
  });

  final String id;
  final int round;
  final String homeId;
  final String awayId;
}

final class CompetitionDefinition {
  CompetitionDefinition({
    required this.id,
    required this.name,
    required this.kind,
    required List<String> participantIds,
    required List<Fixture> fixtures,
    this.countryId,
  })  : participantIds = List.unmodifiable(participantIds),
        fixtures = List.unmodifiable(fixtures);

  final String id;
  final String name;
  final CompetitionKind kind;
  final List<String> participantIds;
  final List<Fixture> fixtures;
  final String? countryId;
}

final class WorldDefinition {
  WorldDefinition({
    required this.contentVersion,
    required List<CountryDefinition> countries,
    required List<ClubDefinition> clubs,
    required List<LeagueDefinition> leagues,
    required List<CompetitionDefinition> domesticCups,
    required this.internationalClubCompetition,
    required List<NationalTeamDefinition> nationalTeams,
  })  : countries = List.unmodifiable(countries),
        clubs = List.unmodifiable(clubs),
        leagues = List.unmodifiable(leagues),
        domesticCups = List.unmodifiable(domesticCups),
        nationalTeams = List.unmodifiable(nationalTeams);

  final String contentVersion;
  final List<CountryDefinition> countries;
  final List<ClubDefinition> clubs;
  final List<LeagueDefinition> leagues;
  final List<CompetitionDefinition> domesticCups;
  final CompetitionDefinition internationalClubCompetition;
  final List<NationalTeamDefinition> nationalTeams;

  CountryDefinition country(String id) =>
      countries.firstWhere((country) => country.id == id);

  NationalTeamDefinition nationalTeam(String id) =>
      nationalTeams.firstWhere((team) => team.id == id);

  ClubDefinition club(String id) => clubs.firstWhere((club) => club.id == id);

  LeagueDefinition leagueForClub(String clubId) =>
      leagues.firstWhere((league) => league.clubIds.contains(clubId));

  List<LeagueDefinition> leaguesForCountry(String countryId) => leagues
      .where((league) => league.countryId == countryId)
      .toList(growable: false);
}
