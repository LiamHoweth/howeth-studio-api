import 'dart:math' as math;

import '../content/content_models.dart';
import '../model/career_features.dart';
import '../model/career_snapshot.dart';
import '../model/career_types.dart';
import '../model/enums.dart';
import '../model/json_helpers.dart';
import '../model/player_state.dart';
import '../model/reward_modifiers.dart';
import '../model/weekly_models.dart';
import '../world/world_generator.dart';
import '../world/world_models.dart';
import 'career_engine.dart';
import 'match_report_generator.dart';
import 'news_engine.dart';
import 'world_simulator.dart';

double ageDevelopmentMultiplier(int age) => age <= 20
    ? .65
    : age <= 24
        ? .5
        : age <= 28
            ? .3
            : age <= 32
                ? .18
                : .08;

final class WeeklySimulator {
  const WeeklySimulator();

  static const _worldSimulator = WorldSimulator();
  static const _reportGenerator = MatchReportGenerator();
  static const _newsEngine = NewsEngine();

  TrainingPreview previewTraining({
    required CareerSnapshot snapshot,
    required PlayerAttribute focus,
    required TrainingIntensity intensity,
    RewardModifiers modifiers = RewardModifiers.standard,
  }) {
    final paused = snapshot.phase == CareerPhase.internationalTournament;
    final training =
        paused ? null : _trainingOutcome(snapshot, focus, intensity, modifiers);
    return TrainingPreview(
      attributeBefore: snapshot.player.attributes[focus],
      attributeAfter: training?.player.attributes[focus] ??
          snapshot.player.attributes[focus],
      fitnessBefore: snapshot.player.fitness,
      fitnessAfter: training?.player.fitness ?? snapshot.player.fitness,
      remainder:
          training?.remainder ?? snapshot.developmentProgress[focus] ?? 0,
      multiplier: modifiers.developmentMultiplier,
      paused: paused,
    );
  }

  SpotlightPreview previewSpotlight({
    required CareerSnapshot snapshot,
    required PlayerAttribute focus,
    required TrainingIntensity intensity,
    required SpotlightApproach approach,
    required OpponentContext opponent,
    SituationOption? situationOption,
    RewardModifiers modifiers = RewardModifiers.standard,
  }) {
    final trained = snapshot.phase == CareerPhase.internationalTournament
        ? snapshot.player
        : _trainingOutcome(snapshot, focus, intensity, modifiers).player;
    return _preview(
      trained,
      approach,
      opponent,
      snapshot.difficulty,
      situationOption: situationOption,
    );
  }

  SelectionExplanation previewSelection({
    required CareerSnapshot snapshot,
    required OpponentContext opponent,
    PlayerAttribute? focus,
    TrainingIntensity intensity = TrainingIntensity.balanced,
    RewardModifiers modifiers = RewardModifiers.standard,
  }) {
    final expandedLifeRules = snapshot.usesExpandedLifeRules;
    final player =
        focus == null || snapshot.phase == CareerPhase.internationalTournament
            ? snapshot.player
            : _trainingOutcome(snapshot, focus, intensity, modifiers).player;
    final reasons = <OutcomeFactor>[
      OutcomeFactor(
        label: 'Manager trust',
        detail: '${player.managerTrust}/100',
        impact: (player.managerTrust - 50) * 0.30,
      ),
      if (expandedLifeRules)
        OutcomeFactor(
          label: 'Manager relationship',
          detail: '${snapshot.relationships.manager}/100',
          impact: (snapshot.relationships.manager - 50) * 0.12,
        ),
      OutcomeFactor(
        label: 'Current form',
        detail: '${player.form}/100',
        impact: (player.form - 50) * 0.24,
      ),
      OutcomeFactor(
        label: 'Match fitness',
        detail: '${player.fitness}/100',
        impact: (player.fitness - 50) * 0.20,
      ),
      OutcomeFactor(
        label: 'Tactical fit',
        detail: '${opponent.tacticalFit}/100',
        impact: (opponent.tacticalFit - 50) * 0.18,
      ),
      OutcomeFactor(
        label: 'Player level',
        detail: '${player.overall} OVR',
        impact: (player.overall - 50) * 0.18,
      ),
    ];
    final score =
        50 + reasons.fold<double>(0, (sum, item) => sum + item.impact);
    final status = score >= 60
        ? SelectionStatus.starter
        : score >= 48
            ? SelectionStatus.bench
            : SelectionStatus.omitted;
    return SelectionExplanation(
      status: status,
      score: roundTo(score.clamp(0, 100).toDouble(), 1),
      reasons: List.unmodifiable(reasons),
    );
  }

