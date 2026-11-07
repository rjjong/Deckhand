import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Keep a new installation independent of external services and card downloads.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    if (url.origin === 'http://127.0.0.1:3100') return route.continue();
    return route.abort();
  });
});

async function expectDirectStartup(page, title) {
  await page.goto('/');
  await expect(page.locator('.app > .app-navigation')).toBeVisible();
  await expect(page.locator('#brandTitle')).toHaveText(title);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('admiral_app:seenVersion')))
    .toBe(await page.evaluate(() => APP_VERSION));
  await expect(
    page.locator('#tourScrim, #welcomeScrim, #welcomeNote, #changelogScrim'),
  ).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('admiral_app:welcomed'))).toBeNull();
  expect(await page.evaluate(() => appLang())).toBe('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}

test('a fresh installation opens directly and has no language or introduction controls', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expectDirectStartup(page, 'DECKHAND');
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const metadata = await (await page.request.get('/version.json')).json();
  await expect(page.locator('#appFootNote')).toContainText(`Deckhand v${metadata.version}`);
  await expect(page.locator('#welcomeNote, #tourRow')).toHaveCount(0);
  await page.locator('#menuSettings').click();
  await expect(page.locator('#langRow, #languageBody, [data-lang-choice], #tourRow')).toHaveCount(
    0,
  );
  await expect(page.locator('#startupRow')).toBeVisible();
  await page.reload();
  await expect(page.locator('#brandTitle')).toHaveText('DECKHAND');
  await expect(page.locator('#tourScrim, #welcomeScrim, #changelogScrim')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('saved Dutch preferences use English while preserving startup and color choices', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('admiral_app:lang', 'nl');
    localStorage.setItem(
      'admiral_app:settings:app',
      JSON.stringify({
        theme: 'dark',
        guild: 'dimir',
        startupPage: 'collection',
      }),
    );
    window.nativeLanguages = [];
    window.DeckhandNotify = { setLang: (language) => window.nativeLanguages.push(language) };
  });
  await expectDirectStartup(page, 'COLLECTION');
  expect(
    await page.evaluate(() => ({
      savedLanguage: localStorage.getItem('admiral_app:lang'),
      nativeLanguages: window.nativeLanguages,
      theme: state.theme,
      guild: state.guild,
      startupPage: state.startupPage,
    })),
  ).toEqual({
    savedLanguage: 'en',
    nativeLanguages: ['en'],
    theme: 'dark',
    guild: 'dimir',
    startupPage: 'collection',
  });
  await expect(page.locator('#colSearchQ')).toHaveAttribute('placeholder', 'Search collection…');
  expect(errors).toEqual([]);
});
