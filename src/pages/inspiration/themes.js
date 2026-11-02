// pages / inspiration / themes

const COLOR_COMBOS = {
  1: [
    { key: 'w', label: 'White' },
    { key: 'u', label: 'Blue' },
    { key: 'b', label: 'Black' },
    { key: 'r', label: 'Red' },
    { key: 'g', label: 'Green' },
    { key: 'c', label: 'Colorless' },
  ],
  2: [
    { key: 'wu', label: 'Azorius' },
    { key: 'ub', label: 'Dimir' },
    { key: 'br', label: 'Rakdos' },
    { key: 'rg', label: 'Gruul' },
    { key: 'gw', label: 'Selesnya' },
    { key: 'wb', label: 'Orzhov' },
    { key: 'ur', label: 'Izzet' },
    { key: 'bg', label: 'Golgari' },
    { key: 'rw', label: 'Boros' },
    { key: 'gu', label: 'Simic' },
  ],
  3: [
    { key: 'wub', label: 'Esper' },
    { key: 'ubr', label: 'Grixis' },
    { key: 'brg', label: 'Jund' },
    { key: 'rgw', label: 'Naya' },
    { key: 'gwu', label: 'Bant' },
    { key: 'wbg', label: 'Abzan' },
    { key: 'urw', label: 'Jeskai' },
    { key: 'bgu', label: 'Sultai' },
    { key: 'rwb', label: 'Mardu' },
    { key: 'gur', label: 'Temur' },
  ],
  45: [
    { key: 'wubr', label: 'Non-Green' },
    { key: 'ubrg', label: 'Non-White' },
    { key: 'brgw', label: 'Non-Blue' },
    { key: 'rgwu', label: 'Non-Black' },
    { key: 'gwub', label: 'Non-Red' },
    { key: 'wubrg', label: 'Five-Color' },
  ],
};

const EXTRA_THEMES = [
  {
    key: 'artifacts',
    label: 'Artifacts Matter',
    clause:
      '(o:"artifacts you control" or o:"whenever you cast an artifact spell" or o:"whenever an artifact enters")',
  },
  {
    key: 'auras',
    label: 'Auras',
    clause: '(t:aura or o:"enchanted creature" or o:"aura you control")',
  },
  {
    key: 'bigmana',
    label: 'Big Mana / X Spells',
    clause: '(mana:{x} or o:"add {c}{c}" or o:"double the amount of mana")',
  },
  {
    key: 'blink',
    label: 'Blink / Flicker',
    clause:
      '(o:"return it to the battlefield" or o:"return them to the battlefield" or o:"exile target creature you control")',
  },
  {
    key: 'burn',
    label: 'Burn',
    clause: '(o:"deals damage to any target" or o:"deals damage to each opponent")',
  },
  {
    key: 'draw',
    label: 'Card Draw',
    clause: '(o:"whenever you draw" or o:"draw two cards" or o:"draw three cards")',
  },
  {
    key: 'clones',
    label: 'Clones & Copies',
    clause: '(o:"copy of target creature" or o:"copy target" or o:"a copy of")',
  },
  {
    key: 'control',
    label: 'Control',
    clause: '(o:"counter target" or o:"destroy all" or o:"exile target")',
  },
  {
    key: 'counterspells',
    label: 'Counterspells',
    clause: '(o:"counter target spell" or o:"counter that spell")',
  },
  { key: 'cycling', label: 'Cycling', clause: 'kw:cycling' },
  { key: 'deathtouch', label: 'Deathtouch', clause: '(kw:deathtouch or o:"deathtouch")' },
  {
    key: 'defenders',
    label: 'Defenders / Toughness',
    clause: '(t:wall or kw:defender or o:"toughness rather than")',
  },
  { key: 'devotion', label: 'Devotion', clause: 'o:devotion' },
  {
    key: 'discard',
    label: 'Discard',
    clause: '(o:"discards a card" or o:"each opponent discards" or o:madness)',
  },
  {
    key: 'enrage',
    label: 'Enrage / Fight',
    clause: '(o:enrage or o:"fights target" or o:"is dealt damage")',
  },
  { key: 'energy', label: 'Energy', clause: 'o:"energy counter"' },
  {
    key: 'equipment',
    label: 'Equipment',
    clause: '(t:equipment or o:"equipped creature" or o:"equip ")',
  },
  {
    key: 'etb',
    label: 'ETB Value',
    clause:
      '(o:"when this creature enters" or o:"whenever a creature you control enters" or o:"whenever another creature enters")',
  },
  {
    key: 'evasion',
    label: 'Evasion / Unblockable',
    clause: '(o:"can\'t be blocked" or kw:menace or kw:shadow)',
  },
  { key: 'extraturns', label: 'Extra Turns', clause: 'o:"extra turn"' },
  {
    key: 'extracombat',
    label: 'Extra Combats',
    clause: '(o:"additional combat" or o:"untap all creatures" o:"combat")',
  },
  {
    key: 'flying',
    label: 'Flying Matters',
    clause:
      '(o:"creatures with flying you control" or o:"creatures you control with flying" or (kw:flying o:"whenever"))',
  },
  { key: 'goad', label: 'Goad', clause: 'o:goad' },
  {
    key: 'graveyard',
    label: 'Graveyard Value',
    clause: '(o:"from your graveyard" or o:"in your graveyard")',
  },
  {
    key: 'haste',
    label: 'Haste / Aggro',
    clause: '(o:"gain haste" or o:"have haste" or o:"attacks each combat")',
  },
  {
    key: 'infect',
    label: 'Infect / Poison',
    clause: '(kw:infect or kw:toxic or o:"poison counter")',
  },
  {
    key: 'keywords',
    label: 'Keyword Soup',
    clause:
      '(o:"double strike" o:"trample" or o:"has all abilities" or o:"gains flying, first strike")',
  },
  {
    key: 'legends',
    label: 'Legends Matter',
    clause: '(o:"legendary creatures you control" or o:"another legendary" or o:"legendary spell")',
  },
  { key: 'madness', label: 'Madness', clause: '(kw:madness or o:madness)' },
  {
    key: 'monarch',
    label: 'Monarch & Initiative',
    clause: '(o:"the monarch" or o:"the initiative")',
  },
  {
    key: 'morph',
    label: 'Morph / Face-Down',
    clause: '(kw:morph or kw:disguise or o:"face down")',
  },
  { key: 'partygroup', label: 'Party', clause: 'o:"your party"' },
  {
    key: 'pillowfort',
    label: 'Pillowfort',
    clause:
      '(o:"can\'t attack you" or o:"can\'t attack you or" or o:"attack you unless" or o:"can\'t be attacked")',
  },
  {
    key: 'politics',
    label: 'Politics',
    clause:
      '(o:"an opponent of your choice" or o:"you and target opponent" or o:vote or o:"council\'s dilemma")',
  },
  { key: 'proliferate', label: 'Proliferate', clause: 'o:proliferate' },
  { key: 'sagas', label: 'Sagas', clause: '(t:saga or o:"read ahead")' },
  {
    key: 'selfdamage',
    label: 'Self-Damage / Pain',
    clause: '(o:"deals damage to you" or o:"lose 1 life" or o:"pay 2 life")',
  },
  { key: 'snow', label: 'Snow', clause: '(t:snow or o:"snow permanent" or o:"{s}")' },
  {
    key: 'theft',
    label: 'Theft',
    clause: '(o:"gain control of" or o:"you may cast" o:"exile" o:"opponent")',
  },
  {
    key: 'topdeck',
    label: 'Topdeck / Miracle',
    clause: '(kw:miracle or o:"top card of your library" or o:scry)',
  },
  { key: 'treasure', label: 'Treasure', clause: 'o:"treasure token"' },
  {
    key: 'typal',
    label: 'Typal',
    clause:
      '(o:"choose a creature type" or o:"creature type of your choice" or o:"creatures you control of the chosen type")',
  },
  {
    key: 'untap',
    label: 'Untap Shenanigans',
    clause: '(o:"untap target" or o:"untap all" or o:"doesn\'t untap")',
  },
  { key: 'vehicles', label: 'Vehicles', clause: '(t:vehicle or o:"crew ")' },
];

