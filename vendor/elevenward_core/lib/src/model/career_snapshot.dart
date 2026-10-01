import 'dart:convert';

import '../world/world_generator.dart';
import '../world/world_models.dart';
import 'career_features.dart';
import 'career_progress.dart';
import 'career_types.dart';
import 'enums.dart';
import 'json_helpers.dart';
import 'player_state.dart';

/// Complete durable state for one offline career slot.
final class CareerSnapshot {
  const CareerSnapshot({
    required this.careerId,
    required this.schemaVersion,
    required this.rulesVersion,
    required this.contentVersion,
    required this.seed,
    required this.revision,
    required this.updatedAt,
    required this.season,
    required this.week,
    required this.clubId,
    required this.clubName,
    required this.points,
    required this.player,
    this.difficulty = Difficulty.professional,
    this.phase = CareerPhase.inSeason,
    this.wellness = 75,
    this.relationships = const RelationshipState(),
    this.contract = const ContractState(),
    this.ownedItemIds = const [],
    this.equippedItemIds = const {},
    this.seasonHistory = const [],
    this.retired = false,
    this.legacyScore = 0,
    this.world = const CareerWorldState(
      season: 1,
      leagueParticipants: {},
      leagueRecords: {},
    ),
    this.seasonPerformance = const SeasonPerformance(),
    this.activeAgentId = 'agent-independent',
    this.sponsorIds = const [],
    this.sponsorContracts = const [],
    this.resolvedEventIds = const [],
    this.nationalTeam = const NationalTeamCareerState(),
    this.developmentProgress = const {},
    this.boostIdsUsed = const [],
    this.newsFeed = const [],
    this.roleStats = const RoleStats(),
    this.matchJournal = const [],
    this.decisionJournal = const [],
    this.storyFlags = const {},
    this.careerGoal,
    this.activeLoan,
    this.pendingEventId,
    this.transferRequest,
    this.transferRequestTrustPenaltySeason,
  });

  factory CareerSnapshot.newCareer({
    String careerId = '8f260daa-b42a-4b76-9e88-1a11ca0d79b4',
    int seed = 110319,
    DateTime? updatedAt,
    String clubId = 'england-northstar-athletic',
    String clubName = 'Northstar Athletic',
    String contentVersion = '2026.4.0',
    PlayerState? player,
    Difficulty difficulty = Difficulty.professional,
    WorldDefinition? worldDefinition,
  }) {
    return CareerSnapshot(
      careerId: careerId,
      schemaVersion: currentSchemaVersion,
      rulesVersion: currentRulesVersion,
      contentVersion: contentVersion,
      seed: seed,
      revision: 0,
      updatedAt: updatedAt ?? DateTime.utc(2026, 9, 3),
      season: 1,
      week: 1,
      clubId: clubId,
      clubName: clubName,
      points: 0,
      player: player ?? PlayerState.developmentStriker(),
      difficulty: difficulty,
      contract: ContractState(clubId: clubId),
      world: CareerWorldState.initial(worldDefinition),
    );
  }

