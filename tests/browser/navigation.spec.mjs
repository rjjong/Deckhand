import { markCurrentReleaseSeen } from './helpers/version.mjs';
import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await markCurrentReleaseSeen(page);
  // Exercise local UI without making background requests to external APIs.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') return route.fulfill({ json: { items: [] } });
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
  for (const [name, title] of [['Decks', 'MY DECKS'], ['Collection', 'COLLECTION'], ['Search', 'SEARCH'], ['Inspiration', 'INSPIRATION'], ['Life', 'LIFE TRACKER']]) {
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

test('Life setup fills the screen, scrolls from the top and starts the chosen format and layout', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{state.guild='dimir';applyTheme();});
  await page.locator('.app > .app-navigation').getByRole('button',{name:'Life',exact:true}).click();
  await page.getByRole('button',{name:'New game'}).click();
  const setup=page.getByRole('dialog',{name:'New game',exact:true});
  const content=setup.locator('.life-setup-body');
  await expect(setup.locator('h1')).toHaveText('Set your table.');
  await expect(setup.locator('[data-setup-lay]')).toHaveCount(12);
  await expect(setup.locator('[data-lifefmt]')).toHaveCount(4);
  expect(await content.evaluate(el=>el.scrollTop)).toBe(0);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/life-setup-${info.project.name}.png`});
  const original=page.viewportSize();
  for(const size of [original,{width:320,height:480}]){
    await page.setViewportSize(size);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await expect(setup.locator('.app-overlay-header')).toBeVisible();
    expect(await setup.boundingBox()).toEqual({x:0,y:0,...size});
    const header=await setup.locator('.app-overlay-header').boundingBox();
    const nav=await setup.locator('.app-navigation').boundingBox();
    const footer=await setup.locator('.life-setup-footer').boundingBox();
    const bounds=await content.boundingBox();
    expect(bounds.y).toBeCloseTo(header.y+header.height,0);
    expect(bounds.y+bounds.height).toBeCloseTo(footer.y,0);
    expect(footer.y+footer.height).toBeCloseTo(nav.y,0);
    expect(await content.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await content.evaluate(el=>el.scrollTop=el.scrollHeight);
    expect(await content.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    expect(await setup.locator('.app-overlay-header').boundingBox()).toEqual(header);
    expect(await setup.locator('.life-setup-footer').boundingBox()).toEqual(footer);
    await expect(setup.locator('#startGameBtn')).toBeInViewport();
  }
  await setup.locator('[data-lifefmt="constructed"]').click();
  await expect(setup.locator('[data-lifefmt="constructed"]')).toHaveAttribute('aria-pressed','true');
  await expect(setup.locator('.llay-grid b').first()).toHaveText('20');
  await setup.locator('[data-setup-lay="2f"]').click();
  await expect(setup.locator('[data-setup-lay="2f"]')).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize(original);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(setup.locator('[data-setup-lay="2f"]')).toHaveAttribute('aria-pressed','true');
  await setup.locator('#startGameBtn').click();
  await expect(setup).toHaveCount(0);
  await expect(page.locator('#lifeGrid .life-card-v2')).toHaveCount(2);
  expect(await page.evaluate(()=>state.life.players.map(p=>p.life))).toEqual([20,20]);
  await expect.poll(()=>page.evaluate(()=>state.life.spinning)).toBe(false);
  expect(await page.evaluate(()=>state.life.players.filter(p=>p.medal).length)).toBe(1);
  expect(errors).toEqual([]);
});

test('Life setup cancellation and navigation return to the app without leaving a table open', async ({page})=>{
  await page.locator('.app > .app-navigation').getByRole('button',{name:'Life',exact:true}).click();
  for(const action of ['close','back','navigate']){
    await page.getByRole('button',{name:'New game'}).click();
    const setup=page.locator('#lifeSetupScreen');
    await expect(setup).toBeVisible();
    if(action==='close') await setup.locator('#lifeSetupCancel').click();
    else if(action==='back') await page.goBack();
    else await setup.getByRole('button',{name:'Search',exact:true}).click();
    await expect(setup).toHaveCount(0);
    await expect(page.locator('#lifeOverlay')).toHaveCount(0);
    expect(await page.evaluate(()=>state.lifeOpen)).toBe(false);
    await expect(page.locator('#brandTitle')).toHaveText(action==='navigate'?'SEARCH':'LIFE TRACKER');
  }
});

test('Life table menus keep dice, history, settings and exact life editing usable on small screens', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{
    state.guild='dimir';applyTheme();switchPage('life');
    state.life.count=2;state.life.layout='2f';state.life.rotate=false;state.life.setupDone=true;
    state.life.history=Array.from({length:40},(_,i)=>`Game event ${40-i}`);
    openLifeOverlay();
  });
  await page.locator('[data-setlife="0"]').click();
  await page.locator('#setLifeInput').fill('37');
  await page.locator('#setLifeOk').click();
  expect(await page.evaluate(()=>state.life.players[0].life)).toBe(37);
  await page.locator('[data-setlife="0"]').click();
  await page.locator('#setLifeInput').fill('5');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>state.life.players[0].life)).toBe(37);
  await page.locator('#lifeCogBtn').click();
  const menu=page.getByRole('dialog',{name:'Table menu'});
  await expect(menu.locator('.lm-opt')).toHaveText(['History','Tools','Settings','Leave']);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/life-table-menu-${info.project.name}.png`});
  await menu.locator('#mTools').click();
  const tools=page.getByRole('dialog',{name:'Tools',exact:true});
  await expect(tools.locator('.life-tool')).toHaveText(['Dice','Ask AI Judge','Restore a game','Restart game']);
  await page.screenshot({path:`var/previews/life-tools-${info.project.name}.png`});
  await tools.locator('#mDice').click();
  const dice=page.getByRole('dialog',{name:'Dice',exact:true});
  await expect(dice.locator('[data-die]')).toHaveCount(8);
  await dice.locator('[data-die="6"]').click();
  await expect(dice).toHaveCount(0);
  await expect(page.locator('#diceResultPop')).toBeVisible();
  await page.locator('#diceResultPop').click();
  expect(await page.evaluate(()=>state.life.history[0])).toMatch(/^Rolled a d6: [1-6]$/);
  await expect(tools).toBeVisible();
  await tools.locator('[data-life-close]').click();
  await expect(tools).toHaveCount(0);
  await page.locator('#lifeCogBtn').click();
  await page.locator('#mHistory').click();
  const history=page.getByRole('dialog',{name:'History',exact:true});
  await expect(history.locator('.life-history-row').first()).toContainText('Rolled a d6:');
  await page.setViewportSize({width:320,height:480});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const header=await history.locator('.life-popup-head').boundingBox();
  await history.locator('.life-popup-body').evaluate(el=>el.scrollTop=500);
  expect(await history.locator('.life-popup-body').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  expect(await history.locator('.life-popup-head').boundingBox()).toEqual(header);
  await history.locator('[data-life-close]').click();
  await expect(history).toHaveCount(0);
  await page.locator('#lifeCogBtn').click();
  await page.locator('#mLifeSettings').click();
  const settings=page.locator('#lifeSettingsPanel .life-popup');
  await expect(settings.locator('#lifeJudgeBtn, #lifeRestoreBtn, #restartLifeBtn, #leaveLifeBtn')).toHaveCount(0);
  await expect(settings.locator('button')).toHaveCount(1);
  const bounds=await settings.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(16);
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(464);
  expect(await settings.locator('.life-popup-body').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await settings.getByRole('checkbox',{name:'Track Poison',exact:true}).uncheck();
  expect(await page.evaluate(()=>state.life.settings.poison)).toBe(false);
  await settings.getByRole('checkbox',{name:'Rotate for Pass-and-Play',exact:true}).check();
  expect(await page.evaluate(()=>state.life.rotate)).toBe(true);
  await page.screenshot({path:`var/previews/life-settings-small-${info.project.name}.png`});
  await settings.locator('[data-life-close]').click();
  await expect(settings).toHaveCount(0);
  await page.locator('#lifeCogBtn').click();
  await page.locator('#mTools').click();
  await page.locator('#restartLifeBtn').click();
  await expect(page.locator('#inAppConfirm')).toBeVisible();
  await page.locator('#iacCancel').click();
  await expect(page.locator('#lifeMenuPop')).toHaveCount(0);
  expect(await page.evaluate(()=>state.life.setupDone)).toBe(true);
  await expect(tools).toBeVisible();
  await page.locator('#restartLifeBtn').click();
  await page.locator('#iacOk').click();
  await expect(page.locator('#lifeSetupScreen')).toBeVisible();
  await page.locator('[data-setup-lay="3t"]').click();
  await page.locator('#startGameBtn').click();
  await expect(page.locator('#lifeGrid .life-card-v2')).toHaveCount(3);
  await expect(page.locator('#lifeSettingsPanel .life-popup')).toHaveCount(0);
  expect(await page.evaluate(()=>state.life.players.map(p=>p.life))).toEqual([40,40,40]);
  await expect.poll(()=>page.evaluate(()=>state.life.spinning)).toBe(false);
  await page.locator('#lifeCogBtn').click();
  await page.locator('#leaveLifeBtn').click();
  await expect(page.locator('#lifeOverlay')).toHaveCount(0);
  await expect(page.locator('#brandTitle')).toHaveText('LIFE TRACKER');
  expect(errors).toEqual([]);
});

test('Life radial controls fit the viewport and Tools opens Judge and restores games without leaving the table', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.locator('.app > .app-navigation').getByRole('button',{name:'Life',exact:true}).click();
  await page.evaluate(()=>{
    state.guild='dimir';applyTheme();
    state.life.count=4;state.life.layout='4q';state.life.rotate=true;state.life.setupDone=true;
    state._cr=[{n:'100',t:'General rules.'}];
    localStorage.setItem(LS_PREFIX+'lifeSaves',JSON.stringify([{id:'restore-from-tools',t:Date.now(),d:{
      count:2,layout:'2f',rotate:true,turnNum:3,turnIdx:0,startIdx:0,history:['Saved game event'],
      players:[{name:'Restored Alice',life:31,poison:0,dmg:[]},{name:'Restored Bob',life:27,poison:0,dmg:[]}]
    }}]));
    openLifeOverlay();
  });
  await page.locator('#lifeCogBtn').click();
  const radial=page.getByRole('dialog',{name:'Table menu'});
  const original=page.viewportSize();
  for(const size of [original,{width:320,height:480},{width:844,height:390}]){
    await page.setViewportSize(size);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const buttons=await radial.locator('.lm-opt').all();
    for(const button of buttons){
      const b=await button.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(8);
      expect(b.y).toBeGreaterThanOrEqual(8);
      expect(b.x+b.width).toBeLessThanOrEqual(size.width-8);
      expect(b.y+b.height).toBeLessThanOrEqual(size.height-8);
    }
  }
  await page.setViewportSize(original);
  await radial.locator('#mTools').click();
  const tools=page.getByRole('dialog',{name:'Tools',exact:true});
  await tools.locator('#lifeJudgeBtn').click();
  await expect(page.locator('#crOverlay.cr-popup')).toBeVisible();
  await page.locator('#crOverlay').getByRole('button',{name:'Read the Comprehensive Rules'}).click();
  await expect(page.locator('#crOverlay .ov-title')).toHaveText('Comprehensive Rules');
  await page.goBack();
  await expect(page.locator('#crOverlay .ov-title')).toHaveText('Ask AI judge');
  await page.goBack();
  await expect(page.locator('#crOverlay, #crScrim')).toHaveCount(0);
  await expect(tools).toBeVisible();
  await tools.locator('#lifeRestoreBtn').click();
  await expect(page.locator('#lifeRestoreSheet')).toBeVisible();
  await page.locator('#lifeRestoreSheet [data-lr]').filter({hasText:'Restored Alice'}).click();
  await expect(page.locator('#lifeRestoreSheet')).toHaveCount(0);
  await expect(tools).toHaveCount(0);
  expect(await page.evaluate(()=>state.life.players.map(p=>[p.name,p.life]))).toEqual([['Restored Alice',31],['Restored Bob',27]]);
  await expect(page.locator('#lifeOverlay')).toBeVisible();
  await page.locator('#lifeCogBtn').click();
  await page.mouse.click(4,4);
  await expect(radial).toHaveCount(0);
  expect(await page.evaluate(()=>state.life.players.map(p=>p.life))).toEqual([31,27]);
  await page.locator('#lifeCogBtn').click();
  await page.keyboard.press('Escape');
  await expect(radial).toHaveCount(0);
  await expect(page.locator('#lifeOverlay')).toBeVisible();
  await page.locator('#lifeCogBtn').click();
  await radial.getByRole('button',{name:'Leave',exact:true}).click();
  await expect(page.locator('#lifeOverlay')).toHaveCount(0);
  expect(await page.evaluate(()=>lifeSavesAll().find(g=>g.id==='restore-from-tools').d.players.map(p=>p.life))).toEqual([31,27]);
  expect(errors).toEqual([]);
});

