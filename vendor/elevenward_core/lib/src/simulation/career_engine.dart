import '../content/content_models.dart';
import '../model/career_features.dart';
import '../model/career_lifecycle.dart';
import '../model/career_progress.dart';
import '../model/career_snapshot.dart';
import '../model/career_types.dart';
import '../model/enums.dart';
import '../model/reward_modifiers.dart';
import '../world/world_generator.dart';
import '../world/world_models.dart';
import 'tactical_fit.dart';
import 'world_simulator.dart';

final class CareerEngine {
  const CareerEngine();

  static const _worldSimulator = WorldSimulator();
  static const transferRequestManagerTrustPenalty = 8;

  CareerSnapshot chooseCareerGoal(
      {required CareerSnapshot snapshot,
      required CareerGoalKind kind,
      int? target,
      required DateTime updatedAt}) {
    if (snapshot.retired)
      throw StateError('A retired career cannot choose a new ambition.');
    if (kind == CareerGoalKind.cleanSheets &&
        (!snapshot.usesModernCareerRules ||
            snapshot.player.position != PositionFamily.defender))
      throw StateError(
          'Clean-sheet ambitions require a defender career using modern rules.');
    if (kind == CareerGoalKind.nationalSelection &&
        careerGoalValue(snapshot, kind) > 0) {
      throw StateError('National selection has already been achieved.');
    }
    final count = target ??
        switch (kind) {
          CareerGoalKind.appearances => 25,
          CareerGoalKind.goals => 20,
          CareerGoalKind.assists => 20,
          CareerGoalKind.cleanSheets => 10,
          _ => 1
        };
    if (count < 1 ||
        count > 1000 ||
        (CareerGoalKind.values.indexOf(kind) >= 4 && count != 1)) {
      throw ArgumentError.value(
          count, 'target', 'Choose a positive achievable milestone.');
    }
    return snapshot.copyWith(
        revision: snapshot.revision + 1,
        updatedAt: updatedAt.toUtc(),
        careerGoal: CareerGoal(
            kind: kind,
            target: count,
            startValue: careerGoalValue(snapshot, kind),
            chosenSeason: snapshot.season));
  }

  CareerEventDefinition? eventById(String id, ContentCatalog catalog) =>
      catalog.careerEvents.where((event) => event.id == id).firstOrNull;
  CareerEventDefinition? pendingEvent(
          CareerSnapshot snapshot, ContentCatalog catalog) =>
      snapshot.pendingEventId == null
          ? null
          : eventById(snapshot.pendingEventId!, catalog);

  CareerSnapshot queueEvent(
          CareerSnapshot snapshot, CareerEventDefinition event) =>
      snapshot.copyWith(pendingEventId: event.id);

  CareerEventDefinition? selectNextEvent(
      CareerSnapshot snapshot, ContentCatalog catalog,
      {required double previousRating,
      required bool previousHighStakes,
      required bool nextHighStakes}) {
    if (snapshot.phase != CareerPhase.inSeason) return null;
    final context = CareerEventContext(
        previousPerformance: previousRating >= 7.5
            ? PreviousMatchPerformance.standout
            : previousRating >= 6.5
                ? PreviousMatchPerformance.steady
                : PreviousMatchPerformance.poor,
        previousGameWasHighStakes: previousHighStakes,
        nextGameIsHighStakes: nextHighStakes);
    final events = eligibleEvents(snapshot, catalog)
        .where((event) => event.matches(context))
        .toList();
    final story =
        events.where((event) => event.id.startsWith('mentor-')).firstOrNull;
    if (story != null) return story;
    return events.isEmpty
        ? null
        : events[(snapshot.seed ^ snapshot.revision).abs() % events.length];
  }

  List<LoanOffer> loanOffers(CareerSnapshot snapshot,
      {WorldDefinition? definition}) {
    if (!snapshot.usesModernCareerRules ||
        snapshot.phase != CareerPhase.offseason ||
        snapshot.retired ||
        snapshot.activeLoan != null ||
        snapshot.contract.seasonsRemaining < 3) return const [];
    final world = definition ?? buildLaunchWorld();
    final candidates = world.clubs
        .where((club) =>
            club.id != snapshot.clubId &&
            club.quality <= snapshot.player.overall + 2 &&
            _interest(snapshot, club) >= 42)
        .toList()
      ..sort((a, b) =>
          _tacticalFit(snapshot, b).compareTo(_tacticalFit(snapshot, a)));
    return candidates
        .take(3)
        .map((club) => LoanOffer(
            clubId: club.id,
            tacticalFit: _tacticalFit(snapshot, club),
            promisedRole: 'important',
            reason:
                'One season of first-team football. The host pays 100% of your existing wage and appearance bonus; you return to your parent contract next offseason.'))
        .toList(growable: false);
  }