  factory CareerSnapshot.fromJson(Map<String, Object?> json) {
    final migrated = _migrateSnapshot(json);
    return CareerSnapshot(
      careerId: jsonString(migrated, 'careerId'),
      schemaVersion: jsonInt(migrated, 'schemaVersion'),
      rulesVersion: jsonString(migrated, 'rulesVersion'),
      contentVersion: jsonString(migrated, 'contentVersion'),
      seed: jsonInt(migrated, 'seed'),
      revision: jsonInt(migrated, 'revision'),
      updatedAt: DateTime.parse(jsonString(migrated, 'updatedAt')).toUtc(),
      season: jsonInt(migrated, 'season'),
      week: jsonInt(migrated, 'week'),
      clubId: jsonString(migrated, 'clubId'),
      clubName: jsonString(migrated, 'clubName'),
      points: jsonInt(migrated, 'points'),
      player: PlayerState.fromJson(jsonObject(migrated['player'], 'player')),
      difficulty: enumByName(
        Difficulty.values,
        migrated['difficulty'] ?? Difficulty.professional.name,
        'difficulty',
      ),
      phase: enumByName(
        CareerPhase.values,
        migrated['phase'] ?? CareerPhase.inSeason.name,
        'phase',
      ),
      wellness: migrated['wellness'] as int? ?? 75,
      relationships: migrated['relationships'] is Map<String, Object?>
          ? RelationshipState.fromJson(
              jsonObject(migrated['relationships'], 'relationships'),
            )
          : const RelationshipState(),
      contract: migrated['contract'] is Map<String, Object?>
          ? ContractState.fromJson(
              jsonObject(migrated['contract'], 'contract'),
            )
          : ContractState(clubId: jsonString(migrated, 'clubId')),
      ownedItemIds:
          (migrated['ownedItemIds'] as List<Object?>?)?.cast<String>() ??
              const [],
      equippedItemIds:
          (migrated['equippedItemIds'] as Map<String, Object?>? ?? const {})
              .map((key, value) => MapEntry(key, value as String)),
      seasonHistory: (migrated['seasonHistory'] as List<Object?>? ?? const [])
          .map(
            (value) => SeasonSummary.fromJson(
              jsonObject(value, 'seasonHistory entry'),
            ),
          )
          .toList(growable: false),
      retired: migrated['retired'] as bool? ?? false,
      legacyScore: migrated['legacyScore'] as int? ?? 0,
      world: migrated['world'] is Map<String, Object?>
          ? CareerWorldState.fromJson(jsonObject(migrated['world'], 'world'))
          : CareerWorldState.initial(),
      seasonPerformance: migrated['seasonPerformance'] is Map<String, Object?>
          ? SeasonPerformance.fromJson(
              jsonObject(migrated['seasonPerformance'], 'seasonPerformance'),
            )
          : const SeasonPerformance(),
      activeAgentId:
          migrated['activeAgentId'] as String? ?? 'agent-independent',
      sponsorIds: (migrated['sponsorIds'] as List<Object?>?)?.cast<String>() ??
          const [],
      sponsorContracts:
          (migrated['sponsorContracts'] as List<Object?>? ?? const [])
              .map(
                (value) => SponsorContract.fromJson(
                  (value as Map).cast<String, Object?>(),
                ),
              )
              .toList(growable: false),
      resolvedEventIds:
          (migrated['resolvedEventIds'] as List<Object?>?)?.cast<String>() ??
              const [],
      nationalTeam: migrated['nationalTeam'] is Map<String, Object?>
          ? NationalTeamCareerState.fromJson(
              jsonObject(migrated['nationalTeam'], 'nationalTeam'),
            )
          : const NationalTeamCareerState(),
      developmentProgress:
          (migrated['developmentProgress'] as Map<String, Object?>? ?? const {})
              .map(
        (key, value) => MapEntry(
          enumByName(PlayerAttribute.values, key, key),
          _developmentRemainder(value, key),
        ),
      ),
      boostIdsUsed:
          (migrated['boostIdsUsed'] as List<Object?>?)?.cast<String>() ??
              const [],
      newsFeed: (migrated['newsFeed'] as List<Object?>? ?? const [])
          .map(
            (value) => CareerNewsItem.fromJson(
              (value as Map).cast<String, Object?>(),
            ),
          )
          .toList(growable: false),
      roleStats: RoleStats.fromJson(
          (migrated['roleStats'] as Map? ?? {}).cast<String, Object?>()),
      matchJournal: (migrated['matchJournal'] as List? ?? [])
          .map((entry) => MatchJournalEntry.fromJson(
              (entry as Map).cast<String, Object?>()))
          .take(40)
          .toList(growable: false),
      decisionJournal: (migrated['decisionJournal'] as List? ?? [])
          .map((entry) => DecisionJournalEntry.fromJson(
              (entry as Map).cast<String, Object?>()))
          .take(40)
          .toList(growable: false),
      storyFlags: (migrated['storyFlags'] as Map? ?? {}).cast<String, String>(),
      careerGoal: migrated['careerGoal'] is Map
          ? CareerGoal.fromJson(
              (migrated['careerGoal'] as Map).cast<String, Object?>())
          : null,
      activeLoan: migrated['activeLoan'] is Map
          ? LoanState.fromJson(
              (migrated['activeLoan'] as Map).cast<String, Object?>())
          : null,
      pendingEventId: migrated['pendingEventId'] as String?,
      transferRequest: migrated['transferRequest'] is Map
          ? TransferRequest.fromJson(
              (migrated['transferRequest'] as Map).cast<String, Object?>(),
            )
          : null,
      transferRequestTrustPenaltySeason:
          migrated['transferRequestTrustPenaltySeason'] as int?,
    );
  }

