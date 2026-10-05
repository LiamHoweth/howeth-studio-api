import 'world_models.dart';

const launchWorldVersion = '2026.3.0';

Map<String, String> _names(
  String en, {
  String? es,
  String? pt,
  String? fr,
}) =>
    {
      'en': en,
      'es': es ?? en,
      'pt-BR': pt ?? en,
      'fr': fr ?? en,
    };

CountryDefinition _country(
  String id,
  String name,
  FootballRegion region,
  FootballConfederation confederation,
  List<String> mapCodes, {
  int? rank,
  bool league = false,
  String? es,
  String? pt,
  String? fr,
}) =>
    CountryDefinition(
      id: id,
      names: _names(name, es: es, pt: pt, fr: fr),
      region: region,
      confederation: confederation,
      mapUnitCodes: mapCodes,
      leagueRank: rank,
      playableLeague: league,
    );

final List<CountryDefinition> launchCountries = List.unmodifiable([
  _country('england', 'England', FootballRegion.europe,
      FootballConfederation.uefa, ['ENG'],
      rank: 1,
      league: true,
      es: 'Inglaterra',
      pt: 'Inglaterra',
      fr: 'Angleterre'),
  _country('spain', 'Spain', FootballRegion.europe, FootballConfederation.uefa,
      ['ESP'],
      rank: 2, league: true, es: 'España', pt: 'Espanha', fr: 'Espagne'),
  _country('brazil', 'Brazil', FootballRegion.southAmerica,
      FootballConfederation.conmebol, ['BRA'],
      rank: 3, league: true, es: 'Brasil', pt: 'Brasil', fr: 'Brésil'),
  _country('italy', 'Italy', FootballRegion.europe, FootballConfederation.uefa,
      ['ITA'],
      rank: 4, league: true, es: 'Italia', pt: 'Itália', fr: 'Italie'),
  _country('germany', 'Germany', FootballRegion.europe,
      FootballConfederation.uefa, ['DEU'],
      rank: 5, league: true, es: 'Alemania', pt: 'Alemanha', fr: 'Allemagne'),
  _country('france', 'France', FootballRegion.europe,
      FootballConfederation.uefa, ['FXX'],
      rank: 6, league: true, es: 'Francia', pt: 'França'),
  _country('portugal', 'Portugal', FootballRegion.europe,
      FootballConfederation.uefa, ['PRX'],
      rank: 7, league: true),
  _country('argentina', 'Argentina', FootballRegion.southAmerica,
      FootballConfederation.conmebol, ['ARG'],
      rank: 8, league: true, fr: 'Argentine'),
  _country('netherlands', 'Netherlands', FootballRegion.europe,
      FootballConfederation.uefa, ['NLD'],
      rank: 9,
      league: true,
      es: 'Países Bajos',
      pt: 'Países Baixos',
      fr: 'Pays-Bas'),
  _country('colombia', 'Colombia', FootballRegion.southAmerica,
      FootballConfederation.conmebol, ['COL'],
      rank: 10, league: true, pt: 'Colômbia', fr: 'Colombie'),
  _country('turkey', 'Turkey', FootballRegion.europe,
      FootballConfederation.uefa, ['TUR'],
      rank: 11, league: true, es: 'Turquía', pt: 'Turquia', fr: 'Turquie'),
  _country('belgium', 'Belgium', FootballRegion.europe,
      FootballConfederation.uefa, ['BFR', 'BWR', 'BCR'],
      rank: 12, league: true, es: 'Bélgica', pt: 'Bélgica', fr: 'Belgique'),
  _country('saudi-arabia', 'Saudi Arabia', FootballRegion.asia,
      FootballConfederation.afc, ['SAU'],
      rank: 13,
      league: true,
      es: 'Arabia Saudita',
      pt: 'Arábia Saudita',
      fr: 'Arabie saoudite'),
  _country('ecuador', 'Ecuador', FootballRegion.southAmerica,
      FootballConfederation.conmebol, ['ECU'],
      rank: 14, league: true, fr: 'Équateur'),
  _country('greece', 'Greece', FootballRegion.europe,
      FootballConfederation.uefa, ['GRC'],
      rank: 15, league: true, es: 'Grecia', pt: 'Grécia', fr: 'Grèce'),
  _country('egypt', 'Egypt', FootballRegion.africa, FootballConfederation.caf,
      ['EGY'],
      rank: 16, league: true, es: 'Egipto', pt: 'Egito', fr: 'Égypte'),
  _country('czechia', 'Czechia', FootballRegion.europe,
      FootballConfederation.uefa, ['CZE'],
      rank: 17, league: true, es: 'Chequia', pt: 'Chéquia', fr: 'Tchéquie'),
  _country(
      'japan', 'Japan', FootballRegion.asia, FootballConfederation.afc, ['JPN'],
      rank: 18, league: true, es: 'Japón', pt: 'Japão', fr: 'Japon'),
  _country('paraguay', 'Paraguay', FootballRegion.southAmerica,
      FootballConfederation.conmebol, ['PRY'],
      rank: 19, league: true),
  _country('cyprus', 'Cyprus', FootballRegion.europe,
      FootballConfederation.uefa, ['CYP'],
      rank: 20, league: true, es: 'Chipre', pt: 'Chipre', fr: 'Chypre'),
  _country('uruguay', 'Uruguay', FootballRegion.southAmerica,
      FootballConfederation.conmebol, ['URY'],
      rank: 21, league: true),
  _country('mexico', 'Mexico', FootballRegion.northAmerica,
      FootballConfederation.concacaf, ['MEX'],
      rank: 22, league: true, es: 'México', pt: 'México', fr: 'Mexique'),
  _country('poland', 'Poland', FootballRegion.europe,
      FootballConfederation.uefa, ['POL'],
      rank: 23, league: true, es: 'Polonia', pt: 'Polônia', fr: 'Pologne'),
  _country('scotland', 'Scotland', FootballRegion.europe,
      FootballConfederation.uefa, ['SCT'],
      rank: 24, league: true, es: 'Escocia', pt: 'Escócia', fr: 'Écosse'),
  _country('denmark', 'Denmark', FootballRegion.europe,
      FootballConfederation.uefa, ['DNK'],
      rank: 25, league: true, es: 'Dinamarca', pt: 'Dinamarca', fr: 'Danemark'),
  _country('united-states', 'United States', FootballRegion.northAmerica,
      FootballConfederation.concacaf, ['USA'],
      league: true,
      es: 'Estados Unidos',
      pt: 'Estados Unidos',
      fr: 'États-Unis'),
  _country('croatia', 'Croatia', FootballRegion.europe,
      FootballConfederation.uefa, ['HRV'],
      es: 'Croacia', pt: 'Croácia', fr: 'Croatie'),
  _country('chile', 'Chile', FootballRegion.southAmerica,
      FootballConfederation.conmebol, ['CHL'],
      fr: 'Chili'),
  _country('peru', 'Peru', FootballRegion.southAmerica,
      FootballConfederation.conmebol, ['PER'],
      es: 'Perú', pt: 'Peru', fr: 'Pérou'),
  _country('canada', 'Canada', FootballRegion.northAmerica,
      FootballConfederation.concacaf, ['CAN']),
  _country('costa-rica', 'Costa Rica', FootballRegion.northAmerica,
      FootballConfederation.concacaf, ['CRI']),
  _country('jamaica', 'Jamaica', FootballRegion.northAmerica,
      FootballConfederation.concacaf, ['JAM'],
      fr: 'Jamaïque'),
  _country('panama', 'Panama', FootballRegion.northAmerica,
      FootballConfederation.concacaf, ['PAN'],
      es: 'Panamá', pt: 'Panamá'),
  _country('morocco', 'Morocco', FootballRegion.africa,
      FootballConfederation.caf, ['MAR'],
      es: 'Marruecos', pt: 'Marrocos', fr: 'Maroc'),
  _country('nigeria', 'Nigeria', FootballRegion.africa,
      FootballConfederation.caf, ['NGA'],
      pt: 'Nigéria', fr: 'Nigéria'),
  _country('senegal', 'Senegal', FootballRegion.africa,
      FootballConfederation.caf, ['SEN'],
      pt: 'Senegal', fr: 'Sénégal'),
  _country('ghana', 'Ghana', FootballRegion.africa, FootballConfederation.caf,
      ['GHA']),
  _country('algeria', 'Algeria', FootballRegion.africa,
      FootballConfederation.caf, ['DZA'],
      es: 'Argelia', pt: 'Argélia', fr: 'Algérie'),
  _country('cameroon', 'Cameroon', FootballRegion.africa,
      FootballConfederation.caf, ['CMR'],
      es: 'Camerún', pt: 'Camarões', fr: 'Cameroun'),
  _country('south-africa', 'South Africa', FootballRegion.africa,
      FootballConfederation.caf, ['ZAF'],
      es: 'Sudáfrica', pt: 'África do Sul', fr: 'Afrique du Sud'),
  _country('south-korea', 'South Korea', FootballRegion.asia,
      FootballConfederation.afc, ['KOR'],
      es: 'Corea del Sur', pt: 'Coreia do Sul', fr: 'Corée du Sud'),
  _country('australia', 'Australia', FootballRegion.oceania,
      FootballConfederation.afc, ['AUS'],
      es: 'Australia', pt: 'Austrália', fr: 'Australie'),
  _country(
      'iran', 'Iran', FootballRegion.asia, FootballConfederation.afc, ['IRN'],
      fr: 'Iran'),
  _country('qatar', 'Qatar', FootballRegion.asia, FootballConfederation.afc,
      ['QAT']),
  _country(
      'iraq', 'Iraq', FootballRegion.asia, FootballConfederation.afc, ['IRQ'],
      es: 'Irak', pt: 'Iraque', fr: 'Irak'),
  _country('united-arab-emirates', 'United Arab Emirates', FootballRegion.asia,
      FootballConfederation.afc, ['ARE'],
      es: 'Emiratos Árabes Unidos',
      pt: 'Emirados Árabes Unidos',
      fr: 'Émirats arabes unis'),
  _country('new-zealand', 'New Zealand', FootballRegion.oceania,
      FootballConfederation.ofc, ['NZL'],
      es: 'Nueva Zelanda', pt: 'Nova Zelândia', fr: 'Nouvelle-Zélande'),
  _country('fiji', 'Fiji', FootballRegion.oceania, FootballConfederation.ofc,
      ['FJI'],
      es: 'Fiyi', fr: 'Fidji'),
]);

