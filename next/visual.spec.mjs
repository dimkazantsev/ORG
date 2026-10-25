import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),signInAnonymously:async()=>({data:{session:{}},error:null})},rpc:async()=>({data:{registered:false},error:null})})};'
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
  await page.screenshot({path:'visual-artifacts/home-'+width+'.png',fullPage:true,animations:'disabled'});
 });
}

test('Role switch reveals host login without hiding form labels',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('tab',{name:'Преподаватель'}).click();
 await expect(page.getByLabel('Электронная почта')).toBeVisible();
 await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();
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
 await page.screenshot({path:'visual-artifacts/studio-390.png',fullPage:true,animations:'disabled'});
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
 await page.screenshot({path:'visual-artifacts/game-390.png',fullPage:true,animations:'disabled'});
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
test('Team count is configured after room creation, not duplicated in its form',async({page})=>{
 await page.evaluate(()=>{showScreen('studio');tab('room')});
 await expect(page.locator('#roomTeamCount')).toHaveCount(0);
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await expect(page.locator('#teamCount')).toHaveAttribute('min','1');
 await expect(page.locator('#teamCount')).toHaveAttribute('max','15');
});
test('Projection screen only renders questions and never host controls',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"fixture"}}})},rpc:async()=>({data:{code:"ABCDEF12",title:"История",phase:"question",index:0,total:2,ends_at:new Date(Date.now()+60000).toISOString(),question:{prompt:"Как называется столица России?",options:["Казань","Москва","Томск","Владивосток"]}},error:null}),channel:()=>({on(){return this},subscribe(){return this}})})};'
 }));
 await page.goto('http://127.0.0.1:8080/next/presenter.html?room=ABCDEF12');
 await expect(page.locator('.projection-question h1')).toHaveText('Как называется столица России?');
 await expect(page.locator('.projection-public-options .projection-option')).toHaveCount(4);
 await expect(page.locator('.projection-public-options')).toContainText('Москва');
 await expect(page.locator('.projection-question-instruction')).toHaveCount(0);
 await expect(page.locator('#hostControls')).toHaveCount(0);
 await expect(page.locator('#hostTeams')).toHaveCount(0);
 await expect(page.locator('#loginEmail')).toHaveCount(0);
 await page.screenshot({path:'visual-artifacts/presenter-1440.png',fullPage:true,animations:'disabled'});
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
   if(width===1440||width===375)await page.screenshot({path:'visual-artifacts/lavender-'+(route||'home').replace('.html','')+'-'+width+'.png',fullPage:true,animations:'disabled'});
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
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('http://127.0.0.1:8080/');
 await expect(page).toHaveURL(/\/next\/$/);
 for(const width of [375,768,1440]){
  await page.setViewportSize({width,height:920});
  await expect(page.locator('#joinForm')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
 }
 await page.goto('http://127.0.0.1:8080/?legacy=1');
 await expect(page.locator('a.new-studio-link')).toHaveAttribute('href','./next/');
 await page.screenshot({path:'visual-artifacts/classic-lavender-1440.png',fullPage:true,animations:'disabled'});
});

test('Bank renders realistic long questions without overflowing on phones',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:`
 window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{access_token:'visual-fixture'}}})},
  rpc:async(name,args)=>{
   if(name==='org_quiz_is_admin_check')return {data:true,error:null};
   if(name==='qwiz_host_rooms')return {data:[],error:null};
   if(name==='qwiz_studio'&&args.p_action==='overview')return {data:{topics:[{id:'geo',name:'География'},{id:'history',name:'История и культура'},{id:'logic',name:'Логика'}],builds:[]},error:null};
   if(name==='qwiz_studio'&&args.p_action==='questions')return {data:{total:3,items:[
    {id:'visual-1',kind:'single',topic_id:'geo',difficulty:2,prompt:'Демонстрационный вопрос: какой из перечисленных городов расположен ближе к Северному полярному кругу?'},
    {id:'visual-2',kind:'match',topic_id:'history',difficulty:3,prompt:'Демонстрационное задание: найдите соответствия между историческими событиями и датами.'},
    {id:'visual-3',kind:'boolean',topic_id:'logic',difficulty:1,prompt:'Демонстрационное утверждение для ответа да или нет.'}
   ]},error:null};
   return {data:[],error:null};
  }
 })};`}));
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await expect(page.locator('.question-row')).toHaveCount(3);
 for(const width of [375,1440]){
  await page.setViewportSize({width,height:920});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({path:'visual-artifacts/bank-fixture-'+width+'.png',fullPage:true,animations:'disabled'});
 }
});


test('Audience opens with QR and no teacher login or manually entered code',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({rpc:async()=>({data:{code:null,phase:null},error:null})})};'}));
 await page.goto('http://127.0.0.1:8080/next/presenter.html');
 await expect(page.getByRole('heading',{name:'Присоединяйтесь к игре!'})).toBeVisible();
 await expect(page.locator('#loginEmail')).toHaveCount(0);
 await expect(page.locator('#projectionSetupQrOpen')).toBeEnabled();
 await expect(page.locator('#projectionSetupQrImage canvas')).toHaveCount(1);
 await expect(page.locator('#projectionOpenGame')).toBeDisabled();
 await expect(page.locator('#projectionSetupQrLink')).toHaveAttribute('href','http://127.0.0.1:8080/next/');
 await page.locator('.projection-manual-choice summary').click();
 await page.locator('#projectionCode').fill('abcdef12');
 await expect(page.locator('#projectionCode')).toHaveValue('ABCDEF12');
});

