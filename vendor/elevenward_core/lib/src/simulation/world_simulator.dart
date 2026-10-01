import '../model/career_progress.dart';
import '../model/career_snapshot.dart';
import '../model/career_types.dart';
import '../model/weekly_models.dart';
import '../world/world_generator.dart';
import '../world/world_models.dart';
import 'tactical_fit.dart';

final class WorldSimulator {
  const WorldSimulator();

  static final Map<String, List<Fixture>> _scheduleCache = {};

  List<Fixture> _schedule(String leagueId, List<String> participants) {
    final key = '$leagueId:${participants.join(',')}';
    return _scheduleCache.putIfAbsent(
      key,
      () => buildDoubleRoundRobinSchedule(
        competitionId: leagueId,
        participantIds: participants,
      ),
    );
  }

  OpponentContext opponentFor(
    CareerSnapshot snapshot, {
    WorldDefinition? definition,
  }) {
    final world = definition ?? buildLaunchWorld();
    final state = snapshot.world.leagueParticipants.isEmpty
        ? CareerWorldState.initial(world)
        : snapshot.world;
    final competitions = state.competitions.isEmpty
        ? _newCompetitions(state, world, snapshot.season)
        : state.competitions;
    final expandedWorld = _isExpandedWorld(world);
    final isNationalPostseason =
        snapshot.phase == CareerPhase.internationalTournament;
    final calendarWeek = isNationalPostseason
        ? snapshot.nationalTeam.tournamentMatchday
        : snapshot.week;
    final selectedForNational =
        snapshot.nationalTeam.acceptedFor(snapshot.season);
    final scheduled = competitions.values
        .expand(
          (competition) => competition.fixtures.where(
            (fixture) =>
                fixture.matchweek == calendarWeek &&
                !fixture.isPlayed &&
                (isNationalPostseason
                    ? competition.kind == CompetitionKind.nationalTournament &&
                        selectedForNational &&
                        (fixture.homeId == snapshot.player.nationalTeamId ||
                            fixture.awayId == snapshot.player.nationalTeamId)
                    : (competition.kind != CompetitionKind.nationalTournament &&
                            (fixture.homeId == snapshot.clubId ||
                                fixture.awayId == snapshot.clubId)) ||
                        (!expandedWorld &&
                            selectedForNational &&
                            competition.kind ==
                                CompetitionKind.nationalTournament &&
                            (fixture.homeId == snapshot.player.nationalTeamId ||
                                fixture.awayId ==
                                    snapshot.player.nationalTeamId))),
          ),
        )
        .toList()
      ..sort((left, right) {
        int priority(Fixture fixture) =>
            switch (competitions[fixture.competitionId]?.kind) {
              CompetitionKind.nationalTournament => 0,
              CompetitionKind.internationalClub => 1,
              CompetitionKind.domesticCup => 2,
              _ => 3,
            };

        return priority(left).compareTo(priority(right));
      });
    if (scheduled.isNotEmpty) {
      final fixture = scheduled.first;
      final competition = competitions[fixture.competitionId]!;
      final playerId = competition.kind == CompetitionKind.nationalTournament
          ? snapshot.player.nationalTeamId
          : snapshot.clubId;
      final opponentId =
          fixture.homeId == playerId ? fixture.awayId : fixture.homeId;
      final club = world.clubs.where((item) => item.id == opponentId);
      final national =
          world.nationalTeams.where((item) => item.id == opponentId);
      final opponentName = club.isNotEmpty
          ? club.first.name
          : national.isNotEmpty
              ? national.first.countryName
              : opponentId;
      final quality = club.isNotEmpty
          ? club.first.quality
          : national.isNotEmpty
              ? national.first.quality
              : 65;
      return OpponentContext(
        clubId: opponentId,
        clubName: opponentName,
        quality: quality,
        tacticalFit: snapshot.usesModernCareerRules
            ? calculateTacticalFit(snapshot,
                world.clubs.firstWhere((club) => club.id == snapshot.clubId))
            : (55 + ((snapshot.seed ^ _stableHash(opponentId)) % 26))
                .clamp(1, 100),
        isHome: fixture.homeId == playerId,
        competitionId: competition.id,
        competitionKind: competition.kind,
      );
    }
    if (isNationalPostseason) {
      throw StateError(
        'The player has no remaining World Nations Championship fixture.',
      );
    }
    final leagueId = state.leagueIdForClub(snapshot.clubId);
    final schedule = _schedule(
      leagueId,
      state.leagueParticipants[leagueId]!,
    );
    final fixture = schedule.firstWhere(
      (item) =>
          item.matchweek == snapshot.week &&
          (item.homeId == snapshot.clubId || item.awayId == snapshot.clubId),
    );
    final opponentId =
        fixture.homeId == snapshot.clubId ? fixture.awayId : fixture.homeId;
    final opponent = world.clubs.firstWhere((club) => club.id == opponentId);
    final club = world.clubs.firstWhere((item) => item.id == snapshot.clubId);
    final archetypeFit =
        (snapshot.player.archetype.index * 7 + club.quality) % 17;
    return OpponentContext(
      clubId: opponent.id,
      clubName: opponent.name,
      quality: opponent.quality,
      tacticalFit: snapshot.usesModernCareerRules
          ? calculateTacticalFit(snapshot, club)
          : (58 + archetypeFit).clamp(1, 100),
      isHome: fixture.homeId == snapshot.clubId,
      competitionId: leagueId,
    );
  }

