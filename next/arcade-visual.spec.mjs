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