test('Life saved-game and dungeon menus restore games and retain room progress', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{
    localStorage.setItem(LS_PREFIX+'lifeSaves',JSON.stringify([{id:'life-test',t:Date.now(),d:{count:2,layout:'2f',rotate:false,turnNum:3,turnIdx:0,startIdx:0,history:['Saved event'],players:[{name:'Alice',life:31,poison:0,dmg:[]},{name:'Bob',life:27,poison:0,dmg:[]}]}}]));
    state.guild='dimir';applyTheme();switchPage('life');
  });
  await page.locator('#lifeSavedGames').click();
  const saved=page.getByRole('dialog',{name:'Saved games',exact:true});
  await expect(saved.locator('[data-lr]')).toHaveCount(1);
  await saved.locator('[data-life-close]').click();
  await expect(saved).toHaveCount(0);
  await page.locator('#lifeSavedGames').click();
  await saved.locator('[data-lr="0"]').click();
  await expect(page.locator('#lifeOverlay')).toBeVisible();
  await expect(page.locator('[data-setlife]')).toHaveText(['31','27']);
  expect(await page.evaluate(()=>state.life.turnNum)).toBe(3);
  await page.locator('.submenu-toggle[data-idx="0"]').click();
  await page.locator('[data-ldungeon="0"]').click();
  const dungeon=page.getByRole('dialog',{name:'Dungeons',exact:true});
  await expect(dungeon.locator('.dg-grid .dg-card')).toHaveCount(4);
  await expect(dungeon.locator('h2, .hub-eyebrow, .life-popup-head, #dgOk')).toHaveCount(0);
  await expect(dungeon.getByRole('button',{name:'Done',exact:true})).toHaveCount(0);
  await expect(dungeon.locator('#dgAll')).toHaveCount(0);

  await dungeon.locator('.dg-grid .dg-card').first().click();
  const all = dungeon.getByRole('button',{name:'All dungeons',exact:true});
  const close = dungeon.getByRole('button',{name:'Close',exact:true});
  await expect(all.locator('svg')).toHaveCount(1);
  expect((await all.textContent()).trim()).toBe('');
  await expect(all).toHaveCSS('border-top-width','0px');
  expect((await all.boundingBox()).x).toBeLessThan((await close.boundingBox()).x);
  expect((await all.boundingBox()).y).toBe((await close.boundingBox()).y);
  await all.click();
  await expect(dungeon.locator('.dg-grid .dg-card')).toHaveCount(4);
  await dungeon.locator('.dg-grid .dg-card').first().click();

  await dungeon.locator('.dg-spot.next').first().click();
  expect(await page.evaluate(()=>state.life.players[0].dg?.room)).toBeTruthy();
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/life-dungeon-${info.project.name}.png`});
  await page.setViewportSize({width:320,height:480});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await dungeon.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  expect(await dungeon.locator('.life-popup-footer button').evaluateAll(buttons=>buttons.every(b=>b.scrollWidth<=b.clientWidth))).toBe(true);
  await dungeon.locator('[data-life-close]').click();
  await expect(dungeon).toHaveCount(0);
  expect(await page.evaluate(()=>state.life.players[0].dg?.room)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('Life tracks Monarch and Initiative independently with crown and torch badges', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.locator('.app > .app-navigation').getByRole('button',{name:'Life',exact:true}).click();
  await page.evaluate(()=>{
    state.guild='dimir';applyTheme();
    state.life.count=4;state.life.layout='4q';state.life.rotate=true;state.life.setupDone=true;
    openLifeOverlay();
  });
  const card=index=>page.locator(`.life-card-v2[data-idx="${index}"]`);
  const edit=async index=>{
    await page.locator(`.submenu-toggle[data-idx="${index}"]`).click();
    await expect(card(index)).toHaveClass(/focused/);
  };
  const done=async()=>{
    await page.locator('.submenu-toggle.done').click();
    await expect(page.locator('.life-card-v2.focused')).toHaveCount(0);
  };
  const initiative=async index=>{
    await card(index).getByRole('button',{name:'Dungeon',exact:true}).click();
    await page.locator('#lifeDgSheet').getByRole('button',{name:'Initiative',exact:true}).click();
    await page.locator('#lifeDgSheet [data-life-close]').click();
    await expect(page.locator('#lifeDgSheet')).toHaveCount(0);
  };
  await edit(0);
  await expect(card(0).locator('[data-linitiative]')).toHaveCount(0);
  await card(0).getByRole('button',{name:'Monarch',exact:true}).click();
  await initiative(0);
  await expect(card(0).locator('.life-roles .lmonarch')).toBeVisible();
  await expect(card(0).locator('.life-roles .linitiative')).toBeVisible();
  const controls=await card(0).locator('.lf-extras').evaluate(el=>{
    const items=[...el.children];
    return items.map(item=>({left:item.offsetLeft,right:item.offsetLeft+item.offsetWidth,top:item.offsetTop}));
  });
  expect(controls).toHaveLength(4);
  for(let i=1;i<controls.length;i++){
    expect(controls[i].left).toBeGreaterThanOrEqual(controls[i-1].right);
    expect(controls[i].top).toBe(controls[0].top);
  }
  await done();
  await expect(card(0).locator('.life-role-corner .life-role-icon')).toHaveCount(2);
  await expect(card(0).locator('.life-player-name .life-role-icon')).toHaveCount(0);
  const corner=await card(0).locator('.life-player-footer').evaluate(el=>{
    const roles=el.querySelector('.life-roles');
    return {left:roles.offsetLeft,width:el.clientWidth,rolesRight:roles.offsetLeft+roles.offsetWidth};
  });
  expect(corner.left).toBe(0);
  expect(corner.rolesRight).toBeLessThan(corner.width/2);
  await edit(1);
  await expect(card(0).locator('.dmg-overlay .life-role-corner .life-role-icon')).toHaveCount(2);
  await initiative(1);
  await done();
  await expect(card(0).locator('.linitiative')).toHaveCount(0);
  await expect(card(0).locator('.lmonarch')).toBeVisible();
  await expect(card(1).locator('.linitiative')).toBeVisible();
  await edit(1);
  await card(1).getByRole('button',{name:'Monarch',exact:true}).click();
  await done();
  await expect(card(0).locator('.lmonarch')).toHaveCount(0);
  await expect(card(1).locator('.life-role-icon')).toHaveCount(2);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/life-crown-torch-${info.project.name}.png`});
  await expect.poll(()=>page.evaluate(()=>{
    const saved=lifeSavesAll().find(g=>g.id===state.life.gameId);
    return saved?.d.players.map(p=>[p.monarch,p.initiative]);
  })).toEqual([[false,false],[true,true],[false,false],[false,false]]);
  await page.evaluate(()=>{dismissAllOverlays();render();});
  await page.locator('#lifeSavedGames').click();
  await page.locator('[data-lr="0"]').click();
  await expect(card(1).locator('.life-role-icon')).toHaveCount(2);
  await edit(1);
  await initiative(1);
  await done();
  await expect(card(1).locator('.linitiative')).toHaveCount(0);
  await expect(card(1).locator('.lmonarch')).toBeVisible();
  await page.locator('#lifeCogBtn').click();
  await page.locator('#mTools').click();
  await page.locator('#restartLifeBtn').click();
  await page.locator('#iacOk').click();
  await page.locator('#startGameBtn').click();
  await expect(page.locator('.life-role-icon')).toHaveCount(0);
  expect(await page.evaluate(()=>state.life.players.every(p=>!p.monarch&&!p.initiative))).toBe(true);
  expect(errors).toEqual([]);
});

test('Undercity shows its dungeon face, follows room choices and keeps Initiative after completion', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{
    state.guild='dimir';applyTheme();switchPage('life');
    state.life.count=2;state.life.layout='2f';state.life.rotate=true;state.life.setupDone=true;
    openLifeOverlay();
  });
  await page.locator('.submenu-toggle[data-idx="0"]').click();
  await page.locator('[data-ldungeon="0"]').click();
  await page.locator('#lifeDgSheet [data-linitiative="0"]').click();
  const dungeon=page.getByRole('dialog',{name:'Dungeons',exact:true});
  const undercity=dungeon.locator('.dg-grid [data-dgcard="uc"]');
  await expect(undercity.locator('.dg-card-name')).toHaveText('Undercity');
  await expect(undercity.locator('img')).toHaveAttribute('src',/cards\.scryfall\.io\/normal\/front\/2\/c\/2c65185b-6cf0-451d-985e-56aa45d9a57d\.jpg/);
  await undercity.click();
  await expect(dungeon.locator('.dg-card.big img')).toHaveAttribute('alt','Undercity');
  await expect(dungeon.locator('.dg-spot.next')).toHaveAttribute('data-room','Secret Entrance');
  await dungeon.locator('[data-room="Secret Entrance"]').click();
  expect(await page.evaluate(()=>state.life.players[0].dg)).toEqual({id:'uc',room:'Secret Entrance'});
  expect(await dungeon.locator('.dg-spot.next').evaluateAll(nodes=>nodes.map(n=>n.dataset.room))).toEqual(['Forge','Lost Well']);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/undercity-dungeon-${info.project.name}.png`});
  for(const room of ['Forge','Trap!','Archives','Throne of the Dead Three']) await dungeon.locator('.dg-spot.next').filter({has:page.locator(`.dg-spot-name`,{hasText:room})}).click();
  expect(await page.evaluate(()=>({dungeon:state.life.players[0].dg,completed:state.life.players[0].dgDone.uc,initiative:state.life.players[0].initiative}))).toEqual({dungeon:null,completed:1,initiative:true});
  await dungeon.locator('[data-life-close]').click();
  await page.locator('.submenu-toggle.done').click();
  await expect(page.locator('.life-card-v2[data-idx="0"] .linitiative')).toBeVisible();
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
  await page.getByRole('button', { name: 'Settings Preferences & backups' }).click();
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
  for(const id of ['menuSettings','lifeRow','draftRow','crRow','fmtRulesRow','banListsRow']){
    await expect(page.locator(`.menu-page #${id}`)).toHaveClass(/hub-card/);
  }
  await expect(page.locator('#syncRow, #backupRow, #langRow, #dataSourcesRow, #guildRow, #notifRow, #notifBody, #changelogBtn, #footFeedbackBtn, #aboutRow, #installAppRow, #shareAppRow')).toHaveCount(0);
  await expect(page.locator('.menu-page .hub-card').last()).toHaveAttribute('id','menuSettings');
  await expect(page.locator('.menu-page #fmtRulesBody, .menu-page #banListsBody')).toHaveCount(0);
  for(const [row,body,title] of [['fmtRulesRow','fmtRulesBody','FORMAT RULES'],['banListsRow','banListsBody','BAN LISTS']]){
    await page.locator(`#${row}`).click();
    await expect(page.locator(`#${body}`)).toBeVisible();
    await expect(page.locator('#brandTitle')).toHaveText(title);
    await expect(page.locator('.menu-page')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('#brandTitle')).toHaveText('MENU');
    await expect(page.locator(`#${body}`)).toHaveCount(0);
  }
  await page.locator('#lifeRow').click();
  await expect(page.locator('.life-page')).toBeVisible();
  await expect(page.locator('#brandTitle')).toHaveText('LIFE TRACKER');
  await expect(page.locator('.app > .app-navigation').getByRole('button',{name:'Life',exact:true})).toHaveAttribute('aria-current','page');
  await page.goBack();
  await expect(page.locator('.menu-page #lifeRow')).toBeVisible();
  await page.locator('#crRow').click();
  await expect(page.locator('#crOverlay')).toBeVisible();
  await page.evaluate(()=>dismissAllOverlays());
  await page.locator('#draftRow').click();
  expect(await page.evaluate(()=>state.screen)).toBe('draft');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.screenshot({path:`var/previews/menu-tools-${info.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});

test('Format Rules and Ban Lists are standalone pages with working details and previews', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const card={id:'ban-fixture',name:'Black Lotus',type_line:'Artifact',border_color:'black',image_uris:{normal:'/icon-192.png',large:'/icon-192.png'}};
  await page.route('**/api/scryfall/cards/search*',route=>route.fulfill({json:{object:'list',has_more:false,total_cards:1,data:[card]}}));
  await page.route('**/api/scryfall/cards/named*',route=>route.fulfill({json:card}));
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.locator('#fmtRulesRow').click();
  await expect(page.locator('#brandTitle')).toHaveText('FORMAT RULES');
  await expect(page.locator('.app-header')).toHaveCSS('border-bottom-width','1px');
  await expect(page.locator('.app-header')).toHaveCSS('box-shadow','none');
  await expect(page.locator('.format-rules-page [data-fmtrule]')).toHaveCount(10);
  await page.locator('[data-fmtrule="commander"] .l1').click();
  await expect(page.locator('[data-fmtruletxt="commander"]')).toContainText('100-card singleton');
  await page.locator('[data-fmtfull="commander"]').click();
  await expect(page.locator('[data-fmtfullbox="commander"]')).toBeVisible();
  await page.screenshot({path:`var/previews/format-rules-page-${info.project.name}.png`});
  await page.goBack();
  await expect(page.locator('[data-fmtfullbox="commander"]')).toBeHidden();
  await expect(page.locator('#brandTitle')).toHaveText('FORMAT RULES');
  await page.goBack();
  await expect(page.locator('[data-fmtruletxt="commander"]')).toBeHidden();
  await page.goBack();
  await expect(page.locator('#brandTitle')).toHaveText('MENU');
  await page.locator('#banListsRow').click();
  await expect(page.locator('#brandTitle')).toHaveText('BAN LISTS');
  await expect(page.locator('.app-header')).toHaveCSS('border-bottom-width','1px');
  await expect(page.locator('.app-header')).toHaveCSS('box-shadow','none');
  await expect(page.locator('.ban-lists-page [data-banfmt]')).toHaveCount(9);
  await page.locator('[data-banfmt="commander"] .l1').click();
  const ban=page.locator('[data-banbox="commander"]');
  await expect(ban.getByRole('button',{name:'Black Lotus',exact:true})).toBeVisible();
  await page.locator('[data-banwhy="commander"]').click();
  await expect(ban.locator('[data-banwhybox]')).toBeVisible();
  await page.screenshot({path:`var/previews/ban-lists-page-${info.project.name}.png`});
  await ban.getByRole('button',{name:'Black Lotus',exact:true}).click();
  await expect(page.locator('#previewRoot .card-preview-backdrop')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#previewRoot')).toHaveCount(0);
  await expect(page.locator('#brandTitle')).toHaveText('BAN LISTS');
  await page.getByRole('button',{name:'Go to home',exact:true}).click();
  await expect(page.locator('#brandTitle')).toHaveText('DECKHAND');
  await expect(page.locator('.app-navigation .banner-tab')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('Settings keeps preferences and backups while account controls stay in Menu', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await expect(page.locator('#menuScanCards, .menu-page [aria-label="Card scanner"]')).toHaveCount(0);
  await page.locator('#menuAccount').click();
  await expect(page.locator('#accountSheet')).toBeVisible();
  await page.evaluate(()=>dismissAllOverlays());
  await page.locator('#menuSettings').click();
  await expect(page.locator('.settings-page .hub-card')).toHaveCount(7);
  await expect(page.locator('#dataSourcesRow, #dataSourcesBody, #bulkDlNow, [data-srcrefresh], #syncRow, .settings-page #menuAccount')).toHaveCount(0);
  await expect(page.locator('.settings-page .hub-card').last()).toHaveAttribute('id','settingsChangelogRow');
  for(const [row,body] of [['startupRow','startupBody'],['scannerSettingsRow','scannerSettingsBody'],['collectionSettingsRow','collectionSettingsBody'],['guildRow','guildBody'],['backupRow','backupBody'],['settingsChangelogRow','settingsChangelogBody']]){
    await page.locator(`#${row}`).click();
    await expect(page.locator(`#${body}`)).toBeVisible();
    await page.locator(`#${row}`).click();
    await expect(page.locator(`#${body}`)).toBeHidden();
  }
  await expect(page.locator('#settingsChangelogRow .l2')).toContainText(await page.evaluate(()=>APP_VERSION));
  await page.locator('#settingsChangelogRow').click();
  const releases=page.locator('#settingsChangelogBody .cl-entry');
  expect(await releases.count()).toBe(await page.evaluate(()=>settingsChangelogEntries().length));
  await expect(releases.first().locator('.cl-notes')).toBeVisible();
  await expect(releases.first().locator('.cl-head')).toHaveAttribute('aria-expanded','true');
  await releases.nth(1).locator('.cl-head').click();
  await expect(releases.nth(1).locator('.cl-notes')).toBeVisible();
  await releases.nth(1).locator('.cl-head').click();
  await expect(releases.nth(1).locator('.cl-notes')).toBeHidden();
  await page.goBack();
  await expect(page.locator('#settingsChangelogBody')).toBeHidden();
  await expect(page.locator('#langRow, #languageBody, [data-lang-choice]')).toHaveCount(0);
  expect(await page.evaluate(()=>appLang())).toBe('en');
  await page.locator('#guildRow').click();
  const color=page.locator('[data-guild]:not(.sel)').first();
  const selected=await color.getAttribute('data-guild');
  await color.click();
  expect(await page.evaluate(()=>state.guild)).toBe(selected);
  await expect(page.locator('#guildBody')).toBeHidden();
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

test('Startup page preference persists and launches each selected main page', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const options=[['decks','Decks','MY DECKS','#deckFilter'],['collection','Collection','COLLECTION','#colSearchQ'],
    ['search','Search','SEARCH','#searchName'],['browse','Inspiration','INSPIRATION','#bsName'],
    ['life','Life','LIFE TRACKER','#lifeNewGame'],['home','Home','DECKHAND','.home-page']];
  for(const [value,label,title,field] of options){
    await page.getByRole('button',{name:'Open menu',exact:true}).click();
    await page.locator('#menuSettings').click();
    await page.locator('#startupRow').click();
    await expect(page.locator('#startupBody input[type="radio"]')).toHaveCount(7);
    await page.locator('#startupBody').getByRole('radio',{name:label,exact:true}).check();
    await expect(page.locator('#startupRow .l2')).toHaveText(label);
    await expect(page.locator('#brandTitle')).toHaveText('SETTINGS');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('admiral_app:settings:app')).startupPage)).toBe(value);
    await page.reload();
    await expect(page.locator('#brandTitle')).toHaveText(title);
    expect(await page.evaluate(()=>state.screen)).toBe(value);
    expect(await page.evaluate(()=>history.state.screen)).toBe(value);
    await expect(page.locator(field)).toBeVisible();
  }
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.locator('#menuSettings').click();
  await page.locator('#startupRow').click();
  await expect(page.getByRole('radio',{name:'Home',exact:true})).toBeChecked();
  const original=page.viewportSize();
  await page.setViewportSize({width:320,height:700});
  expect(await page.locator('#startupBody').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.setViewportSize(original);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/settings-startup-${info.project.name}.png`});
  expect(errors).toEqual([]);
});

test('Startup preference validates saved pages, survives color changes, and respects shortcuts', async ({page})=>{
  for(const settings of ['{bad json',JSON.stringify({theme:'dark',guild:'izzet'}),JSON.stringify({startupPage:'missing-page'})]){
    await page.evaluate(settings=>localStorage.setItem('admiral_app:settings:app',settings),settings);
    await page.reload();
    await expect(page.locator('#brandTitle')).toHaveText('DECKHAND');
    expect(await page.evaluate(()=>state.startupPage)).toBe('home');
  }
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.locator('#menuSettings').click();
  await page.locator('#startupRow').click();
  await page.getByRole('radio',{name:'Collection',exact:true}).check();
  await page.locator('#guildRow').click();
  const color=page.locator('[data-guild]:not(.sel)').first();
  const guild=await color.getAttribute('data-guild');
  await color.click();
  await page.reload();
  await expect(page.locator('#brandTitle')).toHaveText('COLLECTION');
  expect(await page.evaluate(()=>state.guild)).toBe(guild);
  await page.goto('/?go=search');
  await expect(page.locator('#brandTitle')).toHaveText('SEARCH');
  expect(await page.evaluate(()=>state.startupPage)).toBe('collection');
  await page.reload();
  await expect(page.locator('#brandTitle')).toHaveText('COLLECTION');
});

test('Ask AI Judge keeps its question above navigation and reads answers from the top', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/judge',route=>route.fulfill({json:{
    ok:true,answer:'The creature dies.\n'+Array.from({length:45},(_,i)=>`Answer detail ${i+1}.`).join('\n'),
    reasoning:'State-based actions check toughness.',cites:['704.5f','702.12b'],confident:true,left:19
  }}));
  await page.evaluate(()=>{
    state.guild='dimir'; applyTheme();
    state._cr=[{n:'702.12b',t:'Indestructible prevents destruction.'},{n:'704.5f',t:'A creature with toughness 0 or less is put into its graveyard.'}];
  });
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.locator('#crRow').click();
  const overlay=page.locator('#crOverlay');
  const body=overlay.locator('#crBody');
  const header=overlay.locator('.app-overlay-header');
  const nav=overlay.locator('.app-navigation');
  const icon=header.getByRole('button',{name:'Read the Comprehensive Rules'});
  await expect(header).toHaveCSS('border-bottom-width','1px');
  await expect(header).toHaveCSS('box-shadow','none');
  await expect(icon).toBeVisible();
  await expect(icon.locator('svg')).toHaveCount(1);
  expect(await icon.textContent()).toBe('');
  await expect(icon).toHaveCSS('border-top-width','0px');
  await expect(body.locator('#crOpenRules')).toHaveCount(0);
  await expect(body.locator('.hub-intro h1')).toHaveText('Ask the AI judge.');
  await expect(body.locator('.cj-ex.hub-card')).toHaveCount(3);
  await expect(body.locator('.cj-ex').first()).toHaveCSS('border-radius','18px');
  const original=page.viewportSize();
  for(const size of [original,{width:320,height:480}]){
    await page.setViewportSize(size);
    const h=await header.boundingBox(), n=await nav.boundingBox();
    const b=await body.boundingBox(), bar=await overlay.locator('.cr-bar').boundingBox();
    const q=await overlay.locator('#crQ').boundingBox(), action=await overlay.locator('#crJudge').boundingBox();
    expect(h.y).toBe(0);
    expect(h.height).toBeCloseTo((await page.locator('.app > .app-header').boundingBox()).height,0);
    expect(await header.locator('.ov-title').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15);
    await expect(overlay.locator('#cjAvailability')).toHaveCount(0);
    expect(b.y).toBeCloseTo(h.y+h.height,0);
    expect(b.y+b.height).toBeCloseTo(bar.y,0);
    expect(bar.y+bar.height).toBeCloseTo(n.y,0);
    expect(q.y+q.height).toBeLessThanOrEqual(n.y);
    expect(action.y+action.height).toBeLessThanOrEqual(n.y);
    expect((await icon.boundingBox()).x).toBeGreaterThan(size.width/2);
    const hero=await body.locator('.cj-hero').boundingBox();
    const label=await body.locator('.cj-lab').boundingBox();
    const examples=await body.locator('.cj-ex').all();
    expect(hero.y+hero.height).toBeLessThanOrEqual(label.y);
    let previous=label.y;
    for(const example of examples){
      const bounds=await example.boundingBox();
      expect(bounds.y).toBeGreaterThan(previous);
      previous=bounds.y;
    }
  }
  await page.setViewportSize(original);
  await overlay.locator('#crQ').fill('Does a creature with zero toughness die?');
  await overlay.locator('#crJudge').click();
  await expect(body.locator('.cja-a')).toContainText('The creature dies.');
  expect(await body.evaluate(el=>el.scrollTop)).toBe(0);
  const first=await body.locator('.cja').boundingBox();
  expect(first.y).toBeGreaterThanOrEqual((await body.boundingBox()).y);
  const heading=await body.locator('.cja-h').boundingBox();
  const rules=await body.locator('.cr-rule').all();
  expect(heading.y).toBeGreaterThanOrEqual(first.y+first.height);
  let previous=heading.y+heading.height;
  for(const rule of rules){
    const bounds=await rule.boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(previous);
    previous=bounds.y+bounds.height;
  }
  const navBounds=await nav.boundingBox(), qBounds=await overlay.locator('.cr-bar').boundingBox();
  const bounds=await body.boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.wheel(0,450);
  await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  expect(await nav.boundingBox()).toEqual(navBounds);
  expect(await overlay.locator('.cr-bar').boundingBox()).toEqual(qBounds);
  await body.evaluate(el=>el.scrollTop=0);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/judge-answer-${info.project.name}.png`});
  await page.goBack();
  await expect(body.locator('.cj-hero')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Judge header logo opens Menu from questions, answers and rules, while its title opens Home', async ({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/judge',route=>route.fulfill({json:{
    ok:true,answer:'The creature dies.',reasoning:'State-based actions check toughness.',
    cites:['704.5f'],confident:true,left:19
  }}));
  await page.evaluate(()=>{
    state._cr=[{n:'704.5f',t:'A creature with toughness 0 or less is put into its graveyard.'}];
  });
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  for(const mode of ['question','answer','rules']){
    await page.locator('#crRow').click();
    const overlay=page.locator('#crOverlay');
    if(mode==='answer'){
      await overlay.locator('#crQ').fill('Does a creature with zero toughness die?');
      await overlay.locator('#crJudge').click();
      await expect(overlay.locator('.cja-a')).toContainText('The creature dies.');
    } else if(mode==='rules'){
      await overlay.getByRole('button',{name:'Read the Comprehensive Rules'}).click();
      await expect(overlay.locator('.ov-title')).toHaveText('Comprehensive Rules');
    }
    // Tap the visible logo's coordinates to catch titles overlapping its hit area.
    const logo=await overlay.locator('[data-app-menu] img').boundingBox();
    await page.mouse.click(logo.x+logo.width/2,logo.y+logo.height/2);
    await expect(overlay).toHaveCount(0);
    await expect(page.locator('#brandTitle')).toHaveText('MENU');
    await expect(page.locator('.menu-page')).toBeVisible();
  }
  await page.locator('#crRow').click();
  await page.locator('#crOverlay').getByRole('button',{name:'Go to home',exact:true}).click();
  await expect(page.locator('#crOverlay')).toHaveCount(0);
  await expect(page.locator('#brandTitle')).toHaveText('DECKHAND');
  expect(errors).toEqual([]);
});