  CareerWorldState advanceMatchweek({
    required CareerSnapshot snapshot,
    required int playerHomeScore,
    required int playerAwayScore,
    WorldDefinition? definition,
  }) {
    final world = definition ?? buildLaunchWorld();
    final state = snapshot.world.leagueParticipants.isEmpty
        ? CareerWorldState.initial(world)
        : snapshot.world;
    final records = {
      for (final league in state.leagueRecords.entries)
        league.key: Map<String, ClubSeasonRecord>.from(league.value),
    };
    final playerLeagueFixtures = List<Fixture>.from(
      state.playerLeagueFixtures,
    );
    final quality = {for (final club in world.clubs) club.id: club.quality};
    final opponent = opponentFor(snapshot, definition: world);

    for (final entry in state.leagueParticipants.entries) {
      final fixtures = _schedule(
        entry.key,
        entry.value,
      ).where((fixture) => fixture.matchweek == snapshot.week);
      for (final fixture in fixtures) {
        int homeGoals;
        int awayGoals;
        if (opponent.competitionKind == CompetitionKind.league &&
            (fixture.homeId == snapshot.clubId ||
                fixture.awayId == snapshot.clubId)) {
          homeGoals = playerHomeScore;
          awayGoals = playerAwayScore;
        } else {
          final score = _score(
            snapshot.seed,
            snapshot.season,
            snapshot.week,
            fixture.id,
            quality[fixture.homeId]!,
            quality[fixture.awayId]!,
          );
          homeGoals = score.$1;
          awayGoals = score.$2;
        }
        if (opponent.competitionKind == CompetitionKind.league &&
            entry.key == opponent.competitionId &&
            (fixture.homeId == snapshot.clubId ||
                fixture.awayId == snapshot.clubId)) {
          playerLeagueFixtures.add(fixture.withScore(homeGoals, awayGoals));
        }
        final table = records[entry.key]!;
        table[fixture.homeId] =
            table[fixture.homeId]!.record(homeGoals, awayGoals);
        table[fixture.awayId] =
            table[fixture.awayId]!.record(awayGoals, homeGoals);
      }
    }
    final competitions = state.competitions.isEmpty
        ? _newCompetitions(state, world, snapshot.season)
        : state.competitions;
    final advancedCompetitions = <String, CompetitionProgress>{};
    for (final entry in competitions.entries) {
      advancedCompetitions[entry.key] = _isExpandedWorld(world) &&
              entry.value.kind == CompetitionKind.nationalTournament
          ? entry.value
          : _advanceCompetition(
              entry.value,
              snapshot: snapshot,
              activeCompetitionId: opponent.competitionId,
              playerHomeScore: playerHomeScore,
              playerAwayScore: playerAwayScore,
              world: world,
            );
    }
    return state.copyWith(
      leagueRecords: records,
      playerLeagueFixtures: List.unmodifiable(playerLeagueFixtures),
      competitions: Map.unmodifiable(advancedCompetitions),
    );
  }

