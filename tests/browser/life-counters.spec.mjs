import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { auditContrast } from './helpers/contrast.mjs';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Life', exact: true })
    .click();
  await page.evaluate(() => {
    localStorage.setItem(LS_PREFIX + 'lifeFmt', 'commander');
    state.guild = 'dimir';
    applyTheme();
    Object.assign(state.life, { count: 2, layout: '2f', rotate: false, setupDone: true });
    openLifeOverlay();
  });
});

const player = (page, idx = 0) => page.locator(`.life-card-v2[data-idx="${idx}"]`);

async function openPicker(page) {
  await player(page).locator('.lbadge').click();
  await player(page).getByRole('button', { name: 'Player counters', exact: true }).click();
  return player(page).getByRole('dialog', { name: 'Player counters', exact: true });
}

async function holdCounter(page, locator, info) {
  if (info.project.name === 'mobile') {
    const client = await page.context().newCDPSession(page);
    const r = await locator.boundingBox();
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }],
    });
    await expect(locator.locator('b')).toHaveText('0');
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
  } else {
    await locator.hover();
    await page.mouse.down();
    await expect(locator.locator('b')).toHaveText('0');
    await page.mouse.up();
  }
  await expect(locator.locator('b')).toHaveText('0');
}

test('symbol picker toggles multiple counters and mana colors; chips tap up and hold to reset', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const picker = await openPicker(page);
  expect(
    await picker
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label'))),
  ).toEqual(['Commander tax', 'Mana', 'Storm counter', 'Energy', 'Experience']);
  await expect(picker.getByRole('button', { name: 'Commander tax', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const name of ['Storm counter', 'Energy', 'Experience'])
    await picker.getByRole('button', { name, exact: true }).click();
  await picker.getByRole('button', { name: 'Mana', exact: true }).click();
  const mana = player(page).getByRole('dialog', { name: 'Mana colors', exact: true });
  await expect(mana.getByRole('button')).toHaveCount(7);
  await expect(mana.getByRole('button').first()).toHaveAccessibleName('Back to counters');
  for (const name of ['Blue mana', 'Red mana'])
    await mana.getByRole('button', { name, exact: true }).click();
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/life-mana-picker-${info.project.name}.png` });
  await mana.getByRole('button', { name: 'Back to counters', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Energy', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await player(page).locator('.done').click();
  await expect(player(page).locator('.life-counter-picker')).toHaveCount(0);
  await expect(player(page).locator('.life-counter-chip')).toHaveCount(6);
  await expect(player(page, 1).locator('.life-counter-chip')).toHaveCount(1);
  const energy = player(page).locator('[data-life-counter="energy"]');
  await energy.scrollIntoViewIfNeeded();
  if (info.project.name === 'mobile') await energy.tap();
  else await energy.click();
  await expect(energy.locator('b')).toHaveText('1');
  await holdCounter(page, energy, info);
  const tax = player(page).locator('[data-life-counter="commander"]');
  await tax.click();
  await tax.click();
  await expect(tax.locator('b')).toHaveText('4');
  await holdCounter(page, tax, info);
  const blue = player(page).locator('[data-life-counter="manaU"]');
  await blue.click();
  await expect(blue.locator('b')).toHaveText('1');
  expect(
    await page.evaluate(() => [ensureLifePlayers()[0].life, ensureLifePlayers()[0].poison]),
  ).toEqual([40, 0]);
  expect(errors).toEqual([]);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/life-counter-row-${info.project.name}.png` });
});

