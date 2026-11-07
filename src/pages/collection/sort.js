// Collection and Search share their sort control and popup presentation.
function collectionSortBinder() {
  return state.collection.binders.find((binder) => binder.id === state.colFilter.binder);
}

function collectionSortChoice() {
  const binder = collectionSortBinder();
  const choice = binder ? binderView(binder) : state.colSort || { sort: 'name', sortDir: 'asc' };
  return {
    sort: choice.sort,
    sortDir: choice.sortDir || (choice.sort === 'price' ? 'desc' : 'asc'),
  };
}

function openCollectionSortMenu(anchor) {
  const choice = collectionSortChoice();
  openCardSortMenu(
    anchor,
    [
      ['name', 'asc', 'Name A → Z'],
      ['name', 'desc', 'Name Z → A'],
      ['mv', 'asc', 'Mana value: low → high'],
      ['mv', 'desc', 'Mana value: high → low'],
      ['price', 'asc', 'Price: low → high'],
      ['price', 'desc', 'Price: high → low'],
    ],
    choice.sort,
    choice.sortDir,
    (sort, sortDir) => {
      const binder = collectionSortBinder();
      if (binder) {
        binder.view = { ...binderView(binder), sort, sortDir };
        saveCollection();
      } else state.colSort = { sort, sortDir };
      csRerender();
      document.getElementById('colSortBtn')?.focus({ preventScroll: true });
    },
  );
}
