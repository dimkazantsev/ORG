import {test,expect} from '@playwright/test';
const URL='http://127.0.0.1:8080/next/arcade-qa-fixture.html';
for(const [width,height] of [[390,844],[1280,720]]){
 test('Memory uses 12 responsive tiles and server-accepted flips at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(URL);
  await page.evaluate(()=>window.mountExample('captain'));
  await expect(page.locator('.arcade-memory-tile')).toHaveCount(12);
  await expect(page.locator('.arcade-tap-btn')).toBeHidden();
  await page.locator('.arcade-memory-tile').first().click();
  await expect.poll(()=>page.evaluate(()=>window.accepted.some(x=>x.action==='flip'&&x.tile===0))).toBe(true);
  await expect(page.locator('.arcade-memory-tile').first()).toHaveClass(/is-open/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
 });
 test('Every participant taps the central three-dimensional button at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(URL);
  await page.evaluate(()=>window.mountExample('tug'));
  const button=page.locator('.arcade-tap-center');
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(()=>page.evaluate(()=>window.accepted.some(x=>x.action==='tap'&&x.count>0))).toBe(true);
  await expect(page.locator('.arcade-rank-score')).toContainText(/тапов/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
 });
}


test('A repeated Memory card resets the old deck instead of showing previous revealed faces',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(URL);
 await page.evaluate(()=>window.mountExample('captain'));
 await expect(page.locator('.arcade-memory-tile')).toHaveCount(12);
 await page.locator('.arcade-memory-tile').first().click();
 await expect(page.locator('.arcade-memory-tile').first()).toHaveClass(/is-open/);
 await page.evaluate(()=>window.mountExample('captain'));
 await expect(page.locator('.arcade-memory-tile').first()).not.toHaveClass(/is-open/,{timeout:6000});
 await expect(page.locator('.arcade-memory-tile')).toHaveCount(12);
});


test('Tap-battle counts first pointerdown instantly without double click and batches rapidly',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(URL);
 await page.evaluate(()=>window.mountExample('tug'));
 const btn=page.locator('[data-arcade-root="tug"] [data-arcade-tap]');
 await expect(btn).toBeEnabled();
 await page.evaluate(()=>{
  const b=document.querySelector('[data-arcade-root="tug"] [data-arcade-tap]');
  b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true,pointerId:1}));
  b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
 });
 await expect(page.locator('[data-arcade-personal]')).toContainText('Нажатия: 1');
 await expect.poll(()=>page.evaluate(()=>window.accepted.filter(x=>x.action==='tap').reduce((n,x)=>n+x.count,0))).toBeGreaterThanOrEqual(1);
 // Existing server batches are idempotent. 7 additional touches should
 // remain responsive before the server has acknowledged the next batch.
 await page.evaluate(()=>{
  const b=document.querySelector('[data-arcade-root="tug"] [data-arcade-tap]');
  for(let i=0;i<7;i++)
   b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true,pointerId:i+2}));
 });
 await expect(page.locator('[data-arcade-personal]')).toContainText('Нажатия: 8');
 await expect.poll(()=>page.evaluate(()=>window.accepted.filter(x=>x.action==='tap').reduce((n,x)=>n+x.count,0)),{timeout:9000}).toBeGreaterThanOrEqual(8);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('Removed Dino stays absent, while active team games have matching names on every screen',async({page})=>{
 await page.goto(URL);
 const values=await page.evaluate(async()=>{
  // Fixture embeds arcade.js only; other files are inspected by this test as source
  // to ensure three entry points agree on canonical saved-card labels.
  const paths=['app.js','presenter.js','workspace.js'];
  const texts=await Promise.all(paths.map(async p=>(await fetch('./'+p)).text()));
  return texts.map(x=>({rocketRemoved:!x.includes("rocket:'Дино-забег'"),
   tug:x.includes("tug:'Тап-баттл'"),blitz:x.includes("blitz:'Блиц-консенсус'"),captain:x.includes("captain:'Мэмори капитанов'"),
   normalizes:/ArcadeActivity\(/.test(x)}));
 });
 expect(values).toHaveLength(3);
 for(const check of values)expect(check).toEqual({rocketRemoved:true,tug:true,blitz:true,captain:true,normalizes:true});
});


for(const [tapWidth,tapHeight] of [[375,812],[1280,800]]){
 test('Enhanced Tap button stays clickable, centered and accessible at '+tapWidth+'px',async({page})=>{
  await page.setViewportSize({width:tapWidth,height:tapHeight});
  await page.goto(URL);
  await page.evaluate(()=>window.mountExample('tug'));
  const btn=page.locator('.arcade-tap-center');
  await expect(btn).toHaveText('ТАП!');
  const visual=await btn.evaluate(el=>{
   const style=getComputedStyle(el),before=getComputedStyle(el,'::before'),
      after=getComputedStyle(el,'::after');
   const stage=el.closest('.arcade-scene').querySelector('.arcade-tap-stage');
   const sr=stage.getBoundingClientRect(),br=el.getBoundingClientRect();
   return {
    pointerBefore:before.pointerEvents,pointerAfter:after.pointerEvents,
    border:parseFloat(style.borderTopWidth),
    layers:style.backgroundImage.split('radial-gradient').length-1,
    centered:Math.abs((br.left+br.width/2)-(sr.left+sr.width/2))<2,
    within:br.left>=sr.left&&br.right<=sr.right&&br.top>=sr.top&&br.bottom<=sr.bottom,
    radius:style.borderRadius
   };
  });
  expect(visual.pointerBefore).toBe('none');
  expect(visual.pointerAfter).toBe('none');
  expect(visual.border).toBeGreaterThanOrEqual(5);
  expect(visual.layers).toBeGreaterThanOrEqual(2);
  expect(visual.centered).toBe(true);
  expect(visual.within).toBe(true);
  expect(visual.radius).toContain('%');
  await btn.click();
  await expect.poll(()=>page.evaluate(()=>window.accepted.filter(x=>x.action==='tap').length)).toBeGreaterThan(0);
 });
}

test('Tap button respects reduced-motion without obscuring the accessible label',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(URL);
 await page.evaluate(()=>window.mountExample('tug'));
 const effect=await page.locator('.arcade-tap-center').evaluate(el=>({
  transition:getComputedStyle(el).transitionDuration,
  pseudo:getComputedStyle(el,'::before').pointerEvents,
  label:el.textContent.trim()
 }));
 expect(effect.transition.split(',').every(s=>parseFloat(s)===0)).toBe(true);
 expect(effect.pseudo).toBe('none');
 expect(effect.label).toBe('ТАП!');
});