test('counter colors, amounts and visibility survive saved games; new games start clean', async ({
  page,
}) => {
  const picker = await openPicker(page);
  await picker.getByRole('button', { name: 'Mana', exact: true }).click();
  await player(page).getByRole('button', { name: 'White mana', exact: true }).click();
  await player(page).getByRole('button', { name: 'Colorless mana', exact: true }).click();
  await player(page).locator('.done').click();
  await player(page).locator('[data-life-counter="manaW"]').click();
  await player(page).locator('[data-life-counter="commander"]').click();
  await openPicker(page);
  await player(page).getByRole('button', { name: 'Mana', exact: true }).click();
  await player(page).getByRole('button', { name: 'White mana', exact: true }).click();
  await player(page).locator('.done').click();
  await expect
    .poll(() => page.evaluate(() => lifeSavesAll()[0]?.d.players[0].counters.manaW.value))
    .toBe(1);
  await page.reload();
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Life', exact: true })
    .click();
  await page.locator('#lifeSavedGames').click();
  await page.locator('[data-lr="0"]').click();
  await expect(player(page).locator('[data-life-counter="manaW"]')).toHaveCount(0);
  await expect(player(page).locator('[data-life-counter="manaC"] b')).toHaveText('0');
  await expect(player(page).locator('[data-life-counter="commander"] b')).toHaveText('2');
  const restoredPicker = await openPicker(page);
  await restoredPicker.getByRole('button', { name: 'Mana', exact: true }).click();
  await player(page).getByRole('button', { name: 'White mana', exact: true }).click();
  await player(page).locator('.done').click();
  await expect(player(page).locator('[data-life-counter="manaW"] b')).toHaveText('1');
  await page.locator('#lifeCogBtn').click();
  await page.locator('#mTools').click();
  await page.locator('#restartLifeBtn').click();
  await page.locator('#iacOk').click();
  await page.locator('[data-lifefmt="constructed"]').click();
  await page.locator('#startGameBtn').click();
  await expect(page.locator('.life-counter-chip')).toHaveCount(0);
});

test('counter rows scroll instead of wrapping and Done stays centered in rotated and narrow player panels', async ({
  page,
}, info) => {
  await page.evaluate(() => {
    const p = ensureLifePlayers()[0];
    p.monarch = p.initiative = true;
    p.dg = { id: 'uc', room: 'Secret Entrance' };
    p.name = 'A player with a long name';
    Object.values(p.counters).forEach((counter) => {
      counter.enabled = true;
      counter.value = 12;
    });
  });
  for (const size of [page.viewportSize(), { width: 320, height: 640 }]) {
    await page.setViewportSize(size);
    for (const layout of ['2f', '3t', '4q', '4m', '5q', '6q', '6e', '6m', '7q', '7m', '8q', '8e']) {
      await page.evaluate((id) => {
        const l = LIFE_LAYOUTS.find((item) => item.id === id);
        Object.assign(state.life, { layout: id, count: l.count, rotate: true });
        renderLifeGrid();
      }, layout);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const normal = await player(page).evaluate((card) => {
        const row = card.querySelector('.life-extra-counters');
        const footer = card.querySelector('.life-player-footer');
        return {
          footerOverflow: footer.scrollWidth > footer.clientWidth + 1,
          counterOverflow: row.scrollWidth > row.clientWidth + 1,
          rowHeight: row.clientHeight,
          chipHeight: row.firstElementChild.offsetHeight,
          nameWidth: card.querySelector('.pname-input').clientWidth,
          nameOffset: (() => {
            const n = card.querySelector('.pname-input').getBoundingClientRect();
            const r = card.getBoundingClientRect();
            const rad = (Number(card.dataset.rot) * Math.PI) / 180;
            return (
              (n.x + n.width / 2 - r.x - r.width / 2) * Math.cos(rad) +
              (n.y + n.height / 2 - r.y - r.height / 2) * Math.sin(rad)
            );
          })(),
        };
      });
      expect(normal.footerOverflow, `${layout} ${size.width}`).toBe(false);
      expect(
        Math.abs(normal.nameOffset),
        `${layout} ${size.width} player name center`,
      ).toBeLessThanOrEqual(1);
      expect(normal.rowHeight).toBeLessThanOrEqual(normal.chipHeight + 5);
      await player(page).locator('.lbadge').click();
      const geometry = await player(page).evaluate((card) => {
        const done = card.querySelector('.done');
        const bar = card.querySelector('.lf-extras');
        const tools = [...bar.querySelectorAll('button')];
        const r = done.getBoundingClientRect();
        return {
          center:
            done.offsetLeft +
            done.offsetWidth / 2 +
            new DOMMatrix(getComputedStyle(done).transform).m41,
          expectedCenter: bar.clientWidth / 2,
          doneBottom: done.offsetTop + done.offsetHeight,
          barHeight: bar.clientHeight,
          visible:
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.done') ===
            done,
          overlap: tools.some((a, i) =>
            tools.slice(i + 1).some((b) => {
              const ar = a.getBoundingClientRect(),
                br = b.getBoundingClientRect();
              return (
                ar.left < br.right - 1 &&
                ar.right > br.left + 1 &&
                ar.top < br.bottom - 1 &&
                ar.bottom > br.top + 1
              );
            }),
          ),
        };
      });
      expect(
        Math.abs(geometry.center - geometry.expectedCenter),
        `${layout} ${size.width}`,
      ).toBeLessThanOrEqual(1);
      expect(geometry.doneBottom).toBeCloseTo(geometry.barHeight, 0);
      expect(geometry.visible, `${layout} ${size.width} Done is clipped`).toBe(true);
      expect(geometry.overlap, `${layout} ${size.width} controls overlap`).toBe(false);
      await player(page).locator('.done').click();
    }
  }
  await page.evaluate(() => {
    Object.assign(state.life, { layout: '4q', count: 4, rotate: true });
    renderLifeGrid();
  });
  await player(page, 1).locator('.lbadge').click();
  await player(page, 1).getByRole('button', { name: 'Player counters', exact: true }).click();
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/life-player-options-${info.project.name}.png` });
});

test('dragging the counter strip scrolls without incrementing or resetting and keeps its scroll position', async ({
  page,
}, info) => {
  await page.evaluate(() => {
    Object.values(ensureLifePlayers()[0].counters).forEach((counter) => {
      counter.enabled = true;
      counter.value = 3;
    });
    renderLifeGrid();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const row = player(page).locator('.life-extra-counters');
  await expect.poll(() => row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const before = await page.evaluate(() => JSON.stringify(ensureLifePlayers()[0].counters));
  if (info.project.name === 'mobile') {
    const client = await page.context().newCDPSession(page);
    const r = await row.boundingBox();
    const x = r.x + r.width - 10,
      y = r.y + r.height / 2;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 5; i++)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x - i * 25, y }],
      });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
  } else {
    await row.hover();
    await page.mouse.wheel(180, 0);
  }
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(10);
  expect(await page.evaluate(() => JSON.stringify(ensureLifePlayers()[0].counters))).toBe(before);
  await row.locator('[data-life-counter="manaC"]').click();
  await expect(row.locator('[data-life-counter="manaC"] b')).toHaveText('4');
  expect(await row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(10);
  await page.evaluate(() => renderLifeGrid());
  expect(await row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(10);
  expect(await page.evaluate(() => ensureLifePlayers()[0].life)).toBe(40);
});

test('symbol pickers stay within the player panel and readable in every theme', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => {
    Object.assign(state.life, { count: 4, layout: '4q', rotate: true });
    renderLifeGrid();
  });
  await openPicker(page);
  for (const theme of ['dark', 'light'])
    for (const guild of [
      'azorius',
      'dimir',
      'rakdos',
      'gruul',
      'selesnya',
      'orzhov',
      'izzet',
      'golgari',
      'boros',
      'simic',
    ]) {
      await page.evaluate(
        ({ theme, guild }) => {
          state.theme = theme;
          state.guild = guild;
          applyTheme();
        },
        { theme, guild },
      );
      const samples = await auditContrast(page, '.life-counter-picker');
      expect(
        samples.filter((sample) => sample.ratio < sample.minimum),
        `${theme} ${guild}`,
      ).toEqual([]);
      const bounds = await player(page).locator('.life-counter-picker').boundingBox();
      const card = await player(page).boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(card.x);
      expect(bounds.y).toBeGreaterThanOrEqual(card.y);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(card.x + card.width + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(card.y + card.height + 1);
    }
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/life-counter-picker-${info.project.name}.png` });
});

