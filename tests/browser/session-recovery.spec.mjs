import { test, expect } from '@playwright/test';

const article = {
  t: 'Commander news fixture',
  u: 'https://example.invalid/article',
  d: '2026-11-04T00:00:00Z',
  src: 'EDHREC',
  fmt: 'commander',
  x: 'A cached article excerpt.',
};

async function prepare(page, context) {
  const state = { expired: false, health: 'ok', failCards: false, cardRequests: 0, probes: 0, logins: 0 };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/login') {
      state.expired = false;
      state.health = 'ok';
      state.logins++;
      return route.continue();
    }
    if (url.pathname === '/api/health') {
      state.probes++;
      expect(route.request().headers()['x-requested-with']).toBe('XMLHttpRequest');
      if (state.health === 'redirect')
        return route.fulfill({ status: 302, headers: { location: '/login-page' } });
      if (state.health === 'html')
        return route.fulfill({ contentType: 'text/html', body: '<html>Sign in</html>' });
      if (state.expired) return route.fulfill({ status: 401, body: 'Sign in' });
      return route.fulfill({ json: { ok: true, storage: 'sqlite' } });
    }
    if (url.pathname === '/login-page')
      return route.fulfill({ contentType: 'text/html', body: '<html>Sign in</html>' });
    if (url.pathname === '/api/news')
      return state.expired
        ? route.fulfill({ status: 401, body: 'Sign in' })
        : route.fulfill({ json: { items: [article] } });
    if (url.pathname.startsWith('/api/scryfall/')) {
      state.cardRequests++;
      if (state.failCards) return route.abort('connectionrefused');
      if (state.expired) return route.fulfill({ status: 401, body: 'Sign in' });
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    }
    if (state.expired && url.pathname.endsWith('/deckhand-badge.webp'))
      return route.fulfill({ status: 302, headers: { location: '/login-page' } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect(page.locator('.app > .app-navigation')).toBeVisible();
  await page.evaluate(() => resolveLegalSets());
  await expect.poll(() => page.evaluate(() => _sfWorking)).toBe(false);
  return state;
}

test('one failed card endpoint does not mark a healthy server offline', async ({ page, context }) => {
  const state = await prepare(page, context);
  state.failCards = true;
  expect(await page.evaluate(async () =>
    (await sfFetch(SF_BASE + '/cards/autocomplete?q=transient')).status)).toBe(503);
  expect(state.probes).toBeGreaterThan(0);
  expect(await page.evaluate(() => _netDown)).toBe(false);
  await expect(page.locator('#netChip')).toHaveCount(0);
});

for (const health of ['ok', 'redirect']) {
  test(`expired sign-in is actionable for ${health === 'ok' ? '401 responses' : 'login redirects'}`, async ({ page, context }) => {
    const state = await prepare(page, context);
    state.expired = true;
    state.health = health;
    await page.evaluate(async () => {
      qdbSet('mtgnews5', []);
      switchPage('home');
    });
    const login = page.locator('#homeNews').getByRole('link', { name: 'Sign in again' });
    await expect(login).toBeVisible();
    await expect(page.locator('#netChip')).toHaveText('Sign in again');
    expect(await page.evaluate(() => _netAuthRequired)).toBe(true);
    await login.click();
    await expect.poll(() => state.logins).toBe(1);
    await expect(page.locator('#netChip')).toHaveCount(0);
    await page.locator('#brandTitle').click();
    await expect(page.locator('#homeNews .news-item')).toHaveText(/Commander news fixture/);
    expect(await page.locator('#homeModeLogo').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  });
}

test('login HTML never counts as a recovered server', async ({ page, context }) => {
  const state = await prepare(page, context);
  state.health = 'html';
  expect(await page.evaluate(() => _netCheckServer())).toBe(false);
  await expect(page.locator('#netChip')).toHaveText('⚡ Server offline');
  state.health = 'ok';
  expect(await page.evaluate(() => _netCheckServer())).toBe(true);
  await expect(page.locator('#netChip')).toHaveCount(0);
});

test('card API sign-in failures pause queued requests and news retries after recovery', async ({ page, context }) => {
  const state = await prepare(page, context);
  state.expired = true;
  const start = state.cardRequests;
  expect(await page.evaluate(async () => {
    const responses = await Promise.all([
      sfFetch(SF_BASE + '/cards/autocomplete?q=expired-first'),
      sfFetch(SF_BASE + '/cards/autocomplete?q=expired-queued'),
    ]);
    return responses.map(response => response.status);
  })).toEqual([401, 503]);
  expect(state.cardRequests - start).toBe(1);
  await expect(page.locator('#netChip')).toHaveText('Sign in again');
  await page.evaluate(() => {
    qdbSet('mtgnews5', []);
    switchPage('home');
  });
  await expect(page.locator('#homeNews')).toHaveAttribute('data-nw-retry', '1');
  state.expired = false;
  expect(await page.evaluate(() => _netCheckServer())).toBe(true);
  await expect(page.locator('#netChip')).toHaveCount(0);
  await expect(page.locator('#homeNews .news-item')).toHaveText(/Commander news fixture/);
});

test.describe('installed app session recovery', () => {
  test.use({ serviceWorkers: 'allow' });

  test('the cached logo survives a sign-in redirect and sign-in bypasses the cached shell', async ({ page, context }) => {
    const state = await prepare(page, context);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.locator('#brandTitle').click();
    await expect(page.locator('#homeNews .news-item')).toBeVisible();
    expect(await page.locator('#homeModeLogo').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    state.expired = true;
    await page.evaluate(() => qdbSet('mtgnews5', []));
    // A cache-busting URL forces a new image request, still matching the saved
    // logo when the proxy redirects its network request to the sign-in page.
    expect(await page.evaluate(async () => {
      const image = new Image();
      image.src = '/assets/images/deckhand-badge.webp?session-test=1';
      await image.decode();
      return image.naturalWidth;
    })).toBeGreaterThan(0);
    expect(await page.evaluate(async () => {
      const response = await caches.match('/assets/images/deckhand-badge.webp');
      return response.headers.get('content-type');
    })).toBe('image/webp');
    await page.evaluate(() => loadMtgNews(document.getElementById('homeNews')));
    await expect(page.locator('#netChip')).toHaveText('Sign in again');
    await page.locator('#netChip').click();
    await expect.poll(() => state.logins).toBe(1);
    await expect(page.locator('.app > .app-navigation')).toBeVisible();
    await page.locator('#brandTitle').click();
    await expect(page.locator('#homeNews .news-item')).toBeVisible();
    expect(await page.locator('#homeModeLogo').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  });
});
