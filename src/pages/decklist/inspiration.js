// Reuse deck-specific recommendations inside the selected deck's tab viewport.
function isEmbeddedDeckInspiration() {
  return state.screen === 'decklist' && state.builderTab === 'inspiration';
}

function isDeckInspirationActive(deckId = state.inspireDeckId) {
  return (
    state.inspireDeckId === deckId &&
    (state.screen === 'inspiration' ||
      (isEmbeddedDeckInspiration() && state.activeDeckId === deckId))
  );
}

function deckInspirationTabHtml(d) {
  state.inspireDeckId = d.id;
  const template = document.createElement('template');
  template.innerHTML = inspirationPageHtml();
  const page = template.content.querySelector('main');
  return `<section class="deck-inspiration" aria-label="Deck inspiration">${page?.innerHTML || ''}</section>`;
}

function repaintDeckInspiration() {
  if (isEmbeddedDeckInspiration()) {
    const deck = getDeck(state.activeDeckId);
    if (deck) renderBuilderBody(deck);
  } else if (state.screen === 'inspiration') render();
}

// Collapse choices belong to this deck and recommendation view, and survive
// asynchronous card loading, More, and switching away from the tab.
const deckInspirationCollapsed = new Map();

function deckInspirationCategoryKey(d, title) {
  const selection = state.inspireSel || {};
  return encodeURIComponent(
    JSON.stringify([d.id, selection.kindred || '', selection.theme || '', title]),
  );
}

function deckInspirationCategoryHtml(d, group, index, content) {
  const key = deckInspirationCategoryKey(d, group.title);
  return `<details class="edh-sec deck-inspiration-category" data-isec="${index}" data-category-key="${escapeHtml(key)}" ${deckInspirationCollapsed.get(key) ? '' : 'open'}>
    <summary class="section-label"><span>${escapeHtml(group.title)}</span><span class="inspiration-category-count">${group.cards.length}</span><span class="inspiration-category-chevron" aria-hidden="true">${ICONS.chevRight}</span></summary>
    <div class="inspiration-category-body">${content}</div>
  </details>`;
}

function wireDeckInspirationCategories(box) {
  box.querySelectorAll('.deck-inspiration-category').forEach((category) => {
    category.querySelector('summary').addEventListener('click', (event) => {
      // Persist synchronously: an async recommendation repaint can otherwise
      // replace the element before the browser dispatches its queued toggle.
      event.preventDefault();
      category.open = !category.open;
      deckInspirationCollapsed.set(category.dataset.categoryKey, !category.open);
    });
    category.addEventListener('toggle', () => {
      if (category.isConnected)
        deckInspirationCollapsed.set(category.dataset.categoryKey, !category.open);
    });
  });
}

function jumpToDeckInspirationCategory(box, index) {
  const category = box.querySelector(`.edh-sec[data-isec="${index}"]`);
  if (!category) return;
  if (category.matches('details')) {
    category.open = true;
    deckInspirationCollapsed.set(category.dataset.categoryKey, false);
  }
  category.scrollIntoView({
    behavior: 'smooth',
    block: isEmbeddedDeckInspiration() ? 'start' : 'end',
  });
}