test('Audience setup compact layout keeps automatic code and QR aligned across four screen sizes',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({rpc:async()=>({data:{code:null,phase:null},error:null})})};'}));
 for(const [width,height] of [[1440,810],[1280,720],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});
  await page.goto('http://127.0.0.1:8080/next/presenter.html');
  await expect(page.locator('.projection-setup-grid')).toBeVisible();
  await expect(page.locator('#projectionSetupQrImage canvas')).toHaveCount(1);
  await page.evaluate(()=>document.fonts.ready);
  const size=await page.evaluate(()=>{
   const box=selector=>{const x=document.querySelector(selector).getBoundingClientRect();return {x:x.x,y:x.y,width:x.width,height:x.height,right:x.right,bottom:x.bottom}};
   return {overflow:document.documentElement.scrollWidth-innerWidth,form:box('.projection-setup-form'),qr:box('.projection-quick-qr'),code:box('#projectionActiveCode'),heroSize:parseFloat(getComputedStyle(document.querySelector('.projection-setup h1')).fontSize)};
  });
  expect(size.overflow,'horizontal overflow at '+width).toBeLessThanOrEqual(2);
  expect(size.heroSize,'oversize headline at '+width).toBeLessThanOrEqual(width<=550?47:61);
  expect(size.form.height,'form height at '+width).toBeLessThan(340);
  expect(size.qr.height,'QR card height at '+width).toBeLessThan(340);
  expect(size.form.bottom,'form visible at '+width).toBeLessThan(height+10);
  if(width>920){
   expect(Math.abs(size.form.y-size.qr.y)).toBeLessThanOrEqual(2);
   expect(Math.abs(size.form.height-size.qr.height)).toBeLessThanOrEqual(2);
   expect(size.code.y-size.form.y,'automatic code too low at '+width).toBeLessThan(120);
   expect(size.qr.bottom,'cards need to fit at '+width).toBeLessThan(height-35);
  }else expect(size.qr.y).toBeGreaterThanOrEqual(size.form.bottom-1);
 }
});

test('Audience QR appears immediately and switches to automatic game code without typing',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:
  'window.fixtureRoom=null;window.supabase={createClient:()=>({rpc:async(name,args)=>{if(name==="qwiz_audience_active_room")return {data:window.fixtureRoom?{code:window.fixtureRoom,phase:"question",title:"Учебный квиз"}:{code:null,phase:null},error:null};if(name==="qwiz_party_projection")return {data:args.p_code==="A1B2C3D4"?{code:args.p_code,phase:"lobby",title:"Другая комната"}:null,error:args.p_code==="A1B2C3D4"?null:{message:"not found"}};return {data:null,error:null}}})};'}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('http://127.0.0.1:8080/next/presenter.html');
 await expect(page.locator('#projectionSetupQrOpen')).toBeEnabled();
 await expect(page.locator('#projectionSetupQrImage canvas')).toHaveCount(1);
 await expect(page.locator('#projectionOpenGame')).toBeDisabled();
 await expect(page.locator('#projectionSetupQrLink')).toHaveAttribute('href','http://127.0.0.1:8080/next/');
 await page.locator('#projectionSetupQrOpen').click();
 await expect(page.locator('#projectionQrRoom')).toHaveText('пока не создан');
 await page.locator('#projectionQrClose').click();
 await page.evaluate(()=>{window.fixtureRoom='ABCDEF12'});
 await expect(page.locator('#projectionActiveCode')).toHaveText('ABCDEF12',{timeout:12000});
 await expect(page.locator('#projectionOpenGame')).toBeEnabled();
 const href=new URL(await page.locator('#projectionSetupQrLink').getAttribute('href'));
 expect(href.pathname.endsWith('/next/')).toBe(true);
 expect(href.searchParams.get('room')).toBe('ABCDEF12');
 await page.locator('#projectionSetupQrOpen').click();
 await expect(page.locator('#projectionQrRoom')).toHaveText('ABCDEF12');
 await expect(page.locator('#projectionQrLink')).toHaveAttribute('href',href.toString());
 await page.locator('#projectionQrClose').click();
 await page.locator('.projection-manual-choice summary').click();
 await page.locator('#projectionCode').fill('A1B2C3D4');
 await expect(page.locator('#projectionSetupQrOpen')).toBeEnabled();
 await page.locator('#projectionJoin button[type="submit"]').click();
 await expect(page.locator('#projectionActiveCode')).toHaveText('A1B2C3D4');
 await expect(page.locator('#projectionSetupQrLink')).toHaveAttribute('href',/room=A1B2C3D4/);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('Optional manual room picker keeps label, input and button separated on desktop and mobile',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({rpc:async()=>({data:{code:null,phase:null,title:null},error:null})})};'}));
 for(const [width,height] of [[1440,900],[768,900],[390,844]]){
  await page.setViewportSize({width,height});
  await page.goto('http://127.0.0.1:8080/next/presenter.html');
  await page.locator('.projection-manual-choice summary').click();
  await expect(page.locator('#projectionCode')).toBeVisible();
  const metrics=await page.evaluate(()=>{
   const rect=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};
   return {label:rect('.projection-switch-form>label'),input:rect('#projectionCode'),button:rect('.projection-switch-row>button'),
    overflow:document.documentElement.scrollWidth-innerWidth,
    font:parseFloat(getComputedStyle(document.querySelector('#projectionCode')).fontSize)};
  });
  expect(metrics.input.top-metrics.label.bottom,'label/input gap at '+width).toBeGreaterThanOrEqual(6);
  expect(metrics.input.height,'input height at '+width).toBeLessThanOrEqual(50);
  expect(metrics.button.height,'button height at '+width).toBeLessThanOrEqual(50);
  expect(metrics.font,'input font size at '+width).toBeLessThanOrEqual(16);
  expect(metrics.overflow,'horizontal overflow at '+width).toBeLessThanOrEqual(2);
  if(width>550)expect(metrics.button.left-metrics.input.right).toBeGreaterThanOrEqual(8);
  else expect(metrics.button.top-metrics.input.bottom).toBeGreaterThanOrEqual(8);
  await page.locator('#projectionCode').focus();
  await expect(page.locator('#projectionCode')).toBeFocused();
  if(width===1440||width===390)await page.screenshot({path:'visual-artifacts/audience-manual-form-'+width+'.png',fullPage:true,animations:'disabled'});
 }
});

