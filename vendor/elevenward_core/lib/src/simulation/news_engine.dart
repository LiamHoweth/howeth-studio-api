import '../model/career_snapshot.dart';
import '../model/career_types.dart';
import '../model/enums.dart';
import '../model/weekly_models.dart';

/// Converts simulation evidence into a compact, durable weekly news cycle.
final class NewsEngine {
  const NewsEngine();

  List<CareerNewsItem> generateMatchweek({
    required CareerSnapshot snapshot,
    required int season,
    required int week,
    required OpponentContext opponent,
    required TeamResult result,
    required int homeScore,
    required int awayScore,
    required double rating,
    required int playerGoals,
    required int playerAssists,
    required MatchMetrics metrics,
    required bool agentReleased,
  }) {
    final playerScore = opponent.isHome ? homeScore : awayScore;
    final rivalScore = opponent.isHome ? awayScore : homeScore;
    final standing = snapshot.world
        .table(snapshot.world.leagueIdForClub(snapshot.clubId))
        .indexWhere((row) => row.clubId == snapshot.clubId);
    final resultPhrase = switch (result) {
      TeamResult.win => 'win',
      TeamResult.draw => 'draw',
      TeamResult.loss => 'defeat',
    };
    final personalLine = playerGoals > 0
        ? '$playerGoals ${playerGoals == 1 ? 'goal' : 'goals'}'
        : playerAssists > 0
            ? '$playerAssists ${playerAssists == 1 ? 'assist' : 'assists'}'
            : 'a $rating match rating';
    final stories = <CareerNewsItem>[
      CareerNewsItem(
        id: 's$season-w$week-match',
        season: season,
        week: week,
        category: 'match',
        title: _pick(
          [
            '${snapshot.clubName} $resultPhrase keeps season moving',
            'Numbers behind the $playerScore–$rivalScore against ${opponent.clubName}',
            '${metrics.lateDrama ? 'Late drama' : 'Tactical battle'} shapes ${snapshot.clubName} result',
            '${snapshot.clubName} emerge from ${opponent.clubName} test',
          ],
          snapshot.seed,
          1,
        ),
        body:
            '${snapshot.clubName} recorded a $playerScore–$rivalScore $resultPhrase with ${metrics.possession}% possession and a ${metrics.expectedGoals.toStringAsFixed(1)}–${metrics.opponentExpectedGoals.toStringAsFixed(1)} xG balance.',
      ),
      CareerNewsItem(
        id: 's$season-w$week-player',
        season: season,
        week: week,
        category: 'player',
        title: _pick(
          [
            '${snapshot.player.name} draws attention after latest display',
            'Player focus: ${snapshot.player.name}',
            '${snapshot.player.name}\'s form enters the conversation',
            'Inside the performance: ${snapshot.player.name}',
          ],
          snapshot.seed,
          2,
        ),
        body:
            '${snapshot.player.name} contributed $personalLine. The performance leaves form at ${snapshot.player.form} and manager trust at ${snapshot.player.managerTrust}.',
      ),
      CareerNewsItem(
        id: 's$season-w$week-${agentReleased ? 'agent' : 'table'}',
        season: season,
        week: week,
        category: agentReleased ? 'business' : 'world',
        title: agentReleased
            ? '${snapshot.player.name} returns to self-representation'
            : '${snapshot.clubName} sit ${standing < 0 ? 'outside the table' : _ordinal(standing + 1)}',
        body: agentReleased
            ? 'The monthly representation fee could not be covered, ending the agreement before the next matchweek.'
            : 'After week $week, the table pressure is building and every result is changing the recruitment picture.',
      ),
    ];
    return List.unmodifiable(stories);
  }

  String _pick(List<String> values, int seed, int salt) =>
      values[((seed ^ (salt * 7919)) & 0x7fffffff) % values.length];

  String _ordinal(int value) {
    final tens = value % 100;
    if (tens >= 11 && tens <= 13) return '${value}th';
    return switch (value % 10) {
      1 => '${value}st',
      2 => '${value}nd',
      3 => '${value}rd',
      _ => '${value}th',
    };
  }
}
