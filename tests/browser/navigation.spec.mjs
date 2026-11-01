import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('admiral_app:welcomed', '1');
    localStorage.setItem('admiral_app:lang', 'en');
    localStorage.setItem('admiral_app:seenVersion', '1.50');
  });
  // Exercise local UI without making background requests to external APIs.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.netlify/functions/news') return route.fulfill({ json: { items: [] } });
    if (url.pathname.startsWith('/api/scryfall/')) return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    if (url.origin === 'http://127.0.0.1:3100') return route.continue();
    if (url.hostname === 'api.scryfall.com') return route.fulfill({ json: { object: 'list', data: [], has_more: false } });
    return route.abort();
  });
  await page.goto('/');
  await expect(page.locator('.app > .app-navigation')).toBeVisible();
});

test('five labeled tabs stay centered and each opens its page', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const nav = page.locator('.app > .app-navigation');
  await expect(nav.locator('button')).toHaveCount(5);
  expect((await nav.boundingBox()).height).toBe(60);
  expect((await nav.locator('button').first().boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(nav.locator('.tab-label')).toHaveText(['Decks', 'Collection', 'Search', 'Inspiration', 'Life']);
  await expect(page.locator('#capBack, .ov-back')).toHaveCount(0);
  for (const [name, title] of [['Decks', 'MY DECKS'], ['Collection', 'MY COLLECTION'], ['Search', 'SEARCH'], ['Inspiration', 'INSPIRATION'], ['Life', 'LIFE TRACKER']]) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('#brandTitle')).toHaveText(title);
    await expect(nav.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await page.getByRole('button', { name: 'Saved games' }).click();
  await expect(page.locator('#lifeRestoreSheet')).toBeVisible();
  await page.evaluate(() => dismissAllOverlays());
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('#lifeOverlay')).toBeVisible();
  await expect(page.locator('#startGameBtn')).toBeVisible();
  expect(errors).toEqual([]);
});