const CURATED_THEME_COMMANDERS = {
  wheels: [
    'Queza, Augur of Agonies',
    'The Locust God',
    'Niv-Mizzet, Parun',
    'Niv-Mizzet, the Firemind',
    'Melek, Izzet Paragon',
    'Jace, Wielder of Mysteries',
    'Ludevic, Necro-Alchemist',
    'Glint-Horn Buccaneer',
    'Faerie Vandal',
    'Chulane, Teller of Tales',
    'Loot, Exuberant Explorer',
    'Stella Lee, Wild Card',
  ],
  lifegain: [
    'Oloro, Ageless Ascetic',
    'Heliod, Sun-Crowned',
    "Ajani's Pridemate",
    'Karlov of the Ghost Council',
    'Lathiel, the Bounteous Dawn',
    'Trelasarra, Moon Dancer',
    'Voice of the Blessed',
    'Cleric Class',
    'Righteous Valkyrie',
    'Liesa, Forgotten Archangel',
    'Sorin of House Markov',
    'Amalia Benavides Aguirre',
    'Vito, Thorn of the Dusk Rose',
    'Lurrus of the Dream-Den',
  ],
  aristocrats: [
    'Judith, the Scourge Diva',
    'Teysa Karlov',
    'Mayhem Devil',
    'Savra, Queen of the Golgari',
    'Yawgmoth, Thran Physician',
    'Grim Haruspex',
    'Zulaport Cutthroat',
    'Elas il-Kor, Sadistic Pilgrim',
    'Chatterfang, Squirrel General',
    'Rankle, Master of Pranks',
    'Braids, Arisen Nightmare',
    'Massacre Girl, Known Killer',
    'Judith, Carnage Connoisseur',
  ],
  spellslinger: [
    'Niv-Mizzet, Parun',
    'Adeliz, the Cinder Wind',
    'Kalamax, the Stormsire',
    'Balmor, Battlemage Captain',
    'Talrand, Sky Summoner',
    'Young Pyromancer',
    'Murmuring Mystic',
    'Zaffai, Thunder Conductor',
    'Ral, Storm Conduit',
    'Jaya Ballard',
    'Erayo, Soratami Ascendant',
    'Stella Lee, Wild Card',
  ],
  tokens: [
    'Rhys the Redeemed',
    'Krenko, Mob Boss',
    'Adeline, Resplendent Cathar',
    'Jetmir, Nexus of Revels',
    'Chatterfang, Squirrel General',
    'Tendershoot Dryad',
    'Mycoloth',
    "Esika's Chariot",
    'Wilhelt, the Rotcleaver',
    "Caesar, Legion's Emperor",
    'Ojer Taq, Deepest Foundation',
    'The Wandering Emperor',
  ],
  mill: [
    'Bruvac the Grandiloquent',
    'Phenax, God of Deception',
    'Jace, Memory Adept',
    'Circu, Dimir Lobotomist',
    'Mirko, Obsessive Theorist',
    'Syr Konrad, the Grim',
    'Consuming Aberration',
    'Drowner of Secrets',
    'Ruin Crab',
    'Hedron Crab',
  ],
  discard: [
    'Tinybones, Trinket Thief',
    'The Haunt of Hightower',
    'Nath of the Gilt-Leaf',
    'Davriel, Rogue Shadowmage',
    "Raiders' Wake",
    'Tergrid, God of Fright',
    'Braids, Arisen Nightmare',
    'Liliana of the Veil',
    'Asylum Visitor',
  ],
  graveyard: [
    'Muldrotha, the Gravetide',
    'Meren of Clan Nel Toth',
    'Karador, Ghost Chieftain',
    'Izoni, Thousand-Eyed',
    'Golgari Grave-Troll',
    'Emry, Lurker of the Loch',
    'Old Stickfingers',
    'Gyome, Master Chef',
    'Mirko, Obsessive Theorist',
    'The Gitrog Monster',
  ],
  artifacts: [
    'Urza, Lord High Artificer',
    'Emry, Lurker of the Loch',
    'Saheeli, the Gifted',
    'Jhoira, Weatherlight Captain',
    'Osgir, the Reconstructor',
    'Tezzeret, Master of the Bridge',
    'Bello, Bard of the Brambles',
    'Kotori, Pilot Prodigy',
    'Shorikai, Genesis Engine',
    'Loran of the Third Path',
  ],
  counters: [
    'Ezuri, Claw of Progress',
    'Hamza, Guardian of Arashin',
    'Falco Spara, Pactweaver',
    'Zaxara, the Exemplary',
    'Vorel of the Hull Clade',
    'Conclave Mentor',
    'The Ozolith',
    'Gavony Township',
    'Animar, Soul of Elements',
    'Kami of Whispered Hopes',
  ],
  treasure: [
    'Magda, Brazen Outlaw',
    'Malcolm, Keen-Eyed Navigator',
    'Jolene, the Plunder Queen',
    'Prosper, Tome-Bound',
    'Gadrak, the Crown-Scourge',
    'Goldspan Dragon',
    'Xorn',
    'Anhelo, the Painter',
  ],
  blink: [
    'Yorion, Sky Nomad',
    'Soulherder',
    'Preston, the Vanisher',
    'Ephemerate',
    'Aminatou, the Fateshifter',
    'Thassa, Deep-Dwelling',
    'Charming Prince',
    'Yarok, the Desecrated',
  ],
  burn: [
    'Torbran, Thane of Red Fell',
    'Ojer Axonil, Deepest Might',
    'Purphoros, God of the Forge',
    'Chandra, Torch of Defiance',
    'Mogis, God of Slaughter',
    'Firebrand Archer',
    'Guttersnipe',
    'Electrostatic Field',
  ],
  draw: [
    'Chulane, Teller of Tales',
    'Queza, Augur of Agonies',
    'Sylvan Library',
    'The Locust God',
    'Faerie Vandal',
    'Chasm Skulker',
    'Ominous Seas',
    'Toothy, Imaginary Friend',
  ],
  reanimator: [
    'Karador, Ghost Chieftain',
    'Muldrotha, the Gravetide',
    "Liliana, Death's Majesty",
    'Doom Whisperer',
    'Athreos, Shroud-Veiled',
    'Emeria Shepherd',
    'Sun Titan',
    'First-Sphere Gargantua',
  ],
  voltron: [
    'Sram, Senior Edificer',
    'Wyleth, Soul of Steel',
    'Kosei, Penitent Warlord',
    'Danitha Capashen, Paragon',
    "Light-Paws, Emperor's Voice",
    'Goro-Goro and Satoru',
    'Halvar, God of Battle',
    'Fynn, the Fangbearer',
  ],
  grouphug: [
    'Kynaios and Tiro of Meletis',
    'Kwain, Itinerant Meddler',
    'Zedruu the Greathearted',
    'Dictate of Kruphix',
    'Howling Mine',
    'Selvala, Explorer Returned',
  ],
  stax: [
    'Grand Arbiter Augustin IV',
    'Lavinia, Azorius Renegade',
    'Drannith Magistrate',
    'Archon of Emeria',
    'Hokori, Dust Drinker',
    'Void Winnower',
    'Opposition Agent',
  ],
  superfriends: [
    'Carth the Lion',
    'Sivitri, Dragon Master',
    'Nicol Bolas, Dragon-God',
    'Teferi, Hero of Dominaria',
    'Ajani, the Greathearted',
    'Nissa, Who Shakes the World',
  ],
  landfall: [
    'Omnath, Locus of Creation',
    'Omnath, Locus of Rage',
    'Tatyova, Benthic Druid',
    'Moraug, Fury of Akoum',
    'Phylath, World Sculptor',
    'Ashaya, Soul of the Wild',
    'Aesi, Tyrant of Gyre Strait',
    'Felothar, Dawn of the Abzan',
  ],
  storm: [
    'Kalamax, the Stormsire',
    'Birgi, God of Storytelling',
    'Zaffai, Thunder Conductor',
    'Aetherflux Reservoir',
    'Thousand-Year Storm',
  ],
  enchantress: [
    "Sythis, Harvest's Hand",
    'Calix, Guided by Fate',
    'Sigarda, Font of Blessings',
    'Sanctum Weaver',
    'Setessan Champion',
    'Eidolon of Blossoms',
    'Anikthea, Hand of Erebos',
    'Zur the Enchanter',
  ],
  pillowfort: [
    'Isperia, Supreme Judge',
    'Arasta of the Endless Web',
    'Ghostly Prison',
    'Propaganda',
    'Sphere of Safety',
    'Michiko Konda, Truth Seeker',
    'Windborn Muse',
    'Queen Marchesa',
  ],
  politics: [
    'Queen Marchesa',
    'Kynaios and Tiro of Meletis',
    'Mathas, Fiend Seeker',
    'Kenrith, the Returned King',
    'Breena, the Demagogue',
  ],
  clones: [
    'Sakashima of a Thousand Faces',
    'Spark Double',
    'Orvar, the All-Form',
    'Riku of Two Reflections',
    'Adrix and Nev, Twincasters',
    'Miirym, Sentinel Wyrm',
  ],
  extraturns: [
    'Nexus of Fate',
    "Alrund's Epiphany",
    "Karn's Temporal Sundering",
    'Medomai the Ageless',
    'Emrakul, the Promised End',
  ],
  infect: [
    'Skithiryx, the Blight Dragon',
    'Fynn, the Fangbearer',
    "Vraska, Betrayal's Sting",
    'Ixhel, Scion of Atraxa',
    'Venerated Rotpriest',
    'Prologue to Phyresis',
  ],
  proliferate: [
    "Atraxa's Skitterfang",
    'Ezuri, Stalker of Spheres',
    'Evolution Sage',
    'Ixhel, Scion of Atraxa',
    'Vorinclex, Monstrous Raider',
    'Tekuthal, Inquiry Dominus',
  ],
  equipment: [
    'Sram, Senior Edificer',
    'Wyleth, Soul of Steel',
    'Koll, the Forgemaster',
    'Halvar, God of Battle',
    'Nahiri, Forged in Fury',
    'Bruenor Battlehammer',
    'Ardenn, Intrepid Archaeologist',
  ],
  auras: [
    "Light-Paws, Emperor's Voice",
    'Sram, Senior Edificer',
    "Sythis, Harvest's Hand",
    'Killian, Ink Duelist',
    'Zur the Enchanter',
    "Sigarda's Aid",
  ],
  vehicles: [
    'Shorikai, Genesis Engine',
    'Kotori, Pilot Prodigy',
    'Greasefang, Okiba Boss',
    'Depala, Pilot Exemplar',
    'Sram, Senior Edificer',
    "Esika's Chariot",
  ],
  monarch: [
    'Queen Marchesa',
    'Marchesa, Resolute Monarch',
    'Palace Jailer',
    'Court of Grace',
    'Court of Cunning',
  ],
  goad: [
    'Marisi, Breaker of the Coil',
    'Karazikar, the Eye Tyrant',
    'Baeloth Barrityl, Entertainer',
    'Agitator Ant',
  ],
  theft: [
    'Gonti, Lord of Luxury',
    "Emrys, Myrddin's Apprentice",
    'Xanathar, Guild Kingpin',
    'Etali, Primal Storm',
    'Thada Adel, Acquisitor',
  ],
  cycling: [
    'Zenith Flare',
    'Gavi, Nest Warden',
    'Fluctuator',
    'Astral Slide',
    'Improbable Alliance',
  ],
  energy: [
    'Aetherworks Marvel',
    'Whirler Virtuoso',
    'Confiscation Coup',
    'Era of Innovation',
    'Satya, Aetherflux Genius',
  ],
  devotion: [
    'Nykthos, Shrine to Nyx',
    'Gray Merchant of Asphodel',
    'Karametra, God of Harvests',
    'Nylea, Keen-Eyed',
    'Erebos, Bleak-Hearted',
  ],
  sagas: [
    'Satsuki, the Living Lore',
    'Tom Bombadil',
    'Narci, Fable Singer',
    'The Kami War',
    'Kiora Bests the Sea God',
  ],
  topdeck: [
    'Yennett, Cryptic Sovereign',
    'Melek, Izzet Paragon',
    'Aminatou, the Fateshifter',
    'Galea, Kindler of Hope',
    'Elminster',
  ],
  typal: [
    'Krenko, Mob Boss',
    'The First Sliver',
    'Edgar Markov',
    'Kaalia of the Vast',
    'Rin and Seri, Inseparable',
    'Isshin, Two Heavens as One',
    'Zada, Hedron Grinder',
    'Ms. Bumbleflower',
  ],
};

