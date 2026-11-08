// ui / printing-picker

/* THE printing chooser: one shared two-wide grid — big art, set line with
   its icon, #number · rarity, and that printing's own Cardmarket trend price
   under each card — used everywhere a printing is chosen: deck sheet, card
   page, and trades. onPick(print) decides what the choice means; the chooser
   closes itself first. Loads front-of-lane (the person is staring at it),
   and rebuilds the prints link for slim deck copies that lost theirs. */
/* A photo or file becomes a card image: EXIF-rotated, downscaled to card
   proportions (512px wide tops), and re-encoded as a compact JPEG data URL
   that rides the print-preference store — one copy, shown everywhere the
   card appears, no servers involved. */
async function processCustomCardImage(file) {
  let bmp = null;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    bmp = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('decode'));
      im.src = URL.createObjectURL(file);
    });
  }
  const W = bmp.width || bmp.naturalWidth,
    H = bmp.height || bmp.naturalHeight;
  if (!W || !H) throw new Error('empty');
  const sc = Math.min(1, 512 / W, 714 / H);
  const cw = Math.max(1, Math.round(W * sc)),
    ch = Math.max(1, Math.round(H * sc));
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  cv.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
  try {
    if (bmp.close) bmp.close();
  } catch (e) {}
  return cv.toDataURL('image/jpeg', 0.62);
}