  factory CareerSnapshot.decode(String source) {
    final decoded = jsonDecode(source);
    return CareerSnapshot.fromJson(jsonObject(decoded, 'snapshot'));
  }

  static const currentSchemaVersion = 14;
  static const currentRulesVersion = '2026.5';

  bool get usesExpandedLifeRules =>
      rulesVersion == '2026.2' ||
      rulesVersion == '2026.3' ||
      rulesVersion == '2026.4' ||
      rulesVersion == currentRulesVersion;

  bool get usesModernCareerRules => rulesVersion == '2026.5';

  final RoleStats roleStats;
  final List<MatchJournalEntry> matchJournal;
  final List<DecisionJournalEntry> decisionJournal;
  final Map<String, String> storyFlags;
  final CareerGoal? careerGoal;
  final LoanState? activeLoan;
  final String? pendingEventId;
  final String careerId;
  final int schemaVersion;
  final String rulesVersion;
  final String contentVersion;
  final int seed;
  final int revision;
  final DateTime updatedAt;
  final int season;
  final int week;
  final String clubId;
  final String clubName;
  final int points;
  final PlayerState player;
  final Difficulty difficulty;
  final CareerPhase phase;
  final int wellness;
  final RelationshipState relationships;
  final ContractState contract;
  final List<String> ownedItemIds;
  final Map<String, String> equippedItemIds;
  final List<SeasonSummary> seasonHistory;
  final bool retired;
  final int legacyScore;
  final CareerWorldState world;
  final SeasonPerformance seasonPerformance;
  final String activeAgentId;
  final List<String> sponsorIds;
  final List<SponsorContract> sponsorContracts;
  final List<String> resolvedEventIds;
  final NationalTeamCareerState nationalTeam;
  final Map<PlayerAttribute, double> developmentProgress;
  final List<String> boostIdsUsed;
  final List<CareerNewsItem> newsFeed;
  final TransferRequest? transferRequest;
  final int? transferRequestTrustPenaltySeason;

  CareerSnapshot copyWith({
    RoleStats? roleStats,
    List<MatchJournalEntry>? matchJournal,
    List<DecisionJournalEntry>? decisionJournal,
    Map<String, String>? storyFlags,
    CareerGoal? careerGoal,
    LoanState? activeLoan,
    String? pendingEventId,
    bool clearPendingEvent = false,
    bool clearCareerGoal = false,
    bool clearActiveLoan = false,
    int? seed,
    int? revision,
    DateTime? updatedAt,
    int? season,
    int? week,
    String? clubId,
    String? clubName,
    int? points,
    PlayerState? player,
    Difficulty? difficulty,
    CareerPhase? phase,
    int? wellness,
    RelationshipState? relationships,
    ContractState? contract,
    List<String>? ownedItemIds,
    Map<String, String>? equippedItemIds,
    List<SeasonSummary>? seasonHistory,
    bool? retired,
    int? legacyScore,
    CareerWorldState? world,
    SeasonPerformance? seasonPerformance,
    String? activeAgentId,
    List<String>? sponsorIds,
    List<SponsorContract>? sponsorContracts,
    List<String>? resolvedEventIds,
    NationalTeamCareerState? nationalTeam,
    Map<PlayerAttribute, double>? developmentProgress,
    List<String>? boostIdsUsed,
    List<CareerNewsItem>? newsFeed,
    TransferRequest? transferRequest,
    int? transferRequestTrustPenaltySeason,
    bool clearTransferRequest = false,
    bool clearTransferRequestTrustPenaltySeason = false,
  }) =>
      CareerSnapshot(
        roleStats: roleStats ?? this.roleStats,
        matchJournal: matchJournal ?? this.matchJournal,
        decisionJournal: decisionJournal ?? this.decisionJournal,
        storyFlags: storyFlags ?? this.storyFlags,
        careerGoal: clearCareerGoal ? null : careerGoal ?? this.careerGoal,
        activeLoan: clearActiveLoan ? null : activeLoan ?? this.activeLoan,
        pendingEventId:
            clearPendingEvent ? null : pendingEventId ?? this.pendingEventId,
        careerId: careerId,
        schemaVersion: schemaVersion,
        rulesVersion: rulesVersion,
        contentVersion: contentVersion,
        seed: seed ?? this.seed,
        revision: revision ?? this.revision,
        updatedAt: updatedAt ?? this.updatedAt,
        season: season ?? this.season,
        week: week ?? this.week,
        clubId: clubId ?? this.clubId,
        clubName: clubName ?? this.clubName,
        points: points ?? this.points,
        player: player ?? this.player,
        difficulty: difficulty ?? this.difficulty,
        phase: phase ?? this.phase,
        wellness: wellness ?? this.wellness,
        relationships: relationships ?? this.relationships,
        contract: contract ?? this.contract,
        ownedItemIds: ownedItemIds ?? this.ownedItemIds,
        equippedItemIds: equippedItemIds ?? this.equippedItemIds,
        seasonHistory: seasonHistory ?? this.seasonHistory,
        retired: retired ?? this.retired,
        legacyScore: legacyScore ?? this.legacyScore,
        world: world ?? this.world,
        seasonPerformance: seasonPerformance ?? this.seasonPerformance,
        activeAgentId: activeAgentId ?? this.activeAgentId,
        sponsorIds: sponsorIds ?? this.sponsorIds,
        sponsorContracts: sponsorContracts ?? this.sponsorContracts,
        resolvedEventIds: resolvedEventIds ?? this.resolvedEventIds,
        nationalTeam: nationalTeam ?? this.nationalTeam,
        developmentProgress: developmentProgress ?? this.developmentProgress,
        boostIdsUsed: boostIdsUsed ?? this.boostIdsUsed,
        newsFeed: newsFeed ?? this.newsFeed,
        transferRequest: clearTransferRequest
            ? null
            : transferRequest ?? this.transferRequest,
        transferRequestTrustPenaltySeason:
            clearTransferRequestTrustPenaltySeason
                ? null
                : transferRequestTrustPenaltySeason ??
                    this.transferRequestTrustPenaltySeason,
      );

