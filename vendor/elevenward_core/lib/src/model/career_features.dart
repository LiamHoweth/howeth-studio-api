import 'career_snapshot.dart';
import 'career_types.dart';
import 'enums.dart';

/// Contributions are derived from the committed match, never a second roll.
final class RoleStats {
  const RoleStats(
      {this.keyPasses = 0,
      this.chancesCreated = 0,
      this.successfulDribbles = 0,
      this.tackles = 0,
      this.interceptions = 0,
      this.cleanSheets = 0,
      this.playerOfMatchAwards = 0});
  factory RoleStats.fromJson(Map<String, Object?> json) => RoleStats(
      keyPasses: json['keyPasses'] as int? ?? 0,
      chancesCreated: json['chancesCreated'] as int? ?? 0,
      successfulDribbles: json['successfulDribbles'] as int? ?? 0,
      tackles: json['tackles'] as int? ?? 0,
      interceptions: json['interceptions'] as int? ?? 0,
      cleanSheets: json['cleanSheets'] as int? ?? 0,
      playerOfMatchAwards: json['playerOfMatchAwards'] as int? ?? 0);
  final int keyPasses,
      chancesCreated,
      successfulDribbles,
      tackles,
      interceptions,
      cleanSheets,
      playerOfMatchAwards;
  RoleStats add(RoleStats other) => RoleStats(
      keyPasses: keyPasses + other.keyPasses,
      chancesCreated: chancesCreated + other.chancesCreated,
      successfulDribbles: successfulDribbles + other.successfulDribbles,
      tackles: tackles + other.tackles,
      interceptions: interceptions + other.interceptions,
      cleanSheets: cleanSheets + other.cleanSheets,
      playerOfMatchAwards: playerOfMatchAwards + other.playerOfMatchAwards);
  Map<String, Object?> toJson() => {
        'keyPasses': keyPasses,
        'chancesCreated': chancesCreated,
        'successfulDribbles': successfulDribbles,
        'tackles': tackles,
        'interceptions': interceptions,
        'cleanSheets': cleanSheets,
        'playerOfMatchAwards': playerOfMatchAwards
      };
  String summary(PositionFamily position) => switch (position) {
        PositionFamily.striker =>
          '$playerOfMatchAwards player of the match awards',
        PositionFamily.winger =>
          '$successfulDribbles successful dribbles · $chancesCreated chances created',
        PositionFamily.midfielder =>
          '$keyPasses key passes · $chancesCreated chances created',
        PositionFamily.defender =>
          '$tackles tackles · $interceptions interceptions · $cleanSheets clean sheets',
      };
}

final class MatchJournalEntry {
  const MatchJournalEntry(
      {required this.id,
      required this.season,
      required this.week,
      required this.clubName,
      required this.opponentName,
      required this.isHome,
      required this.homeScore,
      required this.awayScore,
      required this.rating,
      required this.goals,
      required this.assists,
      required this.appeared,
      required this.headline,
      required this.report,
      required this.roleStats,
      this.competitionId,
      this.metrics = const {}});
  factory MatchJournalEntry.fromJson(Map<String, Object?> json) =>
      MatchJournalEntry(
          id: json['id'] as String,
          season: json['season'] as int,
          week: json['week'] as int,
          clubName: json['clubName'] as String,
          opponentName: json['opponentName'] as String,
          isHome: json['isHome'] as bool,
          homeScore: json['homeScore'] as int,
          awayScore: json['awayScore'] as int,
          rating: (json['rating'] as num).toDouble(),
          goals: json['goals'] as int,
          assists: json['assists'] as int,
          appeared: json['appeared'] as bool,
          headline: json['headline'] as String,
          report: json['report'] as String,
          competitionId: json['competitionId'] as String?,
          roleStats: RoleStats.fromJson(
              (json['roleStats'] as Map).cast<String, Object?>()),
          metrics: (json['metrics'] as Map? ?? {}).cast<String, Object?>());
  final String id, clubName, opponentName, headline, report;
  final String? competitionId;
  final int season, week, homeScore, awayScore, goals, assists;
  final double rating;
  final bool isHome, appeared;
  final RoleStats roleStats;
  final Map<String, Object?> metrics;
  Map<String, Object?> toJson() => {
        'id': id,
        'season': season,
        'week': week,
        'clubName': clubName,
        'opponentName': opponentName,
        'isHome': isHome,
        'homeScore': homeScore,
        'awayScore': awayScore,
        'rating': rating,
        'goals': goals,
        'assists': assists,
        'appeared': appeared,
        'headline': headline,
        'report': report,
        'competitionId': competitionId,
        'roleStats': roleStats.toJson(),
        'metrics': metrics
      };
}