test('logo opens menu, settings remains accessible, and the title returns home', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await expect(page.locator('#brandTitle')).toHaveText('MENU');
  await expect(page.locator('#brandTitle')).toHaveCSS('opacity', '1');
  await expect(page.locator('.menu-page')).toBeVisible();
  await expect(page.locator('#homeBtn img')).toHaveJSProperty('naturalWidth', 192);
  await mkdir('var/previews', { recursive: true });
  await page.screenshot({ path: `var/previews/menu-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Settings Preferences, sync & backups' }).click();
  await expect(page.locator('#brandTitle')).toHaveText('SETTINGS');
  await page.goBack();
  await expect(page.locator('#brandTitle')).toHaveText('MENU');
  await page.getByRole('button', { name: 'Go to home', exact: true }).click();
  await expect(page.locator('#brandTitle')).toHaveText('DECKHAND');
  await expect(page.locator('#brandTitle')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: `var/previews/home-${info.project.name}.png` });
});

test('menu keeps game tools and removes unwanted options', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  for(const id of ['menuSettings','draftRow','crRow','fmtRulesRow','banListsRow']){
    await expect(page.locator(`.menu-page #${id}`)).toHaveClass(/hub-card/);
  }
  await expect(page.locator('#lifeRow, #syncRow, #backupRow, #langRow, #dataSourcesRow, #guildRow, #notifRow, #notifBody, #changelogBtn, #footFeedbackBtn, #aboutRow, #installAppRow, #shareAppRow')).toHaveCount(0);
  await expect(page.locator('.menu-page .hub-card').last()).toHaveAttribute('id','menuSettings');
  for(const [row,body] of [['fmtRulesRow','fmtRulesBody'],['banListsRow','banListsBody']]){
    await page.locator(`#${row}`).click();
    await expect(page.locator(`#${body}`)).toBeVisible();
    await expect(page.locator(`#${row}`)).toHaveAttribute('aria-expanded','true');
    await page.locator(`#${row}`).click();
    await expect(page.locator(`#${body}`)).toBeHidden();
  }
  await page.locator('#fmtRulesRow').click();
  await page.goBack();
  await expect(page.locator('#brandTitle')).toHaveText('MENU');
  await expect(page.locator('#fmtRulesBody')).toBeHidden();
  await page.locator('#crRow').click();
  await expect(page.locator('#crOverlay')).toBeVisible();
  await page.evaluate(()=>dismissAllOverlays());
  await page.locator('#draftRow').click();
  expect(await page.evaluate(()=>state.screen)).toBe('draft');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.screenshot({path:`var/previews/menu-tools-${info.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});

test('Settings owns working preferences, sync and backup controls', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.locator('#menuSettings').click();
  await expect(page.locator('.settings-page .hub-card')).toHaveCount(5);
  for(const [row,body] of [['langRow','languageBody'],['dataSourcesRow','dataSourcesBody'],['guildRow','guildBody'],['backupRow','backupBody']]){
    await page.locator(`#${row}`).click();
    await expect(page.locator(`#${body}`)).toBeVisible();
    await page.locator(`#${row}`).click();
    await expect(page.locator(`#${body}`)).toBeHidden();
  }
  await page.locator('#langRow').click();
  await page.locator('[data-lang-choice="nl"]').click();
  expect(await page.evaluate(()=>appLang())).toBe('nl');
  await expect(page.locator('#brandTitle')).toHaveText('SETTINGS');
  await page.locator('#langRow').click();
  await page.locator('[data-lang-choice="en"]').click();
  expect(await page.evaluate(()=>appLang())).toBe('en');
  await page.locator('#dataSourcesRow').click();
  await expect(page.locator('#bulkDlNow')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#brandTitle')).toHaveText('SETTINGS');
  await expect(page.locator('#dataSourcesBody')).toBeHidden();
  await page.locator('#guildRow').click();
  const color=page.locator('[data-guild]:not(.sel)').first();
  const selected=await color.getAttribute('data-guild');
  await color.click();
  expect(await page.evaluate(()=>state.guild)).toBe(selected);
  await expect(page.locator('#guildBody')).toBeHidden();
  await page.locator('#syncRow').click();
  await expect(page.locator('#syncSheet')).toBeVisible();
  await page.evaluate(()=>dismissAllOverlays());
  await expect(page.locator('#brandTitle')).toHaveText('SETTINGS');
  await page.locator('#backupRow').click();
  await page.locator('#backupBtn').click();
  await expect(page.locator('#backupSheet')).toBeVisible();
  await page.evaluate(()=>dismissAllOverlays());
  const chooserPromise=page.waitForEvent('filechooser');
  await page.locator('#restoreBtn').click();
  const chooser=await chooserPromise;
  await chooser.setFiles([]);
  await expect(page.locator('#deletedDecksBtn')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#backupBody')).toBeHidden();
  await expect(page.locator('#brandTitle')).toHaveText('SETTINGS');
  await expect(page.locator('#lifeRow, #notifRow, #changelogBtn, #footFeedbackBtn, #aboutRow, #installAppRow, #shareAppRow')).toHaveCount(0);
  await page.screenshot({path:`var/previews/settings-${info.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});

test('every page scrolls only inside its content viewport', async ({page},info)=>{
  for(const screen of ['home','decks','collection','browse','life','menu','settings','draft','trade']){
    await page.evaluate(screen=>switchPage(screen),screen);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const viewport=page.locator('.app .tab-viewport[data-screen]');
    await expect(viewport).toBeVisible();
    const header=await page.locator('.app-header').boundingBox();
    const nav=await page.locator('.app > .app-navigation').boundingBox();
    const bounds=await viewport.boundingBox();
    const controls=page.locator('.app > main > .searchbar:visible, .app > main > div:has(> #deckFilter):visible, .app > main > .browse-selects:visible');
    const bars=await controls.evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {y:r.y,height:r.height};}));
    const contentTop=Math.max(header.y+header.height,...bars.map(bar=>bar.y+bar.height));
    expect(Math.abs(bounds.y-contentTop)).toBeLessThan(1);
    expect(Math.abs(bounds.y+bounds.height-nav.y)).toBeLessThan(1);
    await viewport.evaluate(el=>{
      const filler=document.createElement('div');
      filler.style.cssText='height:1800px;flex-shrink:0';
      el.append(filler);
    });
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.wheel(0,400);
    await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(()=>window.scrollY)).toBe(0);
    expect(await viewport.boundingBox()).toEqual(bounds);
    expect(await page.locator('.app-header').boundingBox()).toEqual(header);
    expect(await page.locator('.app > .app-navigation').boundingBox()).toEqual(nav);
    expect(await controls.evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {y:r.y,height:r.height};}))).toEqual(bars);
  }
  await page.evaluate(()=>createNewDeck('Scroll fixture','commander'));
  const deck=page.locator('.app .tab-viewport[data-screen]');
  await expect(deck).toBeVisible();
  const controls=await page.locator('.deck-controls').boundingBox();
  const nav=await page.locator('.app > .app-navigation').boundingBox();
  const bounds=await deck.boundingBox();
  expect(bounds.y).toBeCloseTo(controls.y+controls.height,0);
  expect(bounds.y+bounds.height).toBeCloseTo(nav.y,0);
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.locator('#menuSettings').scrollIntoViewIfNeeded();
  await page.screenshot({path:`var/previews/menu-scroll-${info.project.name}.png`});
});

test('Collection filters resize the content viewport without moving its scroll position', async ({page},info)=>{
  await page.locator('.app-navigation').getByRole('button',{name:'Collection',exact:true}).click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const viewport=page.locator('.app .tab-viewport[data-screen]');
  await viewport.evaluate(el=>{
    const filler=document.createElement('div');
    filler.style.height='1800px'; el.append(filler); el.scrollTop=200;
  });
  const closed=await viewport.boundingBox();
  await page.locator('#colChev').click();
  const panel=page.locator('#colAdvBox');
  await expect(panel).toBeVisible();
  const search=await page.locator('.searchbar').boundingBox();
  const filters=await panel.boundingBox();
  const opened=await viewport.boundingBox();
  const nav=await page.locator('.app-navigation').boundingBox();
  expect(filters.y).toBeCloseTo(search.y+search.height,0);
  expect(opened.y).toBeCloseTo(filters.y+filters.height,0);
  expect(opened.height).toBeLessThan(closed.height);
  expect(opened.y+opened.height).toBeCloseTo(nav.y,0);
  expect(await viewport.evaluate(el=>el.scrollTop)).toBe(200);
  expect(await panel.evaluate(el=>el.scrollTop)).toBe(0);
  const firstField=await page.locator('#colFq').boundingBox();
  expect(firstField.y).toBeGreaterThanOrEqual(filters.y);
  expect(firstField.y+firstField.height).toBeLessThan(filters.y+filters.height);
  await page.screenshot({path:`var/previews/collection-filters-scroll-${info.project.name}.png`});
  await page.locator('#colChev').click();
  await expect(panel).toBeHidden();
  expect(await viewport.boundingBox()).toEqual(closed);
  expect(await viewport.evaluate(el=>el.scrollTop)).toBe(200);
});

test('mobile tab labels fit at small and large phone widths', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.locator('.app > .app-navigation').evaluate(nav => {
      const row = nav.querySelector('.banner-tabs').getBoundingClientRect();
      return { left: row.left, right: row.right, width: innerWidth,
        labels: [...nav.querySelectorAll('.tab-label')].map(label => {
          const a = label.getBoundingClientRect(), b = label.closest('button').getBoundingClientRect();
          return { left: a.left, right: a.right, parentLeft: b.left, parentRight: b.right };
        }) };
    });
    expect(Math.abs(layout.left - (layout.width - layout.right))).toBeLessThan(2);
    for (const label of layout.labels) {
      expect(label.left).toBeGreaterThanOrEqual(label.parentLeft);
      expect(label.right).toBeLessThanOrEqual(label.parentRight);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('search and sort controls open below the header and pages start at the top', async ({ page }, info) => {
  const nav = page.locator('.app > .app-navigation');
  for (const [name, input] of [['Decks', '#deckFilter'], ['Collection', '#colSearchQ'], ['Search', '#searchName'], ['Inspiration', '#bsName']]) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(page.locator(input)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const header = await page.locator('.app-header').boundingBox();
    const field = await page.locator(input).boundingBox();
    expect(field.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(field.y).toBeLessThan(header.y + header.height + 50);
    if(name !== 'Inspiration'){
      const bar = await page.locator(input).evaluate(el=> (el.closest('.searchbar') || el.parentElement).getBoundingClientRect().top);
      expect(Math.abs(bar - header.y - header.height)).toBeLessThan(1);
    }
  }
  await nav.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('#srSortBtn').click();
  const sort = await page.locator('#srSortBtn').boundingBox();
  const menu = await page.locator('#tileMenuPop').boundingBox();
  expect(menu.y).toBeGreaterThanOrEqual(sort.y + sort.height);
  await page.evaluate(() => document.getElementById('tileMenuPop')?.remove());
  await page.locator('#qChev').click();
  await expect(page.getByRole('dialog', {name:'Advanced search'})).toBeVisible();
  await expect(page.locator('.adv-panel')).toBeVisible();
  expect(await page.locator('.adv-panel').evaluate(el => getComputedStyle(el).flexDirection)).toBe('column');
  await expect.poll(async()=>Math.round((await page.locator('#advancedSearchScreen').boundingBox()).x)).toBe(0);
  await page.screenshot({ path: `var/previews/search-topdown-${info.project.name}.png` });
});

test('advanced search fills the screen, retains filters through back, and applies or resets them', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error=>errors.push(error.message));
  await page.locator('.app > .app-navigation').getByRole('button', {name:'Search', exact:true}).click();
  await page.locator('#searchName').fill('Dragon');
  const advanced = page.getByRole('button', {name:'Advanced search', exact:true});
  await expect(advanced.locator('svg path')).toHaveAttribute('d', 'M4 4h16l-6 7v7l-4 2v-9z');
  const sort = await page.locator('#srSortBtn').boundingBox();
  const toggle = await advanced.boundingBox();
  expect(Math.abs(toggle.y - sort.y)).toBeLessThan(1);
  expect(toggle.x + toggle.width).toBeLessThanOrEqual(sort.x);
  await advanced.click();
  const dialog = page.getByRole('dialog', {name:'Advanced search'});
  await expect(dialog).toBeVisible();
  await expect.poll(async()=>Math.round((await dialog.boundingBox()).x)).toBe(0);
  const bounds = await dialog.boundingBox();
  expect(bounds).toEqual({x:0, y:0, ...page.viewportSize()});
  const heading = await page.locator('#advancedSearchTitle').boundingBox();
  expect(Math.abs(heading.x + heading.width / 2 - bounds.width / 2)).toBeLessThan(1);
  expect(await page.locator('#advancedSearchTitle').evaluate(el=>getComputedStyle(el).fontFamily))
    .toBe(await page.locator('#brandTitle').evaluate(el=>getComputedStyle(el).fontFamily));
  for(const id of ['advancedSearchClose', 'advancedSearchReset']){
    await expect(page.locator(`#${id}`)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator(`#${id}`)).toHaveCSS('background-image', 'none');
    await expect(page.locator(`#${id}`)).toHaveCSS('border-top-width', '0px');
    expect((await page.locator(`#${id} svg`).boundingBox()).width).toBe(id === 'advancedSearchReset' ? 24 : 32);
  }
  await expect(dialog.locator('.info-i, .advanced-search-footer')).toHaveCount(0);
  const searchButton = page.getByRole('button', {name:'Search cards', exact:true});
  const searchPosition = await searchButton.boundingBox();
  expect(searchPosition.width).toBe(54);
  expect(searchPosition.height).toBe(54);
  expect(bounds.width - searchPosition.x - searchPosition.width).toBe(16);
  expect(bounds.height - searchPosition.y - searchPosition.height).toBe(16);
  await expect(searchButton).toHaveCSS('border-radius', '50%');
  await expect(page.locator('#advName')).toHaveValue('Dragon');
  await page.locator('#oracleText').fill('draw');
  await page.locator('[data-cs="fmtSel"]').click();
  await page.locator('[data-csopt="fmtSel"][data-val="commander"]').click();
  await expect(page.locator('#oracleText')).toHaveValue('draw');
  await page.locator('#advancedSearchBody').evaluate(el=>el.scrollTop=400);
  expect(await searchButton.boundingBox()).toEqual(searchPosition);
  await page.locator('#advancedSearchBody').evaluate(el=>el.scrollTop=el.scrollHeight);
  const finalField = await dialog.locator('.adv-row').last().boundingBox();
  expect(finalField.y + finalField.height).toBeLessThan(searchPosition.y);
  await expect(dialog.locator('.info-i')).toHaveCount(0);
  await page.screenshot({path:`var/previews/advanced-search-${info.project.name}.png`});
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(advanced).toBeFocused();
  await expect(page.locator('#searchName')).toHaveValue('Dragon');
  await advanced.click();
  await expect(page.locator('#oracleText')).toHaveValue('draw');
  await page.locator('#advGo').click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>state.searchRan)).toBe(true);
  expect(await page.evaluate(()=>buildAdvancedClause())).toContain('draw');
  await advanced.click();
  await page.locator('#advancedSearchReset').click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('#oracleText')).toHaveValue('');
  await expect(page.locator('#advName')).toHaveValue('');
  await page.locator('#advancedSearchClose').click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Search and Spoilers scroll only between the title and tab bars', async ({ page }, info) => {
  await page.route('**/api/scryfall/sets*', route=>route.fulfill({json:{object:'list',has_more:false,
    data:[{code:'tst',name:'Scroll fixture',set_type:'expansion',digital:false,released_at:'2099-01-01'}]}}));
  await page.locator('.app > .app-navigation').getByRole('button',{name:'Search',exact:true}).click();
  await page.evaluate(()=>{
    const cards = Array.from({length:60},(_,i)=>({id:`scroll-${i}`,name:`Scroll fixture ${i}`,type_line:'Artifact',
      layout:'normal',colors:[],color_identity:[],rarity:'common',set:'tst',collector_number:String(i+1),prices:{},
      legalities:{commander:'legal'},image_uris:{normal:'/icon-192.png',small:'/icon-192.png'}}));
    state.searchResults = cards; state.searchRan = true; render();
    state.allSetsRaw = [{code:'tst',name:'Scroll fixture',set_type:'expansion',digital:false,released_at:'2099-01-01'}];
    autoSets.previewMeta = {}; autoSets.previewSeen = {};
    state._spoilerAutoFresh = Date.now(); state._spSetsLoading = false;
    state._spoilerCache = {tst:{t:Date.now(),cards}};
  });
  for(const screen of ['search','spoilers']){
    if(screen==='spoilers') await page.getByRole('button',{name:'Spoilers',exact:true}).click();
    const viewport = page.locator('.app .tab-viewport[data-screen]');
    const header = await page.locator('.app-header').boundingBox();
    const nav = await page.locator('.app > .app-navigation').boundingBox();
    const bounds = await viewport.boundingBox();
    const controls = await page.locator(screen==='search'?'.searchbar':'.sp-jump').boundingBox();
    expect(Math.abs(bounds.y - controls.y - controls.height)).toBeLessThan(1);
    expect(Math.abs(bounds.y + bounds.height - nav.y)).toBeLessThan(1);
    await expect(viewport).toHaveCSS('overflow-y','auto');
    await expect.poll(()=>viewport.evaluate(el=>el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
    await page.mouse.move(bounds.x + bounds.width/2, bounds.y + bounds.height/2);
    await page.mouse.wheel(0,600);
    await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(()=>window.scrollY)).toBe(0);
    expect(await page.locator('.app-header').boundingBox()).toEqual(header);
    expect(await page.locator('.app > .app-navigation').boundingBox()).toEqual(nav);
    expect(await viewport.boundingBox()).toEqual(bounds);
    const before = await viewport.evaluate(el=>el.scrollTop);
    await page.locator(screen==='search'?'#qChev':'#spAdvToggle').click();
    const dialog = page.locator('#advancedSearchScreen');
    await expect(dialog).toBeVisible();
    await expect.poll(async()=>Math.round((await dialog.boundingBox()).x)).toBe(0);
    expect(await dialog.boundingBox()).toEqual({x:0,y:0,...page.viewportSize()});
    await page.locator('#advancedSearchClose').click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(()=>viewport.evaluate(el=>Math.round(el.scrollTop))).toBe(Math.round(before));
    await page.screenshot({path:`var/previews/${screen}-scroll-${info.project.name}.png`});
  }
});

test('search suggestions open below the field and fit a reduced viewport', async ({ page }, info) => {
  await page.locator('.app > .app-navigation').getByRole('button', {name:'Search',exact:true}).click();
  await page.evaluate(async()=>{
    await bulkIndexReady();
    _bulkIdx = {cards:['Lightning Bolt', ...Array.from({length:30},(_,i)=>`Lightning Test Card ${i}`)].map((n,i)=>({n,id:`fixture-${i}`,tl:'Instant',ly:'normal',lg:'legal'}))};
  });
  await page.locator('#searchName').fill('Lightning');
  const suggestions = page.locator('#nameSuggest');
  await expect(suggestions).toBeVisible();
  await expect(suggestions.locator('button').first()).toHaveText('Lightning Bolt');
  const assertFits = async()=>{
    await expect.poll(()=>page.evaluate(()=>{
      const list = document.getElementById('nameSuggest').getBoundingClientRect();
      return list.bottom - document.querySelector('.app > .app-navigation').getBoundingClientRect().top;
    })).toBeLessThanOrEqual(0);
    const field = await page.locator('#searchName').boundingBox();
    const list = await suggestions.boundingBox();
    const nav = await page.locator('.app > .app-navigation').boundingBox();
    expect(list.y).toBeGreaterThanOrEqual(field.y + field.height);
    expect(list.x).toBeCloseTo(field.x, 0);
    expect(list.y + list.height).toBeLessThanOrEqual(nav.y);
    const first = await suggestions.locator('button').first().boundingBox();
    const second = await suggestions.locator('button').nth(1).boundingBox();
    expect(first.y).toBeLessThan(second.y);
  };
  await assertFits();
  await page.setViewportSize({width:page.viewportSize().width,height:380});
  await assertFits();
  await page.screenshot({path:`var/previews/search-suggestions-${info.project.name}.png`});
  await suggestions.getByRole('button',{name:'Lightning Bolt',exact:true}).click();
  await expect(page.locator('#searchName')).toHaveValue('Lightning Bolt');
  await expect(suggestions).toHaveCount(0);
});

test('Spoilers is a borderless Search header action and opens its page', async ({ page }) => {
  const nav = page.locator('.app > .app-navigation');
  await nav.getByRole('button',{name:'Search',exact:true}).click();
  const spoilers = page.locator('.app-header').getByRole('button',{name:'Spoilers',exact:true});
  await expect(spoilers).toBeVisible();
  await expect(page.locator('.searchbar #spoilersBtn')).toHaveCount(0);
  await expect(spoilers).toHaveCSS('border-top-width','0px');
  await expect(spoilers).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  const title = await page.locator('#brandTitle').boundingBox();
  expect((await spoilers.boundingBox()).x).toBeGreaterThanOrEqual(title.x + title.width);
  await page.evaluate(()=>{state.searchSel=new Map([['fixture',{}]]);updateSearchSelFab();});
  await expect(spoilers).toBeVisible();
  await spoilers.click();
  await expect(page.locator('#brandTitle')).toHaveText('SPOILERS');
  await expect(page.locator('#spoilersBtn')).toHaveCount(0);
});

test('Spoilers header filters share the Search icon and open a full-screen sliding panel', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error=>errors.push(error.message));
  await page.route('**/api/scryfall/sets*', route=>route.fulfill({json:{object:'list',has_more:false,
    data:[{code:'tst',name:'Preview fixture',set_type:'expansion',digital:false,released_at:'2099-01-01'}]}}));
  await page.locator('.app > .app-navigation').getByRole('button',{name:'Search',exact:true}).click();
  const searchIcon = await page.locator('#qChev svg').evaluate(el=>el.outerHTML);
  await page.evaluate(()=>{
    autoSets.previewMeta = {}; autoSets.previewSeen = {};
    state.allSetsRaw = [{code:'tst',name:'Preview fixture',set_type:'expansion',digital:false,released_at:'2099-01-01'}];
    state._spoilerAutoFresh = Date.now();
    state._spSetsLoading = false;
    state._spoilerCache = {tst:{t:Date.now(),cards:[
      {id:'fixture-dragon',name:'Preview Dragon',type_line:'Creature — Dragon',colors:['R'],color_identity:['R'],rarity:'rare',set:'tst',layout:'normal',collector_number:'1'},
      {id:'fixture-artifact',name:'Preview Artifact',type_line:'Artifact',colors:[],color_identity:[],rarity:'common',set:'tst',layout:'normal',collector_number:'2'}
    ]}};
  });
  await page.getByRole('button',{name:'Spoilers',exact:true}).click();
  await expect(page.locator('#spBody .sc-tile')).toHaveCount(2);
  const filters = page.locator('.app-header').getByRole('button',{name:'Advanced spoiler filters'});
  await expect(filters).toBeVisible();
  expect(await filters.locator('svg').evaluate(el=>el.outerHTML)).toBe(searchIcon);
  await expect(filters).toHaveCSS('border-top-width','0px');
  await expect(page.locator('#spMainPage > #spAdvToggle, #spMainPage > #spAdvBox')).toHaveCount(0);
  const title = await page.locator('#brandTitle').boundingBox();
  expect((await filters.boundingBox()).x).toBeGreaterThanOrEqual(title.x + title.width);
  await filters.click();
  const dialog = page.getByRole('dialog',{name:'Spoiler filters',exact:true});
  await expect(dialog).toBeVisible();
  await expect(filters).toHaveAttribute('aria-expanded','true');
  await expect.poll(async()=>Math.round((await dialog.boundingBox()).x)).toBe(0);
  expect(await dialog.boundingBox()).toEqual({x:0,y:0,...page.viewportSize()});
  expect(await page.evaluate(()=>getComputedStyle(document.querySelector('#advancedSearchScreen')).position)).toBe('fixed');
  await page.locator('#spFq').fill('Preview');
  await page.locator('#spTypeText').fill('Dragon');
  await page.locator('label.ccheck').filter({has:page.locator('[data-spcolor="R"]')}).click();
  await page.locator('label.rcheck').filter({has:page.locator('[data-sprarity="rare"]')}).click();
  await page.locator('[data-cs="spSet"]').click();
  await page.locator('[data-csopt="spSet"][data-val="tst"]').click();
  await expect(page.locator('#spTypeText')).toHaveValue('Dragon');
  await expect(page.locator('[data-spcolor="R"]')).toBeChecked();
  await page.screenshot({path:`var/previews/spoiler-filters-${info.project.name}.png`});
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(filters).toBeFocused();
  await expect(page.locator('#spBody .sc-tile')).toHaveCount(1);
  await filters.click();
  await expect(page.locator('#spFq')).toHaveValue('Preview');
  await page.getByRole('button',{name:'Search cards',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#brandTitle')).toHaveText('SPOILERS');
  await filters.click();
  await page.locator('#advancedSearchReset').click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('#spFq')).toHaveValue('');
  await expect(page.locator('#spTypeText')).toHaveValue('');
  await expect(page.locator('[data-spcolor="R"]')).not.toBeChecked();
  await page.getByRole('button',{name:'Back to spoilers',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#spBody .sc-tile')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('pulling down refreshes the visible random card and its button sits below it', async ({ page }, info) => {
  await page.evaluate(async()=>{
    await bulkIndexReady();
    _bulkIdx = {cards:[{n:'Sol Ring',id:'aa-fixture',tl:'Artifact',ly:'normal',lg:'legal'}, {n:'Arcane Signet',id:'bb-fixture',tl:'Artifact',ly:'normal',lg:'legal'}]};
    state.cotd = {card:bulkToCardish(_bulkIdx.cards[0])};
  });
  await page.locator('.app > .app-navigation').getByRole('button',{name:'Search',exact:true}).click();
  const card = page.locator('#cotdImg');
  await expect(card).toHaveAttribute('alt','Sol Ring');
  const image = await card.boundingBox(), button = await page.locator('#cotdReroll').boundingBox();
  expect(button.y).toBeGreaterThanOrEqual(image.y + image.height);
  const touchSession = info.project.name === 'mobile' ? await page.context().newCDPSession(page) : null;
  const pull = async(dx,dy,cancel=false)=>{
    if(touchSession){
      await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:200}]});
      await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150+dx,y:200+dy}]});
      await touchSession.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
      return;
    }
    return page.evaluate(({dx,dy,cancel})=>{
    const target = document.getElementById('cotdImg');
    const fire = (type,x,y)=>{
      const touch = new Touch({identifier:1,target,clientX:x,clientY:y});
      target.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,
        touches:type==='touchend'||type==='touchcancel'?[]:[touch],changedTouches:[touch]}));
    };
    fire('touchstart',150,200);fire('touchmove',150+dx,200+dy);
    fire(cancel?'touchcancel':'touchend',150+dx,200+dy);
    },{dx,dy,cancel});
  };
  await pull(0,30);
  await expect(card).toHaveAttribute('alt','Sol Ring');
  await pull(100,10);
  await expect(card).toHaveAttribute('alt','Sol Ring');
  await pull(0,100,true);
  await expect(card).toHaveAttribute('alt','Sol Ring');
  await pull(0,100);
  await expect(card).toHaveAttribute('alt','Arcane Signet');
  await page.locator('#cotdReroll').click();
  await expect(card).toHaveAttribute('alt','Sol Ring');
  await page.evaluate(()=>{state.searchRan=true;setCotdVisible(false);});
  await pull(0,100);
  expect(await page.evaluate(()=>state.cotd.card.name)).toBe('Sol Ring');
});

