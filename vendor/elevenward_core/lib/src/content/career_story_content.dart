import 'content_models.dart';

LocalizedText _text(String en, String es, String pt, String fr) =>
    LocalizedText({'en': en, 'es': es, 'pt-BR': pt, 'fr': fr});
EventChoiceDefinition _choice(
        String id, LocalizedText label, LocalizedText outcome,
        {int trust = 0,
        int reputation = 0,
        int wellness = 0,
        int fitness = 0}) =>
    EventChoiceDefinition(
        id: id,
        label: label,
        trustDelta: trust,
        reputationDelta: reputation,
        moneyDelta: 0,
        wellnessDelta: wellness,
        fitnessDelta: fitness,
        outcome: outcome);

/// A complete three-part arc. The third part is determined by the first choice.
List<CareerEventDefinition> buildMentorArc() => [
      CareerEventDefinition(
          id: 'mentor-01-introduction',
          category: CareerEventCategory.teammate,
          title: _text(
              'Jonah Reed: the invitation',
              'Jonah Reed: la invitación',
              'Jonah Reed: o convite',
              'Jonah Reed : l’invitation'),
          body: _text(
              'Veteran Jonah Reed invites you to work with academy rival Ari Sol. Sharing your methods costs recovery time, but could build trust.',
              'El veterano Jonah Reed te invita a trabajar con Ari Sol, tu rival de la cantera. Compartir métodos cuesta descanso, pero puede crear confianza.',
              'O veterano Jonah Reed convida você a treinar com Ari Sol, rival da base. Compartilhar métodos custa recuperação, mas pode criar confiança.',
              'Le vétéran Jonah Reed vous invite à travailler avec Ari Sol, votre rival du centre. Partager vos méthodes coûte du repos, mais crée de la confiance.'),
          choices: [
            _choice(
                'share',
                _text('Share the session', 'Compartir la sesión',
                    'Compartilhar a sessão', 'Partager la séance'),
                _text(
                    'Jonah and Ari appreciate your openness. Teammate trust rises; fitness falls by 2.',
                    'Jonah y Ari valoran tu apertura. Sube la confianza; pierdes 2 de forma física.',
                    'Jonah e Ari valorizam sua abertura. A confiança aumenta; o condicionamento cai 2.',
                    'Jonah et Ari apprécient votre ouverture. La confiance augmente ; la forme baisse de 2.'),
                trust: 4,
                fitness: -2),
            _choice(
                'solo',
                _text('Keep your own program', 'Seguir tu programa',
                    'Manter seu programa', 'Garder votre programme'),
                _text(
                    'You keep your recovery time. Ari now sees you as a sporting rival.',
                    'Conservas tu descanso. Ari te ve como rival deportivo.',
                    'Você mantém sua recuperação. Ari vê você como rival esportivo.',
                    'Vous gardez votre repos. Ari vous voit comme un rival sportif.'),
                wellness: 2),
            _choice(
                'brief',
                _text('Offer a short review', 'Ofrecer una revisión breve',
                    'Oferecer uma revisão curta', 'Proposer un bref échange'),
                _text(
                    'Jonah arranges a short review. You build modest teammate trust without losing fitness.',
                    'Jonah organiza una revisión breve. Ganas confianza sin perder forma física.',
                    'Jonah organiza uma revisão curta. Você ganha confiança sem perder condicionamento.',
                    'Jonah organise un bref échange. Vous gagnez de la confiance sans perdre de forme.'),
                trust: 2),
          ]),
      CareerEventDefinition(
          id: 'mentor-02-pressure',
          category: CareerEventCategory.teammate,
          title: _text(
              'Ari Sol: one place, two players',
              'Ari Sol: una plaza, dos jugadores',
              'Ari Sol: uma vaga, dois jogadores',
              'Ari Sol : une place, deux joueurs'),
          body: _text(
              'Ari challenges you for a starting place. Jonah asks how you want to handle the competition. Your earlier approach will shape his final advice.',
              'Ari compite contigo por la titularidad. Jonah pregunta cómo afrontar la competencia. Tu decisión anterior influirá en su consejo final.',
              'Ari disputa sua vaga de titular. Jonah pergunta como lidar com a competição. Sua escolha anterior moldará o conselho final.',
              'Ari vise votre place de titulaire. Jonah demande comment gérer la concurrence. Votre premier choix guidera son dernier conseil.'),
          choices: [
            _choice(
                'support',
                _text('Compete and support Ari', 'Competir y apoyar a Ari',
                    'Competir e apoiar Ari', 'Rivaliser et soutenir Ari'),
                _text(
                    'You train side by side. Teammate trust rises by 4.',
                    'Entrenáis juntos. La confianza sube 4.',
                    'Vocês treinam juntos. A confiança aumenta 4.',
                    'Vous vous entraînez ensemble. La confiance augmente de 4.'),
                trust: 3),
            _choice(
                'focus',
                _text('Focus on your own work', 'Centrarte en tu trabajo',
                    'Focar no seu trabalho', 'Se concentrer sur votre travail'),
                _text(
                    'You protect your routine and gain 2 wellness.',
                    'Proteges tu rutina y ganas 2 de bienestar.',
                    'Você protege sua rotina e ganha 2 de bem-estar.',
                    'Vous protégez votre routine et gagnez 2 de bien-être.'),
                wellness: 2),
            _choice(
                'public',
                _text('Make it a public contest', 'Hacer pública la rivalidad',
                    'Tornar a disputa pública', 'Rendre la rivalité publique'),
                _text(
                    'The attention raises reputation by 2, but teammate trust falls by 2.',
                    'La atención sube tu reputación 2, pero baja la confianza 2.',
                    'A atenção aumenta a reputação 2, mas a confiança cai 2.',
                    'L’attention augmente votre réputation de 2, mais la confiance baisse de 2.'),
                trust: -3,
                reputation: 2),
          ]),
      for (final shared in [true, false])
        CareerEventDefinition(
            id: shared ? 'mentor-03-shared' : 'mentor-03-solo',
            category: CareerEventCategory.teammate,
            title: shared
                ? _text(
                    'Jonah’s lesson: build together',
                    'La lección de Jonah: crecer juntos',
                    'A lição de Jonah: crescer juntos',
                    'La leçon de Jonah : grandir ensemble')
                : _text(
                    'Jonah’s lesson: rival with respect',
                    'La lección de Jonah: competir con respeto',
                    'A lição de Jonah: rivalizar com respeito',
                    'La leçon de Jonah : rivaliser avec respect'),
            body: shared
                ? _text(
                    'Jonah remembers that you welcomed Ari. He offers one final recovery session with both of you before stepping back from mentoring.',
                    'Jonah recuerda que acogiste a Ari. Ofrece una última sesión de recuperación antes de dejar la mentoría.',
                    'Jonah lembra que você acolheu Ari. Oferece uma última recuperação em grupo antes de encerrar a mentoria.',
                    'Jonah se souvient que vous avez accueilli Ari. Il propose une dernière récupération commune avant de terminer son mentorat.')
                : _text(
                    'Jonah remembers that you chose your own path. He asks you to close the rivalry with respect before stepping back from mentoring.',
                    'Jonah recuerda que elegiste tu camino. Te pide cerrar la rivalidad con respeto antes de dejar la mentoría.',
                    'Jonah lembra que você escolheu seu caminho. Pede que encerre a rivalidade com respeito antes de terminar a mentoria.',
                    'Jonah se souvient de votre indépendance. Il demande de clore la rivalité avec respect avant de terminer son mentorat.'),
            choices: [
              _choice(
                  'reconcile',
                  _text(
                      'Thank Jonah and include Ari',
                      'Agradecer a Jonah e incluir a Ari',
                      'Agradecer Jonah e incluir Ari',
                      'Remercier Jonah et inclure Ari'),
                  _text(
                      'The arc closes as an alliance. Teammate trust rises by 6 and fitness by 3.',
                      'La historia termina en alianza. La confianza sube 6 y la forma física 3.',
                      'A história termina em aliança. A confiança aumenta 6 e o condicionamento 3.',
                      'L’histoire se termine en alliance. La confiance augmente de 6 et la forme de 3.'),
                  trust: 5,
                  fitness: 3),
              _choice(
                  'independent',
                  _text(
                      'Thank Jonah, keep your distance',
                      'Agradecer y mantener distancia',
                      'Agradecer e manter distância',
                      'Remercier Jonah et garder vos distances'),
                  _text(
                      'The arc closes with mutual respect. Wellness rises by 3.',
                      'La historia termina con respeto mutuo. El bienestar sube 3.',
                      'A história termina com respeito mútuo. O bem-estar aumenta 3.',
                      'L’histoire se termine dans le respect. Le bien-être augmente de 3.'),
                  wellness: 3),
              _choice(
                  'dismiss',
                  _text('Dismiss the advice', 'Rechazar el consejo',
                      'Recusar o conselho', 'Rejeter le conseil'),
                  _text(
                      'The arc closes with a strained rivalry. Teammate trust falls by 4.',
                      'La historia termina en rivalidad tensa. La confianza baja 4.',
                      'A história termina em rivalidade tensa. A confiança cai 4.',
                      'L’histoire se termine en rivalité tendue. La confiance baisse de 4.'),
                  trust: -5),
            ]),
    ];

