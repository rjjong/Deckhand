// services / inspiration-art

/* ---- Baked tile leaders: the most-played commander per theme/Kindred,
   SHIPPED WITH THE APP. Tiles resolve from this instantly (one cached
   exact-name art lookup); the live EDHREC recheck runs only after a set
   release settles (the tile-art epoch). Keys are normalized slugs. */
const BAKED_TILE_LEADERS = {
  // Kindred
  dragons: 'The Ur-Dragon',
  elves: 'Lathril, Blade of the Elves',
  zombies: 'Wilhelt, the Rotcleaver',
  vampires: 'Edgar Markov',
  humans: 'Winota, Joiner of Forces',
  goblins: 'Krenko, Mob Boss',
  angels: 'Giada, Font of Hope',
  slivers: 'Sliver Overlord',
  knights: 'Syr Gwyn, Hero of Ashvale',
  assassins: 'Etrata, the Silencer',
  phyrexians: 'Elesh Norn, Mother of Machines',
  rats: 'Karumonix, the Rat King',
  birds: 'Kangee, Aerie Keeper',
  wizards: 'Inalla, Archmage Ritualist',
  spirits: 'Millicent, Restless Revenant',
  dinosaurs: "Gishath, Sun's Avatar",
  cats: 'Arahbo, Roar of the World',
  merfolk: 'Kumena, Tyrant of Orazca',
  pirates: 'Admiral Beckett Brass',
  wolves: 'Tovolar, Dire Overlord',
  werewolves: 'Tovolar, Dire Overlord',
  demons: "Be'lakor, the Dark Master",
  hydras: 'Zaxara, the Exemplary',
  elementals: 'Omnath, Locus of Creation',
  beasts: 'Goreclaw, Terror of Qal Sisma',
  faeries: 'Alela, Artful Provocateur',
  snakes: 'Xyris, the Writhing Storm',
  squirrels: 'Chatterfang, Squirrel General',
  dogs: 'Rin and Seri, Inseparable',
  warriors: 'Najeela, the Blade-Blossom',
  soldiers: 'Myrel, Shield of Argive',
  artificers: 'Urza, Lord High Artificer',
  clerics: 'Orah, Skyclave Hierophant',
  rogues: 'Anowon, the Ruin Thief',
  ninjas: "Yuriko, the Tiger's Shadow",
  samurai: 'Isshin, Two Heavens as One',
  treefolk: 'Doran, the Siege Tower',
  insects: 'Grist, the Hunger Tide',
  spiders: 'Shelob, Child of Ungoliant',
  krakens: 'Arixmethes, Slumbering Isle',
  eldrazi: 'Kozilek, the Great Distortion',
  fungus: 'Slimefoot, the Stowaway',
  frogs: 'The Gitrog Monster',
  foxes: "Light-Paws, Emperor's Voice",
  bears: 'Ayula, Queen Among Bears',
  oozes: 'The Mimeoplasm',
  sphinxes: 'Unesh, Criosphinx Sovereign',
  giants: 'Aegar, the Freezing Flame',
  minotaurs: 'Sethron, Hurloon General',
  monks: 'Narset, Enlightened Master',
  horrors: 'Umbris, Fear Manifest',
  unicorns: 'Emiel the Blessed',
  dwarves: 'Magda, Brazen Outlaw',
  mice: 'Mabel, Heir to Cragflame',
  // Themes
  lifegain: 'Oloro, Ageless Ascetic',
  lifedrain: 'Vito, Thorn of the Dusk Rose',
  lifeloss: 'Vito, Thorn of the Dusk Rose',
  looting: 'Anje Falkenrath',
  madness: 'Anje Falkenrath',
  mill: 'Phenax, God of Deception',
  midrange: 'Korvold, Fae-Cursed King',
  menace: 'Marisi, Breaker of the Coil',
  manarocks: 'Jhoira, Weatherlight Captain',
  manadorks: 'Marwyn, the Nurturer',
  lurruscompanion: 'Lurrus of the Dream-Den',
  ltbeffects: 'Norin the Wary',
  lure: 'Grothama, All-Devouring',
  counters: "Atraxa, Praetors' Voice",
  plus1plus1counters: "Atraxa, Praetors' Voice",
  p1p1counters: "Atraxa, Praetors' Voice",
  onecounters: "Atraxa, Praetors' Voice",
  '11counters': "Atraxa, Praetors' Voice",
  minus1minus1counters: 'Hapatra, Vizier of Poisons',
  m1m1counters: 'Hapatra, Vizier of Poisons',
  activatedabilities: 'Zirda, the Dawnwaker',
  adnauseam: "K'rrik, Son of Yawgmoth",
  adventures: 'Chulane, Teller of Tales',
  affinity: 'Urza, Lord High Artificer',
  aggro: 'Winota, Joiner of Forces',
  lands: 'Lord Windgrace',
  landfall: 'Omnath, Locus of Rage',
  tokens: 'Rhys the Redeemed',
  treasure: 'Prosper, Tome-Bound',
  treasures: 'Prosper, Tome-Bound',
  aristocrats: 'Teysa Karlov',
  sacrifice: 'Korvold, Fae-Cursed King',
  graveyard: 'Muldrotha, the Gravetide',
  reanimator: 'Meren of Clan Nel Toth',
  reanimate: 'Meren of Clan Nel Toth',
  spellslinger: 'Veyran, Voice of Duality',
  storm: 'Yidris, Maelstrom Wielder',
  blink: 'Brago, King Eternal',
  flicker: 'Brago, King Eternal',
  clones: 'Sakashima of a Thousand Faces',
  artifacts: 'Urza, Lord High Artificer',
  enchantments: "Sythis, Harvest's Hand",
  enchantress: "Sythis, Harvest's Hand",
  auras: 'Sram, Senior Edificer',
  equipment: 'Wyleth, Soul of Steel',
  voltron: 'Rafiq of the Many',
  superfriends: "Atraxa, Praetors' Voice",
  planeswalkers: "Atraxa, Praetors' Voice",
  proliferate: "Atraxa, Praetors' Voice",
  infect: 'Ixhel, Scion of Atraxa',
  poison: 'Ixhel, Scion of Atraxa',
  counterspells: 'Talrand, Sky Summoner',
  control: 'Grand Arbiter Augustin IV',
  stax: 'Grand Arbiter Augustin IV',
  burn: 'Torbran, Thane of Red Fell',
  carddraw: 'The Locust God',
  draw: 'The Locust God',
  wheels: 'Nekusar, the Mindrazer',
  wheel: 'Nekusar, the Mindrazer',
  discard: 'Tinybones, Trinket Thief',
  grouphug: 'Phelddagrif',
  groupslug: 'Mogis, God of Slaughter',
  politics: 'Kynaios and Tiro of Meletis',
  monarch: 'Queen Marchesa',
  theft: 'Xanathar, Guild Kingpin',
  ramp: 'Azusa, Lost but Seeking',
  bigmana: 'Zacama, Primal Calamity',
  xspells: 'Rosheen Meanderer',
  cascade: 'Yidris, Maelstrom Wielder',
  energy: 'Satya, Aetherflux Genius',
  vehicles: 'Greasefang, Okiba Boss',
  sagas: 'Satsuki, the Living Lore',
  flying: 'Isperia, Supreme Judge',
  deathtouch: 'Fynn, the Fangbearer',
  devotion: 'Karametra, God of Harvests',
  combo: 'Kenrith, the Returned King',
  legends: 'Jodah, the Unifier',
  legendsmatter: 'Jodah, the Unifier',
  toughness: 'Arcades, the Strategist',
  defenders: 'Arcades, the Strategist',
  walls: 'Arcades, the Strategist',
  snow: 'Jorn, God of Winter',
  topdeck: 'Aminatou, the Fateshifter',
  miracles: 'Aminatou, the Fateshifter',
  mutate: 'Otrimi, the Ever-Playful',
  cycling: 'Gavi, Nest Warden',
  goad: 'Karazikar, the Eye Tyrant',
  dungeons: 'Sefris of the Hidden Ways',
  initiative: 'Sefris of the Hidden Ways',
  party: 'Tazri, Beacon of Unity',
  extraturns: 'Medomai the Ageless',
  extracombats: 'Aurelia, the Warleader',
  // Batch 2: catalog tags the first bake missed
  lifeexchange: 'Selenia, Dark Angel',
  mayhem: 'Rakdos, the Showstopper',
  chaos: 'Okaun, Eye of Chaos',
  coinflip: 'Zndrsplt, Eye of Wisdom',
  coinflips: 'Zndrsplt, Eye of Wisdom',
  attacktriggers: 'Aurelia, the Warleader',
  attractions: 'Myra the Magnificent',
  banding: 'Soraya the Falconer',
  modifiedcreatures: 'Kosei, Penitent Warlord',
  modified: 'Kosei, Penitent Warlord',
  hatebears: 'Thalia, Guardian of Thraben',
  keywords: 'Kathril, Aspect Warper',
  keywordsoup: 'Kathril, Aspect Warper',
  fight: 'Neyith of the Dire Hunt',
  food: 'Gyome, Master Chef',
  clues: 'Lonis, Cryptozoologist',
  blood: 'Strefan, Maurer Progenitor',
  curses: 'Lynde, Cheerful Tormentor',
  morph: 'Kadena, Slinking Sorcerer',
  devour: 'Thromok the Insatiable',
  partner: 'Thrasios, Triton Hero',
  backgrounds: 'Wilson, Refined Grizzly',
  gowide: 'Jetmir, Nexus of Revels',
  overrun: 'Jetmir, Nexus of Revels',
  etb: 'Yarok, the Desecrated',
  enterthebattlefield: 'Yarok, the Desecrated',
  entersthebattlefield: 'Yarok, the Desecrated',
  deserts: 'Hazezon, Shaper of Sand',
  gates: 'Nine-Fingers Keene',
  historic: 'Jhoira, Weatherlight Captain',
  myr: 'Urtet, Remnant of Memnarch',
  thopters: 'Breya, Etherium Shaper',
  pillowfort: 'Queen Marchesa',
  exilematters: 'Prosper, Tome-Bound',
  castfromexile: 'Prosper, Tome-Bound',
  impulse: 'Prosper, Tome-Bound',
};

