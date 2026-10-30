import {test,expect} from '@playwright/test';
const URL='http://127.0.0.1:8080/next/arcade-qa-fixture.html';

for(const [width,height] of [[1280,720],[1920,1080],[390,844]]){
 test('Audience voting is a dedicated, legible scene at '+width+'×'+height,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(URL);
  await page.evaluate(()=>window.mountProjectionVote('strategy'));
  const screen=page.locator('#projectionMain [data-arcade-vote-screen]');
  await expect(screen).toBeVisible();
  await expect(page.locator('#projectionMain .arcade-shell')).toBeHidden();
  await expect(screen.locator('.arcade-projection-vote-step')).toHaveText('ЭТАП 1 ИЗ 2');
  await expect(screen.locator('.arcade-projection-vote-option')).toHaveCount(2);
  await expect(screen).toContainText('Команда победителей');
  await expect(screen).toContainText('Выбор делает победившая команда');
  await expect(screen.locator('[data-projection-vote-count="support"]')).toHaveText('4');
  const bounds=await screen.evaluate(el=>{
   const r=el.getBoundingClientRect();
   const body=document.documentElement;
   return {width:r.width,height:r.height,viewportWidth:innerWidth,
    screenScrollWidth:el.scrollWidth,screenClientWidth:el.clientWidth,
    documentWidth:body.scrollWidth};
  });
  expect(bounds.width).toBeGreaterThan(200);
  expect(bounds.height).toBeGreaterThan(200);
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth+2);
  expect(bounds.screenScrollWidth).toBeLessThanOrEqual(bounds.screenClientWidth+2);
 });
}

test('Audience vote advances to a separate effect screen, never hides on all votes',async({page})=>{
 await page.setViewportSize({width:1280,height:720});
 await page.goto(URL);
 await page.evaluate(()=>window.mountProjectionVote('strategy'));
 const screen=page.locator('#projectionMain [data-arcade-vote-screen]');
 await expect(screen).toBeVisible();
 await page.evaluate(()=>window.updateProjectionVote('option','sabotage',{fog:4,storm:0,drain:0}));
 await expect(screen.locator('.arcade-projection-vote-step')).toHaveText('ЭТАП 2 ИЗ 2');
 await expect(screen.locator('.arcade-projection-vote-option')).toHaveCount(3);
 await expect(screen).toContainText('Какое ограничение получит соперник?');
 await expect(screen.locator('[data-projection-vote-count="fog"]')).toHaveText('4');
 await expect(screen).toBeVisible();
 await expect(page.locator('#projectionMain .arcade-shell')).toBeHidden();
 await page.evaluate(()=>{
  fake.vote=null;
  window.dispatchEvent(new Event('online'));
 });
 await expect(screen).toBeHidden();
 await expect(page.locator('#projectionMain .arcade-shell')).toBeVisible();
});

test('Vote projection uses server countdown, updates without replacing stage',async({page})=>{
 await page.goto(URL);
 await page.evaluate(()=>window.mountProjectionVote('option','support'));
 const screen=page.locator('[data-arcade-vote-screen]');
 await expect(screen).toBeVisible();
 const element=screen.locator('[data-projection-vote-seconds]');
 const first=Number(await element.textContent());
 expect(first).toBeGreaterThan(0);
 await page.waitForTimeout(1100);
 const second=Number(await element.textContent());
 expect(second).toBeLessThan(first);
 await expect(screen.locator('.arcade-projection-vote-step')).toHaveText('ЭТАП 2 ИЗ 2');
});