  CareerSnapshot fileTransferRequest({
    required CareerSnapshot snapshot,
    required String targetLeagueId,
    required DateTime updatedAt,
    String? preferredClubId,
    WorldDefinition? definition,
  }) {
    if (snapshot.retired || snapshot.phase == CareerPhase.retired) {
      throw StateError('A retired player cannot request a transfer.');
    }
    final world = definition ?? buildLaunchWorld();
    if (!world.leagues.any((league) => league.id == targetLeagueId)) {
      throw ArgumentError.value(
        targetLeagueId,
        'targetLeagueId',
        'Unknown target league.',
      );
    }
    if (preferredClubId == snapshot.clubId) {
      throw ArgumentError.value(
        preferredClubId,
        'preferredClubId',
        'The current club cannot be the preferred destination.',
      );
    }
    if (preferredClubId != null &&
        !world.clubs.any((club) => club.id == preferredClubId)) {
      throw ArgumentError.value(
        preferredClubId,
        'preferredClubId',
        'Unknown preferred club.',
      );
    }
    final marketState = _transferMarketState(snapshot, world);
    final targetClubs = marketState.leagueParticipants[targetLeagueId];
    if (targetClubs == null) {
      throw ArgumentError.value(
        targetLeagueId,
        'targetLeagueId',
        'The target league is not active in this career.',
      );
    }
    if (preferredClubId != null && !targetClubs.contains(preferredClubId)) {
      throw ArgumentError.value(
        preferredClubId,
        'preferredClubId',
        'The preferred club is not in the target league.',
      );
    }
    final penaltyAlreadyApplied =
        snapshot.transferRequestTrustPenaltySeason == snapshot.season;
    final player = penaltyAlreadyApplied
        ? snapshot.player
        : snapshot.player.copyWith(
            managerTrust: (snapshot.player.managerTrust -
                    transferRequestManagerTrustPenalty)
                .clamp(1, 100),
          );
    return snapshot.copyWith(
      revision: snapshot.revision + 1,
      updatedAt: updatedAt.toUtc(),
      player: player,
      transferRequest: TransferRequest(
        targetLeagueId: targetLeagueId,
        preferredClubId: preferredClubId,
        filedSeason: snapshot.season,
        filedWeek: snapshot.week,
      ),
      transferRequestTrustPenaltySeason: snapshot.season,
    );
  }

  CareerSnapshot cancelTransferRequest({
    required CareerSnapshot snapshot,
    required DateTime updatedAt,
  }) {
    if (snapshot.retired || snapshot.phase == CareerPhase.retired) {
      throw StateError('A retired player cannot edit a transfer request.');
    }
    if (snapshot.transferRequest == null) {
      throw StateError('There is no active transfer request.');
    }
    return snapshot.copyWith(
      revision: snapshot.revision + 1,
      updatedAt: updatedAt.toUtc(),
      clearTransferRequest: true,
    );
  }

  List<ContractOffer> contractOffers(
    CareerSnapshot snapshot, {
    WorldDefinition? definition,
  }) {
    if (snapshot.activeLoan != null) return const [];
    final world = definition ?? buildLaunchWorld();
    final agent = agentFor(snapshot.activeAgentId);
    final clubs = [...world.clubs]..sort((left, right) {
        final leftInterest = _interest(snapshot, left);
        final rightInterest = _interest(snapshot, right);
        final comparison = rightInterest.compareTo(leftInterest);
        return comparison != 0 ? comparison : left.id.compareTo(right.id);
      });
    final qualifyingCandidates = clubs
        .where((club) => club.id != snapshot.clubId)
        .where((club) => _interest(snapshot, club) >= 42)
        .toList(growable: false);
    final standardCandidates = qualifyingCandidates.take(3).toList(
          growable: false,
        );
    final freeAgencyFallback = snapshot.contract.seasonsRemaining <= 1 &&
        renewalOffer(snapshot, definition: world) == null &&
        standardCandidates.isEmpty;
    final fallbackCandidates = freeAgencyFallback
        ? clubs
            .where((club) => club.id != snapshot.clubId)
            .where((club) => club.division == DivisionLevel.second)
            .take(3)
            .toList(growable: false)
        : standardCandidates;
    final request = snapshot.transferRequest;
    final candidates = request == null || freeAgencyFallback
        ? fallbackCandidates
        : _requestedTransferCandidates(
            snapshot: snapshot,
            world: world,
            request: request,
            qualifyingCandidates: qualifyingCandidates,
            fallbackCandidates: fallbackCandidates,
          );
    return candidates.map((club) {
      final fit = _tacticalFit(snapshot, club);
      final interest = _interest(snapshot, club);
      return ContractOffer(
        clubId: club.id,
        seasons: freeAgencyFallback
            ? 1
            : 2 + ((snapshot.seed ^ _stableHash(club.id)) & 1),
        weeklyWage: (((freeAgencyFallback ? 400 : 700) +
                    club.quality * (freeAgencyFallback ? 24 : 35) +
                    snapshot.player.reputation * 18) *
                (100 + agent.wageBonusPercent) /
                100)
            .round(),
        appearanceBonus: (freeAgencyFallback ? 75 : 150) + club.quality * 8,
        promisedRole: snapshot.player.overall >= club.quality + 2
            ? 'important'
            : snapshot.player.overall >= club.quality - 5
                ? 'rotation'
                : 'prospect',
        tacticalFit: fit,
        interestReason: freeAgencyFallback
            ? 'A second-division club offers a one-year route back through free agency.'
            : interest >= 70
                ? 'Your level and profile fit an immediate first-team need.'
                : fit >= 70
                    ? 'The manager believes your style fits the system.'
                    : 'The recruitment team sees room for you to grow.',
      );
    }).toList(growable: false);
  }