  WeeklyResult advance({
    required CareerSnapshot snapshot,
    required WeeklyChoice choice,
    required OpponentContext opponent,
    required DateTime updatedAt,
    SituationOption? situationOption,
    RewardModifiers modifiers = RewardModifiers.standard,
    WorldDefinition? definition,
    ContentCatalog? catalog,
  }) {
    if (snapshot.pendingEventId != null)
      throw StateError(
          'Resolve the pending off-pitch decision before the next match.');
    final world = definition ?? buildLaunchWorld();
    final isNationalPostseason =
        snapshot.phase == CareerPhase.internationalTournament;
    if (snapshot.phase != CareerPhase.inSeason && !isNationalPostseason) {
      throw StateError('Only an active competition can advance a matchweek.');
    }
    if (situationOption != null &&
        situationOption.approach != choice.spotlightApproach) {
      throw ArgumentError(
          'The authored option must match the chosen approach.');
    }
    final training = isNationalPostseason
        ? (
            player: snapshot.player,
            progress: snapshot.developmentProgress,
            baseGain: 0,
            gain: 0,
            remainder: snapshot.developmentProgress[choice.focus] ?? 0,
          )
        : _trainingOutcome(
            snapshot,
            choice.focus,
            choice.intensity,
            modifiers,
          );
    final playerAfterTraining = training.player;
    final selection = previewSelection(
      snapshot: snapshot,
      opponent: opponent,
      focus: choice.focus,
      intensity: choice.intensity,
      modifiers: modifiers,
    );
    final preview = _preview(
      playerAfterTraining,
      choice.spotlightApproach,
      opponent,
      snapshot.difficulty,
      situationOption: situationOption,
    );
    final rng = _DeterministicRandom(snapshot.seed ^ snapshot.revision);
    final expandedLifeRules = snapshot.usesExpandedLifeRules;
    final roll = roundTo(rng.nextDouble() * 100, 1);
    final selected = selection.status != SelectionStatus.omitted;
    final success = selected && roll < preview.chance;

    final rating = selection.status == SelectionStatus.omitted
        ? snapshot.usesModernCareerRules
            ? 0.0
            : 5.8
        : roundTo(
            (success ? 7.65 : 6.15) +
                (success ? situationOption?.ratingUpside ?? 0 : 0) +
                (choice.spotlightApproach == SpotlightApproach.bold
                    ? 0.15
                    : 0) +
                (rng.nextDouble() - 0.5) * 0.5,
            1,
          ).clamp(5.0, 9.8).toDouble();

    final goalChance = success
        ? switch (choice.spotlightApproach) {
            SpotlightApproach.safe => 0.40,
            SpotlightApproach.balanced => 0.62,
            SpotlightApproach.bold => 0.82,
          }
        : 0.05;
    final roleGoalFactor = snapshot.usesModernCareerRules
        ? switch (snapshot.player.position) {
            PositionFamily.striker => 1.0,
            PositionFamily.winger => .7,
            PositionFamily.midfielder => .35,
            PositionFamily.defender => .12
          }
        : 1.0;
    final goals =
        selected && rng.nextDouble() < goalChance * roleGoalFactor ? 1 : 0;
    final assistChance = snapshot.usesModernCareerRules
        ? switch (snapshot.player.position) {
            PositionFamily.striker => .38,
            PositionFamily.winger => .55,
            PositionFamily.midfielder => .68,
            PositionFamily.defender => .18
          }
        : .38;
    var assists =
        selected && success && goals == 0 && rng.nextDouble() < assistChance
            ? 1
            : 0;

    final authoredTrust = situationOption?.trustRisk ?? 0;
    final earnedTrustDelta = selection.status == SelectionStatus.omitted
        ? -1
        : success
            ? 3 + authoredTrust.clamp(0, 2)
            : -1 + authoredTrust.clamp(-2, 0);
    final trustDelta = isNationalPostseason ? 0 : earnedTrustDelta;
    final hasHome =
        expandedLifeRules && snapshot.equippedItemIds.containsKey('home');
    final hasTransportation = expandedLifeRules &&
        snapshot.equippedItemIds.containsKey('transportation');
    final hasStyle =
        expandedLifeRules && snapshot.equippedItemIds.containsKey('style');
    final hasWellness =
        expandedLifeRules && snapshot.equippedItemIds.containsKey('wellness');
    final communityBoost =
        expandedLifeRules && snapshot.relationships.community >= 75 ? 1 : 0;
    final reputationDelta =
        success ? 2 + goals + (hasStyle ? 1 : 0) + communityBoost : 0;
    final formDelta = success ? 3 : -2;
    final baseMoneyIncome = isNationalPostseason
        ? 0
        : snapshot.contract.weeklyWage +
            (selected ? snapshot.contract.appearanceBonus : 0);
    // This is the net post-match load after ordinary between-week recovery.
    // The training load has already been applied to [playerAfterTraining].
    final postMatchFitnessDelta = switch (selection.status) {
      SelectionStatus.starter => -1,
      SelectionStatus.bench => 3,
      SelectionStatus.omitted => 6,
    };
    final lifestyleFitnessRecovery = isNationalPostseason
        ? 0
        : (hasTransportation ? 1 : 0) + (hasWellness ? 2 : 0);
    final familyFitnessRecovery = isNationalPostseason
        ? 0
        : expandedLifeRules && snapshot.relationships.family >= 75
            ? 1
            : 0;
    final finalFitness = (playerAfterTraining.fitness +
            postMatchFitnessDelta +
            lifestyleFitnessRecovery +
            familyFitnessRecovery)
        .clamp(1, 100);
    final fitnessDelta = finalFitness - snapshot.player.fitness;
    final roleSatisfactionDelta = isNationalPostseason
        ? 0
        : switch (snapshot.contract.promisedRole) {
            'important' => selection.status == SelectionStatus.starter ? 3 : -6,
            'rotation' => selection.status == SelectionStatus.omitted ? -3 : 2,
            _ => selection.status == SelectionStatus.omitted ? 0 : 2,
          };
    final payableSponsors = (isNationalPostseason
            ? const <SponsorContract>[]
            : snapshot.sponsorContracts)
        .where(
          (contract) =>
              contract.weeksRemaining > 0 &&
              !(contract.obligation == 'maintain-reputation-35' &&
                  snapshot.player.reputation < 35),
        )
        .toList(growable: false);
    final sponsorContracts = isNationalPostseason
        ? snapshot.sponsorContracts
        : payableSponsors
            .where((contract) => contract.weeksRemaining > 1)
            .map(
              (contract) => contract.copyWith(
                weeksRemaining: contract.weeksRemaining - 1,
              ),
            )
            .toList(growable: false);
    final sponsorPayout = payableSponsors.fold<int>(
      0,
      (sum, contract) => sum + contract.weeklyPayout,
    );
    final grossMoneyIncome = modifiers.applyPositiveMoney(
      baseMoneyIncome + sponsorPayout,
    );
    final activeAgent = launchAgents.firstWhere(
      (agent) => agent.id == snapshot.activeAgentId,
      orElse: () => launchAgents.first,
    );
    final agentFeeDue = !isNationalPostseason && snapshot.week % 4 == 0
        ? activeAgent.monthlyFee
        : 0;
    final availableForFee = playerAfterTraining.money + grossMoneyIncome;
    final agentFee = math.min(agentFeeDue, availableForFee);
    final agentReleased = agentFee < agentFeeDue;
    final finalMoneyIncome = grossMoneyIncome - agentFee;
    final finalSponsorPayout = modifiers.applyPositiveMoney(sponsorPayout);
    final payableSponsorIds = payableSponsors.map((item) => item.id).toSet();
    final endedSponsorIds = isNationalPostseason
        ? const <String>[]
        : snapshot.sponsorContracts
            .where(
              (contract) =>
                  !payableSponsorIds.contains(contract.id) ||
                  contract.weeksRemaining == 1,
            )
            .map((contract) => contract.id)
            .toList(growable: false);

    // A compact tactical simulation: role output, form, fitness, tactical fit,
    // venue, and team relationships shape territory and chance quality before
    // goals are sampled. This creates a coherent statistical match identity.
    final attackingLevel = playerAfterTraining.overall * 0.45 +
        playerAfterTraining.form * 0.18 +
        playerAfterTraining.fitness * 0.12 +
        opponent.tacticalFit * 0.25 +
        (success ? 6 : -2) +
        (opponent.isHome ? 3 : -2) +
        (expandedLifeRules
            ? (snapshot.relationships.teammates - 50) * 0.06
            : 0);
    final possession = (50 +
            (attackingLevel - opponent.quality) * 0.32 +
            (opponent.isHome ? 2 : -2) +
            (rng.nextDouble() - 0.5) * 8)
        .clamp(32, 68)
        .round();
    final expectedGoals = roundTo(
      (1.15 +
              (attackingLevel - opponent.quality) * 0.035 +
              (possession - 50) * 0.025 +
              (success ? 0.4 : -0.05) +
              (rng.nextDouble() - 0.5) * 0.5)
          .clamp(0.25, 3.8)
          .toDouble(),
      1,
    );
    final opponentExpectedGoals = roundTo(
      (1.1 +
              (opponent.quality - attackingLevel) * 0.03 +
              (50 - possession) * 0.02 +
              (rng.nextDouble() - 0.5) * 0.5)
          .clamp(0.2, 3.6)
          .toDouble(),
      1,
    );
    final playerClubGoals = math.max(
      goals,
      _poisson(expectedGoals, rng).clamp(0, 6),
    );
    // Suppress an impossible assist without another random draw. Older
    // published rules retain their exact ledger and seed consumption.
    if (snapshot.usesModernCareerRules && assists > playerClubGoals - goals)
      assists = (playerClubGoals - goals).clamp(0, assists);
    final rivalGoals = _poisson(opponentExpectedGoals, rng).clamp(0, 6);
    TeamResult teamResult = playerClubGoals > rivalGoals
        ? TeamResult.win
        : playerClubGoals < rivalGoals
            ? TeamResult.loss
            : TeamResult.draw;
    var homeScore = opponent.isHome ? playerClubGoals : rivalGoals;
    var awayScore = opponent.isHome ? rivalGoals : playerClubGoals;
    var fixtureDecision = FixtureDecision.regulation;
    final shots = math.max(
      playerClubGoals,
      (expectedGoals * 4.3 + rng.nextInt(5)).round(),
    );
    final shotsOnTarget = math.max(
      playerClubGoals,
      math.min(shots, (shots * (0.34 + rng.nextDouble() * 0.18)).round()),
    );
    final bigChances = math.max(
      playerClubGoals,
      (expectedGoals * 1.35 + rng.nextDouble()).floor(),
    );
    final momentumSwings = 1 + rng.nextInt(5);
    final lateDrama =
        (playerClubGoals - rivalGoals).abs() <= 1 && rng.nextDouble() < 0.58;
    final comeback = teamResult == TeamResult.win &&
        rivalGoals > 0 &&
        rng.nextDouble() < 0.38;
    final offPitch = isNationalPostseason
        ? ('', '')
        : _offPitchEvent(success, choice.intensity, rng.nextInt(3));

    final wellnessDelta = expandedLifeRules && !isNationalPostseason
        ? (hasHome ? 2 : 0) +
            (hasWellness ? 2 : 0) +
            (snapshot.relationships.family >= 75
                ? 1
                : snapshot.relationships.family < 30
                    ? -2
                    : 0) +
            switch (choice.intensity) {
              TrainingIntensity.light => 1,
              TrainingIntensity.balanced => 0,
              TrainingIntensity.intensive => -2,
            }
        : 0;

    final seasonComplete = !isNationalPostseason && snapshot.week == 18;
    final nextWeek = seasonComplete ? 18 : snapshot.week + 1;
    final nextSeason = snapshot.season;
    final nextAge = snapshot.player.age;
    final nextPlayer = playerAfterTraining.copyWith(
      age: nextAge,
      fitness: finalFitness,
      form: (playerAfterTraining.form + formDelta).clamp(1, 100),
      managerTrust: (playerAfterTraining.managerTrust + trustDelta).clamp(
        1,
        100,
      ),
      reputation: (playerAfterTraining.reputation + reputationDelta).clamp(
        0,
        100,
      ),
      money: (playerAfterTraining.money + finalMoneyIncome).clamp(0, 1 << 52),
      appearances: playerAfterTraining.appearances +
          (!isNationalPostseason && selected ? 1 : 0),
      goals: playerAfterTraining.goals + (isNationalPostseason ? 0 : goals),
      assists:
          playerAfterTraining.assists + (isNationalPostseason ? 0 : assists),
    );
    final nextPerformance = isNationalPostseason
        ? snapshot.seasonPerformance
        : snapshot.seasonPerformance.add(
            appeared: selected,
            goals: goals,
            assists: assists,
            rating: rating,
            countOnlyAppearances: snapshot.usesModernCareerRules,
          );
    final isNationalAppearance =
        opponent.competitionKind == CompetitionKind.nationalTournament &&
            selected;
    var nextNationalTeam = snapshot.nationalTeam;
    if (isNationalPostseason) {
      nextNationalTeam = snapshot.nationalTeam.copyWith(
        caps: snapshot.nationalTeam.caps + (isNationalAppearance ? 1 : 0),
        goals: snapshot.nationalTeam.goals + (isNationalAppearance ? goals : 0),
        assists: snapshot.nationalTeam.assists +
            (isNationalAppearance ? assists : 0),
        tournamentMatchday: snapshot.nationalTeam.tournamentMatchday + 1,
        cycleAppearances: snapshot.nationalTeam.cycleAppearances +
            (isNationalAppearance ? 1 : 0),
      );
    } else if (isNationalAppearance) {
      nextNationalTeam = snapshot.nationalTeam.copyWith(
        caps: snapshot.nationalTeam.caps + 1,
        goals: snapshot.nationalTeam.goals + goals,
        assists: snapshot.nationalTeam.assists + assists,
      );
    }
    var nextWorld = isNationalPostseason
        ? _worldSimulator.advanceNationalTournamentMatch(
            snapshot: snapshot.copyWith(
              nationalTeam: nextNationalTeam.copyWith(
                tournamentMatchday: snapshot.nationalTeam.tournamentMatchday,
              ),
            ),
            playerHomeScore: homeScore,
            playerAwayScore: awayScore,
            definition: world,
          )
        : _worldSimulator.advanceMatchweek(
            snapshot: snapshot,
            playerHomeScore: homeScore,
            playerAwayScore: awayScore,
            definition: world,
          );
    var nextPhase = seasonComplete
        ? CareerPhase.offseason
        : isNationalPostseason
            ? CareerPhase.internationalTournament
            : CareerPhase.inSeason;
    if (isNationalPostseason &&
        (nextWorld.competitions['world-nations-championship']?.isComplete ??
            true)) {
      nextPhase = CareerPhase.offseason;
    }
    if (seasonComplete) {
      final tournament = nextWorld.competitions['world-nations-championship'];
      if (tournament != null && !tournament.isComplete) {
        final requirements = nationalCallupRequirements(
          world,
          snapshot.player.nationalTeamId,
        );
        final qualified =
            tournament.participantIds.contains(snapshot.player.nationalTeamId);
        final invited = qualified &&
            snapshot.player.overall >= requirements.overall &&
            snapshot.player.reputation >= requirements.reputation;
        if (invited) {
          nextPhase = CareerPhase.internationalCallup;
          nextNationalTeam = snapshot.nationalTeam.copyWith(
            decision: NationalTeamDecision.undecided,
            decisionSeason: snapshot.season,
            tournamentMatchday: 1,
            cycleAppearances: 0,
          );
        } else {
          nextWorld = _worldSimulator.completeNationalTournament(
            snapshot: snapshot.copyWith(
              world: nextWorld,
              nationalTeam: snapshot.nationalTeam.copyWith(
                tournamentMatchday: 1,
                cycleAppearances: 0,
              ),
            ),
            definition: world,
            playerFinishOverride: qualified ? 'missedSquad' : 'didNotQualify',
          );
        }
      }
    }
    // Knockout ties are resolved by the world engine. The receipt must show
    // the same decisive score as the saved bracket, not the pre-tiebreak draw.
    final competition = nextWorld.competitions[opponent.competitionId];
    if (competition != null) {
      final playerId = competition.kind == CompetitionKind.nationalTournament
          ? snapshot.player.nationalTeamId
          : snapshot.clubId;
      final fixture = competition.fixtures
          .where((fixture) =>
              fixture.matchweek ==
                  (isNationalPostseason
                      ? snapshot.nationalTeam.tournamentMatchday
                      : snapshot.week) &&
              (fixture.homeId == playerId || fixture.awayId == playerId))
          .firstOrNull;
      if (fixture != null && fixture.isPlayed) {
        homeScore = fixture.homeGoals!;
        awayScore = fixture.awayGoals!;
        fixtureDecision = fixture.decision;
        final difference =
            opponent.isHome ? homeScore - awayScore : awayScore - homeScore;
        teamResult = difference > 0
            ? TeamResult.win
            : difference < 0
                ? TeamResult.loss
                : TeamResult.draw;
      }
    }
    var nextSnapshot = snapshot.copyWith(
      seed: rng.state,
      revision: snapshot.revision + 1,
      updatedAt: updatedAt.toUtc(),
      season: nextSeason,
      week: nextWeek,
      points: nextWorld
          .table(nextWorld.leagueIdForClub(snapshot.clubId))
          .firstWhere((record) => record.clubId == snapshot.clubId)
          .points,
      player: nextPlayer,
      phase: nextPhase,
      world: nextWorld,
      seasonPerformance: nextPerformance,
      nationalTeam: nextNationalTeam,
      wellness: (snapshot.wellness + wellnessDelta).clamp(0, 100),
      contract: snapshot.contract.copyWith(
        roleSatisfaction:
            snapshot.contract.roleSatisfaction + roleSatisfactionDelta,
      ),
      sponsorContracts: sponsorContracts,
      sponsorIds: sponsorContracts
          .map((contract) => contract.id)
          .toList(growable: false),
      activeAgentId:
          agentReleased ? 'agent-independent' : snapshot.activeAgentId,
      relationships: isNationalPostseason
          ? snapshot.relationships
          : snapshot.relationships.copyWith(
              manager: snapshot.relationships.manager + trustDelta,
              teammates: snapshot.relationships.teammates +
                  switch (teamResult) {
                    TeamResult.win => 2,
                    TeamResult.draw => 0,
                    TeamResult.loss => -1,
                  },
              agent: agentReleased ? 20 : snapshot.relationships.agent,
            ),
      developmentProgress: training.progress,
      boostIdsUsed: ({
        ...snapshot.boostIdsUsed,
        if ((training.baseGain > 0 && modifiers.boostsDevelopment) ||
            (baseMoneyIncome + sponsorPayout > 0 && modifiers.boostsMoney))
          ...modifiers.sourceIds,
      }.toList(growable: false)
        ..sort()),
    );

    final factors = [
      ...preview.factors,
      if (lifestyleFitnessRecovery > 0)
        OutcomeFactor(
          label: 'Equipped lifestyle',
          detail: '+$lifestyleFitnessRecovery fitness recovery',
          impact: lifestyleFitnessRecovery.toDouble(),
        ),
      if (communityBoost > 0)
        const OutcomeFactor(
          label: 'Community support',
          detail: 'Strong local reputation network',
          impact: 1,
        ),
      if (agentFee > 0)
        OutcomeFactor(
          label: 'Agent retainer',
          detail: '-£$agentFee monthly fee',
          impact: -agentFee / 100,
        ),
    ]..sort((a, b) => b.impact.abs().compareTo(a.impact.abs()));
    final metrics = MatchMetrics(
      possession: possession,
      shots: shots,
      shotsOnTarget: shotsOnTarget,
      expectedGoals: expectedGoals,
      opponentExpectedGoals: opponentExpectedGoals,
      bigChances: bigChances,
      momentumSwings: momentumSwings,
      lateDrama: lateDrama,
      comeback: comeback,
    );
    final copySeed =
        snapshot.seed ^ snapshot.revision ^ (homeScore << 8) ^ awayScore;
    final headline = _reportGenerator.headline(
      seed: copySeed,
      playerName: snapshot.player.name,
      opponentName: opponent.clubName,
      result: teamResult,
      playerGoals: goals,
      playerAssists: assists,
      lateDrama: lateDrama,
    );
    final playerTeamName = isNationalPostseason
        ? world.nationalTeam(snapshot.player.nationalTeamId).countryName
        : snapshot.clubName;
    final matchReport = _reportGenerator.generate(
      seed: copySeed,
      playerName: snapshot.player.name,
      clubName: playerTeamName,
      opponentName: opponent.clubName,
      isHome: opponent.isHome,
      homeScore: homeScore,
      awayScore: awayScore,
      result: teamResult,
      selection: selection.status,
      approach: choice.spotlightApproach,
      spotlightSucceeded: success,
      playerGoals: goals,
      playerAssists: assists,
      rating: rating,
      metrics: metrics,
    );
    final newsStories = _newsEngine.generateMatchweek(
      snapshot: nextSnapshot,
      season: snapshot.season,
      week: snapshot.week,
      opponent: opponent,
      result: teamResult,
      homeScore: homeScore,
      awayScore: awayScore,
      rating: rating,
      playerGoals: goals,
      playerAssists: assists,
      metrics: metrics,
      agentReleased: agentReleased,
    );
    final roleStats = snapshot.usesModernCareerRules && selected
        ? _roleContributions(playerAfterTraining, success, rating,
            opponent.isHome ? awayScore : homeScore, teamResult)
        : const RoleStats();
    nextSnapshot = updateCareerGoal(nextSnapshot.copyWith(
        roleStats: snapshot.roleStats.add(roleStats),
        matchJournal: [
          MatchJournalEntry(
              id:
                  '${snapshot.season}:${snapshot.week}:${opponent.competitionId ?? opponent.clubId}:${snapshot.revision}',
              season: snapshot.season,
              week: isNationalPostseason
                  ? snapshot.nationalTeam.tournamentMatchday
                  : snapshot.week,
              clubName: playerTeamName,
              opponentName: opponent.clubName,
              isHome: opponent.isHome,
              homeScore: homeScore,
              awayScore: awayScore,
              rating: rating,
              goals: goals,
              assists: assists,
              appeared: selected,
              headline: headline,
              report: matchReport,
              roleStats: roleStats,
              competitionId: opponent.competitionId,
              metrics: {
                'possession': possession,
                'shots': shots,
                'shotsOnTarget': shotsOnTarget,
                'expectedGoals': expectedGoals,
                'opponentExpectedGoals': opponentExpectedGoals,
                'bigChances': bigChances,
                'momentumSwings': momentumSwings,
                'lateDrama': lateDrama,
                'comeback': comeback
              }),
          ...snapshot.matchJournal
        ].take(40).toList(growable: false)));
    if (catalog != null && nextSnapshot.phase == CareerPhase.inSeason) {
      const engine = CareerEngine();
      final nextOpponent =
          _worldSimulator.opponentFor(nextSnapshot, definition: world);
      final event = engine.selectNextEvent(nextSnapshot, catalog,
          previousRating: rating,
          previousHighStakes:
              opponent.competitionKind != CompetitionKind.league,
          nextHighStakes:
              nextOpponent.competitionKind != CompetitionKind.league);
      if (event != null) nextSnapshot = engine.queueEvent(nextSnapshot, event);
    }
    final storyIds = newsStories.map((story) => story.id).toSet();
    nextSnapshot = nextSnapshot.copyWith(
      newsFeed: [
        ...newsStories,
        ...snapshot.newsFeed.where((story) => !storyIds.contains(story.id)),
      ].take(60).toList(growable: false),
    );

    return WeeklyResult(
      snapshot: nextSnapshot,
      opponent: opponent,
      selection: selection,
      preview: preview,
      spotlightSucceeded: success,
      roll: roll,
      teamResult: teamResult,
      homeScore: homeScore,
      awayScore: awayScore,
      deltas: StatDeltas(
        rating: rating,
        trust: trustDelta,
        reputation: reputationDelta,
        money: finalMoneyIncome,
        fitness: fitnessDelta,
        form: formDelta,
        goals: goals,
        assists: assists,
      ),
      factors: List.unmodifiable(factors.take(7)),
      headline: headline,
      matchReport: matchReport,
      metrics: metrics,
      newsStories: newsStories,
      offPitchTitle: offPitch.$1,
      offPitchBody: offPitch.$2,
      sponsorPayout: finalSponsorPayout,
      endedSponsorIds: List.unmodifiable(endedSponsorIds),
      fixtureDecision: fixtureDecision,
      trainedAttribute: choice.focus,
      developmentGain: training.gain,
      developmentRemainder: training.remainder,
      developmentMultiplier: modifiers.developmentMultiplier,
      moneyMultiplier: modifiers.moneyMultiplier,
      agentFee: agentFee,
      agentReleased: agentReleased,
    );
  }

