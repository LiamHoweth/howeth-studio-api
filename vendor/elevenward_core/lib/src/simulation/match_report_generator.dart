import '../model/enums.dart';
import '../model/weekly_models.dart';

/// Builds deterministic, evidence-backed match copy from interchangeable
/// sentence structures. Six choices across six sections provide 46,656
/// possible reports before match data and player names are substituted.
final class MatchReportGenerator {
  const MatchReportGenerator();

  static const choicesPerSection = 6;
  static const sectionCount = 6;
  static const possibleDescriptions = 46656; // 6 ^ 6

  String headline({
    required int seed,
    required String playerName,
    required String opponentName,
    required TeamResult result,
    required int playerGoals,
    required int playerAssists,
    required bool lateDrama,
  }) {
    final resultWord = switch (result) {
      TeamResult.win => 'victory',
      TeamResult.draw => 'draw',
      TeamResult.loss => 'defeat',
    };
    final options = [
      '$playerName shapes a $resultWord against $opponentName',
      '$playerName at the heart of the story against $opponentName',
      lateDrama
          ? 'Late drama defines $playerName\'s night'
          : '$opponentName test $playerName from first whistle to last',
      playerGoals > 0
          ? '$playerName finds the net in a compelling contest'
          : '$playerName battles through a demanding contest',
      playerAssists > 0
          ? '$playerName creates the opening against $opponentName'
          : 'Fine margins settle $playerName\'s latest test',
      '$resultWord leaves plenty to discuss after $opponentName clash',
    ];
    return _pick(options, seed, 17);
  }

