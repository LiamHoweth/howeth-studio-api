import '../model/enums.dart';
import '../world/world_generator.dart';
import '../world/world_models.dart';

const supportedLocales = ['en', 'es', 'pt-BR', 'fr'];

final class LocalizedText {
  LocalizedText(Map<String, String> values) : values = Map.unmodifiable(values);

  factory LocalizedText.fromJson(Map<String, Object?> json) => LocalizedText(
        json.map((key, value) => MapEntry(key, value as String)),
      );

  final Map<String, String> values;

  String forLocale(String locale) => values[locale] ?? values['en']!;

  Map<String, Object?> toJson() => values;
}

final class SituationOption {
  const SituationOption({
    required this.approach,
    required this.title,
    required this.primaryAttributes,
    required this.trustRisk,
    required this.ratingUpside,
  });

  final SpotlightApproach approach;
  final LocalizedText title;
  final List<PlayerAttribute> primaryAttributes;
  final int trustRisk;
  final double ratingUpside;

  Map<String, Object?> toJson() => {
        'approach': approach.name,
        'title': title.toJson(),
        'primaryAttributes':
            primaryAttributes.map((value) => value.name).toList(),
        'trustRisk': trustRisk,
        'ratingUpside': ratingUpside,
      };
}

final class MatchSituationDefinition {
  const MatchSituationDefinition({
    required this.id,
    required this.position,
    required this.archetypeTags,
    required this.minuteFrom,
    required this.minuteTo,
    required this.prompt,
    required this.options,
  });

  final String id;
  final PositionFamily position;
  final List<Archetype> archetypeTags;
  final int minuteFrom;
  final int minuteTo;
  final LocalizedText prompt;
  final List<SituationOption> options;

  Map<String, Object?> toJson() => {
        'id': id,
        'position': position.name,
        'archetypeTags': archetypeTags.map((value) => value.name).toList(),
        'minuteFrom': minuteFrom,
        'minuteTo': minuteTo,
        'prompt': prompt.toJson(),
        'options': options.map((value) => value.toJson()).toList(),
      };
}

enum CareerEventCategory {
  manager,
  teammate,
  agent,
  sponsor,
  press,
  family,
  reputation,
  wellness,
  community,
  contract,
}

/// How the player performed in the match immediately before an off-pitch
/// decision. Keeping this deliberately broad makes authored scenarios useful
/// across positions while still letting the story react to what just happened.
enum PreviousMatchPerformance { poor, steady, standout }

/// Match context used to select an off-pitch decision.
final class CareerEventContext {
  const CareerEventContext({
    required this.previousPerformance,
    required this.previousGameWasHighStakes,
    required this.nextGameIsHighStakes,
  });

  final PreviousMatchPerformance previousPerformance;
  final bool previousGameWasHighStakes;
  final bool nextGameIsHighStakes;
}

final class EventChoiceDefinition {
  const EventChoiceDefinition({
    required this.id,
    required this.label,
    required this.trustDelta,
    required this.reputationDelta,
    required this.moneyDelta,
    required this.wellnessDelta,
    this.weeklyWagePercent = 100,
    this.appearanceBonusDelta = 0,
    this.familyDelta = 0,
    this.fitnessDelta = 0,
    this.contractSeasonsDelta = 0,
    this.promisedRole,
    this.outcome,
  });

  final String id;
  final LocalizedText label;
  final int trustDelta;
  final int reputationDelta;
  final int moneyDelta;
  final int wellnessDelta;
  final int weeklyWagePercent,
      appearanceBonusDelta,
      familyDelta,
      fitnessDelta,
      contractSeasonsDelta;
  final String? promisedRole;
  final LocalizedText? outcome;

