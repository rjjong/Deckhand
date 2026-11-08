import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { auditContrast } from './helpers/contrast.mjs';

async function prepare(page, initial = {}) {
  await markCurrentReleaseSeen(page);
  let status = {
    ok: true,
    configured: true,
    busy: false,
    state: 'ready',
    left: 10,
    limit: 10,
    cooldownSeconds: 30,
    retryAfter: 0,
    ...initial,
  };
  let calls = 0;
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/judge/status') {
      calls++;
      return route.fulfill({ json: status });
    }
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page
    .locator('.app > .app-navigation')
    .getByRole('button', { name: 'Life', exact: true })
    .click();
  await page.clock.install();
  await page.evaluate(() => {
    state.guild = 'dimir';
    applyTheme();
    state._cr = [
      { n: '704.5f', t: 'A creature with toughness 0 or less is put into its owner’s graveyard.' },
    ];
    openCROverlay('judge');
  });
  await expect(page.locator('#cjAvailability')).toHaveAttribute('data-state', status.state);
  return {
    setStatus: (next) => {
      status = { ...status, ...next };
    },
    calls: () => calls,
  };
}

test('busy status updates automatically, leaves questions intact and does not charge declined or cached requests', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const f = await prepare(page, { state: 'busy', busy: true });
  let cached = false,
    asks = 0;
  await page.route('**/api/judge', (route) => {
    asks++;
    return route.fulfill(
      cached
        ? {
            json: {
              ok: true,
              cached: true,
              left: 10,
              limit: 10,
              answer: 'Yes. Zero toughness puts it into the graveyard.',
              cites: ['704.5f'],
              confident: true,
            },
          }
        : { status: 503, json: { ok: false, error: 'busy', left: 10, limit: 10, retryAfter: 10 } },
    );
  });
  await expect(page.locator('#cjAvailability')).toContainText('helping another player');
  await expect(page.locator('#crCount')).toHaveText('10 left');
  await expect(page.locator('#crJudge')).toBeEnabled();
  await page.locator('#crQ').fill('Does a creature with zero toughness die?');
  await page.locator('#crJudge').click();
  await expect(page.locator('#crBody')).toContainText('your allowance was not used');
  await expect(page.locator('.cr-rule')).toContainText('704.5f');
  await expect(page.locator('#crQ')).toHaveValue('Does a creature with zero toughness die?');
  await expect(page.locator('#crCount')).toHaveText('10 left');
  const previous = f.calls();
  f.setStatus({ state: 'ready', busy: false });
  await page.clock.fastForward(10000);
  await expect.poll(f.calls).toBeGreaterThan(previous);
  await expect(page.locator('#cjAvailability')).toContainText('ready for a question');
  cached = true;
  await page.locator('#crJudge').click();
  await expect(page.locator('.cja-a')).toContainText('Yes. Zero toughness');
  await expect(page.locator('#crCount')).toHaveText('10 left');
  expect(asks).toBe(2);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/judge-capacity-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('cooldowns and daily limits show the rules and still allow cached questions', async ({
  page,
}) => {
  const f = await prepare(page, { state: 'cooldown', left: 9, retryAfter: 18 });
  let response = {
    status: 429,
    json: { ok: false, error: 'cooldown', left: 9, limit: 10, retryAfter: 18 },
  };
  await page.route('**/api/judge', (route) => route.fulfill(response));
  await expect(page.locator('#cjAvailability')).toContainText('18 seconds');
  await page.locator('#crQ').fill('Does a creature with zero toughness die?');
  await page.locator('#crJudge').click();
  await expect(page.locator('#crBody')).toContainText('Try again in about 18 seconds');
  await expect(page.locator('.cr-rule')).toContainText('704.5f');
  response = { status: 429, json: { ok: false, error: 'limit', left: 0, limit: 10 } };
  f.setStatus({ state: 'limit', left: 0 });
  await page.locator('#crJudge').click();
  await expect(page.locator('#crBody')).toContainText('10 new questions for today');
  await expect(page.locator('#cjAvailability')).toContainText('Saved answers are still available');
  await expect(page.locator('#crJudge')).toBeEnabled();
  response = {
    status: 200,
    json: {
      ok: true,
      cached: true,
      left: 0,
      limit: 10,
      answer: 'Yes.',
      cites: [],
      confident: true,
    },
  };
  await page.locator('#crJudge').click();
  await expect(page.locator('.cja-a')).toHaveText('Yes.');
  await expect(page.locator('#crCount')).toHaveText('0 left');
});

test('availability polling stops while hidden, in the rules browser and after leaving the Judge', async ({
  page,
}) => {
  const f = await prepare(page);
  await page.evaluate(() => {
    window.testJudgeHidden = true;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => window.testJudgeHidden,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = f.calls();
  await page.clock.fastForward(30000);
  expect(f.calls()).toBe(hidden);
  await page.evaluate(() => {
    window.testJudgeHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(f.calls).toBeGreaterThan(hidden);
  await page.locator('#crOpenRules').click();
  await expect(page.locator('#cjAvailability')).toBeHidden();
  const rules = f.calls();
  await page.clock.fastForward(30000);
  expect(f.calls()).toBe(rules);
  await page.goBack();
  await expect(page.locator('#cjAvailability')).toBeVisible();
  await expect.poll(f.calls).toBeGreaterThan(rules);
  await page
    .locator('#crOverlay .app-navigation')
    .getByRole('button', { name: 'Decks', exact: true })
    .click();
  await expect(page.locator('#crOverlay')).toHaveCount(0);
  const closed = f.calls();
  await page.clock.fastForward(30000);
  expect(f.calls()).toBe(closed);
});

test('availability and policy text fit small screens and remain readable in every color scheme', async ({
  page,
}) => {
  await prepare(page, { state: 'busy', busy: true });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
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
      expect(
        await page.locator('#cjAvailability').evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await expect(page.locator('#crJudge')).toBeInViewport();
      const samples = await auditContrast(page, '#cjAvailability');
      expect(
        samples.filter((sample) => sample.ratio < sample.minimum),
        `${theme} ${guild}`,
      ).toEqual([]);
    }
});
