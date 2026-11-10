// Shared artwork and cover selection for decks, folders and collection binders.
function libraryCardKey(card) {
  return (
    card?.id ||
    [card?.name || '', card?.set || '', card?.collector_number || card?.cn || ''].join('|')
  );
}

function libraryCardArt(card) {
  if (!card) return '';
  const image = card.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.art_crop;
  const fallback = card.img || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal;
  const url = image || artCropFrom(fallback || cardImageMedRaw(card));
  return typeof url === 'string' && /^(https?:\/\/|\/(?!\/))/.test(url) ? url : '';
}

function libraryCoverValue(card) {
  return { key: libraryCardKey(card), name: card.name, image: libraryCardArt(card) };
}

function libraryTileArtHtml(card, cover, glyph) {
  const image = cover?.image || libraryCardArt(card);
  return `<span class="library-tile-placeholder" aria-hidden="true">${glyph || ICONS.decks}</span>${image ? `<img class="library-tile-art" src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">` : ''}`;
}

function wireLibraryTileImages() {
  document.querySelectorAll('.library-tile-art').forEach((image) => {
    image.addEventListener(
      'error',
      () => {
        image.hidden = true;
      },
      { once: true },
    );
    if (image.complete && !image.naturalWidth) image.hidden = true;
  });
}

// Virtual folders have no deck/binder record. This small preference is included
// in account sync and backups alongside the other library display preferences.
function libraryFolderCovers() {
  try {
    const covers = JSON.parse(localStorage.getItem(LS_PREFIX + 'tileCovers') || '{}');
    return covers && typeof covers === 'object' && !Array.isArray(covers) ? covers : {};
  } catch {
    return {};
  }
}

function setLibraryFolderCover(id, cover) {
  const covers = libraryFolderCovers();
  if (cover) covers[id] = cover;
  else delete covers[id];
  try {
    localStorage.setItem(LS_PREFIX + 'tileCovers', JSON.stringify(covers));
  } catch {
    warnStorageOnce();
  }
}

function openLibraryCoverPicker({ title, cards, selected, onSelect }) {
  document.getElementById('tileCoverPicker')?.remove();
  const seen = new Set();
  // Empty folders can still choose a cover from cards elsewhere in the library.
  const available = cards.some((card) => libraryCardArt(card))
    ? cards
    : (state.decksIndex || [])
        .flatMap((deck) => deckLeaders(deck).concat(deck.cards || []))
        .concat(collectionTrackedItems());
  const pool = available.filter((card) => {
    const key = libraryCardKey(card);
    if (!card?.name || !libraryCardArt(card) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const el = document.createElement('div');
  el.id = 'tileCoverPicker';
  el.className = 'deckpick-scrim library-cover-picker';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Cover art');
  el.innerHTML = `<section class="deckpick library-cover-dialog">
    <header><div><h2>Cover art</h2><p>${escapeHtml(title)}</p></div><button type="button" class="library-cover-close" aria-label="Close cover picker">${ICONS.close}</button></header>
    <div class="searchbar page-searchbar"><input id="tileCoverSearch" placeholder="Search cards…" aria-label="Search cover cards" autocomplete="off"></div>
    <div class="library-cover-results"><div class="cover-grid"></div><p class="library-cover-empty" hidden>No cards available. Add cards to choose their artwork.</p><button type="button" class="ghost-btn library-cover-more" hidden>Show more</button></div>
    <footer><button type="button" class="ghost-btn" id="tileCoverAutomatic">Automatic</button><button type="button" class="dp-cancel" id="tileCoverCancel">Cancel</button></footer>
  </section>`;
  brSheetOpen(el, 'tileCoverPicker');
  const close = () => brSheetClose('tileCoverPicker');
  const choose = (cover) => {
    onSelect(cover);
    close();
    render();
  };
  let limit = 80;
  const search = el.querySelector('#tileCoverSearch');
  const grid = el.querySelector('.cover-grid');
  const more = el.querySelector('.library-cover-more');
  const paint = () => {
    const q = search.value.trim().toLowerCase();
    const matches = pool.filter((card) =>
      `${card.name} ${card.set || ''}`.toLowerCase().includes(q),
    );
    grid.innerHTML = matches
      .slice(0, limit)
      .map(
        (card, i) =>
          `<button type="button" class="cover-opt${selected?.key === libraryCardKey(card) ? ' on' : ''}" data-cover-index="${i}" aria-label="${escapeHtml(card.name + (card.set ? ' · ' + card.set.toUpperCase() : ''))}"><img src="${escapeHtml(libraryCardArt(card))}" alt="" loading="lazy"><span>${escapeHtml(card.name)}</span></button>`,
      )
      .join('');
    el.querySelector('.library-cover-empty').hidden = matches.length > 0;
    more.hidden = matches.length <= limit;
    grid
      .querySelectorAll('[data-cover-index]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          choose(libraryCoverValue(matches[+button.dataset.coverIndex])),
        ),
      );
  };
  search.addEventListener('input', () => {
    limit = 80;
    paint();
  });
  more.addEventListener('click', () => {
    limit += 80;
    paint();
  });
  el.querySelector('.library-cover-close').addEventListener('click', close);
  el.querySelector('#tileCoverCancel').addEventListener('click', close);
  el.querySelector('#tileCoverAutomatic').addEventListener('click', () => choose(null));
  el.addEventListener('click', (event) => {
    if (event.target === el) close();
  });
  paint();
}

function folderCoverDecks(id) {
  if (isFmtFolder(id)) {
    const format = fmtOfFolder(id);
    const direct = fmtFolderDecks(format);
    return direct.concat(childFolders(id).flatMap((folder) => folderCoverDecks(folder.id)));
  }
  const ids = new Set([id]);
  for (const current of ids) childFolders(current).forEach((folder) => ids.add(folder.id));
  return (state.decksIndex || []).filter((deck) => ids.has(deck.folderId));
}

function folderCoverCards(id) {
  return folderCoverDecks(id).flatMap((deck) => deckLeaders(deck).concat(deck.cards || []));
}

function openFolderCoverPicker(id) {
  const folder = state.folders.find((entry) => entry.id === id);
  const automatic = isFmtFolder(id);
  if (!folder && !automatic) return;
  openLibraryCoverPicker({
    title: automatic ? fmtLabelOf(fmtOfFolder(id)) : folder.name,
    cards: folderCoverCards(id),
    selected: automatic ? libraryFolderCovers()['deck:' + id] : folder.coverArt,
    onSelect(cover) {
      if (automatic) setLibraryFolderCover('deck:' + id, cover);
      else {
        if (cover) folder.coverArt = cover;
        else delete folder.coverArt;
        saveFolders();
      }
    },
  });
}
