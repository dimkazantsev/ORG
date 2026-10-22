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

test('Welcome pairs one entry form with a compact phone entry below the introduction',async({page})=>{
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
  expect(qr.x).toBeLessThan(form.x);
  expect(qr.y).toBeGreaterThan(form.y);
  expect(qr.width).toBeLessThan(650);
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

test('Every redesigned screen fits small phones, tablets and desktops',async({page})=>{
 for(const route of ['','workspace.html','profile.html','presenter.html']){
  await page.goto('http://127.0.0.1:8080/next/'+route,{waitUntil:'domcontentloaded'});
  for(const width of [320,375,768,1024,1440]){
   await page.setViewportSize({width,height:920});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),route+' at '+width).toBeLessThanOrEqual(2);
   if(width===1440||width===375)await page.screenshot({path:'visual-artifacts/lavender-'+(route||'home').replace('.html','')+'-'+width+'.png',fullPage:true});
  }
 }
});

test('Phone studio navigation and editor remain usable with touch and keyboard',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 const sizes=await page.locator('.nav-link').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
 expect(sizes.every(s=>s.width>=44&&s.height>=44)).toBe(true);
 await page.locator('#newQuestion').click();
 await expect(page.locator('#questionDialog')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
 await page.keyboard.press('Escape');
 await expect(page.locator('#questionDialog')).toBeHidden();
});

test('Local font is shared by all four screens',async({page})=>{
 for(const route of ['','workspace.html','profile.html','presenter.html']){
  await page.goto('http://127.0.0.1:8080/next/'+route,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.fonts.ready);
  const style=await page.evaluate(()=>({font:getComputedStyle(document.body).fontFamily,loaded:document.fonts.check('16px Manrope')}));
  expect(style.font).toContain('Manrope');expect(style.loaded).toBe(true);
 }
});

test('Classic entry retains its form and new studio link',async({page})=>{
 await page.goto('http://127.0.0.1:8080/');
 for(const width of [375,768,1440]){
  await page.setViewportSize({width,height:920});
  await expect(page.locator('#joinForm')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
 }
 await expect(page.getByRole('link',{name:'QWIZ-PARTY'})).toHaveAttribute('href','./next/');
 await page.screenshot({path:'visual-artifacts/classic-lavender-1440.png',fullPage:true});
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

test('Multiple-choice, matching, order and free text are playable at phone size',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const question of [
  {kind:'multi',prompt:'Выберите два элемента',options:['А','Б','В']},
  {kind:'match',prompt:'Найдите пары',options:['Страна А','Страна Б'],match_choices:['Город Б','Город А']},
  {kind:'order',prompt:'Выберите порядок',options:['Третий','Второй','Первый']},
  {kind:'number',prompt:'Ответьте числом',options:[]},
  {kind:'hotspot',prompt:'Покажите точку',options:[],media_url:'https://example.com/photo.png'}
 ]){
  await page.evaluate(question=>{
   ctx.room={code:'ABCDEF12',room_id:'00000000-0000-4000-8000-000000000002',title:'Проверка сложных вопросов',phase:'question',index:0,total:5,
    ends_at:new Date(Date.now()+90000).toISOString(),question,teams:[{id:'a',name:'Команда',score:0}],
    me:{id:'player',team_id:'a'},has_answer:false,eligible:true};
   showScreen('game');renderGame();
  },question);
  await expect(page.locator('#gameContent [data-submit-rich]')).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  if(question.kind==='multi')await expect(page.locator('#gameContent input[type="checkbox"]')).toHaveCount(3);
  if(question.kind==='match')await expect(page.locator('#gameContent select.rich-match')).toHaveCount(2);
  if(question.kind==='order')await expect(page.locator('#gameContent select.rich-order')).toHaveCount(3);
  if(question.kind==='number')await expect(page.locator('#richTextAnswer')).toBeVisible();
  if(question.kind==='hotspot')await expect(page.locator('#richSpot')).toBeVisible();
 }
 await page.screenshot({path:'visual-artifacts/rich-game-390.png',fullPage:true});
});
test('Question editor captures new game mechanics without hidden correct-answer defaults',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await page.locator('#newQuestion').click();
 await page.locator('#editKind').selectOption('multi');
 await expect(page.locator('#correctIndices')).toBeVisible();
 await page.locator('#editKind').selectOption('estimate');
 await expect(page.locator('#answerTolerance')).toBeVisible();
 await page.locator('#editKind').selectOption('hotspot');
 await expect(page.locator('#hotspotRadius')).toBeVisible();
 await expect(page.locator('#questionMediaUrl')).toBeVisible();
 await page.locator('#editKind').selectOption('auction');
 await expect(page.locator('#answerEditor')).toContainText('пока не участвует');
});

test('Realtime refresh does not erase a partially entered free-text answer',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  ctx.room={code:'ABCDEF12',room_id:'00000000-0000-4000-8000-000000000003',title:'Тест редактирования',phase:'question',index:2,total:5,
   ends_at:new Date(Date.now()+90000).toISOString(),question:{kind:'text',prompt:'Введите слово',options:[]},
   teams:[{id:'a',name:'Команда',score:0}],me:{id:'p',team_id:'a'},has_answer:false,eligible:true};
  showScreen('game');renderGame();
 });
 await page.locator('#richTextAnswer').fill('Мой незавершённый ответ');
 await page.evaluate(()=>renderGame());
 await expect(page.locator('#richTextAnswer')).toHaveValue('Мой незавершённый ответ');
 await page.evaluate(()=>{ctx.room.index=3;renderGame()});
 await expect(page.locator('#richTextAnswer')).toHaveValue('');
});