test('Comprehensive Rules opens from the judge header and lists sections and matches top to bottom', async ({page},info)=>{
  await page.evaluate(()=>{
    state._cr=Array.from({length:40},(_,i)=>({n:String(100+i),t:`Rules section ${i+1}`}));
  });
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.locator('#crRow').click();
  const overlay=page.locator('#crOverlay'), body=overlay.locator('#crBody');
  await overlay.getByRole('button',{name:'Read the Comprehensive Rules'}).click();
  await expect(overlay.locator('.ov-title')).toHaveText('Comprehensive Rules');
  const header=overlay.locator('.app-overlay-header');
  await expect(header).toHaveCSS('border-bottom-width','1px');
  await expect(header).toHaveCSS('box-shadow','none');
  const original=page.viewportSize();
  for(const size of [original,{width:320,height:480}]){
    await page.setViewportSize(size);
    const bounds=await header.boundingBox();
    expect(bounds.height).toBeCloseTo((await page.locator('.app > .app-header').boundingBox()).height,0);
    const title=await header.locator('.ov-title').boundingBox();
    expect(await header.locator('.ov-title').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15);
    expect(title.y).toBeGreaterThanOrEqual(bounds.y);
    expect(title.y+title.height).toBeLessThanOrEqual(bounds.y+bounds.height);
    expect((await body.boundingBox()).y).toBeCloseTo(bounds.y+bounds.height,0);
    expect(await header.evaluate(el=>el.scrollHeight<=el.clientHeight)).toBe(true);
  }
  await page.screenshot({path:`var/previews/comprehensive-rules-header-${info.project.name}.png`});
  await page.setViewportSize(original);
  await expect(body.locator('.cr-toc-row')).toHaveCount(40);
  await expect(body.locator('.hub-intro h1')).toHaveText('Know the rules.');
  await expect(body.locator('.cr-toc-row').first()).toHaveClass(/hub-card/);
  await expect(body.locator('.cr-toc-row').first()).toHaveCSS('border-radius','18px');
  expect(await body.evaluate(el=>el.scrollTop)).toBe(0);
  const first=await body.locator('.cr-toc-row').first().boundingBox();
  const second=await body.locator('.cr-toc-row').nth(1).boundingBox();
  await expect(body.locator('.cr-toc-row .cr-num').first()).toHaveText('100');
  await expect(body.locator('.cr-toc-row .cr-num').last()).toHaveText('139');
  expect(second.y).toBeGreaterThan(first.y);
  await body.locator('[data-crjump="103"]').click();
  await expect(body.locator('.cr-rule .cr-num')).toHaveText('103');
  await expect(body.locator('.hint')).toContainText('best match first');
  expect(await body.evaluate(el=>el.scrollTop)).toBe(0);
  const hint=await body.locator('.hint').boundingBox();
  expect((await body.locator('.cr-rule').boundingBox()).y).toBeGreaterThanOrEqual(hint.y+hint.height);
  await page.goBack();
  await expect(body.locator('.cr-toc-row')).toHaveCount(40);
  await page.goBack();
  await expect(overlay.locator('.ov-title')).toHaveText('Ask AI judge');
  await expect(overlay.getByRole('button',{name:'Read the Comprehensive Rules'})).toBeVisible();
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/judge-home-${info.project.name}.png`});
});

test('every page scrolls only inside its content viewport', async ({page},info)=>{
  for(const screen of ['home','decks','collection','browse','life','menu','settings','draft','trade','formatrules','banlists']){
    await page.evaluate(screen=>switchPage(screen),screen);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const viewport=page.locator('.app .tab-viewport[data-screen]');
    await expect(viewport).toBeVisible();
    const header=await page.locator('.app-header').boundingBox();
    const nav=await page.locator('.app > .app-navigation').boundingBox();
    const bounds=await viewport.boundingBox();
    const controls=page.locator('.app > main > .page-controls:visible');
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

test('Collection filters slide full screen and preserve, apply and reset owned-card filters', async ({page},info)=>{
  await expect.poll(()=>page.evaluate(()=>state.homeLoaded)).toBe(true);
  await page.evaluate(()=>{
    state.collection.items=Array.from({length:40},(_,i)=>({name:`Scroll fixture ${i}`,type_line:'Artifact',colors:['G'],
      qty:1,eur:1,set:'tst',cond:'NM',rarity:'common',img:'/icon-192.png',legal_cmd:'legal'}));
    switchPage('collection');
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const viewport=page.locator('.app .tab-viewport[data-screen]');
  const closed=await viewport.boundingBox();
  await page.locator('#colChev').click();
  const dialog=page.getByRole('dialog',{name:'Collection filters'});
  await expect(dialog).toBeVisible();
  await expect.poll(async()=>Math.round((await dialog.boundingBox()).x)).toBe(0);
  expect(await dialog.boundingBox()).toEqual({x:0,y:0,...page.viewportSize()});
  expect(await viewport.boundingBox()).toEqual(closed);
  expect(await viewport.evaluate(el=>el.scrollTop)).toBe(0);
  await page.locator('#colTypeText').fill('Artifact');
  await page.locator('label.ccheck').filter({has:page.locator('[data-colcolor="G"]')}).click();
  await page.screenshot({path:`var/previews/collection-filters-scroll-${info.project.name}.png`});
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>({...state.colFilter.colors,type:state.colFilter.type}))).toMatchObject({G:true,type:'Artifact'});
  await page.locator('#colChev').click();
  await expect(page.locator('#colTypeText')).toHaveValue('Artifact');
  await page.locator('#advancedSearchReset').click();
  await expect(page.locator('#colTypeText')).toHaveValue('');
  await expect(page.locator('[data-colcolor="G"]')).not.toBeChecked();
  await page.locator('#colFq').fill('Forest');
  await page.locator('#advGo').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#colSearchQ')).toHaveValue('Forest');
  expect(await page.evaluate(()=>state.searchName)).toBe('');
  await page.locator('#colChev').click();
  await page.locator('#colFq').fill('Lightning');
  await page.locator('#colFq').press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#colSearchQ')).toHaveValue('Lightning');
});

test('Decks and Collection search bars fill the page width and scroll with content', async ({page},info)=>{
  for(const [name,id] of [['Decks','#deckFilter'],['Collection','#colSearchQ']]){
    await page.locator('.app-navigation').getByRole('button',{name,exact:true}).click();
    const input=page.locator(id);
    if(name==='Decks') await expect(input).toHaveAttribute('placeholder','Search decks...');
    if(name==='Decks'){
      const sort=page.locator('.decks-searchbar #deckSortBtn');
      await expect(sort).toBeVisible();
      await expect(page.locator('#folderViewToggle')).toHaveCount(0);
      const field=await input.boundingBox(), button=await sort.boundingBox();
      expect(button.x).toBeGreaterThan(field.x+field.width);
      expect(button.y).toBeCloseTo(field.y,0);
      expect(button.height).toBe(field.height);
    } else {
      await expect(page.locator('#folderViewToggle')).toHaveCount(0);
      await page.locator('#colChev').click();
      const filters=page.locator('#advancedSearchScreen');
      await expect(filters.locator('#folderViewToggle')).toHaveText('List view');
      await filters.locator('#folderViewToggle').click();
      await expect(filters).toBeVisible();
      await expect(filters.locator('#folderViewToggle')).toHaveText('Tile view');
      expect(await page.evaluate(()=>localStorage.getItem(LS_PREFIX+'colView'))).toBe('list');
      await filters.locator('#advancedSearchClose').click();
      await expect(page.locator('#folderViewToggle')).toHaveCount(0);
    }
    expect(await input.evaluate(el=>{
      const viewport=el.closest('.tab-viewport'), bar=el.closest('.searchbar');
      return !!viewport && Math.abs(bar.getBoundingClientRect().width-(viewport.clientWidth-16))<2;
    })).toBe(true);
    const viewport=page.locator('.tab-viewport[data-screen]');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const header=await page.locator('.app-header').boundingBox();
    const start=await input.boundingBox();
    await viewport.evaluate(el=>{const filler=document.createElement('div');filler.style.height='1800px';el.append(filler);el.scrollTop=160;});
    expect((await input.boundingBox()).y).toBeCloseTo(start.y-160,0);
    expect(await page.locator('.app-header').boundingBox()).toEqual(header);
    await viewport.evaluate(el=>el.scrollTop=0);
    await input.fill('My search');
    await expect(input).toHaveValue('My search');
    await page.screenshot({path:`var/previews/${name.toLowerCase()}-inline-search-${info.project.name}.png`});
  }
});

test('backup reminder lives in Menu and the logo badge clears after snoozing or saving', async ({page})=>{
  await expect.poll(()=>page.evaluate(()=>state.homeLoaded)).toBe(true);
  await page.evaluate(()=>{createNewDeck('Backup fixture','commander');switchPage('decks');});
  await expect(page.locator('#backupNote')).toHaveCount(0);
  const badge=page.locator('#homeBtn .menu-alert');
  await expect(badge).toBeVisible();
  const logo=await page.locator('#homeBtn').boundingBox(), alert=await badge.boundingBox();
  expect(alert.x).toBeGreaterThan(logo.x+logo.width/2);
  expect(alert.y).toBeLessThan(logo.y+logo.height/2);
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await expect(page.locator('.menu-page #backupNote')).toBeVisible();
  await page.locator('#backupLater').click();
  await expect(page.locator('#backupNote')).toHaveCount(0);
  await expect(badge).toHaveCount(0);
  await page.evaluate(()=>{localStorage.removeItem(LS_PREFIX+'backupSnooze');render();});
  await expect(badge).toBeVisible();
  await page.locator('#backupNow').click();
  await expect(page.locator('#backupSheet')).toBeVisible();
  const download=page.waitForEvent('download');
  await page.locator('#bkSave').click();
  await download;
  await expect(badge).toHaveCount(0);
  await expect(page.locator('#backupNote')).toHaveCount(0);
});

test('Collection puts Trade in its title bar and keeps its search free of the total value', async ({page},info)=>{
  await page.evaluate(()=>{
    state.collection.items=[{name:'Sol Ring',type_line:'Artifact',qty:2,eur:5,set:'tst',cond:'NM',rarity:'common',img:'/icon-192.png',legal_cmd:'legal'}];
    switchPage('collection');
  });
  const trade=page.locator('.app-header #tradeBtn');
  await expect(page.locator('#brandTitle')).toHaveText('COLLECTION');
  await expect(page.locator('.app-header .cap-tools > span:not(.net-chip)')).toHaveCount(0);
  await expect(trade).toHaveAccessibleName('Trade calculator');
  await expect(trade.locator('svg')).toHaveCount(1);
  await expect(page.locator('.searchbar #tradeBtn')).toHaveCount(0);
  await expect(page.locator('.searchbar #capNoteBtn, .searchbar .collection-value')).toHaveCount(0);
  await expect(page.locator('.app-header #capNoteBtn')).toHaveCount(0);
  await page.screenshot({path:`var/previews/collection-title-actions-${info.project.name}.png`});
  await trade.click();
  await expect(page.locator('#brandTitle')).toHaveText('TRADE');
});

test('Decks and Collection add buttons share the same size and fixed position', async ({page},info)=>{
  await page.locator('.app-navigation').getByRole('button',{name:'Decks',exact:true}).click();
  const decks=page.locator('#deckFab');
  await expect(decks).toBeVisible();
  const bounds=await decks.boundingBox(), nav=await page.locator('.app-navigation').boundingBox();
  expect(bounds.width).toBe(54);
  expect(bounds.height).toBe(54);
  expect(nav.y-bounds.y-bounds.height).toBe(16);
  await page.locator('.app-navigation').getByRole('button',{name:'Collection',exact:true}).click();
  const collection=page.locator('#colFab');
  await expect(collection).toBeVisible();
  expect(await collection.boundingBox()).toEqual(bounds);
  expect(await collection.evaluate(el=>getComputedStyle(el).fontSize)).toBe('26px');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('.tab-viewport[data-screen="collection"]').evaluate(el=>{
    const filler=document.createElement('div');filler.style.height='1800px';el.append(filler);el.scrollTop=300;
  });
  expect(await collection.boundingBox()).toEqual(bounds);
  await page.locator('[data-binderopen="__all__"]').click();
  await expect(page.locator('#binderFab')).toBeVisible();
  expect(await page.locator('#binderFab').boundingBox()).toEqual(bounds);
  await page.screenshot({path:`var/previews/collection-add-button-${info.project.name}.png`});
  await page.locator('#binderFab').click();
  await expect(page.locator('#bfAddCard')).toBeVisible();
});

test('Collection Add card opens Search and adds to the collection or selected binder', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await expect.poll(()=>page.evaluate(()=>state.homeLoaded)).toBe(true);
  const card={id:'collection-add-fixture',oracle_id:'collection-add-oracle',name:'Collection Search Adept',
    type_line:'Creature — Wizard',layout:'normal',cmc:2,mana_cost:'{1}{U}',colors:['U'],color_identity:['U'],
    set:'tst',set_name:'Test set',collector_number:'7',rarity:'common',games:['paper'],
    legalities:{commander:'legal',modern:'legal'},prices:{eur:'1.50',eur_foil:'2.00'},
    image_uris:{normal:'/icon-192.png',large:'/icon-192.png',small:'/icon-192.png'}};
  await page.route('**/api/scryfall/cards/search*',route=>route.fulfill({json:{object:'list',data:[card],has_more:false,total_cards:1}}));
  for(const binder of [null,'collection-add-binder']){
    await page.evaluate(()=>{
      state.collection.items=[];
      state.collection.binders=[{id:'collection-add-binder',name:'Trade binder'}];
      state.decksIndex=[{id:'add-deck-a',name:'First deck',format:'modern',cards:[],updatedAt:2},
        {id:'add-deck-b',name:'Second deck',format:'modern',cards:[],updatedAt:1}];
    });
    await page.locator('.app > .app-navigation').getByRole('button',{name:'Collection',exact:true}).click();
    if(binder) await page.locator(`[data-binderopen="${binder}"]`).click();
    await page.locator(binder?'#binderFab':'#colFab').click();
    await page.locator(binder?'#bfAddCard':'#fabAddCard').click();
    await expect(page.locator('#brandTitle')).toHaveText('SEARCH');
    await expect(page.locator('#colAddSheet, #casQ')).toHaveCount(0);
    expect(await page.evaluate(()=>state.searchPinnedDeckId)).toBeNull();
    await page.locator('#searchName').fill(card.name);
    await page.locator('#searchName').press('Enter');
    const tile=page.locator(`#searchResultsBox .sr-tile[data-name="${encodeURIComponent(card.name)}"]`);
    await tile.getByRole('button',{name:'Add card',exact:true}).click();
    const picker=page.locator('#deckPickScrim');
    const collection=picker.locator('[data-tocollection]');
    await expect(collection).toBeVisible();
    await expect(picker.locator('[data-deck]')).toHaveCount(2);
    const list=await picker.locator('.deckpick-list').boundingBox();
    const option=await collection.boundingBox(), cancel=await picker.locator('#dpCancel').boundingBox();
    expect(option.y).toBeGreaterThanOrEqual(list.y+list.height);
    expect(option.y+option.height).toBeLessThanOrEqual(cancel.y);
    await mkdir('var/previews',{recursive:true});
    await page.screenshot({path:`var/previews/collection-search-add-${binder?'binder':'all'}-${info.project.name}.png`});
    await collection.click();
    await expect(page.locator('#deckPickScrim')).toHaveCount(0);
    await expect(page.locator('#acBinder')).toHaveValue(binder||'');
    await page.locator('#acQty').fill('2');
    await page.locator('#acAdd').click();
    await expect(page.locator('#addCollOverlay')).toHaveCount(0);
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('admiral_app:collection')).items);
    expect(saved).toEqual([expect.objectContaining({name:card.name,qty:2,binder,set:'tst',cn:'7',cond:'NM'})]);
    expect(await page.evaluate(()=>state.decksIndex.every(d=>!d.cards.length))).toBe(true);
    await expect(page.locator('#brandTitle')).toHaveText('SEARCH');
  }
  expect(errors).toEqual([]);
});

