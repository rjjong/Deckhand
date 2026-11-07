import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { auditContrast } from './helpers/contrast.mjs';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    if (url.origin === 'http://127.0.0.1:3100') return route.continue();
    return route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.getByRole('button', { name: 'Decks', exact: true }).click();
  await page.evaluate(() => {
    state.guild = 'dimir';
    applyTheme();
    createNewDeck('Transfer fixture', 'modern');
    const d = getDeck(state.activeDeckId);
    d.cards = ['Sol Ring', 'Arcane Signet'].map((name, index) => ({
      id: 'transfer-' + index,
      name,
      type_line: 'Artifact',
      cmc: index + 1,
      colors: [],
      color_identity: [],
      set: 'tst',
      collector_number: String(index + 1),
      prices: { eur: '2.00' },
      legalities: { modern: 'legal' },
    }));
    state.collection.items = [{ name: 'Sol Ring', qty: 2, set: 'tst', cn: '1', cond: 'NM' }];
    state.collection.binders = [{ id: 'transfer-binder', name: 'Trade binder' }];
    render();
  });
});

async function openDeckTransfer(page, mode) {
  await page.locator('#menuBtn').click();
  const menu = page.getByRole('dialog', { name: 'Deck actions', exact: true });
  await expect(menu.locator('#mImport')).toBeVisible();
  await expect(menu.locator('#mExport')).toBeVisible();
  await menu.locator(mode === 'import' ? '#mImport' : '#mExport').click();
  await expect(
    page.getByRole('dialog', {
      name: mode === 'import' ? 'Import deck' : 'Export deck',
      exact: true,
    }),
  ).toBeVisible();
}

async function expectFits(page, dialog) {
  const viewport = page.viewportSize();
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(15);
  expect(bounds.y).toBeGreaterThanOrEqual(19);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 15);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 19);
  expect(bounds.width).toBeLessThanOrEqual(480);
  await expect(dialog).toHaveCSS('border-radius', '22px');
  await expect(dialog.getByRole('button', { name: 'Close import/export' })).toBeInViewport();
  const closeIcon = dialog.locator('.transfer-close svg');
  await expect(closeIcon).toBeVisible();
  const iconBounds = await closeIcon.boundingBox();
  expect(iconBounds.x + iconBounds.width).toBeLessThan(bounds.x + bounds.width);
  expect(iconBounds.y).toBeGreaterThanOrEqual(bounds.y);
  const painted = await closeIcon.evaluate((icon) => {
    const r = icon.getBoundingClientRect();
    return icon
      .closest('button')
      .contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  expect(painted).toBe(true);
  expect(
    await dialog.locator('.transfer-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
}

test('deck transfers use themed cards and retain formats, downloads, file loading and confirmation', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openDeckTransfer(page, 'export');
  let dialog = page.locator('#dlPanelBox .transfer-dialog');
  await expectFits(page, dialog);
  await mkdir('var/previews', { recursive: true });
  await expect(dialog).toHaveAttribute('aria-label', 'Export deck');
  await expect(page.locator('#exportText')).toHaveValue('1 Sol Ring\n1 Arcane Signet');
  for (const format of ['moxfield', 'cockatrice', 'plain']) {
    await dialog.locator(`[data-expfmt="${format}"]`).click();
    await expect(dialog.locator(`[data-expfmt="${format}"]`)).toHaveClass('active');
    await expect(page.locator('#exportText')).toHaveValue(/Sol Ring/);
  }
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#downloadExport').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Transfer fixture.txt');
  expect(await readFile(await download.path(), 'utf8')).toBe('1 Sol Ring\n1 Arcane Signet');
  const original = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 480 });
  await expectFits(page, dialog);
  const header = await dialog.locator('.transfer-heading').boundingBox();
  await dialog.locator('.transfer-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await dialog.locator('.transfer-heading').boundingBox()).toEqual(header);
  await expect(page.locator('#downloadExport')).toBeInViewport();
  await page.screenshot({ path: `var/previews/transfers-export-small-${info.project.name}.png` });
  await dialog.getByRole('button', { name: 'Close import/export' }).click();
  await expect(page.locator('#dlPanelBox .transfer-dialog')).toHaveCount(0);
  await openDeckTransfer(page, 'import');
  dialog = page.locator('#dlPanelBox .transfer-dialog');
  await page
    .locator('#importFile')
    .setInputFiles({ name: 'deck.txt', mimeType: 'text/plain', buffer: Buffer.from('1 Sol Ring') });
  await expect(page.locator('#importText')).toHaveValue('1 Sol Ring');
  expect(await page.evaluate(() => getDeck(state.activeDeckId).cards.length)).toBe(2);
  await page.locator('#applyImportBtn').click();
  await expect(page.locator('#inAppConfirm')).toContainText('replaces');
  await page.locator('#iacCancel').click();
  expect(await page.evaluate(() => getDeck(state.activeDeckId).cards.length)).toBe(2);
  await expectFits(page, dialog);
  await page.setViewportSize(original);
  await page.screenshot({ path: `var/previews/transfers-import-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('collection transfers fit small screens, keep the header visible, and export CSV', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    switchPage('collection');
    openCollectionImport('transfer-binder');
  });
  const dialog = page.getByRole('dialog', { name: 'Collection import / export', exact: true });
  await expectFits(page, dialog);
  await expect(page.locator('#ciBinder')).toHaveValue('transfer-binder');
  await page.locator('#ciFile').setInputFiles({
    name: 'cards.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Quantity\nSol Ring,2'),
  });
  await expect(page.locator('#ciText')).toHaveValue('Name,Quantity\nSol Ring,2');
  await expect(page.locator('#ciReport')).toContainText('cards.csv loaded');
  await page.setViewportSize({ width: 320, height: 480 });
  await expectFits(page, dialog);
  const header = await dialog.locator('.transfer-heading').boundingBox();
  await dialog.locator('.transfer-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await dialog.locator('.transfer-heading').boundingBox()).toEqual(header);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#ciExport').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  expect(await readFile(await download.path(), 'utf8')).toContain('Sol Ring');
  await page.screenshot({
    path: `var/previews/transfers-collection-small-${info.project.name}.png`,
  });
  await dialog.getByRole('button', { name: 'Close import/export' }).click();
  await expect(page.locator('#colImportOverlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('transfer dialogs remain readable in every guild and light or dark mode', async ({ page }) => {
  test.setTimeout(90000);
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
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
        },
        { guild, theme },
      );
      for (const mode of ['import', 'export']) {
        await page.evaluate((mode) => {
          state.dlPanel = null;
          toggleDlPanel(getDeck(state.activeDeckId), mode);
        }, mode);
        const samples = await auditContrast(page, '#dlPanelBox .transfer-dialog');
        expect(samples.length).toBeGreaterThan(2);
        expect(
          samples.filter((sample) => sample.ratio < sample.minimum),
          `${guild} ${theme} ${mode}`,
        ).toEqual([]);
      }
      await page.evaluate(() => {
        state.dlPanel = null;
        render();
        openCollectionImport('transfer-binder');
      });
      const samples = await auditContrast(page, '#colImportOverlay .transfer-dialog');
      expect(
        samples.filter((sample) => sample.ratio < sample.minimum),
        `${guild} ${theme} collection`,
      ).toEqual([]);
      await page.evaluate(() => closeTopOverlay());
    }
});