final class _LeagueSeed {
  const _LeagueSeed(
      this.countryId, this.firstName, this.secondName, this.roots);
  final String countryId;
  final String firstName;
  final String secondName;
  final List<String> roots;
}

const _newLeagueSeeds = <_LeagueSeed>[
  _LeagueSeed('italy', 'Lega Aurora', 'Lega Aurora II', [
    'Bellacosta',
    'Valdoro',
    'Portoluce',
    'Montefiore',
    'Rosamarina',
    'Castelverde',
    'Rivaforte',
    'Lunacittà',
    'San Vento',
    'Torrealta'
  ]),
  _LeagueSeed('portugal', 'Liga Atlântica', 'Liga Atlântica II', [
    'Vale Azul',
    'Porto Claro',
    'Serra Nova',
    'Rio Dourado',
    'Vila Branca',
    'Costa Verde',
    'Monte Luz',
    'Campo Real',
    'Estrela Sul',
    'Mar Alto'
  ]),
  _LeagueSeed('argentina', 'Liga del Plata', 'Liga del Plata II', [
    'Puerto Plata',
    'Sierra Roja',
    'Valle Claro',
    'Pampa Norte',
    'Río Blanco',
    'Costa Sur',
    'Monte Azul',
    'Barrio Central',
    'Lago Oeste',
    'Sol Andino'
  ]),
  _LeagueSeed('netherlands', 'Oranje Divisie', 'Oranje Divisie II', [
    'Waterdam',
    'Noordhaven',
    'Tulpenstad',
    'Rijnburg',
    'Zilvermeer',
    'Oostpoort',
    'Winderveld',
    'Maaswijk',
    'Duinzicht',
    'Kroonstad'
  ]),
  _LeagueSeed('colombia', 'Liga Cordillera', 'Liga Cordillera II', [
    'Sierra Verde',
    'Puerto Oro',
    'Valle Alto',
    'Río Claro',
    'Costa Esmeralda',
    'Monte Azul',
    'Café Norte',
    'Llanos Real',
    'Bahía Dorada',
    'Andes Central'
  ]),
  _LeagueSeed('turkey', 'Anadolu Ligi', 'Anadolu Ligi II', [
    'Altınşehir',
    'Mavi Liman',
    'Anadolu Vale',
    'Güneşkent',
    'Kuzey Yıldız',
    'Boğaz Union',
    'Toros Spor',
    'Ege Rüzgar',
    'Marmara Kale',
    'Doğu Işık'
  ]),
  _LeagueSeed('belgium', 'Lowlands Crown', 'Lowlands Crown II', [
    'Brugelight',
    'Meuse Vale',
    'Flanders Gate',
    'Ardenne North',
    'Canal Rouge',
    'Linden Park',
    'Scheldt City',
    'Cobalt Union',
    'Walloon Star',
    'Amberfield'
  ]),
  _LeagueSeed('saudi-arabia', 'Arabian Premier', 'Arabian Premier II', [
    'Najd Star',
    'Red Coast',
    'Oasis Gate',
    'Riyal City',
    'Dune Crescent',
    'Eastern Pearl',
    'Palm Union',
    'Desert Crown',
    'Wadi Light',
    'Gulf Horizon'
  ]),
  _LeagueSeed('ecuador', 'Liga Mitad del Mundo', 'Liga Mitad del Mundo II', [
    'Quito Norte',
    'Costa del Sol',
    'Volcán Azul',
    'Sierra Centro',
    'Puerto Verde',
    'Andes Luz',
    'Valle Dorado',
    'Río Equador',
    'Cumbre Real',
    'Pacífico Sur'
  ]),
  _LeagueSeed('greece', 'Hellenic Crown', 'Hellenic Crown II', [
    'Aegean Star',
    'Olympus Vale',
    'Ionian Blue',
    'Attica Union',
    'Thessaly Gate',
    'Arcadia Light',
    'Dorian City',
    'Pelagos',
    'Macedon Rovers',
    'Helios Town'
  ]),
  _LeagueSeed('egypt', 'Nile Premier', 'Nile Premier II', [
    'Nile Crown',
    'Delta Star',
    'Alexandria Harbour',
    'Cairo Lantern',
    'Sinai Gate',
    'Luxor Sun',
    'Red Sea Union',
    'Giza Vale',
    'Memphis City',
    'Suez Horizon'
  ]),
  _LeagueSeed('czechia', 'Bohemian Liga', 'Bohemian Liga II', [
    'Bohemia Crown',
    'Morava City',
    'Vltava Blue',
    'Brno Gate',
    'Prague Vale',
    'Silesia Star',
    'Linden Union',
    'Crystal Town',
    'Central Forge',
    'Silver Hills'
  ]),
  _LeagueSeed('japan', 'Rising Sun League', 'Rising Sun League II', [
    'Sakura Bay',
    'Fuji Vale',
    'Hikari City',
    'Kansai Blue',
    'Seto Wind',
    'Tohoku Star',
    'Kanto Union',
    'Kyushu Wave',
    'Nagano Peak',
    'Shikoku Gate'
  ]),
  _LeagueSeed('paraguay', 'Liga Guaraní', 'Liga Guaraní II', [
    'Guaraní Norte',
    'Río Plata',
    'Asunción Vale',
    'Chaco Star',
    'Lago Azul',
    'Sierra Roja',
    'Central Verde',
    'Campo Dorado',
    'Paraná City',
    'Sol del Este'
  ]),
  _LeagueSeed('cyprus', 'Island Crown', 'Island Crown II', [
    'Kyrenia Star',
    'Larnaca Bay',
    'Mesaoria Vale',
    'Paphos Light',
    'Troodos Peak',
    'Famagusta Gate',
    'Nicosia Union',
    'Akamas Blue',
    'Copper Coast',
    'Island Sun'
  ]),
  _LeagueSeed('uruguay', 'Liga Oriental', 'Liga Oriental II', [
    'Rambla Sur',
    'Plata Norte',
    'Colonia Star',
    'Rivera Azul',
    'Punta Luz',
    'Salto Vale',
    'Rocha United',
    'Canelones City',
    'Durazno Crown',
    'Maldonado Bay'
  ]),
  _LeagueSeed('mexico', 'Liga Horizonte', 'Liga Horizonte II', [
    'Sierra Norte',
    'Costa Maya',
    'Valle Plata',
    'Sol del Bajío',
    'Puerto Jade',
    'Altiplano City',
    'Lago Azul',
    'Desierto Real',
    'Golfo United',
    'Monte Claro'
  ]),
  _LeagueSeed('poland', 'Baltic Crown', 'Baltic Crown II', [
    'Vistula Star',
    'Baltic Gate',
    'Silesian Forge',
    'Mazovia City',
    'Amber Coast',
    'Tatra Peak',
    'Oder Vale',
    'Lublin Light',
    'Pomerania Blue',
    'Central Eagle'
  ]),
  _LeagueSeed('scotland', 'Caledonia Premiership', 'Caledonia Premiership II', [
    'Highland Thistle',
    'Forth Vale',
    'Clyde City',
    'Tay Rovers',
    'Granite North',
    'Heather Union',
    'Lochside',
    'Caledon Star',
    'Border Athletic',
    'Island Crown'
  ]),
  _LeagueSeed('denmark', 'Nordic Crown', 'Nordic Crown II', [
    'Jutland Star',
    'Zealand Bay',
    'Fjord City',
    'Copenhagen Vale',
    'Odense Union',
    'Aalborg North',
    'Baltic Light',
    'Viking Gate',
    'Roseland',
    'Harbour Crown'
  ]),
];