test('Card Add keeps collection above Cancel with no decks or a long scrolling deck list', async ({page})=>{
  for(const count of [0,24]){
    await page.evaluate(count=>{
      state.decksIndex=Array.from({length:count},(_,i)=>({id:'picker-'+i,name:'Deck '+i,format:'modern',cards:[]}));
      openDeckPickPopup({name:'Collection picker fixture'},'main',null,null,true);
    },count);
    const picker=page.locator('#deckPickScrim');
    const collection=picker.locator('[data-tocollection]');
    await expect(picker.locator('[data-newdeck]')).toHaveCount(1);
    await expect(picker.locator('[data-deck]')).toHaveCount(count);
    await expect(collection).toBeInViewport();
    await expect(picker.locator('#dpCancel')).toBeInViewport();
    const list=await picker.locator('.deckpick-list').boundingBox();
    const option=await collection.boundingBox(), cancel=await picker.locator('#dpCancel').boundingBox();
    expect(option.y).toBeGreaterThanOrEqual(list.y+list.height);
    expect(option.y+option.height).toBeLessThanOrEqual(cancel.y);
    if(count) expect(await picker.locator('.deckpick-list').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
    await picker.locator('#dpCancel').click();
    await expect(picker).toHaveCount(0);
  }
});

test('Trade has no page search and retains its card editing actions', async ({page})=>{
  await page.evaluate(()=>{
    const card={name:'Trade fixture',eur:5,qty:1,pt:Date.now(),img:'/icon-192.png',set:'tst'};
    state.trade={a:[card],b:[{...card,name:'Other fixture',eur:2,qty:2}]};
    switchPage('trade');
  });
  await expect(page.locator('#brandTitle')).toHaveText('TRADE');
  await expect(page.locator('.app > main .searchbar, .app > main input, #tradeBarHost, #twQ, #twPop, #twClear')).toHaveCount(0);
  await expect(page.locator('[data-tradeadd]')).toHaveCount(2);
  await page.locator('[data-tq="a:0:1"]').click();
  await expect(page.locator('.trade-verdict')).toContainText('€6.00');
  await page.locator('[data-tdel="b:0"]').click();
  await expect(page.locator('.trade-row')).toHaveCount(1);
  expect(await page.evaluate(()=>state.trade.a[0].qty)).toBe(2);
  await page.locator('[data-tradeadd="a"]').click();
  await expect(page.locator('#tradeAddOverlay')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#tradeAddOverlay')).toHaveCount(0);
  await expect(page.locator('#tradeConfirm, #tradeClear')).toHaveCount(2);
  await expect(page.locator('#tradeBarHost, .app > main .searchbar')).toHaveCount(0);
  await page.locator('#tradeClear').click();
  await page.locator('#iacOk').click();
  await expect(page.locator('.trade-row')).toHaveCount(0);
  await expect(page.locator('.trade-verdict')).toHaveText('Even trade.');
  await expect(page.locator('#tradeConfirm')).toBeDisabled();
  await expect(page.locator('#tradeClear')).toBeDisabled();
});

test('Trade card search suggests names on both sides and searches the selected card', async ({page},info)=>{
  const errors=[], queries=[], autocomplete=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/cards/autocomplete')) autocomplete.push(request.url());});
  await page.route('**/api/scryfall/cards/search?*',route=>{
    const query=new URL(route.request().url()).searchParams.get('q');
    if(!query?.endsWith('game:paper')) return route.fulfill({json:{object:'list',data:[],has_more:false}});
    queries.push(query);
    const name=query.startsWith('Lightning')?'Lightning Bolt':'Counterspell';
    return route.fulfill({json:{object:'list',has_more:false,data:[{id:name,name,type_line:'Instant',layout:'normal',
      colors:['U'],color_identity:['U'],rarity:'common',set:'tst',collector_number:'1',prices:{},
      image_uris:{normal:'/icon-192.png',small:'/icon-192.png'}}]}});
  });
  await page.evaluate(async()=>{
    await bulkIndexReady();
    _bulkIdx={cards:['Lightning Bolt','Counterspell',...Array.from({length:30},(_,i)=>`Lightning Test Card ${i}`)]
      .map((n,i)=>({n,id:`trade-suggest-${i}`,tl:'Instant',ly:'normal',lg:'legal'}))};
    switchPage('trade');
  });
  for(const side of ['a','b']){
    await page.locator(`[data-tradeadd="${side}"]`).click();
    const overlay=page.locator('#tradeAddOverlay'), input=overlay.locator('#taName');
    await input.fill('Li');
    await expect(page.locator('#nameSuggest')).toHaveCount(0);
    await input.fill('Lightning');
    const suggestions=page.locator('#nameSuggest');
    await expect(suggestions).toBeVisible();
    await expect(suggestions.locator('button').first()).toHaveText('Lightning Bolt');
    expect(queries).toHaveLength(side==='a'?0:2);
    await page.setViewportSize({width:320,height:480});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await expect.poll(()=>input.evaluate(el=>document.getElementById('nameSuggest').getBoundingClientRect().top-el.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(0);
    const field=await input.boundingBox(), list=await suggestions.boundingBox();
    const nav=await overlay.locator('.app-navigation').boundingBox();
    expect(list.y).toBeGreaterThanOrEqual(field.y+field.height);
    expect(list.x).toBeCloseTo(field.x,0);
    expect(list.y+list.height).toBeLessThanOrEqual(nav.y);
    if(side==='b'){
      await mkdir('var/previews',{recursive:true});
      await page.screenshot({path:`var/previews/trade-suggestions-${info.project.name}.png`});
    }
    await suggestions.getByRole('button',{name:'Lightning Bolt',exact:true}).click();
    await expect(input).toHaveValue('Lightning Bolt');
    await expect(suggestions).toHaveCount(0);
    await expect(overlay.locator('.ta-tile img')).toHaveAttribute('alt','Lightning Bolt');
    await input.fill('Countersp');
    await expect(suggestions).toBeVisible();
    await input.press('Enter');
    await expect(suggestions).toHaveCount(0);
    await expect(overlay.locator('.ta-tile img')).toHaveAttribute('alt','Counterspell');
    await page.goBack();
    await expect(overlay).toHaveCount(0);
    await expect(suggestions).toHaveCount(0);
  }
  expect(queries).toEqual(['Lightning Bolt game:paper','Countersp game:paper','Lightning Bolt game:paper','Countersp game:paper']);
  expect(autocomplete).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('Draft uses the menu layout and keeps setup, timers, pairings and results working', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  const menu=await page.locator('.menu-page').boundingBox();
  const font=await page.locator('.menu-page h1').evaluate(el=>getComputedStyle(el).fontFamily);
  await page.locator('#draftRow').click();
  const main=page.locator('.draft-main');
  await expect(main).toHaveClass(/hub-page/);
  expect((await main.boundingBox()).width).toBe(menu.width);
  await expect(main.locator('h1')).toHaveText('Gather your pod.');
  expect(await main.locator('h1').evaluate(el=>getComputedStyle(el).fontFamily)).toBe(font);
  await expect(main.locator('.tool-panel-heading .hub-icon')).toHaveCount(2);
  await expect(main.locator('.panel-card').first()).toHaveCSS('border-radius','18px');
  await expect(main.locator('[data-dr="seat"]')).toBeDisabled();
  for(const name of ['Alice','Bob']){
    await page.locator('#drName').fill(name);
    await page.locator('#drName').press('Enter');
  }
  await expect(main.locator('.dr-chip')).toHaveCount(2);
  await main.locator('[data-dr="pack15"]').click();
  await main.locator('[data-dr="ptimer-off"]').click();
  await main.locator('[data-dr="bo1"]').click();
  const original=page.viewportSize();
  await page.setViewportSize({width:320,height:700});
  expect(await main.locator('.page-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.setViewportSize(original);
  await main.locator('.page-content').evaluate(el=>el.scrollTop=0);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/draft-menu-style-${info.project.name}.png`});
  await main.locator('[data-dr="seat"]').click();
  await expect(main.locator('.dr-seat')).toHaveCount(2);
  await expect(main.locator('[aria-current="step"]')).toHaveText('Seats');
  await main.locator('[data-dr="draft-start"]').click();
  for(let i=0;i<3;i++){
    await main.locator('[data-dr="pack-start"]').click();
    await main.locator('[data-dr="pack-done"]').click();
  }
  await main.locator('[data-dr="build-start"]').click();
  await expect(page.locator('#drClock')).toHaveText('30:00');
  await main.locator('[data-dr="build-go"]').click();
  await main.locator('[data-dr="build-pause"]').click();
  await main.locator('[data-dr="build-plus"]').click();
  expect(await page.evaluate(()=>state.draft.build.total)).toBe(35*60000);
  await main.locator('[data-dr="round1"]').click();
  await expect(main.locator('.dr-match')).toHaveCount(1);
  await main.locator('[data-dr="rt-go"]').click();
  await main.locator('[data-dr="rt-pause"]').click();
  await main.locator('[data-dr="result"]').click();
  await page.locator('#tileMenuPop button').first().click();
  await main.locator('[data-dr="final"]').click();
  await expect(main.locator('h1')).toHaveText('See the results.');
  await expect(main.locator('.dr-champ')).toHaveText(/Alice|Bob/);
  await expect(main.locator('.dr-stand tr')).toHaveCount(3);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem(DRAFT_KEY)).phase)).toBe('final');
  expect(errors).toEqual([]);
});

test('Draft reset lives in the title bar and Players navigation replaces the Seats back button', async ({page},info)=>{
  await page.evaluate(()=>{
    state.guild='dimir'; applyTheme(); state.draft=draftNew(); switchPage('draft');
  });
  const main=page.locator('.draft-main');
  const stages=main.getByRole('navigation',{name:'Draft progress'});
  await expect(stages.getByRole('button')).toHaveCount(6);
  await expect(stages.getByRole('button',{name:'Seats',exact:true})).toBeDisabled();
  for(const name of ['Alice','Bob']){
    await page.locator('#drName').fill(name); await page.locator('#drName').press('Enter');
  }
  await main.locator('[data-dr="pack15"]').click();
  await main.locator('[data-dr="seat"]').click();
  await expect(stages.getByRole('button',{name:'Seats',exact:true})).toHaveAttribute('aria-current','step');
  await expect(main.locator('[data-dr="back-setup"], [data-dr="new"], .dr-new')).toHaveCount(0);
  const reset=page.locator('.app-header').getByRole('button',{name:'Reset draft',exact:true});
  await expect(reset).toBeVisible();
  await expect(reset.locator('svg')).toHaveCount(1);
  expect(await reset.textContent()).toBe('');
  await expect(reset).toHaveCSS('border-top-width','0px');
  const bounds=await reset.boundingBox(), title=await page.locator('#brandTitle').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(title.x+title.width);
  await main.locator('.page-content').evaluate(el=>el.scrollTop=200);
  expect(await reset.boundingBox()).toEqual(bounds);
  const seats=await page.evaluate(()=>state.draft.seats);
  await stages.getByRole('button',{name:'Players',exact:true}).click();
  await expect(page.locator('#drName')).toBeVisible();
  await expect(stages.getByRole('button',{name:'Players',exact:true})).toHaveAttribute('aria-current','step');
  expect(await page.evaluate(()=>state.draft.players.map(p=>p.name))).toEqual(['Alice','Bob']);
  await stages.getByRole('button',{name:'Seats',exact:true}).click();
  expect(await page.evaluate(()=>state.draft.seats)).toEqual(seats);
  await stages.getByRole('button',{name:'Players',exact:true}).click();
  await page.locator('#drName').fill('Cara'); await page.locator('#drName').press('Enter');
  await stages.getByRole('button',{name:'Seats',exact:true}).click();
  await expect(main.locator('.dr-seat')).toHaveCount(3);
  expect(await page.evaluate(()=>state.draft.seats.every(id=>state.draft.players.some(p=>p.id===id)))).toBe(true);
  await reset.click();
  await expect(page.locator('#inAppConfirm')).toContainText('Start a new draft?');
  await page.locator('#iacCancel').click();
  await expect(main.locator('.dr-seat')).toHaveCount(3);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/draft-header-reset-${info.project.name}.png`});
  await reset.click(); await page.locator('#iacOk').click();
  await expect(page.locator('#drName')).toBeVisible();
  await expect(reset).toHaveCount(0);
  expect(await page.evaluate(()=>({phase:state.draft.phase,players:state.draft.players.map(p=>p.name),
    seats:state.draft.seats,rounds:state.draft.rs,packSize:state.draft.packSize})))
    .toEqual({phase:'setup',players:['Alice','Bob','Cara'],seats:[],rounds:[],packSize:15});
});

test('Dimir Draft keeps button labels, timers and match results readable', async ({page},info)=>{
  await page.evaluate(()=>{
    state.guild='dimir'; applyTheme(); state.draft=draftNew(); switchPage('draft');
  });
  const main=page.locator('.draft-main');
  const checkContrast=async(selector)=>{
    const samples=await main.locator(selector).evaluateAll(elements=>elements.map(el=>{
      const canvas=document.createElement('canvas'); canvas.width=1; canvas.height=1;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.fillStyle='#000'; ctx.fillRect(0,0,1,1);
      const parents=[];
      for(let node=el;node;node=node.parentElement) parents.unshift(node);
      for(const node of parents){
        const style=getComputedStyle(node);
        ctx.fillStyle=style.backgroundColor; ctx.fillRect(0,0,1,1);
        // Account for the legacy flat gradient used to fill accent buttons.
        const flat=style.backgroundImage.match(/^linear-gradient\((rgba?\([^)]+\))/);
        if(flat){ctx.fillStyle=flat[1];ctx.fillRect(0,0,1,1);}
      }
      const background=[...ctx.getImageData(0,0,1,1).data].slice(0,3);
      ctx.clearRect(0,0,1,1); ctx.fillStyle=getComputedStyle(el).color; ctx.fillRect(0,0,1,1);
      const foreground=[...ctx.getImageData(0,0,1,1).data].slice(0,3);
      const luminance=rgb=>rgb.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4)
        .reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
      const a=luminance(background), b=luminance(foreground);
      return {text:el.textContent.trim(),foreground,background,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    }));
    expect(samples.length).toBeGreaterThan(0);
    for(const sample of samples) expect(sample.ratio,JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
  };
  await checkContrast('[data-dr="add"], .dr-seg button, .dr-step button');
  for(const name of ['Alice','Bob']){
    await page.locator('#drName').fill(name); await page.locator('#drName').press('Enter');
  }
  await checkContrast('.dr-foot .hub-card strong, .dr-chip button');
  await main.locator('.page-content').evaluate(el=>el.scrollTop=0);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/draft-dimir-${info.project.name}.png`});
  await main.locator('[data-dr="seat"]').click();
  await checkContrast('[data-dr="reshuffle"], .dr-seat b, .dr-ring-mid .dr-arrow');
  await main.locator('[data-dr="draft-start"]').click();
  await main.locator('[data-dr="pack-start"]').click();
  await checkContrast('#drClock, .dr-dir, .dr-foot .hub-card strong');
  await page.evaluate(()=>{
    const d=state.draft;
    d.phase='rounds'; d.rs=[{n:1,matches:[{a:d.players[0].id,b:d.players[1].id,res:{aw:2,bw:0,d:0}}],
      t:{total:3000000,endsAt:null,pausedLeft:null,over:false}}];
    render();
  });
  await checkContrast('.dr-p.win, #drClock, [data-dr="rt-go"], [data-dr="rt-plus"]');
});

test('Trade pins a bordered confirmation bar below its title and keeps its dialogs working', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await expect.poll(()=>page.evaluate(()=>state.homeLoaded)).toBe(true);
  await page.evaluate(()=>{
    const card={name:'A long card name for the outgoing trade fixture',eur:5,qty:1,pt:Date.now(),img:'/icon-192.png',set:'tst',cn:'1',cond:'NM'};
    state.collection.items=[{...card}];
    state.trade={b:[{...card}],a:[{...card,name:'Incoming fixture',eur:7,cn:'2'}]};
    switchPage('trade');
  });
  const main=page.locator('.trade-page');
  await expect(main).toHaveClass(/hub-page/);
  await expect(main.locator('h1, .trade-summary')).toHaveCount(0);
  await expect(main.locator('.trade-side')).toHaveCount(2);
  await expect(main.locator('.trade-side .tool-heading-copy h2')).toHaveText(['You','Me']);
  await expect(main.locator('.trade-total')).toHaveText(['€5.00','€7.00']);
  await expect(main.locator('.trade-verdict')).toHaveText('You add €2.00');
  const toolbar=main.locator('.trade-toolbar');
  const shell=main.locator(':scope > .trade-toolbar-shell.page-controls');
  const viewport=main.locator('.page-content');
  await expect(toolbar.getByRole('button',{name:'Confirm trade',exact:true})).toBeVisible();
  await expect(toolbar.locator('#tradeConfirm svg')).toHaveCount(1);
  await expect(viewport.locator('#tradeConfirm, .trade-verdict')).toHaveCount(0);
  await expect(page.locator('.app-header #tradeConfirm')).toHaveCount(0);
  await expect(toolbar.locator('#tradeClear')).toBeVisible();
  await expect(page.locator('.app-header #tradeClear')).toHaveCount(0);
  await expect(page.locator('.app-header #tradeHistory')).toBeVisible();
  await expect(page.locator('.app-header #tradeHistory svg')).toHaveCount(1);
  await expect(page.locator('#tradeClear')).toHaveCSS('border-top-width','0px');
  const surfaceStyle=el=>{
    const css=getComputedStyle(el);
    return {border:css.borderTop,borderRadius:css.borderRadius,background:css.backgroundColor};
  };
  expect(await toolbar.evaluate(surfaceStyle)).toEqual(await main.locator('.trade-side').first().evaluate(surfaceStyle));
  const original=page.viewportSize();
  for(const size of [original,{width:320,height:700}]){
    await page.setViewportSize(size);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await expect(main.locator('.trade-side').first()).toBeVisible();
    const bar=await toolbar.boundingBox();
    const header=await page.locator('.app-header').boundingBox();
    const side=await main.locator('.trade-side').first().boundingBox();
    const confirm=await page.locator('#tradeConfirm').boundingBox();
    const verdict=await main.locator('.trade-verdict').boundingBox();
    expect(bar.y-header.y-header.height).toBeCloseTo(16,0);
    expect(bar.x).toBeCloseTo(side.x,0);
    expect(bar.width).toBeCloseTo(side.width,0);
    expect(side.y-bar.y-bar.height).toBeCloseTo(16,0);
    expect(confirm.x+confirm.width).toBeLessThanOrEqual(verdict.x);
    expect(verdict.x+verdict.width).toBeLessThan(bar.x+bar.width);
    expect(await viewport.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect(await shell.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  }
  for(const selector of ['[data-tradeadd="a"]','[data-tradeadd="b"]']){
    await expect(main.locator(selector)).toHaveClass(/hub-card/);
    await expect(main.locator(`${selector} .hub-icon svg`)).toHaveCount(1);
  }
  await page.setViewportSize(original);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await viewport.evaluate(el=>{
    const filler=document.createElement('div');
    filler.style.cssText='height:1400px;flex-shrink:0';
    el.append(filler);
  });
  const pinned=await toolbar.boundingBox();
  const shellBounds=await shell.boundingBox();
  const contentBounds=await viewport.boundingBox();
  expect(contentBounds.y).toBeCloseTo(shellBounds.y+shellBounds.height,0);
  await page.mouse.move(contentBounds.x+contentBounds.width/2,contentBounds.y+contentBounds.height/2);
  await page.mouse.wheel(0,450);
  await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  expect(await toolbar.boundingBox()).toEqual(pinned);
  await expect(toolbar.getByRole('button',{name:'Confirm trade',exact:true})).toBeInViewport();
  await viewport.evaluate(el=>el.scrollTop=0);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/trade-menu-style-${info.project.name}.png`});
  await page.locator('#tradeClear').click();
  await expect(page.locator('#inAppConfirm')).toContainText('Clear the whole trade?');
  await expect(page.getByRole('alertdialog',{name:'Clear trade'})).toBeVisible();
  await expect(page.locator('#iacCancel')).toBeFocused();
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/trade-clear-dialog-${info.project.name}.png`});
  await page.locator('#iacCancel').click();
  await expect(main.locator('.trade-row')).toHaveCount(2);
  await page.locator('#tradeConfirm').click();
  await expect(page.locator('#inAppConfirm')).toContainText('Confirm this trade?');
  await page.locator('#iacOk').click();
  await expect.poll(()=>page.evaluate(()=>state.collection.items.map(it=>it.name))).toEqual(['Incoming fixture']);
  await expect.poll(()=>page.evaluate(()=>state.trade.a.length+state.trade.b.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('shared dialogs fit small screens, keep keyboard focus and preserve required choices', async ({page},info)=>{
  await page.evaluate(()=>{state.guild='dimir';applyTheme();});
  await page.setViewportSize({width:320,height:480});
  await page.evaluate(()=>{
    window.dialogResults=[];
    openInAppConfirm('Clear the whole trade?',value=>dialogResults.push(value),{title:'Clear trade',ok:'Clear trade',danger:true,icon:'trash'});
  });
  const dialog=page.getByRole('alertdialog',{name:'Clear trade'});
  const box=await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.y).toBeGreaterThanOrEqual(24);
  expect(box.x+box.width).toBeLessThanOrEqual(304);
  expect(box.y+box.height).toBeLessThanOrEqual(456);
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await expect(page.locator('#iacCancel')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#iacOk')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#iacCancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>dialogResults)).toEqual([false]);
  await page.evaluate(()=>openInAppConfirm('Choose whether to keep these cards.',value=>dialogResults.push(value),{ok:'Keep cards',must:true}));
  await page.keyboard.press('Escape');
  await page.locator('#inAppConfirm').click({position:{x:4,y:4}});
  await expect(page.locator('#inAppConfirm')).toBeVisible();
  await page.locator('#iacOk').click();
  expect(await page.evaluate(()=>dialogResults)).toEqual([false,true]);
  await page.evaluate(()=>openInAppPrompt('Rename folder','Folder name','Old name',value=>dialogResults.push(value)));
  const input=page.getByRole('textbox',{name:'Rename folder'});
  await expect(input).toBeFocused();
  await input.fill('New name');
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/prompt-dimir-${info.project.name}.png`});
  await input.press('Enter');
  await expect(page.locator('#inAppPrompt')).toHaveCount(0);
  expect(await page.evaluate(()=>dialogResults)).toEqual([false,true,'New name']);
  await page.evaluate(()=>openInAppPrompt('Rename folder','Folder name','Old name',value=>dialogResults.push(value)));
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>dialogResults)).toEqual([false,true,'New name',null]);
});