function bakedLeaderFor(slug) {
  return (
    BAKED_TILE_LEADERS[
      String(slug || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    ] || null
  );
}

/* ---- Most-played leader art for the Inspiration drop-up tiles ----
   sf|<format>|<clause> resolves through the cached Scryfall search with
   order:edhrec (= most played first) and takes the first eligible card.
   ed|<slug>|<combo> asks the EDHREC tag page for its top commander and
   resolves the name through the normal batch pipeline. Hits persist a week
   in the query DB; the in-memory promise map stops double-fetches and
   retry storms within a session. */
const _tileArtMem = {};

const _tileArtReady = {};
// key -> {n,a}: sync map so renders paint cached art instantly
const _tileArtRevalidating = new Set();

const _tileArtUpgraded = new Set();
// one live-upgrade attempt per key per session
const _tileImgWarm = new Set();

/* Refresh moment for tile art: cached art stays valid until ONE MONTH after
   the newest major set's release -- exactly when EDHREC's play stats have
   settled. Until then everything serves from disk, instantly, no churn
   during spoiler season. Stale entries still serve instantly and refresh
   quietly in the background. */
function tileArtEpoch() {
  try {
    const now = Date.now();
    const MAJOR = new Set(['expansion', 'core', 'commander', 'masters', 'draft_innovation']);
    let epoch = 0;
    (state.allSetsRaw || []).forEach((x) => {
      if (!x || x.digital || !x.released_at || !MAJOR.has(x.set_type)) return;
      const t = Date.parse(x.released_at) + 30 * 24 * 3600 * 1000;
      if (t && t <= now && t > epoch) epoch = t;
    });
    return epoch;
  } catch (e) {
    return 0;
  }
}

function _tileArtWarmImg(url) {
  if (!url || _tileImgWarm.has(url)) return;
  _tileImgWarm.add(url);
  try {
    const im = new Image();
    im.src = url;
  } catch (e) {}
}

async function _tileArtSfPick(fmt, clause) {
  if (!clause) return null;
  const { results } = await searchAndVerifyLegal(clause, 'edhrec', 20, {
    format: fmt || 'any',
    bg: true,
  });
  const pool = (results || []).filter((x) => isNonlandFront(x) && !isBanned(x));
  // Unranked (brand-new) cards can lead the sorted page -- the tile wants
  // the lowest REAL rank, i.e. the most played card that has data.
  const ranked = pool
    .filter((x) => typeof x.edhrec_rank === 'number')
    .sort((a, b) => a.edhrec_rank - b.edhrec_rank);
  const list = (ranked.length ? ranked : pool).slice(0, 5);
  const c = list[0];
  if (!c) return null;
  // Winner + up to four alternates, popularity order — render-time dedupe
  // slides a duplicate tile to the next one.
  return {
    n: c.name,
    a: artCropFrom(cardImageMedRaw(c)),
    alts: list.slice(1).map((x) => ({ n: x.name, a: artCropFrom(cardImageMedRaw(x)) })),
  };
}

async function _tileArtNamePick(nm, front) {
  // The exact-name endpoint, no legality gate -- an icon is an icon.
  // name@set pins a specific printing (the classic art); a miss on the
  // pinned set falls back to the default printing.
  const cut = nm.indexOf('@');
  const name = cut > 0 ? nm.slice(0, cut) : nm;
  const set = cut > 0 ? nm.slice(cut + 1) : '';
  const ask = async (withSet) => {
    const res = await sfFetch(
      SF_BASE +
        '/cards/named?exact=' +
        encodeURIComponent(name) +
        (withSet ? '&set=' + encodeURIComponent(set) : ''),
      0,
      true,
      false,
      !!front,
    );
    if (res && res.ok) {
      const c = await res.json();
      if (c && c.name) return { n: c.name, a: artCropFrom(cardImageMedRaw(c)) };
    }
    return null;
  };
  let out = null;
  if (set) out = await ask(true).catch(() => null);
  if (!out) out = await ask(false).catch(() => null);
  return out;
}

async function _tileArtEdPick(slug, combo) {
  const names = await edhrecTagCommanderNames(slug, combo || '');
  if (names && names.length) {
    const cards = ((await namesToLegalCards(names.slice(0, 6))) || []).filter((x) => !isBanned(x));
    const c = cards[0];
    if (c)
      return {
        n: c.name,
        a: artCropFrom(cardImageMedRaw(c)),
        alts: cards.slice(1, 5).map((x) => ({ n: x.name, a: artCropFrom(cardImageMedRaw(x)) })),
      };
  }
  return null;
}

function _tagSrc(o, src) {
  return o ? Object.assign({}, o, { src }) : null;
}

async function _tileArtFetchFresh(key, live, front) {
  const parts = key.split('|');
  if (parts[0] === 'sf')
    return _tagSrc(
      await _tileArtSfPick(parts[1] || 'any', parts.slice(2).join('|').trim()),
      'live',
    );
  if (parts[0] === 'nm')
    return _tagSrc(await _tileArtNamePick(parts.slice(1).join('|'), front), 'fixed');
  if (parts[0] === 'ed') {
    const slug = parts[1],
      combo = parts[2] || '';
    const baked = bakedLeaderFor(slug);
    let out = null;
    if (live) {
      // Set-release recheck: the live EDHREC ranking leads; the baked name
      // is its net. Total failure keeps the stored art (callers only
      // overwrite on success).
      out = _tagSrc(await _tileArtEdPick(slug, combo).catch(() => null), 'live');
      if (!out && baked) out = _tagSrc(await _tileArtNamePick(baked).catch(() => null), 'baked');
      return out;
    }
    // First resolve: the BAKED, shipped leader -- instant and dependable.
    if (baked) out = _tagSrc(await _tileArtNamePick(baked, front).catch(() => null), 'baked');
    if (!out) out = _tagSrc(await _tileArtEdPick(slug, combo).catch(() => null), 'live');
    // Last net: the most-played leader for the chosen colors -- a tile is
    // never left black.
    if (!out)
      out = _tagSrc(
        await _tileArtSfPick(
          'any',
          ('is:commander ' + (combo ? (combo === 'c' ? 'id=c' : 'id=' + combo) : '')).trim(),
        ).catch(() => null),
        'generic',
      );
    return out;
  }
  return null;
}

/* One art per list (v2.51.585): the resolver stores up to four alternates
   beside the winner (alts, popularity order). At paint time each list keeps
   a used-set; a tile whose art is already on show slides to its next-best
   candidate. Old tileart2 cache entries (no alts) keep working unchanged —
   they simply have nothing to slide to (lazy migration: alts appear when an
   entry naturally refreshes). Pure, so the Node battery can test it. */
function tileArtPick(rec, used) {
  if (!rec || !rec.a) return rec || null;
  const cands = [rec].concat(Array.isArray(rec.alts) ? rec.alts : []);
  const pick = cands.find((c) => c && c.a && !(used && used.has(c.a))) || rec;
  if (used) used.add(pick.a);
  return { n: pick.n, a: pick.a };
}

function tileArtResolve(key, front) {
  if (_tileArtMem[key]) return _tileArtMem[key];
  _tileArtMem[key] = (async () => {
    const ck = 'tileart2|' + key; // v2 namespace: v1 stored the newest card, not the most played
    try {
      const disk = await qdbGet(ck);
      if (disk && disk.v && disk.v.a) {
        _tileArtReady[key] = disk.v;
        _tileArtWarmImg(disk.v.a);
        // A month past the newest set's release? Refresh in the background;
        // the stored art keeps serving without a flicker in the meantime.
        if ((disk.t || 0) < tileArtEpoch() && !_tileArtRevalidating.has(key)) {
          _tileArtRevalidating.add(key);
          _tileArtFetchFresh(key, true)
            .then((fresh) => {
              if (fresh && fresh.a) {
                qdbSet(ck, fresh);
                _tileArtReady[key] = fresh;
                _tileArtMem[key] = Promise.resolve(fresh);
                _tileArtWarmImg(fresh.a);
              }
            })
            .catch(() => {})
            .finally(() => _tileArtRevalidating.delete(key));
        }
        return disk.v;
      }
      const out = await _tileArtFetchFresh(key, false, front);
      if (out && out.a) {
        qdbSet(ck, out);
        _tileArtReady[key] = out;
        _tileArtWarmImg(out.a);
        return out;
      }
      return null;
    } catch (e) {
      return null;
    }
  })();
  // A failed resolve must NOT poison the session: clear the slot so the
  // next look retries (the queue's 90s expiry made misses common under
  // load, and a cached null meant a forever-black tile).
  _tileArtMem[key]
    .then((v) => {
      if (!v || !v.a) delete _tileArtMem[key];
    })
    .catch(() => {
      delete _tileArtMem[key];
    });
  return _tileArtMem[key];
}

/* Warm every drop-up tile on entering the page: cached keys land in the
   ready-map (and the browser's image cache) before any panel opens, so the
   grids appear fully dressed with zero loading. Fresh keys trickle in over
   the low-priority lanes; the per-key promise map makes re-runs free. */
let _tileArtHydrated = false;

/* Bulk hydrate: every stored tile art lands in the sync ready-map (and the
   browser image cache) in one IndexedDB pass -- milliseconds, before any
   panel can open. Entries past their set-release epoch still serve
   instantly; only the full resolver path refreshes them in the background. */
async function hydrateTileArtReady() {
  if (_tileArtHydrated) return false; // report "nothing new" -- callers must NOT rerender
  _tileArtHydrated = true;
  try {
    const all = await qdbGetPrefix('tileart2|');
    const epoch = tileArtEpoch();
    Object.entries(all).forEach(([k, rec]) => {
      if (!rec || !rec.v || !rec.v.a) return;
      const key = k.slice('tileart2|'.length);
      if (!_tileArtReady[key]) {
        _tileArtReady[key] = rec.v;
        _tileArtWarmImg(rec.v.a);
      }
      if (!_tileArtMem[key] && (rec.t || 0) >= epoch) _tileArtMem[key] = Promise.resolve(rec.v);
    });
    return true; // first hydration: one repaint of an open panel is warranted
  } catch (e) {
    return false;
  }
}

function preloadBrowseTileArt() {
  if (window.DECKHAND_CONFIG?.selfHosted) return;
  try {
    const keys = new Set();
    FMT_ORDER.forEach((f) =>
      keys.add(
        FMT_ICON_CARDS[f]
          ? 'nm|' + FMT_ICON_CARDS[f]
          : 'sf|' + artFmtParam(f) + '|' + leaderArtClause(f),
      ),
    );
    COLOR_COUNTS.filter((c) => c.key).forEach((c) => keys.add(bsArtSf(c.clause)));
    Object.values(COLOR_COMBOS).forEach((list) =>
      list.forEach((c) => keys.add(bsArtSf(c.key === 'c' ? 'id=c' : 'id=' + c.key))),
    );
    (browseThemeOptions() || []).forEach((o) => {
      const k = bsThemeArt(o.v);
      if (k) keys.add(k);
    });
    (browseKindredOptions() || []).forEach((t) => keys.add(bsArtEd(t.slug)));
    (async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let misses = 0;
      for (const k of keys) {
        // Step aside the moment the person does anything: live searches and
        // the priority lane always go first.
        while (_searchBusy > 0 || _sfQ.hi.length) {
          await sleep(600);
        }
        let v = null;
        try {
          v = await tileArtResolve(k);
        } catch (e) {}
        // Circuit breaker: consecutive total failures mean the network is
        // unreachable -- grinding every key through retries only burns
        // battery. Stop; the next warm run retries (failures are not cached).
        misses = v ? 0 : misses + 1;
        if (misses >= 4) {
          try {
            sfJournal('tile warm-up paused: network unreachable');
          } catch (e) {}
          break;
        }
        // Live upgrade, once per key: a tile still on baked/generic art is
        // quietly replaced by EDHREC's real most-played leader as soon as
        // the tag page answers. A miss here just means "try next warm run".
        if (v && k.indexOf('ed|') === 0 && v.src !== 'live' && !_tileArtUpgraded.has(k)) {
          _tileArtUpgraded.add(k);
          while (_searchBusy > 0 || _sfQ.hi.length) {
            await sleep(600);
          }
          const p = k.split('|');
          const fresh = _tagSrc(await _tileArtEdPick(p[1], p[2] || '').catch(() => null), 'live');
          if (fresh && fresh.a) {
            qdbSet('tileart2|' + k, fresh);
            _tileArtReady[k] = fresh;
            _tileArtMem[k] = Promise.resolve(fresh);
            _tileArtWarmImg(fresh.a);
          }
        }
        await sleep(150);
      }
    })();
  } catch (e) {}
}

