// features / onboarding

/* ================= WHAT'S NEW =================
   PUBLISHER: when you upload a new version, bump APP_VERSION and put the
   changes in CHANGELOG_NOTES below ({en:[…], nl:[…]}, one string per bullet,
   BOTH languages every release). Every
   player sees the popup exactly once after the update lands.
   SHORT, Stef's rule: as many bullets as needed, each at most 40 characters,
   about what the player notices -- no explanations, no causes, no
   technical words. A test enforces it. Also bump the
   VERSION string in sw.js so phones fetch the new build.
   NUMBERING (Stef, 4 Oct 2026, from 1.0 on): a small update adds one after
   the dot (1.0 -> 1.1 -> 1.2), a big one goes to the next whole number and
   resets the dot (1.8 -> 2.0).
   FRESH START (Stef, 9 Oct 2026): the line that ran to 1.41 starts over at
   1.0, the version shared with friends. A device that last saw a higher
   number simply adopts 1.0 (see maybeShowChangelog). */
const APP_VERSION = '1.50';

const CHANGELOG_NOTES = {
  en: [
    'Short tour: only the highlights',
    'Tour arrows point at each feature',
    'Card scanner removed',
    'Search filter: sort rows removed',
  ],
  nl: [
    'Korte rondleiding: alleen highlights',
    'Pijltjes wijzen naar elke feature',
    'Kaartscanner verwijderd',
    'Zoekfilter: sorteerregels weg',
  ],
};

/* The history. PUBLISHER, every release: move the previous CHANGELOG_NOTES
   to the top of CHANGELOG_HISTORY (with its date), then write the new notes
   above and set APP_DATE. The start-up note shows every release since the
   player's last visit; Extras -> What's new shows the past month (the
   button appears once there is a history: 1.0 is the starting point). */
const APP_DATE = '2026-11-01';