const _legacyLeagueNames = <String, List<String>>{
  'england': ['Crown Division', 'Crown Division II'],
  'spain': ['Liga del Sol', 'Liga del Sol II'],
  'france': ['Championnat Lumière', 'Championnat Lumière II'],
  'germany': ['Bundeskrone', 'Bundeskrone II'],
  'brazil': ['Série Horizonte', 'Série Horizonte II'],
  'united-states': ['Continental League', 'Continental League II'],
};

const _legacyClubNames = <String, List<String>>{
  'england': [
    'Northstar Athletic',
    'Harbour Rovers',
    'Wrenford City',
    'Kingsmere Athletic',
    'Redwick Borough',
    'Alderwick United',
    'Calder Vale',
    'Eastmarch FC',
    'Whitecap Town',
    'Forgechester',
    'Copperhill FC',
    'Orchard Vale',
    'Ironbridge 04',
    'Beacon Town',
    'Ashcombe Union',
    'Moorland Rovers',
    'Rosebury City',
    'Foxmere Athletic',
    'Greyhaven FC',
    'Westbarrow'
  ],
  'spain': [
    'Solmera CF',
    'Puerto Cobalto',
    'Sierra Dorada',
    'Ciudad Azahar',
    'Marisma Azul',
    'Valdeoro CF',
    'Estrella Norte',
    'Río Claro',
    'Costa Brava Unión',
    'Llanura Roja',
    'Bahía Serena',
    'Monteverde CF',
    'Alba Levante',
    'Castillo Sur',
    'Viento Cádiz',
    'Olivo Central',
    'Campo Realengo',
    'Luna Blanca',
    'Piedra Alta',
    'Naranjal CF'
  ],
  'france': [
    'Étoile d’Aubrac',
    'Rivage Olympique',
    'Union Clairmont',
    'Montfleury FC',
    'Azur Saint-Rémy',
    'Racing Valoise',
    'Lumière AC',
    'Côte d’Argent',
    'Stade Bellande',
    'Rougefort',
    'Ardenne Sporting',
    'Marais Vendôme',
    'Belle-Rive FC',
    'Aurore Dijon',
    'Lorraine Union',
    'Vallon Bleu',
    'Cercle d’Orléans',
    'Grand Pin FC',
    'Océanique',
    'Vigne Rouge'
  ],
  'germany': [
    'Rheinstadt 09',
    'Eisenwald SV',
    'Nordhafen',
    'Grünberg 03',
    'Adlerheim',
    'Blaukirchen',
    'Rotfels Union',
    'Sonnenfeld',
    'Westtor 11',
    'Mainbrücke',
    'Silbersee SV',
    'Hohenwald 06',
    'Falkenstadt',
    'Elbauen',
    'Kronental',
    'Berglicht 08',
    'Wiesengrund',
    'Ostmarke FC',
    'Tannenhof',
    'Donauwerk'
  ],
  'brazil': [
    'Aurora Paulista',
    'Estrela do Mar',
    'União Serrana',
    'Atlético Ipê',
    'Horizonte Azul',
    'Ferroviário Central',
    'Ponte Dourada',
    'Vale Verde EC',
    'Nação Carioca',
    'Bravos do Sul',
    'Litoral FC',
    'Raio Mineiro',
    'Palmeira Nova',
    'Vitória do Norte',
    'Cerrado Clube',
    'Ribeira Atlético',
    'Jardim Imperial',
    'Oeste Rubro',
    'Canário Real',
    'Porto da Lua'
  ],
  'united-states': [
    'Bay City Atlas',
    'Chicago Lakes',
    'Austin Sol',
    'Brooklyn Borough',
    'Cascadia Pines',
    'Miami Current',
    'Nashville Gold',
    'Phoenix Union',
    'Denver Summit',
    'Boston Lanterns',
    'San Diego Tide',
    'Detroit Forge',
    'Carolina Flight',
    'Portland Evergreen',
    'Las Vegas Neon',
    'St. Louis Archers',
    'Minnesota North',
    'New Orleans Crescent',
    'Sacramento Republica',
    'Baltimore Fleet'
  ],
};