  List<ClubDefinition> _requestedTransferCandidates({
    required CareerSnapshot snapshot,
    required WorldDefinition world,
    required TransferRequest request,
    required List<ClubDefinition> qualifyingCandidates,
    required List<ClubDefinition> fallbackCandidates,
  }) {
    final marketState = _transferMarketState(snapshot, world);
    final targetIds = marketState.leagueParticipants[request.targetLeagueId];
    if (targetIds == null) return fallbackCandidates;
    final targetSet = targetIds.toSet();
    final targetCandidates = qualifyingCandidates
        .where((club) => targetSet.contains(club.id))
        .toList(growable: true);
    if (targetCandidates.isEmpty) return fallbackCandidates;

    final preferredId = request.preferredClubId;
    if (preferredId != null && targetSet.contains(preferredId)) {
      final preferredIndex = targetCandidates.indexWhere(
        (club) => club.id == preferredId,
      );
      if (preferredIndex > 0) {
        final preferred = targetCandidates.removeAt(preferredIndex);
        targetCandidates.insert(0, preferred);
      }
    }
    final result = <ClubDefinition>[];
    for (final club in [...targetCandidates, ...qualifyingCandidates]) {
      if (result.any((candidate) => candidate.id == club.id)) continue;
      result.add(club);
      if (result.length == 3) break;
    }
    return List.unmodifiable(result);
  }

  CareerWorldState _transferMarketState(
    CareerSnapshot snapshot,
    WorldDefinition world,
  ) =>
      snapshot.phase == CareerPhase.offseason
          ? _worldSimulator.beginNextSeason(
              snapshot.world,
              snapshot.seed,
              definition: world,
            )
          : snapshot.world;

  ContractOffer? renewalOffer(
    CareerSnapshot snapshot, {
    WorldDefinition? definition,
  }) {
    if (snapshot.activeLoan != null || snapshot.contract.seasonsRemaining > 1)
      return null;
    if (snapshot.player.managerTrust < 38 ||
        snapshot.contract.roleSatisfaction < 30) {
      return null;
    }
    final world = definition ?? buildLaunchWorld();
    final club = world.clubs.firstWhere((item) => item.id == snapshot.clubId);
    final strongSeason = snapshot.seasonPerformance.averageRating >= 7.0;
    return ContractOffer(
      clubId: club.id,
      seasons: strongSeason ? 3 : 2,
      weeklyWage:
          (snapshot.contract.weeklyWage * (strongSeason ? 1.25 : 1.10)).round(),
      appearanceBonus:
          snapshot.contract.appearanceBonus + (strongSeason ? 150 : 75),
      promisedRole:
          snapshot.player.overall >= club.quality ? 'important' : 'rotation',
      tacticalFit: _tacticalFit(snapshot, club),
      interestReason: strongSeason
          ? 'The club wants to reward your season with a longer renewal.'
          : 'Your trust and role record earned a renewal offer.',
    );
  }

  ContractOffer negotiateOffer({
    required CareerSnapshot snapshot,
    required ContractOffer offer,
    required NegotiationPriority priority,
  }) {
    final leverage = snapshot.player.reputation +
        snapshot.relationships.agent ~/ 2 +
        agentFor(snapshot.activeAgentId).wageBonusPercent;
    final accepted = leverage >=
        switch (priority) {
          NegotiationPriority.wage => 70,
          NegotiationPriority.role => 78,
          NegotiationPriority.term => 62,
        };
    if (!accepted) {
      return ContractOffer(
        clubId: offer.clubId,
        seasons: offer.seasons,
        weeklyWage: offer.weeklyWage,
        appearanceBonus: offer.appearanceBonus,
        promisedRole: offer.promisedRole,
        tacticalFit: offer.tacticalFit,
        interestReason:
            '${offer.interestReason} The club declined your requested ${priority.name} change because your leverage was $leverage.',
      );
    }
    return ContractOffer(
      clubId: offer.clubId,
      seasons: priority == NegotiationPriority.term
          ? offer.seasons + 1
          : offer.seasons,
      weeklyWage: priority == NegotiationPriority.wage
          ? (offer.weeklyWage * 1.08).round()
          : offer.weeklyWage,
      appearanceBonus: offer.appearanceBonus,
      promisedRole: priority == NegotiationPriority.role
          ? 'important'
          : offer.promisedRole,
      tacticalFit: offer.tacticalFit,
      interestReason:
          '${offer.interestReason} The club accepted your ${priority.name} request.',
    );
  }

  AgentDefinition agentFor(String id) => launchAgents.firstWhere(
        (agent) => agent.id == id,
        orElse: () => launchAgents.first,
      );

  /// Reports both successful and rejected interest so the UI never presents
  /// an unexplained transfer rejection.
  List<TransferInterest> transferMarketReport(
    CareerSnapshot snapshot, {
    WorldDefinition? definition,
  }) {
    final world = definition ?? buildLaunchWorld();
    final entries =
        world.clubs.where((club) => club.id != snapshot.clubId).map((club) {
      final interest = _interest(snapshot, club);
      final levelGap = club.quality - snapshot.player.overall;
      final reason = interest >= 42
          ? interest >= 70
              ? 'Your level and profile meet an immediate first-team need.'
              : 'Your form, reputation, and tactical fit cleared the club’s threshold.'
          : levelGap >= 8
              ? 'The club needs a higher current level for this role.'
              : snapshot.player.reputation < 35
                  ? 'Your reputation has not reached this recruitment network yet.'
                  : _tacticalFit(snapshot, club) < 65
                      ? 'The manager sees a weak fit with the current system.'
                      : 'The club chose a player with stronger recent form.';
      return TransferInterest(
        clubId: club.id,
        interest: interest.clamp(0, 100),
        accepted: interest >= 42,
        reason: reason,
      );
    }).toList();
    entries.sort((left, right) {
      final result = right.interest.compareTo(left.interest);
      return result != 0 ? result : left.clubId.compareTo(right.clubId);
    });
    return List.unmodifiable(entries);
  }

