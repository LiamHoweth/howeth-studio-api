import '../model/career_progress.dart';
import 'world_models.dart';

/// A club's live position in the active career's cross-league power ranking.
///
/// This is deliberately derived from the current snapshot rather than persisted,
/// so adding the presentation never changes deterministic simulation state.
final class ClubWorldRankingEntry {
  const ClubWorldRankingEntry({
    required this.rank,
    required this.club,
    required this.league,
    required this.record,
    required this.worldRating,
    required this.pointsPerGame,
    required this.goalDifferencePerGame,
  });

  final int rank;
  final ClubDefinition club;
  final LeagueDefinition league;
  final ClubSeasonRecord record;
  final double worldRating;
  final double pointsPerGame;
  final double goalDifferencePerGame;

  ClubWorldRankingEntry withRank(int value) => ClubWorldRankingEntry(
        rank: value,
        club: club,
        league: league,
        record: record,
        worldRating: worldRating,
        pointsPerGame: pointsPerGame,
        goalDifferencePerGame: goalDifferencePerGame,
      );
}

final class WorldLeagueLeader {
  const WorldLeagueLeader({
    required this.league,
    required this.club,
    required this.record,
  });

  final LeagueDefinition league;
  final ClubDefinition club;
  final ClubSeasonRecord record;
}

/// Current-season aggregate statistics for the active football world.
final class WorldSeasonStatistics {
  const WorldSeasonStatistics({
    required this.totalMatches,
    required this.totalGoals,
    required this.averageGoalsPerMatch,
    required this.unbeatenClubCount,
    required this.rankings,
    required this.firstDivisionLeaders,
    this.strongestAttack,
    this.bestDefense,
    this.mostWins,
  });

  final int totalMatches;
  final int totalGoals;
  final double averageGoalsPerMatch;
  final int unbeatenClubCount;
  final List<ClubWorldRankingEntry> rankings;
  final List<WorldLeagueLeader> firstDivisionLeaders;
  final ClubWorldRankingEntry? strongestAttack;
  final ClubWorldRankingEntry? bestDefense;
  final ClubWorldRankingEntry? mostWins;

  ClubWorldRankingEntry rankingForClub(String clubId) =>
      rankings.firstWhere((entry) => entry.club.id == clubId);
}

final class WorldStatisticsCalculator {
  const WorldStatisticsCalculator();

  WorldSeasonStatistics calculate({
    required WorldDefinition definition,
    required CareerWorldState state,
  }) {
    final leaguesById = {
      for (final league in definition.leagues) league.id: league,
    };
    final clubsById = {
      for (final club in definition.clubs) club.id: club,
    };
    final assignedLeagueByClub = <String, LeagueDefinition>{};
    for (final assignment in state.leagueParticipants.entries) {
      final league = leaguesById[assignment.key];
      if (league == null) continue;
      for (final clubId in assignment.value) {
        assignedLeagueByClub[clubId] = league;
      }
    }

    final internationalRecords = _internationalRecords(definition, state);
    final unranked = <ClubWorldRankingEntry>[];
    for (final club in definition.clubs) {
      final league = assignedLeagueByClub[club.id];
      if (league == null) continue;
      final record =
          state.leagueRecords[league.id]?[club.id] ?? const ClubSeasonRecord();
      final pointsPerGame =
          record.played == 0 ? 0.0 : record.points / record.played;
      final goalDifferencePerGame =
          record.played == 0 ? 0.0 : record.goalDifference / record.played;
      final leagueForm = _leagueForm(record);
      final leagueStrength = _leagueStrength(
        league.systemRank,
        countryId: league.countryId,
      );
      final divisionStrength =
          league.division == DivisionLevel.first ? 100.0 : 65.0;
      final internationalForm = _internationalForm(
        internationalRecords[club.id],
      );
      final rating = (club.quality.clamp(0, 100) * .50 +
              leagueForm * .25 +
              leagueStrength * .10 +
              divisionStrength * .10 +
              internationalForm * .05)
          .clamp(0.0, 100.0);
      unranked.add(
        ClubWorldRankingEntry(
          rank: 0,
          club: club,
          league: league,
          record: record,
          worldRating: (rating * 10).round() / 10,
          pointsPerGame: pointsPerGame,
          goalDifferencePerGame: goalDifferencePerGame,
        ),
      );
    }
    unranked.sort(_compareRankingEntries);
    final rankings = List<ClubWorldRankingEntry>.unmodifiable([
      for (var index = 0; index < unranked.length; index++)
        unranked[index].withRank(index + 1),
    ]);

    var totalClubMatches = 0;
    var totalGoals = 0;
    var unbeaten = 0;
    for (final records in state.leagueRecords.values) {
      for (final record in records.values) {
        totalClubMatches += record.played;
        totalGoals += record.goalsFor;
        if (record.played > 0 && record.lost == 0) unbeaten += 1;
      }
    }
    var totalMatches = totalClubMatches ~/ 2;
    for (final competition in state.competitions.values) {
      for (final fixture in competition.fixtures.where(
        (fixture) => fixture.isPlayed,
      )) {
        totalMatches += 1;
        totalGoals += fixture.homeGoals! + fixture.awayGoals!;
      }
    }
    final qualification = state.nationalQualification;
    if (qualification != null) {
      for (final fixtures in qualification.fixtures.values) {
        for (final fixture in fixtures.where((fixture) => fixture.isPlayed)) {
          totalMatches += 1;
          totalGoals += fixture.homeGoals! + fixture.awayGoals!;
        }
      }
    }
    final playedEntries = rankings
        .where((entry) => entry.record.played > 0)
        .toList(growable: false);

    ClubWorldRankingEntry? strongestAttack;
    ClubWorldRankingEntry? bestDefense;
    ClubWorldRankingEntry? mostWins;
    if (playedEntries.isNotEmpty) {
      strongestAttack = _bestBy(
        playedEntries,
        (left, right) {
          final goals = left.record.goalsFor.compareTo(right.record.goalsFor);
          return goals != 0 ? goals : right.club.id.compareTo(left.club.id);
        },
      );
      bestDefense = _bestBy(
        playedEntries,
        (left, right) {
          final leftRate = left.record.goalsAgainst / left.record.played;
          final rightRate = right.record.goalsAgainst / right.record.played;
          final rate = rightRate.compareTo(leftRate);
          if (rate != 0) return rate;
          final conceded = right.record.goalsAgainst.compareTo(
            left.record.goalsAgainst,
          );
          return conceded != 0
              ? conceded
              : right.club.id.compareTo(left.club.id);
        },
      );
      mostWins = _bestBy(
        playedEntries,
        (left, right) {
          final wins = left.record.won.compareTo(right.record.won);
          return wins != 0 ? wins : right.club.id.compareTo(left.club.id);
        },
      );
    }

    final firstDivisionLeaders = <WorldLeagueLeader>[];
    for (final league in definition.leagues.where(
      (league) => league.division == DivisionLevel.first,
    )) {
      final records = state.leagueRecords[league.id];
      if (records == null || records.isEmpty) continue;
      final table = state.table(league.id);
      if (table.isEmpty) continue;
      final row = table.first;
      final club = clubsById[row.clubId];
      if (club == null) continue;
      firstDivisionLeaders.add(
        WorldLeagueLeader(
          league: league,
          club: club,
          record: records[row.clubId] ?? const ClubSeasonRecord(),
        ),
      );
    }
    firstDivisionLeaders.sort((left, right) {
      final leftRank = left.league.systemRank ?? 26;
      final rightRank = right.league.systemRank ?? 26;
      final rank = leftRank.compareTo(rightRank);
      return rank != 0
          ? rank
          : left.league.countryId.compareTo(right.league.countryId);
    });

    return WorldSeasonStatistics(
      totalMatches: totalMatches,
      totalGoals: totalGoals,
      averageGoalsPerMatch: totalMatches == 0 ? 0 : totalGoals / totalMatches,
      unbeatenClubCount: unbeaten,
      rankings: rankings,
      firstDivisionLeaders: List.unmodifiable(firstDivisionLeaders),
      strongestAttack: strongestAttack,
      bestDefense: bestDefense,
      mostWins: mostWins,
    );
  }