  CareerWorldState advanceNationalTournamentMatch({
    required CareerSnapshot snapshot,
    required int playerHomeScore,
    required int playerAwayScore,
    WorldDefinition? definition,
  }) {
    final world = definition ?? buildLaunchWorld();
    const competitionId = 'world-nations-championship';
    final current = snapshot.world.competitions[competitionId];
    if (current == null || current.isComplete) return snapshot.world;
    final matchday = snapshot.nationalTeam.tournamentMatchday;
    final tournamentSnapshot = snapshot.copyWith(week: matchday);
    final advanced = _advanceCompetition(
      current,
      snapshot: tournamentSnapshot,
      activeCompetitionId: competitionId,
      playerHomeScore: playerHomeScore,
      playerAwayScore: playerAwayScore,
      world: world,
    );
    var next = snapshot.world.copyWith(
      competitions: Map.unmodifiable({
        ...snapshot.world.competitions,
        competitionId: advanced,
      }),
    );
    final playerTeamId = snapshot.player.nationalTeamId;
    final hasFuturePlayerFixture = advanced.fixtures.any(
      (fixture) =>
          !fixture.isPlayed &&
          (fixture.homeId == playerTeamId || fixture.awayId == playerTeamId),
    );
    if (advanced.isComplete || !hasFuturePlayerFixture) {
      next = completeNationalTournament(
        snapshot: snapshot.copyWith(world: next),
        definition: world,
      );
    }
    return next;
  }

  CareerWorldState completeNationalTournament({
    required CareerSnapshot snapshot,
    WorldDefinition? definition,
    String? playerFinishOverride,
  }) {
    final world = definition ?? buildLaunchWorld();
    const competitionId = 'world-nations-championship';
    var progress = snapshot.world.competitions[competitionId];
    if (progress == null) return snapshot.world;
    for (var matchday = 1; matchday <= 7 && !progress!.isComplete; matchday++) {
      if (!progress.fixtures.any(
        (fixture) => fixture.matchweek == matchday && !fixture.isPlayed,
      )) {
        continue;
      }
      progress = _advanceCompetition(
        progress,
        snapshot: snapshot.copyWith(week: matchday),
        activeCompetitionId: null,
        playerHomeScore: 0,
        playerAwayScore: 0,
        world: world,
      );
    }
    final winner = progress!.winnerId;
    if (winner == null) {
      throw StateError('The World Nations Championship did not finish.');
    }
    final history = snapshot.world.nationalTournamentHistory
        .where((entry) => entry.season != snapshot.season)
        .toList(growable: true)
      ..add(
        NationalTournamentHistoryEntry(
          season: snapshot.season,
          winnerId: winner,
          playerTeamId: snapshot.player.nationalTeamId,
          playerFinish: playerFinishOverride ??
              _nationalFinish(progress, snapshot.player.nationalTeamId),
          playerAppearances: snapshot.nationalTeam.cycleAppearances,
        ),
      );
    return snapshot.world.copyWith(
      nationalTournamentWinner: winner,
      nationalTournamentHistory: List.unmodifiable(history),
      competitions: Map.unmodifiable({
        ...snapshot.world.competitions,
        competitionId: progress,
      }),
    );
  }

  String _nationalFinish(CompetitionProgress progress, String teamId) {
    if (!progress.participantIds.contains(teamId)) return 'didNotQualify';
    if (progress.winnerId == teamId) return 'champion';
    final played = progress.fixtures
        .where(
          (fixture) =>
              fixture.isPlayed &&
              (fixture.homeId == teamId || fixture.awayId == teamId),
        )
        .toList(growable: false);
    final last = played.fold<int>(
        0,
        (value, fixture) =>
            fixture.matchweek > value ? fixture.matchweek : value);
    return switch (last) {
      7 => 'runnerUp',
      6 => 'semifinal',
      5 => 'quarterfinal',
      4 => 'roundOf16',
      _ => 'groupStage',
    };
  }