  RoleStats _roleContributions(PlayerState player, bool success, double rating,
      int conceded, TeamResult result) {
    final created = success
        ? (1 + player.attributes[PlayerAttribute.passing] ~/ 45).clamp(1, 3)
        : 0;
    return RoleStats(
        keyPasses: player.position == PositionFamily.midfielder ? created : 0,
        chancesCreated: player.position == PositionFamily.midfielder ||
                player.position == PositionFamily.winger
            ? created
            : 0,
        successfulDribbles: player.position == PositionFamily.winger
            ? (success
                ? 1 + player.attributes[PlayerAttribute.technique] ~/ 35
                : 0)
            : 0,
        tackles: player.position == PositionFamily.defender
            ? (1 +
                player.attributes[PlayerAttribute.defending] ~/ 30 +
                (success ? 2 : 0))
            : 0,
        interceptions:
            player.position == PositionFamily.defender ? (success ? 2 : 1) : 0,
        cleanSheets:
            player.position == PositionFamily.defender && conceded == 0 ? 1 : 0,
        playerOfMatchAwards:
            success && rating >= 8.0 && result == TeamResult.win ? 1 : 0);
  }

  int _poisson(double lambda, _DeterministicRandom rng) {
    final limit = math.exp(-lambda);
    var product = 1.0;
    var count = 0;
    do {
      count++;
      product *= rng.nextDouble();
    } while (product > limit && count < 8);
    return count - 1;
  }