test('counter strips drag in every player orientation without changing counters or life', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'mobile',
    'Native touch input is exercised on the phone project.',
  );
  const client = await page.context().newCDPSession(page);
  try {
    for (const { layout, idx, rotation } of [
      { layout: '4q', idx: 0, rotation: 90 },
      { layout: '4q', idx: 1, rotation: 270 },
      { layout: '2f', idx: 0, rotation: 180 },
      { layout: '2f', idx: 1, rotation: 0 },
    ]) {
      await page.evaluate((layout) => {
        const l = LIFE_LAYOUTS.find((item) => item.id === layout);
        Object.assign(state.life, { layout, count: l.count, rotate: true });
        for (const p of ensureLifePlayers())
          for (const counter of Object.values(p.counters)) {
            counter.enabled = true;
            counter.value = 3;
          }
        renderLifeGrid();
      }, layout);
      const row = player(page, idx).locator('.life-extra-counters');
      const before = await page.evaluate(() =>
        JSON.stringify(
          ensureLifePlayers().map((p) => ({
            life: p.life,
            poison: p.poison,
            counters: p.counters,
          })),
        ),
      );
      await expect
        .poll(() => row.evaluate((el) => el.scrollWidth - el.clientWidth))
        .toBeGreaterThan(30);
      const r = await row.boundingBox();
      const rad = (rotation * Math.PI) / 180,
        dx = Math.cos(rad),
        dy = Math.sin(rad);
      const offset = await row.evaluate((el) => Math.max(0, el.clientWidth / 2 - 14));
      const x = r.x + r.width / 2 + dx * offset,
        y = r.y + r.height / 2 + dy * offset;
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 6; step++)
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x - dx * step * 14, y: y - dy * step * 14 }],
        });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect
        .poll(() => row.evaluate((el) => el.scrollLeft), `${rotation} degree drag`)
        .toBeGreaterThan(20);
      expect(
        await page.evaluate(() =>
          JSON.stringify(
            ensureLifePlayers().map((p) => ({
              life: p.life,
              poison: p.poison,
              counters: p.counters,
            })),
          ),
        ),
      ).toBe(before);
    }
  } finally {
    await client.detach();
  }
});