final class DecisionJournalEntry {
  const DecisionJournalEntry(
      {required this.eventId,
      required this.choiceId,
      required this.season,
      required this.week,
      required this.title,
      required this.choiceLabel,
      required this.outcome,
      this.effects = const {}});
  factory DecisionJournalEntry.fromJson(Map<String, Object?> json) =>
      DecisionJournalEntry(
          eventId: json['eventId'] as String,
          choiceId: json['choiceId'] as String,
          season: json['season'] as int,
          week: json['week'] as int,
          title: json['title'] as String,
          choiceLabel: json['choiceLabel'] as String,
          outcome: json['outcome'] as String,
          effects: (json['effects'] as Map? ?? {})
              .map((key, value) => MapEntry(key as String, value as num)));
  final String eventId, choiceId, title, choiceLabel, outcome;
  final Map<String, num> effects;
  final int season, week;
  Map<String, Object?> toJson() => {
        'eventId': eventId,
        'choiceId': choiceId,
        'season': season,
        'week': week,
        'title': title,
        'choiceLabel': choiceLabel,
        'outcome': outcome,
        'effects': effects,
      };
}

enum CareerGoalKind {
  appearances,
  goals,
  assists,
  cleanSheets,
  nationalSelection,
  trophy,
  promotion
}

final class CareerGoal {
  const CareerGoal(
      {required this.kind,
      required this.target,
      required this.startValue,
      required this.chosenSeason,
      this.completedSeason});
  factory CareerGoal.fromJson(Map<String, Object?> json) => CareerGoal(
      kind: CareerGoalKind.values.byName(json['kind'] as String),
      target: json['target'] as int,
      startValue: json['startValue'] as int,
      chosenSeason: json['chosenSeason'] as int,
      completedSeason: json['completedSeason'] as int?);
  final CareerGoalKind kind;
  final int target, startValue, chosenSeason;
  final int? completedSeason;
  bool get completed => completedSeason != null;
  String get label => switch (kind) {
        CareerGoalKind.appearances => 'Make $target more appearances',
        CareerGoalKind.goals => 'Score $target more goals',
        CareerGoalKind.assists => 'Provide $target more assists',
        CareerGoalKind.cleanSheets => 'Keep $target more clean sheets',
        CareerGoalKind.nationalSelection => 'Earn national selection',
        CareerGoalKind.trophy => 'Win a major trophy',
        CareerGoalKind.promotion => 'Earn promotion',
      };
  int progress(CareerSnapshot snapshot) =>
      (careerGoalValue(snapshot, kind) - startValue).clamp(0, target);
  CareerGoal markComplete(int season) => CareerGoal(
      kind: kind,
      target: target,
      startValue: startValue,
      chosenSeason: chosenSeason,
      completedSeason: season);
  Map<String, Object?> toJson() => {
        'kind': kind.name,
        'target': target,
        'startValue': startValue,
        'chosenSeason': chosenSeason,
        'completedSeason': completedSeason
      };
}

int careerGoalValue(CareerSnapshot snapshot, CareerGoalKind kind) =>
    switch (kind) {
      CareerGoalKind.appearances => snapshot.player.appearances,
      CareerGoalKind.goals => snapshot.player.goals,
      CareerGoalKind.assists => snapshot.player.assists,
      CareerGoalKind.cleanSheets => snapshot.roleStats.cleanSheets,
      CareerGoalKind.nationalSelection => snapshot.nationalTeam.caps > 0 ||
              snapshot.nationalTeam.decision == NationalTeamDecision.accepted
          ? 1
          : 0,
      CareerGoalKind.trophy => snapshot.seasonHistory
          .fold<int>(0, (sum, season) => sum + season.trophies.length),
      CareerGoalKind.promotion =>
        snapshot.storyFlags['career.promotions'] == null
            ? 0
            : int.parse(snapshot.storyFlags['career.promotions']!),
    };
CareerSnapshot updateCareerGoal(CareerSnapshot snapshot) {
  final goal = snapshot.careerGoal;
  if (goal == null || goal.completed || goal.progress(snapshot) < goal.target)
    return snapshot;
  return snapshot.copyWith(careerGoal: goal.markComplete(snapshot.season));
}

/// The parent owns the contract; the host pays all wages and appearance bonuses
/// during the single loan season. Return does not invent a renewal.
final class LoanState {
  const LoanState(
      {required this.parentClubId,
      required this.hostClubId,
      required this.parentContract,
      required this.returnSeason,
      this.hostWageSharePercent = 100});
  factory LoanState.fromJson(Map<String, Object?> json) => LoanState(
      parentClubId: json['parentClubId'] as String,
      hostClubId: json['hostClubId'] as String,
      parentContract: ContractState.fromJson(
          (json['parentContract'] as Map).cast<String, Object?>()),
      returnSeason: json['returnSeason'] as int,
      hostWageSharePercent: json['hostWageSharePercent'] as int? ?? 100);
  final String parentClubId, hostClubId;
  final ContractState parentContract;
  final int returnSeason, hostWageSharePercent;
  Map<String, Object?> toJson() => {
        'parentClubId': parentClubId,
        'hostClubId': hostClubId,
        'parentContract': parentContract.toJson(),
        'returnSeason': returnSeason,
        'hostWageSharePercent': hostWageSharePercent
      };
}

final class LoanOffer {
  const LoanOffer(
      {required this.clubId,
      required this.tacticalFit,
      required this.promisedRole,
      required this.reason});
  final String clubId, promisedRole, reason;
  final int tacticalFit;
}
