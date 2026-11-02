// ui / card-helpers

/* Perceived-wait reducer. Queue-psychology research (occupied time, the labor
   illusion, acknowledged waits) says busy waits feel shorter. Every spinner
   grows a short Magic quip beneath it, cycling every 2 seconds — no call sites
   change, re-renders reset the clock, and nothing shows in the first ~0.6s so
   instant loads never flash text. Each spinner starts at a randomised point in
   the list, so the lead quip varies and parallel spinners aren't in lockstep. */
const WAIT_QUIPS = [
  'Shuffling up…',
  'Untapping lands…',
  'Drawing seven…',
  'Mulligan to six…',
  'Keeping seven…',
  'Tapping mana…',
  'Floating mana…',
  'Holding priority…',
  'Respecting the stack…',
  'Missing triggers…',
  'Cracking fetches…',
  'Scrying deeply…',
  'Topdecking answers…',
  'Counting devotion…',
  'Proliferating patience…',
  'Cascading onward…',
  'Storm count rising…',
  'Declaring blockers…',
  'Paying ward costs…',
  'Dodging removal…',
  'Assessing threats…',
  'Politicking gently…',
  'Praying to topdeck…',
  'Sideboarding secretly…',
  'Reading the rulings…',
  'Consulting judges…',
  'Fetching basics…',
  'Exiling doubts…',
  'Flashing in…',
  'Going to combat…',
  'Passing the turn…',
  'Resolving triggers…',
  'Stacking triggers…',
  'Checking legalities…',
  'Counting lands…',
  'Curving out…',
  'Sculpting a hand…',
  'Digging for lands…',
  'Fixing mana…',
  'Ramping hard…',
  'Tutoring patiently…',
  'Milling ourselves…',
  'Flipping coins…',
  'Rolling a d20…',
  'Reading fine print…',
  'Triggering at upkeep…',
  'Swinging with everything…',
  'Bluffing the counterspell…',
];

setInterval(() => {
  document.querySelectorAll('.status').forEach((el) => {
    if (!el.querySelector('.spinner')) return; // static notes stay quiet
    if (!el.dataset.since) el.dataset.since = String(Date.now());
    const age = Date.now() - +el.dataset.since;
    let note = el.querySelector('.status-flavor');
    if (!note) {
      note = document.createElement('div');
      note.className = 'status-flavor';
      el.appendChild(note);
    }
    const off = +el.dataset.since % WAIT_QUIPS.length;
    const line = WAIT_QUIPS[(off + Math.floor(age / 2000)) % WAIT_QUIPS.length];
    if (note.textContent !== line) {
      note.textContent = line;
      note.style.animation = 'none';
      void note.offsetWidth;
      note.style.animation = '';
    }
  });
}, 250);

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  // Multi-line toasts (deck issues) get reading time proportional to length.
  const hold = Math.min(6500, 1700 + Math.max(0, String(msg).length - 40) * 30);
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), hold);
}

function getDeck(id) {
  const d = state.decksIndex.find((d) => d.id === id) || null;
  if (d && !d.maybeboard) d.maybeboard = [];
  return d;
}

function ensureChangelog(d) {
  if (!d.changelog) d.changelog = [];
  return d.changelog;
}

function logDeckChange(d, entry) {
  entry.ts = Date.now();
  entry.undone = false;
  entry.id = uid();
  ensureChangelog(d).unshift(entry);
  if (d.changelog.length > 300) d.changelog.length = 300;
  if ((entry.type === 'add' || entry.type === 'toMain') && entry.card)
    budgetNoteAdded(d, [entry.card], entry.type);
}