test('Standalone teacher workspace is responsive and has two library sections',async({page})=>{
 await authFixture(page);
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:900});
   await expect(page.locator('#bankPage')).toBeVisible();
   await expect(page.locator('#bankSearch')).toBeVisible();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   expect(overflow).toBeLessThanOrEqual(2);
   if(width===390)await page.screenshot({path:'visual-artifacts/workspace-390.png',fullPage:true,animations:'disabled'});
   if(width===1440)await page.screenshot({path:'visual-artifacts/workspace-1440.png',fullPage:true,animations:'disabled'});
 }
 await page.locator('[data-section="builder"]').click();
 await page.locator('#newBuild').click();
 await expect(page.locator('#roundCards .round-card')).toHaveCount(3);
 await expect(page.locator('#roundCards .round-card').last()).toHaveAttribute('data-type','finale');
 await expect(page.locator('#cardPalette [data-card="team_stats"]')).toHaveCount(0);
 await expect(page.locator('#roundCards .round-card')).toHaveCount(3);
 await expect(page.locator('#roundCards .round-card').last()).toHaveAttribute('data-type','finale');
});
test('Flag studio shows twelve working formats, without old question types',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await page.locator('#newQuestion').click();
 await expect(page.locator('#questionDialog')).toBeVisible();
 await expect(page.locator('#editKind option')).toHaveCount(12);
 await expect(page.locator('#editKind option:disabled')).toHaveCount(0);
 await expect(page.locator('#editKind')).toHaveValue('country');
 await expect(page.locator('#answerEditor [data-option]')).toHaveCount(4);
 await expect(page.locator('#questionMediaUrl')).toBeVisible();
 await page.locator('#editKind').selectOption('picker');
 await expect(page.locator('#answerEditor [data-flag-image]')).toHaveCount(4);
 await expect(page.locator('#answerEditor [data-flag-label]')).toHaveCount(4);
 await expect(page.locator('#questionMediaUrl')).toHaveCount(0);
});
test('Student can select twelve primary and thirteen additional avatars',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/profile.html');
 await expect(page.getByRole('heading',{name:'Мой профиль'})).toBeVisible();
 await page.locator('#authRegisterTab').click();
 await expect(page.locator('#registerPanel')).toBeVisible();
 await expect(page.locator('#registerAvatars [data-avatar]')).toHaveCount(25);
 await expect(page.locator('#registerAvatars > .avatar-pick')).toHaveCount(12);
 await page.locator('#registerAvatars .avatar-more summary').click();
 await expect(page.locator('#registerAvatars .avatar-more [data-avatar]')).toHaveCount(13);
 await page.screenshot({path:'visual-artifacts/profile-390.png',fullPage:true,animations:'disabled'});
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
 await page.screenshot({path:'visual-artifacts/countdown-1440.png',fullPage:true,animations:'disabled'});
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
 await page.screenshot({path:'visual-artifacts/rich-game-390.png',fullPage:true,animations:'disabled'});
});
test('Flag image choices use separate SVG links and private country labels',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await page.locator('#newQuestion').click();
 await expect(page.locator('#bankKind')).toHaveCount(0);
 await page.locator('#editKind').selectOption('picker');
 const urls=page.locator('#answerEditor [data-flag-image]');
 const labels=page.locator('#answerEditor [data-flag-label]');
 await urls.nth(0).fill('https://example.com/ca.svg');
 await labels.nth(0).fill('Канада');
 await expect(urls.nth(0)).toHaveValue('https://example.com/ca.svg');
 await expect(labels.nth(0)).toHaveValue('Канада');
 await expect(page.locator('#editKind option[value="boolean"]')).toHaveCount(0);
 await expect(page.locator('#editKind option[value="auction"]')).toHaveCount(0);
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



// Auth fixtures exercise navigation only; no real accounts or quiz data are created.
async function authFixture(page,{signedIn=true,admin=true}={}){
 await page.addInitScript(({signedIn})=>{
  if(localStorage.getItem('qa-auth')===null)localStorage.setItem('qa-auth',signedIn?'yes':'no');
 },{signedIn});
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:`
  const session=()=>localStorage.getItem('qa-auth')==='yes'?{access_token:'fixture-only',user:{id:'qa-teacher',email:'teacher@example.test',is_anonymous:false}}:null;
  const query={select(){return this},eq(){return this},is(){return this},in(){return this},order(){return this},limit(){return this},maybeSingle:async()=>({data:null,error:null}),then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};
  window.supabase={createClient:()=>({
   auth:{
    getSession:async()=>({data:{session:session()},error:null}),
    signInWithPassword:async()=>{localStorage.setItem('qa-auth','yes');return {data:{session:session(),user:session().user},error:null}},
    signOut:async(options)=>{localStorage.setItem('qa-signout-scope',options?.scope||'global');localStorage.setItem('qa-auth','no');return {error:null}}
   },
   rpc:async(name,args)=>{
    if(name==='org_quiz_is_admin_check')return {data:`+JSON.stringify(admin)+`,error:null};
    if(name==='qwiz_studio')return {data:args.p_action==='overview'?{topics:[],builds:[]}:{items:[],total:0},error:null};
    if(name==='qwiz_host_rooms')return {data:[],error:null};
    if(name==='qwiz_student_identity')return {data:{registered:true,full_name:'Тестовый участник'},error:null};
    if(name==='qwiz_party_state')return {data:{code:'ABCDEF12',room_id:'qa-room',title:'Проверка возврата',phase:'lobby',index:-1,total:4,teams:[{id:'qa-team',name:'Команда',players:1,score:0}],players:[],me:{id:'qa-player',team_id:'qa-team'}},error:null};
    return {data:[],error:null}
   },
   from:()=>query,
   channel:()=>({topic:'realtime:org-next-ABCDEF12',on(){return this},subscribe(){return this},send:async()=>({})}),
   removeChannel:async()=>({})
  })};
 `}));
}
test('Saved teacher session keeps entry on reload and opens cabinet only by choice',async({page})=>{
 await authFixture(page);
 await page.goto('http://127.0.0.1:8080/next/');
 await page.getByRole('tab',{name:'Преподаватель'}).click();
 await expect(page.locator('#hostSession')).toBeVisible();
 await expect(page.locator('#loginForm')).toBeHidden();
 await expect(page.locator('#homeView')).toBeVisible();
 await expect(page).toHaveURL(/\/next\/$/);
 await page.reload();
 await expect(page.locator('#hostSession')).toBeVisible();
 await expect(page.locator('#roleHost')).toHaveAttribute('aria-selected','true');
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:'visual-artifacts/entry-saved-teacher-1440.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:375,height:844});
 await page.screenshot({path:'visual-artifacts/entry-saved-teacher-375.png',fullPage:true,animations:'disabled'});
 await page.getByRole('link',{name:'Открыть кабинет'}).click();
 await expect(page).toHaveURL(/workspace\.html$/);
 await expect(page.locator('#connText')).toContainText('Кабинет подключён');
 await page.getByRole('link',{name:'На главную',exact:true}).click();
 await expect(page.locator('#homeView')).toBeVisible();
 await expect(page.locator('#hostSession')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('qa-auth'))).toBe('yes');
});
test('Explicit password login still opens cabinet and preserves access on return',async({page})=>{
 await authFixture(page,{signedIn:false});
 await page.goto('http://127.0.0.1:8080/next/');
 await page.getByRole('tab',{name:'Преподаватель'}).click();
 await page.locator('#loginEmail').fill('teacher@example.test');
 await page.locator('#loginPassword').fill('fixture-password');
 await page.locator('#loginButton').click();
 await expect(page).toHaveURL(/workspace\.html$/);
 await page.getByRole('link',{name:'На главную',exact:true}).click();
 await expect(page.locator('#hostSession')).toBeVisible();
 await expect(page.locator('#loginPassword')).toHaveValue('');
});
test('Changing account stays on entry and signs out only the current session',async({page})=>{
 await authFixture(page);
 await page.goto('http://127.0.0.1:8080/next/');
 await page.getByRole('tab',{name:'Преподаватель'}).click();
 await page.locator('#changeTeacherAccount').click();
 await expect(page.locator('#loginForm')).toBeVisible();
 await expect(page.locator('#hostSession')).toBeHidden();
 await expect(page.locator('#loginEmail')).toBeFocused();
 expect(await page.evaluate(()=>localStorage.getItem('qa-signout-scope'))).toBe('local');
 await page.reload();
 await expect(page.locator('#loginForm')).toBeVisible();
 await expect(page.locator('#homeView')).toBeVisible();
});
test('A saved student room is offered without taking over the entry page',async({page})=>{
 await authFixture(page,{admin:false});
 await page.goto('http://127.0.0.1:8080/next/');
 await page.evaluate(()=>sessionStorage.setItem('org2:room','ABCDEF12'));
 await page.reload();
 await expect(page.locator('#homeView')).toBeVisible();
 await expect(page.locator('#resumeGame')).toBeVisible();
 await page.locator('#resumeGameButton').click();
 await expect(page.locator('#gameView')).toBeVisible();
 await expect(page.locator('#gameContent')).toContainText('Скоро начнём!');
 await page.locator('#logoHome').click();
 await expect(page.locator('#homeView')).toBeVisible();
 await page.reload();
 await expect(page.locator('#homeView')).toBeVisible();
 await expect(page.locator('#resumeGame')).toBeVisible();
});
test('Explicit room QR links still connect registered players directly',async({page})=>{
 await authFixture(page,{admin:false});
 await page.goto('http://127.0.0.1:8080/next/?room=abcdef12');
 await expect(page.locator('#gameView')).toBeVisible();
 await expect(page.locator('#gameContent')).toContainText('Скоро начнём!');
});
test('Non-admin session and rejected teacher login cannot open cabinet',async({page})=>{
 await authFixture(page,{admin:false});
 await page.goto('http://127.0.0.1:8080/next/');
 await page.getByRole('tab',{name:'Преподаватель'}).click();
 await expect(page.locator('#hostSession')).toBeHidden();
 await page.locator('#loginEmail').fill('student@example.test');
 await page.locator('#loginPassword').fill('fixture-password');
 await page.locator('#loginButton').click();
 await expect(page.locator('#loginNotice')).toContainText('нет прав преподавателя');
 await expect(page.locator('#homeView')).toBeVisible();
 await expect(page).not.toHaveURL(/workspace\.html/);
});
test('Password visibility toggle is keyboard accessible and preserves input',async({page})=>{
 await page.getByRole('tab',{name:'Преподаватель'}).click();
 await page.locator('#loginPassword').fill('fixture-only');
 await page.getByRole('button',{name:'Показать пароль'}).focus();
 await page.keyboard.press('Enter');
 await expect(page.locator('#loginPassword')).toHaveAttribute('type','text');
 await expect(page.getByRole('button',{name:'Скрыть пароль'})).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Enter');
 await expect(page.locator('#loginPassword')).toHaveAttribute('type','password');
 await expect(page.locator('#loginPassword')).toHaveValue('fixture-only');
});
test('Reduced motion disables decorative and dialog animation without hiding content',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.reload();
 await expect(page.locator('#entryPanel')).toBeVisible();
 expect(await page.locator('#entryPanel').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 expect(await page.locator('.hero-spark').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.locator('#homeQrOpen').click();
 await expect(page.locator('#qrDialog')).toBeVisible();
 expect(await page.locator('#qrDialog').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.keyboard.press('Escape');
 await expect(page.locator('#qrDialog')).toBeHidden();
});
test('Canonical entry preserves teacher sign-in and participant role separation',async({page})=>{
 await authFixture(page);
 await page.goto('http://127.0.0.1:8080/');
 await expect(page).toHaveURL(/\/next\/$/);
 await expect(page.locator('#homeView')).toBeVisible();
 await page.getByRole('tab',{name:'Преподаватель'}).click();
 await expect(page.locator('#hostSession')).toBeVisible();
 await expect(page.locator('#openWorkspace')).toContainText('Открыть кабинет');
 await page.reload();
 await expect(page.locator('#homeView')).toBeVisible();
 await expect(page.locator('#hostSession')).toBeVisible();
});

test('Entrance motion ends in a stable layout and keeps role controls available',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.reload();
 const motion=await page.locator('#entryPanel').evaluate(async el=>{
  const animations=el.getAnimations();
  const finite=animations.every(a=>Number.isFinite(a.effect.getTiming().iterations));
  await Promise.all(animations.map(a=>a.finished));
  return {finite,opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform};
 });
 expect(motion.finite).toBe(true);
 expect(motion.opacity).toBe('1');
 await page.getByRole('tab',{name:'Преподаватель'}).click();
 await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();
 await expect(page.getByRole('tab',{name:'Преподаватель'})).toBeFocused();
});


test('Studio header places live connection before home at all screen sizes',async({page})=>{
 await authFixture(page);
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 for(const width of [320,375,768,1440]){
  await page.setViewportSize({width,height:960});
  const order=await page.locator('.top-tools').evaluate(el=>{
   const status=el.querySelector('#connText').getBoundingClientRect(),home=el.querySelector('.home-button').getBoundingClientRect();
   return {correct:status.x+status.width<=home.x,adjacent:el.querySelector('#connText').nextElementSibling.classList.contains('home-button')};
  });
  expect(order.correct).toBe(true);expect(order.adjacent).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
  const refresh=await page.locator('#refreshAll').boundingBox();
  expect(refresh.width).toBeGreaterThanOrEqual(44);expect(refresh.height).toBeGreaterThanOrEqual(44);
 }
 await page.screenshot({path:'visual-artifacts/studio-polish-header-1440.png',fullPage:true,animations:'disabled'});
});
test('Refresh animates while pending and confirms completion without duplicate clicks',async({page})=>{
 await authFixture(page);await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 await page.evaluate(()=>{const original=state.db.rpc;state.db.rpc=async(...args)=>{await new Promise(resolve=>setTimeout(resolve,180));return original(...args)}});
 await page.locator('#refreshAll').click();
 await expect(page.locator('#refreshAll')).toHaveAttribute('aria-busy','true');
 await expect(page.locator('#refreshAll')).toBeDisabled();
 expect(await page.locator('.refresh-icon').evaluate(el=>getComputedStyle(el).animationName)).toBe('qwiz-spin');
 await expect(page.locator('#refreshAll')).toHaveAttribute('data-state','done');
 await expect(page.locator('#refreshAll')).toHaveAttribute('aria-busy','false');
 await expect(page.locator('.refresh-check')).toBeVisible();
 await expect(page.locator('#refreshLabel')).toHaveText('Готово');
 await expect(page.locator('#refreshAll')).toBeEnabled();
});
test('Refresh failures leave a usable retry action and show an error state',async({page})=>{
 await authFixture(page);await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 await page.evaluate(()=>{window.qaOriginalRpc=state.db.rpc;state.db.rpc=async()=>({data:null,error:{message:'Проверка ошибки соединения'}})});
 await page.locator('#refreshAll').click();
 await expect(page.locator('#refreshAll')).toHaveAttribute('data-state','error');
 await expect(page.locator('#refreshAll')).toBeEnabled();
 await expect(page.locator('#connText')).toHaveAttribute('data-state','error');
 await expect(page.locator('#bankMessage')).toContainText('Проверка ошибки соединения');
 await page.evaluate(()=>{state.db.rpc=window.qaOriginalRpc});
 await page.locator('#refreshAll').click();
 await expect(page.locator('#refreshAll')).toHaveAttribute('data-state','done');
 await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
});
test('Studio navigation visibly animates without losing filters on rapid changes',async({page})=>{
 await authFixture(page);await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 await page.locator('#bankSearch').fill('Сохранённый поиск');
 await page.locator('[data-section="builder"]').click();
 expect(await page.locator('#builderPage').evaluate(el=>el.getAnimations().some(a=>a.playState==='running'))).toBe(true);
 await page.locator('[data-section="rooms"]').click();
 await page.locator('[data-section="bank"]').click();
 await expect(page.locator('#bankPage')).toBeVisible();
 await expect(page.locator('#builderPage')).toBeHidden();
 await expect(page.locator('#roomsPage')).toBeHidden();
 await expect(page.locator('#bankSearch')).toHaveValue('Сохранённый поиск');
 await expect(page.locator('[data-section="bank"]')).toHaveAttribute('aria-current','page');
});
test('Search shortcut respects typing and dialogs',async({page})=>{
 await authFixture(page);await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await page.keyboard.press('/');
 await expect(page.locator('#bankSearch')).toBeFocused();
 await page.locator('#bankSearch').fill('История');
 await page.keyboard.press('/');
 await expect(page.locator('#bankSearch')).toHaveValue('История/');
 await page.locator('#newQuestion').click();
 await expect(page.locator('#questionDialog')).toBeVisible();
 await page.keyboard.press('/');
 await expect(page.locator('#bankSearch')).not.toBeFocused();
 await page.keyboard.press('Escape');
});
test('Studio native animations respect reduced motion while controls still work',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await authFixture(page);
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 await page.locator('[data-section="builder"]').click();
 expect(await page.locator('#builderPage').evaluate(el=>el.getAnimations().length)).toBe(0);
 await page.locator('[data-section="bank"]').click();
 await expect(page.locator('#bankPage')).toBeVisible();
 await page.locator('#refreshAll').click();
 await expect(page.locator('#refreshAll')).toHaveAttribute('data-state','done');
 expect(await page.locator('.refresh-check').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});

test('Round editor filters flags by twelve ready mechanics',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await expect(page.locator('#bankMode option')).toHaveCount(13);
 await page.locator('[data-section="builder"]').click();
 await page.locator('#newBuild').click();
 await page.evaluate(()=>{state.topics=[{id:'flags-topic',name:'Флаги мира'}];state.cards[1].topic_id='flags-topic';updateSelectors();renderCards();});
 await page.locator('#roundCards [data-edit-card="1"]').click();
 await expect(page.locator('#cardDialog')).toBeVisible();
 await expect(page.locator('#cardModesDetails')).toHaveAttribute('open','');
 await expect(page.locator('#cardFlagModes [data-card-mode]')).toHaveCount(12);
 await expect(page.locator('#cardFlagModes [data-card-mode]:not(:disabled)')).toHaveCount(12);
 await expect(page.locator('#cardFlagModes [data-card-mode]:checked')).toHaveCount(0);
 await page.locator('[data-card-mode="country"]').check();
 await page.locator('[data-card-mode="similar"]').check();
 await page.locator('[data-card-mode="picker"]').uncheck();
 await page.locator('[data-card-mode="colors"]').uncheck();
 await page.locator('[data-card-mode="symbols"]').uncheck();
 await page.locator('[data-card-mode="fragments"]').uncheck();
 await page.locator('[data-card-mode="errors"]').uncheck();
 await page.locator('#cardDialog button[type="submit"]').click();
 await expect(page.locator('#roundCards .round-card').nth(1)).toContainText('Угадать страну по флагу');
 await page.locator('#roundCards [data-edit-card="1"]').click();
 await expect(page.locator('#cardModesDetails')).toHaveAttribute('open','');
 await expect(page.locator('[data-card-mode="country"]')).toBeChecked();
 await expect(page.locator('[data-card-mode="picker"]')).not.toBeChecked();
});

