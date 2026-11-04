import { test, expect } from '@playwright/test';

test('the installation manifest includes the browser login session', async ({ page, context }) => {
  await context.addCookies([
    { name: 'test_login', value: 'authenticated', url: 'http://127.0.0.1:3100', httpOnly: true },
  ]);
  let manifestCookie = '';
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    if (url.pathname === '/manifest.json') {
      manifestCookie = (await route.request().allHeaders()).cookie || '';
      if (!manifestCookie.includes('test_login=authenticated'))
        return route.fulfill({ status: 403, body: 'Sign in first' });
    }
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'crossorigin',
    'use-credentials',
  );
  const session = await context.newCDPSession(page);
  const result = await session.send('Page.getAppManifest');
  expect(result.errors).toEqual([]);
  expect(JSON.parse(result.data).name).toBe('Deckhand');
  expect(manifestCookie).toContain('test_login=authenticated');
});
