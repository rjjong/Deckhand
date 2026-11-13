// ui / card-actions

/* ---- card action sheet: change printing / move to maybeboard / remove ---- */
/* A card saved inside a deck is stored slim -- no oracle text, no flavour --
   because 100 full cards per deck was megabytes of storage. Online the sheet
   fetches the rest; offline it did not, so the Oracle Text panel stayed
   empty. The phone's own database has every word of it, so take it there. */
function cardWithLocalText(card) {
  if (!card) return card;
  const hasText = !!card.oracle_text || (card.card_faces || []).some((f) => f.oracle_text);
  if (hasText) return card;
  let bc = null;
  try {
    if (_bulkIdx && _bulkIdx.byName)
      bc = _bulkIdx.byName.get(String(card.name || '').toLowerCase());
  } catch (e) {}
  if (!bc) {
    // Not loaded yet: fetch it and repaint the panel when it lands.
    if (!_bulkIdx && !_skIdxAsked) {
      _skIdxAsked = true;
      try {
        bulkIndexReady()
          .then(() => {
            try {
              repaintOracleBox();
              repaintSkeletons();
            } catch (e) {}
          })
          .catch(() => {});
      } catch (e) {}
    }
    return card;
  }
  const out = Object.assign({}, card);
  if (!out.oracle_text && bc.ot) out.oracle_text = bc.ot;
  if (!out.type_line && bc.tl) out.type_line = bc.tl;
  if (!out.mana_cost && bc.mc) out.mana_cost = bc.mc;
  if (out.power == null && bc.pw != null) out.power = bc.pw;
  if (out.toughness == null && bc.tg != null) out.toughness = bc.tg;
  if ((!out.card_faces || !out.card_faces.length) && bc.f && bc.f.length) {
    out.card_faces = bc.f.map((f) => ({
      name: f.name,
      mana_cost: f.mc || '',
      type_line: f.tl || '',
      oracle_text: f.ot || '',
      colors: (f.c || '').split('').filter(Boolean),
      power: f.pw,
      toughness: f.tg,
    }));
  }
  return out;
}

/* The open sheet's Oracle panel, redrawn once the database is in memory. */
function repaintOracleBox() {
  const box = document.getElementById('sheetOracle');
  if (!box || !box.dataset.cardname) return;
  let c = null;
  try {
    if (_bulkIdx && _bulkIdx.byName) c = _bulkIdx.byName.get(box.dataset.cardname.toLowerCase());
  } catch (e) {}
  if (!c) return;
  const full = bulkToCardish(c);
  if (full) box.innerHTML = oracleBlockHtml(full);
}

function oracleBlockHtml(card) {
  card = cardWithLocalText(card);
  const faces = card.card_faces && card.card_faces.length ? card.card_faces : [card];
  return faces
    .map((f) => {
      const cost = (f.mana_cost || '').replace(/[{}]/g, '');
      const pt =
        f.power !== undefined && f.power !== null
          ? `${f.power}/${f.toughness}`
          : f.loyalty !== undefined && f.loyalty !== null
            ? `Loyalty ${f.loyalty}`
            : '';
      return /* HTML */ `<div class="oracle-face">
        <div class="oracle-head">
          <span class="oracle-name">${escapeHtml(f.name || card.name)}</span>
          ${cost ? `<span class="oracle-cost">${escapeHtml(cost)}</span>` : ''}
        </div>
        <div class="oracle-type">${escapeHtml(f.type_line || '')}${pt ? ` · ${pt}` : ''}</div>
        ${f.oracle_text ? `<div class="oracle-text">${escapeHtml(f.oracle_text).replace(/\n/g, '<br>')}</div>` : ''}
        ${f.flavor_text ? `<div class="oracle-flavor">${escapeHtml(f.flavor_text).replace(/\n/g, '<br>')}</div>` : ''}
      </div>`;
    })
    .join('');
}

function openCardActionSheet(d, card, loc, idx) {
  if (zoomTake(card)) return; // 1.28 desk: a click shows the card big
  pushOverlay('cardSheet', () => {
    document.getElementById('cardSheetOverlay')?.remove();
  });
  renderCardSheet(d, card, loc, idx);
}

function cardDeckQuantityHtml(d, card, loc) {
  const leader = loc === 'admiral' || loc === 'partner';
  const pool = loc === 'maybe' ? ensureMaybeboard(d) : d.cards;
  const count = leader ? 1 : copiesIn(pool, card.name);
  const label = loc === 'maybe' ? `In ${sideName(d).toLowerCase()}` : 'In deck';
  const limited =
    leader || atCopyLimit(d, card) || (loc === 'maybe' && !deckIsConstructed(d) && count > 0);
  return `<div class="card-quantity card-deck-quantity">
    <span>${escapeHtml(label)} <strong data-deck-count aria-live="polite">${count}</strong></span>
    <div><button type="button" id="csAddOne" aria-label="Add one to deck" title="Add one to deck" ${limited ? 'disabled' : ''}>${ICONS.plus}</button>
    <button type="button" id="csRemove" aria-label="Remove one from deck" title="Remove one from deck" ${leader || count === 0 ? 'disabled' : ''}>${ICONS.minus}</button></div>
  </div>`;
}

