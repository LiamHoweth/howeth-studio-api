import 'attributes.dart';
import 'enums.dart';

/// Position-aware overall rating with weights kept visible and explainable.
int calculateOverall(PlayerAttributes attributes, PositionFamily position) {
  final weights = switch (position) {
    PositionFamily.striker => const {
        PlayerAttribute.finishing: 0.27,
        PlayerAttribute.composure: 0.18,
        PlayerAttribute.technique: 0.16,
        PlayerAttribute.pace: 0.14,
        PlayerAttribute.strength: 0.09,
        PlayerAttribute.stamina: 0.07,
        PlayerAttribute.passing: 0.06,
        PlayerAttribute.defending: 0.03,
      },
    PositionFamily.winger => const {
        PlayerAttribute.pace: 0.23,
        PlayerAttribute.technique: 0.22,
        PlayerAttribute.passing: 0.16,
        PlayerAttribute.composure: 0.11,
        PlayerAttribute.finishing: 0.11,
        PlayerAttribute.stamina: 0.09,
        PlayerAttribute.strength: 0.05,
        PlayerAttribute.defending: 0.03,
      },
    PositionFamily.midfielder => const {
        PlayerAttribute.passing: 0.23,
        PlayerAttribute.technique: 0.20,
        PlayerAttribute.stamina: 0.15,
        PlayerAttribute.composure: 0.13,
        PlayerAttribute.defending: 0.10,
        PlayerAttribute.pace: 0.08,
        PlayerAttribute.strength: 0.07,
        PlayerAttribute.finishing: 0.04,
      },
    PositionFamily.defender => const {
        PlayerAttribute.defending: 0.27,
        PlayerAttribute.strength: 0.19,
        PlayerAttribute.composure: 0.15,
        PlayerAttribute.passing: 0.11,
        PlayerAttribute.pace: 0.10,
        PlayerAttribute.stamina: 0.09,
        PlayerAttribute.technique: 0.06,
        PlayerAttribute.finishing: 0.03,
      },
  };

  return weights.entries
      .fold<double>(0, (sum, item) => sum + attributes[item.key] * item.value)
      .round();
}