const CHANGELOG_HISTORY = [
  {
    v: '1.49',
    d: '2026-11-01',
    en: ['Dice: the result stays on screen'],
    nl: ['Dobbelsteen: uitslag blijft in beeld'],
  },
  {
    v: '1.48',
    d: '2026-11-01',
    en: [
      'Life counter: bigger cards, no margin',
      'Life counter: thicker status pill',
      'History: a run of taps is one line',
      'Win animation for the last player',
    ],
    nl: [
      'Life counter: grotere kaarten',
      'Life counter: dikkere statuspil',
      'Geschiedenis: reeks tikken = één regel',
      'Winanimatie voor de laatste speler',
    ],
  },
  {
    v: '1.47',
    d: '2026-11-01',
    en: ['Dungeons shown as the real cards', 'Coloured dots: who is in which room'],
    nl: ['Dungeons als de echte kaarten', 'Gekleurde stipjes: wie zit waar'],
  },
  {
    v: '1.46',
    d: '2026-11-01',
    en: [
      'Life counter: Monarch with a crown',
      'Life counter: track every Dungeon',
      'Life counter: AI judge as a popup',
      'Life counter: restore an earlier game',
    ],
    nl: [
      'Life counter: Monarch met kroon',
      'Life counter: alle Dungeons bijhouden',
      'Life counter: AI-judge als popup',
      'Life counter: eerder potje herstellen',
    ],
  },
  {
    v: '1.45',
    d: '2026-11-01',
    en: [
      'Scryfall tags on/off per deck',
      'Scryfall tags have a gold rim',
      'PC: page names in the top bar',
      'PC: filters open in the middle',
      'PC: gold + at the top left',
      'PC: deck menu opens under Menu',
      'PC: click again to close the zoom',
      'PC: click beside a popup closes it',
    ],
    nl: [
      'Scryfall-tags aan/uit per deck',
      'Scryfall-tags hebben een gouden rand',
      'Pc: paginanaam in de bovenbalk',
      'Pc: filters openen in het midden',
      'Pc: gouden + linksboven',
      'Pc: deckmenu opent onder Menu',
      'Pc: nogmaals klikken sluit de zoom',
      'Pc: klik naast popup sluit hem',
    ],
  },
  {
    v: '1.44',
    d: '2026-10-31',
    en: ['PC: search bar full page width', 'PC: deck toolbar fits small windows'],
    nl: ['Pc: zoekbalk over volle breedte', 'Pc: deckwerkbalk past in klein venster'],
  },
  {
    v: '1.43',
    d: '2026-10-31',
    en: ['Added cards use your own printing'],
    nl: ['Toegevoegde kaart krijgt jouw printing'],
  },
  {
    v: '1.41',
    d: '2026-10-31',
    en: [
      'Price and salt pills look like buttons',
      'Deck and collection totals too',
      'Title bars no longer grow',
    ],
    nl: [
      'Prijs- en saltpil lijken knoppen',
      'Ook bij deck- en collectietotaal',
      'Titelbalken worden niet hoger',
    ],
  },
  {
    v: '1.40',
    d: '2026-10-31',
    en: [
      'Add: pick amount, deck or collection',
      'Select: collection & maybe buttons',
      'Jump opens a folded Maybeboard',
      'Smart: you choose to block or not',
      'Show everything on top in filters',
      'Extras tiles rearranged',
    ],
    nl: [
      'Add: aantal, deck of collectie',
      'Selectie: collectie- en maybeknop',
      'Springen opent een dichte Maybeboard',
      'Smart: jij kiest blokken of niet',
      'Show everything bovenaan in filters',
      'Tegels bij Extra\u2019s herschikt',
    ],
  },
  {
    v: '1.39',
    d: '2026-10-31',
    en: [
      'Playtest: Smart opponents switch',
      'Playtest: drag cards to any zone',
      'Playtest: graveyard beside commander',
      'Playtest: battlefield sorts itself',
      'Playtest: new draws on the left',
      'Swipe: shorter drag, quick flick',
      'Trackpad swipe steps through cards',
      'Price pill looks like a button',
      'Land AI removed',
    ],
    nl: [
      'Speeltest: Smart-tegenstanders',
      'Speeltest: sleep kaarten naar zones',
      'Speeltest: graveyard naast commander',
      'Speeltest: slagveld sorteert zichzelf',
      'Speeltest: nieuwe kaart links in hand',
      'Swipe: kortere veeg, snelle flick',
      'Trackpad-swipe bladert door kaarten',
      'Prijsknop ziet eruit als knop',
      'Land-AI verwijderd',
    ],
  },
  {
    v: '1.38',
    d: '2026-10-31',
    en: [
      'Card view: same buttons everywhere',
      'Tags on every card view',
      'No more rows with one button',
    ],
    nl: [
      'Kaartweergave: overal dezelfde knoppen',
      'Tags bij elke kaartweergave',
      'Geen regels meer met één knop',
    ],
  },
  {
    v: '1.37',
    d: '2026-10-31',
    en: [
      'Suggest land base in Inspiration',
      'Search card view shows Scryfall tags',
      'Show everything stays at the foot',
    ],
    nl: [
      'Landbase voorstellen bij Inspiratie',
      'Zoeken toont Scryfall-tags bij kaart',
      'Show everything blijft onderaan',
    ],
  },
  {
    v: '1.36',
    d: '2026-10-31',
    en: [
      'Green + back on Similar cards',
      'Green + on recommendations too',
      'Gold search button scrolls along',
    ],
    nl: [
      'Groene + terug bij Similar cards',
      'Groene + ook bij aanbevelingen',
      'Gouden zoekknop scrolt mee',
    ],
  },
  {
    v: '1.35',
    d: '2026-10-31',
    en: [
      'PC: search filter panel full height',
      'Find in deck no longer hits the loupe',
      'Search deck opens without bouncing',
      'Search filters: tidier, no Name row',
      'Set filter sits above Color Identity',
      'i-buttons explain harder filters',
    ],
    nl: [
      'Pc: zoekfilterpaneel weer volle hoogte',
      'Zoeken in deck raakt de loep niet',
      'Search deck opent zonder wiebelen',
      'Zoekfilters netter, zonder Name',
      'Set staat boven Color Identity',
      'i-knopjes leggen filters uit',
    ],
  },
  {
    v: '1.34',
    d: '2026-10-31',
    en: [
      'Treasure makers count as production',
      'Land search counts every colour',
      'Similar cards: tag weight tuned',
    ],
    nl: [
      'Treasure-makers tellen als productie',
      'Land zoeken telt alle kleuren',
      'Similar cards: tag-gewicht bijgesteld',
    ],
  },
  {
    v: '1.33',
    d: '2026-10-31',
    en: [
      'Similar lands that do the same job',
      'Budget lands ranked the same way',
      'Search: pick several tags at once',
      'Search filters without help texts',
    ],
    nl: [
      'Similar lands die hetzelfde doen',
      'Budget-lands net zo gerangschikt',
      'Zoeken: meerdere tags tegelijk',
      'Zoekfilters zonder uitlegtekst',
    ],
  },
  {
    v: '1.32',
    d: '2026-10-31',
    en: [
      'Mana production counts all producers',
      'Ramp that fetches lands counts too',
      'Similar cards: tags weigh more',
      'Budget ranks just like Similar',
      'Budget: focus on one tag per card',
    ],
    nl: [
      'Mana production telt alle producers',
      'Ramp die lands zoekt telt ook mee',
      'Similar cards: tags wegen zwaarder',
      'Budget rangschikt net als Similar',
      'Budget: focus op één tag per kaart',
    ],
  },
  {
    v: '1.31',
    d: '2026-10-31',
    en: ['Clearer percentages in Stats'],
    nl: ['Duidelijkere percentages bij Stats'],
  },
  {
    v: '1.30',
    d: '2026-10-31',
    en: ['Plus buttons green, minus red', 'No more IN DECK label on tiles'],
    nl: ['Plusjes groen, minnetjes rood', 'Geen IN DECK-label meer op tegels'],
  },
  {
    v: '1.29',
    d: '2026-10-31',
    en: [
      'Life counter fills the screen',
      'Deckhand logo opens the table menu',
      'Leave via the menu: Settings',
      'Bigger life totals',
      'Name under a thin status pill',
      'Clearer table choice for new games',
    ],
    nl: [
      'Life counter vult het scherm',
      'Deckhand-logo opent het tafelmenu',
      'Verlaten via menu → Instellingen',
      'Grotere levenstotalen',
      'Naam onder een dunne statuspil',
      'Tafelkeuze bij nieuw spel duidelijker',
    ],
  },
  {
    v: '1.28',
    d: '2026-10-31',
    en: [
      'PC: menu bar on top, reads top-down',
      'PC: calmer width, bigger text',
      'PC: click a card to see it big',
      'PC: right-click menu has a ✕',
      'PC: buttons show their names',
      'PC: bigger, wider news',
      'Extras buttons work on PC again',
      'Card menu closes when a page opens',
    ],
    nl: [
      'Pc: menubalk boven, van boven af',
      'Pc: rustiger breedte, grotere tekst',
      'Pc: klik op kaart toont hem groot',
      'Pc: rechtsklikmenu heeft een ✕',
      'Pc: knoppen tonen hun naam',
      'Pc: groter en breder nieuws',
      "Extra's-knoppen werken weer op pc",
      'Kaartmenu sluit bij nieuwe pagina',
    ],
  },
  {
    v: '1.27',
    d: '2026-10-31',
    en: [
      'Restore earlier deck versions',
      'Bring back deleted decks',
      'Cuts removed; lands advice stays',
      'PC: news in three columns',
      'PC: card page in the middle',
    ],
    nl: [
      'Eerdere deckversies terugzetten',
      'Verwijderde decks terughalen',
      'Cuts weg; lands-advies blijft',
      'Pc: nieuws in drie kolommen',
      'Pc: kaartpagina in het midden',
    ],
  },
  {
    v: '1.26',
    d: '2026-10-31',
    en: [
      'Sync between phone, tablet and PC',
      'Tag lists: search field, clear groups',
      'PC: right-click a card for its menu',
      'PC: Shift-click selects a range',
      'PC: / jumps to search',
      'PC: Ctrl+V a deck list to import',
      'PC: decklist in columns per type',
      'PC: search filters beside results',
    ],
    nl: [
      'Sync tussen telefoon, tablet en pc',
      'Taglijst: zoekveld, duidelijke groepen',
      'Pc: rechtsklik op kaart toont menu',
      'Pc: Shift-klik selecteert een reeks',
      'Pc: / springt naar zoeken',
      'Pc: Ctrl+V decklijst om te importeren',
      'Pc: decklijst in kolommen per type',
      'Pc: zoekfilters naast de resultaten',
    ],
  },
  {
    v: '1.25',
    d: '2026-10-31',
    en: [
      'Similar cards: focus on one tag',
      'Recommendations: focus on a tag',
      'Next card no longer flickers',
      'PC: arrow keys step through cards',
      'PC: tidier Stats, Extras, rows',
    ],
    nl: [
      'Similar cards: focus op één tag',
      'Aanbevelingen: focus op een tag',
      'Volgende kaart flikkert niet meer',
      'Pc: pijltjes bladeren door kaarten',
      "Pc: nettere Stats, Extra's, rijen",
    ],
  },
  {
    v: '1.24',
    d: '2026-10-30',
    en: ['PC: hover a card to see it big'],
    nl: ['Pc: muis op kaart toont hem groot'],
  },
  {
    v: '1.23',
    d: '2026-10-30',
    en: [
      'PC & tablet: menu bar on the left',
      'PC & tablet: full screen width',
      'PC & tablet: card page side by side',
    ],
    nl: [
      'Pc & tablet: menubalk links',
      'Pc & tablet: volle schermbreedte',
      'Pc & tablet: kaartpagina naast elkaar',
    ],
  },
  {
    v: '1.22',
    d: '2026-10-28',
    en: ['Partner groups pair only together'],
    nl: ['Partner-groepen alleen onderling'],
  },
  {
    v: '1.21',
    d: '2026-10-27',
    en: ['Search field selects all on tap', 'Partner pairings in a popup'],
    nl: ['Zoekveld selecteert alles bij tik', 'Partner-combinaties in een popup'],
  },
  { v: '1.20', d: '2026-10-27', en: ['Sharper Similar cards'], nl: ['Scherpere Similar cards'] },
  {
    v: '1.19',
    d: '2026-10-24',
    en: ['Build decks with spoiler cards', 'Select spoilers with a long press'],
    nl: ['Decks bouwen met spoilerkaarten', 'Spoilers selecteren: lang indrukken'],
  },
  {
    v: '1.18',
    d: '2026-10-24',
    en: ['A printing pick stays where you made it'],
    nl: ['Gekozen versie geldt alleen daar'],
  },
  {
    v: '1.17',
    d: '2026-10-19',
    en: ['Cuts start with the AI right away', 'AI errors say what went wrong'],
    nl: ['Cuts begint meteen met de AI', 'AI-fouten zeggen wat er misging'],
  },
  {
    v: '1.16',
    d: '2026-10-19',
    en: ['AI judge and cuts run on Gemini', 'AI cuts read your whole deck'],
    nl: ['AI-judge en cuts via Gemini', 'AI-cuts lezen je hele deck'],
  },
  {
    v: '1.15',
    d: '2026-10-19',
    en: ['AI cuts answer again', 'AI says why when it can\u2019t answer'],
    nl: ['AI-cuts geven weer antwoord', 'AI zegt waarom het mislukt'],
  },
  {
    v: '1.14',
    d: '2026-10-19',
    en: ['Tap the deck count to open Cuts', 'AI cuts read your leader better'],
    nl: ['Tik op de teller: Cuts gaat open', 'AI-cuts lezen je leider beter'],
  },
  {
    v: '1.13',
    d: '2026-10-18',
    en: ['AI picks cuts for your deck', 'AI advises lands and land count'],
    nl: ['AI kiest cuts voor je deck', 'AI adviseert lands en aantal'],
  },
  {
    v: '1.12',
    d: '2026-10-16',
    en: ['Big card: tap above or below to close'],
    nl: ['Grote kaart sluit boven/onder de kaart'],
  },
  {
    v: '1.11',
    d: '2026-10-15',
    en: ['Smooth swiping between cards'],
    nl: ['Soepel swipen tussen kaarten'],
  },
  {
    v: '1.10',
    d: '2026-10-15',
    en: ['Inspiration search suggests names'],
    nl: ['Inspiratie-zoeken stelt namen voor'],
  },
  {
    v: '1.9',
    d: '2026-10-15',
    en: ['From a deck: tips in its colours'],
    nl: ['Vanuit een deck: tips in zijn kleuren'],
  },
  {
    v: '1.8',
    d: '2026-10-15',
    en: [
      'Similar cards: pick several at once',
      'Card picks: select, then Add to\u2026',
      'Card picks are about the card itself',
    ],
    nl: [
      'Similar cards: kies er meerdere',
      'Kaart-tips: selecteer, dan Voeg toe',
      'Kaart-tips gaan over de kaart zelf',
    ],
  },
  {
    v: '1.7',
    d: '2026-10-15',
    en: ['Inspiration: tap a card for its details', 'Inspiration no longer edits your deck'],
    nl: ['Inspiratie: tik een kaart voor details', 'Inspiratie past je deck niet meer aan'],
  },
  {
    v: '1.6',
    d: '2026-10-14',
    en: ['Selection tick clear in every scheme', 'Dimir: no more black text on blue'],
    nl: ['Selectievinkje overal goed zichtbaar', 'Dimir: geen zwarte tekst meer op blauw'],
  },
  {
    v: '1.5',
    d: '2026-10-14',
    en: [
      'Search hides cards that aren\u2019t legal',
      'In the deck? Tap \u2212 to take it out',
      'Clearer + button on search results',
    ],
    nl: [
      'Zoeken toont geen illegale kaarten',
      'In het deck? Tik \u2212 om te verwijderen',
      'Duidelijkere +-knop bij zoeken',
    ],
  },
  {
    v: '1.4',
    d: '2026-10-13',
    en: ['Themes load reliably, and faster'],
    nl: ['Thema\u2019s laden betrouwbaar en sneller'],
  },
  {
    v: '1.3',
    d: '2026-10-13',
    en: ['Leader page keeps your theme choice'],
    nl: ['Leaderpagina neemt je thema over'],
  },
  {
    v: '1.2',
    d: '2026-10-13',
    en: ['Inspiration stays put after loading', 'Loading ring clear of the menus'],
    nl: ['Inspiratie verspringt niet na laden', 'Laadring niet meer over de menu\u2019s'],
  },
  {
    v: '1.1',
    d: '2026-10-13',
    en: [
      'Leader page: theme shown in the title',
      'Theme/Kindred ready while loading',
      'Dimir: black instead of grey',
    ],
    nl: [
      'Leaderpagina: thema in de titel',
      'Theme/Kindred al kiesbaar bij laden',
      'Dimir: zwart in plaats van grijs',
    ],
  },
  {
    v: '1.0',
    d: '2026-10-09',
    en: ['Deckhand 1.0 \u2014 welcome aboard', 'Send feedback from About Deckhand'],
    nl: ['Deckhand 1.0 \u2014 welkom aan boord', 'Feedback sturen via Over Deckhand'],
  },
];

