// Deck overview, display controls, and the full-screen deck actions menu.

function openDeckAddMenu(d, event) {
  event.stopPropagation();
  openFabMenu(
    [
      [
        'deckAddSearch',
        `<span class="ib">${ICONS.search}</span>Search cards`,
        () => openAddCardsFor(d),
      ],
      [
        'deckAddImport',
        `<span class="ib">${ICONS.imp}</span>Import cards`,
        () => toggleDlPanel(d, 'import-cards'),
      ],
      [
        'deckAddScan',
        `<span class="ib">${SCANNER_ICON}</span>Scan cards`,
        () => openCardScanner({ mode: 'deck', deckId: d.id }),
      ],
    ],
    document.getElementById('dockAddCards') || event.currentTarget,
  );
}

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
  const constructed = deckIsConstructed(d);
  const bracket = deckFormat(d) === 'commander' ? bracketEstimate(d, null) : null;
  return /* HTML */ `<section
    class="deck-overview ${constructed ? 'deck-overview-constructed' : ''}"
    aria-label="Deck overview"
  >
    ${constructed ? '' : `<div class="deck-overview-leaders">${leaderZoneHtml(d)}<div class="dl-leader-cat">${leaderNoun(deckFormat(d), deckLeaders(d).length > 1)}</div></div>`}
    <div class="deck-overview-info">
      <span class="deck-format">${ICONS.shield}${escapeHtml(fmtLabelOf(deckFormat(d)))}</span>
      ${bracket ? `<span class="dl-bracket" id="dlBracket" title="Estimate from Game Changers and 2-card combos">⚔ Bracket ~${bracket.b} · ${bracket.gc} GC</span>` : ''}
      <button
        type="button"
        class="deck-review"
        id="deckReview"
        aria-expanded="${!!state.legalityOpen}"
        aria-controls="legalityWrap"
      >
        <span id="deckLegalityStatus" class="deck-status ${issues.length ? 'needs-review' : ''}"
          >${issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'} · Review` : 'Legal deck · Review'}</span
        >${ICONS.chevRight}
      </button>
      <p class="deck-issue-preview" id="deckIssueText">
        ${escapeHtml(issues[0]?.text || issues[0]?.label || 'No deck-building issues found.')}
      </p>
      <div class="dl-desc-text">
        ${d.description ? escapeHtml(d.description).replace(/\n/g, '<br>') : `<button type="button" class="deck-note-action" id="descAddBtn">${ICONS.edit}<span>Add deck description</span></button>`}
      </div>
    </div>
    <div id="legalityWrap">${legalityHtml(d)}</div>
  </section>`;
}

function deckViewPickerHtml() {
  const modes = [
    ['grid', 'Tiles'],
    ['stack', 'Stacks'],
    ['text', 'List'],
  ];
  const current = modes.find(([key]) => key === dlView());
  return /* HTML */ `<details class="deck-view-picker">
    <summary aria-haspopup="menu" aria-label="Card display: ${current[1]}">
      ${viewIco(current[0])}<span>${current[1]}</span
      ><span class="deck-view-caret" aria-hidden="true">▾</span>
    </summary>
    <div class="deck-view-menu" role="menu" aria-label="Card display">
      ${modes.map(([key, label]) => `<button type="button" role="menuitemradio" data-dlview="${key}" aria-checked="${dlView() === key}">${viewIco(key)}<span>${label}</span>${dlView() === key ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}
    </div>
  </details>`;
}

function deckListToolsHtml(d) {
  const hint = deckIsConstructed(d)
    ? `${ensureMaybeboard(d).length} in sideboard`
    : 'Including commander';
  return /* HTML */ `<div class="deck-list-tools">
    <h2>Cards</h2>
    <div class="deck-toolbar-metrics">
      <button
        type="button"
        class="deck-toolbar-metric"
        id="capDeckCount"
        aria-label="Deck card count"
        aria-expanded="${!!state.legalityOpen}"
        aria-controls="legalityWrap"
        title="${hint}"
      >
        <strong id="deckCardCountValue">${deckSummaryCount(d)}</strong
        ><span class="sr-only" id="deckCountHint">${hint}</span>
      </button>
      <button
        type="button"
        class="deck-toolbar-metric"
        id="capNoteBtn"
        aria-label="Deck value and price history"
        title="Deck value and price history"
      >
        <strong id="deckPriceValue">${deckSummaryPriceHtml(d)}</strong>
      </button>
    </div>
    ${deckViewPickerHtml()}
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

function deckEditorPanelHtml(title, content, { className = '', footer = '' } = {}) {
  return /* HTML */ `<section
    class="deck-editor-screen ${className}"
    role="dialog"
    aria-modal="true"
    aria-label="${title}"
  >
    ${overlayCapHtml(title, `<button type="button" class="header-filter dl-panel-x" aria-label="Back to deck">${ICONS.back}</button>`)}
    <div class="deck-editor-body">${content}</div>
    ${footer ? `<footer class="deck-editor-footer">${footer}</footer>` : ''}
  </section>`;
}

let deckEditorInertElements = [];

function syncDeckEditorModal() {
  for (const element of deckEditorInertElements) element.inert = false;
  deckEditorInertElements = [];
  const panel = document.querySelector('#dlPanelBox.dl-cover');
  if (!panel) return;
  // Keep the panel's ancestor chain active while disabling the editor and
  // navigation behind it. Preserve elements that were already inert.
  for (
    let branch = panel;
    branch && !branch.classList.contains('app');
    branch = branch.parentElement
  ) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && !sibling.inert) {
        sibling.inert = true;
        deckEditorInertElements.push(sibling);
      }
    }
  }
}

function wireDeckListTools(d) {
  document.getElementById('deckSortBtn')?.addEventListener('click', () => openModal('sort'));
  for (const id of ['deckReview', 'capDeckCount'])
    document.getElementById(id)?.addEventListener('click', () => {
      state.legalityOpen = !state.legalityOpen;
      refreshLegality(d);
    });
  wireDeckViewPicker(d);
}

function wireDeckViewPicker(d) {
  const picker = document.querySelector('.deck-view-picker');
  if (!picker) return;
  const summary = picker.querySelector('summary');
  const options = [...picker.querySelectorAll('[data-dlview]')];
  picker.addEventListener('toggle', () => {
    if (!picker.open) return;
    const menu = picker.querySelector('.deck-view-menu');
    const bounds = summary.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(bounds.right - 156, innerWidth - 164)) + 'px';
    menu.style.top =
      (bounds.bottom + 148 < innerHeight - 60 ? bounds.bottom + 4 : Math.max(8, bounds.top - 148)) +
      'px';
  });
  options.forEach((button) =>
    button.addEventListener('click', () => {
      setDlView(button.dataset.dlview);
      picker.open = false;
      refreshDecklistBox(d);
      picker.outerHTML = deckViewPickerHtml();
      wireDeckViewPicker(d);
      document.querySelector('.deck-view-picker summary')?.focus({ preventScroll: true });
    }),
  );
  picker.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      picker.open = false;
      summary.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      picker.open = true;
      const index = options.indexOf(document.activeElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : index < 0
              ? 0
              : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
      options[next]?.focus({ preventScroll: true });
    }
  });
  picker.addEventListener('focusout', () =>
    requestAnimationFrame(() => {
      if (!picker.contains(document.activeElement)) picker.open = false;
    }),
  );
}

document.addEventListener('click', (event) => {
  const picker = document.querySelector('.deck-view-picker[open]');
  if (picker && !picker.contains(event.target)) picker.open = false;
});
document.addEventListener(
  'scroll',
  () => {
    const picker = document.querySelector('.deck-view-picker[open]');
    if (picker) picker.open = false;
  },
  true,
);

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
          <div class="deck-menu-heading">
            <h1>${escapeHtml(d.name || 'Untitled deck')}</h1>
            <button
              type="button"
              class="deck-menu-rename"
              id="renameDeckBtn"
              aria-label="Rename deck"
              title="Rename deck"
            >
              ${ICONS.edit}
            </button>
          </div>
        </div>
        ${group('Build & explore', [
          ['dockInspire', ICONS.spark, 'Inspiration', 'Find cards that work with this deck'],
          ['deckBulkEdit', ICONS.bulk, 'Bulk edit', 'Edit the complete card list'],
        ])}
        ${group('Manage deck', [
          ['mFormat', ICONS.shield, 'Change format', fmtLabelOf(deckFormat(d))],
          ['mAddFolder', ICONS.decks, 'Move to folder', 'Organize your decks'],
        ])}
        ${group('Share & copies', [
          ['mImport', ICONS.imp, 'Import deck', 'Replace this deck from text or a file'],
          ['mExport', ICONS.exp, 'Export deck', 'Copy, download, or print your deck list'],
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
  action('renameDeckBtn', () =>
    openDeckNamePrompt('Rename this deck', d.name, (name) => {
      if (name === null) return;
      d.name = normalizeDeckName(name);
      scheduleSave(d);
      render();
    }),
  );
  action('mImport', () => toggleDlPanel(d, 'import'));
  action('mExport', () => toggleDlPanel(d, 'export'));
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
      else document.querySelector('.deck-overview')?.scrollIntoView({ block: 'start' });
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