async function openPrintingGrid(card, onPick, gOpts) {
  let el = document.getElementById('printOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'printOverlay';
  }
  el.classList.add('printing-page');
  el.style.zIndex = gOpts?.zIndex ? String(gOpts.zIndex) : '';
  const session = {};
  el._printingSession = session;
  const trigger = document.activeElement;
  document.body.appendChild(el); // (re)append — a reused overlay must rise above ones opened after it
  pushOverlay('printing', () => {
    document.getElementById('printOverlay')?.remove();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    gOpts?.onClose?.();
  });
  el.innerHTML = /* HTML */ `<div
    class="overlay-inner"
    role="dialog"
    aria-modal="true"
    aria-label="Change printing"
  >
    ${overlayCapHtml(trS('Change printing'), `<button type="button" class="header-filter" id="ppClose" aria-label="Close printing picker">${ICONS.back}</button>`, card.name)}
    <main class="printing-content">
      ${gOpts && gOpts.noCustom ? '' : `<button type="button" class="printing-action" id="ppCustom" aria-label="Use your own image">${inlIco('camera')}${trS('Use your own image…')}</button>`}
      <input type="file" id="ppCustomFile" accept="image/*" hidden />
      <div id="ppList" class="status" role="status">
        <div class="spinner"></div>
        Loading printings…
      </div>
    </main>
    ${overlayNavHtml()}
  </div>`;
  wireOverlayNav(el);
  el.querySelector('#ppClose').addEventListener('click', closeTopOverlay);
  document.getElementById('ppCustom')?.addEventListener('click', () => {
    const inp = document.getElementById('ppCustomFile');
    if (inp) inp.click(); // Android's own sheet offers camera, gallery, and files
  });
  document.getElementById('ppCustomFile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const dataUrl = await processCustomCardImage(f);
      if (dataUrl.length > 400000) {
        toast(trS('Image too large even after shrinking.'));
        return;
      }
      const custom = {
        id: 'custom_' + Date.now(),
        name: card.name,
        image_uris: { small: dataUrl, normal: dataUrl },
      };
      // 1.18: the place decides: a deck slot or a collection copy takes the
      // image itself; anywhere else it is that place's pick
      if (gOpts && typeof gOpts.onCustom === 'function') {
        gOpts.onCustom(custom);
        closeTopOverlay();
        closeTopOverlay();
        toast(trS('Custom image set for this card.'));
        setTimeout(() => {
          try {
            render();
          } catch (err) {}
        }, 30);
        return;
      }
      setPrintPref(custom);
      // localStorage may refuse silently when full — believe it only if the
      // preference actually landed.
      let saved = false;
      try {
        saved = (localStorage.getItem(LS_PREFIX + 'printPrefs') || '').indexOf(custom.id) >= 0;
      } catch (err) {}
      if (!saved) {
        toast(trS('Not enough storage space for this image.'));
        return;
      }
      closeTopOverlay(); // the printing sheet…
      closeTopOverlay(); // …and the card sheet beneath, like a normal pick
      toast(trS('Custom image set for this card.'));
      setTimeout(() => {
        try {
          render();
        } catch (err) {}
      }, 30);
    } catch (err) {
      console.error(err);
      toast(trS('Could not read that image.'));
    }
  });
  // Candidate sources, tried in order: the stored printings link (which can
  // rot on old saves), the exact full name, and — for double-faced cards —
  // the front face's name alone. A Try again button covers flaky connections.
  const nameQ = (n) =>
    SF_BASE +
    '/cards/search?order=released&unique=prints&q=' +
    encodeURIComponent('!"' + String(n).replace(/"/g, '') + '"');
  const candidates = [];
  if (card.prints_search_uri) candidates.push(card.prints_search_uri);
  if (card.name) {
    candidates.push(nameQ(card.name));
    const front = String(card.name).split('//')[0].trim();
    if (front && front !== card.name) candidates.push(nameQ(front));
  }
  const attempt = async () => {
    const current = () => el.isConnected && el._printingSession === session;
    if (!current()) return;
    let box = el.querySelector('#ppList');
    if (box) {
      box.className = 'status';
      box.setAttribute('role', 'status');
      box.innerHTML = '<div class="spinner"></div>Loading printings…';
    }
    let prints = [];
    let hardFail = candidates.length === 0;
    for (const uri of candidates) {
      try {
        const res = await sfFetch(uri, 0, false, false, true);
        if (!current()) return;
        const data = await res.json();
        prints = (data.data || []).filter(
          (p) => p.image_uris || (p.card_faces && p.card_faces[0] && p.card_faces[0].image_uris),
        );
        if (prints.length) break;
      } catch (e) {
        console.error(e);
        hardFail = true;
      }
    }
    if (!current()) return;
    box = el.querySelector('#ppList');
    if (!box) return;
    box.removeAttribute('role');
    if (!prints.length) {
      box.className = '';
      box.innerHTML = /* HTML */ `<div class="printing-empty">
        <p role="status">
          ${hardFail ? "Couldn't load printings." : 'No printings with art found.'}
        </p>
        <button type="button" class="printing-action" id="ppRetry">↻ Try again</button>
      </div>`;
      document.getElementById('ppRetry')?.addEventListener('click', attempt);
      return;
    }
    box.className = '';
    // Owned printings come first; each section reads newest to oldest.
    prints.sort((a, b) => String(b.released_at || '').localeCompare(String(a.released_at || '')));
    // gOpts.noOwned (trade's ME side): the incoming cards belong to the other
    // trader, so every trace of MY ownership — shelf, \u2713, \u00d7counts — stays out.
    const ownQty = {};
    if (!(gOpts && gOpts.noOwned))
      collectionTrackedItems().forEach((x) => {
        const k = x.name + '|' + (x.set || '') + '|' + (x.cn || '');
        ownQty[k] = (ownQty[k] || 0) + (x.qty || 1);
      });
    const ownKey = new Set(Object.keys(ownQty));
    const owned = prints.filter((p) =>
      ownKey.has(p.name + '|' + (p.set || '') + '|' + (p.collector_number || '')),
    );
    if (owned.length && owned.length < prints.length) {
      prints = owned.concat(prints.filter((p) => !owned.includes(p)));
    }
    // Foil handling: a printing that exists in foil offers it as its own
    // pick with Cardmarket's FOIL trend price; a foil-ONLY printing simply
    // IS the foil. Choosing foil overrides the card's price fields so every
    // price reader downstream (deck totals, tiles, budget) shows the foil
    // trend without knowing anything about finishes.
    const asFoil = (p) =>
      Object.assign({}, p, {
        foil: true,
        _foilPick: true,
        prices: {
          eur: (p.prices && p.prices.eur_foil) || null,
          eur_foil: (p.prices && p.prices.eur_foil) || null,
        },
      });
    // The foil control is a SIBLING pill overlaid on the card corner, never
    // a button nested in a button — browsers hoist nested buttons out, which
    // is exactly how the first attempt's foil control escaped its tile and
    // hijacked a whole grid cell. The tile itself stays untouched.
    box.innerHTML = /* HTML */ `<div class="pp-grid">
      ${prints
        .map((p, i) => {
          let shelf = '';
          if (owned.length && i === 0) shelf = '<h2 class="pp-section">In your collection</h2>';
          else if (owned.length && i === owned.length)
            shelf = '<h2 class="pp-section">All printings</h2>';
          const ownMark =
            owned.length && i < owned.length
              ? '<span class="pp-own" title="In your collection">✓</span>'
              : '';
          return (
            shelf +
            (() => {
              const fins = p.finishes || [];
              const foilOnly = fins.includes('foil') && !fins.includes('nonfoil');
              const foilEur = p.prices && parseFloat(p.prices.eur_foil);
              const eur = foilOnly ? foilEur || printEur(p) : printEur(p);
              return `<div class="pp-wrap">
        <button type="button" class="sr-tile ta-tile" data-i="${i}" data-foilonly="${foilOnly ? 1 : ''}" aria-label="${escapeHtml('Choose ' + (foilOnly ? 'foil ' : '') + (p.set_name || p.set) + ' printing, number ' + p.collector_number).replace(/"/g, '&quot;')}">
          <span class="pp-imghold"><img class="${wbClass(p)}" src="${cardImageMedRaw(p)}" alt="${escapeHtml(p.name)}" loading="lazy">${ownMark}</span>
          <div class="st-body">
            <div class="tp-set">${setIcoHtml(p.set, p.rarity)} ${escapeHtml(p.set_name || p.set)}</div>
            <div class="tp-sub">#${p.collector_number || ''}${p.rarity ? ' · ' + p.rarity : ''}${(() => {
              const q = ownQty[p.name + '|' + (p.set || '') + '|' + (p.collector_number || '')];
              return q ? ` · ×${q}` : '';
            })()}</div>
            <div class="st-price st-price-lg">${eur != null && !isNaN(eur) ? `€${eur.toFixed(2)}` : '<span class="nopr">No price</span>'}</div>
          </div>
        </button>
        ${foilOnly ? `<span class="pp-foil">Foil${eur != null && !isNaN(eur) ? ` · €${eur.toFixed(2)}` : ''}</span>` : fins.includes('foil') ? `<button type="button" class="pp-foil" data-fi="${i}" aria-label="${escapeHtml('Choose foil ' + (p.set_name || p.set) + ' printing, number ' + p.collector_number).replace(/"/g, '&quot;')}">Foil${foilEur ? ` · €${foilEur.toFixed(2)}` : ''}</button>` : ''}
      </div>`;
            })()
          );
        })
        .join('')}
    </div>`;
    box.querySelectorAll('button.pp-foil').forEach((fb) => {
      fb.addEventListener('click', (e) => {
        e.stopPropagation();
        const chosen = asFoil(prints[+fb.dataset.fi]);
        closeTopOverlay(); // pop the chooser only
        onPick(chosen);
      });
    });
    box.querySelectorAll('.ta-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = prints[+btn.dataset.i];
        const chosen = btn.dataset.foilonly === '1' ? asFoil(p) : p;
        closeTopOverlay(); // pop the chooser only
        onPick(chosen);
      });
    });
  };
  attempt();
}