test('Packages has no settings, search, card action, or inspiration entry and is excluded from sync', async ({ page }) => {
  expect(await page.evaluate(()=>({editor:typeof openPackagesEditor, all:typeof pkgAll, synced:SYNC_KEYS.has('packages')}))).toEqual({editor:'undefined',all:'undefined',synced:false});
  const legacySync = await page.evaluate(async()=>{
    const previousState = state._syncSt, previousMeta = state._syncMeta;
    try{
      state._syncSt = {code:'TEST',sent:{}};
      state._syncMeta = {packages:{t:1}};
      localStorage.setItem('admiral_app:packages','legacy data');
      const pending = syncPending();
      await syncApply({packages:{t:2,v:'remote data'}});
      return {pending, stored:localStorage.getItem('admiral_app:packages')};
    }finally{state._syncSt=previousState;state._syncMeta=previousMeta;}
  });
  expect(legacySync).toEqual({pending:{},stored:'legacy data'});
  await page.locator('#homeBtn').click();
  await page.getByRole('button',{name:'Settings Preferences, sync & backups'}).click();
  await expect(page.getByText(/packages|pakketten/i)).toHaveCount(0);
  await expect(page.locator('#pkgRow')).toHaveCount(0);
  await page.evaluate(()=>{createNewDeck('No packages fixture','commander');getDeck(state.activeDeckId).admiral={name:'Fixture Commander',type_line:'Legendary Creature — Human',color_identity:[],oracle_text:''};state.screen='inspiration';render();});
  await expect(page.locator('#inspLandBase')).toBeVisible();
  await expect(page.locator('#inspPackages')).toHaveCount(0);
  await page.evaluate(()=>openDeckPickPopup({name:'Sol Ring',type_line:'Artifact',color_identity:[]}, 'main'));
  await expect(page.locator('#deckPickScrim')).toBeVisible();
  await expect(page.locator('[data-topkg]')).toHaveCount(0);
});