  String encode() => jsonEncode(toJson());

  Map<String, Object?> toJson() => {
        'roleStats': roleStats.toJson(),
        'matchJournal': matchJournal.map((entry) => entry.toJson()).toList(),
        'decisionJournal':
            decisionJournal.map((entry) => entry.toJson()).toList(),
        'storyFlags': storyFlags,
        'careerGoal': careerGoal?.toJson(),
        'activeLoan': activeLoan?.toJson(),
        'pendingEventId': pendingEventId,
        'careerId': careerId,
        'schemaVersion': schemaVersion,
        'rulesVersion': rulesVersion,
        'contentVersion': contentVersion,
        'seed': seed,
        'revision': revision,
        'updatedAt': updatedAt.toUtc().toIso8601String(),
        'season': season,
        'week': week,
        'clubId': clubId,
        'clubName': clubName,
        'points': points,
        'player': player.toJson(),
        'difficulty': difficulty.name,
        'phase': phase.name,
        'wellness': wellness,
        'relationships': relationships.toJson(),
        'contract': contract.toJson(),
        'ownedItemIds': ownedItemIds,
        'equippedItemIds': equippedItemIds,
        'seasonHistory': seasonHistory.map((value) => value.toJson()).toList(),
        'retired': retired,
        'legacyScore': legacyScore,
        'world': world.toJson(),
        'seasonPerformance': seasonPerformance.toJson(),
        'activeAgentId': activeAgentId,
        'sponsorIds': sponsorIds,
        'sponsorContracts':
            sponsorContracts.map((contract) => contract.toJson()).toList(),
        'resolvedEventIds': resolvedEventIds,
        'nationalTeam': nationalTeam.toJson(),
        'developmentProgress': {
          for (final entry in developmentProgress.entries)
            entry.key.name: entry.value,
        },
        'boostIdsUsed': boostIdsUsed,
        'newsFeed': newsFeed.map((item) => item.toJson()).toList(),
        'transferRequest': transferRequest?.toJson(),
        'transferRequestTrustPenaltySeason': transferRequestTrustPenaltySeason,
      };