const _firstSuffixes = [
  'Athletic',
  'United',
  'City',
  'Rovers',
  'Sporting',
  'FC',
  'Olympic',
  'Union',
  'Town',
  'Stars'
];
const _secondSuffixes = [
  'Academy',
  'Wanderers',
  'Vale',
  'County',
  'SC',
  '1912',
  'Borough',
  'Racing',
  'Harbour',
  'Dynamo'
];
const _palettes = <List<int>>[
  [0xffb7f34a, 0xff07110c],
  [0xff75c8e8, 0xff10231a],
  [0xffffc65b, 0xff421d16],
  [0xffff806b, 0xff241015],
  [0xfff3f0e5, 0xff244735],
  [0xff9b8cff, 0xff17122f],
  [0xff50d3a5, 0xff09251c],
  [0xffff9bc2, 0xff321321],
  [0xffe7d36f, 0xff1b2a48],
  [0xffd3e0ea, 0xff27334a],
];

const _teamQuality = <String, int>{
  'argentina': 89,
  'brazil': 88,
  'canada': 76,
  'mexico': 81,
  'united-states': 80,
  'costa-rica': 72,
  'jamaica': 71,
  'panama': 73,
  'england': 88,
  'spain': 89,
  'france': 89,
  'germany': 86,
  'italy': 85,
  'portugal': 86,
  'netherlands': 85,
  'croatia': 82,
  'turkey': 80,
  'belgium': 83,
  'greece': 77,
  'czechia': 78,
  'cyprus': 68,
  'poland': 78,
  'scotland': 76,
  'denmark': 80,
  'colombia': 83,
  'ecuador': 80,
  'paraguay': 78,
  'uruguay': 84,
  'chile': 77,
  'peru': 74,
  'morocco': 82,
  'nigeria': 79,
  'senegal': 81,
  'ghana': 76,
  'egypt': 79,
  'algeria': 78,
  'cameroon': 77,
  'south-africa': 74,
  'japan': 81,
  'south-korea': 80,
  'saudi-arabia': 75,
  'australia': 77,
  'iran': 79,
  'qatar': 73,
  'iraq': 72,
  'united-arab-emirates': 71,
  'new-zealand': 69,
  'fiji': 61,
};