const THEME_META = {
  wheels: {
    slugs: ['wheels'],
    broad:
      '(o:"draw seven" or o:"discards their hand" or o:"maximum hand size" or o:"each player draws" or (o:"whenever" o:"draws"))',
  },
  lifegain: {
    slugs: ['lifegain'],
    broad: '(o:"you gain life" or o:"whenever you gain life" or o:"lifelink" o:"whenever")',
  },
  aristocrats: {
    slugs: ['aristocrats'],
    broad:
      '(o:"whenever a creature you control dies" or o:"whenever another creature dies" or o:"sacrifice a creature" or o:"sacrifice another")',
  },
  spellslinger: {
    slugs: ['spellslinger'],
    broad:
      '(o:"whenever you cast an instant" or o:"whenever you cast a noncreature spell" or o:"instant and sorcery" or o:"prowess")',
  },
  tokens: {
    slugs: ['tokens'],
    broad: '(o:"create a" o:token or o:"tokens you control" or o:"whenever a token")',
  },
  mill: {
    slugs: ['mill'],
    broad: '(o:mill or o:"into their graveyard" or o:"cards into your graveyard")',
  },
  discard: {
    slugs: ['discard'],
    broad: '(o:"discards a card" or o:"whenever an opponent discards" or o:madness)',
  },
  graveyard: {
    slugs: ['graveyard'],
    broad: '(o:"from your graveyard" or o:"in your graveyard" or o:"leaves your graveyard")',
  },
  artifacts: {
    slugs: ['artifacts', 'artifact'],
    broad:
      '(o:"artifacts you control" or o:"whenever an artifact" or o:"affinity" or o:"metalcraft")',
  },
  counters: {
    slugs: ['counters', 'plus-one-counters'],
    broad: '(o:"+1/+1 counter" or o:proliferate)',
  },
  treasure: {
    slugs: ['treasure', 'treasures'],
    broad: '(o:"treasure token" or o:"treasures you control")',
  },
  blink: {
    slugs: ['blink', 'flicker'],
    broad:
      '(o:"return it to the battlefield" or o:"return them to the battlefield" or o:"exile target creature you control" or o:"enters the battlefield, ")',
  },
  burn: {
    slugs: ['burn'],
    broad:
      '(o:"deals damage to any target" or o:"deals damage to each opponent" or o:"deals that much damage")',
  },
  draw: {
    slugs: ['card-draw'],
    broad: '(o:"whenever you draw" or o:"draw two cards" or o:"draws a card")',
  },
  reanimator: {
    slugs: ['reanimator', 'reanimate'],
    broad:
      '(o:"from your graveyard to the battlefield" or o:"return target creature card" or o:"leaves your graveyard" or o:"whenever a creature card is put into your graveyard")',
  },
  voltron: {
    slugs: ['voltron'],
    broad:
      '(o:"equipped creature" or o:"enchanted creature" or o:"attached" or o:"aura or equipment" or o:"gets +1/+1 for each")',
  },
  grouphug: {
    slugs: ['group-hug'],
    broad:
      '(o:"each player draws" or o:"each player may draw" or o:"each opponent draws" or o:"each player gains" or o:"each player may put")',
  },
  stax: {
    slugs: ['stax'],
    broad:
      '(o:"players can\'t" or o:"opponents can\'t" or o:"can\'t untap" or o:"spells cost {1} more" or o:"unless that player pays")',
  },
  superfriends: {
    slugs: ['superfriends', 'planeswalkers'],
    broad:
      '(t:planeswalker or o:"planeswalkers you control" or o:"loyalty counter" or o:proliferate)',
  },
  landfall: {
    slugs: ['landfall'],
    broad:
      '(o:landfall or o:"whenever a land you control enters" or o:"whenever a land enters" or o:"play an additional land" or o:"lands you control")',
  },
  storm: {
    slugs: ['storm'],
    broad:
      '(kw:storm or o:"copy it" or o:"copy that spell" or o:"whenever you cast your second spell" or o:"the second spell")',
  },
  enchantress: {
    slugs: ['enchantress', 'enchantments'],
    broad:
      '(o:"whenever you cast an enchantment" or o:"enchantments you control" or o:"whenever an enchantment enters" or o:constellation)',
  },
  pillowfort: {
    slugs: ['pillow-fort', 'pillowfort'],
    broad:
      '(o:"can\'t attack you" or o:"attack you unless" or o:"can\'t be attacked" or o:"attack each combat if able" or o:"prevent all combat damage")',
  },
  politics: {
    slugs: ['politics'],
    broad:
      '(o:"an opponent of your choice" or o:"you and target opponent" or o:vote or o:"council\'s dilemma" or o:"the monarch" or o:goad)',
  },
  clones: {
    slugs: ['clones', 'clone'],
    broad: '(o:"a copy of" or o:"copy target" or o:"enters as a copy" or o:"except it\'s")',
  },
  extraturns: { slugs: ['extra-turns'], broad: '(o:"extra turn" or o:"additional turn")' },
  infect: {
    slugs: ['infect', 'poison'],
    broad: '(kw:infect or kw:toxic or o:"poison counter" or o:corrupted or o:"toxic")',
  },
  proliferate: {
    slugs: ['proliferate'],
    broad: '(o:proliferate or o:"one or more counters" or o:"an additional counter")',
  },
  equipment: {
    slugs: ['equipment', 'equipments'],
    broad:
      '(t:equipment or o:"equipped creature" or o:"equip " or o:"attach" or o:"equipment you control")',
  },
  auras: {
    slugs: ['auras', 'enchant'],
    broad:
      '(t:aura or o:"enchanted creature" or o:"aura you control" or o:"auras you control" or o:"aura spell")',
  },
  cycling: {
    slugs: ['cycling'],
    broad: '(kw:cycling or o:cycling or o:"cycle a card" or o:"discard a card: ")',
  },
  energy: { slugs: ['energy'], broad: '(o:"energy counter" or o:"{e}")' },
  devotion: {
    slugs: ['devotion'],
    broad: '(o:devotion or o:"mana value of permanents you control" or o:"colored mana symbols")',
  },
  monarch: {
    slugs: ['monarch'],
    broad: '(o:"the monarch" or o:"the initiative" or o:"becomes the monarch")',
  },
  goad: {
    slugs: ['goad'],
    broad: '(o:goad or o:"attacks each combat if able" or o:"must attack")',
  },
  theft: {
    slugs: ['theft'],
    broad:
      '(o:"gain control of" or (o:"you may cast" o:exile o:opponent) or o:"from an opponent\'s" or o:"that player\'s library")',
  },
  madness: {
    slugs: ['madness'],
    broad: '(kw:madness or o:madness or o:"discard a card" o:"whenever")',
  },
  morph: {
    slugs: ['morph'],
    broad: '(kw:morph or kw:disguise or kw:manifest or o:"face down" or o:"turned face up")',
  },
  sagas: {
    slugs: ['sagas', 'saga'],
    broad: '(t:saga or o:"read ahead" or o:"lore counter" or o:"sagas you control" or o:"chapter")',
  },
  partygroup: {
    slugs: ['party'],
    broad:
      '(o:"your party" or o:"full party" or (t:cleric or t:rogue or t:warrior or t:wizard) o:"party")',
  },
  snow: { slugs: ['snow'], broad: '(t:snow or o:"snow permanent" or o:"snow land" or o:"{s}")' },
  topdeck: {
    slugs: ['topdeck', 'top-deck'],
    broad: '(kw:miracle or o:"top card of your library" or o:"look at the top" or o:scry)',
  },
  bigmana: {
    slugs: ['big-mana'],
    broad:
      '(mana:{x} or o:"add {c}{c}" or o:"double the amount of mana" or o:"whenever you tap a permanent for mana" or mv>=7)',
  },
  defenders: {
    slugs: ['defenders', 'walls'],
    broad:
      '(t:wall or kw:defender or o:"toughness rather than" or o:"creatures with defender" or o:"assign combat damage equal to")',
  },
  deathtouch: {
    slugs: ['deathtouch'],
    broad: '(kw:deathtouch or o:deathtouch or o:"deals damage to a creature" o:destroy)',
  },
  flying: {
    slugs: ['flying', 'flyers'],
    broad:
      '(o:"creatures with flying you control" or o:"creatures you control with flying" or (kw:flying o:"whenever") or o:"flying creatures you control")',
  },
  extracombat: {
    slugs: ['extra-combats', 'extra-combat'],
    broad: '(o:"additional combat" or o:"extra combat" or (o:"untap all creatures" o:combat))',
  },
  enrage: {
    slugs: ['enrage'],
    broad:
      '(o:enrage or o:"whenever this creature is dealt damage" or o:"fights target" or o:"deals damage equal to its power")',
  },
  vehicles: {
    slugs: ['vehicles'],
    broad:
      '(t:vehicle or o:"crew " or o:"vehicles you control" or o:"becomes an artifact creature" or t:pilot)',
  },
  typal: {
    slugs: ['typal', 'tribal'],
    broad:
      '(o:"choose a creature type" or o:"creature type of your choice" or o:"of the chosen type" or o:"share a creature type" or o:"other" o:"you control get +1/+1")',
  },
};

const BROWSE_THEMES = THEME_CHIPS.concat(EXTRA_THEMES)
  .filter((t, i, arr) => arr.findIndex((x) => x.key === t.key) === i)
  .map((t) => Object.assign({}, t, THEME_META[t.key] || {}))
  .sort((a, b) => a.label.localeCompare(b.label));

// EDHREC color-page slugs are always in strict WUBRG order (themes/x/wbr,
// never themes/x/rwb). Our combo keys are in guild/wedge order, so they must
// be re-sorted before building an EDHREC URL or the page 404s.
function browseColorClause() {
  const sel = state.browseSel;
  // A specific combo means EXACTLY that color identity — Mardu (rwb) returns

  // (The earlier c= was invalid syntax; id= is exact identity, the right dim.)
  if (sel.combo) return sel.combo === 'c' ? 'id=c' : 'id=' + sel.combo;
  const cc = COLOR_COUNTS.find((c) => c.key === sel.count);
  return (cc && cc.clause) || '';
}

/* Scryfall function tags (otag:) per theme — the community-maintained
   functional classification, far more precise than oracle-text guessing.
   Combined with the oracle patterns in THEME_META for full coverage. A theme
   query is (any otag OR any oracle-pattern), so a card qualifies if Scryfall
   tagged it OR its text matches. */
const THEME_OTAGS = {
  wheels: ['wheel', 'draw-seven'],
  lifegain: ['lifegain', 'life-gain-payoff', 'lifegain-matters'],
  aristocrats: ['sacrifice-outlet', 'aristocrat', 'death-trigger', 'sacrifice-payoff'],
  spellslinger: ['spellslinger', 'spells-matter', 'prowess', 'magecraft'],
  tokens: ['token-generation', 'tokens-matter', 'populate', 'go-wide'],
  mill: ['mill', 'self-mill'],
  discard: ['discard-outlet', 'forced-discard', 'madness'],
  graveyard: ['graveyard-recursion', 'graveyard-matters', 'delirium', 'threshold'],
  artifacts: ['artifact-matters', 'affinity', 'metalcraft', 'improvise'],
  counters: ['plus-one-plus-one-counters', 'counter-synergy', 'proliferate'],
  treasure: ['treasure', 'treasure-tokens', 'ramp'],
  blink: ['blink', 'flicker', 'enters-the-battlefield'],
  burn: ['burn', 'direct-damage', 'damage-to-any-target'],
  draw: ['card-advantage', 'card-draw', 'draw-matters'],
  reanimator: ['reanimation', 'reanimate', 'graveyard-recursion'],
  voltron: ['voltron', 'aura-payoff', 'equipment-payoff'],
  grouphug: ['group-hug', 'symmetrical-draw'],
  stax: ['stax', 'tax', 'resource-denial', 'hatebear'],
  superfriends: ['planeswalker-matters', 'superfriends', 'proliferate'],
  landfall: ['landfall', 'lands-matter', 'ramp'],
  storm: ['storm', 'spell-copy', 'free-spells'],
  enchantress: ['enchantment-matters', 'constellation', 'enchantress'],
  pillowfort: ['pillowfort', 'tax-attackers', 'deterrent'],
  politics: ['politics', 'vote', 'monarch', 'goad'],
  clones: ['clone', 'copy'],
  extraturns: ['extra-turn', 'time-walk'],
  infect: ['infect', 'toxic', 'poison', 'proliferate'],
  proliferate: ['proliferate', 'counter-synergy'],
  equipment: ['equipment', 'equipment-payoff', 'voltron'],
  auras: ['aura', 'aura-payoff', 'enchantment-matters'],
  cycling: ['cycling', 'cycling-payoff'],
  energy: ['energy'],
  devotion: ['devotion'],
  monarch: ['monarch'],
  goad: ['goad', 'forced-attack'],
  theft: ['theft', 'steal', 'mind-control'],
  madness: ['madness', 'discard-outlet'],
  morph: ['morph', 'disguise', 'manifest'],
  sagas: ['saga', 'chapter-matters'],
  partygroup: ['party', 'party-matters'],
  snow: ['snow', 'snow-matters'],
  topdeck: ['topdeck', 'miracle', 'scry', 'top-of-library-matters'],
  bigmana: ['ramp', 'big-mana', 'mana-doubler', 'cost-reduction'],
  defenders: ['defender', 'walls-matter'],
  deathtouch: ['deathtouch', 'deathtouch-synergy'],
  flying: ['flying-matters', 'flying'],
  extracombat: ['extra-combat', 'additional-combat'],
  enrage: ['enrage', 'fight', 'damage-synergy'],
  vehicles: ['vehicle', 'crew', 'vehicles-matter'],
  typal: ['typal', 'changeling', 'tribal-matters'],
};

