import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const commander = (name) => ({
  id: name.toLowerCase().replaceAll(' ', '-'),
  name,
  oracle_id: name.toLowerCase().replaceAll(' ', '-'),
  type_line: 'Legendary Creature — Human',
  oracle_text: 'Partner',
  keywords: ['Partner'],
  color_identity: ['U'],
  colors: ['U'],
  mana_cost: '{2}{U}',
  cmc: 3,
  legalities: { commander: 'legal' },
  prices: {},
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Simulate an overlay keyboard: the visual viewport shrinks and pans,
    // while the layout viewport keeps its original dimensions.
    let height = null,
      top = 0;
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => height ?? innerHeight },
      width: { get: () => innerWidth },
      offsetTop: { get: () => top },
      offsetLeft: { get: () => 0 },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.setKeyboardViewport = (nextHeight, nextTop = 0) => {
      height = nextHeight;
      top = nextTop;
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
  });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname === '/api/scryfall/cards/search') {
      const partner = /beta/i.test(url.searchParams.get('q'));
      return route.fulfill({
        json: {
          object: 'list',
          has_more: false,
          data: Array.from({ length: 12 }, (_, i) =>
            commander((partner ? 'Beta Partner ' : 'Alpha Captain ') + i),
          ),
        },
      });
    }
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
});

test('New Deck floats centrally and stays inside a resized viewport', async ({ page }) => {
  await page.evaluate(() => openModal('newdeck'));
  const dialog = page.getByRole('dialog', { name: 'New Deck', exact: true });
  await expect(dialog).toBeVisible();
  const original = page.viewportSize();
  const initial = await dialog.boundingBox();
  expect(initial.y + initial.height / 2).toBeCloseTo(original.height / 2, 0);
  expect(initial.x + initial.width / 2).toBeCloseTo(original.width / 2, 0);
  expect(initial.x).toBeGreaterThanOrEqual(16);
  expect(
    await dialog.evaluate((el) => parseFloat(getComputedStyle(el).borderBottomLeftRadius)),
  ).toBe(22);
  await page.setViewportSize({ width: original.width, height: 420 });
  await expect
    .poll(async () => {
      const bounds = await dialog.boundingBox();
      return Math.abs(bounds.y + bounds.height / 2 - 210);
    })
    .toBeLessThan(1);
  const resized = await dialog.boundingBox();
  expect(resized.y).toBeGreaterThanOrEqual(16);
  expect(resized.y + resized.height).toBeLessThanOrEqual(404);
  await page.locator('#newDeckFmtBtn').click();
  await expect(page.locator('#newDeckFmtPop')).toBeVisible();
  await page.locator('[data-ndfmt="modern"]').click();
  await expect(page.locator('#newDeckFmtPop')).toBeHidden();
  await expect(page.locator('#ndCmdWrap')).toBeHidden();
  await page.locator('#cancelBtn').click();
  await expect(dialog).toHaveCount(0);
});

test('commander and partner suggestions stay above an overlay keyboard and can be selected', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    state.guild = 'dimir';
    applyTheme();
    openModal('newdeck');
  });
  await page.locator('#newDeckName').fill('Visible commander choices');
  await page.locator('#ndCmd').focus();
  await page.evaluate(() => setKeyboardViewport(360, 40));
  const beforeSuggestions = await page.evaluate(() => ({
    height: document.querySelector('.nd-sheet').getBoundingClientRect().height,
    scrollHeight: document.querySelector('.nd-fields').scrollHeight,
    actionsTop: document.querySelector('.nd-sheet .modal-actions').getBoundingClientRect().top,
  }));
  await page.locator('#ndCmd').fill('Alpha');
  const popup = page.locator('#ndCmdPop');
  await expect(popup).toBeVisible();
  await expect(popup.locator('button')).toHaveCount(12);
  await expect
    .poll(async () => {
      const input = await page.locator('#ndCmd').boundingBox();
      const list = await popup.boundingBox();
      return input.y >= 40 && list.y >= 48 && list.y + list.height <= 392;
    })
    .toBe(true);
  expect(await popup.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await popup.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('column');
  const afterSuggestions = await page.evaluate(() => ({
    height: document.querySelector('.nd-sheet').getBoundingClientRect().height,
    scrollHeight: document.querySelector('.nd-fields').scrollHeight,
    actionsTop: document.querySelector('.nd-sheet .modal-actions').getBoundingClientRect().top,
  }));
  expect(afterSuggestions).toEqual(beforeSuggestions);
  expect(await popup.evaluate((el) => el.parentElement.matches('.nd-sheet'))).toBe(true);
  expect(
    await page.evaluate(() =>
      ['cancelBtn', 'createBtn'].every((id) => {
        const button = document.getElementById(id),
          rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return (
          rect.top >= 40 && rect.bottom <= 400 && (target === button || button.contains(target))
        );
      }),
    ),
  ).toBe(true);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/new-deck-keyboard-${info.project.name}.png` });
  await popup.locator('button').first().click();
  await expect(page.locator('#ndCmd')).toHaveValue('Alpha Captain 0');
  await expect(page.locator('#ndP2Wrap')).toBeVisible();
  await page.locator('#ndCmd2').fill('Beta');
  const partners = page.locator('#ndCmd2Pop');
  await expect(partners).toBeVisible();
  await expect
    .poll(async () => {
      const input = await page.locator('#ndCmd2').boundingBox();
      const list = await partners.boundingBox();
      return input.y >= 40 && list.y >= 48 && list.y + list.height <= 392;
    })
    .toBe(true);
  expect(
    await page.evaluate(() =>
      ['cancelBtn', 'createBtn'].every((id) => {
        const button = document.getElementById(id),
          rect = button.getBoundingClientRect();
        return (
          rect.top >= 40 &&
          rect.bottom <= 400 &&
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button
        );
      }),
    ),
  ).toBe(true);
  await partners.locator('button').first().click();
  await page.locator('#createBtn').click();
  await expect(page.locator('.nd-sheet')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => getDeck(state.activeDeckId)?.admiral?.name))
    .toBe('Alpha Captain 0');
  expect(await page.evaluate(() => getDeck(state.activeDeckId)?.partner?.name)).toBe(
    'Beta Partner 0',
  );
  await page.evaluate(() => {
    setKeyboardViewport(null);
    openModal('newdeck');
  });
  await page.locator('#ndCmd').fill('Alpha');
  await expect(page.locator('#ndCmdPop')).toBeVisible();
  await page.locator('#cancelBtn').click();
  await expect(page.locator('.nd-sheet')).toHaveCount(0);
  await page.evaluate(() => openModal('newdeck'));
  await page.keyboard.press('Escape');
  await expect(page.locator('.nd-sheet')).toHaveCount(0);
  await page.evaluate(() => setKeyboardViewport(320, 20));
  expect(errors).toEqual([]);
});