/// New releases can correct promises while older pinned catalogs remain intact.
int _familyCost(String eventId, String choiceId) =>
    switch ((eventId, choiceId)) {
      ('career-family-03', 'commit') => 1000,
      ('career-family-03', 'compromise') => 600,
      ('career-family-03', 'protect') => 150,
      ('career-family-05', 'protect') => 200,
      ('career-family-06', 'commit') => 500,
      ('career-family-06', 'compromise') => 800,
      ('career-family-06', 'protect') => 1000,
      ('career-family-08', 'commit') => 2000,
      ('career-family-08', 'compromise') => 1000,
      ('career-family-09', 'commit') => 300,
      ('career-family-09', 'protect') => 75,
      _ => 0
    };
CareerEventDefinition improveEventConsequences(CareerEventDefinition event) {
  final isTrade = event.id == 'career-contract-01';
  final isFamily = event.category == CareerEventCategory.family;
  final exploratory =
      event.category == CareerEventCategory.contract && !isTrade;
  if (!isTrade && !isFamily && !exploratory) return event;
  final caveat = _text(
      'This is an exploratory conversation; your current contract stays in place.',
      'Es una conversación exploratoria; tu contrato actual sigue vigente.',
      'Esta é uma conversa exploratória; seu contrato atual continua em vigor.',
      'Il s’agit d’une discussion exploratoire ; votre contrat actuel reste en vigueur.');
  return CareerEventDefinition(
      id: event.id,
      category: event.category,
      title: event.title,
      body: exploratory
          ? LocalizedText({
              for (final locale in supportedLocales)
                locale:
                    '${event.body.forLocale(locale)} ${caveat.forLocale(locale)}'
            })
          : event.body,
      previousPerformances: event.previousPerformances,
      previousGameWasHighStakes: event.previousGameWasHighStakes,
      nextGameIsHighStakes: event.nextGameIsHighStakes,
      choices: [
        for (final choice in event.choices)
          EventChoiceDefinition(
            id: choice.id,
            label: _familyCost(event.id, choice.id) > 0
                ? LocalizedText({
                    for (final locale in supportedLocales)
                      locale:
                          '${choice.label.forLocale(locale)} (−£${_familyCost(event.id, choice.id)})'
                  })
                : choice.label,
            trustDelta: choice.trustDelta,
            reputationDelta: choice.reputationDelta,
            moneyDelta: choice.moneyDelta - _familyCost(event.id, choice.id),
            wellnessDelta: choice.wellnessDelta,
            weeklyWagePercent: isTrade
                ? switch (choice.id) {
                    'commit' => 80,
                    'compromise' => 90,
                    _ => 100
                  }
                : 100,
            appearanceBonusDelta: isTrade
                ? switch (choice.id) {
                    'commit' => 900,
                    'compromise' => 400,
                    _ => 0
                  }
                : 0,
            familyDelta: isFamily
                ? switch (choice.id) {
                    'commit' => 5,
                    'compromise' => 3,
                    'protect' => 1,
                    _ => -3
                  }
                : 0,
          )
      ]);
}
