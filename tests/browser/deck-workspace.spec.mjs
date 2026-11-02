import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { auditContrast } from './helpers/contrast.mjs';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('admiral_app:seenVersion', '1.50'));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Decks', exact: true })
    .click();
  await page.evaluate(() => {
    state.guild = 'dimir';
    applyTheme();
    const cards = Array.from({ length: 30 }, (_, i) => ({
      id: 'workspace-' + i,
      name: `Archive ${String(i).padStart(2, '0')}`,
      layout: 'normal',
      type_line: ['Creature — Wizard', 'Instant', 'Artifact', 'Basic Land — Island'][i % 4],
      cmc: i % 4,
      colors: ['U'],
      color_identity: ['U'],
      mana_cost: '{U}',
      oracle_text: 'Draw a card.',
      set: 'tst',
      collector_number: String(i),
      legalities: { modern: 'legal', commander: 'legal' },
      image_uris: { normal: '/icon-192.png', small: '/icon-192.png' },
    }));
    cards.forEach((c, i) => {
      state.priceCache[c.name] = { v: 1 + (i % 3), t: Date.now() };
    });
    window.workspaceDeck = {
      id: 'workspace-deck',
      name: 'Archive of the Tides',
      format: 'modern',
      cards,
      maybeboard: [{ ...cards[0], name: 'Sideboard adept' }],
    };
    state.decksIndex = [workspaceDeck];
    state.activeDeckId = workspaceDeck.id;
    state.builderTab = 'list';
    state.sortMode = 'type-cmc-name';
    switchPage('decklist');
  });
});

