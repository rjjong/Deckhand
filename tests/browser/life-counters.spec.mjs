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

test('counters can be selected and edited per player, saved, restored and reset for a new game', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('.commander-casts')).toHaveCount(2);
  await expect(page.locator('.life-counter-chip.extra')).toHaveCount(0);
  await player(page).locator('.lbadge').click();
  await player(page).getByRole('button', { name: 'Player counters', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Player counters', exact: true });
  await expect(dialog.getByLabel('Commander casts', { exact: true })).toBeChecked();
  for (const name of ['Mana', 'Energy', 'Experience', 'Storm']) {
    await dialog.getByLabel(name, { exact: true }).check();
    await dialog.getByRole('button', { name: `Increase ${name}`, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Increase Commander casts', exact: true }).click();
  await dialog.getByRole('button', { name: 'Increase Energy', exact: true }).click();
  await dialog.getByRole('button', { name: 'Decrease Energy', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Mana count', exact: true }).fill('12');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await player(page).locator('.done').click();
  await expect(player(page).locator('.life-counter-chip')).toHaveCount(5);
  await expect(player(page, 1).locator('.life-counter-chip')).toHaveCount(1);
  await expect(
    player(page).getByRole('button', { name: 'Mana: 12. Edit counter', exact: true }),
  ).toBeVisible();
  await player(page).getByRole('button', { name: 'Energy: 1. Edit counter', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Energy count', exact: true })).toBeFocused();
  await dialog.getByLabel('Energy', { exact: true }).uncheck();
  await expect(
    dialog.getByRole('spinbutton', { name: 'Energy count', exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel('Energy', { exact: true }).check();
  await expect(dialog.getByRole('spinbutton', { name: 'Energy count', exact: true })).toHaveValue(
    '1',
  );
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => lifeSavesAll()[0]?.d.players[0].counters.mana.value))
    .toBe(12);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/life-counters-${info.project.name}.png` });
  await page.evaluate(() => {
    dismissAllOverlays();
    render();
  });
  await page.reload();
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Life', exact: true })
    .click();
  await page.locator('#lifeSavedGames').click();
  await page.locator('[data-lr="0"]').click();
  await expect(player(page).locator('.life-counter-chip')).toHaveCount(5);
  await expect(
    player(page).getByRole('button', { name: 'Mana: 12. Edit counter', exact: true }),
  ).toBeVisible();
  await page.locator('#lifeCogBtn').click();
  await page.locator('#mTools').click();
  await page.locator('#restartLifeBtn').click();
  await page.locator('#iacOk').click();
  await page.locator('[data-lifefmt="constructed"]').click();
  await page.locator('#startGameBtn').click();
  await expect(page.locator('.life-counter-chip')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('dungeon rooms sit above life; roles and counters fit the player footer and options fit narrow cards', async ({
  page,
}, info) => {
  await mkdir('var/previews', { recursive: true });
  await page.evaluate(() => {
    const p = ensureLifePlayers()[0];
    p.monarch = p.initiative = true;
    p.dg = { id: 'uc', room: 'Secret Entrance' };
    Object.values(p.counters).forEach((counter) => {
      counter.enabled = true;
      counter.value = 12;
    });
    renderLifeGrid();
  });
  for (const size of [page.viewportSize(), { width: 320, height: 640 }]) {
    await page.setViewportSize(size);
    for (const layout of ['2f', '3t', '4q', '4m', '5q', '6q', '6e', '6m', '7q', '7m', '8q', '8e']) {
      const exists = await page.evaluate((id) => {
        const layout = LIFE_LAYOUTS.find((item) => item.id === id);
        if (!layout) return false;
        Object.assign(state.life, { layout: id, count: layout.count, rotate: true });
        renderLifeGrid();
        return true;
      }, layout);
      if (!exists) continue;
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const geometry = await player(page).evaluate((card) => {
        const footer = card.querySelector('.life-player-footer');
        const name = footer.querySelector('.pname-input');
        const commander = footer.querySelector('.commander-casts');
        const rect = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          overflow: footer.scrollWidth > footer.clientWidth + 1,
          nameWidth: name.clientWidth,
          commanderBeforeName:
            commander.compareDocumentPosition(name) === Node.DOCUMENT_POSITION_FOLLOWING,
          footer: rect(footer),
          card: rect(card),
          room: rect(card.querySelector('.ldungeon')),
          life: rect(card.querySelector('[data-setlife]')),
        };
      });
      expect(geometry.overflow, `${layout} ${JSON.stringify(geometry)}`).toBe(false);
      expect(geometry.nameWidth).toBeGreaterThan(15);
      expect(geometry.commanderBeforeName).toBe(true);
      const normalRoles = await player(page)
        .locator('.life-role-icon')
        .evaluateAll((icons) =>
          icons.map((icon) => {
            const rect = icon.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }),
        );
      expect(normalRoles).toHaveLength(2);
      normalRoles.forEach((role) =>
        expect(Math.min(role.width, role.height)).toBeGreaterThanOrEqual(20),
      );
      await player(page).locator('.lbadge').click();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const options = await player(page)
        .locator('.lf-extras')
        .evaluate((el) => ({
          overflow: el.scrollWidth > el.clientWidth + 1,
          count: el.children.length,
        }));
      expect(options, `${layout} ${size.width}×${size.height}`).toEqual({
        overflow: false,
        count: 4,
      });
      const focusedRoles = await player(page)
        .locator('.life-role-icon')
        .evaluateAll((icons) =>
          icons.map((icon) => {
            const rect = icon.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }),
        );
      for (let i = 0; i < normalRoles.length; i++)
        for (const field of ['x', 'y', 'width', 'height'])
          expect(focusedRoles[i][field], `${layout} role ${i} ${field}`).toBeCloseTo(
            normalRoles[i][field],
            1,
          );
      const overlap = await player(page).evaluate((card) => {
        const roles = [...card.querySelectorAll('.life-role-icon')].map((icon) =>
          icon.getBoundingClientRect(),
        );
        return [...card.querySelectorAll('.lf-extras button')].some((button) => {
          const r = button.getBoundingClientRect();
          return roles.some(
            (role) =>
              r.left < role.right - 1 &&
              r.right > role.left + 1 &&
              r.top < role.bottom - 1 &&
              r.bottom > role.top + 1,
          );
        });
      });
      expect(overlap, `${layout} status icons overlap player controls`).toBe(false);
      if (layout === '4q' && size.width === 320)
        await page.screenshot({
          path: `var/previews/life-player-options-${info.project.name}.png`,
        });

      await player(page).locator('.done').click();
    }
  }
  await page.evaluate(() => {
    Object.assign(state.life, { layout: '2f', count: 2, rotate: false });
    renderLifeGrid();
  });
  const positions = await player(page).evaluate((card) => {
    const room = card.querySelector('.ldungeon').getBoundingClientRect(),
      life = card.querySelector('[data-setlife]').getBoundingClientRect();
    return { roomBottom: room.bottom, lifeTop: life.top };
  });
  expect(positions.lifeTop).toBeGreaterThanOrEqual(positions.roomBottom);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/life-footer-${info.project.name}.png` });
});

test('counter dialog scrolls on a small phone and stays readable across every theme', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 320, height: 480 });
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  await player(page).locator('.lbadge').click();
  await player(page).getByRole('button', { name: 'Player counters', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Player counters', exact: true });
  for (const name of ['Mana', 'Energy', 'Experience', 'Storm'])
    await dialog.getByLabel(name, { exact: true }).check();
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
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
      const samples = await auditContrast(page, '#lifeCountersSheet');
      expect(
        samples.filter((sample) => sample.ratio < sample.minimum),
        `${theme} ${guild}`,
      ).toEqual([]);
    }
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/life-counter-dialog-${info.project.name}.png` });
});
