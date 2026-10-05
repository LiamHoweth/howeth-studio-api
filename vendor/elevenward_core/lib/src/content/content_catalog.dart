import '../model/enums.dart';
import '../world/world_generator.dart';
import '../world/world_models.dart';
import 'career_story_content.dart';
import 'content_models.dart';
import 'off_pitch_scenarios.dart';

ContentCatalog buildLaunchContent() => ContentCatalog(
      version: launchWorldVersion,
      matchSituations: _buildMatchSituations(),
      careerEvents: _buildCareerEvents(),
      lifestyleItems: _buildLifestyleItems(),
      world: buildLaunchWorld(),
    );

ContentCatalog buildLatestContent() {
  final previous = buildLaunchContent();
  return ContentCatalog(
      version: '2026.4.0',
      world: previous.world,
      matchSituations: previous.matchSituations,
      lifestyleItems: previous.lifestyleItems,
      careerEvents: [
        ...previous.careerEvents.map(improveEventConsequences),
        ...buildMentorArc()
      ]);
}

List<String> validateContentCatalog(ContentCatalog catalog) {
  final errors = <String>[];
  final ids = <String>{};
  final playerFacingEnglish = <String>{};
  void checkId(String id, String kind) {
    if (!ids.add(id)) errors.add('Duplicate $kind id: $id');
  }

  void checkText(LocalizedText text, String path, {bool unique = false}) {
    for (final locale in supportedLocales) {
      final value = text.values[locale];
      if (value == null || value.trim().isEmpty) {
        errors.add('$path is missing locale $locale');
      }
    }
    final english = text.values['en']?.trim() ?? '';
    if (RegExp(r'\[[a-z]+\]', caseSensitive: false).hasMatch(english)) {
      errors.add('$path contains an authoring marker');
    }
    if (unique && !playerFacingEnglish.add(english)) {
      errors.add('$path duplicates another English string');
    }
  }

  for (final situation in catalog.matchSituations) {
    checkId(situation.id, 'situation');
    checkText(situation.prompt, '${situation.id}.prompt', unique: true);
    if (situation.minuteFrom < 1 ||
        situation.minuteTo > 90 ||
        situation.minuteFrom > situation.minuteTo) {
      errors.add('${situation.id} has an invalid minute range');
    }
    if (situation.options.length != 3)
      errors.add('${situation.id} must have three choices');
    for (final option in situation.options) {
      checkText(option.title, '${situation.id}.${option.approach.name}');
      if (option.primaryAttributes.length != 2) {
        errors.add(
            '${situation.id}.${option.approach.name} needs two attributes');
      }
    }
  }
  for (final event in catalog.careerEvents) {
    checkId(event.id, 'event');
    checkText(event.title, '${event.id}.title', unique: true);
    checkText(event.body, '${event.id}.body');
    final minimumChoices = catalog.version == launchWorldVersion ? 3 : 2;
    if (event.choices.length < minimumChoices || event.choices.length > 5) {
      errors.add(
        '${event.id} needs between $minimumChoices and five choices',
      );
    }
    if (event.previousPerformances.isEmpty) {
      errors.add('${event.id} needs a previous-match performance trigger');
    }
    final choiceIds = <String>{};
    for (final choice in event.choices) {
      if (!choiceIds.add(choice.id)) {
        errors.add('${event.id} has duplicate choice id ${choice.id}');
      }
      checkText(choice.label, '${event.id}.${choice.id}');
    }
  }
  for (final item in catalog.lifestyleItems) {
    checkId(item.id, 'item');
    checkText(item.name, '${item.id}.name', unique: true);
    checkText(item.description, '${item.id}.description');
    if (item.price < 0) errors.add('${item.id} has a negative price');
  }
  final world = catalog.world;
  final worldIds = <String>{};
  for (final country in world.countries) {
    if (!worldIds.add(country.id)) {
      errors.add('Duplicate country id: ${country.id}');
    }
    for (final locale in supportedLocales) {
      if ((country.names[locale] ?? '').trim().isEmpty) {
        errors.add('${country.id} is missing localized name $locale');
      }
    }
    if (country.mapUnitCodes.isEmpty) {
      errors.add('${country.id} has no map-unit mapping');
    }
  }
  final mapCodes = <String>{};
  for (final country in world.countries) {
    for (final code in country.mapUnitCodes) {
      if (!mapCodes.add(code)) errors.add('Duplicate map-unit code: $code');
    }
  }
  final clubIds = <String>{};
  for (final club in world.clubs) {
    if (!clubIds.add(club.id)) errors.add('Duplicate club id: ${club.id}');
    if (!worldIds.contains(club.countryId)) {
      errors.add('${club.id} has unknown country ${club.countryId}');
    }
  }
  final leagueIds = <String>{};
  final fixtureIds = <String>{};
  void checkFixtures(
    String competitionId,
    Iterable<String> participants,
    List<Fixture> fixtures,
  ) {
    final participantIds = participants.toSet();
    for (final fixture in fixtures) {
      if (!fixtureIds.add(fixture.id)) {
        errors.add('Duplicate fixture id: ${fixture.id}');
      }
      if (fixture.competitionId != competitionId) {
        errors.add('${fixture.id} has the wrong competition id');
      }
      if (fixture.homeId == fixture.awayId ||
          !participantIds.contains(fixture.homeId) ||
          !participantIds.contains(fixture.awayId)) {
        errors.add('${fixture.id} has invalid participants');
      }
      if (fixture.matchweek < 1) {
        errors.add('${fixture.id} has an invalid matchweek');
      }
    }
  }

  for (final league in world.leagues) {
    if (!leagueIds.add(league.id)) {
      errors.add('Duplicate league id: ${league.id}');
    }
    if (league.clubIds.length != 10 || league.clubIds.toSet().length != 10) {
      errors.add('${league.id} must contain 10 unique clubs');
    }
    if (league.fixtures.length != 90 || league.matchweeks != 18) {
      errors.add('${league.id} must contain 90 fixtures over 18 matchweeks');
    }
    if (league.clubIds.any((clubId) => !clubIds.contains(clubId))) {
      errors.add('${league.id} contains an unknown club');
    }
    for (final clubId in league.clubIds) {
      final club = world.clubs.firstWhere((club) => club.id == clubId);
      if (club.countryId != league.countryId ||
          club.division != league.division) {
        errors.add('${league.id} contains a club from the wrong division');
      }
      final appearances = league.fixtures.where(
        (fixture) => fixture.homeId == clubId || fixture.awayId == clubId,
      );
      if (appearances.length != 18) {
        errors.add('$clubId must play 18 league fixtures in ${league.id}');
      }
    }
    checkFixtures(league.id, league.clubIds, league.fixtures);
  }
  for (final club in world.clubs) {
    final memberships = world.leagues.where(
      (league) => league.clubIds.contains(club.id),
    );
    if (memberships.length != 1) {
      errors.add('${club.id} must belong to exactly one league');
    }
  }
  for (final country in world.countries.where((country) => country.hasLeague)) {
    final countryLeagues = world.leagues
        .where((league) => league.countryId == country.id)
        .toList(growable: false);
    final divisions = countryLeagues.map((league) => league.division).toSet();
    if (countryLeagues.length != 2 ||
        !divisions.containsAll(DivisionLevel.values)) {
      errors.add('${country.id} needs linked first and second divisions');
    }
  }
  final cupIds = <String>{};
  for (final cup in world.domesticCups) {
    if (!cupIds.add(cup.id)) errors.add('Duplicate cup id: ${cup.id}');
    if (cup.participantIds.length != 20 ||
        cup.participantIds.toSet().length != 20) {
      errors.add('${cup.id} must contain 20 unique clubs');
    }
    if (cup.kind != CompetitionKind.domesticCup ||
        cup.countryId == null ||
        cup.participantIds.any(
          (clubId) =>
              !clubIds.contains(clubId) ||
              world.club(clubId).countryId != cup.countryId,
        )) {
      errors.add('${cup.id} has invalid domestic-cup membership');
    }
    checkFixtures(cup.id, cup.participantIds, cup.fixtures);
  }
  final nationalIds = <String>{};
  for (final team in world.nationalTeams) {
    if (!nationalIds.add(team.id)) {
      errors.add('Duplicate national-team id: ${team.id}');
    }
    if (!worldIds.contains(team.countryId) || team.id != team.countryId) {
      errors.add('${team.id} has an invalid country mapping');
    }
  }
  final international = world.internationalClubCompetition;
  if (international.participantIds.toSet().length !=
          international.participantIds.length ||
      international.participantIds.any((id) => !clubIds.contains(id))) {
    errors.add('${international.id} has invalid club membership');
  }
  checkFixtures(
    international.id,
    international.participantIds,
    international.fixtures,
  );
  if (catalog.version == launchWorldVersion) {
    if (world.nationalTeams.length != 48) {
      errors.add('Expanded world must contain 48 national teams');
    }
    if (world.countries.where((country) => country.hasLeague).length != 26 ||
        world.leagues.length != 52 ||
        world.clubs.length != 520 ||
        world.domesticCups.length != 26) {
      errors.add('Expanded world catalog counts are invalid');
    }
    if (world.internationalClubCompetition.participantIds.length != 32) {
      errors.add('World Champions Series must contain 32 clubs');
    }
    final ranks = world.countries
        .map((country) => country.leagueRank)
        .whereType<int>()
        .toSet();
    if (ranks.length != 25 ||
        !ranks.containsAll([for (var rank = 1; rank <= 25; rank++) rank])) {
      errors.add('IFFHS system ranks must be unique from 1 through 25');
    }
    for (final league in world.leagues) {
      if (league.systemRank != world.country(league.countryId).leagueRank) {
        errors.add('${league.id} does not match its immutable system rank');
      }
    }
  }
  return errors;
}