test('deck overview and card controls fit phones while the header and search stay pinned', async ({
  page,
}, info) => {
  await expect(page.locator('#brandTitle')).toHaveText('Archive of the Tides');
  await expect(page.locator('.b-tab.active')).not.toHaveCSS(
    '-webkit-text-fill-color',
    'rgba(0, 0, 0, 0)',
  );
  await expect(
    page.locator('.app-header #capDeckCount, .app-header #capNoteBtn, .app-header #renameDeckBtn'),
  ).toHaveCount(0);
  await expect(page.locator('#deckCardCountValue')).toHaveText('30 / 60');
  await expect(page.locator('#deckCountHint')).toHaveText('1 in sideboard');
  await expect(page.locator('#deckPriceValue')).toHaveText('€60.00');
  const original = page.viewportSize();
  for (const size of [original, { width: 320, height: 480 }]) {
    await page.setViewportSize(size);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const header = await page.locator('.app-header').boundingBox();
    const controls = await page.locator('.deck-controls').boundingBox();
    const body = page.locator('.deck-workspace > .page-content');
    const viewport = await body.boundingBox();
    const nav = await page.locator('.app > .app-navigation').boundingBox();
    expect(header.height).toBe(64);
    expect(controls.y).toBeCloseTo(64, 0);
    expect(viewport.y).toBeCloseTo(controls.y + controls.height, 0);
    expect(viewport.y + viewport.height).toBeCloseTo(nav.y, 0);
    expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('.deck-list-tools').scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Sort deck cards' })).toBeInViewport();
    expect(
      await page.locator('.deck-list-tools').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await page.locator('.app-header').boundingBox()).toEqual(header);
    expect(await page.locator('.deck-controls').boundingBox()).toEqual(controls);
    const add = page.getByRole('button', { name: 'Add cards to this deck', exact: true });
    const bounds = await add.boundingBox();
    expect(bounds.height).toBe(56);
    expect(bounds.y + bounds.height).toBeCloseTo(nav.y - 16, 0);
  }
  await page.setViewportSize(original);
  await page.locator('.deck-workspace > .page-content').evaluate((el) => (el.scrollTop = 0));
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/deck-workspace-${info.project.name}.png` });
  await page.locator('#capDeckCount').click();
  await expect(page.locator('#capDeckCount')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#legalityBox')).toBeVisible();
});

test('deck search, display modes, sorting and selection retain card indexes and update counts', async ({
  page,
}, info) => {
  const input = page.getByRole('searchbox', { name: 'Search this deck' });
  await input.fill('Archive 12');
  await expect(input).toBeFocused();
  await expect(page.locator('#decklistBox .vg-card[data-loc="main"]')).toHaveCount(1);
  await expect(page.locator('#decklistBox .vg-card[data-loc="main"]')).toHaveAttribute(
    'data-idx',
    '12',
  );
  await expect(page.locator('#deckCardCountValue')).toHaveText('30 / 60');
  await page.getByRole('button', { name: 'Clear deck search', exact: true }).click();
  await expect(input).toHaveValue('');
  for (const [name, mode] of [
    ['List', 'text'],
    ['Stacks', 'stack'],
    ['Tiles', 'grid'],
  ]) {
    await page.locator('.deck-view-switch').getByRole('button', { name, exact: true }).click();
    await expect(page.locator(`[data-dlview="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => dlView())).toBe(mode);
    if (mode === 'text') await expect(page.locator('#decklistBox .vg-row').first()).toBeVisible();
    if (mode === 'stack')
      await expect(page.locator('#decklistBox .vg-stack').first()).toBeVisible();
  }
  await page.getByRole('button', { name: 'Sort deck cards' }).click();
  await expect(page.locator('#modalRoot')).toContainText('Sort Decklist');
  await page.locator('#cancelBtn').click();
  await page.evaluate(() => {
    state._dlSel = new Set(['main:12']);
    updateDeckMeter(workspaceDeck);
  });
  await expect(page.locator('.deck-selection')).toContainText('1 selected');
  await page.getByRole('button', { name: 'Move to Sideboard', exact: true }).click();
  await expect(page.locator('#deckCardCountValue')).toHaveText('29 / 60');
  await expect(page.locator('#deckCountHint')).toHaveText('2 in sideboard');
  expect(await page.evaluate(() => workspaceDeck.maybeboard.at(-1).name)).toBe('Archive 12');
  await page.evaluate(() => {
    state._dlSel = new Set(['main:0']);
    updateDeckMeter(workspaceDeck);
  });
  await page.getByRole('button', { name: 'Cancel selection' }).click();
  await expect(input).toBeVisible();
  await page.locator('.deck-view-switch [data-dlview="text"]').click();
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/deck-list-rows-${info.project.name}.png` });
});

test('deck actions group tools, rename persists, and Back closes the full-screen menu', async ({
  page,
}, info) => {
  const actions = page.getByRole('button', { name: 'Deck actions', exact: true });
  await actions.click();
  const menu = page.getByRole('dialog', { name: 'Deck actions', exact: true });
  await expect(menu.locator('.deck-menu-group > h2')).toHaveText([
    'Build & explore',
    'Manage deck',
    'Share & copies',
    'Card types',
  ]);
  await expect(menu.getByRole('button', { name: /Rename deck/ })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 480 });
  const header = await menu.locator('.app-titlebar').boundingBox();
  const nav = await menu.locator('.app-navigation').boundingBox();
  const body = menu.locator('.deck-actions-body');
  const bounds = await body.boundingBox();
  expect(bounds.y).toBeCloseTo(header.y + header.height, 0);
  expect(bounds.y + bounds.height).toBeCloseTo(nav.y, 0);
  expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await menu.locator('.app-titlebar').boundingBox()).toEqual(header);
  await expect(menu.locator('#mDelete')).toBeInViewport();
  await page.goBack();
  await expect(menu).toHaveCount(0);
  await expect(actions).toHaveAttribute('aria-expanded', 'false');
  await actions.click();
  await menu.locator('#renameDeckBtn').click();
  await page.locator('#iapInput').fill('Tides, Reimagined');
  await page.locator('#iapOk').click();
  await expect(page.locator('#brandTitle')).toHaveText('Tides, Reimagined');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const key = LS_PREFIX + 'deck:workspace-deck';
        const all = await deckDbAll();
        return JSON.parse(all?.[key] || localStorage.getItem(key) || '{}').name;
      }),
    )
    .toBe('Tides, Reimagined');
  await actions.click();
  await menu.locator('.deck-actions-body').evaluate((el) => (el.scrollTop = 0));
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/deck-actions-${info.project.name}.png` });
  await menu.getByRole('button', { name: 'Back to deck', exact: true }).click();
  await expect(menu).toHaveCount(0);
});

