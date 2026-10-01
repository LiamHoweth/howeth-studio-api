import 'attributes.dart';
import 'enums.dart';
import 'json_helpers.dart';
import 'overall_rating.dart';

final class PlayerState {
  const PlayerState({
    required this.id,
    required this.name,
    required this.age,
    required this.position,
    required this.archetype,
    required this.attributes,
    required this.fitness,
    required this.form,
    required this.managerTrust,
    required this.reputation,
    required this.money,
    required this.appearances,
    required this.goals,
    required this.assists,
    required this.nationalTeamId,
    this.portraitId,
  });

  factory PlayerState.developmentStriker() => PlayerState.newCareer(
        id: 'player-mika-vale',
        name: 'Mika Vale',
        archetype: Archetype.poacher,
      );

  factory PlayerState.newCareer({
    required String id,
    required String name,
    required Archetype archetype,
    String nationalTeamId = 'united-states',
    String? portraitId,
  }) =>
      PlayerState(
        id: id,
        name: name,
        age: 17,
        position: archetype.positionFamily,
        archetype: archetype,
        attributes: PlayerAttributes.forArchetype(archetype),
        fitness: 82,
        form: 62,
        managerTrust: 68,
        reputation: 12,
        money: 2400,
        appearances: 0,
        goals: 0,
        assists: 0,
        nationalTeamId: nationalTeamId,
        portraitId: portraitId,
      );

  factory PlayerState.fromJson(Map<String, Object?> json) => PlayerState(
        id: jsonString(json, 'id'),
        name: jsonString(json, 'name'),
        age: jsonInt(json, 'age'),
        position:
            enumByName(PositionFamily.values, json['position'], 'position'),
        archetype: enumByName(Archetype.values, json['archetype'], 'archetype'),
        attributes: PlayerAttributes.fromJson(
          jsonObject(json['attributes'], 'attributes'),
        ),
        fitness: jsonInt(json, 'fitness'),
        form: jsonInt(json, 'form'),
        managerTrust: jsonInt(json, 'managerTrust'),
        reputation: jsonInt(json, 'reputation'),
        money: jsonInt(json, 'money'),
        appearances: jsonInt(json, 'appearances'),
        goals: jsonInt(json, 'goals'),
        assists: jsonInt(json, 'assists'),
        nationalTeamId: json['nationalTeamId'] as String? ?? 'united-states',
        portraitId: json['portraitId'] as String?,
      );

  final String id;
  final String name;
  final int age;
  final PositionFamily position;
  final Archetype archetype;
  final PlayerAttributes attributes;
  final int fitness;
  final int form;
  final int managerTrust;
  final int reputation;
  final int money;
  final int appearances;
  final int goals;
  final int assists;
  final String nationalTeamId;
  final String? portraitId;

  int get overall => calculateOverall(attributes, position);

  PlayerState copyWith({
    int? age,
    PlayerAttributes? attributes,
    int? fitness,
    int? form,
    int? managerTrust,
    int? reputation,
    int? money,
    int? appearances,
    int? goals,
    int? assists,
  }) {
    return PlayerState(
      id: id,
      name: name,
      age: age ?? this.age,
      position: position,
      archetype: archetype,
      attributes: attributes ?? this.attributes,
      fitness: fitness ?? this.fitness,
      form: form ?? this.form,
      managerTrust: managerTrust ?? this.managerTrust,
      reputation: reputation ?? this.reputation,
      money: money ?? this.money,
      appearances: appearances ?? this.appearances,
      goals: goals ?? this.goals,
      assists: assists ?? this.assists,
      nationalTeamId: nationalTeamId,
      portraitId: portraitId,
    );
  }

  Map<String, Object?> toJson() => {
        'id': id,
        'name': name,
        'age': age,
        'position': position.name,
        'archetype': archetype.name,
        'attributes': attributes.toJson(),
        'fitness': fitness,
        'form': form,
        'managerTrust': managerTrust,
        'reputation': reputation,
        'money': money,
        'appearances': appearances,
        'goals': goals,
        'assists': assists,
        'nationalTeamId': nationalTeamId,
        if (portraitId != null) 'portraitId': portraitId,
      };
}
