import { test, expect } from '@playwright/test';
import { markCurrentReleaseSeen } from './helpers/version.mjs';

for (const [device, theme, guild, main, side] of [
  ['dark', 'dark', 'rakdos', 'B', 'R'],
  ['light', 'light', 'azorius', 'W', 'U'],
])
  test(`${device} device starts with ${guild} and preserves a saved custom scheme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: device });
    await markCurrentReleaseSeen(page);
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/assets/scanner/')) return route.abort();
      if (url.pathname.startsWith('/api/'))
        return route.fulfill({ json: { items: [], data: [], object: 'list', has_more: false } });
      return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
    });
    await page.goto('/');
    await expect(page.locator('.app-navigation')).toBeVisible();
    expect(await page.evaluate(() => ({ theme: state.theme, guild: state.guild }))).toEqual({
      theme,
      guild,
    });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('html')).toHaveAttribute('data-main', main);
    await expect(page.locator('html')).toHaveAttribute('data-side', side);
    await page.evaluate(async () => {
      state.theme = 'dark';
      state.guild = 'dimir';
      applyTheme();
      await persistSettings();
    });
    await page.emulateMedia({ colorScheme: device === 'dark' ? 'light' : 'dark' });
    await page.reload();
    await expect(page.locator('.app-navigation')).toBeVisible();
    expect(await page.evaluate(() => ({ theme: state.theme, guild: state.guild }))).toEqual({
      theme: 'dark',
      guild: 'dimir',
    });
  });
