import 'enums.dart';
import 'json_helpers.dart';

/// A starting suggestion only; a saved player choice always takes precedence.
PlayerAttribute recommendedTrainingFocus(Archetype archetype) =>
    switch (archetype) {
      Archetype.poacher ||
      Archetype.invertedWinger =>
        PlayerAttribute.finishing,
      Archetype.targetForward => PlayerAttribute.strength,
      Archetype.completeForward => PlayerAttribute.technique,
      Archetype.touchlineWinger ||
      Archetype.attackingFullback =>
        PlayerAttribute.pace,
      Archetype.wideCreator ||
      Archetype.playmaker ||
      Archetype.ballPlayingCentreBack =>
        PlayerAttribute.passing,
      Archetype.boxToBox => PlayerAttribute.stamina,
      Archetype.ballWinner || Archetype.stopper => PlayerAttribute.defending,
    };

/// Immutable values for the eight attributes shown in the game UI.
final class PlayerAttributes {
  PlayerAttributes(Map<PlayerAttribute, int> values)
      : _values = Map.unmodifiable({
          for (final attribute in PlayerAttribute.values)
            attribute: _validatedValue(values[attribute], attribute),
        });

  factory PlayerAttributes.developmentStriker() =>
      PlayerAttributes.forArchetype(Archetype.poacher);

  factory PlayerAttributes.forArchetype(Archetype archetype) {
    final values = <PlayerAttribute, int>{
      PlayerAttribute.pace: 58,
      PlayerAttribute.technique: 58,
      PlayerAttribute.passing: 56,
      PlayerAttribute.finishing: 50,
      PlayerAttribute.defending: 48,
      PlayerAttribute.strength: 57,
      PlayerAttribute.stamina: 61,
      PlayerAttribute.composure: 58,
    };
    final familyBoosts = switch (archetype.positionFamily) {
      PositionFamily.striker => const {
          PlayerAttribute.pace: 6,
          PlayerAttribute.technique: 5,
          PlayerAttribute.finishing: 13,
          PlayerAttribute.defending: -17,
          PlayerAttribute.composure: 4,
        },
      PositionFamily.winger => const {
          PlayerAttribute.pace: 10,
          PlayerAttribute.technique: 8,
          PlayerAttribute.passing: 5,
          PlayerAttribute.finishing: 5,
          PlayerAttribute.defending: -12,
        },
      PositionFamily.midfielder => const {
          PlayerAttribute.technique: 6,
          PlayerAttribute.passing: 11,
          PlayerAttribute.finishing: -2,
          PlayerAttribute.defending: 4,
          PlayerAttribute.stamina: 6,
        },
      PositionFamily.defender => const {
          PlayerAttribute.pace: 2,
          PlayerAttribute.passing: 1,
          PlayerAttribute.finishing: -20,
          PlayerAttribute.defending: 17,
          PlayerAttribute.strength: 8,
          PlayerAttribute.composure: 4,
        },
    };
    for (final boost in familyBoosts.entries) {
      values[boost.key] = values[boost.key]! + boost.value;
    }
    final archetypeBoosts = switch (archetype) {
      Archetype.poacher => const {
          PlayerAttribute.finishing: 4,
          PlayerAttribute.pace: 4
        },
      Archetype.targetForward => const {
          PlayerAttribute.strength: 8,
          PlayerAttribute.passing: 2
        },
      Archetype.completeForward => const {
          PlayerAttribute.technique: 3,
          PlayerAttribute.passing: 4
        },
      Archetype.touchlineWinger => const {
          PlayerAttribute.pace: 5,
          PlayerAttribute.passing: 4
        },
      Archetype.invertedWinger => const {
          PlayerAttribute.finishing: 5,
          PlayerAttribute.technique: 3
        },
      Archetype.wideCreator => const {
          PlayerAttribute.passing: 7,
          PlayerAttribute.composure: 3
        },
      Archetype.playmaker => const {
          PlayerAttribute.passing: 7,
          PlayerAttribute.technique: 4
        },
      Archetype.boxToBox => const {
          PlayerAttribute.stamina: 7,
          PlayerAttribute.pace: 3
        },
      Archetype.ballWinner => const {
          PlayerAttribute.defending: 7,
          PlayerAttribute.strength: 4
        },
      Archetype.stopper => const {
          PlayerAttribute.defending: 6,
          PlayerAttribute.strength: 6
        },
      Archetype.ballPlayingCentreBack => const {
          PlayerAttribute.passing: 6,
          PlayerAttribute.composure: 4
        },
      Archetype.attackingFullback => const {
          PlayerAttribute.pace: 6,
          PlayerAttribute.stamina: 5
        },
    };
    for (final boost in archetypeBoosts.entries) {
      values[boost.key] = values[boost.key]! + boost.value;
    }
    return PlayerAttributes(values);
  }

  factory PlayerAttributes.fromJson(Map<String, Object?> json) {
    return PlayerAttributes({
      for (final attribute in PlayerAttribute.values)
        attribute: jsonInt(json, attribute.name),
    });
  }

  final Map<PlayerAttribute, int> _values;

  int operator [](PlayerAttribute attribute) => _values[attribute]!;

  PlayerAttributes improve(PlayerAttribute attribute, int amount) {
    final next = Map<PlayerAttribute, int>.from(_values);
    next[attribute] = (next[attribute]! + amount).clamp(1, 99);
    return PlayerAttributes(next);
  }

  Map<String, Object?> toJson() => {
        for (final attribute in PlayerAttribute.values)
          attribute.name: _values[attribute],
      };

  static int _validatedValue(int? value, PlayerAttribute attribute) {
    if (value == null || value < 1 || value > 99) {
      throw ArgumentError.value(
        value,
        attribute.name,
        'Attribute values must be between 1 and 99.',
      );
    }
    return value;
  }
}