function renderCardSheet(d, card, loc, idx, { scrollTop = null } = {}) {
  reconcilePlayingOwnership(d);
  _cardSheetGen++; // this render owns csPrice/csRulings from here on
  let el = document.getElementById('cardSheetOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay card-details-page';
    el.id = 'cardSheetOverlay';
  }
  csPopApply(el); // 1.26: a right-click opens this sheet as a popup by the mouse
  el._collectionItem = null;
  // (Re)append only when this sheet is new or already on top — a background
  // price/printing re-render must never climb above overlays opened later
  // (the Similar page vanished behind exactly that on its first open).
  {
    const _ovs = document.querySelectorAll('body > .overlay:not(.swipe-leaving)');
    if (!el.isConnected || (_ovs.length && _ovs[_ovs.length - 1] === el))
      document.body.appendChild(el);
    el.classList.toggle(
      'sheet-over-overlay',
      Array.from(document.querySelectorAll('body > .overlay:not(.swipe-leaving)')).some(
        (o) => o !== el,
      ),
    );
  }
  const admiralEligible = leaderFitsFormat(card, deckFormat(d)) && !isBanned(card, d);
  const actions = [];
  const deckCopy =
    loc === 'admiral'
      ? d.admiral
      : loc === 'partner'
        ? d.partner
        : loc === 'maybe'
          ? d.maybeboard[idx]
          : d.cards[idx];
  const inPlaying = loc !== 'maybe' || deckIsConstructed(d);
  el._playingDeckCopy = inPlaying ? deckCopy : null;
  const _reco = `<button class="ghost-btn" id="csReco" style="width:100%;"><span class="ib">${ICONS.reco}</span>Inspiration</button>`;
  const _sim = `<button class="ghost-btn" id="csSimilar" style="width:100%;"><span class="ib">${ICONS.similar}</span>${trS('Similar cards')}</button>`;
  const _shr = `<button class="ghost-btn" id="csShare" style="width:100%;"><span class="ib">${ICONS.share}</span>${trS('Share')}</button>`;
  const _prt = `<button class="ghost-btn" id="csChangePrinting" style="width:100%;"><span class="ib">${ICONS.swap}</span>${trS('Change printing')}</button>`;
  const _tag = `<button class="ghost-btn" id="csTags" style="width:100%;"><span class="ib">${ICONS.tag}</span>${trS('Tags')}</button>`;
  // Editing, sharing/tagging and discovery get their own rows below the quantity.
  const _pairTC = _tag;
  const _trio = `<div class="card-secondary-actions">${_shr}${_tag}</div>`;
  const _coll = `<button class="ghost-btn" id="csCollSheet" style="width:100%;"><span class="ib">${ICONS.collection}</span>${trS('Add to collection')}</button>`;
  if (loc === 'admiral') {
    actions.push(
      `<button class="ghost-btn" id="csSwitchCommander" style="width:100%;">${fmtFolderGlyph(deckFormat(d), 14)} Switch ${fmtName(d)}</button>`,
      _reco,
    );
    actions.push(_coll, _sim);
    if (!d.partner && pairAbility(card)) {
      actions.push(
        `<button class="ghost-btn" id="csAddPartner" style="width:100%;color:var(--brass);border-color:var(--brass);">＋ Add second ${fmtName(d)} (${escapeHtml(pairAbility(card).label)})</button>`,
        _shr,
      );
      actions.push(_prt, _pairTC);
    } else actions.push(_prt, _trio);
  } else if (loc === 'partner') {
    actions.push(
      `<button class="ghost-btn" id="csSwitchPartner" style="width:100%;">${deckFormat(d) === 'commander' ? '⚔' : anchorSvg(14)} Switch second ${fmtName(d)}</button>`,
      _reco,
    );
    actions.push(_coll, _sim);
    actions.push(
      `<button class="ghost-btn" id="csRemovePartner" style="width:100%;color:var(--danger);border-color:var(--danger);">Step down (to main deck)</button>`,
      _shr,
    );
    actions.push(_prt, _pairTC);
  } else {
    // Deck quantities live above collection quantities; editing stays below.
    const _move =
      loc === 'main'
        ? `<button class="ghost-btn" id="csToMaybe" style="width:100%;"><span class="ib">${ICONS.maybe}</span>${trS('To maybeboard')}</button>`
        : `<button class="ghost-btn" id="csToMain" style="width:100%;"><span class="ib">${ICONS.maybe}</span>${trS('To main deck')}</button>`;
    if (admiralEligible) {
      actions.push(
        _move,
        `<button class="ghost-btn" id="csMakeCommander" style="width:100%;color:var(--brass);border-color:var(--brass);">${deckFormat(d) === 'commander' ? '⚔' : anchorSvg(14)} Set as ${fmtName(d)}</button>`,
      );
      actions.push(_prt, _trio);
    } else {
      actions.push(_move, _shr);
      actions.push(_prt, _pairTC);
    }
  }

  const editingActions = actions.filter(
    (action) => ![_reco, _sim, _shr, _tag, _trio].includes(action) && !!deckCopy,
  );
  el.innerHTML = /* HTML */ `<div class="overlay-inner">
    ${cardDetailsHeaderHtml(card)}
    <main class="card-detail">
      <div style="text-align:center;">
        <span class="cd-hero" style="position:relative;display:block;width:100%;margin:0 auto;"
          ><img
            class="${wbClass(card)}"
            src="${cardImageLarge(card)}"
            id="dcImg"
            alt="${escapeHtml(card.name)}"
            style="width:100%;box-shadow:0 12px 30px rgba(0,0,0,0.4);cursor:pointer;"
          />${dfcFlipHtml(card)}</span
        >
      </div>
      <div class="cs-actions-grid">
        ${cardDeckQuantityHtml(d, card, loc)} ${cardCollectionQuantityHtml(card)}
        ${inPlaying && deckCopy && !isCollectionBasicLand(deckCopy) ? playingProxyOptionHtml('csProxy', !!deckCopy.proxy, 'Proxy in this deck · Add to Wants') : ''}
        <div class="card-editing-actions">${editingActions.join('')}</div>
        <div class="card-secondary-actions">${_shr}${_tag}</div>
        <div class="card-discovery-actions" role="group" aria-label="Discover cards">
          ${_reco}${_sim}
        </div>
      </div>
      <div id="csTagBox"></div>
      <div class="detail-sec sel-text">
        <div class="detail-h">Oracle Text</div>
        <div id="sheetOracle" data-cardname="${escapeHtml(card.name || '')}">
          ${oracleBlockHtml(card)}
        </div>
      </div>
      <div class="detail-sec">
        <div class="detail-h">Legality</div>
        ${legalityBlockHtml(card)}
      </div>
      <div class="detail-sec sel-text">
        <div class="detail-h">Rulings</div>
        <div id="csRulings">
          <div class="status">
            <div class="spinner"></div>
            Loading rulings…
          </div>
        </div>
      </div>
      <div class="sheet-foot-spacer" aria-hidden="true"></div>
    </main>
    ${el.classList.contains('cs-pop') ? '' : overlayNavHtml()}
  </div>`;

  if (scrollTop == null) pinSheetToTop(el);
  else el.querySelector('main').scrollTop = scrollTop;
  wireCardDetailsNav(el, card);
  document
    .getElementById('dcImg')
    ?.addEventListener('click', () => showCardPreview(card, cardImageLarge(card)));
  wireCardCollectionQuantity(el, card);
  // Saving updates the checkbox and quantities in place; rebuilding this
  // sheet would reset the user's scroll position.
  el.querySelector('#csProxy')?.addEventListener('change', (event) => {
    setPlayingProxy(d, deckCopy, event.target.checked);
    refreshDecklistBox(d);
  });
  try {
    paintPendingArt();
  } catch (e) {}
  document
    .getElementById('csChangePrinting')
    ?.addEventListener('click', () => openPrintingPicker(d, card, loc, idx));
  document.getElementById('csSimilar')?.addEventListener('click', () => openSimilarCards(card, d)); // 1.9: the deck's colours
  document.getElementById('csReco')?.addEventListener('click', () => openCardReco(card, d));
  document.getElementById('csShare')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openTileMenu(e.currentTarget, [
      { label: trS('Share image'), fn: () => shareCardImage(card) },
      { label: trS('Share link'), fn: () => shareCardLink(card) },
    ]);
  });
  document
    .getElementById('csTags')
    ?.addEventListener('click', (event) => openCardTagPopup(d, card, event.currentTarget));
  document.getElementById('csToMaybe')?.addEventListener('click', () => {
    d.cards.splice(idx, 1);
    ensureMaybeboard(d).push(card);
    logDeckChange(d, { type: 'toMaybe', name: card.name, card });
    scheduleSave(d);
    toast(`${card.name} moved to Maybeboard.`);
    closeTopOverlay();
    refreshDecklistBox(d);
  });
  document.getElementById('csToMain')?.addEventListener('click', () => {
    if (deckBlockReason(card, d)) {
      toast(deckBlockReason(card, d) + '.');
      return;
    }
    if (d.admiral && !colorIdentityOkDeck(card, d)) {
      toast('Off-color for your leaders.');
      return;
    }
    // Moving within one deck never changes the total count, so for the 60s
    // only the main-deck count matters here; singleton formats keep one.
    if (
      deckIsConstructed(d)
        ? false
        : d.cards.some((x) => x.name === card.name) && !allowsDuplicates(card)
    ) {
      toast('Already in main deck (singleton).');
      return;
    }
    d.maybeboard.splice(idx, 1);
    d.cards.push(card);
    ensurePlayingOwnership(d, [card]);
    logDeckChange(d, { type: 'toMain', name: card.name, card });
    scheduleSave(d);
    toast(`${card.name} moved to Main Deck.`);
    closeTopOverlay();
    refreshDecklistBox(d);
  });
  document
    .getElementById('csCollSheet')
    ?.addEventListener('click', () => openAddToCollection(card));
  // Keep the sheet open and resolve a remaining copy after every edit. Indices
  // change when the final copy is removed or another card moves into its slot.
  const changeDeckQuantity = (delta) => {
    if (loc === 'admiral' || loc === 'partner') return;
    const pool = loc === 'maybe' ? ensureMaybeboard(d) : d.cards;
    if (delta > 0) {
      if (
        atCopyLimit(d, card) ||
        (loc === 'maybe' && !deckIsConstructed(d) && copiesIn(pool, card.name))
      )
        return;
      const copy = playingDeckCopy(card);
      pool.push(copy);
      if (inPlaying) ensurePlayingOwnership(d, [copy]);
      logDeckChange(d, { type: loc === 'maybe' ? 'addMaybe' : 'add', name: card.name, card: copy });
    } else {
      const target = pool.includes(deckCopy)
        ? pool.indexOf(deckCopy)
        : pool.findIndex((c) => c.name === card.name);
      if (target < 0) return;
      const [removed] = pool.splice(target, 1);
      logDeckChange(d, {
        type: loc === 'maybe' ? 'removeMaybe' : 'remove',
        name: card.name,
        card: removed,
      });
    }
    scheduleSave(d);
    refreshDecklistBox(d);
    const remaining = pool.findIndex(
      (c) =>
        c.name === card.name && c.set === card.set && c.collector_number === card.collector_number,
    );
    const next = remaining >= 0 ? remaining : pool.findIndex((c) => c.name === card.name);
    renderCardSheet(d, next >= 0 ? pool[next] : card, loc, next, {
      scrollTop: el.querySelector('main').scrollTop,
    });
  };
  document.getElementById('csAddOne')?.addEventListener('click', () => changeDeckQuantity(1));
  document.getElementById('csRemove')?.addEventListener('click', () => changeDeckQuantity(-1));
  document.getElementById('csMakeCommander')?.addEventListener('click', () => {
    // Both the card list and command zone change, including partner eligibility.
    const arr = loc === 'maybe' ? d.maybeboard : d.cards;
    arr.splice(idx, 1);
    promoteToCommander(d, card);
    closeOverlayThen(() => render());
  });
  document.getElementById('csAddPartner')?.addEventListener('click', () => {
    closeOverlayThen(() => openPartnerSearch(d));
  });
  document.getElementById('csSwitchPartner')?.addEventListener('click', () => {
    closeOverlayThen(() =>
      openPartnerSearch(d, (c) => {
        removePartner(d);
        setPartner(d, c);
        render();
      }),
    );
  });
  document.getElementById('csRemovePartner')?.addEventListener('click', () => {
    removePartner(d);
    closeOverlayThen(() => render()); // the command zone itself changed — full redraw
  });
  document.getElementById('csSwitchCommander')?.addEventListener('click', () => {
    // Head to the browse page in switch mode: tapping ANY eligible leader
    // there — its art, its ⚔ button, or + — swaps command directly, and the
    // current leader joins the main deck. A compatible partner stays seated.
    state.searchPinnedDeckId = d.id;
    state._pinArm = true;
    state.searchFormat = deckFormat(d);
    state.switchSeat = d.id;
    closeTopOverlay();
    toast(`Choosing a new ${fmtName(d)} for ${d.name} — tap any leader to swap.`);
    switchPage('browse');
  });
  loadRulings(card);
  loadCardPrice(card);
  const swPool = loc === 'maybe' ? d.maybeboard : loc === 'main' ? d.cards : null;
  if (swPool && swPool.length > 1) {
    const order = displayOrderIdxs(d, loc);
    let pos = order.indexOf(idx);
    if (pos < 0) pos = order.findIndex((i) => swPool[i] && swPool[i].name === card.name);
    const go = (dir) => {
      if (pos < 0 || !order.length) return;
      const n = pos + dir;
      if (n < 0 || n >= order.length) return;
      try {
        navigator.vibrate && navigator.vibrate(6);
      } catch (e) {}
      renderCardSheet(d, swPool[order[n]], loc, order[n]);
    };
    const peekPos = (dir) => {
      const n = pos + dir;
      return pos < 0 || n < 0 || n >= order.length ? -1 : n;
    };
    attachSwipeNav(
      el,
      () => go(1),
      () => go(-1),
      {
        canNext: () => peekPos(1) >= 0,
        canPrev: () => peekPos(-1) >= 0,
        peekNext: () => {
          const n = peekPos(1);
          return n >= 0 ? cardImageMed(swPool[order[n]]) : null;
        },
        peekPrev: () => {
          const n = peekPos(-1);
          return n >= 0 ? cardImageMed(swPool[order[n]]) : null;
        },
      },
    );
  }
}

