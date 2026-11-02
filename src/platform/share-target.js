// platform / share-target

/* ---- Android share sheet → Deckhand (share_target, v2.51.589) ----
   The WebAPK registers as a share target; shared text arrives as
   ?share_text=…&share_url=…. Classify it and route: a decklist opens the
   paste-a-list sheet prefilled, a Scryfall link or card name opens that
   card, a deck-site link opens the paste sheet with the link as source.
   Mode isolation: every flow below already builds for the CURRENT fleet. */
function classifyShared(text) {
  const t = String(text || '').trim();
  if (!t) return { kind: 'none' };
  const url = (t.match(/https?:\/\/\S+/) || [])[0] || '';
  if (url) {
    const m = url.match(/scryfall\.com\/card\/([a-z0-9]+)\/([a-z0-9★†]+)/i);
    if (m) return { kind: 'scryfall', set: m[1].toLowerCase(), num: m[2], url };
    if (/edhrec\.com|moxfield\.com|archidekt\.com/i.test(url)) return { kind: 'deckSource', url };
    return { kind: 'url', url };
  }
  const lines = t
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const deckish = lines.filter((l) => /^\d+\s*x?\s+\S/i.test(l)).length;
  if (lines.length >= 2 && deckish >= Math.max(2, Math.ceil(lines.length * 0.5)))
    return { kind: 'decklist', text: t };
  if (lines.length === 1 && t.length <= 60) return { kind: 'cardname', name: t };
  return { kind: 'decklist', text: t };
}

async function handleSharedIncoming(raw) {
  const c = classifyShared(raw);
  const pasteWith = (text) => {
    switchPage('decks');
    try {
      openPasteListSheet({});
    } catch (e) {
      try {
        openPasteListSheet();
      } catch (e2) {
        return;
      }
    }
    setTimeout(() => {
      const ta = document.getElementById('pasteDeckText');
      if (ta) {
        ta.value = text;
        ta.scrollTop = 0;
      }
    }, 120);
  };
  if (c.kind === 'decklist') {
    pasteWith(c.text);
    return;
  }
  if (c.kind === 'deckSource' || c.kind === 'url') {
    pasteWith(c.url);
    toast('Link received — paste-import opened.');
    return;
  }
  if (c.kind === 'scryfall' || c.kind === 'cardname') {
    try {
      const path =
        c.kind === 'scryfall'
          ? '/cards/' + c.set + '/' + encodeURIComponent(c.num)
          : '/cards/named?fuzzy=' + encodeURIComponent(c.name);
      const r = await sfFetch(SF_BASE + path, 0, false);
      if (r && r.ok) {
        const card = await r.json();
        if (card && card.name) {
          openCardInfo(card);
          return;
        }
      }
    } catch (e) {}
    state.searchName = c.name || raw;
    switchPage('search');
  }
}

try {
  const _sp = new URLSearchParams(location.search);
  if (_sp.has('share_text') || _sp.has('share_url') || _sp.has('share_title')) {
    const _sharedRaw =
      [_sp.get('share_text'), _sp.get('share_url')].filter(Boolean).join(' ').trim() ||
      _sp.get('share_title') ||
      '';
    try {
      history.replaceState(history.state, '', location.pathname + location.hash);
    } catch (e) {}
    if (_sharedRaw)
      setTimeout(() => {
        try {
          handleSharedIncoming(_sharedRaw);
        } catch (e) {}
      }, 400);
  }
} catch (e) {}

/* Launcher shortcuts (long-press the app icon) arrive as …/?go=page. Only a
   REAL install has them, so this quietly doubles as proof of one. The query
   is stripped at once, so a refresh lands on the normal home page. */
try {
  const _goParam = new URLSearchParams(location.search).get('go');
  // From the update push: the boot's changelog check will show it, seen or not.
  if (_goParam === 'changelog') _forceChangelog = true;
  if (_goParam) {
    try {
      history.replaceState(history.state, '', location.pathname + location.hash);
    } catch (e) {}
    setTimeout(() => {
      try {
        if (_goParam === 'life') {
          openLifeOverlay();
          return;
        }
        if (_goParam === 'changelog') return;
        // ?go=spoilers komt ook uit de pushmelding over nieuwe kaarten: die
        // hoort de spoilerpagina te openen, niet stilletjes thuis te landen.
        const pages = {
          decks: 'decks',
          search: 'search',
          browse: 'browse',
          collection: 'collection',
          extras: 'settings',
          settings: 'settings',
          spoilers: 'spoilers',
          news: 'news',
        };
        if (_goParam === 'wants') {
          state.colFilter.binder = '__wants__';
          switchPage('collection');
          return;
        }
        if (pages[_goParam]) switchPage(pages[_goParam]);
      } catch (e) {}
    }, 150);
  }
} catch (e) {}

// Living catalogs, fetched once the app is settled — 30-day cache.
setTimeout(() => {
  try {
    ensureCreatureTypes();
  } catch (e) {}
}, 5000);

setTimeout(() => {
  try {
    pwTellNative();
  } catch (e) {}
}, 1500);

setTimeout(() => {
  try {
    apkUpdateCheck();
  } catch (e) {}
}, 4000);

try {
  localStorage.removeItem(LS_PREFIX + 'cutsAI');
} catch (e) {}
// 1.27: Cuts is gone
setTimeout(() => {
  try {
    if (syncState()) syncRun('start');
  } catch (e) {}
}, 3000);
// 1.26
setTimeout(() => {
  try {
    dvPrune();
  } catch (e) {}
}, 20000);
// 1.27
setTimeout(async () => {
  try {
    await dailyPricesReady();
  } catch (e) {}
  try {
    pwStartupCheck();
  } catch (e) {}
}, 9000);

/* 1.25 Keyboard: the arrow keys step through cards on an open card page,
   exactly like its chevrons. Typing in a field is left alone. */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (document.getElementById('nselPop')) return;
  const ovs = document.querySelectorAll('body > .overlay:not(.swipe-leaving)');
  const top = ovs[ovs.length - 1];
  if (!top) return;
  const b = top.querySelector('.ci-nav-arrow.' + (e.key === 'ArrowRight' ? 'right' : 'left'));
  if (!b) return;
  e.preventDefault();
  b.click();
});
