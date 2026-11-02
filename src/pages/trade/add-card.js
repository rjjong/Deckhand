// pages / trade / add-card

function openTradeAdd(side) {
  // Closing this overlay re-renders the trade page beneath it, so every card
  // added while it was open is on the table the moment it comes down.
  pushOverlay('tradeAdd', () => {
    closeNameSuggest();
    document.getElementById('tradeAddOverlay')?.remove();
    if (state.screen === 'trade') render();
  });
  let el = document.getElementById('tradeAddOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'tradeAddOverlay';
  }
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${overlayCapHtml(side === 'a' ? trS('Mine to receive') : trS('Yours to receive'))}
    <main style="display:flex;flex-direction:column-reverse;">
      <div class="searchbar" style="margin:8px 0 0;">
        <input
          id="taName"
          enterkeyhint="search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="${escapeHtml(trS('Card name…'))}"
        />
      </div>
      <div id="taResults">
        <p class="hint" style="text-align:center;">
          ${trS('Search any card — every printing of it can join the trade.')}
        </p>
      </div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  setTimeout(() => {
    try {
      document.getElementById('taName')?.focus();
    } catch (e) {}
  }, 60);
  const go = async () => {
    const q = (document.getElementById('taName')?.value || '').trim();
    const box = document.getElementById('taResults');
    if (!q || !box) return;
    box.innerHTML = '<div class="status"><div class="spinner"></div></div>';
    // BOTH sides search all of Scryfall — a trader without a collection in
    // the app can still line up any card. Scryfall's search returns its
    // default (most recognizable) printing per name, so the two pages wear
    // identical faces for identical cards. The sides differ only in the
    // printing chooser: the YOU side keeps the In-your-collection shelf so
    // your own copies are one tap away; the ME side hides it (noOwned).
    try {
      const r = await sfFetch(
        `${SF_BASE}/cards/search?unique=cards&q=${encodeURIComponent(q + ' game:paper')}`,
      );
      if (!r.ok) {
        box.innerHTML = '<p class="hint">No cards found.</p>';
        return;
      }
      const d = await r.json();
      const cards = (d.data || []).slice(0, 30);
      // Scryfall's bare-word search also matches FLAVOR names — 'rift'
      // returns the League-of-Legends 'Summoner's Rift' Command Tower. A
      // trade search must return the card someone actually typed, so every
      // query word has to appear in the card's REAL name. (If that filter
      // would empty the list — someone searched BY a flavor name — the
      // Scryfall hits stand, since then they're exactly what was wanted.)
      const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
      const named = cards.filter((c) => {
        const n = String(c.name).toLowerCase();
        return toks.every((t) => n.includes(t));
      });
      const pool = named.length ? named : cards;
      // YOU side: results split into the printing chooser's two shelves —
      // your own cards at the very foot under an 'In your collection' stripe,
      // everything else above under 'All results' — each block A→Z reading
      // UPWARD (the grid is wrap-reverse: array start renders at the foot).
      // A group's stripe shows whenever the group has cards — even just one.
      let list = pool,
        ownedLen = -1;
      if (side === 'b') {
        const ownSet = ownedNames();
        const az = (a, b) => String(a.name).localeCompare(String(b.name));
        const owned = pool.filter((c) => ownSet.has(c.name)).sort(az);
        const rest = pool.filter((c) => !ownSet.has(c.name)).sort(az);
        list = owned.concat(rest);
        ownedLen = owned.length;
      }
      const lblCss = 'width:100%;flex:1 1 100%;border-bottom:2px solid var(--line);';
      box.innerHTML = /* HTML */ `<div class="sr-grid">
        ${list
          .map((c, i) => {
            let shelf = '';
            if (ownedLen >= 0 && ownedLen > 0 && i === 0)
              shelf = `<div class="section-label" style="${lblCss}">${'In your collection'}</div>`;
            else if (ownedLen >= 0 && i === ownedLen && i < list.length)
              shelf = `<div class="section-label" style="${lblCss}">${'All results'}</div>`;
            return (
              shelf +
              `<div class="sr-tile ta-tile" data-i="${i}" role="button">
        <img class="${wbClass(c)}" src="${cardImageMed(c)}" alt="${escapeHtml(c.name)}" loading="lazy">${dfcFlipHtml(c)}
        <div class="st-body"><div class="st-meta-row"><div class="st-price st-price-lg" data-pricecard="${encodeURIComponent(c.name)}">…</div></div></div>
      </div>`
            );
          })
          .join('')}
      </div>`;
      box
        .querySelectorAll('.ta-tile')
        .forEach((btn) =>
          btn.addEventListener('click', () => openTradePrints(side, list[+btn.dataset.i])),
        );
      loadTilePrices(list);
    } catch (e) {
      box.innerHTML = '<p class="hint">Couldn\'t reach Scryfall.</p>';
    }
  };
  const input = el.querySelector('#taName');
  wireNameSuggest(input, allCardNamesFor, (name) => {
    input.value = name;
    go();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    go();
  });
  setTimeout(() => {
    try {
      document.getElementById('taName')?.focus();
    } catch (e) {}
  }, 60);
}

function openTradePrints(side, card) {
  openPrintingGrid(
    card,
    (chosen) => {
      loadTrade();
      state.trade[side].push({
        name: chosen.name,
        set: chosen.set,
        set_name: chosen.set_name || '',
        cn: chosen.collector_number || '',
        cardmarketUrl: tradeCardmarketUrl(chosen),
        img: cardImage(chosen),
        wb: chosen.border_color === 'white' ? 1 : 0,
        eur: printEur(chosen),
        foil: !!chosen._foilPick,
        pt: Date.now(),
        qty: 1,
        type_line: chosen.type_line || '',
        colors: chosen.colors || chosen.color_identity || [],
        rarity: chosen.rarity || '',
      });
      saveTrade();
      toast(trS('Added to trade.'));
      // The chooser already closed itself; closing the search overlay beneath
      // as well lands back on the trade overview, freshly rendered with the
      // new card on the table.
      closeTopOverlay();
    },
    { noCustom: true, noOwned: side === 'a' },
  ); // custom images have no business in a trade; ME-side cards arrive from the OTHER person, so my collection shelf stays out of that chooser
}