/* The Android app's own news, per APK version: shown in the update sheet
   before installing, and again at the first start after the install (people
   tap Install without reading). */
const APK_NOTES = {
  '1.0': {
    en: [
      'Scanner uses your phone\u2019s camera',
      'Reads cards faster and sharper',
      'True colours and a lamp',
    ],
    nl: [
      'Scanner gebruikt je eigen camera',
      'Leest kaarten sneller en scherper',
      'Echte kleuren en een lamp',
    ],
  },
};

function changelogAll() {
  return [{ v: APP_VERSION, d: APP_DATE, en: CHANGELOG_NOTES.en, nl: CHANGELOG_NOTES.nl }].concat(
    CHANGELOG_HISTORY,
  );
}

// Every release newer than the one the player last saw (all we know, when
// that was still the old 2.51.x numbering).
function changelogSince(seen) {
  const all = changelogAll();
  if (!seen) return all.slice(0, 1);
  const s0 = +String(seen).split('.')[0] || 0,
    c0 = +APP_VERSION.split('.')[0] || 0;
  if (s0 > c0) return all;
  return all.filter((e) => apkVerCmp(e.v, seen) > 0);
}

function changelogDate(d, NL) {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString(NL ? 'nl-NL' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (e) {
    return d;
  }
}

// The releases as a list: open (start-up note) or each folded (Extras).
function changelogListHtml(entries, NL, folded) {
  return entries
    .map((e) => {
      const notes = ((NL ? e.nl : e.en) || e.en || [])
        .map((n) => `<li>${escapeHtml(n)}</li>`)
        .join('');
      const head = `<b>v${escapeHtml(e.v)}</b><span class="cl-date">${escapeHtml(changelogDate(e.d, NL))}</span>`;
      return folded
        ? `<div class="cl-entry"><button type="button" class="cl-head" data-clv="${escapeHtml(e.v)}">${head}<span class="fold-ico">\u25BE</span></button><ul class="cl-notes" hidden>${notes}</ul></div>`
        : `<div class="cl-entry"><div class="cl-head">${head}</div><ul class="cl-notes">${notes}</ul></div>`;
    })
    .join('');
}

// The past month, for Extras (at least the newest release).
function changelogMonth() {
  const all = changelogAll(),
    lim = Date.now() - 31 * 864e5;
  const m = all.filter((e) => {
    const t = Date.parse(e.d + 'T12:00:00');
    return isFinite(t) && t >= lim;
  });
  return m.length ? m : all.slice(0, 1);
}

/* One start-up note at a time: a note that finds another on screen waits
   its turn and shows when that one closes. */
const _noticeQ = [];

function noticeBusy() {
  return !!document.querySelector('#changelogScrim, #formatChangeScrim, #welcomeScrim');
}

function noticeLater(fn) {
  if (_noticeQ.indexOf(fn) < 0) _noticeQ.push(fn);
}

function noticeNext() {
  setTimeout(() => {
    if (noticeBusy()) return;
    const f = _noticeQ.shift();
    if (f) {
      try {
        f();
      } catch (e) {}
    }
  }, 300);
}

/* ---------- Guided tour (first run + replay from Extras) ----------
   One popup per page: it says what the page does, the button at its foot
   walks to the NEXT page and shows that page's popup there. The popup is a
   centered house modal (deckpick tokens only — kleurenwet: light ink on the
   dark panel, no new colors) at z-index 120, above card-sheet overlays
   (z 100). switchPage() dismisses any overlay a step opened, so every
   transition is clean. Texts are bilingual like the old welcome. */
function tourSteps() {
  const NL = appLang() === 'nl';
  const d0 = () => (state.decksIndex && state.decksIndex[0]) || null;
  const P = (x) => `<p style="margin:2px 0;">${x}</p>`;
  // 1.50: highlights only -- what sets Deckhand apart. Each step points at
  // its feature (sel); steps that need a deck are skipped without one.
  return [
    {
      k: 'home',
      go: () => switchPage('home'),
      sel: ['.banner-tabs'],
      t: NL ? 'Welkom bij Deckhand' : 'Welcome to Deckhand',
      b: NL
        ? P(
            'Gebouwd voor je duim: alles zit <strong>onderin</strong>. Negen formats. Werkt <strong>offline</strong>.',
          ) +
          P(`<span style="color:var(--sub-text);">Tip: Chrome ⋮ → <em>App installeren</em>.</span>`)
        : P(
            'Built for your thumb: everything sits <strong>at the bottom</strong>. Nine formats. Works <strong>offline</strong>.',
          ) +
          P(`<span style="color:var(--sub-text);">Tip: Chrome ⋮ → <em>Install app</em>.</span>`),
    },
    {
      k: 'decks',
      go: () => switchPage('decks'),
      sel: ['#deckFab'],
      t: NL ? 'Je decks' : 'Your decks',
      b: NL
        ? P(
            'Plak of laad een lijst: elk deck valt vanzelf in de map van zijn <strong>format</strong>.',
          )
        : P(
            'Paste or load a list: every deck files itself into its <strong>format</strong> folder.',
          ),
    },
    {
      k: 'decklist',
      need: 'deck',
      go: () => {
        const d = d0();
        if (d) {
          state.activeDeckId = d.id;
          state.builderTab = 'list';
          switchPage('decklist');
        }
      },
      sel: ['#dockInspire'],
      t: '✦ Inspiration',
      b: NL
        ? P(
            'Alle <strong>EDHREC</strong>-tips voor je commander die je nog niet speelt, plus landbases.',
          )
        : P(
            'Every <strong>EDHREC</strong> pick for your commander you don’t run yet, plus land bases.',
          ),
    },
    {
      k: 'card',
      need: 'deck',
      go: () => {
        const d = d0();
        const c = d && (d.admiral || (d.cards || [])[0]);
        if (c) {
          try {
            openCardInfo(c);
          } catch (e) {}
        }
      },
      sel: ['#ciSimilar', '#csSimilar'],
      t: NL ? 'Similar cards' : 'Similar cards',
      b: NL
        ? P(
            'Kaarten die <strong>hetzelfde doen</strong>, op tags gerangschikt. Budget vindt goedkopere.',
          )
        : P(
            'Cards that <strong>do the same job</strong>, ranked by tags. Budget finds cheaper ones.',
          ),
    },
    {
      k: 'collection',
      go: () => switchPage('collection'),
      sel: ['#colFab'],
      t: NL ? 'Mappen die zichzelf vullen' : 'Binders that fill themselves',
      b: NL
        ? P(
            'Geef een map <strong>regels</strong> (kleur, rarity, prijs) en nieuwe kaarten landen vanzelf in de goede.',
          )
        : P(
            'Give a binder <strong>rules</strong> (colour, rarity, price) and new cards land in the right one.',
          ),
    },
    {
      k: 'search',
      go: () => switchPage('search'),
      sel: ['#qChev'],
      t: NL ? 'Zoek op wat een kaart doet' : 'Search by what a card does',
      b: NL
        ? P(
            'Het filter zoekt op <strong>tags</strong>: removal, ramp, draw … combineer er zoveel je wilt.',
          )
        : P(
            'The filter searches by <strong>tags</strong>: removal, ramp, draw … combine as many as you like.',
          ),
    },
    {
      k: 'inspiration',
      go: () => switchPage('browse'),
      sel: ['.browse-selects .bs-row', '#bsName'],
      t: '✦ Inspiration',
      b: NL
        ? P(
            '<strong>Top-commanders</strong>, staples en <strong>meta-decks</strong> voor elk format.',
          )
        : P(
            '<strong>Top commanders</strong>, staples and <strong>meta decks</strong> for every format.',
          ),
    },
    {
      k: 'extras',
      go: () => switchPage('menu'),
      sel: ['#crRow'],
      t: NL ? 'Vraag de AI-judge' : 'Ask the AI judge',
      b: NL
        ? P(
            'Regelvraag aan tafel? Tag de kaarten met @ en krijg antwoord mét de officiële regels. Life Counter en Draft tools staan ernaast.',
          )
        : P(
            'Rules question at the table? Tag the cards with @ and get an answer with the official rules. Life Counter and Draft tools sit beside it.',
          ),
    },
  ].filter((st) => st.need !== 'deck' || d0());
}

/* 1.50: the tour bubble sits beside its feature -- above it when there is
   room, else below -- and a gold arrow runs from the bubble to a pulsing
   ring around the feature. The bubble never covers what it explains. */
function tourTarget(sel) {
  for (const q of [].concat(sel || [])) {
    for (const e of document.querySelectorAll(q)) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return e;
    }
  }
  return null;
}

