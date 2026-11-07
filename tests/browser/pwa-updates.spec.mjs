import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'allow' });

// Two immutable releases behind a real HTTP server exercise installation,
// controller changes and offline caching, including requests from the worker.
async function releases() {
  const root = resolve('public');
  const js = await readFile(resolve(root, 'assets/app.js'), 'utf8');
  const current = js.match(/const DECKHAND_BUILD = '([a-f0-9]+)'/)[1];
  const files = new Map();
  for (const name of ['index.html', 'sw.js', 'assets/app.js', 'assets/app.css'])
    files.set(name, await readFile(resolve(root, name), 'utf8'));
  const state = { version: '111111111111', firstPage: null, pages: 0 };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (url.pathname.startsWith('/api/')) {
        response.setHeader('content-type', 'application/json');
        return response.end(
          JSON.stringify(
            url.pathname === '/api/health'
              ? { ok: true, storage: 'sqlite' }
              : { data: [], items: [], has_more: false },
          ),
        );
      }
      if (name === 'runtime-config.js') {
        response.setHeader('content-type', 'text/javascript');
        return response.end(
          'window.DECKHAND_CONFIG={selfHosted:true,scryfallBase:"/api/scryfall",dataFiles:[]};',
        );
      }
      let version = state.version;
      if (name === 'index.html' && request.headers['sec-fetch-dest'] === 'document') {
        state.pages++;
        if (state.firstPage) {
          version = state.firstPage;
          state.firstPage = null;
        }
      }
      if (url.searchParams.has('v')) version = url.searchParams.get('v');
      const mime = {
        html: 'text/html',
        js: 'text/javascript',
        css: 'text/css',
        json: 'application/json',
        png: 'image/png',
        webp: 'image/webp',
      };
      response.setHeader('content-type', mime[name.split('.').pop()] || 'application/octet-stream');
      response.setHeader('cache-control', 'no-store');
      response.end(
        files.has(name)
          ? files.get(name).replaceAll(current, version)
          : await readFile(resolve(root, name)),
      );
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    state,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => {
      server.closeAllConnections();
      return new Promise((done) => server.close(done));
    },
  };
}

test.beforeEach(async ({ context }) => {
  await markCurrentReleaseSeen(context);
  await context.addInitScript(() => {
    sessionStorage.setItem(
      'testPageLoads',
      String(Number(sessionStorage.getItem('testPageLoads') || 0) + 1),
    );
    // Background requests stay on the fixture origin.
    const original = window.fetch;
    window.fetch = (resource, options) => {
      const url = new URL(typeof resource === 'string' ? resource : resource.url, location.href);
      if (url.origin !== location.origin) return Promise.resolve(Response.json({ data: [] }));
      return original(resource, options);
    };
  });
});

async function open(page, app) {
  await page.goto(app.url);
  await expect(page.locator('.app > .app-navigation')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller).catch(() => false))
    .toBe(true);
}

test('first installation does not reload, and its exact version opens offline', async ({
  page,
  context,
}) => {
  const app = await releases();
  try {
    await open(page, app);
    await expect.poll(() => page.evaluate(() => DECKHAND_BUILD)).toBe(app.state.version);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => Number(sessionStorage.getItem('testPageLoads')))).toBe(1);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.app > .app-navigation')).toBeVisible();
    expect(await page.evaluate(() => DECKHAND_BUILD)).toBe(app.state.version);
    expect(await page.evaluate(() => updateServiceWorker(null))).toBe(false);
    await expect(page.locator('#pwaUpdate')).toHaveCount(0);
  } finally {
    await context.setOffline(false);
    await app.close();
  }
});

test('a deployment preserves editing and saved data, then refreshes on return', async ({
  page,
  context,
}) => {
  const app = await releases();
  try {
    await open(page, app);
    await page.evaluate(async () => {
      const deck = { id: 'update-test', name: 'Keep my deck', format: 'commander', cards: [] };
      state.decksIndex.push(deck);
      await persistDeck(deck);
      state.collection.items = [{ name: 'Sol Ring', qty: 3 }];
      saveCollection();
      state.guild = 'dimir';
      await persistSettings();
      for (const name of ['admiral-assets-v1', 'unrelated-cache']) {
        const cache = await caches.open(name);
        await cache.put('/sentinel', new Response('keep'));
      }
      openInAppPrompt('Rename deck', 'Deck name', 'Unsaved text', () => {});
    });
    await page.locator('#iapInput').fill('Still typing');
    app.state.version = '222222222222';
    await page.evaluate(async () => updateServiceWorker(await navigator.serviceWorker.ready));
    await expect(page.locator('#pwaUpdate')).toBeAttached();
    expect(await page.evaluate(() => DECKHAND_BUILD)).toBe('111111111111');
    await expect(page.locator('#iapInput')).toHaveValue('Still typing');
    expect(await page.evaluate(() => Number(sessionStorage.getItem('testPageLoads')))).toBe(1);
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual(['admiral-assets-v1', 'unrelated-cache', 'deckhand-shell-222222222222']);
    await page.locator('#iapCancel').click();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect
      .poll(() => page.evaluate(() => DECKHAND_BUILD).catch(() => null))
      .toBe('222222222222');
    await expect
      .poll(() => page.evaluate(() => state.decksIndex.find((d) => d.id === 'update-test')?.name))
      .toBe('Keep my deck');
    expect(await page.evaluate(() => state.collection.items[0].name)).toBe('Sol Ring');
    expect(await page.evaluate(() => state.guild)).toBe('dimir');
    expect(await page.evaluate(() => Number(sessionStorage.getItem('testPageLoads')))).toBe(2);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.app > .app-navigation')).toBeVisible();
    expect(await page.evaluate(() => DECKHAND_BUILD)).toBe('222222222222');
  } finally {
    await context.setOffline(false);
    await app.close();
  }
});

test('a stale launch refreshes once without a reload loop', async ({ page }) => {
  const app = await releases();
  try {
    app.state.version = '222222222222';
    app.state.firstPage = '111111111111';
    await open(page, app);
    await expect
      .poll(() => page.evaluate(() => DECKHAND_BUILD).catch(() => null))
      .toBe('222222222222');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => Number(sessionStorage.getItem('testPageLoads')))).toBe(2);
    await expect(page.locator('#pwaUpdate')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('a new worker does not interrupt a life game; reload is available after leaving', async ({
  page,
}) => {
  const app = await releases();
  try {
    await open(page, app);
    await page.evaluate(() => {
      state.lifeOpen = true;
    });
    app.state.version = '222222222222';
    await page.evaluate(async () => updateServiceWorker(await navigator.serviceWorker.ready));
    await expect(page.locator('#pwaUpdate')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => Number(sessionStorage.getItem('testPageLoads')))).toBe(1);
    await page.locator('#pwaUpdate').click();
    expect(await page.evaluate(() => Number(sessionStorage.getItem('testPageLoads')))).toBe(1);
    await page.evaluate(() => {
      state.lifeOpen = false;
    });
    await page.locator('#pwaUpdate').click();
    await expect
      .poll(() => page.evaluate(() => DECKHAND_BUILD).catch(() => null))
      .toBe('222222222222');
    expect(await page.evaluate(() => Number(sessionStorage.getItem('testPageLoads')))).toBe(2);
  } finally {
    await app.close();
  }
});
