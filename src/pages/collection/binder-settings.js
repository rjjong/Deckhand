// Collection binder settings: a full-screen editor with a scrollable body.
function openBinderRules(b, isNew) {
  if (document.getElementById('binderRulesSheet')) return;
  const r = JSON.parse(JSON.stringify(b.rules || {}));
  r.rarity = r.rarity || [];
  r.color = r.color || [];
  r.type = r.type || [];
  r.finish = r.finish || [];
  if (r.color.indexOf('multi') >= 0)
    r.color = BR_COLORS.filter(
      (c) => c !== 'multi' && (r.color.indexOf(c) >= 0 || /^[2-5]c$/.test(c)),
    );
  const glyphs = Array.isArray(b.glyphs) ? b.glyphs.slice() : [];
  const el = document.createElement('div');
  el.className = 'overlay binder-settings-screen';
  el.id = 'binderRulesSheet';
  const trigger = document.activeElement;
  const parent = document.querySelector('.app');
  const wasInert = parent?.inert;
  const CL = {
    C: 'Colorless',
    '2c': '2 colors',
    '3c': '3 colors',
    '4c': '4 colors',
    '5c': '5 colors',
    multi: 'Multicolor',
  };
  const chip = (kind, v, label) =>
    `<button type="button" class="chip br-chip${r[kind].indexOf(v) >= 0 ? ' active' : ''}" data-brk="${kind}" data-brv="${v}">${label}</button>`;
  const pr = r.price || { min: 0, max: 5 };
  const view = binderView(b),
    VL = brViewLabels(view);
  const dd = (id, kind, vals) => `<div class="cselect br-dd" id="${id}">
      <div class="cselect-panel br-dd-panel" hidden>${vals.map((v) => `<button type="button" class="cselect-opt${view[kind] === v ? ' sel' : ''}" data-brdd="${kind}" data-v="${v}">${VL[kind][v]}</button>`).join('')}</div>
      <button type="button" class="cselect-btn br-dd-btn" aria-label="${kind === 'sort' ? 'Sort binder by' : 'Group binder by'}" aria-expanded="false"><span class="cs-label">${VL[kind][view[kind]]}</span><span class="cs-car">▾</span></button>
    </div>`;
  el.innerHTML = /* HTML */ `<section
    class="overlay-inner br-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="binderSettingsTitle"
  >
    ${appTitlebarHtml('binder-settings-header', `<button type="button" class="header-filter" id="brBack" aria-label="Back to binder">${ICONS.back}</button><h1 class="brand-txt" id="binderSettingsTitle">Binder settings</h1><span aria-hidden="true"></span>`)}
    <main class="binder-settings-body">
      ${toolPanelHeadingHtml(ICONS.binder, escapeHtml(b.name), 'Choose the binder layout, tile icons and optional auto-fill rules.')}
      <section class="binder-settings-card" aria-labelledby="brIconsTitle">
        <h2 id="brIconsTitle">Tile icons</h2>
        <div class="br-chips">
          ${BR_GLYPHS.map((k) => `<button type="button" class="chip br-chip br-gl${glyphs.indexOf(k) >= 0 ? ' active' : ''}" data-brg="${k}" aria-label="${k}" aria-pressed="${glyphs.includes(k)}">${brGlyphHtml(k, 20)}</button>`).join('')}
        </div>
      </section>
      <section class="binder-settings-card" aria-labelledby="brLayoutTitle">
        <h2 id="brLayoutTitle">Layout</h2>
        <div class="br-sec">
          <div class="br-h">Group by</div>
          ${dd('brGroup', 'group', BR_GROUPS)}
        </div>
        <div class="br-sec">
          <div class="br-h">Sort by</div>
          ${dd('brSort', 'sort', BR_SORTS)}
        </div>
      </section>
      <section class="binder-settings-card" aria-labelledby="brAutoTitle">
        <h2 id="brAutoTitle">Auto-fill</h2>
        <p>
          New cards that match these rules go into this binder automatically. Within a row, any
          choice matches; across rows, all must match.
        </p>
        <div class="br-sec">
          <div class="br-h">Rarity</div>
          <div class="br-chips">
            ${BR_RARITIES.map((v) => chip('rarity', v, v[0].toUpperCase() + v.slice(1))).join('')}
          </div>
        </div>
        <div class="br-sec">
          <div class="br-h">Color</div>
          <div class="br-chips">
            ${BR_COLORS.map((c) => chip('color', c, 'WUBRG'.indexOf(c) >= 0 ? manaIconSvg(c, 20) : c === 'C' ? manaIconSvg('C', 20) + ' ' + CL.C : CL[c])).join('')}
          </div>
        </div>
        <div class="br-sec">
          <div class="br-h">Card type</div>
          <div class="br-chips">${BR_TYPES.map((t) => chip('type', t, t)).join('')}</div>
        </div>
        <div class="br-sec">
          <div class="br-h">Finish</div>
          <div class="br-chips">
            ${chip('finish', 'foil', '✨ Foil')}${chip('finish', 'nonfoil', 'Non-foil')}
          </div>
        </div>
        <div class="br-sec">
          <div class="br-h">
            <label class="br-pt"
              ><input type="checkbox" id="brPriceOn" ${r.price ? ' checked' : ''} />Price per
              card</label
            ><span id="brPriceLab">${brPriceLabel(pr)}</span>
          </div>
          <div id="brPriceBox" ${r.price ? '' : ' hidden'}>
            ${priceSliderHtml('brPr', pr.min || 0, pr.max)}
          </div>
        </div>
        <div class="br-err" id="brErr" role="alert" hidden></div>
      </section>
    </main>
    <footer class="br-actions">
      <button type="button" class="ghost-btn" id="brNone">
        ${isNew ? 'Skip for now' : 'Clear rules'}
      </button>
      <button type="button" class="primary-btn" id="brSave">Save</button>
    </footer>
  </section>`;
  let afterClose = null;
  document.body.appendChild(el);
  if (parent) parent.inert = true;
  pushOverlay('binderRulesSheet', () => {
    if (parent?.isConnected) parent.inert = wasInert;
    el.inert = true;
    const finish = () => {
      el.remove();
      if (afterClose) afterClose();
      else if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else {
      el.classList.add('leaving');
      setTimeout(finish, 240);
    }
  });
  const close = () => brSheetClose('binderRulesSheet');
  wireAppDialogKeys(el, close);
  el.querySelector('#brBack').addEventListener('click', close);
  el.querySelector('#brBack').focus({ preventScroll: true });
  el.querySelectorAll('[data-brg]').forEach((c) =>
    c.addEventListener('click', () => {
      const k = c.dataset.brg,
        i = glyphs.indexOf(k);
      if (i >= 0) glyphs.splice(i, 1);
      else glyphs.push(k);
      c.classList.toggle('active', i < 0);
      c.setAttribute('aria-pressed', String(i < 0));
    }),
  );
  const keepGlyphs = () => {
    b.glyphs = BR_GLYPHS.filter((k) => glyphs.indexOf(k) >= 0);
    b.view = { group: view.group, sort: view.sort, sortDir: view.sortDir };
  };
  el.querySelectorAll('.br-dd').forEach((box) => {
    const panel = box.querySelector('.br-dd-panel'),
      btn = box.querySelector('.br-dd-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      el.querySelectorAll('.br-dd-panel').forEach((pn) => {
        if (pn !== panel) {
          pn.hidden = true;
          pn.parentElement.querySelector('.br-dd-btn').setAttribute('aria-expanded', 'false');
        }
      });
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
    });
    panel.querySelectorAll('[data-brdd]').forEach((o) =>
      o.addEventListener('click', (e) => {
        e.stopPropagation();
        const kind = o.dataset.brdd;
        if (kind === 'sort' && view.sort !== o.dataset.v)
          view.sortDir = o.dataset.v === 'price' ? 'desc' : 'asc';
        view[kind] = o.dataset.v;
        panel.querySelectorAll('[data-brdd]').forEach((x) => x.classList.toggle('sel', x === o));
        btn.querySelector('.cs-label').textContent = brViewLabels(view)[kind][view[kind]];
        btn.setAttribute('aria-expanded', 'false');
        panel.hidden = true;
      }),
    );
  });
  el.querySelector('.br-sheet').addEventListener('click', () =>
    el.querySelectorAll('.br-dd-panel').forEach((pn) => {
      pn.hidden = true;
      pn.parentElement.querySelector('.br-dd-btn').setAttribute('aria-expanded', 'false');
    }),
  );
  const err = el.querySelector('#brErr');
  const showErr = (m) => {
    err.textContent = m || '';
    err.hidden = !m;
  };
  const check = () => {
    const rr = {
      rarity: r.rarity,
      color: r.color,
      type: r.type,
      finish: r.finish,
      price: el.querySelector('#brPriceOn').checked ? pr : null,
    };
    const clash = binderPriceClash(rr, b.id, state.collection.binders);
    showErr(
      clash
        ? `Price overlaps "${clash.name}" (${brPriceLabel(clash.rules.price)}). Pick a range outside it.`
        : '',
    );
    return !clash;
  };
  el.querySelectorAll('[data-brk]').forEach((c) =>
    c.addEventListener('click', () => {
      const a = r[c.dataset.brk],
        v = c.dataset.brv,
        i = a.indexOf(v);
      if (i >= 0) a.splice(i, 1);
      else a.push(v);
      c.classList.toggle('active', i < 0);
      check();
    }),
  );
  el.querySelector('#brPriceOn').addEventListener('change', (e) => {
    el.querySelector('#brPriceBox').hidden = !e.target.checked;
    check();
  });
  wirePriceSlider('brPr', (mn, mx) => {
    pr.min = mn || 0;
    pr.max = mx;
    el.querySelector('#brPriceLab').textContent = brPriceLabel(pr);
    check();
  });
  el.querySelector('#brNone').addEventListener('click', () => {
    delete b.rules;
    keepGlyphs();
    saveCollection();
    afterClose = () => render();
    close();
  });
  el.querySelector('#brSave').addEventListener('click', () => {
    if (!check()) {
      err.scrollIntoView({ block: 'nearest' });
      return;
    }
    keepGlyphs();
    const rules = {
      rarity: r.rarity.slice(),
      color: r.color.slice(),
      type: r.type.slice(),
      finish: r.finish.slice(),
    };
    if (el.querySelector('#brPriceOn').checked)
      rules.price = { min: pr.min || 0, max: pr.max == null ? null : pr.max };
    if (binderHasRules({ rules })) b.rules = rules;
    else delete b.rules;
    saveCollection();
    afterClose = () => {
      render();
      binderApplyRules(b);
    };
    close();
  });
  check();
}