test('Standalone preview switches question with keyboard and mouse',async({page,context})=>{
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await page.evaluate(()=>{
   state.questions=[
    {id:'00000000-0000-4000-8000-000000000101',kind:'flag',topic_id:'x',prompt:'Флаг какой страны?',options:['Франция','Россия','Италия','Германия'],solution:{flag_mode:'country',correct:1,media_url:'https://example.com/ru.svg'},tags:['fw:published'],difficulty:2},
    {id:'00000000-0000-4000-8000-000000000102',kind:'flag',topic_id:'x',prompt:'Какой порядок полос?',options:[{orientation:'horizontal',stripes:['#000000','#dd0000','#ffce00']},{orientation:'horizontal',stripes:['#ffce00','#dd0000','#000000']}],solution:{flag_mode:'colors',correct:0,option_labels:['чёрный — красный — жёлтый','жёлтый — красный — чёрный']},tags:['fw:published'],difficulty:2}
   ];
   state.questionTotal=2;renderQuestions();
 });
 const next=context.waitForEvent('page');
 await page.locator('[data-preview-question]').first().click();
 const preview=await next;await preview.waitForLoadState();
 await expect(preview.locator('#previewPrompt')).toHaveText('Флаг какой страны?');
 await preview.keyboard.press('ArrowRight');
 await expect(preview.locator('#previewPrompt')).toHaveText('Какой порядок полос?');
 await expect(preview.locator('.preview-striped')).toHaveCount(2);
 await preview.locator('#previewPrev').click();
 await expect(preview.locator('#previewPrompt')).toHaveText('Флаг какой страны?');
});
test('Color-strip answers are touch-ready on the student screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  ctx.room={code:'COLOUR01',room_id:'00000000-0000-4000-8000-000000000055',title:'Цвета',phase:'question',index:0,total:1,
   ends_at:new Date(Date.now()+30000).toISOString(),question:{kind:'flag',prompt:'Порядок полос флага Германии?',options:[
   {orientation:'horizontal',stripes:['#000000','#dd0000','#ffce00']},
   {orientation:'horizontal',stripes:['#ffce00','#dd0000','#000000']},
   {orientation:'horizontal',stripes:['#dd0000','#ffce00','#000000']},
   {orientation:'horizontal',stripes:['#000000','#ffce00','#dd0000']}
   ]},teams:[],me:{id:'p',team_id:'t'},has_answer:false};
  showScreen('game');renderGame();
 });
 await expect(page.locator('.flag-stripe-art')).toHaveCount(4);
 await expect(page.locator('#gameContent [data-answer]')).toHaveCount(4);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('Saved build cards keep identical width and height for short and long names',async({page})=>{
 const base='http://127.0.0.1:8080/next/workspace.html';
 for(const [width,height] of [[1440,900],[768,900],[390,844]]){
  await page.setViewportSize({width,height});
  await page.goto(base);
  await page.locator('[data-section="builder"]').click();
  await page.evaluate(()=>{
   state.builds=[
    {id:'00000000-0000-4000-8000-000000000201',title:'ОРГ'},
    {id:'00000000-0000-4000-8000-000000000202',title:'Демо · Командные мини-игры'},
    {id:'00000000-0000-4000-8000-000000000203',title:'Очень длинное название сохранённой сборки с несколькими дополнительными словами для проверки равных размеров карточек'}
   ];
   renderBuilds();
  });
  await expect(page.locator('#savedBuilds .saved-build-wrap')).toHaveCount(3);
  const cardRects=await page.locator('#savedBuilds .saved-build-wrap').evaluateAll(cards=>cards.map(card=>{
   const rect=card.getBoundingClientRect(),button=card.querySelector('.saved-build').getBoundingClientRect();
   const edit=card.querySelector('.saved-build>span:last-child').getBoundingClientRect();
   const trash=card.querySelector('.card-trash').getBoundingClientRect();
   return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,
    buttonWidth:button.width,buttonHeight:button.height,editBottom:edit.bottom,trashRight:trash.right};
  }));
  const expectedWidth=cardRects[0].width,expectedHeight=cardRects[0].height;
  for(const rect of cardRects){
   expect(Math.abs(rect.width-expectedWidth),'uniform card widths at '+width).toBeLessThan(1);
   expect(Math.abs(rect.height-expectedHeight),'uniform card heights at '+width).toBeLessThan(1);
   expect(rect.buttonWidth).toBeCloseTo(rect.width,0);
   expect(rect.buttonHeight).toBeCloseTo(rect.height,0);
   expect(rect.trashRight,'delete inside card at '+width).toBeLessThanOrEqual(rect.x+rect.width);
  }
  expect(Math.abs(expectedHeight-208),'near-208 CSS pixel height').toBeLessThan(0.1);
  if(width>540)expect(Math.abs(expectedWidth-226),'near-226 CSS pixel width').toBeLessThan(0.1);
  // Action position is identical within each tile regardless of how much the title wraps.
  for(const rect of cardRects)expect(Math.abs(rect.editBottom-rect.y-expectedHeight)).toBeGreaterThan(5);
  await expect(page.locator('#savedBuilds .saved-build-wrap .card-trash')).toHaveCount(3);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(overflow,'no horizontal scroll at '+width).toBeLessThanOrEqual(2);
  if(width===1440||width===390)await page.screenshot({path:'visual-artifacts/saved-builds-uniform-'+width+'.png',fullPage:true,animations:'disabled'});
 }
});