  CareerSnapshot completeOffseason(
    CareerSnapshot snapshot, {
    required DateTime updatedAt,
    ContractOffer? acceptedOffer,
    LoanOffer? acceptedLoan,
    bool retire = false,
    WorldDefinition? definition,
  }) {
    if (snapshot.phase != CareerPhase.offseason) {
      throw StateError('The career is not in the offseason.');
    }
    final world = definition ?? buildLaunchWorld();
    final nextWorld = _worldSimulator.beginNextSeason(
      snapshot.world,
      snapshot.seed,
      definition: world,
    );
    final trophies = _playerTrophies(snapshot, world, nextWorld);
    final performance = snapshot.seasonPerformance;
    final summary = SeasonSummary(
      season: snapshot.season,
      age: snapshot.player.age,
      clubId: snapshot.clubId,
      appearances: performance.appearances,
      goals: performance.goals,
      assists: performance.assists,
      averageRating: performance.averageRating,
      trophies: trophies,
    );
    var withHistory = snapshot.copyWith(
      seasonHistory: [...snapshot.seasonHistory, summary],
      updatedAt: updatedAt.toUtc(),
    );
    final currentLeague = world.leagues.firstWhere((league) =>
        league.id == snapshot.world.leagueIdForClub(snapshot.clubId));
    final nextLeague = world.leagues.firstWhere(
        (league) => league.id == nextWorld.leagueIdForClub(snapshot.clubId));
    if (currentLeague.division == DivisionLevel.second &&
        nextLeague.division == DivisionLevel.first) {
      withHistory = withHistory.copyWith(storyFlags: {
        ...withHistory.storyFlags,
        'career.promotions':
            '${(int.tryParse(withHistory.storyFlags['career.promotions'] ?? '0') ?? 0) + 1}'
      });
    }
    withHistory = updateCareerGoal(withHistory);
    if (retire || mustRetire(withHistory)) {
      if (retire &&
          !canChooseRetirement(withHistory) &&
          !mustRetire(withHistory)) {
        throw StateError('Retirement is not available yet.');
      }
      return retireCareer(withHistory, updatedAt.toUtc()).copyWith(
        clearActiveLoan: true,
        clearPendingEvent: true,
        clearTransferRequest: true,
        clearTransferRequestTrustPenaltySeason: true,
      );
    }

    if (acceptedOffer != null && acceptedLoan != null)
      throw StateError('Choose a transfer or a loan, not both.');
    final activeLoan = snapshot.activeLoan;
    if (activeLoan != null) {
      if (acceptedLoan != null || acceptedOffer != null)
        throw StateError(
            'Finish the loan and return before arranging another move.');
      final parent =
          world.clubs.firstWhere((club) => club.id == activeLoan.parentClubId);
      final remaining = activeLoan.parentContract.seasonsRemaining - 1;
      if (remaining < 1)
        throw StateError(
            'The parent contract expired. A loan must retain a guaranteed return season.');
      return withHistory.copyWith(
          revision: snapshot.revision + 1,
          updatedAt: updatedAt.toUtc(),
          season: snapshot.season + 1,
          week: 1,
          clubId: parent.id,
          clubName: parent.name,
          points: 0,
          player: snapshot.player.copyWith(
              age: snapshot.player.age + 1,
              fitness: (snapshot.player.fitness + 12).clamp(1, 100),
              form: 55),
          phase: CareerPhase.inSeason,
          world: nextWorld,
          seasonPerformance: const SeasonPerformance(),
          contract:
              activeLoan.parentContract.copyWith(seasonsRemaining: remaining),
          clearActiveLoan: true,
          clearPendingEvent: true,
          clearTransferRequest: true,
          clearTransferRequestTrustPenaltySeason: true);
    }
    if (acceptedLoan != null) {
      final valid = loanOffers(withHistory, definition: world).any((offer) =>
          offer.clubId == acceptedLoan.clubId &&
          offer.tacticalFit == acceptedLoan.tacticalFit &&
          offer.promisedRole == acceptedLoan.promisedRole);
      if (!valid) throw StateError('That loan is no longer available.');
      final host =
          world.clubs.firstWhere((club) => club.id == acceptedLoan.clubId);
      final parentContract = snapshot.contract
          .copyWith(seasonsRemaining: snapshot.contract.seasonsRemaining - 1);
      return withHistory.copyWith(
          revision: snapshot.revision + 1,
          updatedAt: updatedAt.toUtc(),
          season: snapshot.season + 1,
          week: 1,
          clubId: host.id,
          clubName: host.name,
          points: 0,
          player: snapshot.player.copyWith(
              age: snapshot.player.age + 1,
              fitness: (snapshot.player.fitness + 12).clamp(1, 100),
              form: 55),
          phase: CareerPhase.inSeason,
          world: nextWorld,
          seasonPerformance: const SeasonPerformance(),
          contract: parentContract.copyWith(
              clubId: host.id,
              seasonsRemaining: 1,
              promisedRole: acceptedLoan.promisedRole),
          activeLoan: LoanState(
              parentClubId: snapshot.clubId,
              hostClubId: host.id,
              parentContract: parentContract,
              returnSeason: snapshot.season + 2),
          clearPendingEvent: true,
          clearTransferRequest: true,
          clearTransferRequestTrustPenaltySeason: true);
    }

    final validOffers = contractOffers(withHistory, definition: world);
    bool matchesTerms(ContractOffer candidate, ContractOffer accepted) =>
        candidate.clubId == accepted.clubId &&
        candidate.seasons == accepted.seasons &&
        candidate.weeklyWage == accepted.weeklyWage &&
        candidate.appearanceBonus == accepted.appearanceBonus &&
        candidate.promisedRole == accepted.promisedRole &&
        candidate.tacticalFit == accepted.tacticalFit;
    if (acceptedOffer != null &&
        !validOffers.any((offer) =>
            matchesTerms(offer, acceptedOffer) ||
            NegotiationPriority.values.any((priority) => matchesTerms(
                negotiateOffer(
                    snapshot: withHistory, offer: offer, priority: priority),
                acceptedOffer)))) {
      throw StateError('That contract offer is no longer available.');
    }
    final club = acceptedOffer == null
        ? world.clubs.firstWhere((item) => item.id == snapshot.clubId)
        : world.clubs.firstWhere((item) => item.id == acceptedOffer.clubId);
    final renewal = renewalOffer(withHistory, definition: world);
    if (acceptedOffer == null &&
        snapshot.contract.seasonsRemaining <= 1 &&
        renewal == null) {
      throw StateError(
        'The contract expired and the club did not offer a renewal. Choose a new club.',
      );
    }
    final contract = acceptedOffer == null
        ? snapshot.contract.seasonsRemaining <= 1
            ? ContractState(
                clubId: snapshot.clubId,
                seasonsRemaining: renewal!.seasons,
                weeklyWage: renewal.weeklyWage,
                appearanceBonus: renewal.appearanceBonus,
                promisedRole: renewal.promisedRole,
              )
            : snapshot.contract.copyWith(
                clubId: snapshot.clubId,
                seasonsRemaining: snapshot.contract.seasonsRemaining - 1,
              )
        : ContractState(
            clubId: acceptedOffer.clubId,
            seasonsRemaining: acceptedOffer.seasons,
            weeklyWage: acceptedOffer.weeklyWage,
            appearanceBonus: acceptedOffer.appearanceBonus,
            promisedRole: acceptedOffer.promisedRole,
          );
    return withHistory.copyWith(
      revision: snapshot.revision + 1,
      updatedAt: updatedAt.toUtc(),
      season: snapshot.season + 1,
      week: 1,
      clubId: club.id,
      clubName: club.name,
      points: 0,
      player: snapshot.player.copyWith(
        age: snapshot.player.age + 1,
        fitness: (snapshot.player.fitness + 12).clamp(1, 100),
        form: 55,
      ),
      phase: CareerPhase.inSeason,
      world: nextWorld,
      seasonPerformance: const SeasonPerformance(),
      contract: contract,
      clearPendingEvent: true,
      clearTransferRequest: true,
      clearTransferRequestTrustPenaltySeason: true,
    );
  }