/* Every render of a card sheet bumps this generation counter. Async loaders
   (price, rulings) capture the value when they start and drop their result if
   another card has taken the sheet in the meantime — with the serial Scryfall
   queue, several stale answers used to land one after another, each rewriting
   the CURRENT card's sections (flicker, and worse: another card's rulings). */
let _cardSheetGen = 0;

/* One printing, one price: when the card sheet has this printing's fresh
   price, the owned copies of that same printing take it too -- the tile and
   the sheet never disagree about the same card. */
function syncCollectionPrice(card, eur) {
  try {
    const items = collectionTrackedItems();
    if (!items || !card || !card.name) return;
    const set = String(card.set || '').toLowerCase(),
      cn = String(card.collector_number || '');
    let changed = false;
    items.forEach((it) => {
      if (it.name !== card.name || String(it.set || '').toLowerCase() !== set) return;
      if (it.cn && cn && String(it.cn) !== cn) return;
      if (it.eur !== eur) {
        it.eur = eur;
        changed = true;
      }
    });
    if (changed) {
      saveCollection();
      if (state.screen === 'collection')
        setTimeout(() => {
          try {
            render();
          } catch (e) {}
        }, 0);
    }
  } catch (e) {}
}

async function loadCardPrice(card) {
  const gen = _cardSheetGen;
  const el = document.getElementById('csPrice');
  if (!el) return;
  // Salt loads independently so a slow price lookup cannot hold up its score.
  const saltRow = document.getElementById('csSaltRow');
  if (saltRow)
    edhrecSaltFor(card)
      .then((sv) => {
        if (gen !== _cardSheetGen || !saltRow.isConnected) return;
        if (sv == null || !Number.isFinite(Number(sv)) || Number(sv) < 0) {
          saltRow.title = trS('Salt score unavailable');
          return;
        }
        const score = Number(sv).toFixed(2);
        saltRow.querySelector('[data-saltseat]').textContent = score;
        saltRow.disabled = false;
        saltRow.title = trS('The 50 saltiest cards');
        saltRow.setAttribute('aria-label', `${trS('Salt score')}: ${score}`);
      })
      .catch(() => {});
  // The sheet shows ONE printing, so it prices THAT printing — the value
  // that travelled with the card object, fresh from Scryfall's daily
  // Cardmarket sync. The cheapest-printing lookup is only the fallback for
  // cards that arrived without price data — and then it fetches LIVE, its
  // 24h cache demoted to an offline safety net. (The cached cheapest used
  // to overrule everything: pick the €60 printing, sheet insists €56.88.)
  const own = printEur(card);
  const specific = own != null && !isNaN(own);
  if (specific) syncCollectionPrice(card, own);
  const v = specific ? own : await cheapestEur(card, true, true);
  if (gen !== _cardSheetGen) return; // a different card owns the sheet now
  const live = document.getElementById('csPrice');
  if (!live) return; // sheet closed while fetching
  live.querySelector('[data-card-price]').textContent = fmtEur(v);
  live.title = specific
    ? 'This printing · Cardmarket trend'
    : 'Cheapest printing · Cardmarket trend';
  live.setAttribute('aria-label', `${trS('Price trend and history')}: ${fmtEur(v)}`);
}