test('deck value refreshes in place and Add cards pins Search to the active deck', async ({
  page,
}) => {
  const header = await page.locator('.app-header').boundingBox();
  await page.evaluate(() => {
    state.priceCache[workspaceDeck.cards[0].name].v = 9;
    refreshCapPrice();
  });
  await expect(page.locator('#deckPriceValue')).toHaveText('€68.00');
  expect(await page.locator('.app-header').boundingBox()).toEqual(header);
  await page.locator('#capNoteBtn').click();
  await expect(page.locator('#deckPriceOverlay')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#deckPriceOverlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add cards to this deck', exact: true }).click();
  await expect(page.locator('#brandTitle')).toHaveText('SEARCH');
  expect(await page.evaluate(() => state.searchPinnedDeckId)).toBe('workspace-deck');
});

test('deck filters and bulk editing use full-screen tools and section jumps return to the card list', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 480 });
  await page.locator('[data-btab="stats"]').click();
  await page.getByRole('button', { name: 'Filter deck cards' }).click();
  const filters = page.getByRole('dialog', { name: 'Deck filters', exact: true });
  await expect(filters).toBeVisible();
  expect(await filters.boundingBox()).toEqual({ x: 0, y: 0, width: 320, height: 480 });
  const title = await filters.locator('.app-titlebar').boundingBox();
  await filters.locator('#dfType').fill('Instant');
  await filters.locator('.deck-editor-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await filters.locator('.app-titlebar').boundingBox()).toEqual(title);
  await expect(filters.locator('#dfGo')).toBeInViewport();
  await filters.locator('#dfGo').click();
  await expect(filters).toHaveCount(0);
  await expect(page.locator('#decklistBox .vg-card[data-loc="main"]')).toHaveCount(8);
  await page.getByRole('button', { name: 'Clear deck search' }).click();
  await page.getByRole('button', { name: 'Deck actions', exact: true }).click();
  await page.locator('#deckBulkEdit').click();
  const bulk = page.getByRole('dialog', { name: 'Bulk edit', exact: true });
  await expect(bulk).toBeVisible();
  expect(await bulk.boundingBox()).toEqual({ x: 0, y: 0, width: 320, height: 480 });
  await expect(bulk.locator('#bulkText')).toContainText('Archive 00');
  await bulk.locator('#bulkText').fill('Unsubmitted changes');
  await bulk.getByRole('button', { name: 'Back to deck', exact: true }).click();
  await expect(bulk).toHaveCount(0);
  expect(await page.evaluate(() => workspaceDeck.cards.length)).toBe(30);
  await page.getByRole('button', { name: 'Deck actions', exact: true }).click();
  await page.locator('#dlCatJump').click();
  await page
    .locator('#tileMenuPop')
    .getByRole('button', { name: 'Artifacts', exact: true })
    .click();
  await expect(page.locator('.cat-head[data-cat="Artifacts"]')).toBeInViewport();
  await page.evaluate(() => {
    workspaceDeck.format = 'commander';
    workspaceDeck.admiral = {
      ...workspaceDeck.cards[0],
      name: 'Archivist of the Tides',
      type_line: 'Legendary Creature — Wizard',
    };
    state.priceCache[workspaceDeck.admiral.name] = { v: 5, t: Date.now() };
    render();
  });
  await expect(page.locator('#deckCardCountValue')).toHaveText('31 / 100');
  await expect(page.locator('#deckCountHint')).toHaveText('Including commander');
  await page.locator('.deck-workspace > .page-content').evaluate((el) => (el.scrollTop = 0));
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/deck-commander-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('deck overview, controls, cards and action menus stay readable in all color schemes', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  const guilds = [
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
  ];
  for (const theme of ['dark', 'light'])
    for (const guild of guilds) {
      await page.evaluate(
        ({ guild, theme }) => {
          state.guild = guild;
          state.theme = theme;
          applyTheme();
          render();
        },
        { guild, theme },
      );
      for (const selector of ['.deck-controls', '.deck-overview']) {
        const samples = await auditContrast(page, selector);
        expect(samples.length).toBeGreaterThan(0);
        for (const sample of samples)
          expect(
            sample.ratio,
            `${guild} ${theme} ${JSON.stringify(sample)}`,
          ).toBeGreaterThanOrEqual(sample.minimum);
      }
      await page.locator('.deck-view-switch [data-dlview="text"]').click();
      await page.locator('#decklistBox .cat-group').first().scrollIntoViewIfNeeded();
      for (const selector of ['.deck-list-tools', '#decklistBox']) {
        const samples = await auditContrast(page, selector);
        for (const sample of samples)
          expect(
            sample.ratio,
            `${guild} ${theme} ${JSON.stringify(sample)}`,
          ).toBeGreaterThanOrEqual(sample.minimum);
      }
      await page.getByRole('button', { name: 'Deck actions', exact: true }).click();
      const samples = await auditContrast(page, '#menuPop');
      expect(samples.length).toBeGreaterThan(0);
      for (const sample of samples)
        expect(sample.ratio, `${guild} ${theme} ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(
          sample.minimum,
        );
      await page.locator('#deckActionsClose').click();
      await page.locator('.deck-workspace > .page-content').evaluate((el) => (el.scrollTop = 0));
      await page.getByRole('button', { name: 'Filter deck cards' }).click();
      const fields = await auditContrast(page, '.deck-editor-screen');
      expect(fields.length).toBeGreaterThan(0);
      for (const sample of fields)
        expect(sample.ratio, `${guild} ${theme} ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(
          sample.minimum,
        );
      await page.getByRole('button', { name: 'Back to deck', exact: true }).click();
    }
});
