import { test, expect } from '@playwright/test';

test('Local model setup and capacity failures show relevant rules without asking for browser credentials', async ({
  page,
}) => {
  let result;
  await page.addInitScript(() => localStorage.setItem('admiral_app:seenVersion', '1.50'));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/judge')
      return route.fulfill({ status: result.status, json: { ok: false, ...result.body } });
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [] } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  for (const [status, body, text] of [
    [503, { error: 'notconfigured' }, 'local judge is not set up on this server'],
    [429, { error: 'quota', retryAfter: 120 }, 'Try again in about 2 minutes'],
    [503, { error: 'busy' }, 'answering another question'],
    [502, { error: 'model' }, 'local judge model is not downloaded'],
    [400, { error: 'context' }, 'Try asking about fewer cards'],
  ]) {
    result = { status, body };
    await page.evaluate(() => {
      dismissAllOverlays();
      state._cr = [
        {
          n: '704.5f',
          t: 'A creature with toughness 0 or less is put into its owner’s graveyard.',
        },
      ];
      openCROverlay('judge');
    });
    const overlay = page.locator('#crOverlay');
    await overlay.locator('#crQ').fill('Does a creature with zero toughness die?');
    await overlay.locator('#crJudge').click();
    await expect(overlay.locator('#crBody')).toContainText(text);
    await expect(overlay.locator('.cr-rule')).toContainText('704.5f');
    await expect(overlay.locator('input[type="password"]')).toHaveCount(0);
    await expect(overlay.locator('#crJudge')).toBeEnabled();
  }
});
