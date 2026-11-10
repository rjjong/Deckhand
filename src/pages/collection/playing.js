// Playing is a view of owned copies used by decks, never a second inventory.
function playingNameKey(name) {
  return String(name || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

function playingDeckCards(deck) {
  return deckLeaders(deck).concat(
    deck.cards || [],
    deckIsConstructed(deck) ? deck.maybeboard || [] : [],
  );
}

function playingDeckDemand(extraDeck) {
  const decks = (state.decksIndex || []).slice();
  if (extraDeck && !decks.some((deck) => deck.id === extraDeck.id)) decks.push(extraDeck);
  const demand = new Map();
  for (const deck of decks) {
    for (const card of playingDeckCards(deck)) {
      if (!card?.name || isCollectionBasicLand(card)) continue;
      const key = playingNameKey(card.name);
      if (!demand.has(key))
        demand.set(key, { name: card.name, card, physical: [], proxies: [], decks: new Set() });
      const entry = demand.get(key);
      (card.proxy ? entry.proxies : entry.physical).push({ card, deck });
      entry.decks.add(deck.name || 'Untitled deck');
    }
  }
  return demand;
}

function playingOwnedCounts() {
  const counts = new Map();
  for (const item of collectionTrackedItems()) {
    const key = playingNameKey(item.name);
    counts.set(key, (counts.get(key) || 0) + Math.max(0, Number(item.qty ?? 1) || 0));
  }
  return counts;
}

function playingDeckCopy(card, proxy = !!card.proxy) {
  const copy = { ...card, proxy };
  delete copy._playingOwned;
  delete copy._playingMissing;
  delete copy._wantsDismissed;
  return copy;
}

// Never invent inventory when an old deck, a restore or a collection change
// leaves a deck slot without an owned copy. Automatic proxies can become owned
// again when inventory arrives; an explicitly chosen proxy stays a proxy.
let playingReconcileSaving = false;
function reconcilePlayingOwnership(extraDeck, { skipDeck = null, persist = true } = {}) {
  if (playingReconcileSaving || (typeof _syncBusy !== 'undefined' && _syncBusy)) return [];
  const changed = new Set();
  const decks = (state.decksIndex || []).slice();
  if (extraDeck && !decks.some((deck) => deck.id === extraDeck.id)) decks.push(extraDeck);
  for (const deck of decks)
    for (const card of playingDeckCards(deck))
      if (
        isCollectionBasicLand(card) &&
        (card.proxy || card._playingMissing || card._playingOwned || card._wantsDismissed)
      ) {
        card.proxy = false;
        delete card._playingMissing;
        delete card._playingOwned;
        delete card._wantsDismissed;
        changed.add(deck);
      }
  const owned = playingOwnedCounts();
  for (const [key, entry] of playingDeckDemand(extraDeck)) {
    let remaining = owned.get(key) || 0;
    const eligible = entry.physical
      .slice()
      .sort((a, b) => Number(b.card.proxy === false) - Number(a.card.proxy === false))
      .concat(entry.proxies.filter(({ card }) => card._playingMissing));
    for (const { card, deck } of eligible) {
      const proxy = remaining <= 0;
      if (!proxy) remaining--;
      if (card.proxy !== proxy || !!card._playingMissing !== proxy) {
        card.proxy = proxy;
        if (proxy) {
          card._playingMissing = true;
          delete card._playingOwned;
        } else {
          delete card._playingMissing;
          delete card._wantsDismissed;
        }
        changed.add(deck);
      }
    }
  }
  if (persist && changed.size) {
    playingReconcileSaving = true;
    try {
      for (const deck of changed) if (deck !== skipDeck) scheduleSave(deck);
    } finally {
      playingReconcileSaving = false;
    }
  }
  return Array.from(changed);
}

function playingStackMatches(item, card) {
  return (
    playingNameKey(item.name) === playingNameKey(card.name) &&
    item.set === card.set &&
    String(item.cn || '') === String(card.collector_number || '') &&
    !!item.foil === !!card._foilPick
  );
}

function computePlaying() {
  const allocated = new Map();
  const byName = new Map();
  for (const item of collectionTrackedItems()) {
    const key = playingNameKey(item.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(item);
  }
  const remaining = new Map(
    state.collection.items.map((item) => [item, Math.max(0, Number(item.qty ?? 1) || 0)]),
  );
  for (const [key, entry] of playingDeckDemand()) {
    const owned = byName.get(key) || [];
    // Explicit physical additions take priority over legacy deck slots whose
    // ownership was never recorded, keeping newly assigned copies in their deck.
    entry.physical.sort((a, b) => Number(b.card.proxy === false) - Number(a.card.proxy === false));
    for (const { card, deck } of entry.physical) {
      const available = owned.filter((item) => remaining.get(item) > 0);
      const item = available.find((item) => playingStackMatches(item, card)) || available[0];
      if (!item) continue;
      remaining.set(item, remaining.get(item) - 1);
      if (!allocated.has(item))
        allocated.set(item, { ...item, qty: 0, decks: [], _collectionItem: item });
      const row = allocated.get(item);
      row.qty++;
      const name = deck.name || 'Untitled deck';
      if (!row.decks.includes(name)) row.decks.push(name);
    }
  }
  return Array.from(allocated.values());
}

// Unsorted contains unfiled spare copies, excluding the visible Wants list.
// View rows link to inventory so displaying a partial stack never duplicates it.
function collectionUnsortedItems() {
  const allocated = new Map(computePlaying().map((row) => [row._collectionItem, row.qty]));
  const wanted = new Set(computeWants().map((row) => playingNameKey(row.name)));
  return collectionTrackedItems().flatMap((item) => {
    if (item.binder || wanted.has(playingNameKey(item.name))) return [];
    const quantity = Math.max(0, Number(item.qty ?? 1) || 0);
    const spare = Math.max(0, quantity - (allocated.get(item) || 0));
    if (!spare) return [];
    return [spare === quantity ? item : { ...item, qty: spare, _collectionItem: item }];
  });
}

function collectionMoveCopies(item, quantity, binder) {
  const destination = binder || null;
  if ((item.binder || null) === destination) return;
  const amount = Math.min(quantity, Number(item.qty ?? 1) || 0);
  if (amount <= 0) return;
  const twin = state.collection.items.find(
    (candidate) =>
      candidate !== item &&
      playingNameKey(candidate.name) === playingNameKey(item.name) &&
      candidate.set === item.set &&
      String(candidate.cn || '') === String(item.cn || '') &&
      !!candidate.foil === !!item.foil &&
      candidate.cond === item.cond &&
      (candidate.binder || null) === destination,
  );
  if (twin) {
    twin.qty = (Number(twin.qty ?? 1) || 0) + amount;
    item.qty = (Number(item.qty ?? 1) || 0) - amount;
    if (!item.qty) state.collection.items.splice(state.collection.items.indexOf(item), 1);
  } else if (amount < Number(item.qty ?? 1)) {
    item.qty -= amount;
    state.collection.items.push({ ...item, qty: amount, binder: destination });
  } else item.binder = destination;
}

// Only new additions can create owned copies; opening/syncing old decks cannot.
function ensurePlayingOwnership(deck, cards) {
  const demand = playingDeckDemand(deck);
  const owned = playingOwnedCounts();
  let changed = false;
  for (const card of cards) {
    if (isCollectionBasicLand(card)) continue;
    delete card._playingMissing;
    delete card._wantsDismissed;
    card.proxy = !!card.proxy;
    const key = playingNameKey(card.name);
    if (card.proxy) {
      state.collection.wantsExclude = state.collection.wantsExclude.filter(
        (name) => playingNameKey(name) !== key,
      );
      changed = true;
      continue;
    }
    if (card._playingOwned || (owned.get(key) || 0) >= (demand.get(key)?.physical.length || 0))
      continue;
    const slim = colFoilSlim(slimForCollection(card), card, !!card._foilPick);
    let item = state.collection.items.find(
      (item) => playingStackMatches(item, card) && item.cond === 'NM' && !item.binder,
    );
    if (item) item.qty = (Number(item.qty) || 0) + 1;
    else {
      item = { ...slim, qty: 1, cond: 'NM', binder: null, addedAt: Date.now() };
      state.collection.items.unshift(item);
    }
    card._playingOwned = {
      name: item.name,
      set: item.set,
      cn: item.cn,
      foil: !!item.foil,
      cond: item.cond,
      binder: item.binder || null,
    };
    owned.set(key, (owned.get(key) || 0) + 1);
    state.collection.wantsManual = state.collection.wantsManual.filter(
      (item) => playingNameKey(item.name) !== key,
    );
    changed = true;
  }
  if (changed) saveCollection();
}

function setPlayingProxy(deck, card, proxy) {
  if (!!card.proxy === proxy && !card._playingMissing) return;
  delete card._playingMissing;
  delete card._wantsDismissed;
  if (proxy && card._playingOwned) {
    const linked = card._playingOwned;
    const item = state.collection.items.find(
      (item) =>
        playingNameKey(item.name) === playingNameKey(linked.name) &&
        item.set === linked.set &&
        item.cn === linked.cn &&
        !!item.foil === linked.foil &&
        item.cond === linked.cond &&
        (item.binder || null) === linked.binder,
    );
    if (item) {
      item.qty--;
      if (item.qty <= 0) state.collection.items.splice(state.collection.items.indexOf(item), 1);
    }
    delete card._playingOwned;
  }
  card.proxy = proxy;
  ensurePlayingOwnership(deck, [card]);
  saveCollection();
  scheduleSave(deck);
}

function playingProxyOptionHtml(id, checked = false, label = 'Use proxies · Add to Wants') {
  return `<label class="playing-proxy-option" for="${id}"><input type="checkbox" id="${id}"${checked ? ' checked' : ''}><span>${label}</span></label>`;
}

function playingWantsRequired(name) {
  const key = playingNameKey(name);
  const entry = playingDeckDemand().get(key);
  return (
    !!entry &&
    (entry.proxies.some(({ card }) => !card._wantsDismissed) ||
      entry.physical.length > (playingOwnedCounts().get(key) || 0))
  );
}

// An acquired Wants copy can replace one proxy without creating another owned copy.
function fulfillPlayingProxy(name, quantity = 1) {
  const entry = playingDeckDemand().get(playingNameKey(name));
  if (!entry) return;
  let available = Math.max(
    0,
    (playingOwnedCounts().get(playingNameKey(name)) || 0) - entry.physical.length,
  );
  const proxies = entry.proxies
    .slice()
    .sort((a, b) => Number(!!a.card._wantsDismissed) - Number(!!b.card._wantsDismissed));
  for (const { card, deck } of proxies) {
    if (quantity <= 0 || available <= 0) break;
    card.proxy = false;
    delete card._playingOwned;
    delete card._playingMissing;
    delete card._wantsDismissed;
    scheduleSave(deck);
    quantity--;
    available--;
  }
}
