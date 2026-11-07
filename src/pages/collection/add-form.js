// pages / collection / add-form
// Shared by the collection sheet and the scanner's integrated review page.
function collectionAddFieldsHtml(card) {
  return /* HTML */ `<div class="collection-add-fields">
    <div class="adv-row">
      <label id="acPrintingLabel">Printing</label>
      <div id="acPdBox">${printsDropdownHtml('acPd', [card], 0, !!card.prints_search_uri)}</div>
    </div>
    <div class="adv-row">
      <label for="acCond">Condition</label>
      <select id="acCond" class="col-select">
        ${COL_CONDS.map(([key, label]) => `<option value="${key}"${key === 'NM' ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>
    <div class="adv-row">
      <span class="collection-field-label">Finish</span>
      <label class="ac-foil" for="acFoil"><input type="checkbox" id="acFoil" /> Foil</label>
    </div>
    <div class="adv-row">
      <label for="acQty">Amount</label>
      <div class="action-row collection-add-quantity" style="margin:0;">
        <button
          type="button"
          class="ghost-btn"
          id="acQminus"
          aria-label="Decrease amount"
          style="flex:none;width:44px;"
        >
          −
        </button>
        <input
          id="acQty"
          type="number"
          inputmode="numeric"
          min="1"
          step="1"
          value="1"
          class="col-filter-input"
          style="max-width:70px;text-align:center;"
        />
        <button
          type="button"
          class="ghost-btn"
          id="acQplus"
          aria-label="Increase amount"
          style="flex:none;width:44px;"
        >
          ＋
        </button>
      </div>
    </div>
    <div class="adv-row">
      <label for="acBinder">Binder</label>
      <select id="acBinder" class="col-select">
        ${ruledBinders().length ? `<option value="__auto__"${state.colFilter && state.collection.binders.some((b) => b.id === state.colFilter.binder) ? '' : ' selected'}>✦ Automatic (binder rules)</option>` : ''}
        <option value="">— No binder —</option>
        ${state.collection.binders.map((b) => `<option value="${escapeHtml(b.id)}"${state.colFilter && state.colFilter.binder === b.id ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
        <option value="__wants__">🔖 Wants list</option>
        <option value="__new__">＋ New binder…</option>
      </select>
    </div>
  </div>`;
}

async function wireCollectionAddForm(root, card, { onAdded, onPrintingChange } = {}) {
  const find = (id) => root.querySelector('#' + id);
  let prints = [card],
    selected = 0,
    loading = !!card.prints_search_uri,
    busy = false;
  const paintPrinting = () => {
    if (!root.isConnected) return;
    const box = find('acPdBox');
    box.innerHTML = printsDropdownHtml('acPd', prints, selected, loading);
    box.querySelector('.pd-btn').setAttribute('aria-labelledby', 'acPrintingLabel');
    wirePrintsDropdown(box, 'acPd', (index) => {
      selected = index;
      paintPrinting();
      onPrintingChange?.(prints[selected] || card);
    });
  };
  paintPrinting();
  const quantity = () => Math.max(1, Math.floor(Number(find('acQty').value) || 1));
  find('acQplus').addEventListener('click', () => {
    find('acQty').value = quantity() + 1;
  });
  find('acQminus').addEventListener('click', () => {
    find('acQty').value = Math.max(1, quantity() - 1);
  });
  const submit = find('acAdd');
  submit.addEventListener('click', () => {
    if (busy || !root.isConnected) return;
    const printing = prints[selected] || card;
    const chosen = find('acBinder').value || null;
    if (chosen === '__new__') {
      openInAppPrompt('New binder name', 'Binder name', '', (name) => {
        if (!name?.trim() || !root.isConnected) return;
        const binder = { id: 'bnd_' + Date.now().toString(36), name: name.trim() };
        state.collection.binders.push(binder);
        finishAdd(printing, binder.id);
      });
      return;
    }
    finishAdd(printing, chosen);
  });
  async function finishAdd(printing, binder) {
    if (busy || !root.isConnected) return;
    busy = true;
    submit.disabled = true;
    try {
      const cond = find('acCond').value;
      const qty = quantity();
      const slim = colFoilSlim(slimForCollection(printing), printing, find('acFoil').checked);
      if (binder === '__auto__')
        binder = await routeBinder(
          { ...slim, cond, qty },
          {},
          { zIndex: (parseInt(getComputedStyle(root).zIndex, 10) || 0) + 1 },
        );
      if (!root.isConnected) return;
      if (binder === '__wants__') {
        state.collection.wantsExclude = state.collection.wantsExclude.filter(
          (n) => n !== slim.name,
        );
        if (!state.collection.wantsManual.some((w) => w.name === slim.name))
          state.collection.wantsManual.push(slim);
      } else {
        const same = state.collection.items.find(
          (item) =>
            item.name === slim.name &&
            item.set === slim.set &&
            item.cn === slim.cn &&
            item.cond === cond &&
            !!item.foil === !!slim.foil &&
            (item.binder || null) === (binder || null),
        );
        if (same) same.qty += qty;
        else state.collection.items.unshift({ ...slim, cond, qty, binder, addedAt: Date.now() });
        state.collection.wantsManual = state.collection.wantsManual.filter(
          (w) => w.name !== slim.name,
        );
      }
      saveCollection();
      toast(
        binder === '__wants__'
          ? slim.name + ' added to your Wants list.'
          : binder
            ? `${slim.name} ×${qty} → ${brBinderName(binder)}`
            : `${slim.name} ×${qty} added to your collection.`,
      );
      onAdded?.({ printing, cond, qty, binder });
    } finally {
      busy = false;
      if (root.isConnected) submit.disabled = false;
    }
  }
  // The detected printing is usable immediately while alternatives load.
  if (card.prints_search_uri) {
    try {
      const response = await sfFetch(card.prints_search_uri);
      if (response.ok) {
        const data = await response.json();
        if (data.data?.length) {
          prints = data.data.slice(0, 30);
          const match = prints.findIndex(
            (p) =>
              p.id === card.id ||
              (p.set === card.set && p.collector_number === card.collector_number),
          );
          if (match < 0) prints.unshift(card);
          selected = Math.max(0, match);
        }
      }
    } catch (error) {
      // Keep the known printing usable when alternate printings are unavailable.
    }
    loading = false;
    paintPrinting();
  }
}
