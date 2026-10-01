import 'dart:convert';
import 'dart:io';
import 'package:elevenward_core/elevenward_core.dart';

/// stdin: {seed, careerId, updatedAt/enrolledAt, choices:[{focus,intensity,spotlightApproach}]}
/// stdout: compact verified score and version receipt; exit 1 means invalid input.
Future<void> main(List<String> args) async {
  try {
    final input = await stdin.transform(utf8.decoder).join();
    if (input.length > 65536)
      throw const FormatException('Challenge input is too large.');
    final json = (jsonDecode(input) as Map).cast<String, Object?>();
    if (json['rulesVersion'] != null &&
        json['rulesVersion'] != WeeklyChallenge.rulesVersion)
      throw const FormatException('Unsupported challenge rules.');
    if (json['contentVersion'] != null &&
        json['contentVersion'] != WeeklyChallenge.contentVersion)
      throw const FormatException('Unsupported challenge content.');
    final actions = (json['choices'] ?? json['actions']) as List;
    if (actions.length != WeeklyChallenge.matchCount &&
        json['allowPartial'] != true) {
      throw const FormatException('Exactly eight choices are required.');
    }
    final choices = actions
        .map((raw) =>
            WeeklyChoice.fromJson((raw as Map).cast<String, Object?>()))
        .toList();
    final result = const WeeklyChallenge().replay(
        seed: json['seed'] as int,
        choices: choices,
        careerId: json['careerId'] as String? ?? 'weekly-challenge',
        updatedAt: DateTime.parse(
            (json['updatedAt'] ?? json['enrolledAt']) as String));
    stdout.writeln(jsonEncode({
      'valid': result.complete,
      'rulesVersion': WeeklyChallenge.rulesVersion,
      'contentVersion': WeeklyChallenge.contentVersion,
      'matchCount': result.matchesPlayed,
      'score': result.score,
      'matchesPlayed': result.matchesPlayed,
      'complete': result.complete,
      if (json['includeSnapshot'] == true) 'snapshot': result.snapshot.toJson()
    }));
  } catch (error) {
    stderr.writeln('Invalid challenge: $error');
    exitCode = 1;
  }
}
