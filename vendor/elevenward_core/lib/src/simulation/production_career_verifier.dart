import '../content/content_catalog.dart';
import '../model/career_features.dart';
import '../model/career_snapshot.dart';
import '../model/career_types.dart';
import '../model/enums.dart';
import '../model/player_state.dart';
import '../model/reward_modifiers.dart';
import '../model/weekly_models.dart';
import '../world/world_generator.dart';
import '../world/world_models.dart';
import 'career_engine.dart';
import 'weekly_simulator.dart';
import 'world_simulator.dart';

final class ProductionCareerVerificationReport {
  const ProductionCareerVerificationReport({
    required this.careers,
    required this.startIndex,
    required this.weeks,
    required this.positionCounts,
    required this.archetypeCounts,
    required this.difficultyCounts,
    required this.startingLeagueCounts,
    required this.retirementSeasonCounts,
    required this.competitionCompletions,
    required this.transferCounts,
    required this.nationalTeamDecisionCounts,
    required this.leagueMovementCounts,
    required this.rewardProfileCounts,
    required this.failures,
    required this.checksum,
    this.featureCounts = const {},
  });

  final int careers;
  final int startIndex;
  final int weeks;
  final Map<String, int> positionCounts;
  final Map<String, int> archetypeCounts;
  final Map<String, int> difficultyCounts;
  final Map<String, int> startingLeagueCounts;
  final Map<String, int> retirementSeasonCounts;
  final Map<String, int> competitionCompletions;
  final Map<String, int> transferCounts;
  final Map<String, int> nationalTeamDecisionCounts;
  final Map<String, int> leagueMovementCounts;
  final Map<String, int> rewardProfileCounts;
  final List<String> failures;
  final String checksum;
  final Map<String, int> featureCounts;

  bool get passed => failures.isEmpty;

  Map<String, Object?> toJson() => {
        'engine': 'CareerSnapshot+WeeklySimulator+WorldSimulator+CareerEngine',
        'careers': careers,
        'startIndex': startIndex,
        'weeks': weeks,
        'positionCounts': positionCounts,
        'archetypeCounts': archetypeCounts,
        'difficultyCounts': difficultyCounts,
        'startingLeagueCounts': startingLeagueCounts,
        'retirementSeasonCounts': retirementSeasonCounts,
        'competitionCompletions': competitionCompletions,
        'transferCounts': transferCounts,
        'nationalTeamDecisionCounts': nationalTeamDecisionCounts,
        'leagueMovementCounts': leagueMovementCounts,
        'rewardProfileCounts': rewardProfileCounts,
        'failures': failures,
        'checksum': checksum,
        'passed': passed,
        'featureCounts': featureCounts,
      };
}

/// Release verifier that drives the same immutable state and simulation APIs as
/// the Flutter application. It supports deterministic shards so CI runners can
/// collectively qualify 100,000 full careers without a synthetic substitute.
final class ProductionCareerVerifier {
  const ProductionCareerVerifier();

  static const _weekly = WeeklySimulator();
  static const _world = WorldSimulator();
  static const _engine = CareerEngine();