WorldDefinition? _cachedLaunchWorld;
WorldDefinition? _cachedLegacyLaunchWorld;

WorldDefinition buildLaunchWorld() =>
    _cachedLaunchWorld ??= _buildLaunchWorld();

/// Reconstructs the original 2026.1/2026.2 world at the lossless season-one
/// boundary for schema migrations that predate the persisted fixture ledger.
WorldDefinition buildLegacyLaunchWorld() =>
    _cachedLegacyLaunchWorld ??= _buildLegacyLaunchWorld();

WorldDefinition _buildLegacyLaunchWorld() {
  final expanded = buildLaunchWorld();
  const leagueCountryIds = [
    'england',
    'spain',
    'france',
    'germany',
    'brazil',
    'united-states',
  ];
  const nationalTeamIds = [
    'argentina',
    'brazil',
    'canada',
    'mexico',
    'united-states',
    'costa-rica',
    'england',
    'spain',
    'france',
    'germany',
    'italy',
    'portugal',
    'netherlands',
    'croatia',
    'morocco',
    'nigeria',
    'senegal',
    'ghana',
    'japan',
    'south-korea',
    'saudi-arabia',
    'australia',
    'new-zealand',
    'uruguay',
  ];
  final clubs = [
    for (final countryId in leagueCountryIds)
      ...expanded.clubs.where((club) => club.countryId == countryId),
  ];
  final leagues = [
    for (final countryId in leagueCountryIds)
      ...DivisionLevel.values.map(
        (division) => expanded.leagues.firstWhere(
          (league) =>
              league.countryId == countryId && league.division == division,
        ),
      ),
  ];
  final cups = [
    for (final countryId in leagueCountryIds)
      expanded.domesticCups.firstWhere(
        (cup) => cup.countryId == countryId,
      ),
  ];
  final internationalIds = [
    for (final countryId in leagueCountryIds)
      ...leagues
          .firstWhere(
            (league) =>
                league.countryId == countryId &&
                league.division == DivisionLevel.first,
          )
          .clubIds
          .take(2),
  ];
  return WorldDefinition(
    contentVersion: '2026.2.0',
    countries: List.unmodifiable(
      nationalTeamIds.map((id) {
        final country = expanded.country(id);
        return CountryDefinition(
          id: country.id,
          names: country.names,
          region: country.region,
          confederation: country.confederation,
          mapUnitCodes: country.mapUnitCodes,
          playableLeague: leagueCountryIds.contains(id),
        );
      }),
    ),
    clubs: List.unmodifiable(clubs),
    leagues: List.unmodifiable(leagues),
    domesticCups: List.unmodifiable(cups),
    internationalClubCompetition: CompetitionDefinition(
      id: 'world-champions-series',
      name: 'World Champions Series',
      kind: CompetitionKind.internationalClub,
      participantIds: List.unmodifiable(internationalIds),
      fixtures: buildLegacyInternationalGroupSchedule(internationalIds),
    ),
    nationalTeams: List.unmodifiable(
      nationalTeamIds.map(expanded.nationalTeam),
    ),
  );
}