  static Map<String, Object?> _migrateSnapshot(Map<String, Object?> source) {
    final migrated = Map<String, Object?>.from(source);
    final version = migrated['schemaVersion'] as int? ?? 1;
    if (version < 1 || version > currentSchemaVersion) {
      throw FormatException('Unsupported career schema version $version.');
    }
    // Schemas 1–2 did not persist the world fixture ledger. Reconstructing a
    // midseason table would silently invent already-played cup and league
    // results, so only the lossless opening boundary is accepted. The local
    // recovery journal can then fall back to another readable snapshot.
    if (version < 3 &&
        ((migrated['season'] as int? ?? 1) != 1 ||
            (migrated['week'] as int? ?? 1) != 1)) {
      throw const FormatException(
        'Legacy midseason career cannot be reconstructed without changing results.',
      );
    }
    if (version < 2) {
      migrated.putIfAbsent('difficulty', () => Difficulty.professional.name);
      migrated.putIfAbsent('phase', () => CareerPhase.inSeason.name);
      migrated.putIfAbsent('wellness', () => 75);
    }
    if (version < 3) {
      migrated.putIfAbsent(
          'relationships', () => const RelationshipState().toJson());
      migrated.putIfAbsent(
        'contract',
        () => ContractState(
          clubId: migrated['clubId'] as String? ?? 'england-northstar-athletic',
        ).toJson(),
      );
      migrated.putIfAbsent('ownedItemIds', () => <String>[]);
      migrated.putIfAbsent('seasonHistory', () => <Object?>[]);
      migrated.putIfAbsent('retired', () => false);
      migrated.putIfAbsent('legacyScore', () => 0);
      migrated.putIfAbsent(
        'world',
        () => CareerWorldState.initial(buildLegacyLaunchWorld()).toJson(),
      );
      migrated.putIfAbsent(
        'seasonPerformance',
        () => const SeasonPerformance().toJson(),
      );
      migrated.putIfAbsent('activeAgentId', () => 'agent-independent');
      migrated.putIfAbsent('sponsorIds', () => <String>[]);
      migrated.putIfAbsent('resolvedEventIds', () => <String>[]);
    }
    if (version < 4) {
      final clubId = migrated['clubId'] as String?;
      final contract = migrated['contract'];
      if (clubId != null && contract is Map) {
        final corrected = contract.cast<String, Object?>();
        if (corrected['clubId'] != clubId &&
            corrected['clubId'] == 'england-northstar-athletic') {
          migrated['contract'] = {...corrected, 'clubId': clubId};
        }
      }
    }
    if (version < 5) {
      migrated.putIfAbsent('equippedItemIds', () => <String, String>{});
    }
    if (version < 6) {
      final contract = migrated['contract'];
      if (contract is Map) {
        migrated['contract'] = {
          ...contract.cast<String, Object?>(),
          'roleSatisfaction': 60,
        };
      }
    }
    if (version < 11) {
      migrated.putIfAbsent('newsFeed', () => <Object?>[]);
    }
    if (version < 7) {
      final ids =
          (migrated['sponsorIds'] as List<Object?>? ?? const []).cast<String>();
      migrated['sponsorContracts'] = ids
          .map(
            (id) => SponsorContract(
              id: id,
              weeksRemaining: 8,
              weeklyPayout: 150,
              obligation: 'maintain-reputation-35',
            ).toJson(),
          )
          .toList();
    }
    if (version < 8) {
      migrated.putIfAbsent(
        'nationalTeam',
        () => const NationalTeamCareerState().toJson(),
      );
    }
    if (version < 10) {
      migrated.putIfAbsent(
        'developmentProgress',
        () => <String, double>{},
      );
      migrated.putIfAbsent('boostIdsUsed', () => <String>[]);
    }
    if (version < 13) {
      migrated.putIfAbsent('transferRequest', () => null);
      migrated.putIfAbsent('transferRequestTrustPenaltySeason', () => null);
    }
    if (version < 14) {
      migrated.putIfAbsent('roleStats', () => <String, Object?>{});
      migrated.putIfAbsent('matchJournal', () => <Object?>[]);
      migrated.putIfAbsent('decisionJournal', () => <Object?>[]);
      migrated.putIfAbsent('storyFlags', () => <String, String>{});
      migrated.putIfAbsent('careerGoal', () => null);
      migrated.putIfAbsent('activeLoan', () => null);
      migrated.putIfAbsent('pendingEventId', () => null);
    }
    migrated['schemaVersion'] = currentSchemaVersion;
    return migrated;
  }

  static double _developmentRemainder(Object? value, String attribute) {
    if (value is! num) {
      throw FormatException(
        'Development progress for $attribute must be numeric.',
      );
    }
    final result = value.toDouble();
    if (!result.isFinite || result < 0 || result >= 1) {
      throw FormatException(
        'Development progress for $attribute must be between 0 and 1.',
      );
    }
    return result;
  }
}
