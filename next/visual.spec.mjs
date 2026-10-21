import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};'
 }));
 await page.goto('http://127.0.0.1:8080/next/',{waitUntil:'domcontentloaded'});
});

for(const width of [390,768,1440]){
 test('Home layout '+width,async({page})=>{
  await page.setViewportSize({width,height:920});
  await expect(page.locator('#homeView')).toBeVisible();
  await expect(page.getByRole('button',{name:'Присоединиться'})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await page.screenshot({path:'visual-artifacts/home-'+width+'.png',fullPage:true});
 });
}

test('Role switch reveals host login without hiding form labels',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('tab',{name:'Преподаватель'}).click();
 await expect(page.getByLabel('Электронная почта')).toBeVisible();
 await expect(page.getByLabel('Пароль')).toBeVisible();
 await expect(page.getByRole('tabpanel',{name:'Участник'})).toBeHidden();
 await page.getByRole('tab',{name:'Участник'}).click();
 await expect(page.getByLabel('Код комнаты')).toBeVisible();
});

test('Studio workspace remains usable at 390px',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  showScreen('studio');
  ctx.quizzes=[{id:'00000000-0000-4000-8000-000000000001',title:'Пример набора для теста сетки',count:12}];
  renderCatalog();
 });
 await expect(page.locator('#studioView')).toBeVisible();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 expect(overflow).toBeLessThanOrEqual(2);
 await page.screenshot({path:'visual-artifacts/studio-390.png',fullPage:true});
});

test('Question options remain touch-sized at 390px',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  ctx.room={code:'A1B2C3D4',room_id:'00000000-0000-4000-8000-000000000002',title:'Демонстрация сетки',phase:'question',index:0,total:8,
   ends_at:new Date(Date.now()+30000).toISOString(),question:{prompt:'Какой орган государственной власти принимает федеральные законы?',options:['Правительство','Государственная Дума','Конституционный Суд','Центральный банк']},
   teams:[{id:'one',name:'Команда 1',score:200,players:3},{id:'two',name:'Команда 2',score:100,players:2}],
   me:{id:'fixture',team_id:'one'},has_answer:false};
  showScreen('game');renderGame();
 });
 await expect(page.locator('#gameContent [data-answer]')).toHaveCount(4);
 const heights=await page.locator('#gameContent [data-answer]').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
 expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 expect(overflow).toBeLessThanOrEqual(2);
 await page.screenshot({path:'visual-artifacts/game-390.png',fullPage:true});
});

test('Home QR is generated locally and can be enlarged',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await expect(page.locator('#homeQr img, #homeQr canvas').first()).toBeVisible();
 await page.locator('#homeQrOpen').click();
 await expect(page.locator('#qrDialog')).toBeVisible();
 await expect(page.locator('#qrLarge img, #qrLarge canvas').first()).toBeVisible();
 await expect(page.locator('#qrDialogTitle')).toHaveText('Открыть QWIZ-PARTY');
 await page.locator('#qrClose').click();
 await expect(page.locator('#qrDialog')).toBeHidden();
});
test('Up to 15 teams are selectable in the new game form',async({page})=>{
 await page.evaluate(()=>showScreen('studio'));
 await expect(page.locator('#roomTeamCount option')).toHaveCount(14);
 await page.selectOption('#roomTeamCount','15');
 await expect(page.locator('#roomTeamCount')).toHaveValue('15');
});
test('Projection screen only renders questions and never host controls',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"fixture"}}})},rpc:async()=>({data:{code:"ABCDEF12",title:"История",phase:"question",index:0,total:2,ends_at:new Date(Date.now()+60000).toISOString(),question:{prompt:"Как называется столица России?",options:["Казань","Москва","Томск","Владивосток"]}},error:null}),channel:()=>({on(){return this},subscribe(){return this}})})};'
 }));
 await page.goto('http://127.0.0.1:8080/next/presenter.html?room=ABCDEF12');
 await expect(page.locator('.projection-question h1')).toHaveText('Как называется столица России?');
 await expect(page.locator('.projection-option')).toHaveCount(4);
 await expect(page.locator('#hostControls')).toHaveCount(0);
 await expect(page.locator('#hostTeams')).toHaveCount(0);
 await expect(page.locator('#loginEmail')).toHaveCount(0);
 await page.screenshot({path:'visual-artifacts/presenter-1440.png',fullPage:true});
});