WorldDefinition _buildLaunchWorld() {
  final clubs = <ClubDefinition>[];
  final leagues = <LeagueDefinition>[];
  final cups = <CompetitionDefinition>[];
  final seeds = <String, _LeagueSeed>{
    for (final seed in _newLeagueSeeds) seed.countryId: seed,
  };
  final leagueCountries = launchCountries
      .where((country) => country.hasLeague)
      .toList()
    ..sort((a, b) => (a.leagueRank ?? 40).compareTo(b.leagueRank ?? 40));

  for (var countryIndex = 0;
      countryIndex < leagueCountries.length;
      countryIndex++) {
    final country = leagueCountries[countryIndex];
    final legacyNames = _legacyClubNames[country.id];
    final seed = seeds[country.id];
    final names = legacyNames ??
        List<String>.generate(20, (index) {
          final root = seed!.roots[index % 10];
          final suffix =
              index < 10 ? _firstSuffixes[index] : _secondSuffixes[index - 10];
          return '$root $suffix';
        }, growable: false);
    final nationClubs = <ClubDefinition>[];
    for (var index = 0; index < names.length; index++) {
      final division = index < 10 ? DivisionLevel.first : DivisionLevel.second;
      final localIndex = index % 10;
      final rank = country.leagueRank ?? 40;
      final topBase = (84 - ((rank - 1) ~/ 3)).clamp(70, 84);
      final baseQuality =
          division == DivisionLevel.first ? topBase : topBase - 12;
      final palette = _palettes[(index + countryIndex * 3) % _palettes.length];
      final club = ClubDefinition(
        id: '${country.id}-${_slug(names[index])}',
        name: names[index],
        shortName: _shortName(names[index]),
        countryId: country.id,
        division: division,
        quality: baseQuality + ((localIndex * 7 + countryIndex * 2) % 8),
        attack: baseQuality + ((localIndex * 5 + countryIndex) % 9),
        defense: baseQuality + ((localIndex * 3 + countryIndex * 2) % 9),
        primaryColor: palette[0],
        secondaryColor: palette[1],
      );
      clubs.add(club);
      nationClubs.add(club);
    }

    final leagueNames =
        _legacyLeagueNames[country.id] ?? [seed!.firstName, seed.secondName];
    for (final division in DivisionLevel.values) {
      final divisionClubs = nationClubs
          .where((club) => club.division == division)
          .map((club) => club.id)
          .toList(growable: false);
      final leagueId = '${country.id}-${division.name}';
      leagues.add(LeagueDefinition(
        id: leagueId,
        name: leagueNames[division.index],
        countryId: country.id,
        systemRank: country.leagueRank,
        division: division,
        clubIds: divisionClubs,
        fixtures: buildDoubleRoundRobinSchedule(
          competitionId: leagueId,
          participantIds: divisionClubs,
        ),
      ));
    }

    final cupIds = nationClubs.map((club) => club.id).toList(growable: false);
    cups.add(CompetitionDefinition(
      id: '${country.id}-cup',
      name: '${country.name} Unity Cup',
      kind: CompetitionKind.domesticCup,
      countryId: country.id,
      participantIds: cupIds,
      fixtures: buildCupOpeningRound('${country.id}-cup', cupIds),
    ));
  }

  final internationalIds = <String>[];
  for (final country in leagueCountries) {
    internationalIds.add(clubs
        .firstWhere((club) =>
            club.countryId == country.id &&
            club.division == DivisionLevel.first)
        .id);
  }
  for (final country in leagueCountries.where(
      (country) => country.leagueRank != null && country.leagueRank! <= 6)) {
    internationalIds.add(clubs
        .where((club) =>
            club.countryId == country.id &&
            club.division == DivisionLevel.first)
        .skip(1)
        .first
        .id);
  }

  final nationalTeams = launchCountries
      .map((country) => NationalTeamDefinition(
            id: country.id,
            countryId: country.id,
            countryName: country.name,
            region: country.region,
            confederation: country.confederation,
            quality: _teamQuality[country.id]!,
          ))
      .toList(growable: false);

  return WorldDefinition(
    contentVersion: launchWorldVersion,
    countries: launchCountries,
    clubs: List.unmodifiable(clubs),
    leagues: List.unmodifiable(leagues),
    domesticCups: List.unmodifiable(cups),
    internationalClubCompetition: CompetitionDefinition(
      id: 'world-champions-series',
      name: 'World Champions Series',
      kind: CompetitionKind.internationalClub,
      participantIds: List.unmodifiable(internationalIds),
      fixtures: buildInternationalGroupSchedule(internationalIds),
    ),
    nationalTeams: List.unmodifiable(nationalTeams),
  );
}

NationalCallupRequirements nationalCallupRequirements(
  WorldDefinition world,
  String nationalTeamId,
) {
  final quality = world.nationalTeam(nationalTeamId).quality;
  return NationalCallupRequirements(
    overall: (quality - 8).clamp(66, 82),
    reputation: (quality - 20).clamp(50, 70),
  );
}