function openPrintingPicker(d, card, loc, idx) {
  openPrintingGrid(
    card,
    (picked) => {
      // 1.39: this deck's slot wears the pick; other decks keep their own
      const chosen = Object.assign({}, picked, {
        pin: 1,
        proxy: !!card.proxy,
        _playingOwned: card._playingOwned,
        _playingMissing: card._playingMissing,
        _wantsDismissed: card._wantsDismissed,
      });
      if (loc === 'admiral') d.admiral = chosen;
      else if (loc === 'partner') d.partner = chosen;
      else if (loc === 'maybe') d.maybeboard[idx] = chosen;
      else d.cards[idx] = chosen;
      scheduleSave(d);
      // Picking a printing finishes the errand: close the card sheet too and
      // land back on the deck list, where the confirmation and new art show.
      closeTopOverlay();
      toast(`Now showing the ${chosen.set_name}${chosen._foilPick ? ' ✨ foil' : ''} printing.`);
      setTimeout(() => {
        try {
          render();
        } catch (e) {}
      }, 30);
    },
    {
      onCustom: (custom) => {
        // 1.18: your own image dresses THIS slot only
        const chosen = Object.assign({}, card, {
          id: custom.id,
          image_uris: custom.image_uris,
          pin: 1,
        });
        if (chosen.card_faces)
          chosen.card_faces = chosen.card_faces.map((f) =>
            Object.assign({}, f, { image_uris: custom.image_uris }),
          );
        if (loc === 'admiral') d.admiral = chosen;
        else if (loc === 'partner') d.partner = chosen;
        else if (loc === 'maybe') d.maybeboard[idx] = chosen;
        else d.cards[idx] = chosen;
        scheduleSave(d);
      },
    },
  );
}

/* Deck-list lines arrive decorated in some dialects — Archidekt appends a
   set code, collector number, and category tag: "Aetherize (znc) 23
   [Instant]", sometimes with a foil marker. Strip trailing decorations down
   to the pure card name; real card names never end in these shapes, so
   plain Moxfield lines pass through untouched. */