test('Collection value follows name and advanced filters, quantities and binder scope', async ({page})=>{
  await expect.poll(()=>page.evaluate(()=>state.homeLoaded)).toBe(true);
  await page.evaluate(()=>{
    const common={colors:[],cond:'NM',img:'/icon-192.png',legal_cmd:'legal'};
    state.collection.binders=[{id:'value-fixture',name:'Test binder'}];
    state.collection.items=[
      {...common,name:'Sol Ring',type_line:'Artifact',set:'cmm',rarity:'common',qty:2,eur:5,binder:'value-fixture'},
      {...common,name:'Mind Stone',type_line:'Artifact',set:'cmm',rarity:'uncommon',qty:3,eur:2},
      {...common,name:'Forest',type_line:'Basic Land — Forest',set:'m21',rarity:'common',qty:4,eur:1}
    ];
    switchPage('collection');
  });
  const value=()=>page.evaluate(()=>fmtEur(collectionTotalValue(collectionValueItems()))), query=page.locator('#colSearchQ');
  await expect.poll(value).toBe('€20.00');
  await query.fill('Sol');
  await expect.poll(value).toBe('€10.00');
  await query.fill('No matching card');
  await expect.poll(value).toBe('€0.00');
  await query.fill('');
  await expect.poll(value).toBe('€20.00');
  await page.locator('#colChev').click();
  await page.locator('#colTypeText').fill('Artifact');
  await page.locator('#advGo').click();
  await expect.poll(value).toBe('€16.00');
  expect(await page.evaluate(()=>priceHistOf('__col:all').at(-1)?.[1])).toBe(20);
  await page.locator('#colChev').click();
  await page.locator('#advancedSearchReset').click();
  await page.locator('#advGo').click();
  await expect.poll(value).toBe('€20.00');
  await page.locator('[data-binderopen="value-fixture"]').click();
  await expect.poll(value).toBe('€10.00');
  await query.fill('Forest');
  await expect.poll(value).toBe('€0.00');
});

