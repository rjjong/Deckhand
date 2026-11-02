// ui / price-slider

/* ---- Price range slider (Collection filter + Search filters) ----
   Stops are hand-picked card-price milestones rather than a linear scale, so
   the interesting €0–€10 stretch gets most of the travel. The final stop is
   null = no upper limit (shown as ∞). */
const PRICE_STOPS = [
  0,
  0.25,
  0.5,
  0.75,
  1,
  1.5,
  2,
  2.5,
  3,
  4,
  5,
  7.5,
  10,
  12.5,
  15,
  20,
  25,
  30,
  40,
  50,
  75,
  100,
  150,
  200,
  300,
  500,
  null,
];

function priceStopIdx(v) {
  if (v == null) return PRICE_STOPS.length - 1;
  let best = 0,
    bd = Infinity;
  PRICE_STOPS.forEach((p, i) => {
    if (p == null) return;
    const d = Math.abs(p - v);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function priceStopLabel(i) {
  const v = PRICE_STOPS[i];
  if (v == null) return '\u221E';
  return '\u20AC' + (v >= 10 ? String(Math.round(v)) : (Math.round(v * 100) / 100).toString());
}

function priceSliderHtml(pid, minV, maxV) {
  const N = PRICE_STOPS.length - 1;
  const mi = Math.min(priceStopIdx(minV || 0), N),
    ma = priceStopIdx(maxV);
  return /* HTML */ `<div class="pr-slider" id="${pid}">
    <div class="pr-vals">
      <span data-prlab-min>${priceStopLabel(mi)}</span
      ><span data-prlab-max>${priceStopLabel(ma)}</span>
    </div>
    <div class="pr-track">
      <div class="pr-rail"></div>
      <div class="pr-fill"></div>
      <input
        type="range"
        min="0"
        max="${N}"
        step="1"
        value="${mi}"
        data-prlo
        aria-label="Minimum price"
      />
      <input
        type="range"
        min="0"
        max="${N}"
        step="1"
        value="${ma}"
        data-prhi
        aria-label="Maximum price"
      />
    </div>
  </div>`;
}

function wirePriceSlider(pid, onCommit) {
  const box = document.getElementById(pid);
  if (!box || box.dataset.wired) return;
  box.dataset.wired = '1';
  const lo = box.querySelector('[data-prlo]'),
    hi = box.querySelector('[data-prhi]');
  const labLo = box.querySelector('[data-prlab-min]'),
    labHi = box.querySelector('[data-prlab-max]');
  const fill = box.querySelector('.pr-fill');
  const N = PRICE_STOPS.length - 1;
  const paint = () => {
    let a = +lo.value,
      b = +hi.value;
    labLo.textContent = priceStopLabel(a);
    labHi.textContent = priceStopLabel(b);
    fill.style.left = (a / N) * 100 + '%';
    fill.style.width = ((b - a) / N) * 100 + '%';
    // Both thumbs parked on the same edge: put the one that can still move on top.
    lo.style.zIndex = a === N || (a === b && a > N / 2) ? 5 : 3;
    hi.style.zIndex = 4;
  };
  const clamp = (which) => {
    if (+lo.value > +hi.value) {
      if (which === 'lo') hi.value = lo.value;
      else lo.value = hi.value;
    }
  };
  lo.addEventListener('input', () => {
    clamp('lo');
    paint();
  });
  hi.addEventListener('input', () => {
    clamp('hi');
    paint();
  });
  const commit = () => {
    onCommit(PRICE_STOPS[+lo.value] || 0, PRICE_STOPS[+hi.value]);
  };
  lo.addEventListener('change', commit);
  hi.addEventListener('change', commit);
  paint();
}