test('Secret Code is playable: all four choices can be repeated and one server submission is sent',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(URL);
 await page.evaluate(()=>window.mountExample('sequence_memory'));
 await expect(page.locator('.arcade-secret-choices button')).toHaveCount(4);
 await page.locator('[data-secret-choice="red"]').click();
 await page.locator('[data-secret-choice="blue"]').click();
 await page.locator('[data-secret-choice="red"]').click();
 await page.locator('[data-secret-choice="green"]').click();
 await expect(page.locator('[data-secret-submit]')).toBeEnabled();
 await page.locator('[data-secret-submit]').click();
 await expect.poll(()=>page.evaluate(()=>window.accepted.filter(x=>x.action==='secret-submit').length)).toBe(1);
 await expect(page.locator('.arcade-secret-done')).toContainText('Ответ принят');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('Audience Tap-battle shows a static readable ЖМИ! button, never a tappable control',async({page})=>{
 for(const [width,height] of [[390,844],[1280,720]]){
  await page.setViewportSize({width,height});
  await page.goto('http://127.0.0.1:8080/next/arcade-qa-fixture.html');
  await page.evaluate(()=>window.mountProjectorWithoutVote());
  await expect(page.locator('#projectionMain .arcade-shell')).toBeVisible();
  await expect(page.locator('#projectionMain [data-arcade-vote-screen]')).toBeHidden();
  const marker=page.locator('#projectionMain .arcade-audience-tap-hero');
  await expect(marker).toBeVisible();
  await expect(marker).toHaveText('ЖМИ!');
  await expect(page.locator('#projectionMain [data-arcade-tap]')).toHaveCount(0);
  const bounds=await marker.evaluate(el=>{
   const screen=el.closest('.arcade-scene').getBoundingClientRect();
   const text=el.querySelector('span').getBoundingClientRect();
   return {gap:Math.abs((screen.left+screen.width/2)-(text.left+text.width/2)),
    width:text.width,screenWidth:screen.width};
  });
  expect(bounds.gap).toBeLessThanOrEqual(3);
  expect(bounds.width).toBeGreaterThan(85);
  expect(bounds.width).toBeLessThan(bounds.screenWidth+2);
 }
});

test('Solo-team strategy choice is visually centered on the public voting screen',async({page})=>{
 await page.setViewportSize({width:1280,height:720});
 await page.goto('http://127.0.0.1:8080/next/arcade-qa-fixture.html');
 await page.evaluate(()=>{
  window.mountProjectionVote('strategy');
  fake.vote.target_name='';
  window.dispatchEvent(new Event('online'));
 });
 await expect(page.locator('#projectionMain .arcade-projection-vote-option')).toHaveCount(1);
 const layout=await page.evaluate(()=>{
  const item=document.querySelector('.arcade-projection-vote-option').getBoundingClientRect();
  const screen=document.querySelector('.arcade-projection-vote-options').getBoundingClientRect();
  return {difference:Math.abs((item.left+item.width/2)-(screen.left+screen.width/2)),
   size:item.width,screen:screen.width};
 });
 expect(layout.difference).toBeLessThanOrEqual(3);
 expect(layout.size).toBeLessThan(layout.screen);
});