  static double _leagueForm(ClubSeasonRecord record) {
    if (record.played == 0) return 50;
    final pointsPercentage = record.points / (record.played * 3);
    final goalDifferenceIndex =
        ((record.goalDifference / record.played + 2) / 4).clamp(0.0, 1.0);
    return 100 * (pointsPercentage * .75 + goalDifferenceIndex * .25);
  }

  static double _leagueStrength(int? systemRank, {required String countryId}) {
    // The U.S. bonus system is intentionally slotted immediately after the
    // 22nd-ranked Mexican system, rather than below the ranked top 25.
    final effectiveRank =
        systemRank?.toDouble() ?? (countryId == 'united-states' ? 22.5 : 26.0);
    return (94 - (effectiveRank - 1) * 1.5).clamp(56.5, 94.0);
  }

  static double _internationalForm(_CompetitionRecord? record) {
    if (record == null || record.played == 0) return 50;
    return record.points / (record.played * 3) * 100;
  }

  static Map<String, _CompetitionRecord> _internationalRecords(
    WorldDefinition definition,
    CareerWorldState state,
  ) {
    final progress =
        state.competitions[definition.internationalClubCompetition.id];
    if (progress == null) return const {};
    final records = <String, _CompetitionRecord>{};
    for (final fixture
        in progress.fixtures.where((fixture) => fixture.isPlayed)) {
      final home = records[fixture.homeId] ?? const _CompetitionRecord();
      final away = records[fixture.awayId] ?? const _CompetitionRecord();
      records[fixture.homeId] = home.record(
        fixture.homeGoals!,
        fixture.awayGoals!,
      );
      records[fixture.awayId] = away.record(
        fixture.awayGoals!,
        fixture.homeGoals!,
      );
    }
    return records;
  }

  static int _compareRankingEntries(
    ClubWorldRankingEntry left,
    ClubWorldRankingEntry right,
  ) {
    final rating = right.worldRating.compareTo(left.worldRating);
    if (rating != 0) return rating;
    final points = right.pointsPerGame.compareTo(left.pointsPerGame);
    if (points != 0) return points;
    final difference = right.goalDifferencePerGame.compareTo(
      left.goalDifferencePerGame,
    );
    if (difference != 0) return difference;
    final goals = right.record.goalsFor.compareTo(left.record.goalsFor);
    return goals != 0 ? goals : left.club.id.compareTo(right.club.id);
  }

  static ClubWorldRankingEntry _bestBy(
    List<ClubWorldRankingEntry> entries,
    int Function(ClubWorldRankingEntry, ClubWorldRankingEntry) compare,
  ) {
    var best = entries.first;
    for (final entry in entries.skip(1)) {
      if (compare(entry, best) > 0) best = entry;
    }
    return best;
  }
}

final class _CompetitionRecord {
  const _CompetitionRecord({this.played = 0, this.points = 0});

  final int played;
  final int points;

  _CompetitionRecord record(int scored, int conceded) => _CompetitionRecord(
        played: played + 1,
        points: points +
            (scored > conceded
                ? 3
                : scored == conceded
                    ? 1
                    : 0),
      );
}
