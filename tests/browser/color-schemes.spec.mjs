import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { auditContrast } from './helpers/contrast.mjs';

const guilds = [
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
];

for (const theme of ['dark', 'light'])
  for (const guild of guilds) {
    test(`color scheme ${guild} in ${theme} mode stays readable`, async ({ page }, info) => {
      test.setTimeout(90000);
      await page.addInitScript(() => {
        localStorage.setItem('admiral_app:seenVersion', '1.50');
      });
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/.netlify/functions/news')
          return route.fulfill({ json: { items: [] } });
        if (url.pathname.startsWith('/api/scryfall/'))
          return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
        if (url.origin === 'http://127.0.0.1:3100') return route.continue();
        return route.abort();
      });
      await page.goto('/');
      await expect(page.locator('.app > .app-navigation')).toBeVisible();
      await page.addStyleTag({
        content:
          '*, *::before, *::after { animation: none !important; transition: none !important; }',
      });
      await page.evaluate(
        ({ guild, theme }) => {
          state.guild = guild;
          state.theme = theme;
          applyTheme();
          window.contrastCard = {
            id: 'contrast-card',
            name: 'Archive Adept',
            type_line: 'Creature — Wizard',
            layout: 'normal',
            colors: ['U'],
            color_identity: ['U'],
            set: 'tst',
            set_name: 'Test Set',
            collector_number: '1',
            rarity: 'rare',
            oracle_text: 'Whenever you draw a card, gain 1 life.',
            prices: { eur: '12.50' },
            _salt: 1.25,
            legalities: { commander: 'legal', modern: 'legal' },
            image_uris: { normal: '/icon-192.png', large: '/icon-192.png', small: '/icon-192.png' },
          };
          state._cr = [{ n: '100', t: 'General rules.' }];
          state.draft = draftNew();
          state.collection.items = [
            {
              name: 'Archive Adept',
              qty: 2,
              eur: 12.5,
              colors: ['U'],
              type_line: 'Creature — Wizard',
              set: 'tst',
              img: '/icon-192.png',
            },
          ];
          state.decksIndex = [
            {
              id: 'contrast-deck',
              name: 'Archive deck',
              format: 'modern',
              cards: [window.contrastCard],
              maybeboard: [],
            },
          ];
          state.life.history = ['Alice gained 2 life.', 'Bob rolled a d20: 14.'];
        },
        { guild, theme },
      );
      const report = [];
      const prefix = `var/previews/contrast/${guild}-${theme}-${info.project.name}`;
      await mkdir('var/previews/contrast', { recursive: true });
      const capture = async (label, selector) => {
        await page.locator(selector).evaluate(async (root) => {
          await Promise.all(
            [...root.querySelectorAll('img')].map((img) => img.decode().catch(() => {})),
          );
        });
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        const preview = [
          'life table',
          'life setup',
          'life tools',
          'life radial',
          'card details bottom',
          'menu bottom',
          'settings bottom',
        ].includes(label);
        if (preview)
          await page.screenshot({
            path: prefix + '-' + label.replaceAll(' ', '-') + '.png',
            scale: 'css',
          });
        const samples = await auditContrast(
          page,
          selector,
          preview ? prefix + '-' + label.replaceAll(' ', '-') + '-background.png' : undefined,
        );
        report.push({ label, samples });
      };
      for (const screen of [
        'home',
        'menu',
        'settings',
        'decks',
        'collection',
        'search',
        'browse',
        'draft',
        'trade',
        'life',
      ]) {
        await page.evaluate((screen) => switchPage(screen), screen);
        await capture(screen, '.app');
        if (screen === 'settings') {
          await page.locator('#guildRow').click();
          await capture('color chooser', '.app');
        }
        const scroller = page.locator('.app .tab-viewport');
        if (
          (await scroller.count()) &&
          (await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 40))
        ) {
          await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
          await capture(screen + ' bottom', '.app');
        }
      }
      await page.evaluate(() => {
        switchPage('search');
        openAdvancedSearch('search');
      });
      await capture('advanced search', '#advancedSearchScreen');
      await page.evaluate(() => {
        switchPage('menu');
        openCROverlay();
      });
      await capture('judge', '#crOverlay');
      await page.evaluate(() => {
        dismissAllOverlays();
        openCardInfo(window.contrastCard);
      });
      await capture('card details', '#cardSheetOverlay');
      await page.locator('#cardSheetOverlay main').dispatchEvent('wheel');
      await page
        .locator('#cardSheetOverlay main')
        .evaluate((el) => (el.scrollTop = el.scrollHeight));
      await capture('card details bottom', '#cardSheetOverlay');
      await page.evaluate(() => {
        dismissAllOverlays();
        switchPage('life');
        state.life.setupDone = false;
        state.life.count = 4;
        state.life.layout = '4q';
        openLifeOverlay();
      });
      await capture('life setup', '#lifeSetupScreen');
      await page
        .locator('#lifeSetupScreen .life-setup-body')
        .evaluate((el) => (el.scrollTop = el.scrollHeight));
      await capture('life setup bottom', '#lifeSetupScreen');
      await page.evaluate(() => {
        closeModal();
        state.life.setupDone = true;
        renderLifeOverlay();
      });
      await capture('life table', '#lifeGrid');
      await page.evaluate(() => {
        state.life.menuOpen = true;
        renderLifeOverlay();
      });
      await capture('life radial', '#lifeMenuPop');
      await page.evaluate(() => {
        state.life.menuOpen = false;
        state.life.toolsOpen = true;
        renderLifeOverlay();
      });
      await capture('life tools', '#lifeToolsPanel');
      await page.evaluate(() => {
        state.life.toolsOpen = false;
        state.life.settingsOpen = true;
        renderLifeOverlay();
      });
      await capture('life settings', '#lifeSettingsPanel');
      await page.evaluate(() => {
        state.life.settingsOpen = false;
        state.life.historyOpen = true;
        renderLifeOverlay();
      });
      await capture('life history', '#lifeHistoryPanel');
      await page.evaluate(() =>
        openInAppConfirm('Restart this game?', () => {}, {
          title: 'Restart game',
          ok: 'Restart game',
          danger: true,
          icon: 'close',
        }),
      );
      await capture('confirmation', '#inAppConfirm');
      await writeFile(prefix + '.json', JSON.stringify(report, null, 2));
      const failures = report.flatMap(({ label, samples }) =>
        samples.filter((s) => s.ratio < s.minimum).map((s) => ({ view: label, ...s })),
      );
      await writeFile(prefix + '-failures.json', JSON.stringify(failures, null, 2));
      expect(report.reduce((count, r) => count + r.samples.length, 0)).toBeGreaterThan(100);
      expect(
        failures.slice(0, 12).map((s) => ({
          view: s.view,
          selector: s.selector,
          text: s.text,
          ratio: +s.ratio.toFixed(2),
          minimum: s.minimum,
        })),
        `${failures.length} contrast issues; full report: ${prefix}-failures.json`,
      ).toEqual([]);
    });
  }