const _rulingsCache = new Map();
// rulings_uri → rendered HTML, capped small
function rulingsHtmlFrom(rulings) {
  if (!rulings.length)
    return `<div class="empty-note" style="padding:10px 0;">No rulings have been published for this card.</div>`;
  return rulings
    .map(
      (r) =>
        `<div class="ruling"><div class="ruling-date">${escapeHtml(r.published_at || '')}</div><div class="ruling-text">${escapeHtml(r.comment || '')}</div></div>`,
    )
    .join('');
}

async function loadRulings(card) {
  const gen = _cardSheetGen;
  const box = document.getElementById('csRulings');
  if (!box) return;
  // Local-first: the weekly bulk rulings answer instantly and offline. If
  // the local database can't answer within a heartbeat (first build of the
  // in-memory index, or a card newer than the weekly file), the live
  // Scryfall path below takes over unchanged.
  try {
    const t0 = Date.now();
    let loc = await Promise.race([
      bulkRulingsFor(card),
      new Promise((r) => setTimeout(() => r('timeout'), 400)),
    ]);
    if (loc === 'timeout' && (_bulkLoadP || _bulkIdx)) {
      // The index exists but is still warming up (first build of the
      // session, sync day, or background throttling). A local answer that
      // is merely LATE always beats joining a possibly-jammed network
      // queue — wait it out fully; the placeholder is already showing.
      loc = await bulkRulingsFor(card);
      if (Array.isArray(loc) && Date.now() - t0 > 1500)
        sfJournal('rulings: local after ' + (Date.now() - t0) + 'ms (index warm-up)');
    }
    if (Array.isArray(loc)) {
      if (gen !== _cardSheetGen) return;
      const live = document.getElementById('csRulings');
      if (live)
        live.innerHTML = rulingsHtmlFrom(loc.map((x) => ({ published_at: x.d, comment: x.c })));
      return;
    }
  } catch (e) {}
  // Deck copies are slimmed and lose rulings_uri — but they keep their id,
  // so the rulings link is rebuilt from it. As a last resort (very old
  // saves without an id) the card is resolved by exact name.
  let uri = card.rulings_uri || (card.id ? `${SF_BASE}/cards/${card.id}/rulings` : null);
  if (!uri && card.name) {
    const hitN = _rulingsCache.get('name:' + card.name);
    if (hitN != null) {
      box.innerHTML = hitN;
      return;
    }
    try {
      const rn = await sfFetch(
        `${SF_BASE}/cards/named?exact=${encodeURIComponent(card.name)}`,
        0,
        false,
        false,
        true,
      );
      if (rn.ok) {
        uri = (await rn.json()).rulings_uri || null;
      }
    } catch (e) {}
    if (gen !== _cardSheetGen) return;
  }
  if (!uri) {
    box.innerHTML = /* HTML */ `<div class="empty-note" style="padding:10px 0;">
      No rulings available for this printing.
    </div>`;
    return;
  }
  const hit = _rulingsCache.get(uri);
  if (hit != null) {
    const live = document.getElementById('csRulings');
    if (live) live.innerHTML = hit;
    return;
  }
  try {
    const res = await sfFetch(uri, 0, false, false, true);
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    const html = rulingsHtmlFrom(data.data || []);
    _rulingsCache.set(uri, html);
    if (!card.rulings_uri && !card.id && card.name) _rulingsCache.set('name:' + card.name, html);
    if (_rulingsCache.size > 60) _rulingsCache.delete(_rulingsCache.keys().next().value);
    if (gen !== _cardSheetGen) return; // a different card owns the sheet now
    const live = document.getElementById('csRulings');
    if (!live) return; // sheet was closed while we were fetching
    live.innerHTML = html;
  } catch (e) {
    console.error('rulings failed', e);
    if (gen !== _cardSheetGen) return;
    const live = document.getElementById('csRulings');
    if (live)
      live.innerHTML = /* HTML */ `<div class="empty-note" style="padding:10px 0;">
        Couldn't load rulings — check your connection.
      </div>`;
  }
}

