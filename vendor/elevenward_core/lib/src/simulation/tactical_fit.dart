import '../model/career_snapshot.dart';
import '../model/enums.dart';
import '../world/world_models.dart';

/// One formula supplies club previews, selection, spotlight and transfers.
int calculateTacticalFit(CareerSnapshot snapshot, ClubDefinition club) {
  if (!snapshot.usesModernCareerRules) {
    return (55 +
            ((club.attack +
                    club.defense +
                    snapshot.player.archetype.index * 7) %
                31))
        .clamp(1, 100);
  }
  final attributes = snapshot.player.attributes;
  final keys = switch (club.playingStyle) {
    ClubPlayingStyle.possession => [
        PlayerAttribute.passing,
        PlayerAttribute.technique,
        PlayerAttribute.composure
      ],
    ClubPlayingStyle.highPress => [
        PlayerAttribute.stamina,
        PlayerAttribute.pace,
        PlayerAttribute.defending
      ],
    ClubPlayingStyle.counterAttack => [
        PlayerAttribute.pace,
        PlayerAttribute.finishing,
        PlayerAttribute.passing
      ],
    ClubPlayingStyle.direct => [
        PlayerAttribute.strength,
        PlayerAttribute.finishing,
        PlayerAttribute.composure
      ],
    ClubPlayingStyle.defensive => [
        PlayerAttribute.defending,
        PlayerAttribute.strength,
        PlayerAttribute.composure
      ],
  };
  final ability =
      keys.fold<int>(0, (sum, key) => sum + attributes[key]) / keys.length;
  return (45 + ability * .45 + (snapshot.player.overall - club.quality) * .15)
      .round()
      .clamp(30, 95);
}
