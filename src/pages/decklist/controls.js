// Deck overview, display controls, and the full-screen deck actions menu.

function deckSummaryPriceHtml(d) {
  const price = deckPriceFromCache(d);
  if (!price.total && !price.complete && (d.cards.length || deckLeaders(d).length))
    return 'Not priced yet';
  return fmtEur(price.total) + priceRingHtml(price.complete, state._pricingDeck === d.id);
}

function deckSummaryCount(d) {
  const count = d.cards.length + deckLeaders(d).length;
  return `${count} / ${deckTotal(d)}`;
}

function deckSummaryHtml(d) {
  const issues = checkDeckLegality(d);
  const side = deckIsConstructed(d)
    ? `${ensureMaybeboard(d).length} in sideboard`
    : 'Including commander';
  return /* HTML */ `<section class="deck-overview" aria-label="Deck overview">
    <div class="deck-overview-heading">
      <span class="deck-format">${ICONS.shield}${escapeHtml(fmtLabelOf(deckFormat(d)))}</span>
      <span>Deck overview</span>
    </div>
    <div class="deck-metrics">
      <button
        type="button"
        class="deck-metric"
        id="capDeckCount"
        aria-expanded="${!!state.legalityOpen}"
        aria-controls="legalityWrap"
      >
        <span class="deck-metric-label">Cards</span>
        <strong id="deckCardCountValue">${deckSummaryCount(d)}</strong>
        <span class="deck-metric-hint" id="deckCountHint">${side}</span>
        <span id="deckLegalityStatus" class="deck-status ${issues.length ? 'needs-review' : ''}"
          >${issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'} · Review` : 'Legal deck · Review'}</span
        >
      </button>
      <button type="button" class="deck-metric" id="capNoteBtn">
        <span class="deck-metric-label">Deck value</span>
        <strong id="deckPriceValue">${deckSummaryPriceHtml(d)}</strong>
        <span class="deck-metric-hint">Trend &amp; card prices</span>
        <span class="deck-trend-link">View prices ${ICONS.chevRight}</span>
      </button>
    </div>
  </section>`;
}

function deckListToolsHtml() {
  return /* HTML */ `<div class="deck-list-tools">
    <h2>Cards</h2>
    <div class="deck-view-switch" role="group" aria-label="Card display">
      ${[
        ['grid', 'Tiles'],
        ['stack', 'Stacks'],
        ['text', 'List'],
      ]
        .map(
          ([key, label]) =>
            `<button type="button" data-dlview="${key}" aria-pressed="${dlView() === key}">${viewIco(key === 'text' ? 'text' : key)}<span>${label}</span></button>`,
        )
        .join('')}
    </div>
    <button
      type="button"
      class="deck-sort"
      id="deckSortBtn"
      aria-label="Sort deck cards"
      title="Sort cards"
    >
      ${SORT_ICON}
    </button>
  </div>`;
}

function deckEditorPanelHtml(title, content) {
  return /* HTML */ `<section
    class="deck-editor-screen"
    role="dialog"
    aria-modal="true"
    aria-label="${title}"
  >
    ${overlayCapHtml(title, `<button type="button" class="header-filter dl-panel-x" aria-label="Back to deck">${ICONS.back}</button>`)}
    <div class="deck-editor-body">${content}</div>
  </section>`;
}

function wireDeckListTools(d) {
  document.getElementById('deckSortBtn')?.addEventListener('click', () => openModal('sort'));
  document.querySelectorAll('.deck-view-switch [data-dlview]').forEach((button) =>
    button.addEventListener('click', () => {
      setDlView(button.dataset.dlview);
      refreshDecklistBox(d);
      document
        .querySelectorAll('.deck-view-switch [data-dlview]')
        .forEach((item) =>
          item.setAttribute('aria-pressed', String(item.dataset.dlview === dlView())),
        );
    }),
  );
}

function showDeckList(d) {
  if (state.builderTab === 'list') return;
  state.builderTab = 'list';
  state.dlPanel = null;
  renderBuilderBody(d);
  syncTabsUI();
}

function goToDeckCategory(d, key) {
  showDeckList(d);
  if (state.collapsed[key]) {
    state.collapsed[key] = false;
    refreshDecklistBox(d);
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document
        .querySelector(`.cat-head[data-cat="${CSS.escape(key)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );
}

function openDeckSectionMenu(d) {
  showDeckList(d);
  const items = [...document.querySelectorAll('.cat-group > .cat-head')].map((head) => ({
    label: head.querySelector('.t')?.textContent.trim() || 'Cards',
    fn: () => goToDeckCategory(d, head.dataset.cat),
  }));
  if (items.length) openTileMenu(document.getElementById('menuBtn'), items);
  else toast('Add cards to see deck sections.');
}

