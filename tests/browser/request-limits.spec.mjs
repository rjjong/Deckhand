import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, context }) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.evaluate(() => resolveLegalSets());
  await expect.poll(() => page.evaluate(() => _sfWorking)).toBe(false);
});

test('GET and POST card lookups reject website URLs before making any request', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  const statuses = await page.evaluate(async () => {
    const targets = [
      'https://www.cardmarket.com/en/Magic',
      'https://api.scryfall.com@www.cardmarket.com/cards/search',
      '//www.cardmarket.com/cards/search',
      location.origin + '/api/news',
    ];
    const responses = await Promise.all(
      targets.flatMap((url) => [
        sfFetch(url),
        postWithTimeout(url, { identifiers: [{ name: 'Sol Ring' }] }),
      ]),
    );
    return responses.map((response) => response.status);
  });
  expect(statuses).toEqual(Array(8).fill(400));
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(async () => {
      const responses = await Promise.all([
        sfFetch('https://api.scryfall.com/cards/autocomplete?q=verified'),
        postWithTimeout(SF_BASE + '/cards/collection', { identifiers: [{ name: 'Sol Ring' }] }),
      ]);
      return responses.map((response) => response.status);
    }),
  ).toEqual([200, 200]);
  expect(requests).toHaveLength(2);
  expect(requests.every((url) => url.startsWith('http://127.0.0.1:3100/api/scryfall/'))).toBe(true);
});

for (const challenge of ['forbidden HTML', 'HTTP-date rate limit']) {
  test(`${challenge} stops GETs and POSTs across reloads and other browser tabs`, async ({
    page,
    context,
  }) => {
    const now = Date.now();
    const retryAt = now + (challenge === 'HTTP-date rate limit' ? 120_000 : 900_000);
    await page.clock.install({ time: now });
    let requests = 0;
    await context.route('**/api/scryfall/**', (route) => {
      requests++;
      return challenge === 'forbidden HTML'
        ? route.fulfill({ status: 403, contentType: 'text/html', body: '<html>blocked</html>' })
        : route.fulfill({
            status: 429,
            headers: { 'retry-after': new Date(retryAt).toUTCString() },
            json: { code: 'rate_limited' },
          });
    });
    expect(
      await page.evaluate(async () => {
        const responses = await Promise.all([
          sfFetch(SF_BASE + '/cards/autocomplete?q=first'),
          postWithTimeout(SF_BASE + '/cards/collection', { identifiers: [{ name: 'Sol Ring' }] }),
          sfFetch(SF_BASE + '/cards/autocomplete?q=queued'),
        ]);
        return responses.map((response) => response.status);
      }),
    ).toEqual([429, 429, 429]);
    expect(requests).toBe(1);
    const saved = await page.evaluate(() => Number(localStorage.getItem(SF_COOLDOWN_KEY)));
    expect(saved).toBeGreaterThanOrEqual(retryAt - 1000);
    await page.reload();
    await expect(page.locator('.app > .app-navigation')).toBeVisible();
    expect(
      await page.evaluate(
        async () => (await sfFetch(SF_BASE + '/cards/autocomplete?q=reloaded')).status,
      ),
    ).toBe(429);
    const otherTab = await context.newPage();
    await otherTab.goto('/');
    await expect(otherTab.locator('.app > .app-navigation')).toBeVisible();
    expect(
      await otherTab.evaluate(
        async () =>
          (
            await postWithTimeout(SF_BASE + '/cards/collection', {
              identifiers: [{ name: 'Island' }],
            })
          ).status,
      ),
    ).toBe(429);
    expect(requests).toBe(1);
    await otherTab.close();
  });
}

test('a refused deck price refresh preserves stale prices and does not schedule automatic retries', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/api/scryfall/cards/search*', (route) => {
    requests++;
    return route.fulfill({
      status: 429,
      headers: { 'retry-after': '120' },
      json: { code: 'rate_limited' },
    });
  });
  await page.clock.install();
  const result = await page.evaluate(async () => {
    await bulkIndexReady();
    const cards = Array.from({ length: 25 }, (_, index) => ({
      name: 'Uncached price fixture ' + index,
    }));
    const stale = { name: 'Stale price fixture' };
    state.priceCache[stale.name] = { v: 7.5, t: Date.now() - 2 * 86400000 };
    const result = await priceDeck({ id: 'blocked-deck', cards: [...cards, stale] });
    await result.refreshed;
    return { total: result.total, missing: result.missing, stale: state.priceCache[stale.name].v };
  });
  expect(result).toEqual({ total: 7.5, missing: 25, stale: 7.5 });
  expect(requests).toBe(1);
  await page.clock.fastForward(20 * 60_000);
  expect(requests).toBe(1);
  expect(await page.evaluate(() => state.priceCache['Stale price fixture'].v)).toBe(7.5);
});

test('Cardmarket pages open only on request and repeated clicks remain throttled after reload', async ({
  page,
  context,
}) => {
  let requests = 0;
  await context.route('https://www.cardmarket.com/**', (route) => {
    requests++;
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Mock Cardmarket</title>',
    });
  });
  await page.clock.install();
  await page.evaluate(() => {
    state.trade = {
      a: [
        {
          name: 'Sol Ring',
          qty: 1,
          eur: 1,
          pt: Date.now(),
          img: '/icon-192.png',
          cardmarketUrl:
            'https://www.cardmarket.com/en/Magic/Products/Search?searchString=Sol+Ring',
        },
      ],
      b: [],
    };
    saveTrade();
    switchPage('trade');
  });
  const link = page.getByRole('link', {
    name: 'View Sol Ring on Cardmarket (opens in a new tab)',
    exact: true,
  });
  await expect(link).toBeVisible();
  expect(requests).toBe(0);
  const popup = page.waitForEvent('popup');
  await link.click();
  const market = await popup;
  await market.waitForLoadState();
  await market.close();
  expect(requests).toBe(1);
  await link.click();
  await link.click({ button: 'middle' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('before opening another Cardmarket page');
  expect(requests).toBe(1);
  await page.reload();
  await page.evaluate(() => switchPage('trade'));
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.locator('#toast')).toContainText('before opening another Cardmarket page');
  expect(requests).toBe(1);
  await page.clock.fastForward(10001);
  const nextPopup = page.waitForEvent('popup');
  await link.click();
  const next = await nextPopup;
  await next.waitForLoadState();
  await next.close();
  expect(requests).toBe(2);
});