  CareerWorldState beginNextSeason(
    CareerWorldState state,
    int seed, {
    WorldDefinition? definition,
  }) {
    final world = definition ?? buildLaunchWorld();
    final participants = {
      for (final entry in state.leagueParticipants.entries)
        entry.key: List<String>.from(entry.value),
    };

    for (final country
        in world.countries.where((country) => country.hasLeague)) {
      final nationLeagues = world.leagues.where(
        (league) => league.countryId == country.id,
      );
      final firstId = nationLeagues
          .firstWhere((league) => league.division == DivisionLevel.first)
          .id;
      final secondId = nationLeagues
          .firstWhere((league) => league.division == DivisionLevel.second)
          .id;
      final movement = promotionAndRelegation(
        firstDivision: state.table(firstId),
        secondDivision: state.table(secondId),
      );
      participants[firstId] = [
        ...participants[firstId]!
            .where((id) => !movement.relegated.contains(id)),
        ...movement.promoted,
      ];
      participants[secondId] = [
        ...participants[secondId]!
            .where((id) => !movement.promoted.contains(id)),
        ...movement.relegated,
      ];
    }

    final completed = state.competitions;
    final cupWinners = <String, String>{
      for (final cup in world.domesticCups)
        if (completed[cup.id]?.winnerId != null)
          cup.id: completed[cup.id]!.winnerId!,
    };
    final internationalWinner =
        completed[world.internationalClubCompetition.id]?.winnerId;
    final nationalWinner = completed[_isExpandedWorld(world)
            ? 'world-nations-championship'
            : 'major-national-tournament']
        ?.winnerId;
    final nextSeason = state.season + 1;
    final qualificationResult =
        _isExpandedWorld(world) && isMajorNationalTournamentSeason(nextSeason)
            ? simulateNationalQualification(world, nextSeason)
            : null;
    final qualification = qualificationResult == null
        ? state.nationalQualification
        : NationalQualificationState(
            cycleSeason: nextSeason,
            tables: qualificationResult.tables,
            fixtures: qualificationResult.fixtures,
            qualifiedTeamIds: qualificationResult.qualifiedTeamIds,
          );
    return CareerWorldState(
      season: nextSeason,
      leagueParticipants: {
        for (final entry in participants.entries)
          entry.key: List<String>.unmodifiable(entry.value),
      },
      leagueRecords: {
        for (final entry in participants.entries)
          entry.key: {
            for (final clubId in entry.value) clubId: const ClubSeasonRecord(),
          },
      },
      domesticCupWinners: Map.unmodifiable(cupWinners),
      internationalClubWinner: internationalWinner,
      nationalTournamentWinner: nationalWinner,
      nationalQualification: qualification,
      nationalTournamentHistory: state.nationalTournamentHistory,
      competitions: _newCompetitions(
        state,
        world,
        nextSeason,
        leagueParticipants: participants,
        nationalParticipantIds: qualificationResult?.qualifiedTeamIds,
      ),
    );
  }

  Map<String, CompetitionProgress> _newCompetitions(
    CareerWorldState state,
    WorldDefinition world,
    int season, {
    Map<String, List<String>>? leagueParticipants,
    List<String>? nationalParticipantIds,
  }) {
    final competitions = <String, CompetitionProgress>{};
    for (final cup in world.domesticCups) {
      competitions[cup.id] = CompetitionProgress(
        id: cup.id,
        kind: CompetitionKind.domesticCup,
        participantIds: cup.participantIds,
        fixtures: buildCupOpeningRound(cup.id, cup.participantIds),
      );
    }
    final internationalIds = <String>[];
    final expandedWorld = _isExpandedWorld(world);
    final rankedCountries =
        world.countries.where((country) => country.hasLeague).toList()
          ..sort(
            (left, right) =>
                (left.leagueRank ?? 40).compareTo(right.leagueRank ?? 40),
          );
    for (final country in rankedCountries) {
      final league = world.leagues.firstWhere(
        (item) =>
            item.countryId == country.id &&
            item.division == DivisionLevel.first,
      );
      if (state.leagueRecords[league.id]?.values.any(
            (record) => record.played > 0,
          ) ??
          false) {
        final table = state.table(league.id);
        internationalIds.add(table.first.clubId);
        if (!expandedWorld || (country.leagueRank ?? 99) <= 6) {
          internationalIds.add(table[1].clubId);
        }
      } else {
        final participants = leagueParticipants?[league.id] ?? league.clubIds;
        internationalIds.add(participants.first);
        if (!expandedWorld || (country.leagueRank ?? 99) <= 6) {
          internationalIds.add(participants[1]);
        }
      }
    }
    competitions[world.internationalClubCompetition.id] = CompetitionProgress(
      id: world.internationalClubCompetition.id,
      kind: CompetitionKind.internationalClub,
      participantIds: List.unmodifiable(internationalIds),
      fixtures: expandedWorld
          ? buildInternationalGroupSchedule(internationalIds)
          : buildLegacyInternationalGroupSchedule(internationalIds),
    );
    if (isMajorNationalTournamentSeason(season)) {
      final ids = expandedWorld
          ? nationalParticipantIds ?? qualifyingNationalTeams(world, season)
          : world.nationalTeams.map((team) => team.id).toList(growable: false);
      final competitionId = expandedWorld
          ? 'world-nations-championship'
          : 'major-national-tournament';
      competitions[competitionId] = CompetitionProgress(
        id: competitionId,
        kind: CompetitionKind.nationalTournament,
        participantIds: List.unmodifiable(ids),
        fixtures: expandedWorld
            ? buildNationalGroupSchedule(ids)
            : buildLegacyNationalGroupSchedule(ids),
      );
    }
    return Map.unmodifiable(competitions);
  }