/* Lazy loader: only tiles actually scrolled into the open panel fetch their
   art -- a hundred themes never fire a hundred requests at once. */
function wireArtTiles(root) {
  (root || document).querySelectorAll('.cselect-panel.cs-artgrid').forEach((panel) => {
    const sc = panel.querySelector('.cs-artscroll') || panel;
    sc.scrollTop = 0;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          const key = en.target.dataset.art;
          if (!key) return;
          tileArtResolve(key, true).then((v) => {
            if (!v || !v.a || !en.target.isConnected) return;
            const img = en.target.querySelector('.at-img');
            if (!img) return;
            // Dedupe against everything this panel already shows; .then
            // callbacks run serially, so each fill sees the previous paint.
            const used = new Set();
            panel.querySelectorAll('.at-img').forEach((el) => {
              if (el === img) return;
              const mm = /url\("(.*?)"\)/.exec(el.style.backgroundImage || '');
              if (mm) used.add(mm[1]);
            });
            const pick = tileArtPick(v, used);
            img.style.backgroundImage = `url("${pick.a}")`;
            en.target.title = pick.n;
          });
        });
      },
      { root: sc, rootMargin: '140px' },
    ); // the inner scroller is the scrollport now
    panel.querySelectorAll('.art-tile[data-art]').forEach((t) => io.observe(t));
  });
}

