/// Account-level permanent bonuses applied while a career advances.
///
/// The core package deliberately knows nothing about storefront products. The
/// app resolves owned gamepasses into this value before invoking simulation.
final class RewardModifiers {
  const RewardModifiers({
    this.developmentMultiplier = 1,
    this.moneyMultiplier = 1,
    this.sourceIds = const [],
  })  : assert(developmentMultiplier >= 1 && developmentMultiplier <= 3),
        assert(moneyMultiplier >= 1 && moneyMultiplier <= 3);

  static const standard = RewardModifiers();

  final double developmentMultiplier;
  final double moneyMultiplier;
  final List<String> sourceIds;

  int applyPositiveMoney(int amount) =>
      amount > 0 ? (amount * moneyMultiplier).round() : amount;

  bool get boostsDevelopment => developmentMultiplier > 1;
  bool get boostsMoney => moneyMultiplier > 1;
}