  CompetitionProgress _advanceCompetition(
    CompetitionProgress progress, {
    required CareerSnapshot snapshot,
    required String? activeCompetitionId,
    required int playerHomeScore,
    required int playerAwayScore,
    required WorldDefinition world,
  }) {
    if (progress.isComplete) return progress;
    final current = progress.fixtures.where(
      (fixture) => fixture.matchweek == snapshot.week && !fixture.isPlayed,
    );
    if (current.isEmpty) return progress;
    final qualities = <String, int>{
      for (final club in world.clubs) club.id: club.quality,
      for (final team in world.nationalTeams) team.id: team.quality,
    };
    final playerId = progress.kind == CompetitionKind.nationalTournament
        ? snapshot.player.nationalTeamId
        : snapshot.clubId;
    final scored = progress.fixtures.map((fixture) {
      if (fixture.matchweek != snapshot.week || fixture.isPlayed) {
        return fixture;
      }
      final isPlayerFixture = activeCompetitionId == progress.id &&
          (fixture.homeId == playerId || fixture.awayId == playerId);
      final result = isPlayerFixture
          ? (playerHomeScore, playerAwayScore)
          : _score(
              snapshot.seed,
              snapshot.season,
              snapshot.week,
              fixture.id,
              qualities[fixture.homeId] ?? 65,
              qualities[fixture.awayId] ?? 65,
            );
      var home = result.$1;
      var away = result.$2;
      var decision = FixtureDecision.regulation;
      final knockout =
          progress.kind == CompetitionKind.domesticCup || progress.stage > 0;
      if (knockout && home == away) {
        decision = ((snapshot.seed ^ _stableHash(fixture.id)) & 2) == 0
            ? FixtureDecision.extraTime
            : FixtureDecision.penalties;
        if (((snapshot.seed ^ _stableHash(fixture.id)) & 1) == 0) {
          home += 1;
        } else {
          away += 1;
        }
      }
      return fixture.withScore(home, away, decision: decision);
    }).toList(growable: true);

    if (!_stageFinished(progress, snapshot.week)) {
      return progress.copyWith(fixtures: List.unmodifiable(scored));
    }
    final next = _nextStage(
      progress,
      scored,
      snapshot.week,
    );
    return next;
  }

  bool _stageFinished(CompetitionProgress progress, int week) =>
      switch (progress.kind) {
        CompetitionKind.domesticCup => true,
        CompetitionKind.internationalClub =>
          progress.stage == 0 ? week == 11 : true,
        CompetitionKind.nationalTournament => progress.stage == 0
            ? week == (progress.participantIds.length == 24 ? 9 : 3)
            : true,
        CompetitionKind.nationalQualifier => true,
        CompetitionKind.league => false,
      };