  ({
    PlayerState player,
    Map<PlayerAttribute, double> progress,
    int baseGain,
    int gain,
    double remainder,
  }) _trainingOutcome(
    CareerSnapshot snapshot,
    PlayerAttribute focus,
    TrainingIntensity intensity,
    RewardModifiers modifiers,
  ) {
    final baseGain = switch (intensity) {
      TrainingIntensity.light => 0,
      TrainingIntensity.balanced => 1,
      TrainingIntensity.intensive => 2,
    };
    final fitnessChange = switch (intensity) {
      TrainingIntensity.light => 6,
      TrainingIntensity.balanced => -2,
      TrainingIntensity.intensive => -8,
    };
    final player = snapshot.player;
    final currentProgress = snapshot.developmentProgress[focus] ?? 0;
    final accumulated = currentProgress +
        baseGain *
            modifiers.developmentMultiplier *
            (snapshot.usesModernCareerRules
                ? ageDevelopmentMultiplier(player.age)
                : 1);
    final room = 99 - player.attributes[focus];
    final gain = accumulated.floor().clamp(0, room).toInt();
    final capped = gain >= room;
    final remainder = capped ? 0.0 : accumulated - gain;
    final progress = <PlayerAttribute, double>{
      ...snapshot.developmentProgress,
      if (remainder > 0) focus: remainder,
    };
    if (remainder == 0) progress.remove(focus);
    return (
      player: player.copyWith(
        attributes: player.attributes.improve(focus, gain),
        fitness: (player.fitness + fitnessChange).clamp(1, 100),
      ),
      progress: Map.unmodifiable(progress),
      baseGain: baseGain,
      gain: gain,
      remainder: remainder,
    );
  }

