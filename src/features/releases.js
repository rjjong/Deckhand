// features / releases

// Release metadata and update notices.
const APP_VERSION = '1.50';

const CHANGELOG_NOTES = {
  en: [
    'English-only interface',
    'First-start tour removed',
    'Card scanner removed',
    'Search filter: sort rows removed',
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
  },
  {
    v: '1.47',
    d: '2026-11-01',
    en: ['Dungeons shown as the real cards', 'Coloured dots: who is in which room'],
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
  },
  {
    v: '1.44',
    d: '2026-10-31',
    en: ['PC: search bar full page width', 'PC: deck toolbar fits small windows'],
  },
  {
    v: '1.43',
    d: '2026-10-31',
    en: ['Added cards use your own printing'],
  },
  {
    v: '1.41',
    d: '2026-10-31',
    en: [
      'Price and salt pills look like buttons',
      'Deck and collection totals too',
      'Title bars no longer grow',
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
  },
  {
    v: '1.38',
    d: '2026-10-31',
    en: [
      'Card view: same buttons everywhere',
      'Tags on every card view',
      'No more rows with one button',
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
  },
  {
    v: '1.36',
    d: '2026-10-31',
    en: [
      'Green + back on Similar cards',
      'Green + on recommendations too',
      'Gold search button scrolls along',
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
  },
  {
    v: '1.34',
    d: '2026-10-31',
    en: [
      'Treasure makers count as production',
      'Land search counts every colour',
      'Similar cards: tag weight tuned',
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
  },
  {
    v: '1.31',
    d: '2026-10-31',
    en: ['Clearer percentages in Stats'],
  },
  {
    v: '1.30',
    d: '2026-10-31',
    en: ['Plus buttons green, minus red', 'No more IN DECK label on tiles'],
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
  },
  {
    v: '1.24',
    d: '2026-10-30',
    en: ['PC: hover a card to see it big'],
  },
  {
    v: '1.23',
    d: '2026-10-30',
    en: [
      'PC & tablet: menu bar on the left',
      'PC & tablet: full screen width',
      'PC & tablet: card page side by side',
    ],
  },
  {
    v: '1.22',
    d: '2026-10-28',
    en: ['Partner groups pair only together'],
  },
  {
    v: '1.21',
    d: '2026-10-27',
    en: ['Search field selects all on tap', 'Partner pairings in a popup'],
  },
  { v: '1.20', d: '2026-10-27', en: ['Sharper Similar cards'] },
  {
    v: '1.19',
    d: '2026-10-24',
    en: ['Build decks with spoiler cards', 'Select spoilers with a long press'],
  },
  {
    v: '1.18',
    d: '2026-10-24',
    en: ['A printing pick stays where you made it'],
  },
  {
    v: '1.17',
    d: '2026-10-19',
    en: ['Cuts start with the AI right away', 'AI errors say what went wrong'],
  },
  {
    v: '1.16',
    d: '2026-10-19',
    en: ['AI judge and cuts run on Gemini', 'AI cuts read your whole deck'],
  },
  {
    v: '1.15',
    d: '2026-10-19',
    en: ['AI cuts answer again', 'AI says why when it can\u2019t answer'],
  },
  {
    v: '1.14',
    d: '2026-10-19',
    en: ['Tap the deck count to open Cuts', 'AI cuts read your leader better'],
  },
  {
    v: '1.13',
    d: '2026-10-18',
    en: ['AI picks cuts for your deck', 'AI advises lands and land count'],
  },
  {
    v: '1.12',
    d: '2026-10-16',
    en: ['Big card: tap above or below to close'],
  },
  {
    v: '1.11',
    d: '2026-10-15',
    en: ['Smooth swiping between cards'],
  },
  {
    v: '1.10',
    d: '2026-10-15',
    en: ['Inspiration search suggests names'],
  },
  {
    v: '1.9',
    d: '2026-10-15',
    en: ['From a deck: tips in its colours'],
  },
  {
    v: '1.8',
    d: '2026-10-15',
    en: [
      'Similar cards: pick several at once',
      'Card picks: select, then Add to\u2026',
      'Card picks are about the card itself',
    ],
  },
  {
    v: '1.7',
    d: '2026-10-15',
    en: ['Inspiration: tap a card for its details', 'Inspiration no longer edits your deck'],
  },
  {
    v: '1.6',
    d: '2026-10-14',
    en: ['Selection tick clear in every scheme', 'Dimir: no more black text on blue'],
  },
  {
    v: '1.5',
    d: '2026-10-14',
    en: [
      'Search hides cards that aren\u2019t legal',
      'In the deck? Tap \u2212 to take it out',
      'Clearer + button on search results',
    ],
  },
  {
    v: '1.4',
    d: '2026-10-13',
    en: ['Themes load reliably, and faster'],
  },
  {
    v: '1.3',
    d: '2026-10-13',
    en: ['Leader page keeps your theme choice'],
  },
  {
    v: '1.2',
    d: '2026-10-13',
    en: ['Inspiration stays put after loading', 'Loading ring clear of the menus'],
  },
  {
    v: '1.1',
    d: '2026-10-13',
    en: [
      'Leader page: theme shown in the title',
      'Theme/Kindred ready while loading',
      'Dimir: black instead of grey',
    ],
  },
  {
    v: '1.0',
    d: '2026-10-09',
    en: ['Deckhand 1.0 \u2014 welcome aboard', 'Send feedback from About Deckhand'],
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
  },
};

function changelogAll() {
  return [{ v: APP_VERSION, d: APP_DATE, en: CHANGELOG_NOTES.en }].concat(CHANGELOG_HISTORY);
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

function changelogDate(d) {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (e) {
    return d;
  }
}

// The releases as a list: open (start-up note) or each folded (Extras).
function changelogListHtml(entries, folded) {
  return entries
    .map((e) => {
      const notes = (e.en || []).map((n) => `<li>${escapeHtml(n)}</li>`).join('');
      const head = `<b>v${escapeHtml(e.v)}</b><span class="cl-date">${escapeHtml(changelogDate(e.d))}</span>`;
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
  return !!document.querySelector('#changelogScrim, #formatChangeScrim');
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
    } // First launch records the current version without opening a popup.
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

    const apkPart = apkNew
      ? (() => {
          const n = APK_NOTES[apkCur];
          const lis = n
            ? n.en.map((x) => `<li>${escapeHtml(x)}</li>`).join('')
            : `<li>${'The Android app was updated.'}</li>`;
          return `<div class="cl-entry cl-apk"><div class="cl-head">${inlIco('phone', 15)}<b>${'Android app'} ${escapeHtml(apkCur)}</b></div><ul class="cl-notes">${lis}</ul></div>`;
        })()
      : '';
    const title =
      'What\u2019s new' +
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
      <div class="cl-scroll" data-notr>${apkPart}${changelogListHtml(entries, false)}</div>
      <button class="ghost-btn" id="changelogOk" style="width:100%;margin-top:12px;">
        ${'Close'}
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
