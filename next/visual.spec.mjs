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
  await expect(page.getByRole('button',{name:'Присоединиться к игре'})).toBeVisible();
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
 await expect(page.getByRole('textbox',{name:'Код комнаты',exact:true})).toBeVisible();
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
 await expect(page.locator('#homeQr img')).toBeVisible({timeout:10000});
 await page.locator('#homeQrOpen').click();
 await expect(page.locator('#qrDialog')).toBeVisible();
 await expect(page.locator('#qrLarge img')).toBeVisible({timeout:10000});
 await expect(page.locator('#qrDialogTitle')).toHaveText('Открыть QWIZ-PARTY');
 await page.locator('#qrClose').click();
 await expect(page.locator('#qrDialog')).toBeHidden();
});
test('Up to 15 teams are selectable in the new game form',async({page})=>{
 await page.evaluate(()=>{showScreen('studio');tab('room')});
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

test('Welcome has one clear entry form, no duplicate navigation, and a QR beside it',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await expect(page.locator('#homeView .welcome-layout')).toBeVisible();
  await expect(page.locator('#homeView .welcome-head')).toBeVisible();
  await expect(page.locator('#homeView .entry')).toBeVisible();
  await expect(page.locator('#homeView .qr-card')).toBeVisible();
  await expect(page.locator('#homeView .entry-visual')).toHaveCount(0);
  await expect(page.locator('#homeView [id="joinForm"]')).toHaveCount(1);
  const form=await page.locator('#entryPanel').boundingBox();
  const qr=await page.locator('#homeQrCard').boundingBox();
  expect(form && qr).toBeTruthy();
  expect(Math.abs(qr.y-form.y)).toBeLessThan(5);
  expect(qr.x).toBeGreaterThan(form.x);
});

test('At narrow widths, the entry form appears before the optional welcome banner',async({page})=>{
 for(const width of [320,360,390,768]){
  await page.setViewportSize({width,height:844});
  const boxForm=await page.locator('#entryPanel').boundingBox();
  const boxHero=await page.locator('#homeView .welcome-head').boundingBox();
  const boxQR=await page.locator('#homeQrCard').boundingBox();
  expect(boxForm && boxHero && boxQR).toBeTruthy();
  expect(boxHero.y).toBeLessThan(boxForm.y);
  expect(boxQR.y).toBeGreaterThan(boxForm.y);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
 }
});

test('Keyboard focus and tabs remain accessible',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('tab',{name:'Преподаватель'}).click();
 await expect(page.getByRole('textbox',{name:'Электронная почта'})).toBeVisible();
 await page.getByRole('tab',{name:'Участник'}).click();
 await page.locator('#joinCode').focus();
 await expect(page.locator('#joinCode')).toBeFocused();
 await expect(page.getByRole('button',{name:'Присоединиться к игре'})).toBeVisible();
});

test('Room code normalizes and form required labels remain visible',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.locator('#joinCode').fill('ab12cd34');
 await expect(page.locator('#joinCode')).toHaveValue('AB12CD34');
 await expect(page.locator('#joinName')).toBeVisible();
 await expect(page.locator('#joinGroup')).toBeVisible();
 await expect(page.locator('#joinButton')).toBeVisible();
});
test('Entry fonts do not request Google Fonts on startup',async({page})=>{
 const loaded=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));
 expect(loaded.some(url=>url.includes('fonts.googleapis.com'))).toBe(false);
 expect(loaded.some(url=>url.includes('fonts.gstatic.com'))).toBe(false);
});


test('Audience can open general link and enter a specific room without teacher login',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/presenter.html');
 await expect(page.getByRole('heading',{name:'Какая игра сегодня?'})).toBeVisible();
 await expect(page.locator('#loginEmail')).toHaveCount(0);
 await page.locator('#projectionCode').fill('abcdef12');
 await expect(page.locator('#projectionCode')).toHaveValue('ABCDEF12');
});
test('Standalone teacher workspace is responsive and has two library sections',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:900});
   await expect(page.locator('#bankPage')).toBeVisible();
   await expect(page.locator('#bankSearch')).toBeVisible();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   expect(overflow).toBeLessThanOrEqual(2);
   if(width===390)await page.screenshot({path:'visual-artifacts/workspace-390.png',fullPage:true});
   if(width===1440)await page.screenshot({path:'visual-artifacts/workspace-1440.png',fullPage:true});
 }
 await page.locator('[data-section="builder"]').click();
 await page.locator('#newBuild').click();
 await expect(page.locator('#roundCards .round-card')).toHaveCount(3);
 await expect(page.locator('#roundCards .round-card').last()).toHaveAttribute('data-type','finale');
 await page.locator('[data-card="team_stats"]').click();
 await expect(page.locator('#roundCards .round-card')).toHaveCount(4);
 await expect(page.locator('#roundCards .round-card').last()).toHaveAttribute('data-type','finale');
});
test('Studio question editor changes fields for boolean and correspondence',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await page.locator('#newQuestion').click();
 await expect(page.locator('#questionDialog')).toBeVisible();
 await page.locator('#editKind').selectOption('boolean');
 await expect(page.locator('#answerEditor [data-option]')).toHaveCount(2);
 await page.locator('#editKind').selectOption('match');
 await expect(page.locator('#genericItems')).toBeVisible();
});
test('Student can see registration and twelve animal avatars',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/profile.html');
 await expect(page.getByRole('heading',{name:'Мой профиль'})).toBeVisible();
 await page.locator('#authRegisterTab').click();
 await expect(page.locator('#registerPanel')).toBeVisible();
 await expect(page.locator('#registerAvatars [data-avatar]')).toHaveCount(12);
 await page.screenshot({path:'visual-artifacts/profile-390.png',fullPage:true});
});
test('Public display renders server countdown but no answers or admin controls',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({rpc:async(name)=>({data:{code:"ABCDEF12",title:"Общая игра",phase:"countdown",index:0,total:7,ends_at:new Date(Date.now()+60000).toISOString(),question:null},error:null}),channel:()=>({on(){return this},subscribe(){return this}})})};'
 }));
 await page.goto('http://127.0.0.1:8080/next/presenter.html?room=ABCDEF12');
 await expect(page.locator('.countdown-number')).toBeVisible();
 await expect(page.locator('#hostControls')).toHaveCount(0);
 await expect(page.locator('.projection-question')).toHaveCount(0);
 await page.screenshot({path:'visual-artifacts/countdown-1440.png',fullPage:true});
});