/* The picker's option list, Stef's order: this card's own Scryfall tags
   first (DOM-first = at the BOTTOM of the column-reverse drop-up, right by
   the input, marked ⚙), then everything else — the full Scryfall catalog
   plus the person's own tags — alphabetically. Pure for testing. */
function _tagNorm(t) {
  return String(t)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/* Stef's menu, three labeled sections. DOM order = visual bottom-up in the
   column-reverse drop-up, each divider sitting UNDER its items:
     … all remaining Scryfall tags …
     ─ All Scryfall tags ─
     … the person's own tags …
     ─ Your tags ─
     … this card's recommendations …
     ─ Scryfall recommended ─   (bottom, right by the input)
   Dedup ignores case and punctuation; a tag lives in the FIRST section it
   qualifies for, and the person's spelling wins every collision. */
/* Reveal the opened tag editor without jumping past it to the card's rulings. */
function keepSheetFoot(el) {
  if (isDesk()) return;
  const m = el && el.closest && el.closest('main');
  if (!m) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ block: 'nearest' });
      } catch (e) {}
    }),
  );
}

function buildTagPickerSections(applied, autoTags, userTags, catalog) {
  const appliedN = new Set((applied || []).map(_tagNorm));
  const userByNorm = new Map();
  (userTags || []).forEach((t) => {
    const k = _tagNorm(t);
    if (k && !userByNorm.has(k)) userByNorm.set(k, String(t));
  });
  const seen = new Set();
  const take = (t) => {
    const k = _tagNorm(t);
    if (!k || appliedN.has(k) || seen.has(k)) return null;
    seen.add(k);
    return userByNorm.get(k) || String(t);
  };
  const collect = (arr) => {
    const out = [];
    (arr || []).forEach((t) => {
      const v = take(t);
      if (v) out.push(v);
    });
    out.sort((a, b) => a.localeCompare(b));
    return out;
  };
  /* The app has been noting when each tag was last chosen since v2.51.5xx and
     never used it. It does now: a short list of the ones you reach for, at the
     very foot of the drop-up where your thumb already is, newest first. The
     `seen` set means they are not repeated in the sections above. */
  const recent = (() => {
    let m = {};
    try {
      m = tagRecency() || {};
    } catch (e) {
      return [];
    }
    const known = new Map();
    [].concat(userTags || [], catalog || []).forEach((t) => {
      const k = _tagNorm(t);
      if (k && !known.has(k)) known.set(k, String(t));
    });
    return Object.keys(m)
      .map((k) => ({ t: known.get(_tagNorm(k)) || k, at: m[k] }))
      .filter((x) => x.t && x.at)
      .sort((a, b) => b.at - a.at) // newest first = nearest the thumb
      .slice(0, 8)
      .map((x) => x.t);
  })();
  // DOM order is bottom-to-top here: the list is drawn column-reverse.
  const takeAll = (arr) => {
    const out = [];
    (arr || []).forEach((t) => {
      const v = take(t);
      if (v) out.push(v);
    });
    return out;
  };
  return [
    { label: 'Recently used', items: takeAll(recent) },
    { label: 'Scryfall recommended', items: collect(autoTags) },
    { label: 'Your tags', items: collect(userTags) },
    { label: 'All Scryfall tags', items: collect(catalog) },
  ];
}