test('only supported formats appear in rules, search, collection and life setup', async ({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const removedRequests=[];
  page.on('request',request=>{if(new URL(request.url()).pathname==='/format.txt') removedRequests.push(request.url());});
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.locator('#fmtRulesRow').click();
  await expect(page.locator('[data-fmtrule="commander"]')).toBeVisible();
  await expect(page.locator('[data-fmtrule="admiral"], [data-banfmt="admiral"]')).toHaveCount(0);
  await page.locator('.app-navigation').getByRole('button',{name:'Search',exact:true}).click();
  await page.locator('#qChev').click();
  await page.locator('[data-cs="fmtSel"]').click();
  await expect(page.getByRole('dialog',{name:'Advanced search'}).getByText('Admiral',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'Advanced search'}).getByText('Commander',{exact:true})).toBeVisible();
  await page.getByRole('dialog',{name:'Advanced search'}).getByText('Commander',{exact:true}).click();
  await page.locator('#advancedSearchClose').click();
  await expect(page.locator('#advancedSearchScreen')).toHaveCount(0);
  await page.locator('.app-navigation').getByRole('button',{name:'Collection',exact:true}).click();
  await page.locator('#colChev').click();
  await page.locator('[data-cs="colLegal"]').click();
  await expect(page.locator('#colAdvBox').getByText('Admiral',{exact:true})).toHaveCount(0);
  await expect(page.locator('#colAdvBox').getByText('Commander',{exact:true})).toBeVisible();
  await page.locator('#colAdvBox').getByText('Commander',{exact:true}).click();
  await page.locator('#advancedSearchClose').click();
  await expect(page.locator('#advancedSearchScreen')).toHaveCount(0);
  await page.locator('.app-navigation').getByRole('button',{name:'Life',exact:true}).click();
  await page.getByRole('button',{name:'New game'}).click();
  await expect(page.locator('[data-lifefmt="admiral"]')).toHaveCount(0);
  await expect(page.locator('[data-lifefmt]')).toHaveCount(4);
  expect(removedRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('legacy format decks retain their commander and become playable Commander decks', async ({page})=>{
  await page.evaluate(()=>{
    const leader={id:'legacy-leader',name:'Fixture Commander',type_line:'Legendary Creature — Elf',power:'2',toughness:'2',color_identity:['G'],oracle_text:'',legalities:{commander:'legal'}};
    const land={id:'fixture-forest',name:'Forest',type_line:'Basic Land — Forest',color_identity:['G'],legalities:{commander:'legal'}};
    const rock={id:'fixture-rock',name:'Sol Ring',type_line:'Artifact',color_identity:[],legalities:{commander:'legal'}};
    localStorage.setItem(LS_PREFIX+'folders',JSON.stringify([{id:'legacy-folder',name:'Saved decks',format:'admiral',parentId:'__fmt__:admiral'}]));
    localStorage.setItem(LS_PREFIX+'deck:legacy-format',JSON.stringify({id:'legacy-format',name:'Preserved deck',format:'admiral',folderId:'legacy-folder',admiral:leader,cards:[land,rock],maybeboard:[],tags:{},primer:''}));
    localStorage.setItem(LS_PREFIX+'lifeFmt','admiral');
  });
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>state.homeLoaded)).toBe(true);
  const result=await page.evaluate(()=>{
    const d=getDeck('legacy-format');
    return {format:deckFormat(d),leader:d.admiral.name,cards:d.cards.map(c=>c.name),total:deckTotal(d),
      errors:checkDeckLegality(d).filter(x=>x.level==='error'),folder:state.folders[0],
      life:lifeSpec().life,damage:lethalDmg(),exports:EXPORT_FORMATS.map(x=>x.key),
      leaderTypes:{planeswalker:leaderFitsFormat({type_line:'Legendary Planeswalker',oracle_text:'This card can be your commander.'},'commander'),
        vehicle:leaderFitsFormat({type_line:'Legendary Artifact — Vehicle',power:'5',toughness:'5'},'commander')},
      plain:buildExport(d,'plain'),moxfield:buildExport(d,'moxfield')};
  });
  expect(result).toMatchObject({format:'commander',leader:'Fixture Commander',cards:['Forest','Sol Ring'],total:100,
    errors:[],folder:{format:'commander',parentId:'__fmt__:commander'},life:40,damage:21,exports:['moxfield','cockatrice','plain'],
    leaderTypes:{planeswalker:true,vehicle:false}});
  expect(result.plain).toContain('Forest');
  expect(result.moxfield).toContain('1 Fixture Commander *CMDR*');
  await page.evaluate(()=>openDeck('legacy-format'));
  await expect(page.locator('#brandTitle')).toBeVisible();
  expect(await page.evaluate(()=>backupPayload().decks.find(d=>d.id==='legacy-format').admiral.name)).toBe('Fixture Commander');
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
    const noticeBottom = await page.locator(input).evaluate(el => {
      const rect = el.closest('main')?.querySelector('.account-warning-slot')?.getBoundingClientRect();
      return rect?.height ? rect.bottom : 0;
    });
    expect(field.y).toBeLessThan(Math.max(header.y + header.height, noticeBottom) + 50);
    if(name === 'Search'){
      const bar = await page.locator(input).evaluate(el=> (el.closest('.searchbar') || el.parentElement).getBoundingClientRect().top);
      expect(bar - header.y - header.height).toBeCloseTo(12,0);
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

test('Inspiration period filters live in advanced filters and the cards sit close to search', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{
    for(const win of ['week','month','year']){
      _inspFeed.data[`commander|${win}`]={win,cards:Array.from({length:8},(_,i)=>({
        id:`${win}-${i}`,name:`${win} commander ${i+1}`,type_line:'Legendary Creature — Elf',
        legalities:{commander:'legal'},image_uris:{normal:'/icon-192.png'}
      }))};
    }
  });
  await page.locator('.app > .app-navigation').getByRole('button',{name:'Inspiration',exact:true}).click();
  await expect(page.locator('#inspFeed .if-tile')).toHaveCount(8);
  await expect(page.locator('#inspFeed [data-ifwin], #inspFeed .if-winrow')).toHaveCount(0);
  const checkSpacing=async()=>{
    const bar=await page.locator('.inspiration-page .page-searchbar').boundingBox();
    const title=await page.locator('#inspFeed .section-label').boundingBox();
    const cards=await page.locator('#inspFeed .if-tile').first().boundingBox();
    expect(title.y-bar.y-bar.height).toBeCloseTo(16,0);
    expect(cards.y-title.y-title.height).toBeCloseTo(8,0);
    expect(cards.y-bar.y-bar.height).toBeLessThan(50);
  };
  await checkSpacing();
  for(const [win,label] of [['month','Month'],['year','Year']]){
    await page.locator('#bsChev').click();
    const dialog=page.getByRole('dialog',{name:'Inspiration filters'});
    const periods=dialog.getByRole('group',{name:'Time period'});
    await expect(periods.getByRole('button')).toHaveText(['Week','Month','Year']);
    await periods.getByRole('button',{name:label,exact:true}).click();
    await expect(dialog).toBeVisible();
    await expect(periods.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
    await page.locator('#advGo').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#inspFeed .if-tile').first()).toHaveAttribute('title',`${win} commander 1`);
    await expect(page.locator('[data-iflab]')).toContainText(`This ${win}`);
    await checkSpacing();
  }
  await page.locator('#bsChev').click();
  await expect(page.locator('[data-ifwin="year"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#advancedSearchReset').click();
  await expect(page.locator('[data-ifwin="week"]')).toHaveAttribute('aria-pressed','true');
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/inspiration-period-filters-${info.project.name}.png`});
  await page.locator('#advancedSearchClose').click();
  await expect(page.locator('#inspFeed .if-tile').first()).toHaveAttribute('title','week commander 1');
  await checkSpacing();
  await page.screenshot({path:`var/previews/inspiration-compact-${info.project.name}.png`});
  expect(errors).toEqual([]);
});

test('Inspiration filters slide in beside a stable search bar and retain selections', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.locator('.app > .app-navigation').getByRole('button',{name:'Inspiration',exact:true}).click();
  const input=page.locator('#bsName');
  const toggle=page.getByRole('button',{name:'Advanced inspiration filters'});
  await expect(page.locator('.app > main > .browse-selects')).toHaveCount(0);
  const field=await input.boundingBox();
  const button=await toggle.boundingBox();
  expect(button.x).toBeGreaterThanOrEqual(field.x+field.width);
  expect(button.y).toBe(field.y);
  expect(button.width).toBe(44);
  await expect(toggle.locator('svg path')).toHaveAttribute('d','M4 4h16l-6 7v7l-4 2v-9z');
  await input.fill('Elf');
  await toggle.click();
  const dialog=page.getByRole('dialog',{name:'Inspiration filters'});
  await expect(dialog).toBeVisible();
  await expect.poll(async()=>Math.round((await dialog.boundingBox()).x)).toBe(0);
  expect(await dialog.boundingBox()).toEqual({x:0,y:0,...page.viewportSize()});
  await expect(page.locator('.app > .app-navigation')).toHaveAttribute('inert','');
  for(const id of ['bsFmt','bsCount','bsTheme','bsTribe']){
    const trigger=dialog.locator(`[data-cs="${id}"]`);
    await trigger.click();
    await expect(dialog.locator('.cselect-panel')).toBeVisible();
    const bounds=await input.boundingBox();
    expect(bounds.x).toBe(field.x);
    expect(bounds.width).toBe(field.width);
    await expect(dialog.locator('.bs-row')).toHaveCount(4);
    await trigger.click();
    await expect(dialog.locator('.cselect-panel')).toHaveCount(0);
  }
  await dialog.locator('[data-cs="bsCount"]').click();
  await dialog.locator('[data-csopt="bsCount"][data-val="2"]').click();
  await expect(dialog.locator('[data-csopt="bsCombo"][data-val="gu"]')).toBeVisible();
  await dialog.locator('[data-csopt="bsCombo"][data-val="gu"]').click();
  expect(await page.evaluate(()=>state.browseSel.combo)).toBe('gu');
  await dialog.locator('[data-cs="bsTheme"]').click();
  await dialog.locator('.cselect-search input').fill('not a theme');
  await expect(dialog.locator('.cs-noresults')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog.locator('.cselect-panel')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(input).toHaveValue('Elf');
  expect((await input.boundingBox()).width).toBe(field.width);
  await toggle.click();
  await expect(dialog.locator('[data-cs="bsCombo"]')).toBeVisible();
  await page.locator('#advGo').click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>state.browseSel.combo)).toBe('gu');
  expect(await page.evaluate(()=>state.searchRan)).toBe(false);
  await toggle.click();
  await page.locator('#advancedSearchReset').click();
  await expect(dialog.locator('[data-cs="bsCombo"]')).toHaveCount(0);
  expect(await page.evaluate(()=>state.browseSel.combo)).toBe('');
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/inspiration-filters-${info.project.name}.png`});
  await page.locator('#advancedSearchClose').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.app > .app-navigation')).not.toHaveAttribute('inert','');
  expect((await input.boundingBox()).width).toBe(field.width);
  expect(errors).toEqual([]);
});

test('Inspiration filter panel switches between Commander and constructed options', async ({page})=>{
  await page.route('**/meta.json*',route=>route.fulfill({json:{from:'2026-10-01',to:'2026-10-07',formats:{standard:{decks:12,archetypes:[
    {key:'Shock',name:'Red Aggro',style:'aggro',share:60,main:[],side:[]},
    {key:'Counterspell',name:'Blue Control',style:'control',share:40,main:[],side:[]}
  ]}}}}));
  await page.locator('.app > .app-navigation').getByRole('button',{name:'Inspiration',exact:true}).click();
  await page.locator('#bsChev').click();
  const dialog=page.getByRole('dialog',{name:'Inspiration filters'});
  await dialog.locator('[data-cs="bsFmt"]').click();
  await dialog.locator('[data-csopt="bsFmt"][data-val="standard"]').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-cs="bsStyle"]')).toBeVisible();
  await expect(dialog.locator('[data-cs="bsCount"]')).toHaveCount(0);
  await dialog.locator('[data-cs="bsStyle"]').click();
  await dialog.locator('[data-csopt="bsStyle"][data-val="control"]').click();
  await page.locator('#advGo').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#browseResults .meta-tile')).toHaveCount(1);
  await expect(page.locator('#browseResults')).toContainText('Blue Control');
  await page.locator('#bsChev').click();
  await expect(dialog.locator('[data-cs="bsStyle"]')).toContainText('Control');
  await page.locator('#advancedSearchReset').click();
  await expect(dialog.locator('[data-cs="bsCount"]')).toBeVisible();
  await expect(dialog.locator('[data-cs="bsStyle"]')).toHaveCount(0);
  await page.locator('#advancedSearchClose').click();
  await expect(dialog).toHaveCount(0);
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

test('Search uses Collection-style spacing with an integrated bar that stays visible while scrolling', async ({page},info)=>{
  // Compare the search fields themselves; the guest-only backup warning is
  // separate Collection content and has its own layout coverage.
  await page.addStyleTag({content:'.account-warning-slot { display:none !important; }'});
  await page.locator('.app-navigation').getByRole('button',{name:'Collection',exact:true}).click();
  const collection=await page.locator('#colSearchQ').evaluate(el=>{
    const bar=el.closest('.searchbar'), viewport=el.closest('.tab-viewport');
    const rect=bar.getBoundingClientRect(), bounds=viewport.getBoundingClientRect(), style=getComputedStyle(bar);
    return {inset:rect.left-bounds.left,top:rect.top-bounds.top,height:rect.height,
      padding:style.padding,border:style.borderBottomWidth,shadow:style.boxShadow};
  });
  await page.locator('.app-navigation').getByRole('button',{name:'Search',exact:true}).click();
  await page.evaluate(()=>{
    state.searchResults=Array.from({length:60},(_,i)=>({id:`sticky-${i}`,name:`Sticky fixture ${i}`,
      type_line:'Artifact',layout:'normal',colors:[],color_identity:[],rarity:'common',set:'tst',collector_number:String(i+1),
      prices:{},legalities:{commander:'legal'},image_uris:{normal:'/icon-192.png',small:'/icon-192.png'}}));
    state.searchRan=true; render();
  });
  await expect(page.locator('.search-page > .searchbar')).toHaveCount(0);
  const bar=page.locator('.search-content > .page-searchbar');
  const viewport=page.locator('.search-content.tab-viewport');
  await expect(bar).toBeVisible();
  const geometry=await bar.evaluate(el=>{
    const viewport=el.closest('.tab-viewport'), rect=el.getBoundingClientRect(), bounds=viewport.getBoundingClientRect(), style=getComputedStyle(el);
    return {inset:rect.left-bounds.left,top:rect.top-bounds.top,height:rect.height,
      padding:style.padding,border:style.borderBottomWidth,shadow:style.boxShadow,
      fillsWidth:Math.abs(rect.width-(viewport.clientWidth-16))<2};
  });
  expect(await bar.evaluate(el=>{
    const rect=el.getBoundingClientRect(),bounds=el.closest('.tab-viewport').getBoundingClientRect();
    return Math.abs((rect.left-bounds.left)-(bounds.right-rect.right));
  })).toBeLessThan(1);
  expect(geometry).toMatchObject(collection);
  expect(geometry.fillsWidth).toBe(true);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const header=await page.locator('.app-header').boundingBox(), nav=await page.locator('.app > .app-navigation').boundingBox();
  for(const position of [300,1200,100000]){
    await viewport.evaluate((el,position)=>el.scrollTop=position,position);
    const rect=await bar.boundingBox();
    expect(rect.y).toBeCloseTo(header.y+header.height+collection.top,0);
    expect(rect.x).toBe((await viewport.boundingBox()).x+collection.inset);
    expect(await page.locator('#searchName').evaluate(el=>{
      const r=el.getBoundingClientRect();
      return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===el;
    })).toBe(true);
    expect(await bar.evaluate(el=>{
      const r=el.getBoundingClientRect();
      // The top margin can be clipped out of the scrolling viewport rather
      // than belonging to the field itself. Neither may expose card content.
      const hit=document.elementFromPoint(r.left+r.width/2,r.top-6);
      return !hit?.closest('.tab-viewport') || hit.closest('.page-searchbar')===el;
    })).toBe(true);
    expect(await bar.evaluate(el=>{
      const r=el.getBoundingClientRect();
      return document.elementFromPoint(r.left+r.width/2,r.bottom+8)?.closest('.page-searchbar')===el;
    })).toBe(true);
    expect(await bar.evaluate(el=>{
      const r=el.getBoundingClientRect();
      return [r.left-4,r.right+4].every(x=>[r.top+8,r.bottom+8].every(y=>
        document.elementFromPoint(x,y)?.closest('.sticky-searchbar')===el));
    })).toBe(true);
    expect(await page.locator('.app-header').boundingBox()).toEqual(header);
    expect(await page.locator('.app > .app-navigation').boundingBox()).toEqual(nav);
  }
  await page.locator('#srSortBtn').click();
  await expect(page.locator('#tileMenuPop')).toBeVisible();
  await page.evaluate(()=>document.getElementById('tileMenuPop').remove());
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/search-integrated-sticky-${info.project.name}.png`});
});

test('Card Details keeps its title, metrics, subtitle and menu visible above scrolling content', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{
    state.guild='dimir'; applyTheme();
    window.detailFixture={id:'details-layout-fixture',name:'A Very Long Card Name, Keeper of the Distant and Forgotten Archives',
      layout:'normal',type_line:'Legendary Creature — Wizard',colors:['U'],color_identity:['U'],
      set:'tst',collector_number:'1',prices:{eur:'1234.56'},_salt:2.70,legalities:{commander:'legal'},
      oracle_text:Array.from({length:40},()=> 'Whenever you draw a card, gain 1 life.').join('\n'),
      image_uris:{normal:'/icon-192.png',large:'/icon-192.png',small:'/icon-192.png'}};
    openCardInfo(window.detailFixture);
  });
  const sheet=page.locator('#cardSheetOverlay'), details=sheet.locator('main.card-detail');
  const header=sheet.locator('.card-details-header'), subtitle=sheet.locator('.card-details-subtitle');
  const title=header.getByRole('button',{name:'Go to home',exact:true});
  const menu=header.getByRole('button',{name:'Open menu',exact:true});
  const price=header.locator('#csPrice'), salt=header.locator('#csSaltRow');
  await expect(title).toHaveText('Card Details');
  await expect(subtitle.locator('h1')).toHaveText('A Very Long Card Name, Keeper of the Distant and Forgotten Archives');
  await expect(price).toContainText('€1234.56');
  await expect(salt).toContainText('2.70');
  await expect(salt).toBeEnabled();
  const original=page.viewportSize();
  for(const size of [original,{width:320,height:480}]){
    await page.setViewportSize(size);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const h=await header.boundingBox(), s=await subtitle.boundingBox(), b=await details.boundingBox();
    const n=await sheet.locator('.app-navigation').boundingBox();
    const t=await title.boundingBox(), m=await menu.boundingBox();
    expect(h.y).toBe(0);
    expect(s.y).toBeCloseTo(h.y+h.height,0);
    expect(b.y).toBeCloseTo(s.y+s.height,0);
    expect(b.y+b.height).toBeCloseTo(n.y,0);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x).toBeLessThanOrEqual(20);
    expect(m.x+m.width).toBeLessThanOrEqual(t.x);
    for(const metric of [price,salt]){
      const bounds=await metric.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(t.x+t.width);
      const padding=await header.evaluate(el=>parseFloat(getComputedStyle(el).paddingRight));
      expect(bounds.x+bounds.width).toBeLessThanOrEqual(h.x+h.width-padding);
      await expect(metric).toBeInViewport();
    }
    expect(await subtitle.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect(await details.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await details.dispatchEvent('wheel');
    await details.evaluate(el=>el.scrollTop=el.scrollHeight);
    expect(await details.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    expect(await header.boundingBox()).toEqual(h);
    expect(await subtitle.boundingBox()).toEqual(s);
    expect(await sheet.locator('.app-navigation').boundingBox()).toEqual(n);
    await details.evaluate(el=>el.scrollTop=0);
  }
  await page.setViewportSize(original);
  await price.click();
  await expect(page.locator('#phOverlay')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#phOverlay')).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/card-details-redesign-${info.project.name}.png`});
  await menu.locator('img').click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.menu-page')).toBeVisible();
  await expect(page.locator('#brandTitle')).toHaveText('MENU');
  expect(errors).toEqual([]);
});

test('Deck card details share the header and retain editing, updated metrics and tab navigation', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // Establish a user navigation before opening a fixture with history-backed actions.
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.evaluate(()=>{
    state.guild='dimir'; applyTheme();
    const card={id:'details-deck-fixture',name:'Archive Adept',layout:'normal',type_line:'Creature — Wizard',
      colors:['U'],color_identity:['U'],set:'tst',collector_number:'1',prices:{eur:'1.50'},_salt:0,
      legalities:{modern:'legal',commander:'legal'},oracle_text:'Draw a card.',
      image_uris:{normal:'/icon-192.png',large:'/icon-192.png',small:'/icon-192.png'}};
    const deck={id:'details-deck',name:'Details fixture',format:'modern',cards:[card],maybeboard:[]};
    state.decksIndex.push(deck);
    window.detailDeck=deck;
    openCardActionSheet(deck,card,'main',0);
  });
  const sheet=page.locator('#cardSheetOverlay');
  await expect(sheet.locator('.card-details-header .brand-txt')).toHaveText('Card Details');
  await expect(sheet.locator('.card-details-subtitle')).toHaveText('Archive Adept');
  await expect(sheet.locator('#csSaltRow')).toContainText('0.00');
  await expect(sheet.locator('#csSaltRow')).toBeEnabled();
  await sheet.locator('#csAddOne').click();
  await expect.poll(()=>page.evaluate(()=>window.detailDeck.cards.length)).toBe(2);
  await expect(page.locator('#csAddSheet')).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-deck-count]')).toHaveText('2');
  await expect(sheet.locator('.card-details-subtitle')).toHaveText('Archive Adept');
  await expect(sheet.locator('#csPrice')).toContainText('€1.50');
  const section=sheet.locator('.detail-sec:has(#sheetOracle)');
  const label=await section.locator('.detail-h').boundingBox(), content=await section.locator('#sheetOracle').boundingBox();
  expect(label.y+label.height).toBeLessThanOrEqual(content.y);
  await expect(section).toHaveCSS('border-radius','18px');
  await expect(sheet.locator('#csChangePrinting')).toBeEnabled();
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/card-details-deck-${info.project.name}.png`});
  await sheet.locator('.app-navigation').getByRole('button',{name:'Collection',exact:true}).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('#brandTitle')).toHaveText('COLLECTION');
  await page.evaluate(()=>openCardInfo({...window.detailDeck.cards[0],name:'Updated Printing',prices:{eur:'3.00'},_salt:null}));
  await expect(sheet.locator('.card-details-subtitle')).toHaveText('Updated Printing');
  await expect(sheet.locator('#csSaltRow')).toContainText('—');
  await expect(sheet.locator('#csSaltRow')).toBeDisabled();
  await sheet.getByRole('button',{name:'Go to home',exact:true}).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('#brandTitle')).toHaveText('DECKHAND');
  if(info.project.name==='desktop'){
    for(const action of ['close','menu']){
      await page.evaluate(()=>{
        state._csPopAt={x:150,y:150,t:Date.now()};
        openCardInfo(window.detailDeck.cards[0]);
      });
      await expect(sheet).toHaveClass(/cs-pop/);
      const close=sheet.locator('.cs-pop-x'), menu=sheet.getByRole('button',{name:'Open menu',exact:true});
      await expect(close).toBeVisible();
      const x=await close.boundingBox(), metrics=await sheet.locator('.card-details-metrics').boundingBox();
      const logo=await menu.boundingBox(), title=await sheet.locator('.brand-txt').boundingBox();
      expect(logo.x+logo.width).toBeLessThanOrEqual(title.x);
      expect(metrics.x+metrics.width).toBeLessThanOrEqual(x.x);
      await expect(sheet.locator('.card-details-subtitle')).toBeVisible();
      await (action==='close'?close:menu).click();
      await expect(sheet).toHaveCount(0);
      if(action==='menu') await expect(page.locator('#brandTitle')).toHaveText('MENU');
    }
  }
  expect(errors).toEqual([]);
});

test('Similar Cards starts at the top, reads downward and keeps its place after opening a result', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const base={layout:'normal',type_line:'Creature — Wizard',oracle_text:'',colors:['U'],color_identity:['U'],
    set:'tst',collector_number:'1',rarity:'common',prices:{eur:'1.00'},_salt:0,legalities:{commander:'legal'},
    image_uris:{normal:'/icon-192.png',large:'/icon-192.png',small:'/icon-192.png'}};
  const source={...base,id:'similar-source',name:'Similar source'};
  const pool=Array.from({length:18},(_,i)=>({...base,id:`similar-result-${i}`,name:`Similar result ${i+1}`}));
  let releaseResults;
  const ready=new Promise(resolve=>releaseResults=resolve);
  await page.route('**/edhrec/**',route=>route.fulfill({json:{container:{json_dict:{}}}}));
  await page.route('**/api/scryfall/cards/search*',async route=>{
    await ready;
    await route.fulfill({json:{object:'list',data:pool,has_more:false,total_cards:pool.length}});
  });
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.evaluate(source=>{
    state._otagCache={[source.name]:[]};
    _bulkIdx={cards:[],byName:new Map(),tagByOid:new Map(),rulByOid:new Map()};
    _mwFreq={total:0,freq:new Map()};
    openCardInfo(source);
  },source);
  await page.locator('#ciSimilar').click();
  const similar=page.locator('#similarOverlay'), main=similar.locator('main');
  await expect(main).toHaveCSS('flex-direction','column');
  await expect(similar.locator('#simBody .spinner')).toBeVisible();
  expect(await main.evaluate(el=>el.scrollTop)).toBe(0);
  releaseResults();
  const tiles=similar.locator('#simBody .sr-tile');
  await expect(tiles).toHaveCount(pool.length);
  expect(await tiles.evaluateAll(nodes=>nodes.map(n=>decodeURIComponent(n.dataset.name)))).toEqual(pool.map(c=>c.name));
  expect(await main.evaluate(el=>el.scrollTop)).toBe(0);
  const hero=await similar.locator('.reco-admiral').boundingBox();
  const hint=await main.locator(':scope > .hint').boundingBox(), results=await similar.locator('#simBody').boundingBox();
  expect(hero.y).toBeGreaterThanOrEqual((await main.boundingBox()).y);
  expect(hero.y+hero.height).toBeLessThanOrEqual(hint.y);
  expect(hint.y+hint.height).toBeLessThanOrEqual(results.y);
  const positions=await tiles.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().y));
  for(let i=1;i<positions.length;i++) expect(positions[i]).toBeGreaterThanOrEqual(positions[i-1]);
  expect(positions.at(-1)).toBeGreaterThan(positions[0]);
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/similar-cards-top-${info.project.name}.png`});
  const header=await similar.locator('.app-overlay-header').boundingBox(), nav=await similar.locator('.app-navigation').boundingBox();
  const bounds=await main.boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.wheel(0,500);
  await expect.poll(()=>main.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  expect(await similar.locator('.app-overlay-header').boundingBox()).toEqual(header);
  expect(await similar.locator('.app-navigation').boundingBox()).toEqual(nav);
  await tiles.last().scrollIntoViewIfNeeded();
  const keep=await main.evaluate(el=>el.scrollTop);
  await tiles.last().dispatchEvent('click');
  await expect(page.locator('#ciImg')).toHaveAttribute('alt',pool.at(-1).name);
  await page.goBack();
  await expect(similar).toBeVisible();
  expect(await main.evaluate(el=>el.scrollTop)).toBeCloseTo(keep,0);
  expect(errors).toEqual([]);
});