List<MatchSituationDefinition> _buildMatchSituations() {
  final situations = <MatchSituationDefinition>[];
  for (final position in PositionFamily.values) {
    for (var index = 0; index < 40; index++) {
      final zone = index % 4;
      final phase = (index ~/ 4) % 5;
      final matchState = index ~/ 20;
      situations.add(MatchSituationDefinition(
        id: 'match-${position.name}-${(index + 1).toString().padLeft(2, '0')}',
        position: position,
        archetypeTags: Archetype.values
            .where((value) => value.positionFamily == position)
            .toList(),
        minuteFrom: 8 + phase * 15,
        minuteTo: 20 + phase * 15,
        prompt: _situationPrompt(position, zone, phase, matchState),
        options: _situationOptions(position),
      ));
    }
  }
  return List.unmodifiable(situations);
}

LocalizedText _situationPrompt(
  PositionFamily position,
  int zone,
  int phase,
  int matchState,
) {
  final positionText = switch (position) {
    PositionFamily.striker => [
        'The back line parts and the final pass arrives',
        'La defensa se abre y llega el último pase',
        'A defesa se abre e o último passe chega',
        'La défense s’ouvre et la dernière passe arrive'
      ],
    PositionFamily.winger => [
        'The fullback is isolated and space opens outside',
        'El lateral queda aislado y aparece espacio por fuera',
        'O lateral fica isolado e surge espaço por fora',
        'Le latéral est isolé et l’espace s’ouvre à l’extérieur'
      ],
    PositionFamily.midfielder => [
        'The press breaks and the center of the pitch opens',
        'La presión cede y se abre el centro del campo',
        'A pressão quebra e o meio-campo se abre',
        'Le pressing cède et le centre du terrain s’ouvre'
      ],
    PositionFamily.defender => [
        'The runner turns toward goal with support arriving',
        'El atacante gira hacia la portería con apoyo',
        'O atacante gira para o gol com apoio',
        'L’attaquant se tourne vers le but avec du soutien'
      ],
  };
  const zones = [
    [
      'near the left channel.',
      'cerca del canal izquierdo.',
      'perto do corredor esquerdo.',
      'près du couloir gauche.'
    ],
    [
      'through the central lane.',
      'por el carril central.',
      'pelo corredor central.',
      'dans l’axe.'
    ],
    [
      'near the right touchline.',
      'cerca de la banda derecha.',
      'perto da lateral direita.',
      'près de la ligne droite.'
    ],
    [
      'as the shape is still recovering.',
      'mientras el bloque aún se recompone.',
      'enquanto o bloco ainda se recompõe.',
      'pendant que le bloc se replace.'
    ],
  ];
  const phases = [
    [
      'The match is still settling.',
      'El partido aún se está asentando.',
      'O jogo ainda está se ajustando.',
      'Le match se met encore en place.'
    ],
    [
      'The tempo is climbing.',
      'El ritmo está subiendo.',
      'O ritmo está aumentando.',
      'Le rythme s’accélère.'
    ],
    [
      'Neither side has control.',
      'Ningún equipo tiene el control.',
      'Nenhum dos lados tem o controle.',
      'Aucune équipe ne contrôle le match.'
    ],
    [
      'Fatigue is creating gaps.',
      'El cansancio está abriendo espacios.',
      'O cansaço está criando espaços.',
      'La fatigue crée des espaces.'
    ],
    [
      'The next action could decide it.',
      'La próxima acción puede decidirlo.',
      'A próxima jogada pode decidir tudo.',
      'La prochaine action peut être décisive.'
    ],
  ];
  const matchStates = [
    [
      'The score is level.',
      'El marcador está empatado.',
      'O placar está empatado.',
      'Le score est à égalité.'
    ],
    [
      'Your side needs the next goal.',
      'Tu equipo necesita el próximo gol.',
      'Seu time precisa do próximo gol.',
      'Votre équipe doit marquer le prochain but.'
    ],
  ];
  return LocalizedText({
    for (var locale = 0; locale < supportedLocales.length; locale++)
      supportedLocales[locale]:
          '${positionText[locale]} ${zones[zone][locale]} ${phases[phase][locale]} ${matchStates[matchState][locale]}',
  });
}