function stripDeckLineDecorations(nm) {
  return String(nm || '')
    .replace(/\s*\[[^\]]*\]\s*$/, '') // [Instant]
    .replace(/\s+#.*$/, '') // deckstats #!Commander tags
    .replace(/\s*\*[A-Za-z]+\*\s*$/, '') // *F* foil marker
    .replace(/\s*\(([0-9A-Za-z]{2,6})\)\s+[\w★-]+\s*$/, '') // (znc) 23 · (plst) CMD-261
    .replace(/\s*\(([0-9A-Za-z]{2,6})\)\s*$/, '') // bare (znc)
    .trim();
}

async function applyTextToDeck(
  d,
  raw,
  reportElId,
  isImport,
  { append = false, proxy = false } = {},
) {
  let admiralName = null,
    partnerName = null;
  const cardNames = [];
  const maybeNames = [];
  // Lists arrive in many dialects: "[CREATURES]" sections, "Sorceries:" labels,
  // "// Sideboard" comments, "# Lands" markdown. Any bare category line is a
  // header, never a card — and a COMMANDER/COMMANDER section is understood: its
  // first card becomes the leader, a second one the partner.
  let section = 'main';
  const headerOf = (l) => {
    const bare = l
      .replace(/^\/\/\s*|^#+\s*/, '')
      .replace(/^\[(.+)\]$/, '$1')
      .replace(/^\((.+)\)$/, '$1')
      .replace(/:\s*$/, '')
      .trim();
    if (/\d/.test(bare)) return null; // headers never carry quantities
    if (/^(side ?board|maybe ?board|considering|companion|wants)$/i.test(bare)) return 'maybe';
    if (/^commanders?$/i.test(bare)) return 'leader';
    if (
      /^(deck|main ?board|main|planeswalkers?|creatures?|battles?|instants?|sorcer(?:y|ies)|artifacts?|enchantments?|lands?|spells?|other|tokens?)$/i.test(
        bare,
      )
    )
      return 'main';
    return null;
  };
  // A lone card (or pair) standing APART at the top — separated from the
  // list by a blank line, the way Moxfield and friends export — claims the
  // leader's seat. Only leader-ELIGIBLE cards keep it: if the guess doesn't
  // hold up at resolution, the card quietly joins the main list instead.
  const rawLines = raw.split(/\r?\n/).map((l) => l.trim());
  let isoLeaderNames = [],
    isoTailSection = null;
  if (!append) {
    let i = 0;
    while (i < rawLines.length && !rawLines[i]) i++;
    let j = i;
    while (j < rawLines.length && rawLines[j]) j++;
    const block = rawLines.slice(i, j);
    const rest = rawLines.slice(j).filter(Boolean);
    const plainName = (l) => {
      if (/^(COMMANDER|PARTNER):/i.test(l)) return null;
      if (headerOf(l)) return null;
      const q = l.match(/^(\d+)x?\s+(.+)$/i);
      if (q && parseInt(q[1], 10) !== 1) return null; // "4 Forest" is never a leader
      return stripDeckLineDecorations(q ? q[2] : l);
    };
    if (block.length >= 1 && block.length <= 2 && rest.length >= 5) {
      const names = block.map(plainName);
      if (names.every(Boolean)) {
        isoLeaderNames = names;
        rawLines.splice(i, j - i); // consumed — the loop below never sees them
      }
    }
    // Moxfield's plain export puts the commander at the very END, after the
    // sideboard, apart from it by a blank line: "…\n\n1 Elsha of the Infinite".
    // The same lone block at the foot claims the seat (unless the list
    // already names a leader); a guess that doesn't hold returns to the
    // section it was standing in.
    if (
      !isoLeaderNames.length &&
      !rawLines.some((l) => /^(COMMANDER|PARTNER):/i.test(l) || headerOf(l) === 'leader')
    ) {
      let e = rawLines.length - 1;
      while (e >= 0 && !rawLines[e]) e--;
      let s0 = e;
      while (s0 >= 0 && rawLines[s0]) s0--;
      const tail = rawLines.slice(s0 + 1, e + 1);
      const before = rawLines.slice(0, s0 + 1).filter(Boolean);
      if (s0 >= 0 && tail.length >= 1 && tail.length <= 2 && before.length >= 5) {
        const names = tail.map(plainName);
        if (names.every(Boolean)) {
          isoLeaderNames = names;
          // which section would have held them: the last header above
          isoTailSection = 'main';
          before.forEach((l) => {
            const h = headerOf(l.replace(/^[-\u2022*]\s+/, ''));
            if (h) isoTailSection = h;
          });
          rawLines.splice(s0 + 1, e - s0);
        }
      }
    }
  }
  const lines = rawLines.filter(Boolean);
  lines.forEach((l) => {
    l = l.replace(/^[-\u2022*]\s+/, ''); // markdown bullets
    let forced = null;
    const sb = l.match(/^SB:\s*(.+)$/i); // MTGO sideboard prefix
    if (sb) {
      forced = 'maybe';
      l = sb[1];
    }
    const m = l.match(/^(?:COMMANDER):\s*(.+)$/i);
    if (m) {
      if (append) cardNames.push(stripDeckLineDecorations(m[1]));
      else admiralName = stripDeckLineDecorations(m[1]);
      section = 'main';
      return;
    }
    const pm = l.match(/^PARTNER:\s*(.+)$/i);
    if (pm) {
      if (append) cardNames.push(stripDeckLineDecorations(pm[1]));
      else partnerName = stripDeckLineDecorations(pm[1]);
      section = 'main';
      return;
    }
    const hdr = headerOf(l);
    if (hdr) {
      section = hdr;
      return;
    }
    const q = l.match(/^(\d+)x?\s+(.+)$/i);
    const nm = stripDeckLineDecorations(q ? q[2] : l);
    if (section === 'leader' && !append) {
      if (!admiralName) admiralName = nm;
      else if (!partnerName) partnerName = nm;
      else cardNames.push(nm);
      return;
    }
    // "4 Forest" means four Forests: push the name once per copy. The
    // duplicate rules downstream decide what's allowed to repeat.
    const qty = q ? Math.max(1, Math.min(99, parseInt(q[1], 10) || 1)) : 1;
    for (let i = 0; i < qty; i++)
      ((forced || section) === 'maybe' ? maybeNames : cardNames).push(nm);
  });
  let admiralIsGuess = false,
    partnerIsGuess = false;
  if (isoLeaderNames.length) {
    if (!admiralName) {
      admiralName = isoLeaderNames[0];
      admiralIsGuess = true;
      if (isoLeaderNames[1]) {
        if (!partnerName) {
          partnerName = isoLeaderNames[1];
          partnerIsGuess = true;
        } else cardNames.unshift(isoLeaderNames[1]);
      }
    } else (isoTailSection === 'maybe' ? maybeNames : cardNames).unshift(...isoLeaderNames);
  }
  // ONE count for everything this list brings: leader(s), main deck AND
  // the sideboard / maybeboard -- the number on screen is the number added.
  const allN = cardNames.length + maybeNames.length + (admiralName ? 1 : 0) + (partnerName ? 1 : 0);
  const _resolving = (done) => {
    const el = document.getElementById(reportElId);
    if (el)
      el.innerHTML = /* HTML */ `<div class="status">
        <div class="spinner"></div>
        Resolving ${done}/${allN} cards…
      </div>`;
  };
  document.getElementById(reportElId).innerHTML = /* HTML */ `<div class="status">
    <div class="spinner"></div>
    Resolving ${allN} cards…
  </div>`;
  // Keep progress and results visible in the tool's own scrolling body.
  const _pinFoot = () => {
    try {
      const b =
        document.getElementById(reportElId)?.closest('.deck-editor-body, .transfer-body') ||
        document.getElementById('dlPanelBox');
      if (b) b.scrollTop = b.scrollHeight;
    } catch (e) {}
  };
  _pinFoot();
  // Phase clock for Copy diagnostics: when an import crawls, this line says
  // which stage ate the time and how deep the Scryfall lane was on arrival.
  const _bt = { t0: Date.now(), q: _sfQ.hi.length + '/' + _sfQ.lo.length };
  await resolveLegalSets();
  _bt.sets = Date.now();
  if (deckIsConstructed(d)) {
    if (partnerName) cardNames.unshift(partnerName);
    if (admiralName) cardNames.unshift(admiralName);
    admiralName = null;
    partnerName = null;
  }
  let newCommander = isImport ? null : d.admiral;
  let newPartner; // undefined = leave d.partner untouched
  const report = [];
  const leaderOk = (c) =>
    (leaderFitsFormat(c, deckFormat(d)) || (pairAbility(c) || {}).kind === 'background') &&
    !isBanned(c, d);
  // A GUESSED leader (a lone card at the top or the foot of the list) must
  // truly be able to lead -- a legendary creature, "can be your commander",
  // or a Background -- or it simply stays a card in the list.
  const guessOk = (c) => {
    const tl = String(
      ((typeof frontFace === 'function' ? frontFace(c) : c) || c).type_line || c.type_line || '',
    );
    if ((pairAbility(c) || {}).kind === 'background') return true;
    if (/can be your commander/i.test(c.oracle_text || '')) return true;
    if (deckFormat(d) === 'paupercommander') return /Creature/.test(tl);
    return isLegendary(c) && /Creature/.test(tl);
  };
  if (admiralName) {
    const r = await resolveCardByName(admiralName, deckFormat(d));
    if (r && r.found && r.legalPrint && leaderOk(r.card) && (!admiralIsGuess || guessOk(r.card))) {
      newCommander = r.card;
      report.push({ name: r.card.name, status: 'ok', msg: fmtName(d) + ' set' });
    } else if (admiralIsGuess) {
      (isoTailSection === 'maybe' ? maybeNames : cardNames).unshift(admiralName);
      admiralName = null;
    } else report.push({ name: admiralName, status: 'bad', msg: 'Not usable as ' + fmtName(d) });
  }
  if (partnerName) {
    const r = await resolveCardByName(partnerName, deckFormat(d));
    const lead = newCommander || d.admiral;
    if (
      r &&
      r.found &&
      r.legalPrint &&
      leaderOk(r.card) &&
      (!partnerIsGuess || guessOk(r.card)) &&
      lead &&
      canPair(lead, r.card)
    ) {
      newPartner = r.card;
      report.push({ name: r.card.name, status: 'ok', msg: 'Second ' + fmtName(d) + ' set' });
    } else if (partnerIsGuess) {
      (isoTailSection === 'maybe' ? maybeNames : cardNames).unshift(partnerName);
      partnerName = null;
    } else
      report.push({
        name: partnerName,
        status: 'bad',
        msg: lead ? "Can't pair with " + lead.name : 'No first leader to pair with',
      });
  }
  const effLead = {
    admiral: newCommander || d.admiral,
    partner: (newPartner !== undefined ? newPartner : d.partner) || null,
    format: d.format,
  };
  if (effLead.partner && (!effLead.admiral || !canPair(effLead.admiral, effLead.partner)))
    effLead.partner = null;
  const leaderNames = new Set(deckLeaders(effLead).map((c) => c.name));
  // Leaders are done by now; whatever they handed back is counted below.
  const _leadDone = allN - cardNames.length - maybeNames.length;
  _resolving(_leadDone);
  const results = await resolveManyByName(cardNames, (done) => {
    _resolving(_leadDone + done);
    _pinFoot();
  });
  _bt.resolve = Date.now();

  // Some lookups may have failed purely due to network/rate-limit issues even
  // after sfFetch's internal retries — give those specific cards one more
  // full pass rather than reporting them as illegal or missing.
  const retryIdxs = [];
  results.forEach((r, i) => {
    if (!r || r.networkIssue || r.verifyFailed) retryIdxs.push(i);
  });
  if (retryIdxs.length) {
    document.getElementById(reportElId).innerHTML = /* HTML */ `<div class="status">
      <div class="spinner"></div>
      Re-checking ${retryIdxs.length} card${retryIdxs.length > 1 ? 's' : ''} after a network hiccup…
    </div>`;
    const retried = await runLimited(
      retryIdxs.map((i) => cardNames[i]),
      (nm) => resolveCardByName(nm, deckFormat(d)),
      2,
    );
    retryIdxs.forEach((idx, j) => {
      results[idx] = retried[j];
    });
  }
  _bt.retry = Date.now();
  const _btLine = (tag) => {
    try {
      const s = (a, b) => ((b - a) / 1000).toFixed(1) + 's';
      sfJournal(
        'BULK ' +
          tag +
          ' ' +
          cardNames.length +
          ' names, lane ' +
          _bt.q +
          ': sets ' +
          s(_bt.t0, _bt.sets) +
          ', resolve ' +
          s(_bt.sets, _bt.resolve) +
          ', retry ' +
          retryIdxs.length +
          'x ' +
          s(_bt.resolve, _bt.retry) +
          ', finish ' +
          s(_bt.retry, Date.now()),
      );
    } catch (e) {}
  };

  const newDeck = append ? d.cards.slice() : [];
  const appendedCards = [];
  results.forEach((r) => {
    if (!r || !r.found) {
      if (r && r.networkIssue)
        report.push({ name: r.input, status: 'notfound', msg: "Couldn't verify — network issue" });
      else
        report.push({
          name: r ? r.input : '?',
          status: 'notfound',
          msg: r && r.networkIssue ? "Couldn't reach Scryfall — try again" : 'Not found',
        });
      return;
    }
    const c = r.card;
    if (r.verifyFailed) {
      report.push({
        name: c.name,
        status: 'notfound',
        msg: "Couldn't verify legality — try again",
      });
      return;
    }
    if (!r.legalPrint) {
      report.push({ name: c.name, status: 'bad', msg: 'Never in a legal set' });
      return;
    }
    {
      const why = deckBlockReason(c, d);
      if (why) {
        report.push({ name: c.name, status: 'bad', msg: why });
        return;
      }
    }
    if (leaderNames.has(c.name)) {
      report.push({ name: c.name, status: 'ok', msg: 'Kept as ' + fmtName(d) });
      return;
    }
    if (effLead.admiral && !colorIdentityOkDeck(c, effLead)) {
      report.push({ name: c.name, status: 'bad', msg: 'Off-color' });
      return;
    }
    if (
      copiesIn(newDeck, c.name) +
        (append && deckIsConstructed(d) ? copiesIn(d.maybeboard || [], c.name) : 0) >=
      copyLimit(c, d)
    ) {
      report.push({
        name: c.name,
        status: 'bad',
        msg: deckIsConstructed(d) ? 'Over the copy limit' : 'Duplicate',
      });
      return;
    }
    const copy = append ? playingDeckCopy(c, proxy) : c;
    newDeck.push(copy);
    if (append) appendedCards.push(copy);
    report.push({ name: c.name, status: 'ok', msg: 'Added' });
  });
  // Log the diff so the construction history reflects bulk edits too.
  {
    const oldNames = d.cards.map((c) => c.name),
      newNames = newDeck.map((c) => c.name);
    const removed = d.cards.filter((c) => !newNames.includes(c.name));
    const added = append ? appendedCards : newDeck.filter((c) => !oldNames.includes(c.name));
    if (removed.length + added.length > 40) {
      logDeckChange(d, {
        type: 'bulk',
        name: `Bulk edit: ${added.length} added, ${removed.length} removed`,
      });
    } else {
      removed.forEach((c) => logDeckChange(d, { type: 'remove', name: c.name, card: c }));
      added.forEach((c) => logDeckChange(d, { type: 'add', name: c.name, card: c }));
    }
    if (newCommander && (!d.admiral || d.admiral.name !== newCommander.name))
      logDeckChange(d, {
        type: 'admiral',
        name: newCommander.name,
        card: newCommander,
        prev: d.admiral || null,
      });
  }
  // The maybe section in the text IS the maybeboard now — Bulk Edit prints
  // it, so saving replaces it wholesale: deleting a line there removes the
  // card, exactly like the main list. Imports likewise: SIDEBOARD /
  // MAYBEBOARD sections land here.
  let newMaybe = append ? (d.maybeboard || []).slice() : [];
  const appendedMaybe = [];
  if (maybeNames.length) {
    const _mOff = allN - maybeNames.length;
    _resolving(_mOff);
    const mres = await resolveManyByName(
      maybeNames,
      (done) => {
        _resolving(_mOff + done);
        _pinFoot();
      },
      deckFormat(d),
    );
    const collected = append ? newMaybe : [];
    mres.forEach((r) => {
      if (r && r.found && r.card) {
        if (
          copiesIn(collected, r.card.name) +
            (append && deckIsConstructed(d) ? copiesIn(newDeck, r.card.name) : 0) <
          (deckIsConstructed(d) ? copyLimit(r.card, d) : allowsDuplicates(r.card) ? Infinity : 1)
        ) {
          const copy = append ? playingDeckCopy(r.card, proxy) : r.card;
          collected.push(copy);
          if (append) appendedMaybe.push(copy);
          report.push({ name: r.card.name, status: 'ok', msg: 'To ' + sideName(d) });
        } else report.push({ name: r.card.name, status: 'bad', msg: 'Over the copy limit' });
      } else {
        report.push({
          name: r && r.input ? r.input : '?',
          status: 'notfound',
          msg: 'Maybeboard: not found',
        });
      }
    });
    newMaybe = collected;
  }
  d.cards = newDeck;
  d.maybeboard = newMaybe;
  if (!append) {
    if (newCommander) d.admiral = newCommander;
    if (newPartner !== undefined) d.partner = newPartner;
    reconcilePartner(d);
  }
  if (append)
    ensurePlayingOwnership(d, appendedCards.concat(deckIsConstructed(d) ? appendedMaybe : []));
  scheduleSave(d);
  const added = report.filter((r) => r.status === 'ok').length;
  const retryable = report.filter((r) => r.status !== 'ok' && /network|try again/i.test(r.msg));
  const failures = report.length - added;
  if (!failures) {
    // Clean run: close the panel and land back on the decklist. A FULL render,
    // not just the body — the Main x/y dock lives in the page shell and was
    // painted when the deck held only its leader (the "1/100 until reopen" bug).
    state.dlPanel = null;
    toast(
      append
        ? `${added} cards added to ${d.name}.`
        : isImport
          ? `Deck imported — ${added} cards added.`
          : `Deck updated — ${added} cards.`,
    );
    render();
    _btLine('clean');
    return;
  }
  // Something needs attention: keep the panel open with the full report.
  refreshDecklistBox(d); // list, sections and the Main x/y dock all update NOW, not on reopen
  document.getElementById(reportElId).innerHTML =
    `<p class="hint" style="margin:10px 0 6px;"><strong>${added}/${report.length} resolved — ${failures} not added, listed below:</strong></p><div class="report-list">${report.map((r) => `<div class="report-row ${r.status}"><span>${r.name}</span><span>${r.msg}</span></div>`).join('')}</div>${retryable.length ? `<button class="ghost-btn" id="retryFailedBtn" style="width:100%;margin-top:10px;">↻ Retry ${retryable.length} failed card${retryable.length > 1 ? 's' : ''}</button>` : ''}`;
  toast(isImport ? 'Deck imported.' : 'Deck updated.');
  const box = document.getElementById('decklistBox');
  if (box) {
    box.innerHTML = categorizedListHtml(d);
    wireDecklistInteractions(d);
  }
  updateDeckMeter(d);
  document.getElementById('retryFailedBtn')?.addEventListener('click', () =>
    retryFailedCards(
      d,
      retryable.map((r) => r.name),
      reportElId,
      newCommander,
      { append, proxy },
    ),
  );
  _pinFoot();
  _btLine('report');
}

async function retryFailedCards(
  d,
  names,
  reportElId,
  admiralForColorCheck,
  { append = false, proxy = false } = {},
) {
  document.getElementById(reportElId).innerHTML = /* HTML */ `<div class="status">
    <div class="spinner"></div>
    Retrying ${names.length} card${names.length > 1 ? 's' : ''}…
  </div>`;
  const results = await runLimited(names, resolveCardByName, 2);
  const report = [];
  const appendedCards = [];
  results.forEach((r) => {
    if (!r || !r.found) {
      report.push({
        name: r ? r.input : '?',
        status: 'notfound',
        msg: r && r.networkIssue ? "Still couldn't verify — try again later" : 'Not found',
      });
      return;
    }
    const c = r.card;
    if (r.verifyFailed) {
      report.push({
        name: c.name,
        status: 'notfound',
        msg: "Still couldn't verify — try again later",
      });
      return;
    }
    if (!r.legalPrint) {
      report.push({ name: c.name, status: 'bad', msg: 'Never in a legal set' });
      return;
    }
    {
      const why = deckBlockReason(c, d);
      if (why) {
        report.push({ name: c.name, status: 'bad', msg: why });
        return;
      }
    }
    if (d.admiral && !colorIdentityOkDeck(c, d)) {
      report.push({ name: c.name, status: 'bad', msg: 'Off-color' });
      return;
    }
    if (deckLeaders(d).some((L) => L.name === c.name)) {
      report.push({ name: c.name, status: 'ok', msg: 'Kept as ' + fmtName(d) });
      return;
    }
    if (atCopyLimit(d, c)) {
      report.push({
        name: c.name,
        status: 'bad',
        msg: deckIsConstructed(d) ? 'Over the copy limit' : 'Duplicate',
      });
      return;
    }
    const copy = append ? playingDeckCopy(c, proxy) : c;
    d.cards.push(copy);
    if (append) appendedCards.push(copy);
    logDeckChange(d, { type: 'add', name: c.name, card: c });
    report.push({ name: c.name, status: 'ok', msg: 'Added' });
  });
  if (append) ensurePlayingOwnership(d, appendedCards);
  scheduleSave(d);
  const added = report.filter((r) => r.status === 'ok').length;
  const stillRetryable = report.filter(
    (r) => r.status !== 'ok' && /network|try again/i.test(r.msg),
  );
  document.getElementById(reportElId).innerHTML =
    `<p class="hint" style="margin:10px 0 6px;">${added}/${report.length} resolved on retry. Anything not listed here was already settled in the first report — including duplicate or off-color rejections.</p><div class="report-list">${report.map((r) => `<div class="report-row ${r.status}"><span>${r.name}</span><span>${r.msg}</span></div>`).join('')}</div>${stillRetryable.length ? `<button class="ghost-btn" id="retryFailedBtn" style="width:100%;margin-top:10px;">↻ Retry ${stillRetryable.length} failed card${stillRetryable.length > 1 ? 's' : ''}</button>` : ''}`;
  toast(`${added} more card${added !== 1 ? 's' : ''} added.`);
  const box = document.getElementById('decklistBox');
  if (box) {
    box.innerHTML = categorizedListHtml(d);
    wireDecklistInteractions(d);
  }
  updateDeckMeter(d);
  document.getElementById('retryFailedBtn')?.addEventListener('click', () =>
    retryFailedCards(
      d,
      stillRetryable.map((r) => r.name),
      reportElId,
      admiralForColorCheck,
      { append, proxy },
    ),
  );
}