  CareerSnapshot applyEventChoice({
    required CareerSnapshot snapshot,
    required CareerEventDefinition event,
    required EventChoiceDefinition choice,
    required DateTime updatedAt,
    RewardModifiers modifiers = RewardModifiers.standard,
  }) {
    if (!event.choices.any((candidate) => candidate.id == choice.id)) {
      throw ArgumentError('Choice does not belong to this event.');
    }
    if (snapshot.pendingEventId != null && snapshot.pendingEventId != event.id)
      throw StateError('Resolve the pending story first.');
    if (!eligibleEventsForResolution(snapshot, event))
      throw StateError('This story is not available.');
    if (choice.moneyDelta < 0 && snapshot.player.money < -choice.moneyDelta)
      throw StateError('There is not enough money for that choice.');
    final token = '${snapshot.season}:${snapshot.week}:${event.id}';
    if (snapshot.resolvedEventIds.contains(token)) {
      throw StateError('This event has already been resolved.');
    }
    final relationships = switch (event.category) {
      CareerEventCategory.manager => snapshot.relationships.copyWith(
          manager: snapshot.relationships.manager + choice.trustDelta,
        ),
      CareerEventCategory.teammate => snapshot.relationships.copyWith(
          teammates: snapshot.relationships.teammates + choice.trustDelta + 1,
        ),
      CareerEventCategory.agent => snapshot.relationships.copyWith(
          agent: snapshot.relationships.agent + choice.trustDelta + 1,
        ),
      CareerEventCategory.family => snapshot.relationships.copyWith(
          family: snapshot.relationships.family +
              (snapshot.usesModernCareerRules
                  ? choice.familyDelta
                  : choice.wellnessDelta),
        ),
      CareerEventCategory.community => snapshot.relationships.copyWith(
          community: snapshot.relationships.community + choice.reputationDelta,
        ),
      _ => snapshot.relationships,
    };
    final startsSponsor = event.category == CareerEventCategory.sponsor &&
        choice.moneyDelta > 0 &&
        !snapshot.sponsorIds.contains(event.id);
    final appliedMoney = modifiers.applyPositiveMoney(choice.moneyDelta);
    final modern = snapshot.usesModernCareerRules;
    final nextContract = modern
        ? snapshot.contract.copyWith(
            weeklyWage:
                (snapshot.contract.weeklyWage * choice.weeklyWagePercent / 100)
                    .round()
                    .clamp(0, 1 << 30),
            appearanceBonus: (snapshot.contract.appearanceBonus +
                    choice.appearanceBonusDelta)
                .clamp(0, 1 << 30),
            seasonsRemaining: (snapshot.contract.seasonsRemaining +
                    choice.contractSeasonsDelta)
                .clamp(1, 10),
            promisedRole: choice.promisedRole)
        : snapshot.contract;
    final flags = <String, String>{...snapshot.storyFlags};
    if (modern && event.id.startsWith('mentor-')) {
      if (event.id == 'mentor-01-introduction') {
        flags['mentor.stage'] = '1';
        flags['mentor.path'] = choice.id == 'solo' ? 'solo' : 'shared';
      } else if (event.id == 'mentor-02-pressure') {
        flags['mentor.stage'] = '2';
        flags['mentor.pressure'] = choice.id;
      } else {
        flags['mentor.stage'] = '3';
        flags['mentor.outcome'] = switch (choice.id) {
          'reconcile' => 'alliance',
          'independent' => 'respect',
          _ => 'rivalry'
        };
      }
      flags['mentor.lastWeek'] =
          '${(snapshot.season - 1) * 18 + snapshot.week}';
    }
    final outcome = choice.outcome?.forLocale('en') ??
        '${choice.reputationDelta >= 0 ? '+' : ''}${choice.reputationDelta} reputation; ${choice.wellnessDelta >= 0 ? '+' : ''}${choice.wellnessDelta} wellness; '
            '${appliedMoney >= 0 ? '+' : ''}£$appliedMoney'
            '${nextContract.weeklyWage != snapshot.contract.weeklyWage || nextContract.appearanceBonus != snapshot.contract.appearanceBonus ? '; wage £${nextContract.weeklyWage}, appearance bonus £${nextContract.appearanceBonus}' : ''}'
            '${modern && choice.familyDelta != 0 ? '; family ${choice.familyDelta >= 0 ? '+' : ''}${choice.familyDelta}' : ''}.';
    return snapshot.copyWith(
      revision: snapshot.revision + 1,
      updatedAt: updatedAt.toUtc(),
      clearPendingEvent: true,
      contract: nextContract,
      storyFlags: flags,
      decisionJournal: [
        DecisionJournalEntry(
            eventId: event.id,
            choiceId: choice.id,
            season: snapshot.season,
            week: snapshot.week,
            title: event.title.forLocale('en'),
            choiceLabel: choice.label.forLocale('en'),
            outcome: outcome,
            effects: {
              'money':
                  (snapshot.player.money + appliedMoney).clamp(0, 1 << 52) -
                      snapshot.player.money,
              'reputation':
                  (snapshot.player.reputation + choice.reputationDelta)
                          .clamp(0, 100) -
                      snapshot.player.reputation,
              'wellness':
                  (snapshot.wellness + choice.wellnessDelta).clamp(0, 100) -
                      snapshot.wellness,
              'trust': event.category == CareerEventCategory.manager
                  ? (snapshot.player.managerTrust + choice.trustDelta)
                          .clamp(1, 100) -
                      snapshot.player.managerTrust
                  : 0,
              'fitness': modern
                  ? (snapshot.player.fitness + choice.fitnessDelta)
                          .clamp(1, 100) -
                      snapshot.player.fitness
                  : 0,
              'family': relationships.family - snapshot.relationships.family,
              'teammates':
                  relationships.teammates - snapshot.relationships.teammates,
              'weeklyWage':
                  nextContract.weeklyWage - snapshot.contract.weeklyWage,
              'appearanceBonus': nextContract.appearanceBonus -
                  snapshot.contract.appearanceBonus
            }),
        ...snapshot.decisionJournal
      ].take(40).toList(growable: false),
      wellness: (snapshot.wellness + choice.wellnessDelta).clamp(0, 100),
      relationships: relationships,
      player: snapshot.player.copyWith(
        fitness: modern
            ? (snapshot.player.fitness + choice.fitnessDelta).clamp(1, 100)
            : snapshot.player.fitness,
        managerTrust: event.category == CareerEventCategory.manager
            ? (snapshot.player.managerTrust + choice.trustDelta).clamp(1, 100)
            : snapshot.player.managerTrust,
        reputation:
            (snapshot.player.reputation + choice.reputationDelta).clamp(0, 100),
        money: (snapshot.player.money + appliedMoney).clamp(0, 1 << 52),
      ),
      resolvedEventIds: [...snapshot.resolvedEventIds, token],
      sponsorIds: startsSponsor
          ? {...snapshot.sponsorIds, event.id}.toList(growable: false)
          : snapshot.sponsorIds,
      sponsorContracts: startsSponsor
          ? [
              ...snapshot.sponsorContracts,
              SponsorContract(
                id: event.id,
                weeksRemaining: 12,
                weeklyPayout: (choice.moneyDelta / 4).round().clamp(100, 1000),
                obligation: 'maintain-reputation-35',
              ),
            ]
          : snapshot.sponsorContracts,
      boostIdsUsed: {
        ...snapshot.boostIdsUsed,
        if (choice.moneyDelta > 0 && modifiers.boostsMoney)
          ...modifiers.sourceIds,
      }.toList(growable: false)
        ..sort(),
    );
  }

