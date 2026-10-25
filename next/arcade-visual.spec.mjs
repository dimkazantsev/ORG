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
 test('Runner puts one-finger jump in the arena on '+width+'px',async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(URL);
  await page.evaluate(()=>window.mountExample('rocket'));
  await expect(page.locator('.arcade-runner-obstacle')).toBeVisible();
  const button=page.locator('.arcade-runner-jump-btn');
  await expect(button).toBeEnabled();
  const bounds=await button.boundingBox(),scene=await page.locator('.arcade-scene').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(scene.x);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(scene.x+scene.width+2);
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(scene.y+scene.height+2);
  await button.click();
  await expect.poll(()=>page.evaluate(()=>window.accepted.some(x=>x.action==='jump'))).toBe(true);
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
