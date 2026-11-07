import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function prepareStream(page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.judgeTransport = { aborted: false, cancelled: false };
    window.fetch = (url, options) => {
      if (String(url) !== '/api/judge') return original(url, options);
      window.judgeTransport.accept = new Headers(options.headers).get('accept');
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          window.sendJudgeChunk = (text) => controller.enqueue(encoder.encode(text));
          window.endJudgeStream = () => controller.close();
          options.signal.addEventListener(
            'abort',
            () => {
              window.judgeTransport.aborted = true;
              controller.error(new DOMException('Cancelled', 'AbortError'));
            },
            { once: true },
          );
        },
        cancel() {
          window.judgeTransport.cancelled = true;
        },
      });
      return Promise.resolve(
        new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
      );
    };
  });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/'))
      return route.fulfill({ json: { object: 'list', data: [] } });
    return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => state.homeLoaded)).toBe(true);
  await page.evaluate(() => {
    state.guild = 'dimir';
    applyTheme();
    state._cr = [
      { n: '704.5f', t: 'A creature with toughness 0 or less is put into its owner’s graveyard.' },
    ];
    openCROverlay('judge');
  });
  await page.locator('#crQ').fill('Does a creature with zero toughness die?');
  await page.locator('#crJudge').click();
  await expect.poll(() => page.evaluate(() => typeof window.sendJudgeChunk)).toBe('function');
}

test('Local model setup and capacity failures show relevant rules without asking for browser credentials', async ({
  page,
}) => {
  let result;
  await markCurrentReleaseSeen(page);
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

test('Judge text appears before completion, stays escaped, and finishes with readable rules', async ({
  page,
}, info) => {
  await prepareStream(page);
  await expect(page.locator('#crJudge')).toBeDisabled();
  expect(await page.evaluate(() => window.judgeTransport.accept)).toBe('text/event-stream');
  await page.evaluate(() =>
    window.sendJudgeChunk(': keep-alive\n\nevent: progress\ndata: {"reasoning":"The rule'),
  );
  await expect(page.locator('.cja-stream')).toHaveCount(0);
  await page.evaluate(() => window.sendJudgeChunk(' applies."}\n\n'));
  await expect(page.locator('.cja-stream-reasoning')).toHaveText('The rule applies.');
  await expect(page.locator('.cja-stream')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.cr-rule')).toHaveCount(0);
  const unsafe =
    'The rule applies. <img src=x onerror="window.streamInjected=true">\nA quoted “rule” 🔥.';
  await page.evaluate(
    (text) =>
      window.sendJudgeChunk(
        'event: progress\r\ndata: ' +
          JSON.stringify({ reasoning: text, answer: 'Yes.' }) +
          '\r\n\r\n',
      ),
    unsafe,
  );
  await expect(page.locator('.cja-stream-reasoning')).toHaveText(unsafe);
  await expect(page.locator('.cja-stream-answer')).toHaveText('Yes.');
  await expect(page.locator('.cja-stream img')).toHaveCount(0);
  expect(await page.evaluate(() => window.streamInjected)).toBeUndefined();
  expect(await page.locator('#crBody').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/judge-streaming-${info.project.name}.png` });
  await page.evaluate(() => {
    window.sendJudgeChunk(
      'event: result\ndata: ' +
        JSON.stringify({
          ok: true,
          answer: 'Yes.',
          reasoning: 'The creature has zero toughness.',
          cites: ['704.5f'],
          readRules: ['704.5f'],
          confident: true,
          left: 19,
        }) +
        '\n\n',
    );
    window.endJudgeStream();
  });
  await expect(page.locator('.cja-stream')).toHaveCount(0);
  await expect(page.locator('.cja-a')).toHaveText('Yes.');
  await expect(page.locator('.cja-why')).toBeVisible();
  await expect(page.locator('[data-cjwhy]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.cr-rule')).toContainText('704.5f');
  await expect(page.locator('#crJudge')).toBeEnabled();
});

test('leaving the Judge cancels its streamed request', async ({ page }) => {
  await prepareStream(page);
  await page.evaluate(() =>
    window.sendJudgeChunk('event: progress\ndata: {"reasoning":"A partial explanation"}\n\n'),
  );
  await expect(page.locator('.cja-stream')).toBeVisible();
  await page
    .locator('#crOverlay .app-navigation')
    .getByRole('button', { name: 'Decks', exact: true })
    .click();
  await expect(page.locator('#crOverlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.judgeTransport.aborted)).toBe(true);
  await page.evaluate(() => openCROverlay('judge'));
  await expect(page.locator('#crJudge')).toBeEnabled();
  await expect(page.locator('.cja-stream')).toHaveCount(0);
});

test('a disconnected stream discards the draft and shows the official rules', async ({ page }) => {
  await prepareStream(page);
  await page.evaluate(() =>
    window.sendJudgeChunk('event: progress\ndata: {"answer":"Unfinished draft"}\n\n'),
  );
  await expect(page.locator('.cja-stream-answer')).toHaveText('Unfinished draft');
  await page.evaluate(() => window.endJudgeStream());
  await expect(page.locator('.cja-stream')).toHaveCount(0);
  await expect(page.locator('#crBody')).toContainText('cannot be reached right now');
  await expect(page.locator('.cr-rule')).toContainText('704.5f');
  await expect(page.locator('#crJudge')).toBeEnabled();
});