function themeQueryClause(themeKey, admiralMode) {
  const meta = THEME_META[themeKey] || {};
  const otags = THEME_OTAGS[themeKey] || [];
  const parts = [];
  otags.forEach((t) => parts.push('otag:' + t));
  if (meta.broad) {
    // meta.broad is already a parenthesised OR-group of oracle patterns —
    // splice its inner terms in so the whole thing is one big OR.
    const inner = meta.broad.replace(/^\(/, '').replace(/\)$/, '');
    parts.push(inner);
  }
  if (!parts.length) return '';
  return '(' + parts.join(' or ') + ')';
}

/* Inspiration's chosen format drives every leader query on the page. */
function browseFmt() {
  return state.browseFormat || 'commander';
}

function browseKey() {
  return JSON.stringify(state.browseSel) + '|' + browseFmt();
}

function browseLeaderBase() {
  return browseFmt() === 'paupercommander'
    ? 't:creature r:uncommon'
    : browseFmt() === 'duel'
      ? 'is:duelcommander'
      : 't:legendary t:creature';
}

function browseSfOpts() {
  return { format: browseFmt() === 'paupercommander' ? 'any' : browseFmt() };
}

/* Pauper Commander leaders are uncommon creatures, legendary or not. */
function leaderTypeOk(c) {
  return isLegendary(c) || (state.screen === 'browse' && browseFmt() === 'paupercommander');
}

function browseCommanderMode() {
  return !state.browseSel.type;
}

function browseReady() {
  const sel = state.browseSel;
  return !!(sel.combo || sel.theme || sel.tribe || sel.type);
}

/* ---- EDHREC play-data themes for the Inspiration browse page ----
   The catalog comes from /pages/tags.json (cached a week); picking one loads
   that theme's top commanders from its /pages/tags/<slug>.json page, resolved
   through the app's own legality engine and filtered to the chosen colors
   client-side. The built-in Scryfall-clause themes stay as the backbone —
   EDHREC entries extend the list with everything the community actually
   builds (Aikido and friends). */