test('Inspiration shares its background fade and opens recommendations and card details from the top', async ({page},info)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{
    const base={layout:'normal',colors:['U'],color_identity:['U'],rarity:'rare',set:'tst',collector_number:'1',
      prices:{eur:'1.00'},legalities:{commander:'legal'},image_uris:{normal:'/icon-192.png',large:'/icon-192.png',small:'/icon-192.png'}};
    const leader={...base,id:'fade-leader',name:'Fade Commander',type_line:'Legendary Creature — Wizard',oracle_text:'Draw a card.'};
    const pool=Array.from({length:16},(_,i)=>({...base,id:`detail-fixture-${i}`,name:`Detail fixture ${i}`,
      type_line:'Creature — Wizard',oracle_text:'Flying\n'+Array.from({length:12},()=> 'Whenever you draw a card, gain 1 life.').join('\n')}));
    _inspFeed.data['commander|week']={win:'week',cards:[leader]};
    state._recoCache[recoCacheKey(leader,null)]={pool,themes:[],edhrecSourced:true,sections:[
      {header:'High Synergy Cards',names:pool.slice(0,8).map(c=>c.name)},
      {header:'Creatures',names:pool.slice(8).map(c=>c.name)}
    ]};
  });
  await page.locator('.app-navigation').getByRole('button',{name:'Inspiration',exact:true}).click();
  await expect(page.locator('#inspFeed .if-tile')).toHaveCount(1);
  const backgrounds=await page.locator('.inspiration-page').evaluate(el=>{
    const pageStyle=getComputedStyle(el), toolbar=getComputedStyle(el.querySelector('.sticky-searchbar'),'::before');
    return {page:pageStyle.backgroundImage,toolbar:toolbar.backgroundImage,body:getComputedStyle(document.body,'::before').backgroundImage,
      fixed:[pageStyle,toolbar].every(style=>style.backgroundAttachment.split(',').every(value=>value.trim()==='fixed'))};
  });
  expect(backgrounds.page).toBe(backgrounds.body);
  expect(backgrounds.toolbar).toBe(backgrounds.page);
  expect(backgrounds.fixed).toBe(true);
  await expect(page.locator('#inspFeed .section-label')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(page.locator('#inspFeed .section-label')).toHaveCSS('background-image','none');
  await page.locator('#inspFeed .if-tile').click();
  const reco=page.locator('#recoOverlay'), recoMain=reco.locator('main');
  await expect(reco).toBeVisible();
  await expect(reco.locator('#recoBody .section-label')).toHaveText(['High Synergy Cards','Creatures']);
  expect(await recoMain.evaluate(el=>el.scrollTop)).toBe(0);
  const hero=await reco.locator('.reco-admiral').boundingBox(), body=await reco.locator('#recoBody').boundingBox();
  expect(hero.y+hero.height).toBeLessThanOrEqual(body.y);
  const sections=await reco.locator('#recoBody .edh-sec').all();
  let last=body.y;
  for(const section of sections){
    const bounds=await section.boundingBox(), title=await section.locator('.section-label').boundingBox();
    const grid=await section.locator('.sr-grid').boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(last); last=bounds.y+bounds.height;
    expect(title.y+title.height).toBeLessThanOrEqual(grid.y);
    await expect(section.locator('.section-label')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  }
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/inspiration-recommendations-top-${info.project.name}.png`});
  // An untrusted click bypasses the desktop mouse-preview shortcut and opens the full sheet.
  await reco.locator('.sr-tile.selectable').first().dispatchEvent('click');
  const sheet=page.locator('#cardSheetOverlay'), details=sheet.locator('main.card-detail');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#ciImg')).toBeVisible();
  await expect.poll(()=>details.evaluate(el=>el.scrollTop)).toBe(0);
  const image=await page.locator('#ciImg').boundingBox(), subtitle=await sheet.locator('.card-details-subtitle').boundingBox();
  expect(image.y).toBeGreaterThanOrEqual(subtitle.y+subtitle.height);
  expect(image.y).toBeLessThan(subtitle.y+subtitle.height+50);
  const oracle=await details.locator('.detail-sec:has(#sheetOracle)').boundingBox();
  const legality=await details.locator('.detail-sec').filter({hasText:'Legality'}).boundingBox();
  const rulings=await details.locator('.detail-sec:has(#csRulings)').boundingBox();
  expect(oracle.y+oracle.height).toBeLessThanOrEqual(legality.y);
  expect(legality.y+legality.height).toBeLessThanOrEqual(rulings.y);
  if(info.project.name==='mobile'){
    const actions=await details.locator('.cs-actions-grid').boundingBox();
    expect(actions.y).toBeGreaterThanOrEqual(image.y+image.height);
    expect(actions.y+actions.height).toBeLessThanOrEqual(oracle.y);
  }
  // Late-loaded rules must not pull the reader down to the bottom of the sheet.
  await page.locator('#csRulings').evaluate(el=>el.innerHTML=Array.from({length:20},()=>'<p>Delayed ruling fixture.</p>').join(''));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await details.evaluate(el=>el.scrollTop)).toBe(0);
  await page.screenshot({path:`var/previews/card-details-top-${info.project.name}.png`});
  await details.evaluate(el=>el.scrollTop=el.scrollHeight);
  expect(await details.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(reco).toBeVisible();
  await page.goBack();
  await expect(reco).toHaveCount(0);
  await expect(page.locator('.inspiration-page')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Inspiration integrates and pins its search bar with space above scrolling cards', async ({page},info)=>{
  await page.setViewportSize({width:page.viewportSize().width,height:420});
  await page.evaluate(()=>{
    _inspFeed.data['commander|week']={win:'week',cards:Array.from({length:8},(_,i)=>({
      id:`sticky-inspiration-${i}`,name:`Sticky commander ${i}`,type_line:'Legendary Creature — Elf',
      legalities:{commander:'legal'},image_uris:{normal:'/icon-192.png'}
    }))};
    _metaData={from:'2026-10-01',to:'2026-10-07',formats:{standard:{decks:50,archetypes:Array.from({length:8},(_,i)=>({
      key:`Sticky deck ${i}`,name:`Sticky deck ${i}`,style:'aggro',share:12.5,main:[],side:[]
    }))}}};
  });
  await page.locator('.app-navigation').getByRole('button',{name:'Inspiration',exact:true}).click();
  for(const format of ['commander','standard']){
    if(format==='standard'){
      await page.locator('#bsChev').click();
      await page.locator('[data-cs="bsFmt"]').click();
      await page.locator('[data-csopt="bsFmt"][data-val="standard"]').click();
      await page.locator('#advGo').click();
    }
    await expect(page.locator(format==='commander'?'#inspFeed .if-tile':'#browseResults .meta-tile')).toHaveCount(8);
    await expect(page.locator('.inspiration-page > .searchbar')).toHaveCount(0);
    const viewport=page.locator('.inspiration-page .tab-viewport');
    const bar=viewport.locator(':scope > .page-searchbar');
    await expect(bar).toBeVisible();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await viewport.evaluate(el=>el.scrollTop=0);
    const initial=await bar.boundingBox(), bounds=await viewport.boundingBox();
    expect(initial.x-bounds.x).toBeCloseTo(bounds.x+bounds.width-initial.x-initial.width,1);
    expect(initial.y-bounds.y).toBeCloseTo(12,0);
    expect(await bar.evaluate(el=>Math.abs(el.getBoundingClientRect().width-(el.closest('.tab-viewport').clientWidth-16)))).toBeLessThan(2);
    await viewport.evaluate(el=>el.scrollTop=500);
    expect(await viewport.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    expect(await bar.boundingBox()).toEqual(initial);
    expect(await bar.evaluate(el=>{
      const r=el.getBoundingClientRect();
      return document.elementFromPoint(r.left+r.width/2,r.bottom+8)?.closest('.page-searchbar')===el;
    })).toBe(true);
    await page.locator('#bsChev').click();
    await expect(page.getByRole('dialog',{name:'Inspiration filters'})).toBeVisible();
    await page.locator('#advancedSearchClose').click();
    await expect(page.locator('#advancedSearchScreen')).toHaveCount(0);
    expect(await bar.evaluate(el=>{
      const r=el.getBoundingClientRect();
      return [r.left-4,r.right+4].every(x=>[r.top+8,r.bottom+8].every(y=>
        document.elementFromPoint(x,y)?.closest('.sticky-searchbar')===el));
    })).toBe(true);
  }
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/inspiration-integrated-sticky-${info.project.name}.png`});
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
    const controlsBottomMargin = screen==='search' ? 0 : await page.locator('.sp-jump').evaluate(el=>parseFloat(getComputedStyle(el).marginBottom));
    const contentTop = screen==='search' ? header.y + header.height : controls.y + controls.height + controlsBottomMargin;
    expect(Math.abs(bounds.y - contentTop)).toBeLessThan(1);
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
    window.randomRefreshPulses = [];
    navigator.vibrate = pattern => { randomRefreshPulses.push(pattern); return true; };
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
  expect(await page.evaluate(() => randomRefreshPulses)).toEqual([]);
  await pull(0,100);
  await expect(card).toHaveAttribute('alt','Arcane Signet');
  expect(await page.evaluate(() => randomRefreshPulses)).toEqual([70]);
  await page.locator('#cotdReroll').click();
  await expect(card).toHaveAttribute('alt','Sol Ring');
  await page.evaluate(()=>{state.searchRan=true;setCotdVisible(false);});
  await pull(0,100);
  expect(await page.evaluate(()=>state.cotd.card.name)).toBe('Sol Ring');
  expect(await page.evaluate(() => randomRefreshPulses)).toEqual([70]);
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
  await page.getByRole('button',{name:'Settings Preferences & backups'}).click();
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
    body: 'window.DECKHAND_CONFIG = {selfHosted:true,scryfallBase:"/api/scryfall",dataFiles:["bulk-meta.json","oracle-slim.jsonl.gz","rulings-slim.jsonl.gz"]};' }));
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

