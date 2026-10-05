import '../world/world_models.dart';
import 'career_snapshot.dart';
import 'career_types.dart';
import 'enums.dart';

final class WeeklyChoice {
  const WeeklyChoice({
    required this.focus,
    required this.intensity,
    required this.spotlightApproach,
  });

  factory WeeklyChoice.fromJson(Map<String, Object?> json) => WeeklyChoice(
      focus: PlayerAttribute.values.byName(json['focus'] as String),
      intensity: TrainingIntensity.values.byName(json['intensity'] as String),
      spotlightApproach:
          SpotlightApproach.values.byName(json['spotlightApproach'] as String));
  Map<String, Object?> toJson() => {
        'focus': focus.name,
        'intensity': intensity.name,
        'spotlightApproach': spotlightApproach.name
      };

  final PlayerAttribute focus;
  final TrainingIntensity intensity;
  final SpotlightApproach spotlightApproach;
}

final class OpponentContext {
  const OpponentContext({
    required this.clubId,
    required this.clubName,
    required this.quality,
    required this.tacticalFit,
    required this.isHome,
    this.competitionId,
    this.competitionKind = CompetitionKind.league,
  });

  final String clubId;
  final String clubName;
  final int quality;
  final int tacticalFit;
  final bool isHome;
  final String? competitionId;
  final CompetitionKind competitionKind;
}

final class OutcomeFactor {
  const OutcomeFactor({
    required this.label,
    required this.detail,
    required this.impact,
  });

  final String label;
  final String detail;
  final double impact;
}

final class SpotlightPreview {
  const SpotlightPreview({
    required this.approach,
    required this.chance,
    required this.chanceLow,
    required this.chanceHigh,
    required this.primaryAttributes,
    required this.factors,
  });

  final SpotlightApproach approach;
  final double chance;
  final int chanceLow;
  final int chanceHigh;
  final List<PlayerAttribute> primaryAttributes;
  final List<OutcomeFactor> factors;
}

final class SelectionExplanation {
  const SelectionExplanation({
    required this.status,
    required this.score,
    required this.reasons,
  });

  final SelectionStatus status;
  final double score;
  final List<OutcomeFactor> reasons;
}

/// Exact training-only changes before match fatigue and other weekly effects.
final class TrainingPreview {
  const TrainingPreview(
      {required this.attributeBefore,
      required this.attributeAfter,
      required this.fitnessBefore,
      required this.fitnessAfter,
      required this.remainder,
      required this.multiplier,
      required this.paused});
  final int attributeBefore;
  final int attributeAfter;
  final int fitnessBefore;
  final int fitnessAfter;
  final double remainder;
  final double multiplier;
  final bool paused;
  int get gain => attributeAfter - attributeBefore;
  int get fitnessChange => fitnessAfter - fitnessBefore;
}

final class StatDeltas {
  const StatDeltas({
    required this.rating,
    required this.trust,
    required this.reputation,
    required this.money,
    required this.fitness,
    required this.form,
    required this.goals,
    required this.assists,
  });

  final double rating;
  final int trust;
  final int reputation;
  final int money;
  final int fitness;
  final int form;
  final int goals;
  final int assists;
}

/// Match-level evidence used by reports, news, and future tactical systems.
final class MatchMetrics {
  const MatchMetrics({
    required this.possession,
    required this.shots,
    required this.shotsOnTarget,
    required this.expectedGoals,
    required this.opponentExpectedGoals,
    required this.bigChances,
    required this.momentumSwings,
    required this.lateDrama,
    required this.comeback,
  });

  final int possession;
  final int shots;
  final int shotsOnTarget;
  final double expectedGoals;
  final double opponentExpectedGoals;
  final int bigChances;
  final int momentumSwings;
  final bool lateDrama;
  final bool comeback;
}

final class WeeklyResult {
  const WeeklyResult({
    required this.snapshot,
    required this.opponent,
    required this.selection,
    required this.preview,
    required this.spotlightSucceeded,
    required this.roll,
    required this.teamResult,
    required this.homeScore,
    required this.awayScore,
    required this.deltas,
    required this.factors,
    required this.headline,
    required this.matchReport,
    required this.metrics,
    required this.newsStories,
    required this.offPitchTitle,
    required this.offPitchBody,
    required this.sponsorPayout,
    required this.endedSponsorIds,
    required this.fixtureDecision,
    required this.trainedAttribute,
    required this.developmentGain,
    required this.developmentRemainder,
    required this.developmentMultiplier,
    required this.moneyMultiplier,
    required this.agentFee,
    required this.agentReleased,
  });

  final CareerSnapshot snapshot;
  final OpponentContext opponent;
  final SelectionExplanation selection;
  final SpotlightPreview preview;
  final bool spotlightSucceeded;
  final double roll;
  final TeamResult teamResult;
  final int homeScore;
  final int awayScore;
  final StatDeltas deltas;
  final List<OutcomeFactor> factors;
  final String headline;
  final String matchReport;
  final MatchMetrics metrics;
  final List<CareerNewsItem> newsStories;
  final String offPitchTitle;
  final String offPitchBody;
  final int sponsorPayout;
  final List<String> endedSponsorIds;
  final FixtureDecision fixtureDecision;
  final PlayerAttribute trainedAttribute;
  final int developmentGain;
  final double developmentRemainder;
  final double developmentMultiplier;
  final double moneyMultiplier;
  final int agentFee;
  final bool agentReleased;
}