function edhrecTagCatalogFrom(data) {
  // The tags hub's exact shape is undocumented, so walk the whole document
  // and harvest anything that looks like a theme link, wherever it lives.
  const out = [],
    seen = new Set();
  const push = (label, slug, count) => {
    label = String(label || '').trim();
    slug = String(slug || '')
      .trim()
      .toLowerCase();
    if (
      !label ||
      !slug ||
      slug === 'tags' ||
      slug === 'themes' ||
      slug === 'typal' ||
      seen.has(slug)
    )
      return;
    seen.add(slug);
    out.push({ label, slug, count: count || 0 });
  };
  const walk = (node, depth) => {
    if (!node || depth > 14) return;
    if (Array.isArray(node)) {
      node.forEach((x) => walk(x, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;
    const u = typeof node.url === 'string' ? node.url : '';
    const m = u.match(
      /^\/(?:tags|typal|themes)\/(?:themes\/|typal\/)?([a-z0-9%+-]+)(?:\/[a-z0-9%+-]+)?\/?$/i,
    );
    if (m)
      push(
        node.name || node.value || node.label || m[1].replace(/-/g, ' '),
        m[1],
        node.num_decks || node.count || 0,
      );
    if (typeof node.slug === 'string' && (node.value || node.tag))
      push(node.value || node.tag, node.slug, node.count || 0);
    for (const k in node) {
      if (k !== 'cardviews' || m || true) walk(node[k], depth + 1);
    }
  };
  try {
    walk(data, 0);
  } catch (e) {}
  out.sort((a, b) => (b.count || 0) - (a.count || 0));
  return out.slice(0, 500);
}

/* EDHREC uses one canonical slug per theme, but commander pages sometimes
   carry a hyphenless variant (pillow-fort vs pillowfort). Comparing on a
   normalized key — letters and digits only — makes those the same theme. */
/* 1.33: the advanced search's picked tags, from their comma list. */
function otagSearchList(v) {
  const out = [];
  String(v || '')
    .split(',')
    .forEach((t) => {
      const k = t.trim().toLowerCase().replace(/"/g, '').replace(/\s+/g, '-');
      if (k && !out.includes(k)) out.push(k);
    });
  return out;
}

function normTagKey(slug) {
  return String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function dedupeTagList(list) {
  // Highest census count wins its key, so the real EDHREC catalog entry
  // outlives any folded-in page variant with no count.
  const byKey = new Map();
  (list || []).forEach((t) => {
    const k = normTagKey(t.slug);
    const prev = byKey.get(k);
    if (!prev || (t.count || 0) > (prev.count || 0)) byKey.set(k, t);
  });
  return Array.from(byKey.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

async function ensureEdhrecTags() {
  if (state.edhrecTags && state.edhrecTags.length && state._edtagsFull) return;
  if (state._edtagsAt && Date.now() - state._edtagsAt < 60000) return; // retry at most once a minute
  state._edtagsAt = Date.now();
  try {
    const raw = localStorage.getItem('admiral_app:edhrecTags4');
    if (raw) {
      const j = JSON.parse(raw);
      // A partial harvest (hub sample only — the full census fetch failed)
      // is marked p:1 and only trusted for an hour, so the census keeps
      // being retried until the complete EDHREC list lands. A catalog
      // WITHOUT A SINGLE KINDRED entry is the same kind of half-harvest
      // (the typal census failed that day): serve it now, but trust it
      // only an hour — the Kindred dropdown can never again be frozen
      // empty for two weeks (v2.51.585).
      if (j && Array.isArray(j.v) && j.v.length) {
        const valid = j.v.filter(
          (t) =>
            t && typeof t.slug === 'string' && t.slug && typeof t.label === 'string' && t.label,
        );
        const deduped = dedupeTagList(valid);
        let hasKin = deduped.some((t) => t.k);
        if (!hasKin) {
          try {
            const ks = kindredNameSet();
            hasKin = deduped.some((t) => ks.has(String(t.label || '').toLowerCase()));
          } catch (e) {}
        }
        const complete = edtagsLooksComplete(deduped);
        const maxAge = j.p || !hasKin ? 3600 * 1000 : 14 * 24 * 3600 * 1000;
        // A thin list (a single commander's themes, no Kindred) is not a
        // catalog at all: never served, fetched fresh instead.
        if (complete && Date.now() - (j.t || 0) < maxAge) {
          state.edhrecTags = deduped;
          edtagsMarkFull(j.t);
          // A shrunken list means near-duplicate variants were merged — persist
          // the clean catalog so they never come back (keeping its partial flag).
          if (deduped.length && deduped.length < valid.length) {
            try {
              localStorage.setItem(
                'admiral_app:edhrecTags4',
                JSON.stringify(
                  Object.assign({ t: j.t || Date.now(), v: deduped }, j.p ? { p: 1 } : {}),
                ),
              );
            } catch (e) {}
          }
          if (state.edhrecTags.length) return;
        }
      }
    }
  } catch (e) {}
  // The hub overview only shows a top SAMPLE per category — the full theme
  // census lives one level deeper. Harvest both documents and merge; the
  // walker dedupes by slug across them.
  const docs = [];
  for (const path of ['/pages/tags/themes.json', '/pages/tags.json']) {
    try {
      const d = await edhrecFetchJson(path);
      if (d) docs.push(d);
    } catch (e) {}
  }
  // The Kindred census lives on its own page — /tags/typal carries every
  // creature-type tag EDHREC tracks (120+, Dragons down to Symbiotes). The
  // hub sample only ever showed a top handful, which after filtering left
  // basically Humans. Harvest it separately so its entries can be flagged
  // kindred AT THE SOURCE (k:1) — data beats guessing from a name list,
  // which never knew Tyranids or Time Lords were creature types.
  let typalTags = [];
  try {
    // EDHREC has served the Kindred census from two spots over time — try
    // both; the first that yields entries wins. Misses are never cached.
    for (const tp of ['/pages/tags/typal.json', '/pages/typal.json']) {
      const td = await edhrecFetchJson(tp);
      if (td) {
        typalTags = edhrecTagCatalogFrom(td).map((t) => Object.assign(t, { k: 1 }));
        if (typalTags.length) break;
      }
    }
  } catch (e) {}
  const themeTags = edhrecTagCatalogFrom(docs);
  // Typal first, so a slug on both pages keeps its kindred flag and census count.
  const seenSlug = new Set();
  const tags = [];
  typalTags.concat(themeTags).forEach((t) => {
    const k = normTagKey(t.slug);
    if (seenSlug.has(k)) return;
    seenSlug.add(k);
    tags.push(t);
  });
  tags.sort((a, b) => (b.count || 0) - (a.count || 0));
  if (tags.length) {
    state.edhrecTags = tags;
    edtagsMarkFull(Date.now());
    // Fewer than 60 non-kindred themes can only be the hub SAMPLE — the
    // census document did not land. Store it as partial (p:1) so it serves
    // the dropdown today but is retried within the hour, not frozen for
    // two weeks. The complete EDHREC list replaces it the moment it loads.
    const themeCount = tags.filter((t) => !t.k).length;
    // Zero kindred entries = the typal census did not land — store as
    // partial so it is retried within the hour, exactly like a theme
    // half-harvest (v2.51.585).
    const kinCount = tags.filter((t) => t.k).length;
    try {
      localStorage.setItem(
        'admiral_app:edhrecTags4',
        JSON.stringify(
          themeCount < 60 || !kinCount
            ? { t: Date.now(), v: tags, p: 1 }
            : { t: Date.now(), v: tags },
        ),
      );
      localStorage.removeItem('admiral_app:edhrecTags3');
      localStorage.removeItem('admiral_app:edhrecTags2');
    } catch (e) {}
    if (state.screen === 'browse') render();
  }
}

const COLOR_TAG_NAMES = new Set([
  'azorius',
  'dimir',
  'rakdos',
  'gruul',
  'selesnya',
  'orzhov',
  'izzet',
  'golgari',
  'boros',
  'simic',
  'bant',
  'esper',
  'grixis',
  'jund',
  'naya',
  'abzan',
  'jeskai',
  'sultai',
  'mardu',
  'temur',
  'yore-tiller',
  'glint-eye',
  'dune-brood',
  'ink-treader',
  'witch-maw',
  'five-color',
  'five color',
  'wubrg',
  'colorless',
]);

function isColorComboTag(t) {
  const l = String(t.label || '')
    .toLowerCase()
    .trim();
  const sl = String(t.slug || '').toLowerCase();
  if (COLOR_TAG_NAMES.has(l) || COLOR_TAG_NAMES.has(sl)) return true;
  return /^(mono[- ]|sans[- ]|four[- ]color)/.test(l) || /^(mono-|sans-|four-color)/.test(sl);
}

function edhrecComboCounts() {
  const map = {};
  (state.edhrecTags || []).forEach((t) => {
    if (isColorComboTag(t)) map[String(t.slug || t.label).toLowerCase()] = t.count || 0;
  });
  return map;
}

function sortCombosByPlay(list) {
  // EDHREC's colour-combination tags carry deck counts — use them to order
  // the colour dropdown by what people actually play. Falls back to the
  // built-in order until the catalog has loaded.
  const cc = edhrecComboCounts();
  if (!Object.keys(cc).length) return list;
  const countFor = (c) => {
    const l = String(c.label || '').toLowerCase();
    return cc[l] ?? cc['mono-' + l] ?? 0;
  };
  return list.slice().sort((a, b) => countFor(b) - countFor(a));
}

const EDHREC_COMBO_SLUGS = {
  w: ['mono-white'],
  u: ['mono-blue'],
  b: ['mono-black'],
  r: ['mono-red'],
  g: ['mono-green'],
  c: ['colorless'],
  wu: ['azorius'],
  ub: ['dimir'],
  br: ['rakdos'],
  rg: ['gruul'],
  gw: ['selesnya'],
  wb: ['orzhov'],
  ur: ['izzet'],
  bg: ['golgari'],
  rw: ['boros'],
  gu: ['simic'],
  wub: ['esper'],
  ubr: ['grixis'],
  brg: ['jund'],
  rgw: ['naya'],
  gwu: ['bant'],
  wbg: ['abzan'],
  urw: ['jeskai'],
  bgu: ['sultai'],
  rwb: ['mardu'],
  gur: ['temur'],
  // EDHREC's live four-colour slugs are the Nephilim nicknames (verified:
  // /commanders/yore-tiller and /tags/themes/yore-tiller both resolve).
  // The sans-* spellings stay as fallback only — trying them FIRST burned a
  // guaranteed-miss proxy fetch (up to the full timeout) on every 4c lookup.
  wubr: ['yore-tiller', 'sans-green'],
  ubrg: ['glint-eye', 'sans-white'],
  brgw: ['dune-brood', 'sans-blue'],
  rgwu: ['ink-treader', 'sans-black'],
  gwub: ['witch-maw', 'sans-red'],
  wubrg: ['five-color'],
};

async function ensureComboTagRanks(comboKey) {
  // EDHREC publishes colour-scoped theme and Kindred rankings (the pages the
  // user browses as /tags/themes/mono-black etc). Fetch this combo's pair
  // once, cache six hours, and the dropdowns re-sort by what that colour
  // actually plays.
  if (!comboKey) return;
  state._comboRanks = state._comboRanks || {};
  const slot = state._comboRanks[comboKey];
  if (slot && (slot.loading || Date.now() - slot.t < 6 * 3600 * 1000)) return;
  state._comboRanks[comboKey] = { loading: true, t: Date.now(), themes: null, typal: null };
  const cands = EDHREC_COMBO_SLUGS[comboKey] || [];
  const grab = async (kind) => {
    for (const cs of cands) {
      const data = await edhrecFetchJson('/pages/tags/' + kind + '/' + cs + '.json');
      const list = data ? edhrecTagCatalogFrom(data) : [];
      if (list.length) {
        const m = {};
        list.forEach((t) => {
          m[t.slug] = t.count || 0;
        });
        return m;
      }
    }
    return null;
  };
  const [th, ty] = await Promise.all([grab('themes'), grab('typal')]);
  state._comboRanks[comboKey] = { loading: false, t: Date.now(), themes: th, typal: ty };
  if ((state.screen === 'browse' || state.screen === 'inspiration') && (th || ty)) render();
}

/* The deck's colour-combo key, matched into EDHREC_COMBO_SLUGS regardless of
   letter order — the map spells combos the traditional Magic way ('bgu' for
   Sultai, 'rw' for Boros), so we look up by SORTED letters rather than trying
   to reproduce that convention. */
const _comboKeyBySorted = {};

Object.keys(EDHREC_COMBO_SLUGS).forEach((k) => {
  _comboKeyBySorted[k.split('').sort().join('')] = k;
});

function deckComboKey(d) {
  if (!d || !d.admiral) return null;
  const set = new Set();
  deckLeaders(d).forEach((L) => (L.color_identity || []).forEach((c) => set.add(c)));
  if (!set.size) return 'c';
  const sorted = Array.from(set)
    .map((c) => String(c).toLowerCase())
    .sort()
    .join('');
  return _comboKeyBySorted[sorted] || null;
}

/* Themes ranked for one specific leader: their own EDHREC page's theme list.
   Different captains in the same colours build differently — Mogis plays
   group-slug where another Rakdos leader plays sacrifice — so this outranks
   colour-wide data. Cached per leader pair for the session; the page data
   itself rides the 7-day EDHREC cache. */
async function ensureCommanderThemes(d) {
  if (!d || !d.admiral) return;
  state._cmdrThemes = state._cmdrThemes || {};
  const key = d.admiral.name + (d.partner ? '|' + d.partner.name : '');
  if (state._cmdrThemes[key]) return;
  state._cmdrThemes[key] = { loading: true, themes: [] };
  try {
    const page = d.partner
      ? await edhrecPairPage(d.admiral, d.partner)
      : await edhrecCommanderPage(d.admiral);
    state._cmdrThemes[key] = { loading: false, themes: (page && page.themes) || [] };
    if (((page && page.themes) || []).length) mergeEdhrecTags(page.themes);
  } catch (e) {
    state._cmdrThemes[key] = { loading: false, themes: [] };
  }
  if (state.screen === 'inspiration' && state.inspireDeckId === d.id) render();
}

function commanderThemeRanks(d) {
  if (!d || !d.admiral || !state._cmdrThemes) return null;
  const key = d.admiral.name + (d.partner ? '|' + d.partner.name : '');
  const slot = state._cmdrThemes[key];
  return slot && !slot.loading && slot.themes.length ? slot.themes : null;
}

/* BROWSE_THEMES in two tiers: themes THIS leader's community actually builds
   (their page's list, by deck count) float to the top; beneath them, the
   colour combo's play data orders the rest; alphabetical settles ties. */
function rankedBrowseThemeOptions(comboKey, d) {
  const slot = comboKey && state._comboRanks && state._comboRanks[comboKey];
  const rm = (slot && !slot.loading && slot.themes) || null;
  const comboRank = {};
  if (rm && (state.edhrecTags || []).length) {
    state.edhrecTags.forEach((t) => {
      if (rm[t.slug] != null) comboRank[String(t.label || '').toLowerCase()] = rm[t.slug];
    });
  }
  const cmdrRank = {};
  const ct = d ? commanderThemeRanks(d) : null;
  if (ct)
    ct.forEach((t, i) => {
      cmdrRank[String(t.label || '').toLowerCase()] = (t.count || 0) + (ct.length - i);
    });
  const opts = BROWSE_THEMES.map((c) => {
    const lk = String(c.label || '').toLowerCase();
    return { v: c.key, l: c.label, r1: cmdrRank[lk] || 0, r2: comboRank[lk] || 0 };
  });
  opts.sort((a, b) => b.r1 - a.r1 || b.r2 - a.r2 || a.l.localeCompare(b.l));
  return opts.map((o) => ({ v: o.v, l: o.l }));
}

function comboRankMap(kind) {
  const ck = state.browseSel && state.browseSel.combo;
  const slot = ck && state._comboRanks && state._comboRanks[ck];
  return (slot && !slot.loading && slot[kind]) || null;
}

function browseThemeOptions() {
  try {
    return browseThemeOptionsInner();
  } catch (e) {
    try {
      console.error('theme options failed, using built-ins:', e);
    } catch (_e) {}
    return BROWSE_THEMES.map((c) => ({ v: c.key, l: c.label }));
  }
}

function browseThemeOptionsInner() {
  // The EDHREC catalog is the single source of truth for the dropdown —
  // mixing in the app's own list next to it is what produced near-duplicate
  // pairs like Pillow Fort / Pillowfort. The built-ins survive only as the
  // offline parachute for a first run without any harvested catalog.
  const ed = state.edhrecTags || [];
  const ks = kindredNameSet();
  if (!ed.length) return BROWSE_THEMES.map((c) => ({ v: c.key, l: c.label }));
  const rm = comboRankMap('themes');
  const seen = new Set();
  const out = [];
  ed.forEach((t) => {
    if (!t) return;
    const label = String(t.label || '').trim();
    const lk = label.toLowerCase();
    if (!label || t.k || ks.has(lk) || isColorComboTag(t) || seen.has(lk)) return;
    seen.add(lk);
    out.push({ v: 'ed:' + t.slug, l: label, r: rm ? rm[t.slug] || 0 : 0, c: +t.count || 0 });
  });
  // EDHREC popularity IS the order, exactly like the Kindred list: the
  // combo-scoped rank leads when a color combination is chosen, the deck
  // census decides otherwise, and the label only breaks true ties -- the
  // old alphabetical sort threw the census order away.
  out.sort((a, b) => b.r - a.r || b.c - a.c || a.l.localeCompare(b.l));
  return out.map((o) => ({ v: o.v, l: o.l }));
}

function mergeEdhrecTags(list) {
  // Commander pages carry themes the hub's top-list omits (Aikido and other
  // niche builds) — fold every theme we meet into the stored catalog so the
  // dropdown keeps growing with use.
  if (!Array.isArray(list) || !list.length) return;
  // Only a COMPLETE catalog (the EDHREC census, loaded or stored) may grow.
  // With none loaded yet, one commander's ten themes once BECAME the whole
  // catalog -- stored with a fresh date, so Inspiration showed that deck's
  // themes and zero Kindred for good. They wait aside until the census is in.
  if (!state._edtagsFull) {
    state._edtagsExtra = (state._edtagsExtra || []).concat(list.filter(Boolean));
    return;
  }
  const cur = state.edhrecTags || [];
  const have = new Set(cur.map((t) => normTagKey(t.slug)));
  let grew = false;
  list.forEach((t) => {
    if (!t) return;
    // Sanitize at the door: a label-less entry once crashed the theme sort.
    const slug = String(t.slug || '')
      .trim()
      .toLowerCase();
    if (!slug || have.has(normTagKey(slug))) return;
    const label =
      String(t.label || '').trim() ||
      slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    cur.push({ label, slug, count: +t.count || 0 });
    have.add(normTagKey(slug));
    grew = true;
  });
  if (grew) {
    state.edhrecTags = cur;
    // Keep the census's own date (and partial flag): growing the list must
    // never make an old or half catalog look fresh.
    try {
      const old = JSON.parse(localStorage.getItem('admiral_app:edhrecTags4') || '{}');
      localStorage.setItem(
        'admiral_app:edhrecTags4',
        JSON.stringify(
          Object.assign({ t: old.t || state._edtagsT || 0, v: cur }, old.p ? { p: 1 } : {}),
        ),
      );
    } catch (e) {}
  }
}

/* A real EDHREC census has well over a hundred themes plus the Kindred
   list; anything thinner is a half harvest or a poisoned leftover. */
function edtagsLooksComplete(list) {
  const ks = kindredNameSet();
  const kin = list.filter((t) => t.k || ks.has(String(t.label || '').toLowerCase())).length;
  return kin >= 10 && list.length - kin >= 60;
}

function edtagsMarkFull(t) {
  state._edtagsFull = true;
  state._edtagsT = t || Date.now();
  const extra = state._edtagsExtra;
  state._edtagsExtra = null;
  if (extra && extra.length) mergeEdhrecTags(extra);
}

const KINDRED_PLURAL_IRREGULAR = {
  Elf: 'Elves',
  Wolf: 'Wolves',
  Werewolf: 'Werewolves',
  Dwarf: 'Dwarves',
  Mouse: 'Mice',
  Fox: 'Foxes',
  Sphinx: 'Sphinxes',
  Phoenix: 'Phoenixes',
  Ox: 'Oxen',
  Octopus: 'Octopuses',
};

/* Scryfall's live creature-type catalog: the complete current list, cached
   a month. TYPAL_TRIBES becomes the offline parachute — new types from
   fresh sets classify themselves on the next catalog refresh. */
async function ensureCreatureTypes() {
  try {
    const raw = localStorage.getItem(LS_PREFIX + 'creatureTypes');
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.v) && p.v.length) {
        state._creatureTypes = p.v;
        state._kindredSet = null;
        if (Date.now() - (p.t || 0) < 30 * 24 * 3600 * 1000) return;
      }
    }
  } catch (e) {}
  try {
    const res = await sfFetch(SF_BASE + '/catalog/creature-types', 0, true);
    if (res && res.ok) {
      const d = await res.json();
      if (Array.isArray(d.data) && d.data.length > 50) {
        state._creatureTypes = d.data;
        state._kindredSet = null;
        try {
          localStorage.setItem(
            LS_PREFIX + 'creatureTypes',
            JSON.stringify({ t: Date.now(), v: d.data }),
          );
        } catch (e) {}
      }
    }
  } catch (e) {}
}

/* The Data Sources panel: every living data feed, its age, and a refresh
   lever — turns "is this current?" into a glance. */
function _srcAge(t) {
  if (!t) return '—';
  const h = Math.floor((Date.now() - t) / 3600000);
  if (h < 1) return trS('just now');
  if (h < 48) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

/* Plain-words verdict on the local search lane. Recomputed by
   wireDataSources() once the set catalogue and the snapshot date are both
   known -- until then it says so rather than guessing. */
function _offlineSearchNote() {
  const n = state._lsNewSets;
  if (n === undefined) return '…';
  if (n === null) return trS('live (set list unknown)');
  if (!n.length) return trS('fully offline');
  return '+' + n.length + ' ' + (n.length === 1 ? trS('new set live') : trS('new sets live'));
}

function dataSourcesHtml() {
  let tagsT = 0,
    ctT = 0;
  try {
    tagsT = JSON.parse(localStorage.getItem('admiral_app:edhrecTags4') || '{}').t || 0;
  } catch (e) {}
  try {
    ctT = JSON.parse(localStorage.getItem(LS_PREFIX + 'creatureTypes') || '{}').t || 0;
  } catch (e) {}
  const rows = [
    { id: 'sets', n: 'Scryfall sets & spoilers', t: autoSets.lastCheck || 0 },
    { id: 'tags', n: 'EDHREC themes & Kindred', t: tagsT },
    { id: 'dprices', n: 'Card prices', t: Date.parse(_dPricesBuilt) || 0, noBtn: true },

    {
      id: 'bulk',
      n: 'Local card database',
      t: null,
      note: state._bulkMetaCache
        ? state._bulkMetaCache.cards +
          ' cards' +
          (state._bulkMetaCache.tagCards ? ' · tags' : '') +
          ' · ' +
          trS('built') +
          ' ' +
          _srcAge(Date.parse(state._bulkMetaCache.built) || state._bulkMetaCache.savedAt)
        : '—',
    },
    // What that database actually buys you, in the only terms that matter:
    // does a search still need the network, and if so, how little of it.
    { id: 'lsrch', n: 'Offline search', t: null, note: _offlineSearchNote() },
  ];
  return (
    rows
      .map(
        (r) => `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
    <span style="flex:1;">${escapeHtml(trS(r.n))}</span>
    <span style="color:var(--sub-text-2);${r.id === 'lsrch' ? 'text-decoration:underline dotted;text-underline-offset:3px;cursor:pointer;' : ''}"${r.id === 'lsrch' ? ' data-lsinfo="1"' : ''}>${r.note ? r.note : _srcAge(r.t)}</span>
    ${r.id === 'sets' || r.id === 'tags' ? `<button class="icon-btn" data-srcrefresh="${r.id}" style="flex:none;width:28px;height:28px;font-size:13px;">↻</button>` : ''}
  </div>`,
      )
      .join('') +
    `<button class="ghost-btn" id="bulkDlNow" style="width:100%;margin-top:8px;padding:7px 12px;font-size:13px;">⬇ ${trS('Download card database now')}</button><button class="ghost-btn" id="sfDiagCopy" hidden>${inlIco('clipboard')}${trS('Copy diagnostics')}</button>`
  );
}

function wireDataSources() {
  // The Local card database row reads IndexedDB (async) — fill it once
  // known and redraw this one card, then rebind its buttons.
  if (!state._bulkMetaCache) {
    bulkKvGet('meta').then((m) => {
      if (!m || state._bulkMetaCache) return;
      state._bulkMetaCache = m;
      const body = document.getElementById('dataSourcesBody');
      if (body) {
        body.innerHTML = dataSourcesHtml();
        wireDataSources();
      }
    });
  }
  // The offline-search verdict needs the set catalogue, which may still be
  // on its way. Resolve it once, then redraw this one card.
  if (state._lsNewSets === undefined) {
    newerThanBuildSets()
      .then((codes) => {
        if (state._lsNewSets !== undefined) return;
        state._lsNewSets = codes;
        const body = document.getElementById('dataSourcesBody');
        if (body) {
          body.innerHTML = dataSourcesHtml();
          wireDataSources();
        }
      })
      .catch(() => {});
  }
  document.getElementById('bulkDlNow')?.addEventListener('click', () => {
    state._bulkMetaCache = null;
    state._lsNewSets = undefined; // a new snapshot needs a fresh verdict
    bulkSyncCheck(true);
  });
  // "+7 new sets live" is only useful if you can see WHICH seven.
  document.querySelector('[data-lsinfo]')?.addEventListener('click', () => {
    const n = state._lsNewSets;
    if (n === undefined) return toast(trS('Still checking\u2026'));
    if (n === null)
      return toast(
        trS('The set list hasn\u2019t loaded yet, so searches still run online in full.'),
      );
    if (!n.length)
      return toast(
        trS('Nothing is newer than your database \u2014 searching runs entirely on your phone.'),
      );
    const nm = (state.allSetsRaw || []).reduce((m, x) => ((m[x.code] = x.name), m), {});
    toast(
      trS('Newer than your database') + ': ' + n.map((c) => nm[c] || c.toUpperCase()).join(', '),
    );
  });
  document.getElementById('sfDiagCopy')?.addEventListener('click', copyDiagnostics);
  document.querySelectorAll('[data-srcrefresh]').forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.dataset.srcrefresh;
      b.disabled = true;
      b.textContent = '…';
      try {
        if (id === 'tags') {
          try {
            localStorage.removeItem('admiral_app:edhrecTags4');
          } catch (e) {}
          state.edhrecTags = null;
          await ensureEdhrecTags();
        } else if (id === 'types') {
          try {
            localStorage.removeItem(LS_PREFIX + 'creatureTypes');
          } catch (e) {}
          state._creatureTypes = null;
          await ensureCreatureTypes();
        } else if (id === 'sets') {
          autoSets.lastCheck = 0;
          saveAutoSets();
          await checkForNewSets(true);
        }
      } catch (e) {}
      const body = document.getElementById('dataSourcesBody');
      if (body) {
        body.innerHTML = dataSourcesHtml();
        wireDataSources();
      }
      toast(trS('Refreshed.'));
    }),
  );
}

/* The diagnostics: database, offline search, boot timing and the network
   journal, as one text on the clipboard. 1.40: its own function -- the
   long-press on the version line under About calls it (the button it used
   to click went with Data sources in 1.35). */
async function copyDiagnostics() {
  let bulk = 'bulkdb: not synced yet';
  try {
    const m = await bulkKvGet('meta');
    if (m)
      bulk =
        'bulkdb: ' +
        m.cards +
        ' cards, ' +
        m.rulingCards +
        ' ruling sets, ' +
        (m.tagCards || 0) +
        ' tag sets · built ' +
        m.built +
        ' · saved ' +
        new Date(m.savedAt || 0).toISOString();
  } catch (e) {}
  let lane = 'offline search: unknown';
  try {
    const codes = await newerThanBuildSets();
    lane =
      'offline search: ' +
      (codes === null
        ? 'full online fallback (no set list)'
        : codes.length
          ? '+' + codes.length + ' newer sets [' + codes.join(',') + ']'
          : 'complete, no request');
  } catch (e) {}
  const boot =
    'boot: script ' +
    _bootScriptMs +
    'ms · eerste render ' +
    _bootRenderMs +
    'ms · beeld ' +
    _bootPaintMs +
    'ms';
  // WHERE those milliseconds go. The shell loads the page over the network,
  // so the document itself can be the bulk of the wait -- these numbers say
  // whether to attack delivery or the script.
  let boot2 = 'boot detail: onbekend';
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      const kb = (n) => Math.round((n || 0) / 1024) + 'kB';
      boot2 =
        'boot detail: serviceworker start ' +
        Math.round(nav.workerStart || 0) +
        'ms · antwoord ' +
        Math.round(nav.responseStart || 0) +
        '–' +
        Math.round(nav.responseEnd || 0) +
        'ms' +
        ' (' +
        kb(nav.encodedBodySize) +
        ' inhoud, ' +
        kb(nav.transferSize) +
        ' over de lijn)' +
        ' · html gelezen ' +
        Math.round(nav.domInteractive || 0) +
        'ms' +
        ' · ' +
        (nav.transferSize === 0 && nav.encodedBodySize > 0 ? 'uit cache' : 'van het net');
    }
  } catch (e) {}
  const text = [
    'Deckhand v' + APP_VERSION,
    bulk,
    lane,
    boot,
    boot2,
    '--- network journal (newest last) ---',
  ]
    .concat(_sfLog && _sfLog.length ? _sfLog : ['(empty)'])
    .join('\n');

  const done = () => toast('Diagnostics copied.');
  // the clipboard API first; the old way as a fallback (some WebViews refuse the API)
  const legacy = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) done();
      else toast('Could not copy.');
    } catch (e) {
      toast('Could not copy.');
    }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(text).then(done, legacy);
    else legacy();
  } catch (e) {
    legacy();
  }
}

