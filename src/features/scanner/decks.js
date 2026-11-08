// SPDX-License-Identifier: AGPL-3.0-or-later
// Import the physical deck faithfully. The editor reports legality issues;
// scanning must not silently discard repeated copies or replace their printing.
function scannerAddScansToDeck(deck, cards, claimedLeaders = new Set(), { proxy = false } = {}) {
  const leaders = deckLeaders(deck);
  const copies = cards.map((card) => ({ ...playingDeckCopy(card, proxy), pin: true }));
  const addedCopies = [];
  let matched = 0;
  for (const card of copies) {
    const leader = leaders.find(
      (candidate) =>
        scannerCollectionKey(candidate.name) === scannerCollectionKey(card.name) &&
        !claimedLeaders.has(scannerCollectionKey(candidate.name)),
    );
    if (leader) {
      claimedLeaders.add(scannerCollectionKey(leader.name));
      if (!!leader.proxy !== proxy) setPlayingProxy(deck, leader, proxy);
      else if (proxy || !(playingOwnedCounts().get(playingNameKey(leader.name)) > 0))
        addedCopies.push(leader);
      leader.proxy = proxy;
      matched++;
    } else {
      deck.cards.push(card);
      addedCopies.push(card);
      logDeckChange(deck, { type: 'add', name: card.name, card });
    }
  }
  ensurePlayingOwnership(deck, addedCopies);
  deck.updatedAt = Date.now();
  persistDeck(deck);
  return { count: cards.length, matched, added: cards.length - matched };
}

function openScannerDeckChooser(
  batch,
  { signal, returnFocus, onDone, claimedLeaders = new Map(), deckId = null },
) {
  if (signal.aborted || !batch.isValid() || document.getElementById('scannerDeckPicker')) return;
  const targetDeck = deckId ? getDeck(deckId) : null;
  if (deckId && !targetDeck) {
    toast('This deck is no longer available.');
    return;
  }
  const el = document.createElement('div');
  el.id = 'scannerDeckPicker';
  el.className = 'deckpick-scrim scanner-deck-picker';
  const decks = targetDeck
    ? [targetDeck]
    : state.decksIndex.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const n = batch.cards.length;
  el.innerHTML = `<div class="deckpick app-dialog scanner-deck-sheet" role="dialog" aria-modal="true" aria-labelledby="scannerDeckPickerTitle">
    <header class="nd-heading"><span class="hub-icon" aria-hidden="true">${ICONS.decks}</span><div><h2 id="scannerDeckPickerTitle">Add to deck</h2><p>${n} scanned ${n === 1 ? 'card' : 'cards'} · One copy per scan</p></div></header>
    ${playingProxyOptionHtml('scannerDeckProxy')}
    ${targetDeck ? '' : '<button type="button" class="hub-card" id="scannerCreateDeck"><span class="hub-icon" aria-hidden="true">' + ICONS.plus + '</span><span><strong>Create new deck</strong><small>Choose a name, format and commander</small></span><span class="hub-arrow" aria-hidden="true">›</span></button>'}
    <div class="scanner-deck-list" aria-label="${targetDeck ? 'Current deck' : 'Existing decks'}">${decks.map((deck) => `<button type="button" class="hub-card" data-scanner-deck="${escapeHtml(deck.id)}" aria-label="Add to ${escapeHtml(deck.name)}"><span class="hub-icon" aria-hidden="true">${ICONS.decks}</span><span class="scanner-deck-copy"><strong>${escapeHtml(targetDeck ? 'Add to ' + deck.name : deck.name)}</strong><small>${escapeHtml(fmtLabelOf(deckFormat(deck)))} · ${deck.cards.length + deckLeaders(deck).length} cards</small></span><span class="hub-arrow" aria-hidden="true">›</span></button>`).join('') || '<p class="scanner-deck-empty">Your decks will appear here.</p>'}</div>
    <button type="button" class="dp-cancel dialog-secondary" id="scannerDeckCancel">Cancel</button>
  </div>`;
  const parent =
    returnFocus?.closest('[role="dialog"]') || document.getElementById('cardScannerCamera');
  const wasInert = parent?.inert;
  if (parent) parent.inert = true;
  document.body.appendChild(el);
  const controller = new AbortController();
  let closed = false,
    transferred = false,
    completed = null;
  const current = () => !closed && !signal.aborted && batch.isValid();
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (state.modal?.scannerPicker === el) closeModal();
    controller.abort();
    el.remove();
    if (parent?.isConnected) parent.inert = wasInert;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    if (completed) onDone?.(completed);
  };
  pushOverlay('scanner-deck-picker', cleanup);
  signal.addEventListener('abort', cleanup, { once: true, signal: controller.signal });
  wireAppDialogKeys(el, closeTopOverlay);
  const finish = (deck) => {
    if (!current() || transferred || !deck || (deckId && deck.id !== deckId)) return;
    transferred = true;
    if (!claimedLeaders.has(deck.id)) claimedLeaders.set(deck.id, new Set());
    scannerAddScansToDeck(deck, batch.cards, claimedLeaders.get(deck.id), {
      proxy: el.querySelector('#scannerDeckProxy').checked,
    });
    batch.commit('Added to ' + deck.name);
    completed = deck;
    toast(`${n} scanned ${n === 1 ? 'card' : 'cards'} saved to ${deck.name}.`);
    closeTopOverlay();
  };
  el.querySelectorAll('[data-scanner-deck]').forEach((button) => {
    button.onclick = () => finish(getDeck(button.dataset.scannerDeck));
  });
  const createButton = el.querySelector('#scannerCreateDeck');
  if (createButton)
    createButton.onclick = (event) => {
      if (!current()) return;
      el.inert = true;
      openModal('newdeck', {
        description: `${n} scanned ${n === 1 ? 'card' : 'cards'} will be added`,
        returnFocus: event.currentTarget,
        scannerPicker: el,
        onClose() {
          if (!closed) el.inert = false;
        },
        onCreate({ name, format, commander, partner }) {
          if (!current()) return;
          finish(createNewDeck(name, format, commander, partner, { open: false, persist: false }));
        },
      });
    };
  el.querySelector('#scannerDeckCancel').onclick = closeTopOverlay;
  el.addEventListener('click', (event) => {
    if (event.target === el) closeTopOverlay();
  });
  (createButton || el.querySelector('[data-scanner-deck]')).focus({ preventScroll: true });
}