List<SituationOption> _situationOptions(PositionFamily position) {
  final attributes = switch (position) {
    PositionFamily.striker => [
        [PlayerAttribute.technique, PlayerAttribute.composure],
        [PlayerAttribute.finishing, PlayerAttribute.technique],
        [PlayerAttribute.finishing, PlayerAttribute.composure],
      ],
    PositionFamily.winger => [
        [PlayerAttribute.passing, PlayerAttribute.composure],
        [PlayerAttribute.pace, PlayerAttribute.technique],
        [PlayerAttribute.technique, PlayerAttribute.finishing],
      ],
    PositionFamily.midfielder => [
        [PlayerAttribute.passing, PlayerAttribute.composure],
        [PlayerAttribute.technique, PlayerAttribute.passing],
        [PlayerAttribute.stamina, PlayerAttribute.technique],
      ],
    PositionFamily.defender => [
        [PlayerAttribute.defending, PlayerAttribute.composure],
        [PlayerAttribute.defending, PlayerAttribute.strength],
        [PlayerAttribute.pace, PlayerAttribute.defending],
      ],
  };
  final labels = switch (position) {
    PositionFamily.striker => [
        _text('Lay it off', 'Descargar el balón', 'Tocar de lado',
            'Remettre le ballon'),
        _text('Create a shooting lane', 'Crear un ángulo de tiro',
            'Criar espaço para finalizar', 'Créer un angle de tir'),
        _text('Strike first time', 'Rematar de primera',
            'Finalizar de primeira', 'Frapper en première intention'),
      ],
    PositionFamily.winger => [
        _text('Recycle possession', 'Reiniciar la jugada', 'Reciclar a posse',
            'Recycler la possession'),
        _text('Attack the outside', 'Atacar por fuera', 'Atacar por fora',
            'Déborder à l’extérieur'),
        _text('Cut inside at speed', 'Recortar hacia dentro',
            'Cortar para dentro', 'Repiquer à pleine vitesse'),
      ],
    PositionFamily.midfielder => [
        _text('Keep the rhythm', 'Mantener el ritmo', 'Manter o ritmo',
            'Garder le rythme'),
        _text('Split the lines', 'Romper las líneas', 'Quebrar as linhas',
            'Casser les lignes'),
        _text('Carry through pressure', 'Conducir bajo presión',
            'Conduzir sob pressão', 'Porter sous pression'),
      ],
    PositionFamily.defender => [
        _text('Delay the runner', 'Frenar al atacante', 'Atrasar o atacante',
            'Retarder l’attaquant'),
        _text('Step in and challenge', 'Entrar al duelo', 'Entrar no duelo',
            'Intervenir dans le duel'),
        _text('Commit to the recovery', 'Apostar por la recuperación',
            'Apostar na recuperação', 'S’engager dans le repli'),
      ],
  };
  return List.generate(
      3,
      (index) => SituationOption(
            approach: SpotlightApproach.values[index],
            title: labels[index],
            primaryAttributes: attributes[index],
            trustRisk: [-1, -2, -4][index],
            ratingUpside: [0.4, 0.8, 1.3][index],
          ));
}