test('menu install waits for a click, consumes each browser offer once and hides after installation', async ({page})=>{
  expect(await page.evaluate(()=>{
    window.installCalls=0;
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=()=>{window.installCalls++;return Promise.resolve({outcome:'dismissed'});};
    event.userChoice=Promise.resolve({outcome:'dismissed'});
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  expect(await page.evaluate(()=>window.installCalls)).toBe(0);
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  const install=page.locator('#menuInstallApp');
  await expect(install).toHaveClass(/hub-card/);
  await expect(page.locator('.menu-page .hub-card').last()).toHaveAttribute('id','menuSettings');
  await install.click();
  await expect(install).toBeEnabled();
  expect(await page.evaluate(()=>window.installCalls)).toBe(1);
  await install.click();
  await expect(page.getByRole('dialog',{name:'Install Deckhand'})).toBeVisible();
  expect(await page.evaluate(()=>window.installCalls)).toBe(1);
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  await expect(install).toBeFocused();
  await page.evaluate(()=>{
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=()=>{window.installCalls++;return Promise.resolve({outcome:'accepted'});};
    event.userChoice=Promise.resolve({outcome:'accepted'});
    window.dispatchEvent(event);
  });
  await install.click();
  expect(await page.evaluate(()=>window.installCalls)).toBe(2);
  await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
  await expect(install).toHaveCount(0);
  await page.locator('#menuSettings').click();
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await expect(install).toHaveCount(0);
});

test('menu install prevents duplicate prompts and handles a rejected browser prompt', async ({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{
    window.installCalls=0;
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=()=>{window.installCalls++;return new Promise(resolve=>{window.finishInstall=resolve;});};
    event.userChoice=Promise.resolve({outcome:'dismissed'});
    window.dispatchEvent(event);
  });
  await page.locator('#homeBtn').click();
  await page.locator('#menuInstallApp').click();
  await expect(page.locator('#menuInstallApp')).toBeDisabled();
  await page.evaluate(()=>document.getElementById('menuInstallApp').click());
  expect(await page.evaluate(()=>window.installCalls)).toBe(1);
  await page.evaluate(()=>window.finishInstall({outcome:'dismissed'}));
  await expect(page.locator('#menuInstallApp')).toBeEnabled();
  await page.evaluate(()=>{
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=()=>Promise.reject(new Error('Installation unavailable'));
    window.dispatchEvent(event);
  });
  await page.locator('#menuInstallApp').click();
  await expect(page.getByRole('dialog',{name:'Install Deckhand'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalRoot')).toHaveCount(0);
  await expect(page.locator('#menuInstallApp')).toBeFocused();
  expect(errors).toEqual([]);
});

test('menu install gives themed Safari instructions and phone Back closes them', async ({page},info)=>{
  await page.evaluate(()=>Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1',configurable:true}));
  await page.locator('#homeBtn').click();
  await page.locator('#menuInstallApp').click();
  const help=page.getByRole('dialog',{name:'Install Deckhand'});
  await expect(help).toHaveClass(/app-dialog/);
  await expect(help.locator('ol')).toContainText('Add to Home Screen');
  await expect(help.locator('ol')).toContainText('Open as Web App');
  await expect(help).toContainText('Safari');
  await mkdir('var/previews',{recursive:true});
  await page.screenshot({path:`var/previews/install-app-${info.project.name}.png`});
  await page.goBack();
  await expect(help).toHaveCount(0);
  await expect(page.locator('.menu-page')).toBeVisible();
});

test('menu install explains insecure addresses and is hidden inside installed apps', async ({page})=>{
  await page.locator('#homeBtn').click();
  await page.evaluate(()=>Object.defineProperty(window,'isSecureContext',{value:false,configurable:true}));
  await page.locator('#menuInstallApp').click();
  await expect(page.getByRole('dialog',{name:'HTTPS needed'})).toContainText('secure HTTPS address');
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  await page.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
  await page.locator('#menuSettings').click();
  await page.locator('#homeBtn').click();
  await expect(page.locator('#menuInstallApp')).toHaveCount(0);
});

test('a stopped local server pauses API calls and recovers through the health endpoint', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.evaluate(()=>resolveLegalSets());
  await page.clock.install();
  let requests=0,probes=0,serverStopped=true;
  await page.route('**/api/scryfall/cards/autocomplete*',route=>{requests++;return route.abort('connectionrefused');});
  await page.route('**/api/health',route=>{probes++;return serverStopped?route.abort('connectionrefused'):route.fulfill({json:{ok:true,storage:'sqlite'}});});
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
  serverStopped=false;
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