  CompetitionProgress _nextStage(
    CompetitionProgress progress,
    List<Fixture> fixtures,
    int week,
  ) {
    List<String> entrants;
    if (progress.stage == 0 && progress.kind == CompetitionKind.domesticCup) {
      entrants = [
        ...progress.participantIds.take(12),
        ..._winners(fixtures.where((fixture) => fixture.matchweek == week)),
      ];
    } else if (progress.stage == 0 &&
        progress.kind != CompetitionKind.domesticCup) {
      final groupCount = progress.participantIds.length ~/ 4;
      entrants = _groupQualifiers(progress, fixtures, groupCount);
    } else {
      entrants = _winners(
        fixtures.where((fixture) => fixture.matchweek == week),
      );
    }
    if (entrants.length == 1) {
      return progress.copyWith(
        fixtures: List.unmodifiable(fixtures),
        stage: progress.stage + 1,
        winnerId: entrants.single,
      );
    }
    final nextWeek = switch (progress.kind) {
      CompetitionKind.domesticCup => const [6, 10, 14, 18][progress.stage],
      CompetitionKind.internationalClub => progress.participantIds.length == 12
          ? const [13, 15, 17][progress.stage]
          : const [12, 14, 16, 18][progress.stage],
      CompetitionKind.nationalTournament => progress.participantIds.length == 24
          ? const [12, 14, 16, 18][progress.stage]
          : const [4, 5, 6, 7][progress.stage],
      CompetitionKind.nationalQualifier =>
        throw StateError('Qualifiers are simulated before the tournament.'),
      CompetitionKind.league => throw StateError('League is not a knockout.'),
    };
    final round = progress.stage + 1;
    final nextFixtures = <Fixture>[];
    for (var index = 0; index < entrants.length; index += 2) {
      nextFixtures.add(
        Fixture(
          id: '${progress.id}-r$round-m${index ~/ 2 + 1}',
          competitionId: progress.id,
          matchweek: nextWeek,
          homeId: entrants[index],
          awayId: entrants[index + 1],
        ),
      );
    }
    return progress.copyWith(
      fixtures: List.unmodifiable([...fixtures, ...nextFixtures]),
      stage: round,
    );
  }

  List<String> _groupQualifiers(
    CompetitionProgress progress,
    List<Fixture> fixtures,
    int groupCount,
  ) {
    final automatic = <String>[];
    final thirds = <StandingRow>[];
    for (var group = 0; group < groupCount; group++) {
      final ids = progress.participantIds.sublist(group * 4, group * 4 + 4);
      final table = tableFromFixtures(
        ids,
        fixtures.where(
          (fixture) =>
              ids.contains(fixture.homeId) && ids.contains(fixture.awayId),
        ),
      );
      automatic.addAll(table.take(2).map((row) => row.clubId));
      thirds.add(table[2]);
    }
    final target = progress.participantIds.length == 12
        ? 8
        : progress.participantIds.length == 24
            ? 16
            : automatic.length;
    thirds.sort((left, right) {
      final points = right.points.compareTo(left.points);
      if (points != 0) return points;
      final difference = right.goalDifference.compareTo(left.goalDifference);
      if (difference != 0) return difference;
      final goals = right.goalsFor.compareTo(left.goalsFor);
      return goals != 0 ? goals : left.clubId.compareTo(right.clubId);
    });
    return [
      ...automatic,
      ...thirds.take(target - automatic.length).map((row) => row.clubId),
    ];
  }

  List<String> _winners(Iterable<Fixture> fixtures) => fixtures
      .map(
        (fixture) => fixture.homeGoals! > fixture.awayGoals!
            ? fixture.homeId
            : fixture.awayId,
      )
      .toList(growable: false);

  (int, int) _score(
    int seed,
    int season,
    int week,
    String fixtureId,
    int homeQuality,
    int awayQuality,
  ) {
    var state = (seed ^ season * 1009 ^ week * 9176 ^ _stableHash(fixtureId)) &
        0x7fffffff;
    int next(int max) {
      state = (1103515245 * state + 12345) & 0x7fffffff;
      return ((state / 0x80000000) * max).floor();
    }

    final homeAdvantage = 4;
    final homeGoals =
        (next(3) + ((homeQuality + homeAdvantage - awayQuality) / 12).round())
            .clamp(0, 5);
    final awayGoals =
        (next(3) + ((awayQuality - homeQuality) / 12).round()).clamp(0, 5);
    return (homeGoals, awayGoals);
  }

  int _stableHash(String value) {
    var hash = 0x811c9dc5;
    for (final unit in value.codeUnits) {
      hash ^= unit;
      hash = (hash * 0x01000193) & 0x7fffffff;
    }
    return hash;
  }

  bool _isExpandedWorld(WorldDefinition world) =>
      world.countries.where((country) => country.hasLeague).length == 26;
}
