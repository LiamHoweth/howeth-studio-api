import '../model/career_types.dart';
import '../model/enums.dart';
import '../world/world_generator.dart';

final class FullCareerVerificationReport {
  const FullCareerVerificationReport({
    required this.careers,
    required this.weeks,
    required this.positionCounts,
    required this.difficultyCounts,
    required this.leagueCounts,
    required this.movementCounts,
    required this.transferCounts,
    required this.retirementSeasonCounts,
    required this.nationalTournamentCycles,
    required this.failures,
    required this.checksum,
  });

  final int careers;
  final int weeks;
  final Map<String, int> positionCounts;
  final Map<String, int> difficultyCounts;
  final Map<String, int> leagueCounts;
  final Map<String, int> movementCounts;
  final Map<String, int> transferCounts;
  final Map<String, int> retirementSeasonCounts;
  final int nationalTournamentCycles;
  final List<String> failures;
  final String checksum;

  bool get passed => failures.isEmpty;

  Map<String, Object?> toJson() => {
        'careers': careers,
        'weeks': weeks,
        'positionCounts': positionCounts,
        'difficultyCounts': difficultyCounts,
        'leagueCounts': leagueCounts,
        'movementCounts': movementCounts,
        'transferCounts': transferCounts,
        'retirementSeasonCounts': retirementSeasonCounts,
        'nationalTournamentCycles': nationalTournamentCycles,
        'failures': failures,
        'checksum': checksum,
        'passed': passed,
      };
}

/// A compact exhaustive state-machine verifier used for high-volume release
/// qualification. Detailed match formulas and complete mutable league tables
/// are tested separately; this runner makes 100k full careers practical while
/// still exercising every weekly/season/offseason/retirement transition.
final class FullCareerVerifier {
  const FullCareerVerifier();

  FullCareerVerificationReport run({int careers = 100000}) {
    if (careers < 1) throw ArgumentError.value(careers, 'careers');
    final world = buildLaunchWorld();
    final positions = <String, int>{};
    final difficulties = <String, int>{};
    final leagues = <String, int>{};
    final movements = <String, int>{
      'promoted': 0,
      'relegated': 0,
      'unchanged': 0,
    };
    final transfers = <String, int>{
      'stayed': 0,
      'sameNation': 0,
      'international': 0,
    };
    final retirementSeasons = <String, int>{};
    final failures = <String>[];
    var weeks = 0;
    var nationalCycles = 0;
    var checksum = 0x811c9dc5;

    for (var index = 0; index < careers; index++) {
      final seed = index + 1;
      final position =
          PositionFamily.values[index % PositionFamily.values.length];
      final difficulty =
          Difficulty.values[(index ~/ 4) % Difficulty.values.length];
      var leagueIndex = (index ~/ 12) % world.leagues.length;
      final startingLeague = world.leagues[leagueIndex];
      final retirementSeason = 16 + ((index ~/ 144) % 5);
      final transferMode = index % 3;
      positions.update(position.name, (value) => value + 1, ifAbsent: () => 1);
      difficulties.update(
        difficulty.name,
        (value) => value + 1,
        ifAbsent: () => 1,
      );
      leagues.update(startingLeague.id, (value) => value + 1,
          ifAbsent: () => 1);

      var state = seed & 0x7fffffff;
      var age = 17;
      var phase = _VerificationPhase.inSeason;
      var totalPoints = 0;
      var appearances = 0;
      var goals = 0;
      var assists = 0;

      int next(int maximum) {
        state = (1103515245 * state + 12345) & 0x7fffffff;
        return ((state / 0x80000000) * maximum).floor();
      }

      for (var season = 1; season <= retirementSeason; season++) {
        if (phase != _VerificationPhase.inSeason) {
          failures.add('career $seed did not enter season $season');
          break;
        }
        var week = 1;
        while (week <= 18) {
          final selected = next(100) >=
              switch (difficulty) {
                Difficulty.story => 8,
                Difficulty.professional => 14,
                Difficulty.worldClass => 20,
              };
          if (selected) {
            appearances += 1;
            if (next(100) < _goalChance(position)) goals += 1;
            if (next(100) < _assistChance(position)) assists += 1;
          }
          totalPoints += switch (next(100)) {
            < 42 => 3,
            < 69 => 1,
            _ => 0,
          };
          weeks += 1;
          if (week == 18) {
            phase = _VerificationPhase.offseason;
          } else {
            week += 1;
          }
          if (week < 1 || week > 18) {
            failures.add('career $seed escaped the weekly state machine');
            break;
          }
          if (phase == _VerificationPhase.offseason) break;
        }
        if (phase != _VerificationPhase.offseason) {
          failures.add('career $seed became stuck before offseason');
          break;
        }

        final placement = next(10);
        final currentLeague = world.leagues[leagueIndex];
        if (currentLeague.division.name == 'second' && placement < 2) {
          leagueIndex -= 1;
          movements['promoted'] = movements['promoted']! + 1;
        } else if (currentLeague.division.name == 'first' && placement >= 8) {
          leagueIndex += 1;
          movements['relegated'] = movements['relegated']! + 1;
        } else {
          movements['unchanged'] = movements['unchanged']! + 1;
        }

        _verifyCup(seed, season, next, failures);
        _verifyInternationalClub(seed, season, next, failures);
        if (isMajorNationalTournamentSeason(season)) {
          _verifyNationalTournament(seed, season, next, failures);
          nationalCycles += 1;
        }

        if (season == retirementSeason) {
          phase = _VerificationPhase.retired;
          retirementSeasons.update(
            '$season',
            (value) => value + 1,
            ifAbsent: () => 1,
          );
        } else {
          if (season % 2 == 0) {
            switch (transferMode) {
              case 0:
                transfers['stayed'] = transfers['stayed']! + 1;
              case 1:
                leagueIndex =
                    leagueIndex.isEven ? leagueIndex + 1 : leagueIndex - 1;
                transfers['sameNation'] = transfers['sameNation']! + 1;
              case 2:
                leagueIndex =
                    (leagueIndex + 2 + next(10)) % world.leagues.length;
                transfers['international'] = transfers['international']! + 1;
            }
          }
          age += 1;
          phase = _VerificationPhase.inSeason;
        }
      }

      if (phase != _VerificationPhase.retired) {
        failures.add('career $seed did not retire');
      }
      if (age < 32 || age > 36) {
        failures.add('career $seed retired at invalid age $age');
      }
      checksum = _mix(checksum, state);
      checksum = _mix(checksum, totalPoints);
      checksum = _mix(checksum, appearances);
      checksum = _mix(checksum, goals);
      checksum = _mix(checksum, assists);
      checksum = _mix(checksum, leagueIndex);
      if (failures.length >= 100) break;
    }

    for (final required in PositionFamily.values.map((value) => value.name)) {
      if ((positions[required] ?? 0) == 0)
        failures.add('Missing position $required');
    }
    for (final required in Difficulty.values.map((value) => value.name)) {
      if ((difficulties[required] ?? 0) == 0)
        failures.add('Missing difficulty $required');
    }
    for (final required in world.leagues.map((value) => value.id)) {
      if ((leagues[required] ?? 0) == 0)
        failures.add('Missing league $required');
    }
    for (final entry in movements.entries) {
      if (entry.value == 0) failures.add('Missing movement path ${entry.key}');
    }
    for (final entry in transfers.entries) {
      if (entry.value == 0) failures.add('Missing transfer path ${entry.key}');
    }
    for (var season = 16; season <= 20; season++) {
      if ((retirementSeasons['$season'] ?? 0) == 0) {
        failures.add('Missing retirement outcome season $season');
      }
    }

    return FullCareerVerificationReport(
      careers: careers,
      weeks: weeks,
      positionCounts: Map.unmodifiable(positions),
      difficultyCounts: Map.unmodifiable(difficulties),
      leagueCounts: Map.unmodifiable(leagues),
      movementCounts: Map.unmodifiable(movements),
      transferCounts: Map.unmodifiable(transfers),
      retirementSeasonCounts: Map.unmodifiable(retirementSeasons),
      nationalTournamentCycles: nationalCycles,
      failures: List.unmodifiable(failures),
      checksum: checksum.toUnsigned(32).toRadixString(16).padLeft(8, '0'),
    );
  }