List<Fixture> buildDoubleRoundRobinSchedule({
  required String competitionId,
  required List<String> participantIds,
}) {
  if (participantIds.length < 2 || participantIds.length.isOdd) {
    throw ArgumentError(
        'A round-robin competition needs an even participant count.');
  }
  final rotating = [...participantIds];
  final firstLeg = <Fixture>[];
  final rounds = rotating.length - 1;
  for (var round = 0; round < rounds; round++) {
    for (var pairing = 0; pairing < rotating.length ~/ 2; pairing++) {
      final left = rotating[pairing];
      final right = rotating[rotating.length - 1 - pairing];
      final swap = (round + pairing).isOdd;
      firstLeg.add(Fixture(
        id: '$competitionId-w${round + 1}-m${pairing + 1}',
        competitionId: competitionId,
        matchweek: round + 1,
        homeId: swap ? right : left,
        awayId: swap ? left : right,
      ));
    }
    final tail = rotating.removeLast();
    rotating.insert(1, tail);
  }
  final matchesPerWeek = rotating.length ~/ 2;
  final secondLeg = firstLeg.indexed.map((entry) => Fixture(
        id: '${entry.$2.competitionId}-w${entry.$2.matchweek + rounds}-m${entry.$1 % matchesPerWeek + 1}',
        competitionId: entry.$2.competitionId,
        matchweek: entry.$2.matchweek + rounds,
        homeId: entry.$2.awayId,
        awayId: entry.$2.homeId,
      ));
  return List.unmodifiable([...firstLeg, ...secondLeg]);
}

List<Fixture> buildSingleRoundRobinSchedule({
  required String competitionId,
  required List<String> participantIds,
}) =>
    buildDoubleRoundRobinSchedule(
      competitionId: competitionId,
      participantIds: participantIds,
    )
        .where((fixture) => fixture.matchweek < participantIds.length)
        .toList(growable: false);

List<Fixture> buildCupOpeningRound(String competitionId, List<String> ids) {
  if (ids.length != 20)
    throw ArgumentError('Domestic cups launch with 20 clubs.');
  return List.generate(
      4,
      (index) => Fixture(
            id: '$competitionId-preliminary-${index + 1}',
            competitionId: competitionId,
            matchweek: 2,
            homeId: ids[12 + index * 2],
            awayId: ids[13 + index * 2],
          ));
}

List<Fixture> buildInternationalGroupSchedule(List<String> ids) =>
    _buildGroupSchedule(
      ids: ids,
      competitionId: 'world-champions-series',
      groupCount: 8,
      weeks: const [3, 7, 11],
    );

List<Fixture> buildLegacyInternationalGroupSchedule(List<String> ids) =>
    _buildGroupSchedule(
      ids: ids,
      competitionId: 'world-champions-series',
      groupCount: 3,
      weeks: const [3, 7, 11],
    );

List<Fixture> buildNationalGroupSchedule(List<String> ids) =>
    _buildGroupSchedule(
      ids: ids,
      competitionId: 'world-nations-championship',
      groupCount: 8,
      weeks: const [1, 2, 3],
    );

List<Fixture> buildLegacyNationalGroupSchedule(List<String> ids) =>
    _buildGroupSchedule(
      ids: ids,
      competitionId: 'major-national-tournament',
      groupCount: 6,
      weeks: const [1, 5, 9],
    );

const nationalQualificationSlots = <FootballConfederation, int>{
  FootballConfederation.uefa: 12,
  FootballConfederation.conmebol: 5,
  FootballConfederation.concacaf: 4,
  FootballConfederation.caf: 5,
  FootballConfederation.afc: 5,
  FootballConfederation.ofc: 1,
};

/// Simulates the regional qualifying tables and returns a deterministic,
/// seeded four-pot group draw in group-contiguous order.
List<String> qualifyingNationalTeams(WorldDefinition world, int cycleSeason) =>
    simulateNationalQualification(world, cycleSeason).qualifiedTeamIds;

NationalQualificationResult simulateNationalQualification(
  WorldDefinition world,
  int cycleSeason,
) {
  final qualifiers = <NationalTeamDefinition>[];
  final tables = <String, List<StandingRow>>{};
  final allFixtures = <String, List<Fixture>>{};
  for (final confederation in FootballConfederation.values) {
    final teams = world.nationalTeams
        .where((team) => team.confederation == confederation)
        .toList(growable: false);
    final fixtures = buildSingleRoundRobinSchedule(
      competitionId: 'qualifier-${confederation.name}-$cycleSeason',
      participantIds: teams.map((team) => team.id).toList(growable: false),
    ).map((fixture) {
      final home = teams.firstWhere((team) => team.id == fixture.homeId);
      final away = teams.firstWhere((team) => team.id == fixture.awayId);
      final result = _qualificationScore(
        cycleSeason,
        fixture.id,
        home.quality,
        away.quality,
      );
      return fixture.withScore(result.$1, result.$2);
    }).toList(growable: false);
    final table = tableFromFixtures(
      teams.map((team) => team.id).toList(growable: false),
      fixtures,
    );
    tables[confederation.name] = table;
    allFixtures[confederation.name] = fixtures;
    final slots = nationalQualificationSlots[confederation]!;
    qualifiers.addAll(
      table.take(slots).map(
            (row) => teams.firstWhere((team) => team.id == row.clubId),
          ),
    );
  }
  qualifiers.sort((left, right) {
    final quality = right.quality.compareTo(left.quality);
    return quality != 0 ? quality : left.id.compareTo(right.id);
  });

  final pots = List.generate(
    4,
    (pot) => qualifiers.sublist(pot * 8, pot * 8 + 8).toList(),
  );
  final groups = List.generate(8, (_) => <NationalTeamDefinition>[]);
  for (var potIndex = 0; potIndex < pots.length; potIndex++) {
    final available = pots[potIndex];
    final rotation = (cycleSeason + potIndex * 3) % available.length;
    final rotated = [...available.skip(rotation), ...available.take(rotation)];
    final assignment = _assignNationalPot(rotated, groups);
    if (assignment == null) {
      throw StateError(
        'No valid confederation-aware draw exists for pot ${potIndex + 1}.',
      );
    }
    for (var groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      groups[groupIndex].add(assignment[groupIndex]);
    }
  }
  return NationalQualificationResult(
    tables: Map.unmodifiable(tables),
    fixtures: Map.unmodifiable(allFixtures),
    qualifiedTeamIds: List.unmodifiable(
      groups.expand((group) => group).map((team) => team.id),
    ),
  );
}