test('idle startup skips unpublished files and speculative set searches', async ({ page }) => {
  const requests = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'text/javascript',
    body: 'window.DECKHAND_CONFIG = {selfHosted:true,webPushEnabled:false,scryfallBase:"/api/scryfall",dataFiles:["bulk-meta.json","oracle-slim.jsonl.gz","rulings-slim.jsonl.gz"]};' }));
  page.on('request', request => requests.push(new URL(request.url())));
  await page.reload();
  await page.evaluate(async () => { await checkForNewSets(); preloadBrowseTileArt(); await bulkSyncCheck(true); await dailyPricesCheck(); });
  await page.waitForTimeout(6500); // Includes the legacy six-second art prewarm timer.
  expect(requests.filter(url => /prices-meta|tags-slim|combos-slim|scryfall\/cards\/random/.test(url.pathname)
    || (url.pathname.endsWith('/cards/search') && /set:|is:universesbeyond/.test(url.searchParams.get('q') || '')))).toEqual([]);
});

test('deck controls stay above the deck list', async ({ page }) => {
  await page.evaluate(() => createNewDeck('Layout fixture', 'commander'));
  await expect(page.locator('#brandTitle')).toHaveText('Layout fixture');
  await expect(page.locator('.deck-controls .builder-tabs')).toBeVisible();
  await expect(page.locator('.deck-controls .deck-dock')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const header = await page.locator('.app-header').boundingBox();
  const controls = await page.locator('.deck-controls').boundingBox();
  expect(controls.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(controls.y).toBeLessThan(header.y + header.height + 30);
});

test('PWA metadata is explicit and rejected service-worker updates are handled', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  const manifest=await (await page.request.get('/manifest.json')).json();
  expect(manifest.share_target.enctype).toBe('application/x-www-form-urlencoded');
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute('content','yes');
  expect(await page.evaluate(async()=>{
    const failed=await updateServiceWorker({update:()=>Promise.reject(new Error('Server stopped'))});
    const updated=await updateServiceWorker({update:()=>Promise.resolve()});
    return {failed,updated};
  })).toEqual({failed:false,updated:true});
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
  expect(errors).toEqual([]);
});

test('custom install buttons are absent and the native install prompt is not intercepted', async ({page})=>{
  const offer=()=>page.evaluate(()=>{
    const event=new Event('beforeinstallprompt',{cancelable:true});
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(await offer()).toBe(false);
  await expect(page.locator('#installPill, #installAppRow')).toHaveCount(0);
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await expect(page.locator('#installPill, #installAppRow')).toHaveCount(0);
  await page.locator('#menuSettings').click();
  expect(await offer()).toBe(false);
  await expect(page.locator('#installPill, #installAppRow')).toHaveCount(0);
});

test('a stopped local server pauses API calls and recovers through the health endpoint', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.evaluate(()=>resolveLegalSets());
  await page.clock.install();
  let requests=0,probes=0;
  await page.route('**/api/scryfall/cards/autocomplete*',route=>{requests++;return route.abort('connectionrefused');});
  await page.route('**/api/health',route=>{probes++;return route.fulfill({json:{ok:true,storage:'sqlite'}});});
  const statuses=await page.evaluate(async()=>{
    const responses=await Promise.all([
      sfFetch(SF_BASE+'/cards/autocomplete?q=offline-first'),
      sfFetch(SF_BASE+'/cards/autocomplete?q=offline-queued')
    ]);
    responses.push(await sfFetch(SF_BASE+'/cards/autocomplete?q=offline-later'));
    return responses.map(r=>r.status);
  });
  expect(statuses).toEqual([503,503,503]);
  expect(requests).toBe(1);
  await expect(page.locator('.cap-tools #netChip')).toContainText('Server offline');
  await page.evaluate(async()=>{
    state.setsResolved=false;
    state.allSetsRaw=[{code:'keep',name:'Saved set'}];
    await resolveLegalSets(true);
  });
  expect(await page.evaluate(()=>state.allSetsRaw)).toEqual([{code:'keep',name:'Saved set'}]);
  expect(await page.evaluate(()=>state.setsResolved)).toBe(false);
  await page.clock.fastForward(12001);
  await expect.poll(()=>probes).toBeGreaterThan(0);
  await expect(page.locator('#netChip')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>state.setsResolved)).toBe(true);
  expect(errors).toEqual([]);
});

test('the browser does not retry or drain more network jobs after a Scryfall rate limit', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/scryfall/cards/autocomplete*', route => {
    requests++;
    return route.fulfill({ status: 429, headers: { 'retry-after': '120' }, json: { code: 'rate_limited' } });
  });
  const results = await page.evaluate(async () => {
    const a = sfFetch(SF_BASE + '/cards/autocomplete?q=first');
    const b = sfFetch(SF_BASE + '/cards/autocomplete?q=second');
    const statuses = await Promise.all([a, b]).then(items => items.map(x => x.status));
    statuses.push((await sfFetch(SF_BASE + '/cards/autocomplete?q=third')).status);
    return statuses;
  });
  expect(results).toEqual([429, 429, 429]);
  expect(requests).toBe(1);
});

test.describe('installed PWA',()=>{
  test.use({serviceWorkers:'allow'});
  test('the real service worker opens the cached shell offline without unhandled updates', async ({page,context})=>{
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    expect(await page.evaluate(async()=>{
      const cache=await caches.match(location.origin+'/index.html');
      return !!cache;
    })).toBe(true);
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.app > .app-navigation')).toBeVisible();
    expect(await page.evaluate(async()=>updateServiceWorker(await navigator.serviceWorker.ready))).toBe(false);
    await context.setOffline(false);
    await page.reload();
    await expect(page.locator('.app > .app-navigation')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