const FMT_ICON_CARDS = {
  commander: 'Sol Ring@lea', // @lea pins the original printing's classic art
  paupercommander: 'Tatyova, Benthic Druid',
  predh: 'Nicol Bolas',
  duel: 'Force of Will',
  standard: 'Sheoldred, the Apocalypse',
  pauper: 'Ninja of the Deep Hours',
  modern: 'Tarmogoyf',
  legacy: 'Brainstorm',
  vintage: 'Black Lotus',
};

function leaderArtClause(f) {
  return f === 'paupercommander'
    ? 't:creature r:uncommon'
    : f === 'duel'
      ? 'is:duelcommander'
      : 'is:commander';
}

function artFmtParam(f) {
  return f === 'paupercommander' ? 'any' : f;
}

function bsArtSf(extra) {
  const f = browseFmt();
  return 'sf|' + artFmtParam(f) + '|' + (leaderArtClause(f) + ' ' + (extra || '')).trim();
}

function bsArtEd(slug) {
  return 'ed|' + slug + '|' + ((state.browseSel && state.browseSel.combo) || '');
}

/* Art keys for the DECK-Inspiration drop-ups: scoped to the deck's own
   colors, not to the browse page's selection. Kindred prefers the real
   harvested EDHREC slug (right slug-form guaranteed); without one it falls
   back to a Scryfall most-played pick for that creature type in the deck's
   identity — a tile is never left text-only. */