  List<CareerEventDefinition> eligibleEvents(
    CareerSnapshot snapshot,
    ContentCatalog catalog,
  ) {
    final categoryLastWeek = <CareerEventCategory, int>{};
    final eventCategories = {
      for (final event in catalog.careerEvents) event.id: event.category,
    };
    final currentWeek = (snapshot.season - 1) * 18 + snapshot.week;
    for (final token in snapshot.resolvedEventIds) {
      final parts = token.split(':');
      if (parts.length != 3) continue;
      final category = eventCategories[parts[2]];
      final season = int.tryParse(parts[0]);
      final week = int.tryParse(parts[1]);
      if (category == null || season == null || week == null) continue;
      final absoluteWeek = (season - 1) * 18 + week;
      if (absoluteWeek > (categoryLastWeek[category] ?? -1)) {
        categoryLastWeek[category] = absoluteWeek;
      }
    }
    bool available(CareerEventDefinition event) {
      if (event.id.startsWith('mentor-'))
        return eligibleEventsForResolution(snapshot, event);

      if (snapshot.resolvedEventIds.contains(
        '${snapshot.season}:${snapshot.week}:${event.id}',
      )) {
        return false;
      }
      final lastWeek = categoryLastWeek[event.category];
      if (lastWeek != null && currentWeek - lastWeek < 4) return false;
      return switch (event.category) {
        CareerEventCategory.sponsor =>
          snapshot.player.reputation >= 35 && snapshot.sponsorContracts.isEmpty,
        CareerEventCategory.press => snapshot.player.reputation >= 20,
        CareerEventCategory.community => snapshot.player.reputation >= 15,
        CareerEventCategory.contract => snapshot.week >= 10 &&
            snapshot.activeLoan == null &&
            (!snapshot.usesModernCareerRules ||
                event.id != 'career-contract-01' ||
                !snapshot.resolvedEventIds.any((token) =>
                    token.startsWith('${snapshot.season}:') &&
                    token.endsWith(':${event.id}'))),
        CareerEventCategory.wellness => snapshot.player.fitness <= 78,
        CareerEventCategory.agent =>
          snapshot.activeAgentId != 'agent-independent',
        _ => true,
      };
    }

    return List.unmodifiable(catalog.careerEvents.where(available));
  }