List<CareerEventDefinition> _buildCareerEvents() => buildOffPitchScenarios();

List<LifestyleItemDefinition> _buildLifestyleItems() {
  final items = <LifestyleItemDefinition>[];
  for (final category in LifestyleCategory.values) {
    for (var index = 0; index < 30; index++) {
      final rarity = ItemRarity.values[(index ~/ 6).clamp(0, 4)];
      final tier = index + 1;
      items.add(LifestyleItemDefinition(
        id: 'life-${category.name}-${tier.toString().padLeft(2, '0')}',
        category: category,
        rarity: rarity,
        name: _itemName(category, index),
        description: _itemDescription(category, index),
        price: (250 + tier * tier * 175) * (rarity.index + 1),
        reputationEffect:
            category == LifestyleCategory.style ? rarity.index : 0,
        wellnessEffect:
            category == LifestyleCategory.wellness ? rarity.index + 1 : 0,
      ));
    }
  }
  return List.unmodifiable(items);
}

LocalizedText _itemName(LifestyleCategory category, int index) {
  final labels = switch (category) {
    LifestyleCategory.home => [
        'Haven Residence',
        'Residencia Refugio',
        'Residência Refúgio',
        'Résidence Havre'
      ],
    LifestyleCategory.transportation => [
        'Wayfinder',
        'Viajero',
        'Desbravador',
        'Éclaireur'
      ],
    LifestyleCategory.style => [
        'Touchline Collection',
        'Colección de Banda',
        'Coleção da Lateral',
        'Collection Ligne de Touche'
      ],
    LifestyleCategory.wellness => [
        'Recovery Studio',
        'Estudio de Recuperación',
        'Estúdio de Recuperação',
        'Studio de Récupération'
      ],
  };
  const qualities = [
    ['Quiet', 'Tranquilo', 'Tranquilo', 'Paisible'],
    ['Open', 'Abierto', 'Aberto', 'Ouvert'],
    ['City', 'Urbano', 'Urbano', 'Urbain'],
    ['Garden', 'Jardín', 'Jardim', 'Jardin'],
    ['Summit', 'Cumbre', 'Cume', 'Sommet'],
    ['Legacy', 'Legado', 'Legado', 'Héritage'],
  ];
  const editions = [
    ['Base', 'Base', 'Base', 'Essentiel'],
    ['Select', 'Selecto', 'Seleto', 'Sélection'],
    ['Signature', 'Distinción', 'Assinatura', 'Signature'],
    ['Premier', 'Premier', 'Premier', 'Premier'],
    ['Grand', 'Gran', 'Grand', 'Grand'],
  ];
  return LocalizedText({
    for (var locale = 0; locale < supportedLocales.length; locale++)
      supportedLocales[locale]:
          '${qualities[index % 6][locale]} ${labels[locale]} ${editions[index ~/ 6][locale]}',
  });
}