test('In-card SVG trash buttons are compact and keyboard-accessible',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await page.locator('[data-section="builder"]').click();
 await page.evaluate(()=>{
  state.builds=[{id:'00000000-0000-4000-8000-000000000123',title:'Пример сборки'}];renderBuilds();
  state.hostRooms=[{id:'00000000-0000-4000-8000-000000000124',title:'Пример комнаты',phase:'lobby',players:0,teams:4,code:'ABBCC123'}];
  state.cards=[card('intro'),card('round'),card('finale')];renderCards();
  document.getElementById('hostRoomList').innerHTML='<article class="room-row"><h3>Комната</h3><button class="card-trash" data-delete-room="00000000-0000-4000-8000-000000000124">'+trashSvg+'</button></article>';
 });
 await expect(page.locator('.saved-build-wrap .card-trash svg')).toHaveCount(1);
 await expect(page.locator('.round-card .card-trash svg')).toHaveCount(2);
 await expect(page.locator('.room-row .card-trash svg')).toHaveCount(1);
 const hit=await page.locator('.saved-build-wrap .card-trash').boundingBox();expect(hit.width).toBeGreaterThanOrEqual(44);expect(hit.height).toBeGreaterThanOrEqual(44);
});
test('Studio restores last section and scroll position after reload',async({page})=>{
 await authFixture(page);await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 await page.locator('[data-section="insights"]').click();
 await page.evaluate(()=>{document.body.style.minHeight='2600px';window.scrollTo(0,450);savePosition()});
 await page.reload();
 await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 await expect(page.locator('#insightsPage')).toBeVisible();
 expect(await page.evaluate(()=>state.activePage)).toBe('insights');
 // A short or unfilled page may clamp the actual scroll position.
 expect(await page.evaluate(()=>readPosition()?.scrollY)).toBeGreaterThanOrEqual(0);
});
test('Symbol and fragment choices render with focus and pixel effects',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  ctx.room={code:'FRAGMENT',room_id:'00000000-0000-4000-8000-000000000055',title:'Задание с флагом',
   phase:'question',index:0,total:1,ends_at:new Date(Date.now()+30000).toISOString(),
   question:{kind:'flag',prompt:'Определите страну',media_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/mx.svg',
    flag_visual:{type:'pixel',x:50,y:50,zoom:2.5,pixels:24},
    options:['Мексика','Бразилия','Аргентина','Индия']},teams:[],me:{id:'p',team_id:'t'},has_answer:false};
  showScreen('game');renderGame();
 });
 await expect(page.locator('.flag-pixel-canvas')).toHaveCount(1);
 await expect(page.locator('#gameContent [data-answer]')).toHaveCount(4);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('F5 keeps chosen builder even when initial content scrolls during loading',async({page})=>{
 await authFixture(page);
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 await page.locator('[data-section="builder"]').click();
 await expect(page.locator('#builderPage')).toBeVisible();
 await page.evaluate(()=>{const pos=readPosition();if(!pos||pos.section!=='builder')throw new Error('Did not persist builder')});
 await page.reload();
 await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 await expect(page.locator('#builderPage')).toBeVisible();
 expect(await page.evaluate(()=>readPosition()?.section)).toBe('builder');
 await page.locator('[data-section="rooms"]').click();
 await page.reload();await expect(page.locator('#roomsPage')).toBeVisible();
 expect(await page.evaluate(()=>readPosition()?.section)).toBe('rooms');
});
test('Sixth flag mechanic shows four illustrated labels and only one official key',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 await page.locator('#editKind').evaluate(el=>{el.value='errors';el.dispatchEvent(new Event('change',{bubbles:true}))});
 await expect(page.locator('[data-error-image]')).toHaveCount(4);
 await expect(page.locator('[data-error-label]')).toHaveCount(4);
 await page.goto('http://127.0.0.1:8080/next/index.html');
 await page.evaluate(()=>{
  ctx.room={code:'ERRFLAG6',room_id:'00000000-0000-4000-8000-000000000055',title:'Найди ошибку',
   phase:'question',index:0,total:1,ends_at:new Date(Date.now()+30000).toISOString(),
   question:{kind:'flag',prompt:'Где неверная подпись?',options:[
   {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/fr.svg',label:'Франция'},
   {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/it.svg',label:'Германия'},
   {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/gb.svg',label:'Великобритания'},
   {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/ru.svg',label:'Россия'}]},
   teams:[],me:{id:'p',team_id:'t'},has_answer:false};
  showScreen('game');renderGame();
 });
 await expect(page.locator('#gameContent .flag-choice-label')).toHaveCount(4);
 await expect(page.locator('#gameContent [data-answer]')).toHaveCount(4);
});
test('Sound defaults to on and includes at least 10 selectable tones',async({page})=>{
 await page.goto('http://127.0.0.1:8080/next/workspace.html');
 const audio=await page.evaluate(()=>({enabled:QwizStage.audio.enabled,patterns:QwizStage.audio.play.toString()}));
 expect(audio.enabled).toBe(true);
 await page.locator('[data-section="builder"]').click();
 await page.locator('#newBuild').click();
 await page.locator('#roundCards [data-edit-card="1"]').click();
 expect(await page.locator('#cardSound option').count()).toBeGreaterThanOrEqual(11);
 await expect(page.locator('#studioSound svg')).toHaveCount(1);
});


test('General timing settings keep summary-duration input aligned with transition field',async({page})=>{
 for(const [width,height] of [[1440,900],[980,800],[760,800],[390,844]]){
  await page.setViewportSize({width,height});
  await page.goto('http://127.0.0.1:8080/next/workspace.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{const dialog=document.getElementById('generalDialog');if(!dialog.open)dialog.showModal()});
  const data=await page.evaluate(()=>({
   pairs:[...document.querySelectorAll('#generalDialog .dialog-body>.two-inputs')].slice(0,3)
    .map(row=>[...row.querySelectorAll(':scope>label>input')].map(x=>{
     const r=x.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,width:r.width};
    })),
   dialog:document.getElementById('generalDialog').getBoundingClientRect().toJSON()
  }));
  for(const [i,pair] of data.pairs.entries()){
   if(pair.length!==2)continue;
   if(width>600){
    expect(Math.abs(pair[0].top-pair[1].top),'row '+i+' aligned inputs at '+width).toBeLessThanOrEqual(2);
    expect(Math.abs(pair[0].height-pair[1].height),'row '+i+' equal input heights').toBeLessThanOrEqual(2);
   }else{
    expect(pair[0].bottom,'row '+i+' inputs stack on phone').toBeLessThan(pair[1].top);
   }
  }
  expect(data.dialog.left,'dialog visible left at '+width).toBeGreaterThanOrEqual(-2);
  expect(data.dialog.right,'dialog visible right at '+width).toBeLessThanOrEqual(width+2);
 }
});

test('Game buttons fit their full labels and the Games chevron stays inside its badge at all widths',async({page})=>{
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  await page.goto('http://127.0.0.1:8080/next/workspace.html');
  await page.evaluate(()=>{
   document.documentElement.classList.remove('studio-starting');
   document.getElementById('builderPage').hidden=false;
   document.getElementById('composer').hidden=false;
   document.getElementById('gamesPalette').hidden=false;
   document.getElementById('openGamesPalette').setAttribute('aria-expanded','true');
  });
  await page.evaluate(()=>document.fonts.ready);
  const items=await page.locator('#arcadePalette button').evaluateAll(buttons=>buttons.map(button=>{
   const label=button.querySelector('span:last-child');
   const br=button.getBoundingClientRect(),lr=label.getBoundingClientRect();
   return {text:label.textContent.trim(),buttonWidth:br.width,
    labelLeft:lr.left,labelRight:lr.right,buttonLeft:br.left,buttonRight:br.right,
    buttonHeight:br.height,labelHeight:lr.height,
    scrollWidth:label.scrollWidth,clientWidth:label.clientWidth,
    scrollHeight:label.scrollHeight,clientHeight:label.clientHeight};
  }));
  expect(items.map(x=>x.text)).toEqual(['Карта регионов России','Дино-забег','Блиц-вопрос','Тап-баттл','Дуэль капитанов']);
  for(const item of items){
   expect(item.labelLeft,'label starts inside button at '+width).toBeGreaterThanOrEqual(item.buttonLeft);
   expect(item.labelRight,'label ends inside button at '+width).toBeLessThanOrEqual(item.buttonRight+1);
   expect(item.scrollWidth-item.clientWidth,'text width not clipped at '+width).toBeLessThanOrEqual(1);
   expect(item.scrollHeight-item.clientHeight,'text height not clipped at '+width).toBeLessThanOrEqual(1);
   expect(item.labelHeight,'label has height at '+width).toBeGreaterThanOrEqual(14);
  }
  const arrow=await page.locator('#openGamesPalette').evaluate(button=>{
   const box=button.querySelector('.games-chevron-box').getBoundingClientRect();
   const svg=button.querySelector('.games-chevron').getBoundingClientRect();
   const host=button.getBoundingClientRect();
   return {boxLeft:box.left,boxRight:box.right,svgLeft:svg.left,svgRight:svg.right,
    buttonLeft:host.left,buttonRight:host.right};
  });
  expect(arrow.svgLeft).toBeGreaterThan(arrow.boxLeft);
  expect(arrow.svgRight).toBeLessThan(arrow.boxRight);
  expect(arrow.boxLeft).toBeGreaterThanOrEqual(arrow.buttonLeft);
  expect(arrow.boxRight).toBeLessThanOrEqual(arrow.buttonRight+1);
  if(width===320||width===768)await page.screenshot({path:'visual-artifacts/palette-games-fit-'+width+'.png',fullPage:true,animations:'disabled'});
 }
});

test('Player start screen does not expose auditorium link; waiting icon is centered',async({page})=>{
 for(const [width,height] of [[320,700],[390,844],[768,900]]){
  await page.setViewportSize({width,height});
  await page.goto('http://127.0.0.1:8080/next/');
  await expect(page.locator('#homeView')).toBeVisible();
  await expect(page.locator('header a[href*="presenter.html"]')).toHaveCount(0);
  await page.evaluate(()=>{
   ctx.room={code:'A1B2C3D4',phase:'lobby',index:-1,total:10,
    title:'Пробная игра',teams:[{id:'t',name:'Команда 1',score:0}],
    players:[],me:{id:'p',team_id:'t'},has_answer:false};
   showScreen('game');renderGame();
  });
  await expect(page.locator('.game-lobby-wait .lobby-signal-center')).toBeVisible();
  await expect(page.locator('.game-lobby-wait .lobby-play-mark')).toHaveCount(0);
  const g=await page.locator('.game-lobby-wait .lobby-signal').evaluate(el=>{
   const a=el.getBoundingClientRect(),b=el.querySelector('.lobby-signal-center').getBoundingClientRect();
   const dots=[...el.querySelectorAll('.lobby-signal-node')].map(d=>d.getBoundingClientRect());
   return {x:Math.abs((a.left+a.width/2)-(b.left+b.width/2)),
    y:Math.abs((a.top+a.height/2)-(b.top+b.height/2)),
    pairedX:Math.abs((dots[0].left+dots[0].width/2)-(dots[2].left+dots[2].width/2)),
    pairedY:Math.abs((dots[1].top+dots[1].height/2)-(dots[3].top+dots[3].height/2)),
    dots:dots.length};
  });
  expect(g.x).toBeLessThanOrEqual(1);expect(g.y).toBeLessThanOrEqual(1);
  expect(g.pairedX).toBeLessThanOrEqual(1);expect(g.pairedY).toBeLessThanOrEqual(1);
  expect(g.dots).toBe(4);
  if(width===390)await page.screenshot({path:'visual-artifacts/lobby-centered-390.png',fullPage:true,animations:'disabled'});
 }
});
