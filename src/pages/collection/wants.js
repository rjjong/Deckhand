// Wants selection is keyed by card name, independently of owned collection rows.
function pruneWantsSelection(items) {
  const visible = new Set(items.map((item) => playingNameKey(item.name)));
  state.wantSel = new Set(Array.from(state.wantSel || []).filter((key) => visible.has(key)));
  if (!state.wantSel.size) state.wantSel = null;
}

function selectedWantedRows() {
  return computeWants().filter((item) => state.wantSel?.has(playingNameKey(item.name)));
}

function wantsSelectionHtml(items) {
  if (!items.length) return '';
  return `<div class="wants-select-tools"><button type="button" class="ghost-btn" id="wantSelectAll">${ICONS.selectAll}<span>Select all</span></button></div>
    <div class="wants-selection-bar" id="wantSelectionBar" role="group" aria-label="Selected Wants actions"${state.wantSel?.size ? '' : ' hidden'}>
      <span id="wantSelectionCount" role="status"></span>
      <button type="button" id="wantSelectionAll" aria-label="Select all Wants" title="Select all">${ICONS.selectAll}</button>
      <button type="button" id="wantSelectionAdd" aria-label="Add selected cards to a binder" title="Add to binder">${ICONS.binder}</button>
      <button type="button" id="wantSelectionRemove" aria-label="Remove selected cards from Wants" title="Remove from Wants">${ICONS.trash}</button>
      <button type="button" id="wantSelectionClear" aria-label="Clear Wants selection" title="Deselect all">${ICONS.close}</button>
    </div>`;
}

let wantsBulkBusy = false;

function paintWantsSelection() {
  const root = document.querySelector('.wants-page');
  if (!root) return;
  const rows = selectedWantedRows();
  const selected = rows.length > 0;
  root.classList.toggle('wants-selecting', selected);
  root.querySelectorAll('.want-tile').forEach((tile) => {
    const on = !!state.wantSel?.has(playingNameKey(tile.dataset.wn));
    tile.classList.toggle('csel', on);
    tile.setAttribute('aria-label', tile.dataset.wn + (on ? ', selected' : ''));
    const mark = tile.querySelector('.csel-mark');
    if (on && !mark) tile.insertAdjacentHTML('beforeend', '<span class="csel-mark">✓</span>');
    if (!on) mark?.remove();
  });
  const bar = root.querySelector('#wantSelectionBar');
  if (!bar) return;
  bar.hidden = !selected;
  const count = rows.reduce((sum, row) => sum + row.qty, 0);
  root.querySelector('#wantSelectionCount').textContent = wantsBulkBusy
    ? 'Adding…'
    : `${count} selected`;
  root.querySelectorAll('#wantSelectionBar button, #wantSelectAll').forEach((button) => {
    button.disabled = wantsBulkBusy;
  });
}

function clearWantsSelection() {
  state.wantSel = null;
  paintWantsSelection();
}

function dismissWantedCards(names) {
  reconcilePlayingOwnership();
  const keys = new Set(names.map(playingNameKey));
  const changed = new Set();
  state.collection.wantsManual = state.collection.wantsManual.filter(
    (card) => !keys.has(playingNameKey(card.name)),
  );
  state.collection.wantsExclude = Array.from(new Set(state.collection.wantsExclude.concat(names)));
  for (const [key, entry] of playingDeckDemand()) {
    if (!keys.has(key)) continue;
    for (const { card, deck } of entry.proxies) {
      if (card._wantsDismissed) continue;
      card._wantsDismissed = true;
      changed.add(deck);
    }
  }
  for (const deck of changed) scheduleSave(deck);
  saveCollection();
}

// A selected Wants row acquires its displayed quantity, preserving deck copies.
function addWantedCardsToBinder(rows, cards, binder) {
  if (binder && !state.collection.binders.some((item) => item.id === binder))
    throw new Error('The destination binder is no longer available.');
  const wanted = new Map(computeWants().map((row) => [playingNameKey(row.name), row]));
  const completed = new Set(),
    failed = [];
  let added = 0;
  rows.forEach((row, index) => {
    const key = playingNameKey(row.name);
    const qty = Math.min(row.qty, wanted.get(key)?.qty || 0);
    if (!qty) {
      completed.add(key);
      return;
    }
    const card = cards[index];
    if (!card || playingNameKey(card.name) !== key || isCollectionBasicLand(card)) {
      failed.push(row.name);
      return;
    }
    const slim = colFoilSlim(slimForCollection(card), card, !!card._foilPick);
    const same = state.collection.items.find(
      (item) =>
        item.name === slim.name &&
        item.set === slim.set &&
        item.cn === slim.cn &&
        item.cond === 'NM' &&
        !!item.foil === !!slim.foil &&
        (item.binder || null) === binder,
    );
    if (same) same.qty += qty;
    else state.collection.items.unshift({ ...slim, qty, cond: 'NM', binder, addedAt: Date.now() });
    state.collection.wantsManual = state.collection.wantsManual.filter(
      (item) => playingNameKey(item.name) !== key,
    );
    fulfillPlayingProxy(row.name, qty);
    completed.add(key);
    added += qty;
  });
  if (added) saveCollection();
  return { added, completed, failed };
}