  Map<String, Object?> toJson() => {
        'id': id,
        'label': label.toJson(),
        'trustDelta': trustDelta,
        'reputationDelta': reputationDelta,
        'moneyDelta': moneyDelta,
        'wellnessDelta': wellnessDelta,
        if (weeklyWagePercent != 100) 'weeklyWagePercent': weeklyWagePercent,
        if (appearanceBonusDelta != 0)
          'appearanceBonusDelta': appearanceBonusDelta,
        if (familyDelta != 0) 'familyDelta': familyDelta,
        if (fitnessDelta != 0) 'fitnessDelta': fitnessDelta,
        if (contractSeasonsDelta != 0)
          'contractSeasonsDelta': contractSeasonsDelta,
        if (promisedRole != null) 'promisedRole': promisedRole,
        if (outcome != null) 'outcome': outcome!.toJson(),
      };
}

final class CareerEventDefinition {
  const CareerEventDefinition({
    required this.id,
    required this.category,
    required this.title,
    required this.body,
    required this.choices,
    this.previousPerformances = const {
      PreviousMatchPerformance.poor,
      PreviousMatchPerformance.steady,
      PreviousMatchPerformance.standout,
    },
    this.previousGameWasHighStakes,
    this.nextGameIsHighStakes,
  });

  final String id;
  final CareerEventCategory category;
  final LocalizedText title;
  final LocalizedText body;
  final List<EventChoiceDefinition> choices;
  final Set<PreviousMatchPerformance> previousPerformances;
  final bool? previousGameWasHighStakes;
  final bool? nextGameIsHighStakes;

  bool matches(CareerEventContext context) =>
      previousPerformances.contains(context.previousPerformance) &&
      (previousGameWasHighStakes == null ||
          previousGameWasHighStakes == context.previousGameWasHighStakes) &&
      (nextGameIsHighStakes == null ||
          nextGameIsHighStakes == context.nextGameIsHighStakes);

  Map<String, Object?> toJson() => {
        'id': id,
        'category': category.name,
        'title': title.toJson(),
        'body': body.toJson(),
        'choices': choices.map((value) => value.toJson()).toList(),
        'previousPerformances':
            previousPerformances.map((value) => value.name).toList(),
        'previousGameWasHighStakes': previousGameWasHighStakes,
        'nextGameIsHighStakes': nextGameIsHighStakes,
      };
}

enum LifestyleCategory { home, transportation, style, wellness }

enum ItemRarity { common, uncommon, rare, epic, legendary }

final class LifestyleItemDefinition {
  const LifestyleItemDefinition({
    required this.id,
    required this.category,
    required this.rarity,
    required this.name,
    required this.description,
    required this.price,
    required this.reputationEffect,
    required this.wellnessEffect,
  });

  final String id;
  final LifestyleCategory category;
  final ItemRarity rarity;
  final LocalizedText name;
  final LocalizedText description;
  final int price;
  final int reputationEffect;
  final int wellnessEffect;

  Map<String, Object?> toJson() => {
        'id': id,
        'category': category.name,
        'rarity': rarity.name,
        'name': name.toJson(),
        'description': description.toJson(),
        'price': price,
        'reputationEffect': reputationEffect,
        'wellnessEffect': wellnessEffect,
      };
}

final class ContentManifest {
  const ContentManifest({
    required this.releaseVersion,
    required this.minimumClientVersion,
    required this.maximumClientVersion,
    required this.checksum,
    required this.locales,
    required this.assetPath,
    required this.signature,
  });

  final String releaseVersion;
  final String minimumClientVersion;
  final String maximumClientVersion;
  final String checksum;
  final List<String> locales;
  final String assetPath;
  final String signature;

  Map<String, Object?> toJson() => {
        'releaseVersion': releaseVersion,
        'minimumClientVersion': minimumClientVersion,
        'maximumClientVersion': maximumClientVersion,
        'checksum': checksum,
        'locales': locales,
        'assetPath': assetPath,
        'signature': signature,
      };
}

final class ContentCatalog {
  ContentCatalog({
    required this.version,
    required this.matchSituations,
    required this.careerEvents,
    required this.lifestyleItems,
    WorldDefinition? world,
  }) : world = world ?? buildLaunchWorld();

