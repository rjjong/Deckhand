import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { auditContrast } from './helpers/contrast.mjs';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
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

async function seedStatisticsDeck(page) {
  await page.evaluate(() => {
    const base = workspaceDeck.cards[0];
    const cards = [
      { name: 'Free relic', type_line: 'Artifact', cmc: 0, mana_cost: '{0}' },
      { name: 'Silent maze', type_line: 'Land', cmc: 0 },
      {
        name: 'Island',
        type_line: 'Basic Land — Island',
        cmc: 0,
        produced_mana: ['U'],
        color_identity: ['U'],
      },
      { name: 'Wastes', type_line: 'Basic Land', cmc: 0, produced_mana: ['C'] },
      {
        name: 'Blue insight',
        type_line: 'Instant',
        cmc: 2,
        mana_cost: '{1}{U}',
        colors: ['U'],
        color_identity: ['U'],
      },
      {
        name: 'Hybrid insight',
        type_line: 'Instant',
        cmc: 2,
        mana_cost: '{W/U}',
        colors: ['W', 'U'],
        color_identity: ['W', 'U'],
      },
      {
        name: 'Blue device',
        type_line: 'Artifact',
        cmc: 2,
        mana_cost: '{2}',
        color_identity: ['U'],
        oracle_text: '{U}: Draw a card.',
      },
      {
        name: 'Mana prism',
        type_line: 'Artifact',
        cmc: 2,
        mana_cost: '{2}',
        produced_mana: ['U'],
        color_identity: ['U'],
      },
      { name: 'Diamond sentinel', type_line: 'Creature', cmc: 6, mana_cost: '{5}{C}' },
      {
        name: 'Deep sea giant',
        type_line: 'Creature',
        cmc: 8,
        mana_cost: '{6}{U}{U}',
        colors: ['U'],
        color_identity: ['U'],
      },
      {
        name: 'Searching shore',
        type_line: 'Land',
        cmc: 0,
        oracle_text:
          'Search your library for a basic land card, put it onto the battlefield, then shuffle.',
      },
    ];
    workspaceDeck.cards = cards.map((card, i) => ({
      ...base,
      id: 'statistics-' + i,
      colors: [],
      color_identity: [],
      mana_cost: '',
      oracle_text: '',
      ...card,
    }));
    workspaceDeck.maybeboard = [];
    workspaceDeck.cards.forEach((card) => (state.priceCache[card.name] = { v: 1, t: Date.now() }));
    setDlView('grid');
    render();
  });
}

async function visibleMainCardNames(page) {
  return page
    .locator('#decklistBox .vg-card[data-loc="main"]')
    .evaluateAll((cards) =>
      cards.map((card) => workspaceDeck.cards[Number(card.dataset.idx)].name).sort(),
    );
}

test('statistics mana-curve bars open the deck list with editable advanced filters', async ({
  page,
}) => {
  await seedStatisticsDeck(page);
  await page.locator('#dockSearchInput').fill('An unrelated previous search');
  await page.locator('[data-btab="stats"]').click();
  await expect(page.locator('#deckCombosPanel, #curveDetail, #msDetail')).toHaveCount(0);
  await page.locator('[data-cmc="6"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-btab="list"]')).toHaveClass(/active/);
  await expect(page.locator('#dockSearchInput')).toHaveValue('');
  expect(await visibleMainCardNames(page)).toEqual(['Deep sea giant', 'Diamond sentinel']);
  await page.getByRole('button', { name: 'Filter deck cards' }).click();
  await expect(page.locator('#dfMvVal')).toHaveValue('6');
  await expect(page.locator('[data-cs="dfMvOp"]')).toContainText('≥');
  await expect(page.locator('#dfCurveOnly')).toBeChecked();
  await page.locator('#dfMvVal').fill('2');
  await page.locator('[data-cs="dfMvOp"]').click();
  await page.locator('[data-csopt="dfMvOp"][data-val="="]').click();
  await page.locator('#dfGo').click();
  expect(await visibleMainCardNames(page)).toEqual([
    'Blue device',
    'Blue insight',
    'Hybrid insight',
    'Mana prism',
  ]);
  await page.locator('[data-btab="stats"]').click();
  await page.locator('[data-cmc="0"]').click();
  expect(await visibleMainCardNames(page)).toEqual(['Free relic', 'Silent maze']);
  await page.getByRole('button', { name: 'Filter deck cards' }).click();
  await expect(page.locator('#dfMvVal')).toHaveValue('0');
  await expect(page.locator('[data-cs="dfMvOp"]')).toContainText('=');
  await page.locator('#dfCurveOnly').uncheck();
  await page.locator('#dfGo').click();
  expect(await visibleMainCardNames(page)).toEqual([
    'Free relic',
    'Island',
    'Searching shore',
    'Silent maze',
    'Wastes',
  ]);
  await page.getByRole('button', { name: 'Clear deck search' }).click();
  await expect(page.locator('#decklistBox .vg-card[data-loc="main"]')).toHaveCount(11);
});

