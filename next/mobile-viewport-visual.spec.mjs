import {test,expect} from '@playwright/test';

const FIXTURE='http://127.0.0.1:8080/next/mobile-viewport-qa-fixture.html';

for(const [width,height] of [[320,480],[360,640],[390,844],[430,932]]){
 test('Geography map + zoom + confirm fit without scrolling on '+width+'×'+height,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(FIXTURE);
  const map=page.locator('.geo-map-frame');
  await expect(map).toBeVisible();
  const choices=page.locator('.geo-map-toolbar button');
  await expect(choices).toHaveCount(3);
  await page.locator('.geo-map-svg [data-region]').first().click({force:true});
  const confirm=page.locator('.geo-confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeEnabled();
  const report=await page.evaluate(()=>{
   const card=document.querySelector('#gameContent').getBoundingClientRect();
   const footer=document.querySelector('.geo-footer').getBoundingClientRect();
   const button=document.querySelector('.geo-confirm').getBoundingClientRect();
   const controls=[...document.querySelectorAll('.geo-map-toolbar button')].map(x=>x.getBoundingClientRect());
   return {card,footer,button,controls,visibleHeight:innerHeight,
    scrolled:document.querySelector('#gameContent').scrollTop};
  });
  expect(report.scrolled).toBe(0);
  expect(report.button.bottom).toBeLessThanOrEqual(report.card.bottom+1);
  expect(report.footer.bottom).toBeLessThanOrEqual(report.card.bottom+1);
  for(const b of report.controls){expect(b.left).toBeGreaterThanOrEqual(report.card.left);
   expect(b.right).toBeLessThanOrEqual(report.card.right+1);}
 });
 test('Bonus strategy and effect dialog fits viewport '+width+'×'+height,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(FIXTURE);
  for(const stage of ['strategy','effects']){
   await page.evaluate(value=>window.showBonusFixture(value),stage);
   const dialog=page.locator('.arcade-boost-dialog[open]');
   await expect(dialog).toBeVisible();
   const options=dialog.locator('[data-boost-choice]');
   await expect(options).toHaveCount(stage==='strategy'?2:3);
   const measured=await dialog.evaluate(el=>({
    dialog:el.getBoundingClientRect(),
    options:[...el.querySelectorAll('[data-boost-choice]')].map(b=>b.getBoundingClientRect()),
    scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
    windowHeight:innerHeight
   }));
   expect(measured.dialog.top).toBeGreaterThanOrEqual(0);
   expect(measured.dialog.bottom).toBeLessThanOrEqual(measured.windowHeight+1);
   expect(measured.scrollHeight).toBeLessThanOrEqual(measured.clientHeight+1);
   for(const option of measured.options){
    expect(option.top).toBeGreaterThanOrEqual(measured.dialog.top);
    expect(option.bottom).toBeLessThanOrEqual(measured.dialog.bottom+1);
   }
  }
 });
}