  bool eligibleEventsForResolution(
      CareerSnapshot snapshot, CareerEventDefinition event) {
    if (!event.id.startsWith('mentor-')) return true;
    if (!snapshot.usesModernCareerRules ||
        snapshot.phase != CareerPhase.inSeason) return false;
    final stage = int.tryParse(snapshot.storyFlags['mentor.stage'] ?? '0') ?? 0;
    final absoluteWeek = (snapshot.season - 1) * 18 + snapshot.week;
    final last =
        int.tryParse(snapshot.storyFlags['mentor.lastWeek'] ?? '-10') ?? -10;
    if (absoluteWeek - last < 3) return false;
    return switch (event.id) {
      'mentor-01-introduction' => stage == 0 && snapshot.week >= 3,
      'mentor-02-pressure' => stage == 1,
      'mentor-03-shared' =>
        stage == 2 && snapshot.storyFlags['mentor.path'] == 'shared',
      'mentor-03-solo' =>
        stage == 2 && snapshot.storyFlags['mentor.path'] == 'solo',
      _ => false
    };
  }

  CareerSnapshot purchaseLifestyleItem({
    required CareerSnapshot snapshot,
    required LifestyleItemDefinition item,
    required DateTime updatedAt,
  }) {
    if (snapshot.ownedItemIds.contains(item.id)) {
      throw StateError('Item is already owned.');
    }
    if (snapshot.player.money < item.price) {
      throw StateError('The player cannot afford this item.');
    }
    return snapshot.copyWith(
      revision: snapshot.revision + 1,
      updatedAt: updatedAt.toUtc(),
      ownedItemIds: [...snapshot.ownedItemIds, item.id],
      equippedItemIds: {
        ...snapshot.equippedItemIds,
        item.category.name: item.id,
      },
      wellness: (snapshot.wellness + item.wellnessEffect).clamp(0, 100),
      player: snapshot.player.copyWith(
        money: snapshot.player.money - item.price,
        reputation:
            (snapshot.player.reputation + item.reputationEffect).clamp(0, 100),
      ),
    );
  }

  CareerSnapshot equipLifestyleItem({
    required CareerSnapshot snapshot,
    required LifestyleItemDefinition item,
    required DateTime updatedAt,
  }) {
    if (!snapshot.ownedItemIds.contains(item.id)) {
      throw StateError('Only owned items can be equipped.');
    }
    if (snapshot.equippedItemIds[item.category.name] == item.id) {
      return snapshot;
    }
    return snapshot.copyWith(
      revision: snapshot.revision + 1,
      updatedAt: updatedAt.toUtc(),
      equippedItemIds: {
        ...snapshot.equippedItemIds,
        item.category.name: item.id,
      },
    );
  }

  CareerSnapshot chooseAgent({
    required CareerSnapshot snapshot,
    required String agentId,
    required DateTime updatedAt,
  }) {
    if (!launchAgents.any((agent) => agent.id == agentId)) {
      throw ArgumentError.value(
          agentId, 'agentId', 'Invalid agent identifier.');
    }
    if (snapshot.activeAgentId == agentId) return snapshot;
    final agent = agentFor(agentId);
    return snapshot.copyWith(
      revision: snapshot.revision + 1,
      updatedAt: updatedAt.toUtc(),
      activeAgentId: agentId,
      relationships: snapshot.relationships.copyWith(
        agent: 50 + agent.relationshipBonus,
      ),
    );
  }

  NationalCallupRequirements nationalTeamRequirements(
    CareerSnapshot snapshot, {
    WorldDefinition? definition,
  }) {
    final world = definition ?? buildLaunchWorld();
    if (world.nationalTeams.length != 48) {
      return const NationalCallupRequirements(overall: 68, reputation: 60);
    }
    return nationalCallupRequirements(world, snapshot.player.nationalTeamId);
  }

