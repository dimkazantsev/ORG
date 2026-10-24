import {test,expect} from '@playwright/test';
const BASE='http://127.0.0.1:8080/next/';
const ID='b2a412f3-4011-4b12-8b14-123456789abc';
test('Geography of Russia is a question topic with 89 server-derived subject entries',async({page})=>{
 await page.goto(BASE+'workspace.html');
 await page.evaluate(id=>{
  state.topics=[{id,name:'География России',category:'География'}];
  state.db={rpc:async(name)=>{
   if(name==='qwiz_geo_catalog')return {data:{total:89,items:[{id:'test',name:'Алтайский край',capital:'Барнаул',fd:'Сибирский федеральный округ',kind:'край',neighbor_count:4}]},error:null};
   return {data:{},error:null};
  }};
  updateSelectors();
 },ID);
 await page.locator('#bankTopic').selectOption(ID);
 await expect(page.locator('#geographyBankInfo')).toBeVisible();
 await expect(page.locator('#bankItems')).toContainText('Алтайский край');
 await expect(page.locator('#questionsTotal')).toContainText('89 субъектов');
 await page.locator('#newGeoRound').click();
 await expect(page.locator('#roundCards .round-card[data-type="bonus"]')).toHaveCount(1);
 await expect(page.locator('#roundCards .round-card')).toHaveCount(3);
 await page.locator('#roundCards .round-card[data-type="bonus"] [data-edit-card]').click();
 await expect(page.locator('#cardGeoModes input:not(:disabled)')).toHaveCount(8);
});
test('General QR prefills room and requests name without separate registration',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null},error:null})}})};'}));
 await page.goto(BASE+'?room=EE31D25A&join=1');
 await expect(page.locator('#qrDirectJoin')).toBeVisible();
 await expect(page.locator('#qrDirectCode')).toHaveText('EE31D25A');
 await expect(page.locator('#joinCode')).toHaveValue('EE31D25A');
 await expect(page.locator('#joinName')).toBeVisible();
 await expect(page.locator('#joinButton')).toContainText('Присоединиться');
 await expect(page.locator('#rolePlayer')).toHaveAttribute('aria-selected','true');
});
test('Presenter has direct room-bound join QR and compact team selection layout',async({page})=>{
 await page.goto(BASE+'presenter.html?room=EE31D25A');
 await page.evaluate(()=>{
  render({code:'EE31D25A',phase:'lobby',index:-1,teams:[],players:[],lobby_teams:Array.from({length:5},(_,i)=>({id:'team-'+i,name:'Команда '+i,position:i+1,members:0}))});
 });
 await expect(page.locator('#projectionMain .projection-lobby')).toBeVisible();
 await expect(page.locator('#projectionMain .projection-qr')).toBeVisible();
 await expect(page.locator('#projectionTeamBoard .team-board-card')).toHaveCount(5);
 const link=await page.locator('#projectionPlay').getAttribute('href');
 expect(link).toContain('join=1');
 const boxes=await page.evaluate(()=>{
  const a=document.querySelector('.projection-lobby').getBoundingClientRect();
  const b=document.querySelector('.projection-team-entry').getBoundingClientRect();
  return {gap:b.top-a.bottom,overflow:document.documentElement.scrollWidth-innerWidth};
 });
 expect(boxes.overflow).toBeLessThanOrEqual(2);
 expect(boxes.gap).toBeLessThan(70);
});