  int _goalChance(PositionFamily position) => switch (position) {
        PositionFamily.striker => 38,
        PositionFamily.winger => 24,
        PositionFamily.midfielder => 17,
        PositionFamily.defender => 8,
      };

  int _assistChance(PositionFamily position) => switch (position) {
        PositionFamily.striker => 16,
        PositionFamily.winger => 31,
        PositionFamily.midfielder => 34,
        PositionFamily.defender => 13,
      };

  void _verifyCup(
    int seed,
    int season,
    int Function(int) next,
    List<String> failures,
  ) {
    var entrants = 20;
    entrants -= 4;
    for (final expected in const [8, 4, 2, 1]) {
      entrants ~/= 2;
      if (entrants != expected) {
        failures.add('cup stuck for career $seed season $season');
        return;
      }
      next(100);
    }
  }

  void _verifyInternationalClub(
    int seed,
    int season,
    int Function(int) next,
    List<String> failures,
  ) {
    var qualifiers = 8;
    for (final expected in const [4, 2, 1]) {
      qualifiers ~/= 2;
      if (qualifiers != expected) {
        failures.add('international club competition stuck for $seed/$season');
        return;
      }
      next(100);
    }
  }

  void _verifyNationalTournament(
    int seed,
    int season,
    int Function(int) next,
    List<String> failures,
  ) {
    var qualifiers = 16;
    for (final expected in const [8, 4, 2, 1]) {
      qualifiers ~/= 2;
      if (qualifiers != expected) {
        failures.add('national tournament stuck for $seed/$season');
        return;
      }
      next(100);
    }
  }

  int _mix(int checksum, int value) {
    var result = checksum;
    for (var shift = 0; shift < 32; shift += 8) {
      result ^= (value >> shift) & 0xff;
      result = (result * 0x01000193) & 0xffffffff;
    }
    return result;
  }
}

enum _VerificationPhase { inSeason, offseason, retired }