List<NationalTeamDefinition>? _assignNationalPot(
  List<NationalTeamDefinition> orderedCandidates,
  List<List<NationalTeamDefinition>> groups,
) {
  final remaining = [...orderedCandidates];
  final assignment = <NationalTeamDefinition>[];

  bool place(int groupIndex) {
    if (groupIndex == groups.length) return true;
    for (var candidateIndex = 0;
        candidateIndex < remaining.length;
        candidateIndex++) {
      final candidate = remaining[candidateIndex];
      if (!_canJoinNationalGroup(candidate, groups[groupIndex])) continue;
      remaining.removeAt(candidateIndex);
      assignment.add(candidate);
      if (place(groupIndex + 1)) return true;
      assignment.removeLast();
      remaining.insert(candidateIndex, candidate);
    }
    return false;
  }

  return place(0) ? List.unmodifiable(assignment) : null;
}

bool _canJoinNationalGroup(
  NationalTeamDefinition candidate,
  List<NationalTeamDefinition> group,
) {
  final same = group
      .where(
        (team) => team.confederation == candidate.confederation,
      )
      .length;
  return candidate.confederation == FootballConfederation.uefa
      ? same < 2
      : same == 0;
}

(int, int) _qualificationScore(
  int season,
  String fixtureId,
  int homeQuality,
  int awayQuality,
) {
  var state = (season * 7919 ^ _stableHash(fixtureId)) & 0x7fffffff;
  int next(int maximum) {
    state = (1103515245 * state + 12345) & 0x7fffffff;
    return ((state / 0x80000000) * maximum).floor();
  }

  final home =
      (next(3) + ((homeQuality + 3 - awayQuality) / 11).round()).clamp(0, 5);
  final away =
      (next(3) + ((awayQuality - homeQuality) / 11).round()).clamp(0, 5);
  return (home, away);
}

List<Fixture> _buildGroupSchedule({
  required List<String> ids,
  required String competitionId,
  required int groupCount,
  required List<int> weeks,
}) {
  if (ids.length != groupCount * 4) {
    throw ArgumentError('$competitionId needs ${groupCount * 4} teams.');
  }
  final fixtures = <Fixture>[];
  for (var group = 0; group < groupCount; group++) {
    final teams = ids.sublist(group * 4, group * 4 + 4);
    final schedule = buildDoubleRoundRobinSchedule(
      competitionId: '$competitionId-g${group + 1}',
      participantIds: teams,
    ).where((fixture) => fixture.matchweek <= 3);
    fixtures.addAll(schedule.map((fixture) => Fixture(
          id: fixture.id,
          competitionId: competitionId,
          matchweek: weeks[fixture.matchweek - 1],
          homeId: fixture.homeId,
          awayId: fixture.awayId,
        )));
  }
  return List.unmodifiable(fixtures);
}

List<StandingRow> tableFromFixtures(
    List<String> clubIds, Iterable<Fixture> fixtures) {
  final rows = {for (final id in clubIds) id: StandingRow(clubId: id)};
  for (final fixture in fixtures.where((fixture) => fixture.isPlayed)) {
    final home = rows[fixture.homeId];
    final away = rows[fixture.awayId];
    if (home == null || away == null) {
      throw StateError(
          'Fixture references a participant outside its competition.');
    }
    rows[fixture.homeId] = home.record(fixture.homeGoals!, fixture.awayGoals!);
    rows[fixture.awayId] = away.record(fixture.awayGoals!, fixture.homeGoals!);
  }
  final table = rows.values.toList()..sort(_compareRows);
  return List.unmodifiable(table);
}

int _compareRows(StandingRow left, StandingRow right) {
  final points = right.points.compareTo(left.points);
  if (points != 0) return points;
  final difference = right.goalDifference.compareTo(left.goalDifference);
  if (difference != 0) return difference;
  final goals = right.goalsFor.compareTo(left.goalsFor);
  if (goals != 0) return goals;
  return left.clubId.compareTo(right.clubId);
}

({List<String> promoted, List<String> relegated}) promotionAndRelegation({
  required List<StandingRow> firstDivision,
  required List<StandingRow> secondDivision,
}) {
  if (firstDivision.length != 10 || secondDivision.length != 10) {
    throw ArgumentError(
        'Both divisions must contain ten final standings rows.');
  }
  return (
    promoted: [secondDivision[0].clubId, secondDivision[1].clubId],
    relegated: [firstDivision[8].clubId, firstDivision[9].clubId],
  );
}

bool isMajorNationalTournamentSeason(int season) =>
    season > 0 && season % 4 == 0;

String _slug(String value) => value
    .toLowerCase()
    .replaceAll(RegExp('[^a-z0-9]+'), '-')
    .replaceAll(RegExp(r'^-|\$'), '');

String _shortName(String name) {
  final words = name
      .replaceAll(RegExp('[^A-Za-zÀ-ÿ0-9 ]'), '')
      .split(' ')
      .where((word) => word.isNotEmpty)
      .toList();
  if (words.length == 1) {
    return words.first
        .substring(0, words.first.length.clamp(1, 4))
        .toUpperCase();
  }
  return words.take(3).map((word) => word[0]).join().toUpperCase();
}

int _stableHash(String value) {
  var hash = 0x811c9dc5;
  for (final unit in value.codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0x7fffffff;
  }
  return hash;
}
