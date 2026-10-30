import {test,expect} from '@playwright/test';
const ORIGIN='http://127.0.0.1:8080/next/';
const mockSdk=async(page)=>page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
 status:200,contentType:'application/javascript',
 body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},channel:()=>({on(){return this},subscribe(){return this}}),rpc:async()=>({data:null,error:null})})};'
}));

for(const [width,height] of [[390,844],[1280,720]]){
 test('Projector shows static ЖМИ! and separated team rankings at '+width+'x'+height,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(ORIGIN+'arcade-qa-fixture.html');
  await page.evaluate(()=>window.mountProjectorGame('tug',false));
  const scene=page.locator('#projectionMain .arcade-projection[data-arcade-root="tug"]');
  const button=scene.locator('.arcade-projection-tap-button');
  await expect(button).toBeVisible();
  await expect(button).toContainText('ЖМИ!');
  await expect(scene.locator('.arcade-rank')).toHaveCount(2);
  await expect(scene).toContainText('Команда победителей');
  await expect(scene).toContainText('Команда соперников');
  const visual=await button.evaluate(el=>({
   pointer:getComputedStyle(el).pointerEvents, width:el.getBoundingClientRect().width,
   rect:el.getBoundingClientRect().toJSON(),panel:el.closest('.arcade-scene').getBoundingClientRect().toJSON()
  }));
  expect(visual.pointer).toBe('none');
  expect(visual.width).toBeGreaterThanOrEqual(125);
  expect(visual.rect.left).toBeGreaterThanOrEqual(visual.panel.left-2);
  expect(visual.rect.right).toBeLessThanOrEqual(visual.panel.right+2);
 });
}

test('One-team bonus is a centered single option, not clipped at the bottom',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(ORIGIN+'arcade-qa-fixture.html');
 await page.evaluate(()=>window.mountSoloVote('strategy'));
 const panel=page.locator('#projectionMain [data-arcade-vote-screen]');
 await expect(panel).toBeVisible();
 await expect(panel).toHaveClass(/is-solo/);
 await expect(panel.locator('.arcade-projection-vote-option')).toHaveCount(1);
 const bounds=await panel.evaluate(el=>{
  const p=el.getBoundingClientRect(),o=el.querySelector('.arcade-projection-vote-option').getBoundingClientRect(),
   footer=el.querySelector('.arcade-projection-vote-bottom').getBoundingClientRect();
  return {left:o.left-p.left,right:p.right-o.right,bottom:footer.bottom-p.bottom,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
 });
 expect(Math.abs(bounds.left-bounds.right)).toBeLessThan(14);
 expect(bounds.bottom).toBeLessThanOrEqual(2);
 expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth+2);
 await expect(page.locator('#projectionMain .arcade-shell')).toBeHidden();
});

test('Transient player form error disappears without changing the current question',async({page})=>{
 await mockSdk(page);
 await page.goto(ORIGIN+'index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof notice==='function');
 await page.evaluate(()=>notice('gameNotice','Отметьте хотя бы один вариант.','error'));
 await expect(page.locator('#gameNotice')).toContainText('Отметьте хотя бы один вариант.');
 await expect(page.locator('#gameNotice')).toBeEmpty({timeout:5500});
});

test('Captain selection is one unified mobile card with a working claim button',async({page})=>{
 await mockSdk(page);
 await page.setViewportSize({width:390,height:844});
 await page.goto(ORIGIN+'index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof renderGame==='function');
 await page.evaluate(()=>{
  ctx.mode='game';
  ctx.room={code:'A1B2C3D4',room_id:'00000000-0000-4000-8000-000000000222',
   title:'Испытание',phase:'lobby',index:-1,total:5,me:{id:'p1',team_id:null},
   teams:[],players:[],team_lobby:{mode:'captain',team_count:1,captain_count:0,
    can_claim:true,confirmed:false,captains_ready:false,my_captain:false}};
  showScreen('game');renderGame();
 });
 await expect(page.locator('#gameContent .player-team-building')).toBeVisible();
 await expect(page.locator('#gameContent [data-claim-captain]')).toBeVisible();
 await expect(page.locator('#playerTeamPanel')).toBeHidden();
 await expect(page.locator('#gameContent .player-team-building h1')).toHaveText('Выбираем капитанов');
 const button=page.locator('#gameContent [data-claim-captain]');
 const rect=await button.boundingBox();
 expect(rect.width).toBeGreaterThan(150);
 expect(rect.x).toBeGreaterThanOrEqual(0);
 expect(rect.x+rect.width).toBeLessThanOrEqual(392);
});