function kindredNameSet() {
  // EDHREC folds Kindred into the tags catalog ("Ninjas", "Frogs", "Myr"…).
  // Recognise creature-type entries by name so they can live in their own
  // dropdown, split out of the theme list.
  if (state._kindredSet) return state._kindredSet;
  const set = new Set();
  TYPAL_TRIBES.forEach((t) => {
    set.add(t.toLowerCase());
    set.add((KINDRED_PLURAL_IRREGULAR[t] || t + 's').toLowerCase());
  });
  (state._creatureTypes || []).forEach((t) => {
    set.add(t.toLowerCase());
    set.add((KINDRED_PLURAL_IRREGULAR[t] || t + 's').toLowerCase());
  });
  state._kindredSet = set;
  return set;
}

function browseKindredOptions() {
  const ks = kindredNameSet();
  const rm = comboRankMap('typal');
  return (state.edhrecTags || [])
    .filter((t) => (t.k || ks.has(String(t.label || '').toLowerCase())) && !isColorComboTag(t))
    .sort((a, b) =>
      rm
        ? (rm[b.slug] || 0) - (rm[a.slug] || 0) || (b.count || 0) - (a.count || 0)
        : (b.count || 0) - (a.count || 0),
    ); // most-played tribes for THIS colour first
}

/* Error-page strings masquerading as card names ("Access Denied" made it
   into a Scryfall search once) are dropped at the source. */
