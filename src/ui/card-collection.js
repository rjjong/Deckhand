// A shared quantity control for cards opened from search, decks and collection.
function refreshCardCollectionQuantities() {
  const counts = new Map();
  for (const item of state.collection.items)
    counts.set(item.name, (counts.get(item.name) || 0) + Math.max(0, Number(item.qty ?? 1) || 0));
  document.querySelectorAll('.card-collection-quantity').forEach((widget) => {
    const count = counts.get(widget.dataset.cardName) || 0;
    widget.querySelector('[data-collection-count]').textContent = String(count);
    widget.querySelector('[data-collection-decrease]').disabled = count === 0;
  });
}

function cardCollectionQuantityHtml(card) {
  return `<div class="card-collection-quantity" data-card-name="${escapeHtml(card.name)}">
    <span>In collection <strong data-collection-count aria-live="polite">0</strong></span>
    <div><button type="button" data-collection-increase aria-label="Add one to collection" title="Add one to collection">${ICONS.plus}</button>
    <button type="button" data-collection-decrease aria-label="Remove one from collection" title="Remove one from collection" disabled>−</button></div>
  </div>`;
}

function wireCardCollectionQuantity(root, card, { item = null, onChange } = {}) {
  const control = root.querySelector('.card-collection-quantity');
  if (!control) return;
  let preferred = item;
  const sameName = (candidate) => candidate.name === card.name;
  const quantity = (candidate) => Math.max(0, Number(candidate.qty ?? 1) || 0);
  const matchesPrinting = (candidate) =>
    sameName(candidate) &&
    candidate.set === card.set &&
    String(candidate.cn || '') === String(card.collector_number || '') &&
    !!candidate.foil === !!card._foilPick;
  const refresh = refreshCardCollectionQuantities;
  const save = () => {
    saveCollection();
    state._colDirty = true;
    onChange?.();
  };
  control.querySelector('[data-collection-increase]').onclick = () => {
    if (preferred && !state.collection.items.includes(preferred)) {
      preferred.qty = 1;
      state.collection.items.unshift(preferred);
    } else {
      preferred = preferred || state.collection.items.find(matchesPrinting);
      if (preferred) preferred.qty = quantity(preferred) + 1;
      else {
        preferred = {
          ...colFoilSlim(slimForCollection(card), card, !!card._foilPick),
          qty: 1,
          cond: 'NM',
          binder: null,
          addedAt: Date.now(),
        };
        state.collection.items.unshift(preferred);
      }
    }
    state.collection.wantsManual = state.collection.wantsManual.filter(
      (candidate) => !sameName(candidate),
    );
    save();
  };
  control.querySelector('[data-collection-decrease]').onclick = () => {
    const candidates = state.collection.items.filter(
      (candidate) => sameName(candidate) && quantity(candidate) > 0,
    );
    const target = candidates.includes(preferred)
      ? preferred
      : candidates.find(matchesPrinting) || candidates[0];
    if (!target) {
      refresh();
      return;
    }
    if (!preferred && matchesPrinting(target)) preferred = target;
    target.qty = quantity(target) - 1;
    if (target.qty === 0) state.collection.items.splice(state.collection.items.indexOf(target), 1);
    save();
  };
  refresh();
}