function histLabel(e) {
  // Verbs carry their own colour (added green, removed red, moved gold), and
  // board moves say "moved to" in words instead of an arrow.
  const nm = escapeHtml(e.name || '');
  const A = '<b class="hv-add">Added</b>',
    R = '<b class="hv-rem">Removed</b>',
    M = '<b class="hv-mov">moved to</b>';
  switch (e.type) {
    case 'add':
      return { ico: '+', html: `${A} ${nm}` };
    case 'addMaybe':
      return { ico: '☆', html: `${A} ${nm} to Maybeboard` };
    case 'remove':
      return { ico: '−', html: `${R} ${nm}` };
    case 'removeMaybe':
      return { ico: '−', html: `${R} ${nm} from Maybeboard` };
    case 'toMaybe':
      return { ico: '⇢', html: `${nm} ${M} Maybeboard` };
    case 'toMain':
      return { ico: '⇠', html: `${nm} ${M} Main Deck` };
    case 'admiral':
      return { ico: anchorSvg(14), html: `${nm} appointed Commander` };
    case 'admiralOff':
      return { ico: anchorSvg(14), html: `${nm} relieved of command` };
    case 'bulk':
      return { ico: '✎', html: nm };
    default:
      return { ico: '•', html: nm || 'Change' };
  }
}