  SpotlightPreview _preview(PlayerState player, SpotlightApproach approach,
      OpponentContext opponent, Difficulty difficulty,
      {SituationOption? situationOption}) {
    final defaultAttributes = switch (player.position) {
      PositionFamily.striker => switch (approach) {
          SpotlightApproach.safe => [
              PlayerAttribute.technique,
              PlayerAttribute.composure
            ],
          SpotlightApproach.balanced => [
              PlayerAttribute.finishing,
              PlayerAttribute.technique
            ],
          SpotlightApproach.bold => [
              PlayerAttribute.finishing,
              PlayerAttribute.composure
            ],
        },
      PositionFamily.winger => switch (approach) {
          SpotlightApproach.safe => [
              PlayerAttribute.passing,
              PlayerAttribute.composure
            ],
          SpotlightApproach.balanced => [
              PlayerAttribute.pace,
              PlayerAttribute.technique
            ],
          SpotlightApproach.bold => [
              PlayerAttribute.technique,
              PlayerAttribute.finishing
            ],
        },
      PositionFamily.midfielder => switch (approach) {
          SpotlightApproach.safe => [
              PlayerAttribute.passing,
              PlayerAttribute.composure
            ],
          SpotlightApproach.balanced => [
              PlayerAttribute.technique,
              PlayerAttribute.passing
            ],
          SpotlightApproach.bold => [
              PlayerAttribute.stamina,
              PlayerAttribute.technique
            ],
        },
      PositionFamily.defender => switch (approach) {
          SpotlightApproach.safe => [
              PlayerAttribute.defending,
              PlayerAttribute.composure
            ],
          SpotlightApproach.balanced => [
              PlayerAttribute.defending,
              PlayerAttribute.strength
            ],
          SpotlightApproach.bold => [
              PlayerAttribute.pace,
              PlayerAttribute.defending
            ],
        },
    };
    final attributes = situationOption != null &&
            situationOption.approach == approach &&
            situationOption.primaryAttributes.length >= 2
        ? situationOption.primaryAttributes.take(2).toList(growable: false)
        : defaultAttributes;
    final relevantValue = player.attributes[attributes[0]] * 0.56 +
        player.attributes[attributes[1]] * 0.44;
    final riskImpact = switch (approach) {
          SpotlightApproach.safe => 9.0,
          SpotlightApproach.balanced => 0.0,
          SpotlightApproach.bold => -11.0,
        } +
        (situationOption?.trustRisk ?? 0) * .8 +
        (situationOption?.ratingUpside ?? 0) * 2;
    final factors = <OutcomeFactor>[
      OutcomeFactor(
        label: 'Key attributes',
        detail:
            '${_title(attributes[0].name)} ${player.attributes[attributes[0]]} · '
            '${_title(attributes[1].name)} ${player.attributes[attributes[1]]}',
        impact: (relevantValue - 50) * 0.72,
      ),
      OutcomeFactor(
        label: 'Match fitness',
        detail: '${player.fitness}/100',
        impact: (player.fitness - 50) * 0.16,
      ),
      OutcomeFactor(
        label: 'Current form',
        detail: '${player.form}/100',
        impact: (player.form - 50) * 0.14,
      ),
      OutcomeFactor(
        label: 'Tactical fit',
        detail: '${opponent.tacticalFit}/100',
        impact: (opponent.tacticalFit - 50) * 0.14,
      ),
      OutcomeFactor(
        label: 'Opponent quality',
        detail: '${opponent.quality}/100',
        impact: -(opponent.quality - 50) * 0.22,
      ),
      OutcomeFactor(
        label: 'Chosen risk',
        detail: _title(approach.name),
        impact: riskImpact,
      ),
      OutcomeFactor(
        label: 'Difficulty',
        detail: _title(difficulty.name),
        impact: switch (difficulty) {
          Difficulty.story => 6,
          Difficulty.professional => 0,
          Difficulty.worldClass => -6,
        },
      ),
      OutcomeFactor(
        label: opponent.isHome ? 'Home support' : 'Away pressure',
        detail: opponent.isHome ? '+2 advantage' : '-2 pressure',
        impact: opponent.isHome ? 2 : -2,
      ),
    ];
    final chance = roundTo(
      (38 + factors.fold<double>(0, (sum, item) => sum + item.impact))
          .clamp(15, 90)
          .toDouble(),
      1,
    );
    return SpotlightPreview(
      approach: approach,
      chance: chance,
      chanceLow: (chance - 4).clamp(10, 90).round(),
      chanceHigh: (chance + 4).clamp(10, 90).round(),
      primaryAttributes: List.unmodifiable(attributes),
      factors: List.unmodifiable(factors),
    );
  }

  (String, String) _offPitchEvent(
    bool success,
    TrainingIntensity intensity,
    int variant,
  ) {
    if (intensity == TrainingIntensity.intensive) {
      return (
        'Recovery comes first',
        'The physio holds you back after training. You choose an early night over the team dinner.',
      );
    }
    if (success && variant.isEven) {
      return (
        'A shirt for the academy',
        'You stay after the whistle to meet a youth player. The small gesture travels around town.',
      );
    }
    return (
      'Eyes back on the work',
      'A reporter asks about your future. You keep the answer on the club and the next match.',
    );
  }

  String _title(String value) =>
      '${value[0].toUpperCase()}${value.substring(1)}';
}

final class _DeterministicRandom {
  _DeterministicRandom(int seed) : _state = seed & 0x7fffffff {
    if (_state == 0) _state = 0x13579b;
  }

  int _state;

  int get state => _state;

  double nextDouble() {
    _state = (1103515245 * _state + 12345) & 0x7fffffff;
    return _state / 0x80000000;
  }

  int nextInt(int maxExclusive) => (nextDouble() * maxExclusive).floor();
}
