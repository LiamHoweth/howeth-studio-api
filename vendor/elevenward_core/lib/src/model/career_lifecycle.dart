import 'career_snapshot.dart';
import 'career_types.dart';
import 'enums.dart';

bool canChooseRetirement(CareerSnapshot snapshot) =>
    !snapshot.retired &&
    snapshot.phase == CareerPhase.offseason &&
    (snapshot.player.age >= 32 || snapshot.season >= 16);

bool mustRetire(CareerSnapshot snapshot) =>
    !snapshot.retired &&
    snapshot.phase == CareerPhase.offseason &&
    (snapshot.season >= 20 || snapshot.player.age > 36);

Map<String, num> legacyScoreContributions(CareerSnapshot snapshot) {
  final player = snapshot.player;
  final trophies = snapshot.seasonHistory
      .fold<int>(0, (sum, season) => sum + season.trophies.length);
  final averageRating = snapshot.seasonHistory.isEmpty
      ? 0.0
      : snapshot.seasonHistory
              .fold<double>(0, (sum, season) => sum + season.averageRating) /
          snapshot.seasonHistory.length;
  final role = snapshot.roleStats;
  final weights = snapshot.usesModernCareerRules
      ? switch (player.position) {
          PositionFamily.striker => (12, 8, role.playerOfMatchAwards * 15),
          PositionFamily.winger => (
              8,
              12,
              role.successfulDribbles * .4 +
                  role.chancesCreated * .5 +
                  role.playerOfMatchAwards * 15
            ),
          PositionFamily.midfielder => (
              5,
              12,
              role.keyPasses * .5 +
                  role.chancesCreated * .75 +
                  role.playerOfMatchAwards * 15
            ),
          PositionFamily.defender => (
              5,
              6,
              role.tackles * .25 +
                  role.interceptions * .5 +
                  role.cleanSheets * 4 +
                  role.playerOfMatchAwards * 15
            ),
        }
      : (12, 8, 0);
  return {
    'appearances': player.appearances * 4,
    'goals': player.goals * weights.$1,
    'assists': player.assists * weights.$2,
    'trophies': trophies * 180,
    'reputation': player.reputation * 9,
    'overall': player.overall * 5,
    'averageRating': averageRating * 75,
    'roleContributions': weights.$3
  };
}

LegacyVerdict calculateLegacyVerdict(CareerSnapshot snapshot) {
  final player = snapshot.player;
  final trophies = snapshot.seasonHistory
      .fold<int>(0, (sum, season) => sum + season.trophies.length);
  final score = legacyScoreContributions(snapshot)
      .values
      .fold<num>(0, (sum, value) => sum + value)
      .round();
  final tier = score >= 6000
      ? LegacyTier.immortal
      : score >= 4200
          ? LegacyTier.worldGreat
          : score >= 2600
              ? LegacyTier.nationalStar
              : score >= 1400
                  ? LegacyTier.clubIcon
                  : LegacyTier.localFavorite;
  final headline = switch (tier) {
    LegacyTier.localFavorite => 'A career the local support will remember.',
    LegacyTier.clubIcon => 'Your name belongs to the club now.',
    LegacyTier.nationalStar => 'You changed how a country saw the game.',
    LegacyTier.worldGreat => 'An era of football carries your signature.',
    LegacyTier.immortal => 'The game will keep telling your story.',
  };
  return LegacyVerdict(
    score: score,
    tier: tier,
    headline: headline,
    reasons: [
      '${player.appearances} senior appearances',
      '${player.goals} goals and ${player.assists} assists',
      '$trophies major trophies',
      if (snapshot.usesModernCareerRules)
        snapshot.roleStats.summary(player.position),
      '${player.reputation}/100 reputation',
    ],
  );
}

CareerSnapshot retireCareer(CareerSnapshot snapshot, DateTime updatedAt) {
  if (!canChooseRetirement(snapshot) && !mustRetire(snapshot)) {
    throw StateError('Retirement is not available yet.');
  }
  final verdict = calculateLegacyVerdict(snapshot);
  return snapshot.copyWith(
    revision: snapshot.revision + 1,
    updatedAt: updatedAt,
    phase: CareerPhase.retired,
    retired: true,
    legacyScore: verdict.score,
  );
}

String explainRejectedTransfer({
  required int clubQuality,
  required int playerOverall,
  required int reputation,
  required int tacticalFit,
}) {
  final gaps = <(int, String)>[
    (
      clubQuality - playerOverall,
      'Your current level is below the club’s target.'
    ),
    (55 - reputation, 'The club wants a more established profile.'),
    (60 - tacticalFit, 'The manager sees a weak tactical fit.'),
  ]..sort((left, right) => right.$1.compareTo(left.$1));
  return gaps.first.$1 > 0
      ? gaps.first.$2
      : 'The club filled the available squad role before talks concluded.';
}
