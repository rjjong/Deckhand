// core / state

/* ========================= STATE ========================= */

const STARTUP_PAGES = [
  'home',
  'decks',
  'collection',
  'search',
  'browse',
  'life',
  'scan-collection',
];

let state = {
  screen: 'home', // home | decks | decklist | search | inspiration | settings
  startupPage: 'home',
  hideCollectionFolderPrices: false,
  scannerIgnoreSession: false,
  scannerIdThreshold: 0.6,
  scannerCornerThreshold: 0.02,
  scannerIntervalMs: 200,
  scannerShowFramerate: false,
  decksIndex: [],
  homeLoaded: false,

  activeDeckId: null, // deck shown/edited on Decklist page
  searchDeckId: null, // deck targeted by Search page
  searchPinnedDeckId: null, // set only when Search is entered via a decklist's "Search Cards" button; cleared on leaving Search
  browseSel: { count: '', combo: '', theme: '', type: '' },
  browseTypal: null,
  openCSelect: null,
  browseCache: {}, // Inspiration browse page
  cotd: null, // card of the day (per-session cache; persisted per-date in localStorage)
  inspireDeckId: null, // deck targeted by Inspiration page

  builderTab: 'list', // list | stats | primer
  sortMode: 'type-cmc-name',
  dlPanel: null, // null | 'bulk' | 'import' | 'export'
  dlSearchOpen: false, // dock magnifier: live find-in-deck bar
  dlSearchQ: '',
  collapsed: {},

  // search page
  searchName: '',
  searchProxy: false,
  advOpen: false,
  searchOtag: '',
  searchColors: { W: false, U: false, B: false, R: false, G: false, C: false },
  searchColorMode: 'atmost',
  searchCardColors: { W: false, U: false, B: false, R: false, G: false, C: false },
  searchCardColorMode: 'all',
  searchSetCode: '',
  searchFormat: '', // '' = any format; a pinned deck pre-fills its own
  browseFormat: 'commander', // Inspiration's leader pool
  bsAdvOpen: false,
  searchManaCost: '',
  searchRarity: { common: false, uncommon: false, rare: false, mythic: false },
  searchEurMin: 0,
  searchEurMax: null,
  searchArtist: '',
  searchFlavorText: '',
  searchKeyword: '',
  searchPowOp: '',
  searchPowVal: '',
  searchTouOp: '',
  searchTouVal: '',
  searchLoyOp: '',
  searchLoyVal: '',
  searchSortDir: 'asc',
  searchCmcOp: '',
  searchCmcVal: '',
  searchTypeText: '',
  searchOracleText: '',
  searchSort: 'name',
  overlayStack: [],
  navLadder: ['home'],
  priceCache: {},
  collection: { binders: [], items: [], wantsExclude: [], wantsManual: [] },
  colFilter: {
    q: '',
    type: '',
    set: '',
    legal: '',
    binder: null,
    colors: { W: false, U: false, B: false, R: false, G: false, C: false },
    colorMode: 'all',
    rarity: { common: false, uncommon: false, rare: false, mythic: false },
    eurMin: 0,
    eurMax: null,
  },
  colAdvOpen: false,
  wantSel: null,
  colGroupCollapsed: {},
  spFilter: {
    q: '',
    type: '',
    colors: { W: false, U: false, B: false, R: false, G: false, C: false },
    colorMode: 'all',
    rarity: { common: false, uncommon: false, rare: false, mythic: false },
  },
  spAdvOpen: false,
  _priceRun: 0,
  legalityOpen: false,
  deckFilter: '',
  deckGroupCollapsed: {},
  exportFmt: 'plain',
  searchResults: [],
  searching: false,
  searchRan: false,
  searchError: false,
  searchShowOffColor: false,

  // inspiration page
  inspireSel: { type: 'top', theme: '' },
  inspireCache: {},
  inspireLoading: false,
  inspireError: false,

  menuOpen: false,
  modal: null,
  preview: null,
  lifeOpen: false,

  theme: 'dark',
  guild: 'rakdos',
  setsResolved: false,
  settingsRulesOpen: false,
  settingsBanOpen: false,
  settingsFullRulesOpen: false,

  life: {
    count: 4,
    layout: '4q',
    players: null,
    rotate: true,
    expandedIdx: null,
    settingsOpen: false,
    toolsOpen: false,
    historyOpen: false,
    menuOpen: false,
    setupDone: false,
    spinning: false,
    turnIdx: null,
    startIdx: null,
    arrowAngle: -90,
    turnNum: 1,
    history: [],
    settings: { autoKill: true, admiralDamage: true, poison: true, salty: true },
  },
};

let saveTimers = {};