test('reference layout has a large centered Done, large side buttons, a right-corner hash and a centered player name', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    Object.assign(state.life, { count: 4, layout: '4q', rotate: true });
    for (const p of ensureLifePlayers()) {
      p.monarch = false;
      p.initiative = false;
    }
    renderLifeGrid();
  });
  await player(page, 1).locator('.lbadge').click();
  const geometry = await player(page, 1).evaluate((card) => {
    const bar = card.querySelector('.lf-extras'),
      done = card.querySelector('.done'),
      hash = card.querySelector('[data-lcounters]');
    return {
      doneWidth: done.offsetWidth,
      doneHeight: done.offsetHeight,
      doneFont: parseFloat(getComputedStyle(done).fontSize),
      hashSize: hash.offsetWidth,
      hashRight: bar.clientWidth - hash.offsetLeft - hash.offsetWidth,
      monarchSize: card.querySelector('[data-lmonarch]').offsetWidth,
      dungeonSize: card.querySelector('[data-ldungeon]').offsetWidth,
    };
  });
  expect(geometry.doneWidth).toBeGreaterThanOrEqual(120);
  expect(geometry.doneHeight).toBeGreaterThanOrEqual(56);
  expect(geometry.doneFont).toBeGreaterThanOrEqual(18);
  expect(geometry.hashSize).toBeGreaterThanOrEqual(44);
  expect(geometry.hashRight).toBeLessThanOrEqual(1);
  expect(geometry.monarchSize).toBeGreaterThanOrEqual(44);
  expect(geometry.dungeonSize).toBeGreaterThanOrEqual(44);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/life-reference-controls-${info.project.name}.png` });
  await player(page, 1).locator('[data-lcounters]').click();
  await page.screenshot({ path: `var/previews/life-reference-picker-${info.project.name}.png` });
  await player(page, 1).locator('.done').click();
  await page.evaluate(() => {
    for (const counter of Object.values(ensureLifePlayers()[1].counters)) {
      counter.enabled = true;
      counter.value = 2;
    }
    renderLifeGrid();
  });
  const row = player(page, 1).locator('.life-extra-counters');
  await expect
    .poll(() => row.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeGreaterThan(50);
  const centered = await player(page, 1).evaluate((card) => {
    const n = card.querySelector('.pname-input').getBoundingClientRect(),
      r = card.getBoundingClientRect();
    return Math.abs(n.y + n.height / 2 - r.y - r.height / 2) < 1;
  });
  expect(centered).toBe(true);
  await page.screenshot({ path: `var/previews/life-reference-name-${info.project.name}.png` });
});

test('mana picker strips drag in rotated small panels and keep their position after choosing a color', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'mobile',
    'Touch picker dragging is exercised on the phone project.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    Object.assign(state.life, { layout: '8q', count: 8, rotate: true });
    renderLifeGrid();
  });
  const client = await page.context().newCDPSession(page);
  try {
    for (const idx of [0, 1]) {
      await player(page, idx).locator('.lbadge').click();
      await player(page, idx).locator('[data-lcounters]').click();
      await player(page, idx).getByRole('button', { name: 'Mana', exact: true }).click();
      const row = player(page, idx).locator('.life-counter-picker-scroll');
      await expect
        .poll(() => row.evaluate((el) => el.scrollWidth - el.clientWidth))
        .toBeGreaterThan(40);
      const rad = await player(page, idx).evaluate(
        (el) => (Number(el.dataset.rot) * Math.PI) / 180,
      );
      const r = await row.boundingBox(),
        cos = Math.cos(rad),
        sin = Math.sin(rad);
      const offset = await row.evaluate((el) => el.clientWidth / 2 - 14);
      const x = r.x + r.width / 2 + cos * offset,
        y = r.y + r.height / 2 + sin * offset;
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 6; step++)
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x - cos * step * 14, y: y - sin * step * 14 }],
        });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(20);
      await row.getByRole('button', { name: 'Colorless mana', exact: true }).click();
      await expect(
        row.getByRole('button', { name: 'Colorless mana', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(await row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(20);
      await player(page, idx).locator('.done').click();
      await expect(player(page, idx).locator('.life-counter-picker')).toHaveCount(0);
    }
  } finally {
    await client.detach();
  }
});

test('monarch and initiative badges stay in normal view and never shift player option buttons', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    Object.assign(state.life, { layout: '4q', count: 4, rotate: true });
    renderLifeGrid();
  });
  const panel = player(page, 1);
  await panel.locator('.lbadge').click();
  const positions = () =>
    panel.locator('.lf-extras button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const r = button.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
  const before = await positions();
  await panel.locator('[data-lmonarch]').click();
  await expect(panel.locator('[data-lmonarch]')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.life-role-icon')).toHaveCount(0);
  expect(await positions()).toEqual(before);
  await panel.locator('[data-ldungeon]').click();
  await page.locator('#lifeDgSheet [data-linitiative]').click();
  await page.locator('#lifeDgSheet [data-life-close]').click();
  await expect(page.locator('#lifeDgSheet')).toHaveCount(0);
  await expect(page.locator('#lifeGrid .life-role-icon')).toHaveCount(0);
  expect(await positions()).toEqual(before);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({
    path: `var/previews/life-options-active-roles-${info.project.name}.png`,
  });
  await panel.locator('.done').click();
  await expect(panel.locator('.life-role-icon.lmonarch')).toHaveCount(1);
  await expect(panel.locator('.life-role-icon.linitiative')).toHaveCount(1);
  await panel.locator('.lbadge').click();
  await expect(panel.locator('.life-role-icon')).toHaveCount(0);
  expect(await positions()).toEqual(before);
});

test('counter popup grows from the right-corner hash in each orientation and respects reduced motion', async ({
  page,
}) => {
  for (const fixture of [
    { layout: '4q', idx: 0 },
    { layout: '4q', idx: 1 },
    { layout: '2f', idx: 0 },
    { layout: '2f', idx: 1 },
  ]) {
    await page.evaluate((layout) => {
      const l = LIFE_LAYOUTS.find((item) => item.id === layout);
      Object.assign(state.life, { layout, count: l.count, rotate: true });
      renderLifeGrid();
    }, fixture.layout);
    const panel = player(page, fixture.idx);
    await panel.locator('.lbadge').click();
    const result = await page.evaluate((idx) => {
      openLifeCounters(idx);
      const card = document.querySelector(`.life-card-v2[data-idx="${idx}"]`),
        picker = card.querySelector('.life-counter-picker'),
        hash = card.querySelector('[data-lcounters]');
      const animation = picker.getAnimations()[0];
      if (!animation) return { animated: false };
      animation.pause();
      animation.currentTime = 0;
      const p = picker.getBoundingClientRect(),
        h = hash.getBoundingClientRect();
      const startDistance = Math.hypot(
        p.x + p.width / 2 - h.x - h.width / 2,
        p.y + p.height / 2 - h.y - h.height / 2,
      );
      animation.finish();
      return {
        animated: true,
        startDistance,
        rightError: Math.abs(
          picker.offsetLeft +
            picker.offsetWidth -
            hash.offsetParent.offsetLeft -
            hash.offsetLeft -
            hash.offsetWidth,
        ),
      };
    }, fixture.idx);
    expect(result.animated).toBe(true);
    expect(result.startDistance).toBeLessThanOrEqual(2);
    expect(result.rightError).toBeLessThanOrEqual(1);
    await panel.getByRole('button', { name: 'Energy', exact: true }).click();
    expect(
      await panel.locator('.life-counter-picker').evaluate((el) => el.getAnimations().length),
    ).toBe(0);
    await panel.locator('.done').click();
    await expect(panel.locator('[data-setlife]')).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await player(page, 1).locator('.lbadge').click();
  const animations = await page.evaluate(() => {
    openLifeCounters(1);
    return document.querySelector('.life-counter-picker').getAnimations().length;
  });
  expect(animations).toBe(0);
});