test('statistics color symbols and production bars apply the matching advanced color filters', async ({
  page,
}) => {
  await seedStatisticsDeck(page);
  const selections = [
    ['msym', 'U', 'Mana symbols', 'Blue', ['Blue insight', 'Deep sea giant', 'Hybrid insight']],
    ['msym', 'GEN', 'Mana symbols', 'Generic', ['Blue device', 'Free relic', 'Mana prism']],
    ['msym', 'C', 'Mana symbols', 'Colorless', ['Diamond sentinel']],
    ['mprod', 'U', 'Mana production', 'Blue', ['Island', 'Mana prism', 'Searching shore']],
    ['mprod', 'GEN', 'Mana production', 'Colorless', ['Wastes']],
  ];
  for (const [attribute, color, mode, label, names] of selections) {
    await page.locator('[data-btab="stats"]').click();
    await page.locator(`[data-${attribute}="${color}"]`).click();
    await expect(page.locator('[data-btab="list"]')).toHaveClass(/active/);
    expect(await visibleMainCardNames(page)).toEqual(names);
    await page.getByRole('button', { name: 'Filter deck cards' }).click();
    await expect(page.locator('[data-cs="dfColorMode"]')).toContainText(mode);
    await expect(page.getByRole('checkbox', { name: label, exact: true })).toBeChecked();
    await page.locator('#dfGo').click();
    expect(await visibleMainCardNames(page)).toEqual(names);
  }
  await page.getByRole('button', { name: 'Filter deck cards' }).click();
  await page.locator('[data-cs="dfColorMode"]').click();
  await page.locator('[data-csopt="dfColorMode"][data-val="identity"]').click();
  await page.getByRole('checkbox', { name: 'Colorless', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('checkbox', { name: 'Blue', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.locator('#dfGo').click();
  expect(await visibleMainCardNames(page)).toEqual([
    'Blue device',
    'Blue insight',
    'Deep sea giant',
    'Hybrid insight',
    'Island',
    'Mana prism',
  ]);
});

test('promoting a filtered card refreshes the commander and partner across deck views', async ({
  page,
}, info) => {
  for (const mode of ['grid', 'stack', 'text']) {
    const from = mode === 'text' ? 'maybe' : 'main';
    await page.evaluate(
      ({ mode, from }) => {
        const base = workspaceDeck.cards[0];
        const target = {
          ...base,
          id: 'new-captain',
          name: 'Captain of the Tides',
          type_line: 'Legendary Creature — Wizard',
          oracle_text: mode === 'text' ? 'Draw a card.' : 'Partner',
        };
        const previous = {
          ...base,
          id: 'previous-captain',
          name: 'Previous captain',
          type_line: 'Legendary Creature — Wizard',
          oracle_text: 'Partner',
        };
        const partner = {
          ...base,
          id: 'existing-partner',
          name: 'Existing partner',
          type_line: 'Legendary Creature — Wizard',
          oracle_text: 'Partner',
        };
        const other = { ...base, id: 'untouched-card', name: 'Unchanged scholar' };
        workspaceDeck.format = 'commander';
        workspaceDeck.admiral = mode === 'grid' ? null : previous;
        workspaceDeck.partner = mode === 'grid' ? null : partner;
        workspaceDeck.cards = from === 'main' ? [other, target] : [other];
        workspaceDeck.maybeboard = from === 'maybe' ? [other, target] : [];
        state.builderTab = 'list';
        state.dlSearchQ = 'Captain of';
        state.dlSearchOpen = true;
        state.dlFilterOn = false;
        state.dlFilter = { ci: [] };
        setDlView(mode);
        render();
      },
      { mode, from },
    );
    const card = page.locator(`#decklistBox .vg-card[data-loc="${from}"][data-idx="1"]`);
    await card.locator(mode === 'text' ? '.vg-hit' : 'img').click({
      button: mode === 'text' && info.project.name === 'desktop' ? 'right' : 'left',
    });
    await page.locator('#csMakeCommander').click();
    await expect(page.locator('#cardSheetOverlay')).toHaveCount(0);
    await expect(
      page.locator('.deck-overview-leaders img[alt="Captain of the Tides"]'),
    ).toBeVisible();
    await expect(page.locator('.deck-overview-leaders img')).toHaveCount(mode === 'stack' ? 2 : 1);
    await expect(page.locator('#dockSearchInput')).toHaveValue('Captain of');
    expect(
      await page.evaluate(() => ({
        commander: workspaceDeck.admiral.name,
        partner: workspaceDeck.partner?.name || null,
        main: workspaceDeck.cards.map((card) => card.name),
        maybe: workspaceDeck.maybeboard.map((card) => card.name),
      })),
    ).toEqual({
      commander: 'Captain of the Tides',
      partner: mode === 'stack' ? 'Existing partner' : null,
      main:
        mode === 'grid'
          ? ['Unchanged scholar']
          : mode === 'stack'
            ? ['Unchanged scholar', 'Previous captain']
            : ['Unchanged scholar', 'Previous captain', 'Existing partner'],
      maybe: mode === 'text' ? ['Unchanged scholar'] : [],
    });
    // The partner overlaps the commander's center; its top-left corner stays exposed.
    await page
      .locator('.deck-overview-leaders img[alt="Captain of the Tides"]')
      .click({ position: { x: 8, y: 8 } });
    await expect(page.locator('#csSwitchCommander')).toBeVisible();
    await expect(page.locator('#csMakeCommander')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('#cardSheetOverlay')).toHaveCount(0);
  }
});

test('the themed game log retains form choices through dropdown changes and saves the result', async ({
  page,
}) => {
  await page.locator('#menuBtn').click();
  await page.locator('#deckLog').click();
  await page.locator('#logGameBtn').click();
  const dialog = page.getByRole('dialog', { name: 'Log a game', exact: true });
  await expect(dialog.getByRole('button', { name: 'Close game log' })).toBeFocused();
  await expect(dialog.locator('[data-lseg="pod"]')).toHaveCount(0);
  await dialog.getByLabel('Opponent', { exact: true }).fill('Tempo');
  await dialog.getByLabel('Turns', { exact: true }).fill('8');
  await dialog.getByLabel('Dead turns', { exact: true }).fill('1');
  await dialog.getByLabel('Notes', { exact: true }).fill('Keep more interaction.');
  await dialog
    .locator('[data-lseg="res"]')
    .getByRole('button', { name: 'Lost', exact: true })
    .click();
  await dialog
    .locator('[data-lseg="play"]')
    .getByRole('button', { name: 'On the draw', exact: true })
    .click();
  await dialog.locator('[data-lseg="mull"] [data-v="1"]').click();
  await dialog
    .locator('[data-lseg="mana"]')
    .getByRole('button', { name: 'Flooded', exact: true })
    .click();
  await dialog.locator('[data-cs="lgBy"]').click();
  await expect(dialog.locator('[data-csopt="lgBy"][data-val="Commander damage"]')).toHaveCount(0);
  await dialog.locator('[data-csopt="lgBy"][data-val="Other"]').click();
  await dialog.getByLabel('Details', { exact: true }).fill('Alternate win condition');
  for (const [id, name] of [
    ['lgMvp', 'Archive 01'],
    ['lgWeak', 'Archive 00'],
  ]) {
    await dialog.locator(`[data-cs="${id}"]`).click();
    await dialog.locator('.cselect-search input').fill(name);
    await dialog.locator(`[data-csopt="${id}"][data-val="${name}"]`).click();
    await expect(dialog.locator(`[data-cs="${id}"]`)).toContainText(name);
  }
  await expect(dialog.getByLabel('Turns', { exact: true })).toHaveValue('8');
  await expect(dialog.getByLabel('Notes', { exact: true })).toHaveValue('Keep more interaction.');
  await expect(dialog.getByRole('button', { name: 'Save game', exact: true })).toBeInViewport();
  await dialog.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#logGameBtn')).toBeFocused();
  expect(await page.evaluate(() => workspaceDeck.playLog[0])).toMatchObject({
    res: 'L',
    by: 'Alternate win condition',
    pod: 2,
    opp: 'Tempo',
    play: 'draw',
    turns: 8,
    mull: 1,
    mana: 'flood',
    dead: 1,
    mvp: 'Archive 01',
    weak: 'Archive 00',
    note: 'Keep more interaction.',
  });
  await expect(page.locator('.glog-list')).toContainText('Keep more interaction.');
});

test('the game log fits a small phone, keeps its actions visible and cancels without saving', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.evaluate(() => {
    workspaceDeck.format = 'commander';
    render();
  });
  await page.locator('#menuBtn').click();
  await page.locator('#deckLog').click();
  await page.locator('#logGameBtn').click();
  const dialog = page.getByRole('dialog', { name: 'Log a game', exact: true });
  const frame = await dialog.boundingBox();
  expect(frame.x).toBeGreaterThanOrEqual(16);
  expect(frame.y).toBeGreaterThanOrEqual(16);
  expect(frame.x + frame.width).toBeLessThanOrEqual(304);
  expect(frame.y + frame.height).toBeLessThanOrEqual(464);
  await expect(dialog.locator('#lgOpp')).toHaveCount(0);
  await dialog.locator('[data-lseg="pod"] [data-v="5"]').click();
  await expect(dialog.locator('[data-lseg="pod"] [data-v="5"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.locator('[data-cs="lgBy"]').click();
  await expect(dialog.locator('[data-csopt="lgBy"][data-val="Commander damage"]')).toBeVisible();
  await page.goBack();
  await expect(dialog.locator('.cselect-panel')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  const header = await dialog.locator('.transfer-heading').boundingBox();
  const footer = await dialog.locator('.game-log-actions').boundingBox();
  const body = dialog.locator('.glog-form');
  expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await dialog.locator('.transfer-heading').boundingBox()).toEqual(header);
  expect(await dialog.locator('.game-log-actions').boundingBox()).toEqual(footer);
  await dialog.getByLabel('Notes', { exact: true }).fill('Discard this note.');
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/game-log-small-${info.project.name}.png` });
  await dialog.getByRole('button', { name: 'Close game log' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Save game', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#logGameBtn')).toBeFocused();
  expect(await page.evaluate(() => workspaceDeck.playLog || [])).toEqual([]);
  expect(await page.evaluate(() => state._localCsClose)).toBeNull();
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
  await expect(page.locator('.deck-list-tools #capDeckCount')).toHaveCount(1);
  await expect(page.locator('.deck-list-tools #capNoteBtn')).toHaveCount(1);
  await expect(page.locator('.deck-overview .deck-format')).toHaveText('Modern');
  await expect(page.locator('.deck-overview #deckReview')).toHaveCount(0);
  await expect(page.locator('.deck-overview #deckIssueText')).not.toHaveAttribute('aria-controls', /./);
  await expect(page.locator('.deck-overview #dlBracket')).toHaveCount(0);
  await expect(
    page.locator('.deck-overview #bridgeLogGame, .deck-game-summary, .dl-winrate'),
  ).toHaveCount(0);
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
    expect(bounds.height).toBe(54);
    expect(bounds.y + bounds.height).toBeCloseTo(nav.y - 12, 0);
  }
  await page.setViewportSize(original);
  await page.locator('.deck-workspace > .page-content').evaluate((el) => (el.scrollTop = 0));
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/deck-workspace-${info.project.name}.png` });
  await page.locator('#capDeckCount').click();
  await expect(page.locator('#capDeckCount')).not.toHaveAttribute('aria-expanded', /./);
  await expect(page.locator('#legalityBox, #legalityWrap')).toHaveCount(0);
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
    await page.locator('.deck-view-picker summary').click();
    await page.getByRole('menuitemradio', { name, exact: true }).click();
    await expect(page.locator(`[data-dlview="${mode}"]`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.deck-view-picker')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => dlView())).toBe(mode);
    if (mode === 'text') await expect(page.locator('#decklistBox .vg-row').first()).toBeVisible();
    if (mode === 'stack')
      await expect(page.locator('#decklistBox .vg-stack').first()).toBeVisible();
  }
  const viewPicker = page.locator('.deck-view-picker');
  await viewPicker.locator('summary').focus();
  await page.keyboard.press('ArrowDown');
  await expect(viewPicker.getByRole('menuitemradio', { name: 'Tiles', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(viewPicker.getByRole('menuitemradio', { name: 'List', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(viewPicker).not.toHaveAttribute('open', '');
  await expect(viewPicker.locator('summary')).toBeFocused();
  await page.getByRole('button', { name: 'Sort deck cards' }).click();
  await expect(page.locator('#tileMenuPop')).toBeVisible();
  await expect(page.locator('#modalRoot, #scryTagsSw')).toHaveCount(0);
  await page.locator('#tileMenuPop').getByRole('button', { name: 'Name only', exact: false }).click();
  expect(await page.evaluate(() => state.sortMode)).toBe('name');
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
  await page.locator('.deck-view-picker summary').click();
  await page.getByRole('menuitemradio', { name: 'List', exact: true }).click();
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
    'Manage deck',
    'History & notes',
    'Share & export',
  ]);
  await expect(menu.getByRole('button', { name: /Rename deck/ })).toBeVisible();
  await expect(menu.locator('#deckBulkEdit, [data-deck-type]')).toHaveCount(0);
  await expect(menu.getByRole('button', { name: /Jump to section/ })).toHaveCount(0);
  await expect(menu.locator('.deck-menu-heading #renameDeckBtn')).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 480 });
  const deckTitle = await menu.locator('.deck-menu-heading h1').boundingBox();
  const rename = await menu.locator('#renameDeckBtn').boundingBox();
  expect(rename.x).toBeGreaterThanOrEqual(deckTitle.x + deckTitle.width);
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
  await page.locator('#deckAddSearch').click();
  await expect(page.locator('#brandTitle')).toHaveText('SEARCH');
  expect(await page.evaluate(() => state.searchPinnedDeckId)).toBe('workspace-deck');
});

test('deck prices read downward, keep budgets editable and filter cards in one viewport', async ({
  page,
}, info) => {
  const original = page.viewportSize();
  await page.locator('#capNoteBtn').click();
  const prices = page.getByRole('dialog', { name: 'Deck prices', exact: true });
  const content = prices.locator('main');
  const list = prices.locator('#dppList');
  await expect(prices.locator('.brand-txt')).toHaveText('Prices');
  await expect(prices.locator('.app-page-subtitle')).toHaveText('Archive of the Tides');
  expect(await content.evaluate((el) => el.scrollTop)).toBe(0);
  expect((await prices.locator('#dppSum').boundingBox()).y).toBeLessThan(
    (await prices.locator('#dppCards').boundingBox()).y,
  );
  await expect(list.locator('.dpp-row').first().locator('.dpp-nm')).toHaveText('Archive 02');
  await expect(list.locator('.dpp-row').last().locator('.dpp-nm')).toHaveText('Archive 27');
  await expect(list.locator('.dpp-row').first().locator('.dpp-eur')).toHaveText('€3.00');
  await expect(list.locator('.dpp-row').last().locator('.dpp-eur')).toHaveText('€1.00');
  expect(await list.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  for (const size of [original, { width: 320, height: 480 }]) {
    await page.setViewportSize(size);
    await content.evaluate((el) => (el.scrollTop = 0));
    const header = await prices.locator('.app-titlebar').boundingBox();
    const subtitle = await prices.locator('.app-page-subtitle').boundingBox();
    const nav = await prices.locator('.app-navigation').boundingBox();
    const bounds = await content.boundingBox();
    expect(bounds.y).toBeCloseTo(subtitle.y + subtitle.height, 0);
    expect(bounds.y + bounds.height).toBeCloseTo(nav.y, 0);
    expect(await content.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await content.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(list.locator('.dpp-row').last()).toBeInViewport();
    expect(await prices.locator('.app-titlebar').boundingBox()).toEqual(header);
    expect(await prices.locator('.app-navigation').boundingBox()).toEqual(nav);
  }
  await page.setViewportSize(original);
  await prices.getByLabel('Card budget', { exact: true }).fill('1.5');
  await prices.getByLabel('Card budget', { exact: true }).press('Tab');
  await prices.getByLabel('Deck budget', { exact: true }).fill('50');
  await prices.getByLabel('Deck budget', { exact: true }).press('Tab');
  await expect(prices.locator('#dppStats')).toContainText('20 over budget');
  await expect(prices.locator('#dppStats')).toContainText('€10.00 over');
  const minimum = prices.getByRole('slider', { name: 'Minimum price', exact: true });
  for (let i = 0; i < 6; i++) await minimum.press('ArrowRight');
  await expect(prices.locator('#dppCnt')).toHaveText('20 / 30');
  await expect(list.locator('.dpp-row').last().locator('.dpp-eur')).toHaveText('€2.00');
  const maximum = prices.getByRole('slider', { name: 'Maximum price', exact: true });
  await maximum.press('Home');
  await expect(list).toContainText('No cards in this price range.');
  await maximum.press('End');
  await expect(prices.locator('#dppCnt')).toHaveText('30 / 30');
  await list.locator('.dpp-row').first().focus();
  const position = await content.evaluate((el) => el.scrollTop);
  await page.keyboard.press('Enter');
  await expect(page.locator('#cardSheetOverlay')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#cardSheetOverlay')).toHaveCount(0);
  expect(await content.evaluate((el) => el.scrollTop)).toBeCloseTo(position, 0);
  expect(await page.evaluate(() => workspaceDeck.budget)).toEqual({ card: 1.5, deck: 50 });
  await content.evaluate((el) => (el.scrollTop = 0));
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/deck-prices-${info.project.name}.png` });
  await prices.locator('#dppClose').click();
  await expect(prices).toHaveCount(0);
  await expect(page.locator('#capNoteBtn')).toBeFocused();
});

async function expectDeckEditorToCoverControls(page) {
  await expect(page.locator('.deck-controls')).toBeHidden();
  await expect(page.locator('#dockAddCards')).toBeHidden();
  const covered = await page
    .locator(
      '.app > .app-header, .app > .app-navigation, .deck-controls, #dockSearchInput, #dockAddCards',
    )
    .evaluateAll((controls) =>
      controls.map((control) => {
        const box = control.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          control: control.id || control.className,
          covered: !!hit?.closest('.deck-editor-screen'),
        };
      }),
    );
  expect(
    covered.every((control) => control.covered),
    JSON.stringify(covered),
  ).toBe(true);
  await page.locator('.deck-editor-screen .dl-panel-x').focus();
  await page.locator('#dockSearchInput').evaluate((input) => input.focus());
  await expect(page.locator('.deck-editor-screen .dl-panel-x')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('.deck-editor-screen'))).toBe(
    true,
  );
}

test('deck filters cover pinned controls and closing restores the editor', async ({ page }) => {
  await page.locator('#dockSearchInput').fill('Archive');
  await page.getByRole('button', { name: 'Filter deck cards' }).click();
  await expectDeckEditorToCoverControls(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Deck filters', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filter deck cards' })).toBeFocused();
  await expect(page.locator('#dockFilterChev svg')).toHaveCount(1);
  await expect(page.locator('#dockSearchInput')).toHaveValue('Archive');
  await page.locator('[data-btab="stats"]').click();
  await expect(page.locator('[data-btab="stats"]')).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Add cards to this deck', exact: true }).click();
  await page.locator('#deckAddSearch').click();
  await expect(page.locator('#brandTitle')).toHaveText('SEARCH');
});

test('deck filters and bulk editing use full-screen tools and card type links return to the card list', async ({
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
  await expectDeckEditorToCoverControls(page);
  const title = await filters.locator('.app-titlebar').boundingBox();
  await filters.locator('#dfType').fill('Instant');
  await filters.locator('.deck-editor-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await filters.locator('.app-titlebar').boundingBox()).toEqual(title);
  await expect(filters.locator('#dfGo')).toBeInViewport();
  await filters.locator('#dfGo').click();
  await expect(filters).toHaveCount(0);
  await expect(page.locator('#decklistBox .vg-card[data-loc="main"]')).toHaveCount(8);
  await page.getByRole('button', { name: 'Clear deck search' }).click();
  await page.evaluate(() => toggleDlPanel(workspaceDeck, 'bulk'));
  const bulk = page.getByRole('dialog', { name: 'Bulk edit', exact: true });
  await expect(bulk).toBeVisible();
  expect(await bulk.boundingBox()).toEqual({ x: 0, y: 0, width: 320, height: 480 });
  await expectDeckEditorToCoverControls(page);
  await expect(bulk.locator('#bulkText')).toContainText('Archive 00');
  const bulkTitle = await bulk.locator('.app-titlebar').boundingBox();
  const bulkFooter = await bulk.locator('.deck-editor-footer').boundingBox();
  await bulk.locator('.deck-editor-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await bulk.locator('.app-titlebar').boundingBox()).toEqual(bulkTitle);
  expect(await bulk.locator('.deck-editor-footer').boundingBox()).toEqual(bulkFooter);
  await expect(bulk.locator('#applyBulkBtn')).toBeInViewport();
  expect(
    await bulk.locator('.deck-editor-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/bulk-edit-small-${info.project.name}.png` });
  await bulk.locator('#bulkText').fill('Unsubmitted changes');
  await bulk.getByRole('button', { name: 'Back to deck', exact: true }).click();
  await expect(bulk).toHaveCount(0);
  await expect(page.locator('.deck-controls')).toBeVisible();
  await expect(page.locator('#dockSearchInput')).toBeVisible();
  await expect(page.locator('#dockAddCards')).toBeVisible();
  expect(await page.evaluate(() => workspaceDeck.cards.length)).toBe(30);
  await page.getByRole('tab', {name: 'Stats', exact: true}).click();
  await page.locator('.deck-card-types [data-deck-type="Artifacts"]').click();
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
  await expect(page.locator('.deck-overview .deck-format')).toHaveText('Commander');
  await expect(page.locator('.deck-overview #dlBracket')).toBeVisible();
  await expect(page.locator('.deck-overview #deckIssueText')).not.toBeEmpty();
  await page.evaluate(() => {
    workspaceDeck.admiral.oracle_text = 'Partner';
    workspaceDeck.partner = {
      ...workspaceDeck.admiral,
      id: 'workspace-partner',
      name: 'Partner of the Tides',
    };
    render();
  });
  await expect(page.locator('.deck-overview-leaders .vg-card')).toHaveCount(2);
  await expect(page.locator('#deckCardCountValue')).toHaveText('32 / 100');
  const leaders = await page.locator('.deck-overview-leaders').boundingBox();
  const details = await page.locator('.deck-overview-info').boundingBox();
  expect(leaders.x + leaders.width).toBeLessThan(details.x);
  await page.locator('.deck-workspace > .page-content').evaluate((el) => (el.scrollTop = 0));
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/deck-commander-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('bulk edits keep the editor covered through validation and restore it after saving', async ({
  page,
}) => {
  const cards = await page.evaluate(() => workspaceDeck.cards.slice(0, 2));
  await page.route('**/api/scryfall/cards/search?*', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') || '';
    return route.fulfill({
      json: { object: 'list', data: query.includes('banned:') ? [] : cards, has_more: false },
    });
  });
  await page.route('**/api/scryfall/cards/named?*', (route) =>
    route.fulfill({
      status: 404,
      json: { object: 'error', details: 'No card found.' },
    }),
  );
  await page.evaluate(() => toggleDlPanel(workspaceDeck, 'bulk'));
  const bulk = page.getByRole('dialog', { name: 'Bulk edit', exact: true });
  await bulk
    .getByLabel('Card list', { exact: true })
    .fill('2 Archive 00\nArchive 01\nMissing card\n\nSIDEBOARD:\nArchive 01');
  await bulk.getByRole('button', { name: 'Check & save changes', exact: true }).click();
  await expect(bulk.locator('#bulkReport')).toContainText('Not found');
  await expect(bulk.getByText('Not found', { exact: true })).toBeInViewport();
  await expect(page.locator('.deck-controls')).toBeHidden();
  await expect(page.locator('#dockAddCards')).toBeHidden();
  await bulk
    .getByLabel('Card list', { exact: true })
    .fill('2 Archive 00\nArchive 01\n\nSIDEBOARD:\nArchive 01');
  await bulk.getByRole('button', { name: 'Check & save changes', exact: true }).click();
  await expect(bulk).toHaveCount(0);
  await expect(page.locator('.deck-controls')).toBeVisible();
  await expect(page.locator('#dockSearchInput')).toBeVisible();
  await expect(page.locator('#dockAddCards')).toBeVisible();
  expect(
    await page.evaluate(() => ({
      main: workspaceDeck.cards.map((card) => card.name),
      side: workspaceDeck.maybeboard.map((card) => card.name),
    })),
  ).toEqual({ main: ['Archive 00', 'Archive 00', 'Archive 01'], side: ['Archive 01'] });
  await expect(page.locator('#deckCardCountValue')).toHaveText('3 / 60');
});

test('Deck Log buttons stay readable in every color scheme', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  const guilds = await page.evaluate(() => GUILDS.map((guild) => guild.k));
  const summary = [];
  for (const theme of ['dark', 'light'])
    for (const guild of guilds) {
      await page.evaluate(
        ({ guild, theme }) => {
          state.guild = guild;
          state.theme = theme;
          document.getElementById('deckLogOverlay')?.remove();
          state.overlayStack = [];
          state.builderTab = 'list';
          state._glogOpen = true;
          state._muOpen = 'log-palette-matchup';
          state._dpEdit = false;
          workspaceDeck.description = 'Deck log readability fixture.';
          workspaceDeck.primer = 'Draw cards and test opening hands.';
          workspaceDeck.playLog = [{ t: Date.now(), res: 'W', opp: 'Test opponent', turns: 8 }];
          workspaceDeck.matchups = [
            {
              id: 'log-palette-matchup',
              opp: 'Test opponent',
              theirs: 'Apply pressure.',
              ours: 'Draw cards.',
              in: [],
              out: [],
            },
          ];
          applyTheme();
          render();
          openDeckLog(workspaceDeck);
        },
        { guild, theme },
      );
      await page.locator('#htNew').click();
      await expect(page.locator('#htMull')).toBeEnabled();
      await expect(page.locator('#htDraw')).toBeEnabled();
      const buttons = page.locator('#deckLogBody button');
      const samples = [];
      for (let index = 0; index < (await buttons.count()); index++) {
        const button = buttons.nth(index);
        if (!(await button.isVisible())) continue;
        await button.scrollIntoViewIfNeeded();
        const ink = await auditContrast(page, '#deckLogBody button >> nth=' + index);
        expect(ink.length, await button.textContent()).toBeGreaterThan(0);
        samples.push(...ink);
      }
      await page.locator('#dpSaveEdit').click();
      await expect(page.locator('#dpSaveEdit')).toHaveText('Save');
      await page.locator('#dpSaveEdit').scrollIntoViewIfNeeded();
      samples.push(...(await auditContrast(page, '#dpSaveEdit')));
      for (const sample of samples)
        expect(sample.ratio, `${guild} ${theme} ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(
          sample.minimum,
        );
      summary.push({
        guild,
        theme,
        samples: samples.length,
        minimum: Math.min(...samples.map((sample) => sample.ratio)),
      });
    }
  await info.attach('Deck Log contrast by color scheme', {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json',
  });
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
      await page.locator('.deck-view-picker summary').click();
      const menu = await auditContrast(page, '.deck-view-menu');
      for (const sample of menu)
        expect(sample.ratio, `${guild} ${theme} view menu`).toBeGreaterThanOrEqual(sample.minimum);
      await page.getByRole('menuitemradio', { name: 'List', exact: true }).click();
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

async function swipeDeck(page, { dx, dy = 0, selector = '#builderBody' }) {
  return page.evaluate(({ dx, dy, selector }) => {
    const target = document.querySelector(selector);
    const bounds = target.getBoundingClientRect();
    const x = Math.max(bounds.left + 20, Math.min(bounds.right - 20, bounds.left + bounds.width / 2));
    const y = Math.max(bounds.top + 20, Math.min(bounds.bottom - 20, bounds.top + 40));
    const point = (mx, my) => new Touch({ identifier: 7, target, clientX: x + mx, clientY: y + my });
    target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true,
      touches: [point(0, 0)], changedTouches: [point(0, 0)] }));
    const move = new TouchEvent('touchmove', { bubbles: true, cancelable: true,
      touches: [point(dx, dy)], changedTouches: [point(dx, dy)] });
    target.dispatchEvent(move);
    target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true,
      touches: [], changedTouches: [point(dx, dy)] }));
    return move.defaultPrevented;
  }, { dx, dy, selector });
}

test('deck category tabs meet the header, span the screen and support bounded keyboard navigation', async ({ page }) => {
  const tabs = page.getByRole('tablist', { name: 'Deck pages' });
  const header = await page.locator('.app-header').boundingBox();
  const bar = await tabs.boundingBox();
  expect(bar.y).toBeCloseTo(header.y + header.height, 1);
  expect(bar.x).toBeCloseTo(0, 1);
  expect(bar.width).toBeCloseTo(page.viewportSize().width, 1);
  await expect(tabs.getByRole('tab')).toHaveText(['Decklist', 'Stats', 'Inspiration']);
  const list = tabs.getByRole('tab', { name: 'Decklist', exact: true });
  await list.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(list).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Stats', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Inspiration', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Inspiration', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'deckTab-inspiration');
  await page.keyboard.press('Home');
  await expect(list).toBeFocused();
  await page.locator('#deckIssueText').click();
  await expect(page.locator('#deckIssueText')).not.toHaveAttribute('aria-expanded', /./);
  await expect(page.locator('#legalityBox, #legalityWrap')).toHaveCount(0);
});

test('deck swipes move one category without wrapping or capturing vertical scrolling and controls', async ({ page }) => {
  const active = page.locator('.builder-tabs [aria-selected="true"]');
  for (const [dx, name] of [[140, 'Decklist'], [-140, 'Stats'], [-140, 'Inspiration'],
    [-140, 'Inspiration'], [140, 'Stats'], [140, 'Decklist'], [140, 'Decklist']]) {
    expect(await swipeDeck(page, { dx })).toBe(true);
    await expect(active).toHaveText(name);
  }
  expect(await swipeDeck(page, { dx: 5, dy: 120 })).toBe(false);
  await expect(active).toHaveText('Decklist');
  expect(await swipeDeck(page, { dx: -140, selector: '#dockSearchInput' })).toBe(false);
  await expect(active).toHaveText('Decklist');
  await page.evaluate(() => {
    const strip = document.createElement('div');
    strip.id = 'deckTestHorizontal';
    strip.style.cssText = 'width:100px;overflow-x:auto;';
    strip.innerHTML = '<div style="width:400px;height:40px">Scrollable chart</div>';
    document.getElementById('builderBody').appendChild(strip);
  });
  expect(await swipeDeck(page, { dx: -140, selector: '#deckTestHorizontal' })).toBe(false);
  await expect(active).toHaveText('Decklist');
  await page.getByRole('button', { name: 'Filter deck cards', exact: true }).click();
  expect(await swipeDeck(page, { dx: -140, selector: '.deck-editor-body' })).toBe(false);
  await expect(active).toHaveText('Decklist');
});

test('a native mobile touch swipe changes only the deck category', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'mobile', 'Native touch is exercised in the mobile project');
  const session = await context.newCDPSession(page);
  const format = await page.locator('.deck-format').boundingBox();
  const y = format.y + format.height / 2;
  const header = await page.locator('.app-header').boundingBox();
  const nav = await page.locator('.app > .app-navigation').boundingBox();
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 340, y }] });
  for (const x of [320, 280, 230, 180, 120, 60])
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('tab', { name: 'Stats', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('.app-header').boundingBox()).toEqual(header);
  expect(await page.locator('.app > .app-navigation').boundingBox()).toEqual(nav);
});

test('sort sits after advanced filters while the view selector stays beside the price', async ({ page }) => {
  const filter = await page.locator('#dockFilterChev').boundingBox();
  const sort = await page.locator('.deck-search-field #deckSortBtn').boundingBox();
  expect(sort.x).toBeGreaterThanOrEqual(filter.x + filter.width);
  expect(sort.y).toBeCloseTo(filter.y, 1);
  for (const width of [page.viewportSize().width, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('#capNoteBtn')).toBeVisible();
    await expect(page.locator('.deck-view-picker')).toBeVisible();
    const price = await page.locator('#capNoteBtn').boundingBox();
    const view = await page.locator('.deck-view-picker').boundingBox();
    expect(view.x).toBeGreaterThanOrEqual(price.x + price.width);
    expect(view.y + view.height / 2).toBeCloseTo(price.y + price.height / 2, 1);
    expect(await page.locator('.deck-list-tools').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await page.locator('#deckSortBtn').click();
  await expect(page.locator('#tileMenuPop')).toBeVisible();
  await expect(page.locator('#scryTagsSw, .sort-scry, #modalRoot')).toHaveCount(0);
  await page.locator('#tileMenuPop').getByRole('button', { name: 'Type → Name', exact: false }).click();
  expect(await page.evaluate(() => state.sortMode)).toBe('type-name');
});

async function scrollStackToCard(page, index) {
  await page.evaluate(index => {
    const stack = document.querySelector('#decklistBox .vg-stack');
    const viewport = pageScroller();
    const bounds = viewport.getBoundingClientRect();
    const style = getComputedStyle(stack);
    const peek = parseFloat(style.getPropertyValue('--stack-peek'));
    const height = parseFloat(style.getPropertyValue('--stack-card-height'));
    const offset = Math.max(0, (bounds.height - height) * 0.82);
    const top = stack.getBoundingClientRect().top - bounds.top + viewport.scrollTop;
    const start = Math.max(0, top - offset);
    const end = Math.max(start, top + (stack.children.length - 1) * peek - offset);
    viewport.scrollTop = start + (end - start) * index / Math.max(1, stack.children.length - 1);
  }, index);
  await expect(page.locator('#decklistBox .vg-stack').first().locator('.stack-active'))
    .toHaveAttribute('data-idx', String(index));
  await page.locator('#decklistBox .vg-stack').first().evaluate(stack => Promise.allSettled(
    stack.getAnimations({ subtree: true }).map(animation => animation.finished),
  ));
}

test('scrolling stacks reveals one full card without height jumps or badges leaking across cards', async ({ page }, info) => {
  await page.evaluate(() => {
    const base = workspaceDeck.cards[0];
    workspaceDeck.cards = Array.from({ length: 22 }, (_, i) => ({ ...base,
      id: 'stack-' + i, name: `Stack ${String(i).padStart(2, '0')}`, type_line: 'Creature — Wizard',
      proxy: i % 2 === 0, layout: 'transform', card_faces: [
        { name: 'Front', type_line: 'Creature', image_uris: { normal: '/icon-192.png' } },
        { name: 'Back', type_line: 'Creature', image_uris: { normal: '/icon-512.png' } },
      ],
    }));
    workspaceDeck.cards.push({ ...workspaceDeck.cards[21] });
    state.collection.items = workspaceDeck.cards.filter((_, i) => i % 2).map(c => ({name:c.name,qty:1,set:'tst',cn:'1'}));
    state._ownedSet = null;
    workspaceDeck.maybeboard = [];
    state.sortMode = 'name';
    state.collapsed = {};
    setDlView('stack');
    refreshDecklistBox(workspaceDeck);
  });
  const stack = page.locator('#decklistBox .vg-stack').first();
  await expect(stack.locator('.stack-active')).toHaveCount(1);
  await expect(stack.locator('.vg-qty')).toHaveText('×2');
  await expect(stack.locator('.vg-qty')).toBeVisible();
  const height = (await stack.boundingBox()).height;
  await scrollStackToCard(page, 8);
  expect((await stack.boundingBox()).height).toBeCloseTo(height, 0);
  const active = stack.locator('.stack-active');
  const full = await active.boundingBox();
  expect(full.height).toBeCloseTo(full.width * 88 / 63, 0);
  await expect(active).toHaveCSS('isolation', 'isolate');
  await expect(active.locator('.cb-proxy')).toBeVisible();
  await expect(active.locator('.dfc-flip')).toBeVisible();
  const inactive = stack.locator('.vg-card:not(.stack-active)');
  for (const badge of await inactive.locator('.card-badges, .dfc-flip-box').all())
    await expect(badge).toBeHidden();
  await scrollStackToCard(page, 9);
  await expect(active.locator('.cb-own')).toBeVisible();
  await active.locator('.dfc-flip').click();
  await expect(active.locator('.dfc-flip')).toHaveClass(/flipped/);
  await expect(page.locator('#cardSheetOverlay')).toHaveCount(0);
  await scrollStackToCard(page, 16);
  expect((await stack.boundingBox()).height).toBeCloseTo(height, 0);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/deck-stacks-reviewed-${info.project.name}.png` });
  await scrollStackToCard(page, 0);
});

test('the last three stacked cards remain fully reachable near the lower focus point', async ({ page }) => {
  await page.evaluate(() => {
    const base = workspaceDeck.cards[0];
    workspaceDeck.cards = Array.from({length:24}, (_,i) => ({...base,id:'tail-'+i,name:'Tail '+String(i).padStart(2,'0'),type_line:'Creature',proxy:true}));
    workspaceDeck.cards.forEach(card => { state.priceCache[card.name] = {v:1,t:Date.now()}; });
    workspaceDeck.maybeboard = [];
    state.sortMode = 'name';
    setDlView('stack');
    refreshDecklistBox(workspaceDeck);
  });
  const original = page.viewportSize();
  for (const height of [original.height, 1200]) {
    await page.setViewportSize({...original,height});
    // Responsive layout and the page's initial scroll restoration settle first.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    for (const index of [21,22,23]) {
      await scrollStackToCard(page,index);
      const body = await page.locator('.deck-workspace > .page-content').boundingBox();
      const card = await page.locator('.vg-stack .stack-active').first().boundingBox();
      expect(card.y).toBeGreaterThanOrEqual(body.y-1);
      expect(card.y+card.height).toBeLessThanOrEqual(body.y+body.height+1);
      expect(card.y+card.height).toBeGreaterThan(body.y+body.height*0.8);
    }
    await page.locator('.deck-workspace > .page-content').evaluate(el=>el.scrollTop=el.scrollHeight);
    await expect(page.locator('.vg-stack .stack-active').first()).toHaveAttribute('data-idx','23');
  }
});

test('deck issues are inline warnings, with no expandable validity popup', async ({ page }, info) => {
  const frame = page.locator('.deck-overview');
  const text = page.locator('#deckIssueText');
  await expect(frame).toHaveClass(/has-issues/);
  await expect(frame.getByRole('img',{name:'Deck needs attention'})).toBeVisible();
  await mkdir('var/previews', {recursive:true});
  await page.screenshot({path:`var/previews/deck-inline-warnings-${info.project.name}.png`});
  const red = await text.evaluate(el=>getComputedStyle(el).color);
  expect(red).toBe(await frame.locator('.deck-issue-flag').evaluate(el=>getComputedStyle(el).color));
  await text.click();
  await page.locator('#capDeckCount').click();
  await expect(page.locator('#legalityBox,#legalityWrap')).toHaveCount(0);
  expect(await text.evaluate(el=>el.tagName)).toBe('P');
  await page.evaluate(()=>{
    const base=workspaceDeck.cards[0];
    workspaceDeck.cards=Array.from({length:60},(_,i)=>({...base,id:'legal-'+i,name:'Legal '+i,type_line:'Creature'}));
    workspaceDeck.maybeboard=[];
    refreshDecklistBox(workspaceDeck);
  });
  await expect(frame).not.toHaveClass(/has-issues/);
  await expect(frame.locator('.deck-issue-flag')).toBeHidden();
  await expect(text).toHaveText('No deck-building issues found.');
  expect(await text.evaluate(el=>getComputedStyle(el).color)).not.toBe(red);
});

test('deck Inspiration is a tab, Deck Log remains in the menu, and replacing an existing deck is absent', async ({ page }) => {
  await page.evaluate(()=>{
    _metaData={from:'2026-11-01',to:'2026-11-07',formats:{modern:{decks:10,archetypes:[{
      name:'Archive control',key:'Archive 00',colors:'U',share:12,style:'control',n:10,
      main:[[4,'Archive 00'],[4,'New inspiration card']],side:[],
    }]}}};
  });
  await page.getByRole('tab',{name:'Inspiration',exact:true}).click();
  await expect(page.locator('.deck-inspiration')).toBeVisible();
  await expect(page.locator('#inspireResults .meta-tile')).toContainText('Archive control');
  await expect(page.locator('#inspireResults .mt-extra')).toHaveText('1/2 cards in common');
  expect(await page.evaluate(()=>state.screen)).toBe('decklist');
  await page.locator('#menuBtn').click();
  await expect(page.locator('#menuPop #dockInspire,#menuPop #mImport')).toHaveCount(0);
  await page.locator('#deckLog').click();
  await expect(page.getByRole('dialog',{name:'Deck Log',exact:true})).toBeVisible();
  await expect(page.locator('#logGameBtn')).toBeVisible();
  await page.locator('#deckLogClose').click();
  await expect(page.locator('#deckLogOverlay')).toHaveCount(0);
  await expect(page.getByRole('tab',{name:'Inspiration',exact:true})).toHaveAttribute('aria-selected','true');
  await page.evaluate(()=>switchPage('decks'));
  await page.locator('#deckFab').click();
  await expect(page.locator('#fabImportDeck')).toBeVisible();
});

test('Commander Inspiration keeps recommendations and theme changes inside the deck tab', async ({ page }, info) => {
  await page.evaluate(()=>{
    const base=workspaceDeck.cards[0];
    workspaceDeck.format='commander';
    workspaceDeck.admiral={...base,id:'inspiration-leader',name:'Inspiration Captain',type_line:'Legendary Creature — Wizard'};
    const key=inspLeaderKey(workspaceDeck);
    const card={...base,id:'inspiration-new',name:'Fresh recommendation',type_line:'Creature — Wizard',legalities:{commander:'legal'}};
    const themed={...card,id:'inspiration-theme',name:'Theme recommendation'};
    state._inspEdh={[key]:{pool:[card],sections:[],themes:[{slug:'draw',label:'Card Draw'}],stats:null}};
    state._inspEdhTheme={[key+'/draw']:{pool:[themed],sections:[],stats:null}};
    state.inspireSel={kindred:'',theme:''};
    state._inspireSelFor=workspaceDeck.id;
    render();
  });
  await page.getByRole('tab',{name:'Inspiration',exact:true}).click();
  await expect(page.locator('#inspireResults img[alt="Fresh recommendation"]')).toBeVisible();
  await expect(page.locator('.deck-inspiration .browse-selects')).toBeVisible();
  await page.evaluate(()=>_csHandlers.inspTheme('draw'));
  await expect(page.locator('#inspireResults img[alt="Theme recommendation"]')).toBeVisible();
  await mkdir('var/previews', {recursive:true});
  await page.screenshot({path:`var/previews/deck-inspiration-tab-${info.project.name}.png`});
  expect(await page.evaluate(()=>state.screen)).toBe('decklist');
  await page.getByRole('tab',{name:'Decklist',exact:true}).click();
  await expect(page.locator('.deck-overview')).toBeVisible();
  await expect(page.locator('#inspireResults')).toHaveCount(0);
});

test('swipe navigation slides only deck content and respects reduced motion', async ({ page }) => {
  const header=await page.locator('.app-header').boundingBox();
  const nav=await page.locator('.app > .app-navigation').boundingBox();
  await swipeDeck(page,{dx:-140});
  const frames=await page.locator('#builderBody').evaluate(body=>{
    const animation=body.getAnimations()[0];
    return animation?.effect.getKeyframes().map(frame=>frame.transform);
  });
  expect(frames).toHaveLength(2);
  expect(frames[0]).toMatch(/translateX\([1-9]/);
  expect(await page.locator('.app-header').boundingBox()).toEqual(header);
  expect(await page.locator('.app > .app-navigation').boundingBox()).toEqual(nav);
  await page.locator('#builderBody').evaluate(body=>Promise.allSettled(body.getAnimations().map(animation=>animation.finished)));
  await swipeDeck(page,{dx:140});
  expect(await page.locator('#builderBody').evaluate(body=>body.getAnimations()[0]?.effect.getKeyframes()[0].transform)).toMatch(/translateX\(-/);
  await page.emulateMedia({reducedMotion:'reduce'});
  await swipeDeck(page,{dx:-140});
  expect(await page.locator('#builderBody').evaluate(body=>body.getAnimations().length)).toBe(0);
});

test('deck Inspiration categories collapse independently, survive refreshes and tab changes, and have no land-base button', async ({ page }) => {
  await page.evaluate(() => {
    const base = workspaceDeck.cards[0];
    workspaceDeck.format = 'commander';
    workspaceDeck.admiral = {...base, name: 'Collapse Captain', type_line: 'Legendary Creature — Wizard'};
    const key = inspLeaderKey(workspaceDeck);
    const pool = Array.from({length: 12}, (_, i) => ({...base, id: 'collapse-' + i, name: 'New pick ' + i}));
    const land = {...base, id: 'collapse-land', name: 'New land', type_line: 'Land'};
    state._inspEdh = {[key]: {pool: [...pool, land], sections: [], themes: [], stats: null}};
    pool.concat(land).forEach(card => state.priceCache[card.name] = {v: 1, t: Date.now()});
    state.inspireSel = {kindred: '', theme: ''};
    state._inspireSelFor = workspaceDeck.id;
    render();
  });
  await page.getByRole('tab', {name: 'Inspiration', exact: true}).click();
  const categories = page.locator('.deck-inspiration-category');
  await expect(categories).toHaveCount(2);
  await expect(page.locator('#inspLandBase, .insp-land-row')).toHaveCount(0);
  const creatures = categories.filter({has: page.locator('summary', {hasText: 'Creatures'})});
  const lands = categories.filter({has: page.locator('summary', {hasText: 'Lands'})});
  await expect(creatures.locator('.sr-grid img')).toHaveCount(10);
  await creatures.locator('summary').click();
  await expect(creatures).not.toHaveAttribute('open', '');
  await expect(creatures.locator('.sr-grid')).toBeHidden();
  await expect(lands.locator('.sr-grid')).toBeVisible();
  await page.evaluate(() => state._inspRepaint());
  await expect(creatures.locator('.sr-grid')).toBeHidden();
  await page.getByRole('tab', {name: 'Decklist', exact: true}).click();
  await page.getByRole('tab', {name: 'Inspiration', exact: true}).click();
  await expect(creatures.locator('.sr-grid')).toBeHidden();
  await creatures.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(creatures.locator('.sr-grid')).toBeVisible();
  await creatures.getByRole('button', {name: 'More', exact: true}).click();
  await expect(creatures.locator('.sr-grid img')).toHaveCount(12);
  await lands.locator('summary').click();
  await expect(lands.locator('.sr-grid')).toBeHidden();
  await page.locator('#inspJump').click();
  await page.locator('#tileMenuPop').getByRole('button', {name: 'Utility Lands', exact: true}).click();
  await expect(lands.locator('.sr-grid')).toBeVisible();
  await expect(lands.locator('summary')).toBeInViewport();
  // The fallback recommendations also retain expandable groups.
  await page.evaluate(() => {
    state.inspireCache[inspireCacheKey(workspaceDeck)] = state._inspEdh[inspLeaderKey(workspaceDeck)].pool;
    renderInspireFromCache(inspireCacheKey(workspaceDeck), workspaceDeck, true);
  });
  await expect(categories).toHaveCount(2);
  await categories.first().locator('summary').click();
  await expect(categories.first().locator('.sr-grid')).toBeHidden();
});

test('Versions uses a themed scrollable dialog and restores saved decks as copies', async ({ page }, info) => {
  await page.evaluate(async () => {
    for (let i = 0; i < 12; i++) {
      const snapshot = {...workspaceDeck, cards: workspaceDeck.cards.slice(0, i + 1)};
      const t = Date.now() - (12 - i) * 60000;
      await dvPut({id: snapshot.id, name: snapshot.name, start: t, t, why: 'edit', n: snapshot.cards.length, j: JSON.stringify(snapshot)});
    }
  });
  await page.getByRole('button', {name: 'Deck actions', exact: true}).click();
  await page.locator('#mVersions').click();
  const dialog = page.getByRole('dialog', {name: 'Deck versions', exact: true});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.dv-row')).toHaveCount(12);
  await expect(dialog.locator('.dv-row').first()).toContainText('12 cards');
  await expect(dialog.locator('.dv-row').last()).toContainText('1 card');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => {state.theme = theme; applyTheme();}, theme);
    const samples = await auditContrast(page, '#dvSheet .card-transfer-dialog');
    expect(samples.filter(s => s.ratio < s.minimum), theme).toEqual([]);
  }
  await page.setViewportSize({width: 320, height: 480});
  await expect.poll(async () => {
    const rect = await dialog.boundingBox();
    return rect.y + rect.height;
  }).toBeLessThanOrEqual(465);
  const heading = await dialog.locator('.transfer-heading').boundingBox();
  const footer = await dialog.locator('.card-transfer-actions').boundingBox();
  await dialog.locator('.card-transfer-body').evaluate(el => el.scrollTop = el.scrollHeight);
  expect(await dialog.locator('.transfer-heading').boundingBox()).toEqual(heading);
  expect(await dialog.locator('.card-transfer-actions').boundingBox()).toEqual(footer);
  await mkdir('var/previews', {recursive: true});
  await page.screenshot({path: `var/previews/deck-versions-${info.project.name}.png`});
  await dialog.locator('.dv-row').last().getByRole('button', {name: 'As copy', exact: true}).click();
  await page.locator('#iacOk').click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => state.decksIndex.length)).toBe(2);
  expect(await page.evaluate(() => state.decksIndex[0].cards.length)).toBe(1);
});

test('Stats owns the card-type counts and opens matching cards independently of deck sorting', async ({page},info)=>{
  await page.evaluate(()=>{
    workspaceDeck.format='commander';
    workspaceDeck.admiral={...workspaceDeck.cards[0],id:'type-count-leader',name:'Type count captain',type_line:'Legendary Artifact Creature — Human'};
    state.priceCache[workspaceDeck.admiral.name]={v:1,t:Date.now()};
    state.sortMode='name';
    render();
  });
  await page.getByRole('button',{name:'Deck actions',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'Deck actions',exact:true});
  await expect(menu.locator('#deckBulkEdit, [data-deck-type]')).toHaveCount(0);
  const groups=await menu.locator('.deck-menu-group:has(> h2)').evaluateAll(groups=>groups.map(group=>({
    title:group.querySelector('h2').textContent,buttons:[...group.querySelectorAll('.hub-card')].map(button=>button.id),
  })));
  expect(groups).toEqual([
    {title:'Manage deck',buttons:['mFormat','mAddFolder','mDuplicate']},
    {title:'History & notes',buttons:['deckLog','mVersions']},
    {title:'Share & export',buttons:['mShare','mExport']},
  ]);
  await menu.getByRole('button',{name:'Back to deck',exact:true}).click();
  await expect(menu).toHaveCount(0);
  await page.getByRole('tab',{name:'Stats',exact:true}).click();
  const types=page.getByRole('region',{name:'Card types',exact:true});
  await expect(types.locator('[data-deck-type="Creatures"] strong')).toHaveText('9');
  await expect(types.locator('[data-deck-type="Artifacts"] strong')).toHaveText('8');
  await expect(types.locator('[data-deck-type="Instants"] strong')).toHaveText('8');
  await mkdir('var/previews',{recursive:true});
  await types.scrollIntoViewIfNeeded();
  await page.screenshot({path:`var/previews/deck-stats-card-types-${info.project.name}.png`});
  await types.locator('[data-deck-type="Artifacts"]').click();
  await expect(page.getByRole('tab',{name:'Decklist',exact:true})).toHaveAttribute('aria-selected','true');
  expect(await page.evaluate(()=>state.dlFilter.type)).toBe('Artifact');
  expect((await visibleMainCardNames(page)).length).toBe(7);
  await page.getByRole('button',{name:'Filter deck cards',exact:true}).click();
  await expect(page.locator('#dfType')).toHaveValue('Artifact');
});
