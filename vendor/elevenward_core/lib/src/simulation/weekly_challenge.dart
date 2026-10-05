import '../content/content_catalog.dart';
import '../model/career_snapshot.dart';
import '../model/enums.dart';
import '../model/player_state.dart';
import '../model/reward_modifiers.dart';
import '../model/weekly_models.dart';
import 'weekly_simulator.dart';
import 'world_simulator.dart';

/// A public seed and exactly eight ordinary engine matches. Career upgrades,
/// lifestyle, purchases and story rewards cannot enter this isolated mode.
final class WeeklyChallenge {
  const WeeklyChallenge();
  static const matchCount = 8;
  static const rulesVersion = '2026.5';
  static const contentVersion = '2026.4.0';
  CareerSnapshot start(
      {required int seed,
      required String careerId,
      required DateTime updatedAt}) {
    final catalog = buildLatestContent();
    return CareerSnapshot.newCareer(
        careerId: careerId,
        seed: seed,
        updatedAt: updatedAt.toUtc(),
        clubId: 'england-northstar-athletic',
        clubName: 'Northstar Athletic',
        contentVersion: contentVersion,
        worldDefinition: catalog.world,
        player: PlayerState.newCareer(
            id: 'challenge-player',
            name: 'Challenge player',
            archetype: Archetype.poacher));
  }

  WeeklyChallengeReplay replay(
      {required int seed,
      required List<WeeklyChoice> choices,
      String careerId = 'weekly-challenge',
      DateTime? updatedAt}) {
    if (choices.length > matchCount)
      throw ArgumentError('A challenge contains exactly eight matches.');
    final startedAt = (updatedAt ?? DateTime.utc(2026, 10, 1)).toUtc();
    var snapshot = start(seed: seed, careerId: careerId, updatedAt: startedAt);
    final world = buildLatestContent().world;
    final results = <WeeklyResult>[];
    for (var index = 0; index < choices.length; index++) {
      final result = const WeeklySimulator().advance(
          snapshot: snapshot,
          choice: choices[index],
          opponent:
              const WorldSimulator().opponentFor(snapshot, definition: world),
          updatedAt: startedAt.add(Duration(minutes: index + 1)),
          definition: world,
          modifiers: RewardModifiers.standard);
      results.add(result);
      snapshot = result.snapshot;
    }
    return WeeklyChallengeReplay(
        snapshot: snapshot,
        results: List.unmodifiable(results),
        score: snapshot.points * 100 +
            results.fold<int>(
                0, (sum, result) => sum + (result.deltas.rating * 10).round()) +
            snapshot.player.goals * 15 +
            snapshot.player.assists * 10);
  }
}

final class WeeklyChallengeReplay {
  const WeeklyChallengeReplay(
      {required this.snapshot, required this.results, required this.score});
  final CareerSnapshot snapshot;
  final List<WeeklyResult> results;
  final int score;
  int get matchesPlayed => results.length;
  bool get complete => matchesPlayed == WeeklyChallenge.matchCount;
}