function _edhNameOk(nm) {
  return (
    !!nm && nm.length <= 60 && !/access denied|forbidden|not found|blocked|captcha|error/i.test(nm)
  );
}

function edhrecCommanderNamesFrom(data) {
  const lists = (((data || {}).container || {}).json_dict || {}).cardlists || [];
  // Most played FIRST: EDHREC prints 'New Commanders' above 'Top
  // Commanders', so raw page order handed out the newest card. Top lists
  // lead, other commander lists follow, New lists come last.
  const _listRank = (L) => (/top/i.test(L.header || '') ? 0 : /new/i.test(L.header || '') ? 2 : 1);
  const cmd = lists
    .filter((L) => /commander/i.test(L.header || ''))
    .slice()
    .sort((a, b) => _listRank(a) - _listRank(b));
  const use = cmd.length ? cmd : lists;
  // Normalize on the way in: curly quotes straightened, non-breaking and
  // doubled spaces collapsed, edges trimmed — Scryfall matches plain ASCII
  // punctuation, and one invisible character is enough to lose a card.
  const cleanName = (n) =>
    String(n)
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  const seen = new Set(),
    out = [];
  for (const L of use) {
    for (const cv of L.cardviews || []) {
      if (cv && cv.name) {
        const nm = cleanName(cv.name);
        if (_edhNameOk(nm) && !seen.has(nm)) {
          seen.add(nm);
          out.push(nm);
        }
      }
    }
  }
  if (out.length) return out;
  // Rescue: some pages (theme landings especially) nest their lists deeper
  // or under different containers than json_dict.cardlists. Walk the whole
  // page for cardviews arrays before declaring it empty — and say so in the
  // console, which is gold when chasing a shape change remotely.
  const walk = (o, depth) => {
    if (!o || depth > 7) return;
    if (Array.isArray(o)) {
      for (const x of o) walk(x, depth + 1);
      return;
    }
    if (typeof o === 'object') {
      if (Array.isArray(o.cardviews)) {
        for (const cv of o.cardviews) {
          if (cv && cv.name) {
            const nm = cleanName(cv.name);
            if (nm && !seen.has(nm)) {
              seen.add(nm);
              out.push(nm);
            }
          }
        }
      }
      for (const k in o) {
        if (k !== 'cardviews') walk(o[k], depth + 1);
      }
    }
  };
  walk(data, 0);
  if (!out.length && data)
    console.warn('edhrec: page carried no cardviews anywhere', Object.keys(data || {}));
  return out;
}

/* Commander names for a tag, colour-scoped first. The tag+colour page
   (/tags/aikido/jeskai) lists EVERY commander played in that theme in those
   colours — the global tag page's top-100 misses most of them, since a small
   colour's regulars rarely chart against all-colour totals. The global page's
   remainder is appended for depth beyond the scoped list. */
async function edhrecTagCommanderNames(slug, combo) {
  // EDHREC keeps two namespaces: /tags/<slug> and /themes/<slug>. Most
  // entries answer as tags, but pure deck themes (Group Hug and friends)
  // live only under /themes — every lookup tries both roots, and the first
  // one that yields names wins. Misses are cheap: failures are never cached.
  // Kindred pages moved into their own /typal namespace on EDHREC — it
  // rides along as the third root (v2.51.585).
  const roots = ['/pages/tags/', '/pages/themes/', '/pages/typal/'];
  let scoped = [];
  if (combo) {
    outer: for (const cs of EDHREC_COMBO_SLUGS[(combo || '').toLowerCase()] || []) {
      for (const root of roots) {
        const d = await edhrecFetchJson(root + slug + '/' + cs + '.json');
        if (!d) continue;
        scoped = edhrecCommanderNamesFrom(d).slice(0, 100);
        if (scoped.length) break outer;
      }
    }
  }
  let global = [];
  for (const root of roots) {
    const g = await edhrecFetchJson(root + slug + '.json');
    if (!g) continue;
    global = edhrecCommanderNamesFrom(g).slice(0, 100);
    if (global.length) break;
  }
  const seen = new Set(scoped);
  return scoped.concat(global.filter((n) => !seen.has(n)));
}

/* One EDHREC tag page carries four lists the app now shows as EDHREC does:
   New Commanders, Top Commanders, and — the theme's recommended cards —
   New Cards and High Synergy Cards. Colour-scoped pages are preferred when
   colours are chosen; the global page is the fallback. */
async function edhrecTagSections(slug, combo) {
  const roots = ['/pages/tags/', '/pages/themes/', '/pages/typal/'];
  const pickPage = async (path) => {
    for (const root of roots) {
      const d = await edhrecFetchJson(root + path + '.json');
      if (d) return d;
    }
    return null;
  };
  let page = null;
  if (combo) {
    for (const cs of EDHREC_COMBO_SLUGS[(combo || '').toLowerCase()] || []) {
      page = await pickPage(slug + '/' + cs);
      if (page) break;
    }
  }
  if (!page) page = await pickPage(slug);
  let lists = (((page || {}).container || {}).json_dict || {}).cardlists || [];
  if (!lists.length && page) {
    // .134's lesson, carried over from the old extractor: some pages nest
    // their lists deeper than json_dict.cardlists. Walk the whole page for
    // anything list-shaped (header/tag + cardviews) before giving up.
    const found = [];
    const walk = (o, depth) => {
      if (!o || depth > 7) return;
      if (Array.isArray(o)) {
        for (const x of o) walk(x, depth + 1);
        return;
      }
      if (typeof o === 'object') {
        if (Array.isArray(o.cardviews) && (o.header || o.tag)) found.push(o);
        for (const k in o) {
          if (k !== 'cardviews') walk(o[k], depth + 1);
        }
      }
    };
    walk(page, 0);
    lists = found;
    if (!lists.length)
      console.warn('edhrec: tag page carried no cardlists anywhere', Object.keys(page || {}));
  }
  const cleanName = (n) =>
    String(n)
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  const meta = {}; // name → { decks, potential, synergy } — EDHREC's own numbers
  const namesOf = (L) => {
    const seen = new Set(),
      out = [];
    for (const cv of (L && L.cardviews) || []) {
      if (cv && cv.name) {
        const nm = cleanName(cv.name);
        if (nm && !seen.has(nm)) {
          seen.add(nm);
          out.push(nm);
          const m = meta[nm] || (meta[nm] = {});
          if (typeof cv.num_decks === 'number') m.decks = cv.num_decks;
          if (typeof cv.potential_decks === 'number') m.potential = cv.potential_decks;
          if (typeof cv.synergy === 'number') m.synergy = cv.synergy;
        }
      }
    }
    return out;
  };
  const byTag = (t, hdr) =>
    lists.find((L) => (L.tag || '') === t) || lists.find((L) => hdr.test(L.header || ''));
  // related_info: per-colour deck counts for this theme — a ready navigator.
  const rel = [];
  ((page || {}).related_info || []).forEach((g) => {
    ((g && g.items) || []).forEach((it) => {
      if (it && it.textLeft && typeof it.count === 'number' && Array.isArray(it.colors))
        rel.push({ label: it.textLeft, count: it.count, colors: it.colors, url: it.url || '' });
    });
  });
  // Leaders are special; EVERY other list on the page becomes a card
  // section in EDHREC's own order — Game Changers, Creatures, Instants,
  // Mana Artifacts, Lands, and whatever they publish next.
  const leaderLists = [
    byTag('newcommanders', /new commanders/i),
    byTag('topcommanders', /top commanders/i),
  ].filter(Boolean);
  const cardSections = [];
  for (const L of lists) {
    if (!L || leaderLists.includes(L)) continue;
    const ns = namesOf(L);
    if (ns.length) cardSections.push({ header: String(L.header || L.tag || 'Cards'), names: ns });
  }
  return {
    newCmd: namesOf(leaderLists[0]),
    topCmd: namesOf(leaderLists[1]),
    cardSections,
    meta,
    rel,
  };
}

/* Renders the four sections and wires them. Card sections are wired BEFORE
   leader sections enter the DOM below them? No — leaders render first, get
   wired first; card tiles don't exist yet so the leader pass can't touch
   them, and the data-w guard keeps the card pass off the leader tiles. */

async function filterCardsByFormat(cards, fmt, role) {
  role = role === 'leader' ? 'leader' : 'card';
  if (!fmt || fmt === 'commander') return new Set(cards.map((c) => c.name));
  if (!window._fmtOkMemo) window._fmtOkMemo = {};
  const mk = fmt + ':' + role;
  const memo = window._fmtOkMemo[mk] || (window._fmtOkMemo[mk] = {});
  const todo = Array.from(new Set(cards.map((c) => c.name))).filter((n) => memo[n] === undefined);
  for (const ch of chunkArr(todo, 15)) {
    const names = '(' + ch.map((n) => `!"${n.replace(/"/g, '')}"`).join(' or ') + ')';
    let pre = '',
      sfFmt = fmt;
    if (role === 'leader') {
      pre = fmt === 'paupercommander' ? 't:creature r:uncommon ' : 'is:commander ';
      if (fmt === 'paupercommander') sfFmt = 'any';
    }
    try {
      const r = await searchAndVerifyLegal(pre + names, 'name', 60, { format: sfFmt });
      const ok = new Set(
        (r.results || [])
          .filter((c) => !isBanned(c) && (role !== 'leader' || leaderFitsFormat(c, fmt)))
          .map((c) => c.name),
      );
      ch.forEach((n) => {
        memo[n] = ok.has(n);
      });
    } catch (e) {
      ch.forEach((n) => {
        if (memo[n] === undefined) memo[n] = false;
      });
    }
  }
  return new Set(cards.map((c) => c.name).filter((n) => memo[n]));
}

function filterLeadersByFormat(cards, fmt) {
  return filterCardsByFormat(cards, fmt, 'leader');
}

