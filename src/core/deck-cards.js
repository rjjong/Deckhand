// core / deck-cards

/* ---- validated add/assign helpers (shared by pinned mode, popup mode, browse, card of the day) ---- */
/* 1.43: the deck slot wears the printing from your collection when you own
   the card (a non-foil copy first). A pinned/hand-picked printing is left
   alone, and Change printing still overrides it afterwards. */
function ownedPrintingOf(name) {
  const items = collectionTrackedItems().filter((it) => it && it.name === name && it.set && it.cn);
  if (!items.length) return null;
  return items.find((it) => !it.foil) || items[0];
}

async function useOwnedPrinting(d, arr, c) {
  try {
    if (!c || c.proxy || c.pin || c._foilPick) return;
    const it = ownedPrintingOf(c.name);
    if (!it) return;
    if (
      String(c.set || '').toLowerCase() === String(it.set).toLowerCase() &&
      String(c.collector_number || '') === String(it.cn)
    )
      return;
    const r = await sfFetch(`${SF_BASE}/cards/${it.set}/${encodeURIComponent(it.cn)}`, 0, true);
    if (!r || !r.ok) return;
    const full = await r.json();
    if (!full || full.name !== c.name) return;
    const i = arr.indexOf(c);
    if (i < 0) return; // moved or removed meanwhile
    if (it.foil && !items_hasNonFoil(c.name)) full._foilPick = true;
    full.proxy = !!c.proxy;
    if (c._playingOwned) full._playingOwned = c._playingOwned;
    arr[i] = full;
    scheduleSave(d);
    if (state.screen === 'decklist' && state.activeDeckId === d.id) {
      try {
        refreshDecklistBox(d);
      } catch (e) {}
    }
  } catch (e) {}
}

function items_hasNonFoil(name) {
  return collectionTrackedItems().some((it) => it && it.name === name && !it.foil);
}

function addCardToDeckValidated(d, c, refreshFn) {
  {
    const why = deckBlockReason(c, d);
    if (why) {
      toast(`${c.name}: ${why.toLowerCase()}.`);
      return false;
    }
  }
  if (!d.admiral && !deckIsConstructed(d)) {
    toast(`Appoint an Commander for ${d.name} first.`);
    return false;
  }
  if (deckLeaders(d).some((L) => L.name === c.name) && !allowsDuplicates(c)) {
    toast(`${c.name} is already in command of this deck.`);
    return false;
  }
  if (!colorIdentityOkDeck(c, d)) {
    toast(`${c.name} is off-color for your leader${d.partner ? 's' : ''}.`);
    return false;
  }
  if (atCopyLimit(d, c)) {
    toast(
      deckIsConstructed(d)
        ? copyLimit(c, d) === 1
          ? `${c.name} is restricted — one copy only.`
          : `${d.name} already runs four ${c.name}.`
        : `${c.name} is already in ${d.name}.`,
    );
    return false;
  }
  const copy = playingDeckCopy(c);
  d.cards.push(copy);
  ensurePlayingOwnership(d, [copy]);
  logDeckChange(d, { type: 'add', name: copy.name, card: copy });
  toast(`${c.name} added to ${d.name}.`);
  scheduleSave(d);
  if (refreshFn) refreshFn(c); // callers that care can refresh just this card's tile
  useOwnedPrinting(d, d.cards, copy); // 1.43
  return true;
}

function addToMaybeValidated(d, c, refreshFn) {
  {
    const why = deckBlockReason(c, d);
    if (why) {
      toast(`${c.name}: ${why.toLowerCase()}.`);
      return false;
    }
  }
  if (deckIsConstructed(d) && atCopyLimit(d, c)) {
    toast(`${c.name}: the copy limit counts the sideboard too.`);
    return false;
  }
  const copy = playingDeckCopy(c);
  ensureMaybeboard(d).push(copy);
  if (deckIsConstructed(d)) ensurePlayingOwnership(d, [copy]);
  logDeckChange(d, { type: 'addMaybe', name: copy.name, card: copy });
  toast(`${c.name} added to ${d.name}'s ${sideName(d)}.`);
  scheduleSave(d);
  if (refreshFn) refreshFn(c);
  useOwnedPrinting(d, d.maybeboard, copy); // 1.43
  return true;
}