  String generate({
    required int seed,
    required String playerName,
    required String clubName,
    required String opponentName,
    required bool isHome,
    required int homeScore,
    required int awayScore,
    required TeamResult result,
    required SelectionStatus selection,
    required SpotlightApproach approach,
    required bool spotlightSucceeded,
    required int playerGoals,
    required int playerAssists,
    required double rating,
    required MatchMetrics metrics,
  }) {
    final playerScore = isHome ? homeScore : awayScore;
    final opponentScore = isHome ? awayScore : homeScore;
    final venue = isHome ? 'at home' : 'away from home';
    final resultWord = switch (result) {
      TeamResult.win => 'win',
      TeamResult.draw => 'draw',
      TeamResult.loss => 'loss',
    };
    final resultVerb = switch (result) {
      TeamResult.win => 'claimed all three points',
      TeamResult.draw => 'shared the points',
      TeamResult.loss => 'left without a result',
    };

    final openings = [
      '$clubName $resultVerb after a $playerScore–$opponentScore contest with $opponentName $venue.',
      'The scoreboard finished $playerScore–$opponentScore as $clubName recorded a $resultWord against $opponentName.',
      'A demanding meeting with $opponentName ended $playerScore–$opponentScore from $clubName\'s perspective.',
      '$clubName and $opponentName produced a match of shifting control, ending $playerScore–$opponentScore.',
      'By the final whistle, $clubName had turned ninety minutes against $opponentName into a $resultWord.',
      'The latest chapter of $clubName\'s season was a $playerScore–$opponentScore $resultWord against $opponentName.',
    ];
    final control = metrics.possession >= 55
        ? [
            'With ${metrics.possession}% possession, $clubName controlled long stretches and repeatedly reset attacks through midfield.',
            '$clubName dictated the rhythm with ${metrics.possession}% of the ball, asking $opponentName to defend in compact phases.',
            'Territorial patience was central: ${metrics.possession}% possession let $clubName probe for openings rather than force them.',
            '$clubName spent most of the evening on the front foot, using ${metrics.possession}% possession to sustain pressure.',
            'The ball belonged mostly to $clubName, whose ${metrics.possession}% share created a platform for waves of attacks.',
            'A possession edge of ${metrics.possession}% gave $clubName command of the tempo, even when the score remained tight.',
          ]
        : metrics.possession <= 45
            ? [
                '$clubName accepted ${metrics.possession}% possession and focused on breaking quickly into the space $opponentName left behind.',
                'Without much of the ball, $clubName built the performance around compact defending and direct transitions.',
                '$opponentName held territorial control, but $clubName tried to make a ${metrics.possession}% share count through efficient attacks.',
                'The match demanded patience without possession, with $clubName looking to counter whenever the pressure broke.',
                '$clubName spent long spells defending and used a lower block to protect the central route to goal.',
                'A ${metrics.possession}% share forced $clubName into reactive football, making every transition carry extra weight.',
              ]
            : [
                'Possession was finely balanced at ${metrics.possession}%, and neither side could own the rhythm for long.',
                'The midfield contest stayed even, with control changing hands throughout the match.',
                'Both teams found periods of authority, reflected in $clubName\'s ${metrics.possession}% share of the ball.',
                'The tactical battle remained balanced, with neither side able to sustain pressure unchecked.',
                'Transitions defined an even contest in which control moved rapidly from one side to the other.',
                'At ${metrics.possession}% possession, $clubName operated in a match decided more by execution than territory.',
              ];
    final chances = [
      '$clubName produced ${metrics.shots} shots, put ${metrics.shotsOnTarget} on target, and generated ${metrics.expectedGoals.toStringAsFixed(1)} expected goals.',
      'The chance profile showed ${metrics.shotsOnTarget} efforts on target from ${metrics.shots} attempts, worth ${metrics.expectedGoals.toStringAsFixed(1)} xG.',
      '${metrics.bigChances} big chances underlined a ${metrics.expectedGoals.toStringAsFixed(1)} xG attack, compared with ${metrics.opponentExpectedGoals.toStringAsFixed(1)} for $opponentName.',
      'Shot quality, not just volume, told the story: ${metrics.expectedGoals.toStringAsFixed(1)} xG from ${metrics.shots} attempts.',
      '$opponentName allowed ${metrics.shots} attempts, but only ${metrics.shotsOnTarget} tested the goalkeeper directly.',
      'The underlying numbers finished ${metrics.expectedGoals.toStringAsFixed(1)}–${metrics.opponentExpectedGoals.toStringAsFixed(1)} in expected goals, revealing the balance beneath the scoreline.',
    ];
    final tempo = metrics.lateDrama
        ? [
            'The decisive tension arrived late, after ${metrics.momentumSwings} clear swings in momentum kept the outcome unstable.',
            'Late drama transformed the mood, with the match still alive deep into its final phase.',
            'Neither bench could relax as ${metrics.momentumSwings} momentum changes carried the contest toward a tense finish.',
            'The closing minutes became the defining passage, rewarding the side that handled pressure more cleanly.',
            'A late surge broke the tactical pattern and pushed the match into a breathless conclusion.',
            'The final phase mattered most, with fatigue opening spaces that had been closed for much of the night.',
          ]
        : [
            'Across ${metrics.momentumSwings} momentum shifts, the match evolved without losing its tactical shape.',
            'The key spell arrived before the closing stages, allowing the final minutes to be managed with greater clarity.',
            'Both teams adjusted as momentum moved, but the central pattern of the contest remained intact.',
            'The match was shaped by sustained phases rather than one isolated late incident.',
            'Game management mattered after the interval as each side tried to control risk and field position.',
            'The tempo rose and fell in distinct phases, producing ${metrics.momentumSwings} meaningful changes of initiative.',
          ];
    final playerImpact = switch (selection) {
      SelectionStatus.omitted => [
          '$playerName watched from outside the matchday role, so the week\'s work could not influence the action directly.',
          'Selection was the central personal story: $playerName was omitted and must respond in training.',
          '$playerName did not feature, leaving form and manager trust as the immediate priorities.',
          'From the sidelines, $playerName saw how the tactical plan unfolded without a direct opportunity to affect it.',
          'There were no match minutes for $playerName, turning attention quickly toward the next selection decision.',
          '$playerName remained outside the active squad and now faces a clear fight for involvement.',
        ],
      _ => playerGoals > 0
          ? [
              '$playerName delivered $playerGoals ${playerGoals == 1 ? 'goal' : 'goals'} and earned a $rating rating with decisive movement in the final third.',
              'A $rating performance was crowned by $playerGoals ${playerGoals == 1 ? 'goal' : 'goals'}, giving $playerName a direct influence on the score.',
              '$playerName attacked the crucial spaces and converted that work into $playerGoals ${playerGoals == 1 ? 'goal' : 'goals'}.',
              'The personal highlight belonged to $playerName, whose finishing produced $playerGoals ${playerGoals == 1 ? 'goal' : 'goals'} and a $rating rating.',
              '$playerName made the spotlight count, translating aggressive positioning into a place on the scoresheet.',
              'Whenever the match entered the danger area, $playerName looked capable of deciding it and finished with a $rating rating.',
            ]
          : playerAssists > 0
              ? [
                  '$playerName supplied the final pass for $playerAssists ${playerAssists == 1 ? 'goal' : 'goals'} and finished with a $rating rating.',
                  'Creation defined $playerName\'s contribution, with $playerAssists ${playerAssists == 1 ? 'assist' : 'assists'} rewarding intelligent use of the ball.',
                  '$playerName found the passing lane that changed the score and remained involved between the lines.',
                  'A $rating display reflected $playerName\'s ability to connect midfield pressure with the final action.',
                  '$playerName influenced the game through timing and vision, recording $playerAssists ${playerAssists == 1 ? 'assist' : 'assists'}.',
                  'The decisive creative contribution came from $playerName, whose distribution unlocked $opponentName.',
                ]
              : [
                  '$playerName posted a $rating rating, with the chosen ${approach.name} approach ${spotlightSucceeded ? 'helping the plan land' : 'failing to produce the intended breakthrough'}.',
                  'The individual display ended at $rating as $playerName worked through a match with few clean personal openings.',
                  '$playerName influenced the structure more than the scoresheet, finishing with a $rating rating.',
                  'A ${approach.name} spotlight decision tested $playerName\'s judgement and shaped a $rating performance.',
                  '$playerName stayed engaged in the tactical contest, even without a goal contribution to show for it.',
                  'The night asked for discipline from $playerName, whose overall contribution was rated $rating.',
                ],
    };
    final conclusions = metrics.comeback
        ? [
            'Most importantly, the response after falling behind showed that this side can change a match without abandoning its identity.',
            'The comeback revealed resilience, but it also exposed the cost of starting too passively.',
            'Recovering from behind gave the result emotional weight beyond the points alone.',
            'The response to adversity will please the dressing room as much as the final score.',
            'Turning the game around strengthened belief while leaving clear lessons about the opening phase.',
            'The recovery became the lasting image: composure survived the setback and changed the direction of the match.',
          ]
        : [
            'The result now feeds directly into selection pressure, form, and the tactical questions waiting next week.',
            'The score matters, but the underlying chance balance offers the clearest guide for the work ahead.',
            'Attention moves to recovery and whether this performance can become a repeatable pattern.',
            'The staff will take both the outcome and the process into the next training plan.',
            'For $playerName, the next challenge is turning this performance into sustained manager trust.',
            'The match leaves a useful blueprint—along with weaknesses the next opponent will try to exploit.',
          ];

    // Treat the normalized seed as a base-six report ID. Every ID from 0 to
    // 46,655 maps to exactly one sentence combination, so the advertised
    // variety is real rather than an estimate based on random selection.
    var variant = (seed & 0x7fffffff) % possibleDescriptions;
    final indexes = List<int>.generate(sectionCount, (_) {
      final index = variant % choicesPerSection;
      variant ~/= choicesPerSection;
      return index;
    }, growable: false);
    return [
      openings[indexes[0]],
      control[indexes[1]],
      chances[indexes[2]],
      tempo[indexes[3]],
      playerImpact[indexes[4]],
      conclusions[indexes[5]],
    ].join(' ');
  }

  String _pick(List<String> values, int seed, int salt) {
    final mixed = (seed ^ (salt * 0x45d9f3b)) & 0x7fffffff;
    return values[mixed % values.length];
  }
}
