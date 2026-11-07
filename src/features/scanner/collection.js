// SPDX-License-Identifier: AGPL-3.0-or-later
const scannerCollectionKey = (name) =>
  String(name || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();

function scannerCollectionCounts() {
  const counts = new Map();
  for (const item of state.collection.items) {
    const key = scannerCollectionKey(item.name);
    counts.set(key, (counts.get(key) || 0) + (Number(item.qty) || 0));
  }
  return counts;
}

// Every scan is one physical copy. Review remains available for foil, condition
// and binder choices; the quick-add action uses Near Mint, nonfoil, no binder.
function scannerAddToCollection(cards) {
  if (!cards.length) return;
  for (const card of cards) {
    const slim = slimForCollection(card);
    delete slim.foil;
    const same = state.collection.items.find(
      (item) =>
        item.name === slim.name &&
        item.set === slim.set &&
        (item.cn || '') === slim.cn &&
        item.cond === 'NM' &&
        !item.foil &&
        !item.binder,
    );
    if (same) same.qty = (Number(same.qty) || 0) + 1;
    else
      state.collection.items.unshift({
        ...slim,
        qty: 1,
        cond: 'NM',
        binder: null,
        addedAt: Date.now(),
      });
    state.collection.wantsManual = state.collection.wantsManual.filter(
      (item) => item.name !== slim.name,
    );
  }
  saveCollection();
}