function setCommanderValidated(d, c, refreshFn) {
  const go = () => {
    promoteToCommander(d, c);
    if (refreshFn) refreshFn();
  };
  if (d.admiral) {
    openInAppConfirm(
      `Make ${c.name} the ${fmtName(d)} of ${d.name}? ${d.admiral.name} will step down into the main deck.`,
      (ok) => {
        if (ok) go();
      },
    );
    return true;
  }
  go();
  return true;
}

function promoteToCommander(d, c) {
  const prev = d.admiral || null;

  const dupIdx = d.cards.findIndex((x) => x.name === c.name);
  const existing =
    dupIdx >= 0 ? d.cards[dupIdx] : deckLeaders(d).find((card) => card.name === c.name);
  c = existing
    ? { ...c, proxy: !!existing.proxy, _playingOwned: existing._playingOwned }
    : playingDeckCopy(c);
  if (dupIdx >= 0) d.cards.splice(dupIdx, 1);
  // Promoting the second seat to the first simply vacates the second seat.
  if (d.partner && d.partner.name === c.name) d.partner = null;
  if (prev && prev.name !== c.name) {
    if (d.cards.some((x) => x.name === prev.name) && !allowsDuplicates(prev)) {
      toast(`${prev.name} steps down — a copy was already in the deck.`);
    } else {
      d.cards.push(prev);
      logDeckChange(d, { type: 'add', name: prev.name, card: prev });
    }
  }
  d.admiral = c;
  reconcilePartner(d);
  if (!existing) ensurePlayingOwnership(d, [c]);
  logDeckChange(d, { type: 'admiral', name: c.name, card: c, prev, prevKept: true });
  state.inspireCache = {};
  scheduleSave(d);
  toast(
    `${c.name} takes command of ${d.name}${prev ? ` — ${prev.name} returns to the deck` : ''}.`,
  );
}

/* ---- "Add to…" deck picker popup (used whenever no deck is pinned) ---- */
/* Every deck in one list, most recently edited first — whatever its format. */
function dpPipsHtml(d) {
  return d && d.admiral
    ? `<span class="pips-mini dp-pips">${pipsHtml(deckColorIdentity(d), 'sm')}</span>`
    : '';
}

function deckPickRowsHtml() {
  // Each row carries the mana symbols of its leader's color identity, the
  // same pips the deck tiles wear; a deck without a leader shows none.
  const row = (d) => `<button class="dp-row" data-deck="${d.id}">
        <div class="dp-txt">${escapeHtml(d.name)}<div class="dp-meta">${d.admiral ? escapeHtml(d.admiral.name) : deckIsConstructed(d) ? fmtLabelOf(deckFormat(d)) : 'No ' + fmtName(d) + ' yet'} · ${d.cards.length + deckLeaders(d).length} cards</div></div>
        ${dpPipsHtml(d)}
      </button>`;
  // Most recently edited first, freshly sorted at open time — the load-time
  // index order goes stale as soon as a deck is touched mid-session.
  const byEdit = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
  return state.decksIndex.slice().sort(byEdit).map(row).join(''); // every format in one list
}

/* ---- folder chooser for a freshly created deck ----
   Same visual language as the deck picker: No folder first, then every
   folder of the deck's own format with its full path. Tapping outside or
   Skip simply means no folder — the flow always continues. */
function openFolderPickPopup(d, onPick) {
  document.getElementById('folderPickScrim')?.remove();
  const flds = (state.folders || []).filter((f) => folderFormat(f) === deckFormat(d));
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'folderPickScrim';
  el.innerHTML = /* HTML */ `<div class="deckpick">
    <h4>Put ${escapeHtml(d.name)} in a folder?</h4>
    <div class="deckpick-list">
      <button class="dp-row" data-fid="">
        <div class="dp-txt">
          No folder
          <div class="dp-meta">Appears under ${escapeHtml(fmtLabelOf(deckFormat(d)))} on Decks</div>
        </div>
      </button>
      ${flds
        .map(
          (f) =>
            `<button class="dp-row" data-fid="${f.id}"><span style="color:var(--brass);display:inline-flex;vertical-align:middle;margin-right:8px;">${folderIconSvg(f.icon, 20, folderIsNaval(f))}</span><span class="dp-txt" style="display:inline;">${escapeHtml(
              folderPath(f.id)
                .map((x) => x.name)
                .join(' / '),
            )}</span></button>`,
        )
        .join('')}
    </div>
    <button class="dp-cancel" id="fpCancel">Skip</button>
  </div>`;
  let settled = false;
  // Back = Skip: the flow continues without a folder.
  brSheetOpen(el, 'folderPickScrim', () => {
    if (settled) return;
    settled = true;
    setTimeout(() => onPick(null), 0);
  });
  const done = (fid) => {
    if (settled) return;
    settled = true;
    closeOverlayThen(() => onPick(fid || null));
  };
  el.addEventListener('click', (e) => {
    if (e.target === el) done(null);
  });
  document.getElementById('fpCancel').addEventListener('click', () => done(null));
  el.querySelectorAll('.dp-row').forEach((b) =>
    b.addEventListener('click', () => done(b.dataset.fid || null)),
  );
}

