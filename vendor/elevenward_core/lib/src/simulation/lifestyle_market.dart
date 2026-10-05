import '../content/content_models.dart';
import '../model/career_snapshot.dart';

final class WeeklyLifestyleMarket {
  WeeklyLifestyleMarket({
    required this.season,
    required this.week,
    required Map<LifestyleCategory, List<LifestyleItemDefinition>> listings,
  }) : listings = Map.unmodifiable({
          for (final entry in listings.entries)
            entry.key: List<LifestyleItemDefinition>.unmodifiable(entry.value),
        });

  final int season;
  final int week;
  final Map<LifestyleCategory, List<LifestyleItemDefinition>> listings;

  List<LifestyleItemDefinition> forCategory(LifestyleCategory category) =>
      listings[category] ?? const [];
}

final class LifestyleMarketEngine {
  const LifestyleMarketEngine();

  static const listingsPerCategory = 5;
  static const _weeksPerSeason = 18;

  WeeklyLifestyleMarket stockFor(
    CareerSnapshot snapshot,
    ContentCatalog catalog,
  ) {
    final pools = <LifestyleCategory, List<LifestyleItemDefinition>>{
      for (final category in LifestyleCategory.values)
        category: catalog.lifestyleItems
            .where((item) => item.category == category)
            .toList(growable: false)
          ..sort((left, right) => left.id.compareTo(right.id)),
    };
    var previousIds = <LifestyleCategory, Set<String>>{
      for (final category in LifestyleCategory.values) category: <String>{},
    };
    var current = <LifestyleCategory, List<LifestyleItemDefinition>>{};
    final absoluteWeek =
        (snapshot.season - 1) * _weeksPerSeason + snapshot.week;

    for (var ordinal = 1; ordinal <= absoluteWeek; ordinal += 1) {
      current = <LifestyleCategory, List<LifestyleItemDefinition>>{};
      for (final category in LifestyleCategory.values) {
        final pool = pools[category]!;
        final desired = pool.length < listingsPerCategory
            ? pool.length
            : listingsPerCategory;
        final random = _MarketRandom(
          snapshot.seed ^
              ordinal * 0x45d9f3b ^
              (category.index + 1) * 0x119de1f3,
        );
        final fresh = pool
            .where((item) => !previousIds[category]!.contains(item.id))
            .toList(growable: true);
        final selected = _weightedPick(fresh, desired, random);
        if (selected.length < desired) {
          final selectedIds = selected.map((item) => item.id).toSet();
          final fallback = pool
              .where((item) => !selectedIds.contains(item.id))
              .toList(growable: true);
          selected.addAll(
            _weightedPick(fallback, desired - selected.length, random),
          );
        }
        current[category] = selected;
      }
      previousIds = <LifestyleCategory, Set<String>>{
        for (final category in LifestyleCategory.values)
          category: current[category]!.map((item) => item.id).toSet(),
      };
    }

    return WeeklyLifestyleMarket(
      season: snapshot.season,
      week: snapshot.week,
      listings: current,
    );
  }

  List<LifestyleItemDefinition> _weightedPick(
    List<LifestyleItemDefinition> pool,
    int count,
    _MarketRandom random,
  ) {
    final available = List<LifestyleItemDefinition>.of(pool);
    final selected = <LifestyleItemDefinition>[];
    while (available.isNotEmpty && selected.length < count) {
      final totalWeight = available.fold<int>(
        0,
        (total, item) => total + _weight(item.rarity),
      );
      var cursor = random.nextDouble() * totalWeight;
      var selectedIndex = available.length - 1;
      for (var index = 0; index < available.length; index += 1) {
        cursor -= _weight(available[index].rarity);
        if (cursor <= 0) {
          selectedIndex = index;
          break;
        }
      }
      selected.add(available.removeAt(selectedIndex));
    }
    return selected;
  }

  int _weight(ItemRarity rarity) => switch (rarity) {
        ItemRarity.common => 100,
        ItemRarity.uncommon => 48,
        ItemRarity.rare => 16,
        ItemRarity.epic => 5,
        ItemRarity.legendary => 1,
      };
}

final class _MarketRandom {
  _MarketRandom(int seed) : _state = seed & 0xffffffff {
    if (_state == 0) _state = 1;
  }

  int _state;

  double nextDouble() {
    // These constants keep the intermediate value below JavaScript's exact
    // integer limit, so the same career seed produces the same stock on every
    // Flutter target.
    _state = (1664525 * _state + 1013904223) & 0xffffffff;
    return _state / 0x100000000;
  }
}