function placeTourBubble() {
  const el = document.getElementById('tourScrim');
  if (!el || !el._tour) return;
  const box = el.querySelector('.tour-bubble'),
    svg = el.querySelector('.tour-arrow'),
    ring = el.querySelector('.tour-ring');
  if (!box) return;
  const W = window.innerWidth,
    H = window.innerHeight,
    M = 10,
    GAP = 52;
  const bw = Math.min(330, W - 2 * M);
  box.style.width = bw + 'px';
  let t = tourTarget(el._sel);
  if (t && !el._scrolled) {
    const r0 = t.getBoundingClientRect();
    if (r0.top < 0 || r0.bottom > H) {
      el._scrolled = true;
      try {
        t.scrollIntoView({ block: 'center' });
      } catch (e) {}
    }
  }
  const bh = box.offsetHeight;
  if (!t) {
    box.style.left = Math.round((W - bw) / 2) + 'px';
    box.style.top = '64px';
    svg.style.display = 'none';
    ring.style.display = 'none';
    return;
  }
  const r = t.getBoundingClientRect();
  const roomAbove = r.top - GAP - M,
    roomBelow = H - r.bottom - GAP - M;
  const above = roomAbove >= bh || roomAbove >= roomBelow;
  let top = above ? r.top - GAP - bh : r.bottom + GAP;
  top = Math.max(M, Math.min(H - M - bh, top));
  const cx = r.left + r.width / 2;
  const left = Math.max(M, Math.min(W - M - bw, cx - bw / 2));
  box.style.left = Math.round(left) + 'px';
  box.style.top = Math.round(top) + 'px';
  // The ring around the feature.
  ring.style.display = '';
  ring.style.left = r.left - 5 + 'px';
  ring.style.top = r.top - 5 + 'px';
  ring.style.width = r.width + 10 + 'px';
  ring.style.height = r.height + 10 + 'px';
  // The arrow: from the bubble's edge to the ring, ending in a head.
  const sx = Math.max(left + 24, Math.min(left + bw - 24, cx)),
    sy = above ? top + bh + 2 : top - 2;
  const ex = cx,
    ey = above ? r.top - 9 : r.bottom + 9;
  const my = (sy + ey) / 2,
    dir = above ? 1 : -1;
  svg.style.display = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML =
    `<path d="M${sx} ${sy} C${sx} ${my} ${ex} ${my} ${ex} ${ey - dir * 8}"/>` +
    `<polygon points="${ex - 8},${ey - dir * 10} ${ex + 8},${ey - dir * 10} ${ex},${ey}"/>`;
}