async function addSelectedWantsToBinder() {
  if (wantsBulkBusy) return;
  const rows = selectedWantedRows();
  if (!rows.length) return;
  wantsBulkBusy = true;
  paintWantsSelection();
  try {
    const count = rows.reduce((sum, row) => sum + row.qty, 0);
    const destination = await openBinderConflict(
      { name: `${count} cards · ${rows.length} card ${rows.length === 1 ? 'name' : 'names'}` },
      state.collection.binders,
      { noneFit: true, cancelable: true },
    );
    if (destination.cancelled) return;
    const cards = await runLimited(rows, (row) => wantCardFor(row.name).catch(() => null), 2);
    const result = addWantedCardsToBinder(rows, cards, destination.id);
    for (const key of result.completed) state.wantSel?.delete(key);
    if (result.added) toast(`${result.added} cards added to ${brBinderName(destination.id)}.`);
    if (result.failed.length)
      toast(`${result.failed.length} cards could not be found. They remain selected.`);
    if (state.screen === 'collection') render();
  } catch (error) {
    console.error(error);
    toast('Could not add the selected cards. Please try again.');
  } finally {
    wantsBulkBusy = false;
    paintWantsSelection();
  }
}

async function openWantedCard(name) {
  const pool = Array.from(document.querySelectorAll('.want-tile')).map((tile) => tile.dataset.wn);
  const card = await wantCardFor(name);
  if (state.screen !== 'collection' || state.colFilter.binder !== '__wants__') return;
  if (card) openCardInfo(card, { wantName: name, wantPool: pool, wantIdx: pool.indexOf(name) });
  else openWantSheet(name);
}

function wireWantsSelection() {
  const root = document.querySelector('.wants-page');
  if (!root) return;
  const toggle = (name) => {
    if (wantsBulkBusy || !root.isConnected) return;
    const key = playingNameKey(name);
    if (!state.wantSel) state.wantSel = new Set();
    if (state.wantSel.has(key)) state.wantSel.delete(key);
    else state.wantSel.add(key);
    if (!state.wantSel.size) state.wantSel = null;
    paintWantsSelection();
  };
  const selectAll = () => {
    state.wantSel = new Set(
      Array.from(root.querySelectorAll('.want-tile')).map((tile) =>
        playingNameKey(tile.dataset.wn),
      ),
    );
    paintWantsSelection();
  };
  root.querySelector('#wantSelectAll')?.addEventListener('click', selectAll);
  root.querySelector('#wantSelectionAll')?.addEventListener('click', selectAll);
  root.querySelector('#wantSelectionClear')?.addEventListener('click', clearWantsSelection);
  root.querySelector('#wantSelectionAdd')?.addEventListener('click', addSelectedWantsToBinder);
  root.querySelector('#wantSelectionRemove')?.addEventListener('click', () => {
    const rows = selectedWantedRows();
    const count = rows.reduce((sum, row) => sum + row.qty, 0);
    openInAppConfirm(
      `Remove ${count} selected cards from Wants? Your deck contents and owned cards will stay unchanged.`,
      (ok) => {
        if (!ok) return;
        dismissWantedCards(rows.map((row) => row.name));
        state.wantSel = null;
        render();
      },
      { danger: true, ok: 'Remove' },
    );
  });
  root.querySelectorAll('.want-tile').forEach((tile) => {
    let timer,
      held = false,
      start;
    const disarm = () => clearTimeout(timer);
    tile.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button') || (event.pointerType === 'mouse' && event.button !== 0))
        return;
      held = false;
      start = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => {
        held = true;
        toggle(tile.dataset.wn);
      }, 480);
    });
    tile.addEventListener('pointermove', (event) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) disarm();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) =>
      tile.addEventListener(name, disarm),
    );
    tile.addEventListener('contextmenu', (event) => event.preventDefault());
    tile.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      if (held) {
        held = false;
        event.preventDefault();
        return;
      }
      if (state.wantSel?.size) toggle(tile.dataset.wn);
      else openWantedCard(tile.dataset.wn);
    });
    tile.addEventListener('keydown', (event) => {
      if (event.target !== tile || ![' ', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === ' ' || state.wantSel?.size) toggle(tile.dataset.wn);
      else openWantedCard(tile.dataset.wn);
    });
  });
  paintWantsSelection();
}
