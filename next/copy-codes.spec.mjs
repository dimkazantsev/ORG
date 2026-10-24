import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';

const css=readFileSync(new URL('./copy-codes.css',import.meta.url),'utf8');
for(const viewport of [{width:1440,height:800},{width:768,height:960},{width:390,height:844},{width:320,height:700}]){
 test('Copy codes stays visible at '+viewport.width+'px on question projection',async({page})=>{
  await page.setViewportSize(viewport);
  await page.setContent('<html><head><style>body{margin:0;font-family:sans-serif;background:#faf9fd}.projection-footer{display:none}'+css+'</style></head><body class="projection-screen-ready"><main><h1>Вопрос 2 / 15</h1></main><footer class="projection-footer">hidden</footer><aside id="projectionCopyCodesDock" class="projection-copy-codes-dock"><p class="projection-copy-codes-status" hidden></p><button class="projection-copy-codes-button" id="projectionCopyAllCodes"><svg viewBox="0 0 24 24" width="18" height="18"></svg><span>Копировать все коды</span></button></aside></body></html>');
  const button=page.locator('#projectionCopyAllCodes');
  await expect(button).toBeVisible();
  const rect=await button.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x+rect.width).toBeLessThanOrEqual(viewport.width+1);
  expect(rect.y+rect.height).toBeLessThanOrEqual(viewport.height+1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(overflow).toBe(false);
 });
}