function openDeckPickPopup(card, mode, refreshFn, pairWith, withCollection) {
  closeDeckPickPopup();
  const nm = pairWith ? `${card.name} & ${pairWith.name}` : card.name;
  const act = (d) => {
    const proxy = !!el.querySelector('#dpProxy')?.checked;
    const selected = playingDeckCopy(card, proxy);
    const pair = pairWith ? [selected, playingDeckCopy(pairWith, proxy)] : null;
    if (mode === 'maybe') addToMaybeValidated(d, selected, refreshFn);
    else if (mode === 'admiral') {
      if (pair) setPairValidated(d, pair, refreshFn);
      else setCommanderValidated(d, selected, refreshFn);
    } else {
      if (pair) addPairToDeckValidated(d, pair, refreshFn);
      else addCardToDeckValidated(d, selected, refreshFn);
    }
  };
  const verb =
    mode === 'maybe'
      ? 'Add to the Maybeboard of…'
      : mode === 'admiral'
        ? 'Set as ' + fmtName() + (pairWith ? 's' : '') + ' of…'
        : mode === 'reco'
          ? 'Recommendations in which colors?'
          : 'Add to…';
  const sub =
    mode === 'reco'
      ? `${escapeHtml(nm)} — ${'recommendations will stay within the chosen colors'}`
      : escapeHtml(nm);
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'deckPickScrim';
  el.innerHTML = /* HTML */ `<div class="deckpick">
    <h4>${verb}</h4>
    <p class="dp-sub">${mode === 'reco' ? sub : escapeHtml(nm)}</p>
    ${mode === 'reco' ? '' : playingProxyOptionHtml('dpProxy', !!card.proxy)}
    <div class="deckpick-list">
      ${mode === 'reco' && isLegendary(card) && hasPowerToughness(card) && isNonlandFront(card) && !isBanned(card) ? `<button class="dp-row" data-asadmiral="1"><div class="dp-txt">${modeGlyph()} As ${fmtName()}<div class="dp-meta">Build around ${escapeHtml(card.name)} — recommendations in its own colors, pick cards, launch a deck</div></div></button>` : ''}
      ${mode === 'reco' ? `<button class="dp-row" data-anycolors="1"><div class="dp-txt">Any colors<div class="dp-meta">No color restriction</div></div></button><div id="recoColorPick"></div>` : ''}
      ${mode !== 'reco' ? `<button class="dp-row" data-newdeck="1"><div class="dp-txt">＋ New deck<div class="dp-meta">Create a fresh deck and add ${escapeHtml(nm)} to it</div></div></button>` : ''}
      ${mode !== 'reco' ? deckPickRowsHtml() : ''}
    </div>
    ${withCollection && !isCollectionBasicLand(card) ? `<button type="button" class="dp-row dp-collection" data-tocollection="1"><span class="ib" aria-hidden="true">${ICONS.collection}</span><div class="dp-txt">${trS('Add to collection')}<div class="dp-meta">Choose printing, quantity, and binder</div></div></button>` : ''}
    <button class="dp-cancel" id="dpCancel">Cancel</button>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    if (e.target === el) closeDeckPickPopup();
  });
  document.getElementById('dpCancel').addEventListener('click', closeDeckPickPopup);
  el.querySelector('[data-tocollection]')?.addEventListener('click', () => {
    closeDeckPickPopup();
    openAddToCollection(card);
  });
  // Recommendations pick their COLORS here with the Inspiration page's own
  // dropdowns: a count select, then a combination select with the app's mana
  // symbols. Only combinations that can actually HOLD this card are offered —
  // its color identity must fit inside (a red card never appears under
  // Selesnya), colorless fits everywhere, and the {C} option only suits a
  // colorless card. Picking a combination opens the reco page ceilinged to
  // those colors (id<=), like a deck of that identity would.
  if (mode === 'reco') {
    const ident = (card.color_identity || []).map((c) => String(c).toLowerCase());
    const fits = (key) =>
      key === 'c' ? ident.length === 0 : ident.every((ch) => key.includes(ch));
    const countOpts = [
      ['1', 'Monocolored'],
      ['2', '2 colors'],
      ['3', '3 colors'],
      ['45', '4 & 5 colors'],
    ].filter(([v]) => (COLOR_COMBOS[v] || []).some((cb) => fits(cb.key)));
    // Start at the card's own identity size — the tightest ceiling it fits.
    let pickCount =
      ident.length >= 4 ? '45' : ident.length === 3 ? '3' : ident.length === 2 ? '2' : '1';
    if (!countOpts.some(([v]) => v === pickCount)) pickCount = (countOpts[0] || ['2'])[0];
    const paintPick = () => {
      const bp = el.querySelector('#recoColorPick');
      if (!bp) return;
      bp._paint = paintPick; // outside taps and hardware back repaint via csRerender
      const combos = (COLOR_COMBOS[pickCount] || []).filter((cb) => fits(cb.key));
      bp.innerHTML = /* HTML */ ` <div style="margin:10px 0 0;">
          ${cselectHtml(
            'rpCount',
            countOpts.map(([v, l]) => ({ v, l: trS(l) })),
            pickCount,
            trS('2 colors'),
            { inline: true },
          )}
        </div>
        <div style="margin:8px 0 0;">
          ${cselectHtml(
            'rpCombo',
            combos.map((cb) => ({
              v: cb.key,
              l: escapeHtml(cb.label),
              icons: cb.key === 'c' ? manaIconSvg('C', 16) : manaRowSvg(cb.key.toUpperCase(), 16),
            })),
            '',
            trS('Choose a combination…'),
            { inline: true },
          )}
        </div>`;
      _csHandlers['rpCount'] = (v) => {
        pickCount = v;
        state.openCSelect = null;
        paintPick();
      };
      _csHandlers['rpCombo'] = (v) => {
        state.openCSelect = null;
        closeDeckPickPopup();
        openCardReco(card, null, v);
      };
      bp.querySelectorAll('[data-cs]').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          state.openCSelect = state.openCSelect === b.dataset.cs ? null : b.dataset.cs;
          paintPick();
        }),
      );
      bp.querySelectorAll('[data-csopt]').forEach((opt) =>
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = opt.dataset.csopt,
            val = opt.dataset.val;
          state.openCSelect = null;
          const h = _csHandlers[id];
          if (h) h(val);
          else paintPick();
        }),
      );
    };
    paintPick();
  }
  el.querySelectorAll('.deckpick-list .dp-row').forEach((row) => {
    row.addEventListener('click', () => {
      if (row.dataset.asadmiral) {
        closeDeckPickPopup();
        openCommanderReco(card);
        return;
      }
      if (row.dataset.newdeck) {
        closeDeckPickPopup();
        openDeckNamePrompt('New deck', '', (name) => {
          if (name === null) return; // cancelled
          // Born with its format stamped, so it lands in its own format folder.
          const nd = {
            id: uid(),
            name: (name || '').trim() || 'Untitled deck',
            format: 'commander',
            admiral: null,
            cards: [],
            maybeboard: [],
            tags: {},
            primer: '',
            folderId: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          // A deck can't take cards without a leader, so appoint one right
          // away, then offer a folder, then the card goes in. Backing
          // out of the appoint step leaves no empty deck husk behind.
          openAppointSearch(nd, (leader) => {
            nd.admiral = playingDeckCopy(leader);
            logDeckChange(nd, { type: 'admiral', name: leader.name, card: leader });
            const commit = (folderId) => {
              nd.folderId = folderId || null;
              state.decksIndex.unshift(nd);
              ensurePlayingOwnership(nd, deckLeaders(nd));
              persistDeck(nd);
              toast(`${leader.name} takes command of ${nd.name}.`);
              act(nd);
            };
            const flds = (state.folders || []).filter((f) => folderFormat(f) === deckFormat(nd));
            if (flds.length) openFolderPickPopup(nd, commit);
            else commit(null);
          });
        });
        return;
      }
      const anyColors = !!row.dataset.anycolors;
      const d = anyColors ? null : getDeck(row.dataset.deck);
      closeDeckPickPopup();
      if (mode === 'reco') {
        openCardReco(card, d);
        return;
      }
      if (!d) return;
      act(d);
    });
  });
}

function closeDeckPickPopup() {
  document.getElementById('deckPickScrim')?.remove();
}