function renderTagEditor(d, card, box) {
  box._tagAbort?.abort();
  const events = new AbortController();
  box._tagAbort = events;
  const keepPosition = () => {
    if (!box.closest('.card-tags-dialog')) keepSheetFoot(box);
  };
  const tags = getCardTags(d, card.name);
  // This card's Scryfall tags: the persistent probe cache answers
  // instantly; otherwise the (now local-first) detector fills it and the
  // list re-sorts in place the moment it knows.
  let autoTags = (loadOtagCache()[card.name] || []).slice();
  if (!loadOtagCache()[card.name]) {
    detectOtagsForCards([card])
      .then((m) => {
        autoTags = (m[card.name] || []).slice();
        if (!box.isConnected) return;
        if (autoTags.length) {
          const _l = drop && drop.querySelector('.tag-drop-list');
          const keep = drop && !drop.hidden ? (_l ? _l.scrollTop : 0) : null;
          box._keepDrop = keep;
          renderTagEditor(d, card, box);
        } else renderDrop();
      })
      .catch(() => {});
  }
  const pickerSections = () =>
    buildTagPickerSections(getCardTags(d, card.name), autoTags, allAppTags(), BUDGET_OTAGS);
  box.innerHTML = /* HTML */ `<div class="tag-editor">
    <div class="detail-h" style="margin-top:0;">
      Tags on this card
      ${infoBtnHtml('Tags follow a card into all your decks; removing one hides it in this deck only. Sort the decklist by Tags to group cards by them.')}
    </div>
    <div class="tag-chips">
      ${(() => {
        // 1.37: outside a deck (Search, Similar, Inspiration...) the card shows
        // the tags Scryfall gives it too -- as in a deck, minus the remove
        const scry = d
          ? []
          : autoTags.filter(
              (t) => !tags.some((x) => String(x).toLowerCase() === String(t).toLowerCase()),
            );
        if (!tags.length && !scry.length) return '<span class="tag-none">No tags yet.</span>';
        // 1.45: in a deck, a tag that came from Scryfall (not typed by you) has the gold rim
        const mine = new Set(
          (ensureGlobalTags()[card.name] || []).map((x) => String(x).toLowerCase()),
        );
        return (
          tags
            .map(
              (t) =>
                `<span class="tag-chip${d && !mine.has(String(t).toLowerCase()) ? ' tag-scry' : ''}"${d && !mine.has(String(t).toLowerCase()) ? ' title="Scryfall"' : ''}>${escapeHtml(t)}<button data-rmtag="${encodeURIComponent(t)}">×</button></span>`,
            )
            .join('') +
          scry
            .map((t) => `<span class="tag-chip tag-scry" title="Scryfall">${escapeHtml(t)}</span>`)
            .join('')
        );
      })()}
    </div>
    <div class="tag-add-row" style="position:relative;">
      <input id="tagInput" type="text" placeholder="Add tag…" maxlength="24" autocomplete="off" />
      <button
        class="ghost-btn"
        id="tagCatChev"
        title="Browse all tags"
        style="width:auto;flex:0 0 auto;padding:9px 12px;"
      >
        ▴
      </button>
      <div class="pd-panel tag-drop" id="tagDrop" hidden></div>
      <button class="ghost-btn" id="tagAddBtn" style="width:auto;flex:0 0 auto;padding:9px 14px;">
        Add
      </button>
    </div>
  </div>`;
  const refresh = () => {
    if (d) scheduleSave(d);
    renderTagEditor(d, card, box);
    if (d) refreshDecklistBox(d);
    keepPosition();
  };
  const input = box.querySelector('#tagInput');
  const commit = () => {
    const v = input.value;
    if (!v.trim()) return;
    if (addCardTag(d, card.name, v)) refresh();
    else {
      toast('That tag is already on this card.');
      input.value = '';
    }
  };
  box.querySelector('#tagAddBtn').addEventListener('click', commit);
  // drop-UP of every tag in the app, filtered live as you type
  const drop = box.querySelector('#tagDrop');
  /* 1.26: the list carries its OWN search field at its foot (the input row
     sits under the popup, out of sight), and the list scrolls above it. */
  const dropList = () => drop && drop.querySelector('.tag-drop-list');
  const dropQ = () => drop && drop.querySelector('#tagDropQ');
  const ensureDropShell = () => {
    if (!drop || dropList()) return;

    drop.innerHTML = /* HTML */ `<div class="tag-drop-search">
        <span class="tds-ico">${ICONS.search}</span
        ><input type="text" id="tagDropQ" autocomplete="off" placeholder="${'Search tags…'}" />
      </div>
      <div class="tag-drop-list"></div>`;
    const dq = dropQ();
    if (box._dropQ) {
      dq.value = box._dropQ;
    }
    dq.addEventListener('input', () => {
      box._dropQ = dq.value;
      renderDrop();
    });
    dq.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        hideDrop();
        return;
      }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = dq.value.trim();
      if (!v) return;
      // An exact match is picked; anything else becomes a new tag.
      const hit = Array.from(drop.querySelectorAll('[data-picktag]')).find(
        (b) => decodeURIComponent(b.dataset.picktag).toLowerCase() === v.toLowerCase(),
      );
      const t = hit ? decodeURIComponent(hit.dataset.picktag) : v;
      box._keepDrop = 0;
      box._dropQ = '';
      if (addCardTag(d, card.name, t)) refresh();
      else {
        box._keepDrop = null;
        toast('That tag is already on this card.');
      }
    });
  };
  const renderDrop = () => {
    if (!drop) return;
    ensureDropShell();
    const dq = dropQ(),
      list = dropList();
    const q = ((dq && dq.value) || input.value || '').trim().toLowerCase();
    const secs = pickerSections()
      .map((sec) => ({
        label: sec.label,
        items: sec.items.filter((t) => !q || t.toLowerCase().includes(q)).slice(0, 400),
      }))
      .filter((sec) => sec.items.length);

    if (!secs.length && !(dq && dq.value)) {
      drop.hidden = true;
      return;
    }
    list.innerHTML = secs.length
      ? secs
          .map(
            (sec) =>
              `<div class="tag-drop-h"><span>${trS(sec.label)}</span><b>${sec.items.length}</b></div>` +
              sec.items
                .map(
                  (t) =>
                    `<button type="button" data-picktag="${encodeURIComponent(t)}">${escapeHtml(t)}</button>`,
                )
                .join(''),
          )
          .join('')
      : `<div class="tag-drop-none">${'No tag found — Enter creates it.'}</div>`;
    if (_dropHideT) {
      clearTimeout(_dropHideT);
      _dropHideT = null;
    } // a fresh show outlives any stale hide
    drop.hidden = false;
    state._localCsClose = hideDrop; // back folds the list
    list.querySelectorAll('[data-picktag]').forEach((b) =>
      b.addEventListener('mousedown', (ev) => {
        ev.preventDefault(); // fire before the input's blur hides the panel
        const t = decodeURIComponent(b.dataset.picktag);
        // The list stays open for the next tag, at the same scroll spot,
        // until you close it.
        box._keepDrop = list.scrollTop;
        if (addCardTag(d, card.name, t)) refresh();
        else box._keepDrop = null;
      }),
    );
  };
  const hideDrop = () => {
    if (drop) drop.hidden = true;
    box._dropStay = false;
    box._dropQ = '';
    const _dq = drop && drop.querySelector('#tagDropQ');
    if (_dq) _dq.value = '';
    if (state._localCsClose === hideDrop) state._localCsClose = null;
  };
  // mousedown-preventDefault keeps the input focused — tapping the chevron
  // with the keyboard up used to blur it, whose delayed hide then closed
  // the freshly opened list a heartbeat later.
  box.querySelector('#tagCatChev').addEventListener('mousedown', (ev) => ev.preventDefault());
  box.querySelector('#tagCatChev').addEventListener('click', () => {
    if (!drop.hidden) {
      hideDrop();
      return;
    }
    input.focus();
    renderDrop();
    try {
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches)
        drop.querySelector('#tagDropQ')?.focus();
    } catch (e) {}
  });
  // The tag box appears right where the Tags button was, so the tap that
  // opened it can land on this input a heartbeat later and fling the whole
  // list open. A focus in the first moments of its life is that stray tap,
  // never a deliberate one.
  const _bornAt = Date.now();
  input.addEventListener('focus', () => {
    if (Date.now() - _bornAt < 500) return;
    renderDrop();
  });
  input.addEventListener('input', renderDrop);
  let _dropHideT = null;
  input.addEventListener('blur', () => {
    _dropHideT = setTimeout(() => {
      if (
        box._keepDrop == null &&
        drop &&
        drop.isConnected &&
        document.activeElement !== input &&
        !drop.contains(document.activeElement) &&
        !box._dropStay
      )
        hideDrop();
    }, 150);
  });
  // A tap anywhere outside the tag row folds the list immediately — blur
  // alone missed taps on regions that never steal focus.
  document.addEventListener(
    'pointerdown',
    (ev) => {
      if (!drop || drop.hidden || !drop.isConnected) return;
      if (ev.target.closest && ev.target.closest('.tag-add-row')) return;
      if (_dropHideT) {
        clearTimeout(_dropHideT);
        _dropHideT = null;
      }
      hideDrop();
    },
    { capture: true, signal: events.signal },
  );
  // Reopen after a pick (the whole box was redrawn with the new chip).
  if (box._keepDrop != null) {
    const st = box._keepDrop;
    box._keepDrop = null;
    box._dropStay = true; // picked from the list: stay open without the keyboard
    renderDrop();
    try {
      const _l = drop.querySelector('.tag-drop-list');
      if (_l) _l.scrollTop = st;
    } catch (e) {}
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  });
  box.querySelectorAll('[data-rmtag]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = decodeURIComponent(b.dataset.rmtag);
      if (d) removeCardTag(d, card.name, t);
      else removeCardTagGlobal(card.name, t); // deckless sheet: global registry
      refresh();
    }),
  );
  box.querySelectorAll('[data-addtag]').forEach((b) =>
    b.addEventListener('click', () => {
      addCardTag(d, card.name, decodeURIComponent(b.dataset.addtag));
      refresh();
    }),
  );
}