LocalizedText _itemDescription(LifestyleCategory category, int index) {
  final values = switch (category) {
    LifestyleCategory.home => [
        'A private place to reset between fixtures.',
        'Un lugar privado para descansar entre partidos.',
        'Um lugar privado para descansar entre jogos.',
        'Un lieu privé pour récupérer entre les matchs.'
      ],
    LifestyleCategory.transportation => [
        'Reliable movement with a little personality.',
        'Movilidad fiable con algo de personalidad.',
        'Mobilidade confiável com personalidade.',
        'Des déplacements fiables avec du caractère.'
      ],
    LifestyleCategory.style => [
        'A considered look for matchday and beyond.',
        'Un estilo cuidado para el partido y más allá.',
        'Um visual pensado para o jogo e além.',
        'Un style soigné pour les jours de match.'
      ],
    LifestyleCategory.wellness => [
        'A routine built around sustainable performance.',
        'Una rutina pensada para rendir a largo plazo.',
        'Uma rotina para desempenho sustentável.',
        'Une routine pensée pour durer.'
      ],
  };
  const details = [
    [
      'Built for a steady first step.',
      'Pensado para un primer paso estable.',
      'Feito para um primeiro passo seguro.',
      'Pensé pour un premier pas solide.'
    ],
    [
      'A practical upgrade for a growing career.',
      'Una mejora práctica para una carrera en ascenso.',
      'Uma melhoria prática para uma carreira em ascensão.',
      'Une amélioration pratique pour une carrière en plein essor.'
    ],
    [
      'Balances comfort with a visible sense of progress.',
      'Equilibra comodidad y una clara sensación de avance.',
      'Equilibra conforto e uma clara sensação de progresso.',
      'Équilibre confort et progression visible.'
    ],
    [
      'A refined choice for established professionals.',
      'Una opción refinada para profesionales consolidados.',
      'Uma escolha refinada para profissionais estabelecidos.',
      'Un choix raffiné pour les professionnels confirmés.'
    ],
    [
      'A rare statement earned late in a career.',
      'Una pieza excepcional ganada al final de la carrera.',
      'Uma peça rara conquistada no fim da carreira.',
      'Une pièce rare gagnée en fin de carrière.'
    ],
  ];
  return LocalizedText({
    for (var locale = 0; locale < supportedLocales.length; locale++)
      supportedLocales[locale]:
          '${values[locale]} ${details[index ~/ 6][locale]}',
  });
}

LocalizedText _text(String en, String es, String ptBr, String fr) =>
    LocalizedText({'en': en, 'es': es, 'pt-BR': ptBr, 'fr': fr});