  ProductionCareerVerificationReport run({
    int careers = 100000,
    int startIndex = 0,
  }) {
    if (careers < 1) throw ArgumentError.value(careers, 'careers');
    if (startIndex < 0) throw ArgumentError.value(startIndex, 'startIndex');
    final world = buildLaunchWorld();
    final catalog = buildLatestContent();
    final features = <String, int>{
      'mentorCompleted': 0,
      'loanStarted': 0,
      'loanReturned': 0,
      'goalCompleted': 0,
      'journalRoundTrips': 0,
      'roleContributions': 0
    };
    final positions = <String, int>{};
    final archetypes = <String, int>{};
    final difficulties = <String, int>{};
    final leagues = <String, int>{};
    final retirementSeasons = <String, int>{};
    final competitionCompletions = <String, int>{
      'domesticCup': 0,
      'internationalClub': 0,
      'nationalTournament': 0,
    };
    final transfers = <String, int>{
      'stayed': 0,
      'sameNation': 0,
      'international': 0,
    };
    final nationalTeamDecisions = <String, int>{
      'accepted': 0,
      'declined': 0,
    };
    final leagueMovements = <String, int>{
      'promoted': 0,
      'relegated': 0,
      'unchanged': 0,
    };
    final rewardProfiles = <String, int>{
      'standard': 0,
      'vip': 0,
      'double': 0,
      'allAccess': 0,
    };
    final failures = <String>[];
    var weeks = 0;
    var checksum = 0x811c9dc5;

    for (var offset = 0; offset < careers; offset++) {
      final index = startIndex + offset;
      final archetype = Archetype.values[index % Archetype.values.length];
      final difficulty =
          Difficulty.values[(index ~/ Archetype.values.length) % 3];
      final league = world.leagues[index % world.leagues.length];
      final club = world.club(
        league.clubIds[(index ~/ world.leagues.length) % league.clubIds.length],
      );
      final targetRetirementSeason = 16 + (index % 5);
      final transferMode = index % 3;
      final (rewardProfile, modifiers) = switch (index % 4) {
        0 => ('standard', RewardModifiers.standard),
        1 => (
            'vip',
            const RewardModifiers(
              developmentMultiplier: 1.5,
              moneyMultiplier: 1.5,
              sourceIds: ['vip'],
            ),
          ),
        2 => (
            'double',
            const RewardModifiers(
              developmentMultiplier: 2,
              moneyMultiplier: 2,
              sourceIds: ['doubleDevelopment', 'doubleMoney'],
            ),
          ),
        _ => (
            'allAccess',
            const RewardModifiers(
              developmentMultiplier: 3,
              moneyMultiplier: 3,
              sourceIds: ['allAccess'],
            ),
          ),
      };
      rewardProfiles[rewardProfile] = rewardProfiles[rewardProfile]! + 1;
      positions.update(
        archetype.positionFamily.name,
        (value) => value + 1,
        ifAbsent: () => 1,
      );
      archetypes.update(
        archetype.name,
        (value) => value + 1,
        ifAbsent: () => 1,
      );
      difficulties.update(
        difficulty.name,
        (value) => value + 1,
        ifAbsent: () => 1,
      );
      leagues.update(league.id, (value) => value + 1, ifAbsent: () => 1);

      var snapshot = CareerSnapshot.newCareer(
        careerId: 'verify-$index',
        seed: index + 1,
        updatedAt: DateTime.utc(2026, 1, 1),
        clubId: club.id,
        clubName: club.name,
        contentVersion: catalog.version,
        worldDefinition: world,
        difficulty: difficulty,
        player: PlayerState.newCareer(
          id: 'player-$index',
          name: 'Verifier',
          archetype: archetype,
          nationalTeamId:
              world.nationalTeams[index % world.nationalTeams.length].id,
        ),
      );
      snapshot = _engine.chooseCareerGoal(
          snapshot: snapshot,
          kind: CareerGoalKind.appearances,
          target: 25,
          updatedAt: snapshot.updatedAt);
      final startingClub = snapshot.clubId;
      try {
        while (!snapshot.retired) {
          while (snapshot.phase == CareerPhase.inSeason ||
              snapshot.phase == CareerPhase.internationalCallup ||
              snapshot.phase == CareerPhase.internationalTournament) {
            if (snapshot.phase == CareerPhase.internationalCallup) {
              final decision = index.isEven ? 'accepted' : 'declined';
              snapshot = _engine.decideNationalTeamCallUp(
                snapshot: snapshot,
                accept: index.isEven,
                updatedAt: snapshot.updatedAt.add(const Duration(minutes: 1)),
                definition: world,
              );
              nationalTeamDecisions[decision] =
                  nationalTeamDecisions[decision]! + 1;
              if (snapshot.phase == CareerPhase.offseason) break;
            }
            final wasClubSeason = snapshot.phase == CareerPhase.inSeason;
            final opponent = _world.opponentFor(snapshot, definition: world);
            final situations = catalog.matchSituations
                .where((item) => item.position == snapshot.player.position)
                .toList(growable: false);
            final situation = situations[
                (snapshot.seed ^ snapshot.revision).abs() % situations.length];
            final approach =
                SpotlightApproach.values[(snapshot.seed + snapshot.week) % 3];
            final option = situation.options.firstWhere(
              (item) => item.approach == approach,
            );
            snapshot = _weekly
                .advance(
                  snapshot: snapshot,
                  choice: WeeklyChoice(
                    focus: PlayerAttribute.values[
                        (snapshot.seed + snapshot.week) %
                            PlayerAttribute.values.length],
                    intensity: TrainingIntensity
                        .values[(snapshot.season + snapshot.week + index) % 3],
                    spotlightApproach: approach,
                  ),
                  opponent: opponent,
                  situationOption: option,
                  updatedAt: snapshot.updatedAt.add(const Duration(days: 7)),
                  modifiers: modifiers,
                  definition: world,
                  catalog: catalog,
                )
                .snapshot;
            if (wasClubSeason && snapshot.matchJournal.isNotEmpty) {
              final receipt = snapshot.matchJournal.first;
              final teamGoals =
                  receipt.isHome ? receipt.homeScore : receipt.awayScore;
              if (receipt.goals + receipt.assists > teamGoals)
                throw StateError('Personal contributions exceed team goals.');
            }
            if (snapshot.matchJournal.length > 40)
              throw StateError('Journal bound exceeded.');
            if (snapshot.week % 6 == 0) {
              final encoded = snapshot.encode();
              snapshot = CareerSnapshot.decode(encoded);
              if (snapshot.encode() != encoded)
                throw StateError('Journal reload changed durable state.');
              features['journalRoundTrips'] =
                  features['journalRoundTrips']! + 1;
            }
            final event = _engine.pendingEvent(snapshot, catalog);
            if (event == null) {
              weeks += 1;
              continue;
            }
            final affordable = event.choices
                .where((choice) =>
                    choice.moneyDelta >= 0 ||
                    snapshot.player.money >= -choice.moneyDelta)
                .toList();
            final choice =
                affordable[(snapshot.seed + snapshot.week) % affordable.length];
            snapshot = _engine.applyEventChoice(
              snapshot: snapshot,
              event: event,
              choice: choice,
              updatedAt: snapshot.updatedAt.add(const Duration(minutes: 1)),
              modifiers: modifiers,
            );
            weeks += 1;
          }
          for (final progress in snapshot.world.competitions.values) {
            if (!progress.isComplete) continue;
            competitionCompletions.update(
              progress.kind.name,
              (value) => value + 1,
              ifAbsent: () => 1,
            );
          }
          ContractOffer? offer;
          if (snapshot.season.isEven && transferMode != 0) {
            final offers = _engine.contractOffers(snapshot, definition: world);
            offer = offers.isEmpty ? null : offers.first;
          }
          if (snapshot.contract.seasonsRemaining <= 1 &&
              offer == null &&
              _engine.renewalOffer(snapshot, definition: world) == null) {
            final offers = _engine.contractOffers(snapshot, definition: world);
            if (offers.isNotEmpty) offer = offers.first;
          }
          LoanOffer? loan;
          if (snapshot.season != targetRetirementSeason &&
              index % 5 == 0 &&
              snapshot.season % 3 == 0) {
            final loans = _engine.loanOffers(snapshot, definition: world);
            if (loans.isNotEmpty) {
              loan = loans.first;
              offer = null;
              features['loanStarted'] = features['loanStarted']! + 1;
            }
          }
          if (snapshot.activeLoan != null) {
            offer = null;
            features['loanReturned'] = features['loanReturned']! + 1;
          }
          final beforeClub = snapshot.clubId;
          final beforeLeague = snapshot.world.leagueIdForClub(beforeClub);
          snapshot = _engine.completeOffseason(
            snapshot,
            acceptedOffer: offer,
            acceptedLoan: loan,
            retire: snapshot.season == targetRetirementSeason,
            definition: world,
            updatedAt: snapshot.updatedAt.add(const Duration(days: 21)),
          );
          if (snapshot.retired) break;
          if (snapshot.clubId == beforeClub) {
            final afterLeague = snapshot.world.leagueIdForClub(snapshot.clubId);
            final beforeDivision = world.leagues
                .firstWhere((item) => item.id == beforeLeague)
                .division;
            final afterDivision = world.leagues
                .firstWhere((item) => item.id == afterLeague)
                .division;
            final movement = beforeDivision == afterDivision
                ? 'unchanged'
                : beforeDivision == DivisionLevel.second
                    ? 'promoted'
                    : 'relegated';
            leagueMovements[movement] = leagueMovements[movement]! + 1;
          }
          if (snapshot.clubId == beforeClub) {
            transfers['stayed'] = transfers['stayed']! + 1;
          } else {
            final beforeNation = world.clubs
                .firstWhere((item) => item.id == beforeClub)
                .countryId;
            final afterNation = world.clubs
                .firstWhere((item) => item.id == snapshot.clubId)
                .countryId;
            final key =
                beforeNation == afterNation ? 'sameNation' : 'international';
            transfers[key] = transfers[key]! + 1;
          }
        }
        if (snapshot.seasonHistory.length != targetRetirementSeason) {
          failures.add(
            'career $index retired after ${snapshot.seasonHistory.length} seasons, expected $targetRetirementSeason',
          );
        }
        if (snapshot.contract.clubId != snapshot.clubId) {
          failures.add('career $index contract and club diverged');
        }
        retirementSeasons.update(
          '${snapshot.seasonHistory.length}',
          (value) => value + 1,
          ifAbsent: () => 1,
        );
        if (snapshot.storyFlags['mentor.stage'] == '3')
          features['mentorCompleted'] = features['mentorCompleted']! + 1;
        if (snapshot.careerGoal?.completed ?? false)
          features['goalCompleted'] = features['goalCompleted']! + 1;
        if (snapshot.roleStats
            .toJson()
            .values
            .any((value) => value is int && value > 0))
          features['roleContributions'] = features['roleContributions']! + 1;
        checksum = _mixString(checksum, snapshot.encode());
        checksum = _mixString(checksum, startingClub);
      } on Object catch (error) {
        failures.add('career $index failed: $error');
      }
      if (failures.length >= 100) break;
    }

    return ProductionCareerVerificationReport(
      featureCounts: features,
      careers: careers,
      startIndex: startIndex,
      weeks: weeks,
      positionCounts: Map.unmodifiable(positions),
      archetypeCounts: Map.unmodifiable(archetypes),
      difficultyCounts: Map.unmodifiable(difficulties),
      startingLeagueCounts: Map.unmodifiable(leagues),
      retirementSeasonCounts: Map.unmodifiable(retirementSeasons),
      competitionCompletions: Map.unmodifiable(competitionCompletions),
      transferCounts: Map.unmodifiable(transfers),
      nationalTeamDecisionCounts: Map.unmodifiable(nationalTeamDecisions),
      leagueMovementCounts: Map.unmodifiable(leagueMovements),
      rewardProfileCounts: Map.unmodifiable(rewardProfiles),
      failures: List.unmodifiable(failures),
      checksum: checksum.toUnsigned(32).toRadixString(16).padLeft(8, '0'),
    );
  }

  int _mixString(int checksum, String value) {
    var result = checksum;
    for (final unit in value.codeUnits) {
      result ^= unit;
      result = (result * 0x01000193) & 0xffffffff;
    }
    return result;
  }
}
