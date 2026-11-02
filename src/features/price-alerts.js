// features / price-alerts

/* ================= PRICE ALERTS (Wants) — Deckhand 1.2 =================
   A limit per wanted card: "tell me when it drops under EUR 15". The price
   is the cheapest paper printing -- the daily price file. The Android app
   (APK 4.2) checks once a day and notifies; in the browser the app tells
   you when it opens. A card you own drops out by itself. */
const PW_KEY = LS_PREFIX + 'priceWatch';

function pwAll() {
  if (!state._pw) {
    try {
      const o = JSON.parse(localStorage.getItem(PW_KEY) || '{}');
      state._pw = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (e) {
      state._pw = {};
    }
  }
  return state._pw;
}

function pwSave() {
  try {
    localStorage.setItem(PW_KEY, JSON.stringify(pwAll()));
  } catch (e) {}
  pwTellNative();
}

// The live list: watched cards you do not own yet.
function pwActive() {
  const w = pwAll(),
    owned = ownedNames();
  return Object.keys(w).filter((n) => !owned.has(n) && w[n] && typeof w[n].max === 'number');
}

function pwTellNative() {
  try {
    const n = window.DeckhandNotify;
    if (n && typeof n.setPriceWatch === 'function') {
      const w = pwAll();
      n.setPriceWatch(JSON.stringify(pwActive().map((k) => ({ n: k, max: w[k].max }))));
    }
  } catch (e) {}
}

function pwNow(name) {
  try {
    const v = bulkEurFor(name);
    if (typeof v === 'number' && isFinite(v)) return v;
  } catch (e) {}
  const h = state.priceCache && state.priceCache[name];
  return h && typeof h.v === 'number' ? h.v : null;
}

function pwHit(name) {
  const w = pwAll()[name];
  if (!w) return false;
  const v = pwNow(name);
  return v != null && v <= w.max;
}

function pwEur(v) {
  return '€' + v.toFixed(2);
}

// The little pill on a Wants tile: a bell to set one, the limit once set,
// green with today's price when it is under.
function pwPillHtml(name) {
  const w = pwAll()[name];
  const nm = escapeHtml(name);
  if (!w)
    return /* HTML */ `<button
      type="button"
      class="want-bell"
      data-wantbell="${nm}"
      aria-label="${'Price alert'}"
    >
      ${ICONS.bell}
    </button>`;
  if (pwHit(name))
    return /* HTML */ `<button type="button" class="want-bell on hit" data-wantbell="${nm}">
      ✓ ${pwEur(pwNow(name))}
    </button>`;
  return /* HTML */ `<button type="button" class="want-bell on" data-wantbell="${nm}">
    ${ICONS.bell}${pwEur(w.max)}
  </button>`;
}

function openPriceWatchSheet(name) {
  const w = pwAll()[name],
    now = pwNow(name);
  document.getElementById('pwSheet')?.remove();
  const start = w ? w.max : now != null ? Math.max(0.1, Math.floor(now * 0.8 * 10) / 10) : 5;
  const el = document.createElement('div');
  el.className = 'deckpick-scrim';
  el.id = 'pwSheet';
  el.style.zIndex = 205;
  el.style.alignItems = 'flex-end';
  // column-reverse sheet: Save at the foot.
  el.innerHTML = /* HTML */ `<div class="deckpick br-sheet pw-sheet">
    <div class="br-actions">
      <button type="button" class="primary-btn" id="pwSave">${'Save'}</button>
      ${w ? `<button type="button" class="ghost-btn" id="pwOff">${'Alert off'}</button>` : ''}
    </div>
    <div class="pw-hint">
      ${'The Android app notifies you as soon as the cheapest paper printing drops under it (checked once a day). In the browser you see it when you open the app.'}
    </div>
    ${now != null ? `<div class="br-chips pw-chips">${[10, 20, 30].map((p) => `<button type="button" class="chip br-chip" data-pwpct="${p}">−${p}%</button>`).join('')}</div>` : ''}
    <label class="pw-row"
      ><span>${'Alert under'}</span><span class="pw-eur">€</span
      ><input
        id="pwMax"
        type="number"
        inputmode="decimal"
        min="0.01"
        step="0.01"
        value="${start.toFixed(2)}"
    /></label>
    <div class="br-title">
      <b>${inlIco('bell', 16)}${'Price alert'}</b
      ><span>${escapeHtml(name)}${now != null ? ` — ${'now'} ${pwEur(now)}` : ''}</span>
    </div>
  </div>`;
  let after = null;
  brSheetOpen(el, 'pwSheet', () => {
    if (after) {
      const f = after;
      after = null;
      setTimeout(f, 0);
    }
  });
  const close = () => brSheetClose('pwSheet');
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  el.querySelectorAll('[data-pwpct]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = Math.max(0.01, Math.round(now * (100 - +b.dataset.pwpct)) / 100);
      el.querySelector('#pwMax').value = v.toFixed(2);
    }),
  );
  el.querySelector('#pwSave').addEventListener('click', () => {
    const v = parseFloat(String(el.querySelector('#pwMax').value).replace(',', '.'));
    if (!(v > 0)) {
      toast('Enter a price.');
      return;
    }
    try {
      document.activeElement && document.activeElement.blur();
    } catch (e) {}
    pwAll()[name] = { max: Math.round(v * 100) / 100, t: Date.now() };
    pwSave();
    after = () => {
      render();
      toast(`Alert set: ${name} under ${pwEur(v)}.`);
    };
    close();
  });
  el.querySelector('#pwOff')?.addEventListener('click', () => {
    delete pwAll()[name];
    pwSave();
    after = () => render();
    close();
  });
}

/* When the app opens: wanted cards that dropped under their limit, told once
   until they climb back over it. */
function pwStartupCheck() {
  try {
    const w = pwAll(),
      hits = [];
    let changed = false;
    pwActive().forEach((n) => {
      const hit = pwHit(n);
      if (hit && !w[n].told) {
        hits.push(n);
        w[n].told = true;
        changed = true;
      }
      if (!hit && w[n].told) {
        w[n].told = false;
        changed = true;
      }
    });
    if (changed)
      try {
        localStorage.setItem(PW_KEY, JSON.stringify(w));
      } catch (e) {}
    pwTellNative();
    if (!hits.length) return;

    const list =
      hits
        .slice(0, 3)
        .map((n) => `${n} ${pwEur(pwNow(n))}`)
        .join(', ') + (hits.length > 3 ? ` and ${hits.length - 3} more` : '');
    toast(
      (hits.length === 1
        ? 'A wanted card is under your limit: '
        : `${hits.length} wanted cards are under your limit: `) + list,
    );
  } catch (e) {}
}
