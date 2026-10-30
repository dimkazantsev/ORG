import {test,expect} from '@playwright/test';
const URL='http://127.0.0.1:8080/next/arcade-qa-fixture.html';
for(const [width,height] of [[320,480],[390,844],[568,320]]){
 test('Secret Code preserves symbols and reachable answer controls at '+width+'×'+height,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(URL);
  await page.evaluate(()=>{
   window.setFixturePlayer();
   window.mountExample('sequence_memory');
   fake.secret_code={...fake.secret_code,length:10,
    choices:['red','blue','yellow','green','star','shield','crown','key']};
  });
  // Re-mount with the long challenge so the initial server snapshot includes it.
  await page.evaluate(()=>window.mountExample('sequence_memory'));
  await expect(page.locator('[data-secret-choice]')).toHaveCount(8);
  await expect(page.locator('[data-secret-stage]')).toBeVisible();
  const dimensions=await page.evaluate(()=>{
   const panel=document.querySelector('#gameContent'),scene=document.querySelector('.arcade-scene'),
    symbol=document.querySelector('[data-secret-symbol]'),r=scene.getBoundingClientRect();
   return {overflow:getComputedStyle(panel).overflowY,scene:r.height,symbol:symbol.getBoundingClientRect().height,
    scrollWidth:document.documentElement.scrollWidth,windowWidth:innerWidth};
  });
  expect(dimensions.overflow).toBe('auto');
  expect(dimensions.scene).toBeGreaterThanOrEqual(70);
  expect(dimensions.symbol).toBeGreaterThan(25);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.windowWidth+2);
  const submit=page.locator('[data-secret-submit]');
  await submit.evaluate(el=>el.scrollIntoView({block:'end'}));
  const reachable=await page.evaluate(()=>{
   const outer=document.querySelector('#gameContent').getBoundingClientRect(),
    b=document.querySelector('[data-secret-submit]').getBoundingClientRect();
   return b.top>=outer.top-2&&b.bottom<=outer.bottom+2&&b.left>=outer.left-2&&b.right<=outer.right+2;
  });
  expect(reachable).toBe(true);
  await page.locator('[data-secret-choice="red"]').click();
  await page.locator('[data-secret-choice="blue"]').click();
  await expect(page.locator('.arcade-secret-slot.filled')).toHaveCount(2);
 });
}
test('Bonus modal closes upon a confirmed choice and stays closed after refresh',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(URL);
 await page.evaluate(()=>window.mountExample('tug',true));
 const modal=page.locator('.arcade-boost-dialog');
 await expect(modal).toBeVisible();
 await modal.locator('[data-boost-choice="support"]').click();
 await expect.poll(()=>page.evaluate(()=>window.accepted.filter(x=>x.action==='boost-vote').length)).toBe(1);
 await expect(modal).not.toBeVisible();
 await page.waitForTimeout(3200);
 await expect(modal).not.toBeVisible();
});
test('Bonus modal closes after ten seconds even without choosing',async({page})=>{
 await page.setViewportSize({width:320,height:568});
 await page.goto(URL);
 await page.clock.install();
 await page.evaluate(()=>window.mountExample('tug',true));
 const modal=page.locator('.arcade-boost-dialog');
 await expect(modal).toBeVisible();
 await page.clock.fastForward(10050);
 await expect(modal).not.toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.accepted.filter(x=>x.action==='boost-vote').length)).toBe(0);
});