  /// Decodes a validated remote bundle into the same immutable domain objects
  /// used by the in-app launch catalog. Executable rules never come from this
  /// payload; only authored data is accepted here.
  factory ContentCatalog.fromBundle(Map<String, Object?> bundle) {
    Map<String, Object?> object(Object? value, String path) {
      if (value is! Map) throw FormatException('$path must be an object.');
      return value.cast<String, Object?>();
    }

    List<Object?> list(Object? value, String path) {
      if (value is! List) throw FormatException('$path must be a list.');
      return value.cast<Object?>();
    }

    T named<T extends Enum>(List<T> values, Object? value, String path) {
      if (value is! String) throw FormatException('$path must be a string.');
      return values.firstWhere(
        (candidate) => candidate.name == value,
        orElse: () => throw FormatException('$path has unsupported value.'),
      );
    }

    String countryId(Object? value) =>
        value == 'unitedStates' ? 'united-states' : value as String;

    final metadata = object(bundle['metadata'], 'metadata');
    final situations = list(
      bundle['matchSituations'],
      'matchSituations',
    ).map((raw) {
      final item = object(raw, 'matchSituation');
      return MatchSituationDefinition(
        id: item['id'] as String,
        position: named(PositionFamily.values, item['position'], 'position'),
        archetypeTags: list(item['archetypeTags'], 'archetypeTags')
            .map((value) => named(Archetype.values, value, 'archetypeTag'))
            .toList(growable: false),
        minuteFrom: item['minuteFrom'] as int,
        minuteTo: item['minuteTo'] as int,
        prompt: LocalizedText.fromJson(object(item['prompt'], 'prompt')),
        options: list(item['options'], 'options').map((rawOption) {
          final option = object(rawOption, 'option');
          return SituationOption(
            approach: named(
              SpotlightApproach.values,
              option['approach'],
              'approach',
            ),
            title: LocalizedText.fromJson(object(option['title'], 'title')),
            primaryAttributes: list(
              option['primaryAttributes'],
              'primaryAttributes',
            )
                .map(
                  (value) => named(
                    PlayerAttribute.values,
                    value,
                    'primaryAttribute',
                  ),
                )
                .toList(growable: false),
            trustRisk: option['trustRisk'] as int,
            ratingUpside: (option['ratingUpside'] as num).toDouble(),
          );
        }).toList(growable: false),
      );
    }).toList(growable: false);
    final events = list(bundle['events'], 'events').map((raw) {
      final item = object(raw, 'event');
      return CareerEventDefinition(
        id: item['id'] as String,
        category: named(
          CareerEventCategory.values,
          item['category'],
          'category',
        ),
        title: LocalizedText.fromJson(object(item['title'], 'title')),
        body: LocalizedText.fromJson(object(item['body'], 'body')),
        choices: list(item['choices'], 'choices').map((rawChoice) {
          final choice = object(rawChoice, 'choice');
          return EventChoiceDefinition(
            id: choice['id'] as String,
            label: LocalizedText.fromJson(object(choice['label'], 'label')),
            trustDelta: choice['trustDelta'] as int,
            reputationDelta: choice['reputationDelta'] as int,
            moneyDelta: choice['moneyDelta'] as int,
            wellnessDelta: choice['wellnessDelta'] as int,
            weeklyWagePercent: choice['weeklyWagePercent'] as int? ?? 100,
            appearanceBonusDelta: choice['appearanceBonusDelta'] as int? ?? 0,
            familyDelta: choice['familyDelta'] as int? ?? 0,
            fitnessDelta: choice['fitnessDelta'] as int? ?? 0,
            contractSeasonsDelta: choice['contractSeasonsDelta'] as int? ?? 0,
            promisedRole: choice['promisedRole'] as String?,
            outcome: choice['outcome'] == null
                ? null
                : LocalizedText.fromJson(object(choice['outcome'], 'outcome')),
          );
        }).toList(growable: false),
        previousPerformances: item['previousPerformances'] == null
            ? PreviousMatchPerformance.values.toSet()
            : list(item['previousPerformances'], 'previousPerformances')
                .map(
                  (value) => named(
                    PreviousMatchPerformance.values,
                    value,
                    'previousPerformance',
                  ),
                )
                .toSet(),
        previousGameWasHighStakes: item['previousGameWasHighStakes'] as bool?,
        nextGameIsHighStakes: item['nextGameIsHighStakes'] as bool?,
      );
    }).toList(growable: false);
    final items = list(bundle['lifestyleItems'], 'lifestyleItems').map((raw) {
      final item = object(raw, 'lifestyleItem');
      return LifestyleItemDefinition(
        id: item['id'] as String,
        category: named(
          LifestyleCategory.values,
          item['category'],
          'category',
        ),
        rarity: named(ItemRarity.values, item['rarity'], 'rarity'),
        name: LocalizedText.fromJson(object(item['name'], 'name')),
        description: LocalizedText.fromJson(
          object(item['description'], 'description'),
        ),
        price: item['price'] as int,
        reputationEffect: item['reputationEffect'] as int,
        wellnessEffect: item['wellnessEffect'] as int,
      );
    }).toList(growable: false);
    Fixture fixture(Object? raw, String path) {
      final item = object(raw, path);
      final decision = item['decision'];
      return Fixture(
        id: item['id'] as String,
        competitionId: item['competitionId'] as String,
        matchweek: item['matchweek'] as int,
        homeId: item['homeId'] as String,
        awayId: item['awayId'] as String,
        homeGoals: item['homeGoals'] as int?,
        awayGoals: item['awayGoals'] as int?,
        decision: decision == null
            ? FixtureDecision.regulation
            : named(FixtureDecision.values, decision, '$path.decision'),
      );
    }

    final clubItems = list(bundle['clubs'], 'clubs');
    final clubs = clubItems.map((raw) {
      final item = object(raw, 'club');
      return ClubDefinition(
        id: item['id'] as String,
        name: item['name'] as String,
        shortName: item['shortName'] as String,
        countryId: countryId(item['countryId'] ?? item['nation']),
        division: named(
          DivisionLevel.values,
          item['division'],
          'club.division',
        ),
        quality: item['quality'] as int,
        attack: item['attack'] as int,
        defense: item['defense'] as int,
        primaryColor: item['primaryColor'] as int,
        secondaryColor: item['secondaryColor'] as int,
      );
    }).toList(growable: false);
    final nationalItems = list(bundle['nationalTeams'], 'nationalTeams');
    final countryIds = <String>{
      ...clubs.map((club) => club.countryId),
      ...nationalItems.map((raw) {
        final item = object(raw, 'nationalTeam');
        return item['countryId'] as String? ?? item['id'] as String;
      }),
    };
    final countries = bundle['countries'] is List
        ? list(bundle['countries'], 'countries').map((raw) {
            final item = object(raw, 'country');
            return CountryDefinition(
              id: item['id'] as String,
              names: object(item['names'], 'country.names').map(
                (key, value) => MapEntry(key, value as String),
              ),
              region: named(
                FootballRegion.values,
                item['region'],
                'country.region',
              ),
              confederation: named(
                FootballConfederation.values,
                item['confederation'],
                'country.confederation',
              ),
              mapUnitCodes: list(item['mapUnitCodes'], 'country.mapUnitCodes')
                  .cast<String>(),
              leagueRank: item['leagueRank'] as int?,
              playableLeague: item['playableLeague'] as bool? ?? false,
            );
          }).toList(growable: false)
        : launchCountries
            .where((country) => countryIds.contains(country.id))
            .map((country) => CountryDefinition(
                  id: country.id,
                  names: country.names,
                  region: country.region,
                  confederation: country.confederation,
                  mapUnitCodes: country.mapUnitCodes,
                  leagueRank: null,
                  playableLeague:
                      clubs.any((club) => club.countryId == country.id),
                ))
            .toList(growable: false);
    CountryDefinition country(String id) =>
        countries.firstWhere((country) => country.id == id);
    final nationalTeams = nationalItems.map((raw) {
      final item = object(raw, 'nationalTeam');
      final countryId = item['countryId'] as String? ?? item['id'] as String;
      final countryDefinition = country(countryId);
      return NationalTeamDefinition(
        id: item['id'] as String,
        countryId: countryId,
        countryName: item['countryName'] as String,
        region: countryDefinition.region,
        confederation: countryDefinition.confederation,
        quality: item['quality'] as int,
      );
    }).toList(growable: false);
    final allLeagueFixtures = list(bundle['fixtures'], 'fixtures')
        .map((raw) => fixture(raw, 'fixture'))
        .toList(growable: false);
    final leagues = list(bundle['leagues'], 'leagues').map((raw) {
      final item = object(raw, 'league');
      final id = item['id'] as String;
      return LeagueDefinition(
        id: id,
        name: item['name'] as String,
        countryId: countryId(item['countryId'] ?? item['nation']),
        systemRank: item['systemRank'] as int?,
        division:
            named(DivisionLevel.values, item['division'], 'league.division'),
        clubIds: list(item['clubIds'], 'league.clubIds').cast<String>(),
        fixtures: allLeagueFixtures
            .where((candidate) => candidate.competitionId == id)
            .toList(growable: false),
      );
    }).toList(growable: false);
    final cups = list(bundle['domesticCups'], 'domesticCups').map((raw) {
      final item = object(raw, 'domesticCup');
      final id = item['id'] as String;
      final countryId = item['countryId'] as String? ??
          countries
              .where((country) => id.startsWith('${country.id}-'))
              .map((country) => country.id)
              .first;
      return CompetitionDefinition(
        id: id,
        name: item['name'] as String,
        kind: CompetitionKind.domesticCup,
        countryId: countryId,
        participantIds:
            list(item['participantIds'], 'cup.participantIds').cast<String>(),
        fixtures: list(item['openingFixtures'], 'cup.openingFixtures')
            .map((raw) => fixture(raw, 'cup.fixture'))
            .toList(growable: false),
      );
    }).toList(growable: false);
    final internationalItem = object(
      bundle['internationalClubCompetition'],
      'internationalClubCompetition',
    );
    final international = CompetitionDefinition(
      id: internationalItem['id'] as String,
      name: internationalItem['name'] as String,
      kind: CompetitionKind.internationalClub,
      participantIds: list(
        internationalItem['participantIds'],
        'international.participantIds',
      ).cast<String>(),
      fixtures: list(internationalItem['fixtures'], 'international.fixtures')
          .map((raw) => fixture(raw, 'international.fixture'))
          .toList(growable: false),
    );
    final world = WorldDefinition(
      contentVersion: metadata['releaseVersion'] as String,
      countries: List.unmodifiable(countries),
      clubs: List.unmodifiable(clubs),
      leagues: List.unmodifiable(leagues),
      domesticCups: List.unmodifiable(cups),
      internationalClubCompetition: international,
      nationalTeams: List.unmodifiable(nationalTeams),
    );
    return ContentCatalog(
      version: metadata['releaseVersion'] as String,
      matchSituations: List.unmodifiable(situations),
      careerEvents: List.unmodifiable(events),
      lifestyleItems: List.unmodifiable(items),
      world: world,
    );
  }

  final String version;
  final List<MatchSituationDefinition> matchSituations;
  final List<CareerEventDefinition> careerEvents;
  final List<LifestyleItemDefinition> lifestyleItems;
  final WorldDefinition world;

  Map<String, Object?> toJson() => {
        'version': version,
        'locales': supportedLocales,
        'matchSituations':
            matchSituations.map((value) => value.toJson()).toList(),
        'careerEvents': careerEvents.map((value) => value.toJson()).toList(),
        'lifestyleItems':
            lifestyleItems.map((value) => value.toJson()).toList(),
      };
}