function renderEdhrecSections(box, key, S, keepScroll) {
  const pinned = null; // 1.7: the loose Inspiration page has no tie to any deck
  // EDHREC's lists are Commander play data. Any other format first passes
  // its leaders through that format's rules and ban list; nothing shows
  // until the check is done, so an illegal commander never appears.
  const bfmt = state.browseFormat || 'commander';
  if (bfmt !== 'commander' && !(S._fmtOk && S._fmtOk.fmt === bfmt)) {
    box.innerHTML = /* HTML */ `<div class="status">
      <div class="spinner"></div>
      Checking ${fmtLabelOf(bfmt)} legality…
    </div>`;
    const secCards = (S.cardSecs || []).flatMap((cs) => cs.list || []);
    Promise.all([
      filterLeadersByFormat((S.newCmd || []).concat(S.topCmd || []), bfmt),
      filterCardsByFormat(secCards, bfmt, 'card'),
    ]).then(([ok, okCards]) => {
      S._fmtOk = { fmt: bfmt, ok, okCards };
      if (
        state.screen !== 'browse' ||
        (state.browseFormat || 'commander') !== bfmt ||
        !box.isConnected
      )
        return;
      renderEdhrecSections(box, key, S, keepScroll);
    });
    return;
  }
  const fOk = (arr) =>
    S._fmtOk && S._fmtOk.fmt === bfmt
      ? (arr || []).filter((c) => S._fmtOk.ok.has(c.name))
      : arr || [];
  const fOkCard = (arr) =>
    S._fmtOk && S._fmtOk.fmt === bfmt
      ? (arr || []).filter((c) => S._fmtOk.okCards.has(c.name))
      : arr || [];
  const newCmd = fOk(S.newCmd),
    topCmd = fOk(S.topCmd);
  const noun = leaderNoun(bfmt, true);
  const lbl = (t) => `<div class="section-label" style="margin-top:14px;">${t}</div>`;
  const meta = S.meta || {};
  const metaOf = (c) => {
    const cut = c.name.indexOf(' // ');
    return meta[c.name] || (cut > 0 ? meta[c.name.slice(0, cut)] : null) || null;
  };
  // Leader tiles carry EDHREC's own play numbers; card tiles their synergy.
  const leaderSub = (c) => {
    const m = metaOf(c);
    if (!m || typeof m.decks !== 'number') return {};
    let t = m.decks.toLocaleString() + ' deck' + (m.decks === 1 ? '' : 's');
    if (m.potential) t += ' · ' + Math.round((1000 * m.decks) / m.potential) / 10 + '%';
    return { sub: t };
  };
  const synSub = (c) => {
    const m = metaOf(c);
    if (!m || typeof m.synergy !== 'number') return {};
    const pct = Math.round(m.synergy * 100);
    return { sub: (pct >= 0 ? '+' : '') + pct + '% ' + trS('synergy') };
  };
  const grid = (cards, opts, subOf) =>
    `<div class="sr-grid">${cards.map((c) => searchRowHtml(c, pinned, Object.assign({}, opts, subOf ? subOf(c) : {}))).join('')}</div>`;
  // Sections render their first dozen tiles; the rest waits behind a
  // Show-all button — a long page paints in a blink instead of all at once.
  const CAP = 10;
  const pools = [];
  const section = (title, cards, opts, subOf, wire) => {
    if (!cards || !cards.length) return '';
    const idx = pools.length;
    pools.push({ title, cards, opts, subOf, wire });
    return `<div class="edh-sec" data-si="${idx}">${lbl(title)}${cards.length > CAP ? `<button class="ghost-btn edh-more" data-si="${idx}" style="width:100%;margin:0 0 6px;">${trS('More')}</button>` : ''}${grid(cards.slice(0, CAP), opts, subOf)}</div>`;
  };
  // Colour strip: how many decks play this theme per colour combination —
  // tap to jump to that combination.
  const relHtml =
    S.rel && S.rel.length
      ? `<div class="edh-rel">${S.rel.map((r, i) => `<button class="edh-rel-chip" data-ri="${i}" title="${escapeHtml(r.label)}">${r.colors && r.colors.length ? manaRowSvg(r.colors.join(''), 18) : manaIconSvg('C', 18)}<b>${r.count.toLocaleString()}</b></button>`).join('')}</div>`
      : '';
  const leaders = newCmd.concat(topCmd);
  const leaderWire = { onCardTap: (c) => openCommanderReco(c) };
  // Bottom-up assembly: sections are built in reading priority (New, Top,
  // then EDHREC's card lists ending in Lands) and the DOM order is the
  // REVERSE -- so the page FOOT, where reading starts, opens with New and
  // Top, and Lands ends up at the very top. The color strip rides the foot.
  const secs = S.cardSecs || [];
  const chunks = [
    section(trS('New') + ' ' + noun, newCmd, { showCommanderBtn: true }, leaderSub, leaderWire),
    section(trS('Top') + ' ' + noun, topCmd, { showCommanderBtn: true }, leaderSub, leaderWire),
  ].concat(secs.map((cs) => section(trS(cs.header), fOkCard(cs.list), {}, synSub, {}))); // 1.36: card tiles carry their + again
  box.innerHTML =
    `<div class="edh-jump-row insp-jump"><button class="icon-btn edh-jump" id="edhJump" title="${trS('Jump to section')}">☰</button></div>` +
    chunks.filter(Boolean).reverse().join('') +
    relHtml +
    (bfmt !== 'commander' && !leaders.length && ((S.newCmd || []).length || (S.topCmd || []).length)
      ? `<div class="empty-note">None of these commanders is legal in ${fmtLabelOf(bfmt)}.</div>`
      : '');
  box.querySelectorAll('.edh-rel-chip').forEach((ch) =>
    ch.addEventListener('click', () => {
      const r = S.rel[+ch.dataset.ri];
      if (!r) return;
      const seg =
        String(r.url || '')
          .split('/')
          .filter(Boolean)
          .pop() || '';
      let comboKey = null;
      for (const k in EDHREC_COMBO_SLUGS) {
        if ((EDHREC_COMBO_SLUGS[k] || []).includes(seg)) {
          comboKey = k;
          break;
        }
      }
      if (!comboKey) return;
      const n = r.colors.length;
      state.browseSel.count = n >= 4 ? '45' : String(n);
      state.browseSel.combo = comboKey;
      render();
    }),
  );
  wireResultButtons(leaders, pinned, () => renderEdhrecSections(box, key, S, true), leaderWire);
  loadTilePrices(leaders.slice(0, CAP * 2));
  if (secs.length) {
    const cardsPool = [].concat(...secs.map((cs) => cs.list));
    wireResultButtons(cardsPool, pinned, () => renderEdhrecSections(box, key, S, true), {});
    loadTilePrices([].concat(...secs.map((cs) => cs.list.slice(0, CAP))));
  }
  // The ☰ menu lists every rendered section; tapping one glides there. The
  // house dropdown brings the gatekeeper, back-button close, and flip-up
  // positioning along for free.
  const jb = box.querySelector('#edhJump');
  if (jb) {
    if (pools.length < 2) jb.closest('.edh-jump-row').style.display = 'none';
    jb.addEventListener('click', (e) => {
      e.stopPropagation();
      openTileMenu(
        jb,
        pools
          .map((p, i) => ({
            label: p.title,
            fn: () => {
              const el = box.querySelector(`.edh-sec[data-si="${i}"]`);
              // Bottom-up: a section STARTS at its foot (the label) — land there,
              // exactly like the deck-Inspiration and reco jumps.
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'end' });
            },
          }))
          .reverse(),
      );
    });
    bindInspJump();
  }
  // Show-all: swap the capped grid for the full one, wire and price the rest.
  box.querySelectorAll('.edh-more').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = pools[+btn.dataset.si];
      const wrap = btn.closest('.edh-sec');
      if (!p || !wrap) return;
      const already = Math.min(p.cards.length, p.shown || CAP);
      const next = Math.min(p.cards.length, already + 10);
      p.shown = next;
      const g = wrap.querySelector('.sr-grid');
      // Anchor on the grid's DOM-first tile (visual FOOT row): after the swap
      // it must sit exactly where it was, so the new batch and the More button
      // extend upward, out of view, instead of shoving the reader's cards down.
      const _a0 = g && g.firstElementChild ? g.firstElementChild.getBoundingClientRect().top : null;
      if (g) g.outerHTML = grid(p.cards.slice(0, next), p.opts, p.subOf);
      if (_a0 !== null) {
        const ng = wrap.querySelector('.sr-grid');
        if (ng && ng.firstElementChild) {
          const _dy = ng.firstElementChild.getBoundingClientRect().top - _a0;
          if (_dy) {
            const _se = pageScroller();
            _se.scrollTop += _dy;
          }
        }
      }
      if (next >= p.cards.length) btn.remove();
      wireResultButtons(
        p.cards.slice(0, next),
        pinned,
        () => renderEdhrecSections(box, key, S, true),
        p.wire || {},
      );
      loadTilePrices(p.cards.slice(already, next));
    }),
  );
  if (!keepScroll) scrollToPageFoot();
}

async function loadEdhrecSectionedBrowse(box, key, slug, what) {
  // Paint the house spinner immediately — the quip ticker hooks any
  // .status > .spinner automatically, so the wait is never a blank page.
  box.innerHTML = '<div class="status" style="margin:16px 0;"><div class="spinner"></div></div>';
  const sec = await edhrecTagSections(slug, state.browseSel.combo);
  if (key !== browseKey()) return;
  if (!(sec.newCmd.length || sec.topCmd.length)) {
    box.innerHTML = /* HTML */ `<div class="empty-note">
      No play data for this ${what} right now — check your connection, or try another.
    </div>`;
    return;
  }
  const union = [
    ...new Set([...sec.newCmd, ...sec.topCmd, ...(sec.cardSections || []).flatMap((x) => x.names)]),
  ];
  const cards = await namesToLegalCards(union);
  if (key !== browseKey()) return;
  const byName = new Map();
  cards.forEach((c) => {
    if (!byName.has(c.name)) byName.set(c.name, c);
    const cut = c.name.indexOf(' // ');
    if (cut > 0 && !byName.has(c.name.slice(0, cut))) byName.set(c.name.slice(0, cut), c);
  });
  const take = (names) => names.map((n) => byName.get(n)).filter(Boolean);
  const _bf = browseFmt();
  const leaderOk = (c) =>
    isLegendary(c) && true && isNonlandFront(c) && !isBanned(c, _bf) && colorSelectionAllows(c);
  const cardOk = (c) => !isBanned(c, _bf) && true;
  const newCmd = take(sec.newCmd).filter(leaderOk);
  const topCmd = take(sec.topCmd)
    .filter(leaderOk)
    .filter((c) => !newCmd.includes(c));
  const leaders = newCmd.concat(topCmd);
  // The theme's recommended cards — leaders already shown above are noise here.
  // Every EDHREC list keeps all its cards, as on EDHREC itself: a saga in
  // High Synergy Cards is in Enchantments too, so each type list is whole.
  const shown = new Set(leaders);
  const cardSecs = [];
  for (const cs of sec.cardSections || []) {
    const seenHere = new Set();
    const list = take(cs.names)
      .filter(cardOk)
      .filter((c) => !shown.has(c) && !seenHere.has(c) && seenHere.add(c));
    if (list.length) cardSecs.push({ header: cs.header, list });
  }
  if (!leaders.length) {
    box.innerHTML = /* HTML */ `<div class="empty-note">
      No ${leaderNoun(browseFmt(), true)} with play data for this ${what} in these colors — try
      another combination.
    </div>`;
    return;
  }
  const S = { newCmd, topCmd, cardSecs, meta: sec.meta || {}, rel: sec.rel || [] };
  const pool = Array.from(new Set(leaders.concat(...cardSecs.map((x) => x.list))));
  pool._complete = true;
  pool._sections = S;
  state.browseCache[key] = pool;
  renderEdhrecSections(box, key, S);
}

async function loadEdhrecThemeBrowse(box, key, slug) {
  return loadEdhrecSectionedBrowse(box, key, slug, 'theme');
}

async function loadEdhrecTypalBrowse(box, key, slug) {
  return loadEdhrecSectionedBrowse(box, key, slug, 'creature type');
}