  bool isNationalTeamEligible(
    CareerSnapshot snapshot, {
    WorldDefinition? definition,
  }) {
    final requirements = nationalTeamRequirements(
      snapshot,
      definition: definition,
    );
    return snapshot.player.reputation >= requirements.reputation &&
        snapshot.player.overall >= requirements.overall;
  }

  bool hasNationalTeamInvitation(
    CareerSnapshot snapshot, {
    WorldDefinition? definition,
  }) {
    final world = definition ?? buildLaunchWorld();
    if (world.nationalTeams.length != 48) {
      if (snapshot.phase != CareerPhase.inSeason ||
          !isNationalTeamEligible(snapshot, definition: world) ||
          snapshot.nationalTeam.decisionSeason == snapshot.season) {
        return false;
      }
      final tournament =
          snapshot.world.competitions['major-national-tournament'];
      return tournament != null &&
          !tournament.isComplete &&
          tournament.fixtures.any(
            (fixture) =>
                !fixture.isPlayed &&
                fixture.matchweek >= snapshot.week &&
                (fixture.homeId == snapshot.player.nationalTeamId ||
                    fixture.awayId == snapshot.player.nationalTeamId),
          );
    }
    if (snapshot.phase != CareerPhase.internationalCallup ||
        !isNationalTeamEligible(snapshot, definition: world) ||
        snapshot.nationalTeam.decision != NationalTeamDecision.undecided) {
      return false;
    }
    final tournament =
        snapshot.world.competitions['world-nations-championship'];
    if (tournament == null || tournament.isComplete) return false;
    return tournament.participantIds.contains(snapshot.player.nationalTeamId);
  }

  CareerSnapshot decideNationalTeamCallUp({
    required CareerSnapshot snapshot,
    required bool accept,
    required DateTime updatedAt,
    WorldDefinition? definition,
  }) {
    final world = definition ?? buildLaunchWorld();
    if (!hasNationalTeamInvitation(snapshot, definition: world)) {
      throw StateError('There is no active national-team call-up to decide.');
    }
    final nationalTeam = snapshot.nationalTeam.copyWith(
      decision: accept
          ? NationalTeamDecision.accepted
          : NationalTeamDecision.declined,
      decisionSeason: snapshot.season,
      tournamentMatchday: 1,
      cycleAppearances: 0,
    );
    if (world.nationalTeams.length != 48) {
      return updateCareerGoal(snapshot.copyWith(
        revision: snapshot.revision + 1,
        updatedAt: updatedAt.toUtc(),
        nationalTeam: nationalTeam,
      ));
    }
    if (accept) {
      return updateCareerGoal(snapshot.copyWith(
        revision: snapshot.revision + 1,
        updatedAt: updatedAt.toUtc(),
        phase: CareerPhase.internationalTournament,
        nationalTeam: nationalTeam,
      ));
    }
    final completedWorld = _worldSimulator.completeNationalTournament(
      snapshot: snapshot.copyWith(nationalTeam: nationalTeam),
      definition: world,
      playerFinishOverride: 'declinedCallup',
    );
    return updateCareerGoal(snapshot.copyWith(
      revision: snapshot.revision + 1,
      updatedAt: updatedAt.toUtc(),
      phase: CareerPhase.offseason,
      nationalTeam: nationalTeam,
      world: completedWorld,
    ));
  }

  List<String> _playerTrophies(
    CareerSnapshot snapshot,
    WorldDefinition world,
    CareerWorldState honors,
  ) {
    final trophies = <String>[];
    final table = snapshot.world.table(
      snapshot.world.leagueIdForClub(snapshot.clubId),
    );
    if (table.first.clubId == snapshot.clubId) trophies.add('league-title');
    for (final entry in honors.domesticCupWinners.entries) {
      if (entry.value == snapshot.clubId) trophies.add(entry.key);
    }
    if (honors.internationalClubWinner == snapshot.clubId) {
      trophies.add(world.internationalClubCompetition.id);
    }
    final championship = honors.nationalTournamentHistory
        .where((entry) => entry.season == snapshot.season)
        .firstOrNull;
    if (championship?.winnerId == snapshot.player.nationalTeamId &&
        (championship?.playerAppearances ?? 0) > 0) {
      trophies.add('world-nations-championship');
    }
    if (world.nationalTeams.length != 48 &&
        honors.nationalTournamentWinner == snapshot.player.nationalTeamId &&
        snapshot.nationalTeam.acceptedFor(snapshot.season)) {
      trophies.add('major-national-tournament');
    }
    return List.unmodifiable(trophies);
  }

  int _interest(CareerSnapshot snapshot, ClubDefinition club) {
    final levelFit = 70 - (club.quality - snapshot.player.overall).abs() * 3;
    final relationshipReach = snapshot.usesExpandedLifeRules
        ? snapshot.relationships.agent ~/ 10 +
            snapshot.relationships.community ~/ 20
        : 0;
    return levelFit +
        snapshot.player.reputation ~/ 3 +
        _tacticalFit(snapshot, club) ~/ 5 +
        relationshipReach +
        agentFor(snapshot.activeAgentId).marketReachBonus;
  }

  int _tacticalFit(CareerSnapshot snapshot, ClubDefinition club) =>
      calculateTacticalFit(snapshot, club);

  int _stableHash(String value) {
    var hash = 0x811c9dc5;
    for (final unit in value.codeUnits) {
      hash ^= unit;
      hash = (hash * 0x01000193) & 0x7fffffff;
    }
    return hash;
  }
}
