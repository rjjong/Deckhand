// The deck library shares the card search sort control and menu presentation.
function deckSortChoice() {
  try {
    const choice = JSON.parse(localStorage.getItem(LS_PREFIX + 'deckSort') || 'null');
    if (choice && ['updated', 'name', 'price'].includes(choice.sort))
      return { sort: choice.sort, sortDir: choice.sortDir === 'asc' ? 'asc' : 'desc' };
  } catch {}
  return { sort: 'updated', sortDir: 'desc' };
}

function sortLibraryDecks(decks, choice = deckSortChoice()) {
  const direction = choice.sortDir === 'asc' ? 1 : -1;
  const values = new Map(
    decks.map((deck) => {
      const price = choice.sort === 'price' ? deckPriceFromCache(deck) : null;
      const value =
        choice.sort === 'price'
          ? price.complete || price.total > 0
            ? price.total
            : null
          : choice.sort === 'updated'
            ? deck.updatedAt || deck.createdAt || 0
            : deck.name || '';
      return [deck.id, value];
    }),
  );
  return decks.slice().sort((a, b) => {
    const av = values.get(a.id),
      bv = values.get(b.id);
    if (av == null || bv == null) {
      if (av != null) return -1;
      if (bv != null) return 1;
    }
    const compareName = (a.name || '').localeCompare(b.name || '', undefined, {
      sensitivity: 'base',
      numeric: true,
    });
    const order = choice.sort === 'name' ? compareName : av != null && bv != null ? av - bv : 0;
    return order * direction || compareName || a.id.localeCompare(b.id);
  });
}

function openDeckSortMenu(anchor) {
  const choice = deckSortChoice();
  openCardSortMenu(
    anchor,
    [
      ['updated', 'desc', 'Last changed: newest first'],
      ['updated', 'asc', 'Last changed: oldest first'],
      ['name', 'asc', 'Name A → Z'],
      ['name', 'desc', 'Name Z → A'],
      ['price', 'asc', 'Price: low → high'],
      ['price', 'desc', 'Price: high → low'],
    ],
    choice.sort,
    choice.sortDir,
    (sort, sortDir) => {
      try {
        localStorage.setItem(LS_PREFIX + 'deckSort', JSON.stringify({ sort, sortDir }));
      } catch {
        warnStorageOnce();
      }
      render();
      document.getElementById('deckSortBtn')?.focus({ preventScroll: true });
    },
  );
}

let deckPriceSortFrame = 0;
function queueDeckPriceSort() {
  if (deckPriceSortFrame || deckSortChoice().sort !== 'price') return;
  deckPriceSortFrame = requestAnimationFrame(() => {
    deckPriceSortFrame = 0;
    if (state.screen !== 'decks') return;
    document.querySelectorAll('.deck-format-grid').forEach((grid) => {
      const tiles = new Map([...grid.children].map((tile) => [tile.dataset.id, tile]));
      const decks = [...tiles.keys()].map(getDeck).filter(Boolean);
      const sorted = sortLibraryDecks(decks);
      if (sorted.every((deck, index) => grid.children[index]?.dataset.id === deck.id)) return;
      const focus = grid.contains(document.activeElement) ? document.activeElement : null;
      sorted.forEach((deck) => grid.appendChild(tiles.get(deck.id)));
      focus?.focus({ preventScroll: true });
    });
  });
}