function inspArtFmt(d) {
  return deckFormat(d) === 'commander' ? 'commander' : 'any';
}

function inspKindredArt(type, d) {
  const lk = String(type || '').toLowerCase();
  const plural = String(KINDRED_PLURAL_IRREGULAR[type] || type + 's').toLowerCase();
  const tags = state.edhrecTags || [];
  const match = (t) => {
    const l = String(t.label || '').toLowerCase();
    return l === lk || l === plural;
  };
  const tag = tags.find((t) => t.k && match(t)) || tags.find(match);
  if (tag) return 'ed|' + tag.slug + '|' + (deckComboKey(d) || '');
  return 'sf|' + inspArtFmt(d) + '|' + ('t:"' + lk + '" ' + idClauseForDeck(d)).trim();
}

/* Tile art for an EDHREC theme or kindred of the deck's leader: that tag's
   own EDHREC page in the deck's colours. */
function inspSlugArt(slug, d) {
  return slug ? 'ed|' + slug + '|' + (deckComboKey(d) || '') : '';
}

function inspThemeArt(v, d) {
  const th = BROWSE_THEMES.find((c) => c.key === v);
  if (!th || !th.clause) return '';
  return 'sf|' + inspArtFmt(d) + '|' + (th.clause + ' ' + idClauseForDeck(d)).trim();
}

function bsThemeArt(v) {
  if (!v) return bsArtSf(browseColorClause());
  if (v.indexOf('ed:') === 0) return bsArtEd(v.slice(3));
  try {
    const cl = themeQueryClause(v, browseCommanderMode());
    if (cl) return bsArtSf((cl + ' ' + browseColorClause()).trim());
  } catch (e) {}
  return '';
}