function histWhen(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const dd = Math.floor(h / 24);
  if (dd < 7) return dd + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function canUndo(e) {
  return (
    !e.undone &&
    !e.viaUndo &&
    [
      'add',
      'addMaybe',
      'remove',
      'removeMaybe',
      'toMaybe',
      'toMain',
      'admiral',
      'admiralOff',
    ].includes(e.type)
  );
}

function histActionFor(e) {
  switch (e.type) {
    case 'add':
      return { label: 'Remove', act: 'removeMain' };
    case 'remove':
      return { label: 'Add', act: 'addMain' };
    case 'addMaybe':
      return { label: 'Remove', act: 'removeMaybe' };
    case 'removeMaybe':
      return { label: 'Add', act: 'addMaybe' };
    case 'toMaybe':
      return { label: trS('To main deck'), act: 'moveMain' };
    case 'toMain':
      return { label: trS('To maybeboard'), act: 'moveMaybe' };
    case 'admiral':
    case 'admiralOff':
      return canUndo(e) ? { label: trS('Undo'), act: 'undo' } : null;
    default:
      return null;
  }
}

function applyHistAction(d, entryId) {
  const e = ensureChangelog(d).find((x) => x.id === entryId);
  if (!e) return false;
  const a = histActionFor(e);
  if (!a) return false;
  if (a.act === 'undo') return undoDeckChange(d, entryId);
  const inMain = () => d.cards.findIndex((x) => x.name === e.name);
  const inMaybe = () => ensureMaybeboard(d).findIndex((x) => x.name === e.name);
  let ok = false,
    msg = '';
  switch (a.act) {
    case 'removeMain': {
      const i = inMain();
      if (i >= 0) {
        const [c] = d.cards.splice(i, 1);
        logDeckChange(d, { type: 'remove', name: e.name, card: c });
        ok = true;
        msg = `${e.name} removed.`;
      } else msg = `${e.name} is not in the deck.`;
      break;
    }
    case 'addMain': {
      const c = e.card;
      if (!c) {
        msg = 'Nothing stored to re-add.';
        break;
      }
      if (atCopyLimit(d, c)) {
        msg = `${e.name} is already in the deck.`;
        break;
      }
      if (d.admiral && !colorIdentityOkDeck(c, d)) {
        msg = `${e.name} is off-color for the current leaders.`;
        break;
      }
      if (deckBlockReason(c, d)) {
        msg = `${e.name}: ${deckBlockReason(c, d).toLowerCase()}.`;
        break;
      }
      d.cards.push(c);
      logDeckChange(d, { type: 'add', name: e.name, card: c });
      ok = true;
      msg = `${e.name} added.`;
      break;
    }
    case 'removeMaybe': {
      const i = inMaybe();
      if (i >= 0) {
        const [c] = d.maybeboard.splice(i, 1);
        logDeckChange(d, { type: 'removeMaybe', name: e.name, card: c });
        ok = true;
        msg = `${e.name} removed from Maybeboard.`;
      } else msg = `${e.name} is not in the Maybeboard.`;
      break;
    }
    case 'addMaybe': {
      const c = e.card;
      if (!c) {
        msg = 'Nothing stored to re-add.';
        break;
      }
      ensureMaybeboard(d).push(c);
      logDeckChange(d, { type: 'addMaybe', name: e.name, card: c });
      ok = true;
      msg = `${e.name} added to Maybeboard.`;
      break;
    }
    case 'moveMain': {
      const i = inMaybe();
      if (i >= 0) {
        const [c] = d.maybeboard.splice(i, 1);
        d.cards.push(c);
        logDeckChange(d, { type: 'toMain', name: e.name, card: c });
        ok = true;
        msg = `${e.name} to Main Deck.`;
      } else msg = `${e.name} is not in the Maybeboard.`;
      break;
    }
    case 'moveMaybe': {
      const i = inMain();
      if (i >= 0) {
        const [c] = d.cards.splice(i, 1);
        ensureMaybeboard(d).push(c);
        logDeckChange(d, { type: 'toMaybe', name: e.name, card: c });
        ok = true;
        msg = `${e.name} to Maybeboard.`;
      } else msg = `${e.name} is not in the deck.`;
      break;
    }
  }
  if (ok) scheduleSave(d);
  toast(msg);
  return ok;
}

function undoDeckChange(d, entryId) {
  const e = ensureChangelog(d).find((x) => x.id === entryId);
  if (!e || e.undone) return;
  const inMain = () => d.cards.findIndex((x) => x.name === e.name);
  const inMaybe = () => ensureMaybeboard(d).findIndex((x) => x.name === e.name);
  let ok = false,
    msg = '';
  switch (e.type) {
    case 'add': {
      const i = inMain();
      if (i >= 0) {
        d.cards.splice(i, 1);
        ok = true;
        msg = `${e.name} removed (undo).`;
      } else msg = `${e.name} is no longer in the deck.`;
      break;
    }
    case 'addMaybe': {
      const i = inMaybe();
      if (i >= 0) {
        d.maybeboard.splice(i, 1);
        ok = true;
        msg = `${e.name} removed from Maybeboard (undo).`;
      } else msg = `${e.name} is no longer in the Maybeboard.`;
      break;
    }
    case 'remove': {
      if (!e.card) {
        msg = 'Nothing stored to restore.';
        break;
      }
      if (atCopyLimit(d, e.card)) {
        msg = `${e.name} is already back in the deck.`;
        break;
      }
      if (d.admiral && !colorIdentityOkDeck(e.card, d)) {
        msg = `${e.name} is off-color for the current leaders.`;
        break;
      }
      if (deckBlockReason(e.card, d)) {
        msg = `${e.name}: ${deckBlockReason(e.card, d).toLowerCase()}.`;
        break;
      }
      d.cards.push(e.card);
      ok = true;
      msg = `${e.name} restored (undo).`;
      break;
    }
    case 'removeMaybe': {
      if (!e.card) {
        msg = 'Nothing stored to restore.';
        break;
      }
      ensureMaybeboard(d).push(e.card);
      ok = true;
      msg = `${e.name} restored to Maybeboard (undo).`;
      break;
    }
    case 'toMaybe': {
      const i = inMaybe();
      if (i >= 0) {
        const [c] = d.maybeboard.splice(i, 1);
        d.cards.push(c);
        ok = true;
        msg = `${e.name} back to Main Deck (undo).`;
      } else msg = `${e.name} is no longer in the Maybeboard.`;
      break;
    }
    case 'toMain': {
      const i = inMain();
      if (i >= 0) {
        const [c] = d.cards.splice(i, 1);
        ensureMaybeboard(d).push(c);
        ok = true;
        msg = `${e.name} back to Maybeboard (undo).`;
      } else msg = `${e.name} is no longer in the deck.`;
      break;
    }
    case 'admiral': {
      if (!d.admiral || d.admiral.name !== e.name) {
        msg = 'The Commander has changed since.';
        break;
      }
      const demoted = d.admiral;
      d.admiral = e.prev || null;
      reconcilePartner(d);

      if (e.prevKept && e.prev) {
        const i = d.cards.findIndex((x) => x.name === e.prev.name);
        if (i >= 0) d.cards.splice(i, 1);
      }
      // And the demoted card returns to the main deck rather than vanishing.
      if (!d.cards.some((x) => x.name === demoted.name) || allowsDuplicates(demoted))
        d.cards.push(demoted);
      ok = true;
      msg = e.prev
        ? `${e.prev.name} reinstated as Commander (undo).`
        : 'Commander position vacated (undo).';
      break;
    }
    case 'admiralOff': {
      if (d.admiral) {
        msg = `${d.admiral.name} now holds command.`;
        break;
      }
      if (!e.card) {
        msg = 'Nothing stored to restore.';
        break;
      }
      d.admiral = e.card;
      ok = true;
      msg = `${e.name} reinstated as Commander (undo).`;
      break;
    }
  }
  if (ok) {
    e.undone = true;
    // The undo itself becomes a visible entry, so history reads as what
    // actually happened instead of only a crossed-out line.
    const mirror = {
      add: () => ({ type: 'remove', name: e.name, card: e.card }),
      addMaybe: () => ({ type: 'removeMaybe', name: e.name, card: e.card }),
      remove: () => ({ type: 'add', name: e.name, card: e.card }),
      removeMaybe: () => ({ type: 'addMaybe', name: e.name, card: e.card }),
      toMaybe: () => ({ type: 'toMain', name: e.name, card: e.card }),
      toMain: () => ({ type: 'toMaybe', name: e.name, card: e.card }),
      admiral: () =>
        e.prev
          ? { type: 'admiral', name: e.prev.name, card: e.prev }
          : { type: 'admiralOff', name: e.name, card: e.card },
      admiralOff: () => ({ type: 'admiral', name: e.name, card: e.card }),
    }[e.type];
    if (mirror) {
      const m = mirror();
      m.viaUndo = true;
      logDeckChange(d, m);
    }
    scheduleSave(d);
  }
  toast(msg);
  return ok;
}

function histRowHtml(e) {
  const l = histLabel(e);
  const img = e.card ? cardImageLarge(e.card) || cardImage(e.card) : '';
  return /* HTML */ `<div class="hist-row ${e.undone ? 'undone' : ''}">
    <span class="hist-ico">${l.ico}</span>
    <span class="hist-txt"
      ><span class="ht-n ${img ? 'card-link' : ''}" ${img ? `data-himg="${img}"` : ''}
        >${l.html}</span
      ><span class="ht-s"
        >${histWhen(e.ts)}${e.undone ? ' · undone' : ''}${e.viaUndo ? ' · undo' : ''}</span
      ></span
    >
    ${(() => {
      const a = histActionFor(e);
      return a ? `<button class="undo-btn" data-undo="${e.id}">${a.label}</button>` : '';
    })()}
  </div>`;
}

function wireHistImages(root) {
  (root || document).querySelectorAll('.ht-n[data-himg]').forEach((n) => {
    if (n.dataset.w) return;
    n.dataset.w = '1';
    n.addEventListener('click', () => showPreview(n.dataset.himg));
  });
}

function openHistoryOverlay(d) {
  let el = document.getElementById('historyOverlay');
  const renderIt = () => {
    const log = ensureChangelog(d);
    el.innerHTML = /* HTML */ `<div class="overlay-inner">
      <div class="topbar" style="position:relative;">
        <button class="icon-btn" id="histBack">${ICONS.back}</button>
        <div class="tb-titles">
          <div class="t1">History</div>
          <div class="t2">${escapeHtml(d.name)}</div>
        </div>
      </div>
      <main style="max-width:560px;margin:0 auto;width:100%;">
        ${log.length ? log.map(histRowHtml).join('') : `<div class="empty-note">No changes logged yet — history starts recording from now on.</div>`}
      </main>
    </div>`;
    document.getElementById('histBack').addEventListener('click', closeTopOverlay);
    wireHistImages(el);
    el.querySelectorAll('[data-undo]').forEach((b) =>
      b.addEventListener('click', () => {
        applyHistAction(d, b.dataset.undo);
        renderIt();
        const box = document.getElementById('decklistBox');
        if (box) {
          box.innerHTML = categorizedListHtml(d);
          wireDecklistInteractions(d);
          updateDeckMeter(d);
        }
      }),
    );
  };
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'historyOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  pushOverlay('history', () => {
    document.getElementById('historyOverlay')?.remove();
    if (state.screen === 'decklist') render();
  });
  renderIt();
}

function ensureMaybeboard(d) {
  if (!d.maybeboard) d.maybeboard = [];
  return d.maybeboard;
}