window.addEventListener('resize', () => {
  try {
    placeTourBubble();
  } catch (e) {}
});

function startAppTour() {
  state._tourI = 0;
  // A brand-new user has never chosen a language — the tour opens with that
  // question, and the whole app (tour included) follows the answer. Anyone
  // who already picked one (or replays from Extras) goes straight in.
  let hasLang = null;
  try {
    hasLang = localStorage.getItem(LS_PREFIX + 'lang');
  } catch (e) {}
  if (!hasLang) {
    showTourLangChoice();
    return;
  }
  showTourStep();
}

function showTourLangChoice() {
  document.getElementById('tourScrim')?.remove();
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'tourScrim';
  el.innerHTML = /* HTML */ `<div
    class="deckpick"
    style="border-radius:14px;margin:0 12px;max-width:330px;padding:10px 12px 12px;box-shadow:0 10px 30px rgba(0,0,0,0.6);"
  >
    <h4 style="font-size:12.5px;margin:0 0 2px;">${inlIco('globe', 14)}Taal · Language</h4>
    <div style="font-size:12px;line-height:1.45;color:var(--ink-text);">
      <p style="margin:4px 0;">In welke taal wil je de rondleiding en de app?</p>
      <p style="margin:4px 0;">Which language would you like for the tour and the app?</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
      <button
        class="primary-btn"
        data-tourlang="nl"
        style="width:100%;padding:9px 10px;font-size:13.5px;"
      >
        Nederlands
      </button>
      <button
        class="primary-btn"
        data-tourlang="en"
        style="width:100%;padding:9px 10px;font-size:13.5px;"
      >
        English
      </button>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.style.background = 'transparent';
  el.style.alignItems = 'flex-start';
  el.style.paddingTop = 'calc(64px + env(safe-area-inset-top))';
  el.querySelectorAll('[data-tourlang]').forEach((b) =>
    b.addEventListener('click', () => {
      const code = b.dataset.tourlang;
      try {
        // The exact routine the Extras language toggle runs — one behavior.
        setAppLang(code);
        state._langImgCache = {};
        if (code === 'en') {
          disableI18n();
          render();
        } else {
          render();
          enableI18n();
          try {
            translateTree(document.body);
          } catch (err) {}
        }
      } catch (e) {}
      showTourStep();
    }),
  );
}

function endAppTour(finished) {
  document.getElementById('tourScrim')?.remove();
  state._tourI = null;
  try {
    localStorage.setItem(LS_PREFIX + 'welcomed', '1');
  } catch (e) {}
  if (finished) {
    switchPage('home');
    toast(appLang() === 'nl' ? 'Veel plezier met Deckhand!' : 'Enjoy Deckhand!');
  }
}

function showTourStep() {
  const steps = tourSteps();
  const i = state._tourI | 0;
  if (i >= steps.length) {
    endAppTour(true);
    return;
  }
  const s = steps[i];
  document.getElementById('tourScrim')?.remove();
  try {
    if (s.go) s.go();
  } catch (e) {}
  const NL = appLang() === 'nl';
  // A beat so the page paints beneath before the popup covers it.
  setTimeout(() => {
    if (state._tourI !== i) return;
    document.getElementById('tourScrim')?.remove();
    const el = document.createElement('div');
    el.className = 'deckpick-scrim';
    el.id = 'tourScrim';
    const last = i === steps.length - 1;
    el.innerHTML = /* HTML */ `<svg class="tour-arrow" aria-hidden="true"></svg>
      <div class="tour-ring" aria-hidden="true"></div>
      <div class="deckpick tour-bubble" style="position:absolute;">
        <h4 style="font-size:13px;margin:0 0 2px;">${s.t}</h4>
        <div style="font-size:12.5px;line-height:1.45;color:var(--ink-text);">${s.b}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
          <span
            style="font-size:11px;color:var(--sub-text);flex:0 0 auto;font-family:'JetBrains Mono',monospace;"
            >${i + 1}/${steps.length}</span
          >
          <button
            class="ghost-btn"
            id="tourSkip"
            style="flex:0 0 auto;padding:7px 10px;font-size:12px;"
          >
            ${NL ? 'Overslaan' : 'Skip'}
          </button>
          <button
            class="primary-btn"
            id="tourNext"
            style="flex:1;padding:9px 10px;font-size:13.5px;"
          >
            ${last ? (NL ? 'Klaar' : 'Done') : (NL ? 'Volgende' : 'Next') + ' ›'}
          </button>
        </div>
      </div>`;
    // See-through guide: no darkening, the page stays fully visible while
    // the scrim still swallows stray taps. 1.50: the bubble is placed next to
    // the feature it explains (placeTourBubble), never on top of it.
    el.style.background = 'transparent';
    el._tour = true;
    el._sel = s.sel;
    document.body.appendChild(el);
    placeTourBubble();
    [250, 700].forEach((ms) =>
      setTimeout(() => {
        if (state._tourI === i) placeTourBubble();
      }, ms),
    );
    document.getElementById('tourNext').addEventListener('click', () => {
      state._tourI = i + 1;
      showTourStep();
    });
    document.getElementById('tourSkip').addEventListener('click', () => endAppTour(false));
  }, 380);
}

/* ---------- First-visit welcome (new players usually arrive via a shared
   deck link, so this waits until any showcase overlay has been closed).
   Since v2.51.586 the single welcome popup became the guided tour above. ---------- */
function maybeShowWelcome() {
  try {
    if (localStorage.getItem(LS_PREFIX + 'welcomed')) return false;
    // Existing players don't need the newcomer tour — mark them welcomed silently
    if ((state.decksIndex || []).length) {
      localStorage.setItem(LS_PREFIX + 'welcomed', '1');
      return false;
    }
    const show = () => {
      if (document.getElementById('tourScrim') || state._tourI != null) return;
      startAppTour();
    };
    if (pendingShareToken() || document.getElementById('showcaseOverlay')) {
      // Let the shared deck page have the spotlight first
      const wait = setInterval(() => {
        if (!document.getElementById('showcaseOverlay') && !pendingShareToken()) {
          clearInterval(wait);
          show();
        }
      }, 900);
    } else {
      show();
    }
    return true;
  } catch (e) {
    return false;
  }
}

/* Set when the app was opened by tapping the update push (…/?go=changelog):
   then the newest changelog shows again, even if it was seen before. Any
   other start still shows it only once. */
let _forceChangelog = false;

function maybeShowChangelog() {
  try {
    if (document.getElementById('changelogScrim')) return; // already on screen
    if (noticeBusy()) {
      noticeLater(maybeShowChangelog);
      return;
    }
    const force = _forceChangelog;
    _forceChangelog = false;
    const seen = localStorage.getItem(LS_PREFIX + 'seenVersion');
    // 1.41: the Android app -- a newer APK than last time gets its own part
    const apkCur = apkInstalled();
    let apkSeen = null;
    try {
      apkSeen = localStorage.getItem(LS_PREFIX + 'apkSeen');
    } catch (e) {}
    if (apkCur && !apkSeen) {
      try {
        localStorage.setItem(LS_PREFIX + 'apkSeen', apkCur);
      } catch (e) {}
      apkSeen = apkCur;
    }
    const apkNew = !!(apkCur && apkSeen && apkCmp(apkCur, apkSeen) > 0);
    if (!seen && !force) {
      localStorage.setItem(LS_PREFIX + 'seenVersion', APP_VERSION);
      return;
    } // brand-new user: the welcome note covers them, no popup
    // the fresh start: a device that last saw a higher number (the old line
    // up to 1.41, or 2.51.x) takes 1.0 as its new starting point, quietly
    let seen2 = seen;
    if (seen && apkVerCmp(seen, APP_VERSION) > 0) {
      try {
        localStorage.setItem(LS_PREFIX + 'seenVersion', APP_VERSION);
      } catch (e) {}
      seen2 = APP_VERSION;
    }
    // everything since the last visit, however many releases that is
    const entries =
      seen2 === APP_VERSION ? (force ? changelogAll().slice(0, 1) : []) : changelogSince(seen2);
    if (!entries.length && !apkNew) return;
    const NL = appLang() === 'nl';
    const apkPart = apkNew
      ? (() => {
          const n = APK_NOTES[apkCur];
          const lis = n
            ? ((NL ? n.nl : n.en) || n.en).map((x) => `<li>${escapeHtml(x)}</li>`).join('')
            : `<li>${NL ? 'De Android-app is bijgewerkt.' : 'The Android app was updated.'}</li>`;
          return `<div class="cl-entry cl-apk"><div class="cl-head">${inlIco('phone', 15)}<b>${NL ? 'Android-app' : 'Android app'} ${escapeHtml(apkCur)}</b></div><ul class="cl-notes">${lis}</ul></div>`;
        })()
      : '';
    const title =
      (NL ? 'Wat is nieuw' : 'What\u2019s new') +
      (entries.length + (apkNew ? 1 : 0) > 1
        ? ` \u2014 ${entries.length + (apkNew ? 1 : 0)} updates`
        : entries.length
          ? ` \u2014 v${entries[0].v}`
          : '');
    // The same plain sheet as the About popup: rises from the foot, closes
    // with its button, a tap beside it, or the back button. The list scrolls.
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'changelogScrim';
    el.innerHTML = /* HTML */ `<div class="modal-sheet">
      <h3>${title}</h3>
      <div class="cl-scroll" data-notr>${apkPart}${changelogListHtml(entries, NL, false)}</div>
      <button class="ghost-btn" id="changelogOk" style="width:100%;margin-top:12px;">
        ${NL ? 'Sluiten' : 'Close'}
      </button>
    </div>`;
    document.body.appendChild(el);
    // Seen only once dismissed — if anything reloads the page mid-read, the
    // note simply greets the user again instead of vanishing half-shown.
    const close = () => {
      try {
        localStorage.setItem(LS_PREFIX + 'seenVersion', APP_VERSION);
        if (apkCur) localStorage.setItem(LS_PREFIX + 'apkSeen', apkCur);
      } catch (e) {}
      el.remove();
      noticeNext();
    };
    const done = () => {
      close();
      const st = state.overlayStack;
      if (st.length && st[st.length - 1].id === 'changelog') st.pop();
    };
    document.getElementById('changelogOk').addEventListener('click', done);
    el.addEventListener('click', (e) => {
      if (e.target === el) done();
    });
    pushOverlay('changelog', close);
  } catch (e) {}
}