function openDeckActions(d) {
  if (state.menuOpen) return;
  const root = document.createElement('div');
  root.id = 'menuPop';
  root.className = 'overlay deck-actions-page';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Deck actions');
  const group = (title, items) =>
    `<section class="deck-menu-group"><h2>${title}</h2>${items.map(([id, icon, label, detail]) => menuCardHtml(id, icon, label, detail)).join('')}</section>`;
  root.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml('Deck actions', `<button type="button" class="header-filter" id="deckActionsClose" aria-label="Back to deck">${ICONS.back}</button>`)}
    <div class="deck-actions-body tab-viewport">
      <main class="hub-page">
        <div class="deck-menu-intro">
          <span>${escapeHtml(fmtLabelOf(deckFormat(d)))}</span>
          <h1>${escapeHtml(d.name || 'Untitled deck')}</h1>
        </div>
        ${group('Build & explore', [
          ['dockInspire', ICONS.spark, 'Inspiration', 'Find cards that work with this deck'],
          ['deckBulkEdit', ICONS.bulk, 'Bulk edit', 'Edit the complete card list'],
          [
            'dlCatJump',
            ICONS.burger,
            'Jump to section',
            'Go to a card type or your ' + sideName(d).toLowerCase(),
          ],
        ])}
        ${group('Manage deck', [
          ['renameDeckBtn', ICONS.edit, 'Rename deck', 'Change the deck name'],
          ['mFormat', ICONS.shield, 'Change format', fmtLabelOf(deckFormat(d))],
          ['mAddFolder', ICONS.decks, 'Move to folder', 'Organize your decks'],
        ])}
        ${group('Share & copies', [
          ['mImpExp', ICONS.imp, 'Import / Export', 'Card lists, files, and proxies'],
          ['mShare', ICONS.share, 'Share deck', 'Create a link to this deck'],
          ['mVersions', ICONS.history || ICONS.save, 'Versions', 'Browse saved deck versions'],
          ['mDuplicate', ICONS.copy, 'Duplicate deck', 'Make a separate copy'],
        ])}
        ${d.cards.length || deckLeaders(d).length ? `<section class="deck-menu-group"><h2>Card types</h2><div class="deck-type-links">${dockTypeCounts(d)}</div></section>` : ''}
        <section class="deck-menu-group deck-danger-group">
          ${menuCardHtml('mDelete', ICONS.trash, 'Delete deck', 'Permanently remove this deck')}
        </section>
      </main>
    </div>
    ${overlayNavHtml()}
  </div>`;
  document.body.appendChild(root);
  state.menuOpen = true;
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'true');
  pushOverlay('deckMenu', () => {
    state.menuOpen = false;
    root.remove();
    document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'false');
    document.getElementById('menuBtn')?.focus({ preventScroll: true });
  });
  wireOverlayNav(root);
  root.querySelector('#deckActionsClose').addEventListener('click', closeTopOverlay);
  wireAppDialogKeys(root, closeTopOverlay);
  root.querySelector('#deckActionsClose').focus({ preventScroll: true });
  wireMenu(d);
}

function wireMenu(d) {
  const action = (id, run) =>
    document.getElementById(id)?.addEventListener('click', () => {
      popDeckMenu();
      run();
    });
  action('dockInspire', () => {
    state.inspireDeckId = d.id;
    switchPage('inspiration');
  });
  action('deckBulkEdit', () => toggleDlPanel(d, 'bulk'));
  action('dlCatJump', () => openDeckSectionMenu(d));
  action('renameDeckBtn', () =>
    openInAppPrompt('Rename this deck', 'Deck name', d.name, (name) => {
      if (name === null) return;
      d.name = name.trim() || 'Untitled deck';
      scheduleSave(d);
      render();
    }),
  );
  action('mImpExp', () => toggleDlPanel(d, 'impexp'));
  action('mAddFolder', () => openFolderPicker(d));
  action('mFormat', () => openFormatPicker(d));
  action('mDuplicate', () => duplicateDeck(d));
  action('mVersions', () => openDeckVersions(d.id));
  action('mShare', () => shareDeck(d));
  action('mDelete', () => openModal('delete'));
  document.querySelectorAll('#menuPop [data-deck-type]').forEach((button) =>
    button.addEventListener('click', () => {
      popDeckMenu();
      showDeckList(d);
      const name = button.dataset.deckType.toLowerCase();
      const head = [...document.querySelectorAll('.cat-group > .cat-head')].find((el) =>
        el.querySelector('.t')?.textContent.trim().toLowerCase().startsWith(name),
      );
      if (head) goToDeckCategory(d, head.dataset.cat);
      else document.querySelector('.dl-bridge')?.scrollIntoView({ block: 'start' });
    }),
  );
}

function popDeckMenu() {
  const stack = state.overlayStack;
  if (stack.at(-1)?.id === 'deckMenu') stack.pop();
  state.menuOpen = false;
  document.getElementById('menuPop')?.remove();
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'false');
}
