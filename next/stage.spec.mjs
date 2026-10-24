import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:8080/next/';
const names=['Несгибаемые','Космические','Невесомые','Искристые','Парадоксальные','Безмятежные','Сверхзвуковые','Непредсказуемые','Бархатные','Лучезарные','Молниеносные','Таинственные','Неукротимые','Зазеркальные','Фантастические'];
const teams=()=>names.map((name,i)=>({id:'team-'+i,name,position:i+1,rank:i+1,members:5,answered:i%6,score:500-i*20,mean_seconds:8+i/2,speed_delta:i===0?null:i%2?12.5:-6.7}));
const players=()=>Array.from({length:40},(_,i)=>({nickname:'Участник '+(i+1),position:i+1,score:600-Math.floor(i/3)*100,correct:6-Math.floor(i/8),latest_seconds:4+i/10}));
const stats=()=>Array.from({length:8},(_,i)=>({index:i,prompt:['Какая планета ближе всего к Солнцу?','В каком году появился первый спутник?','Как устроена коралловая экосистема?','Почему небо голубое?','Какое животное быстрее всех?','Кто написал «Мастер и Маргарита»?','Как называется этот архитектурный стиль?','Какой элемент обозначается Fe?'][i],participants:40,answered:40,correct:40-i*5,incorrect:i*5,unanswered:0,correct_rate:100-i*12.5,incorrect_rate:i*12.5}));
const state=(phase='question')=>({code:'ABCDEF12',title:'Время удивляться',phase,index:1,total:8,duration:phase==='result'?10:30,ends_at:new Date(Date.now()+(phase==='result'?10000:30000)).toISOString(),question:{kind:'single',prompt:'Какая планета Солнечной системы ближе всего к Солнцу?',options:['Венера','Меркурий','Марс','Земля'],topic:'Удивительная Вселенная'},answer:phase==='result'?{text:'Меркурий',explanation:'Самая близкая к Солнцу планета и самая маленькая в Солнечной системе.'}:null,teams:teams(),players:phase==='question'?[]:players(),question_stats:phase==='finished'?stats():[]});
async function projector(page,data){
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.fixture='+JSON.stringify(data)+';window.supabase={createClient:()=>({rpc:async()=>({data:window.fixture,error:null}),channel:()=>({on(){return this},subscribe(){return this}})})};'}));
 await page.goto(base+'presenter.html?room=ABCDEF12');
}
async function workspace(page){
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:
 'window.savedBuild=null;window.actions=[];window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:"host"}}}}),signOut:async()=>({})},rpc:async(name,args)=>{window.actions.push([name,args]);if(name==="org_quiz_is_admin_check")return {data:true};if(name==="qwiz_studio"&&args.p_action==="overview")return {data:{topics:[],builds:[],total_questions:0}};if(name==="qwiz_studio"&&args.p_action==="questions")return {data:{items:[],total:0}};if(name==="qwiz_studio"&&args.p_action==="build_save"){window.savedBuild=args.p_input;return {data:{id:"saved"}}}if(name==="qwiz_host_rooms")return {data:[]};if(name==="qwiz_party_state")return {data:window.fixture};if(name==="qwiz_party_control"){window.fixture={...window.fixture,phase:window.fixture.phase==="question"?"result":"question",ends_at:new Date(Date.now()+10000).toISOString()};return {data:window.fixture.phase}}return {data:{items:[],total:0}}},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}})};'}));
 await page.goto(base+'workspace.html');await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
}
test('Question screen remains readable without leaking team standings or fallback decorations',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await projector(page,state());
 await expect(page.locator('.projection-question-only h1')).toContainText('Какая планета');
 await expect(page.locator('.projection-question-instruction')).toContainText('Варианты ответа доступны');
 await expect(page.locator('.habitat-team')).toHaveCount(0);
 await expect(page.locator('.question-frame')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
test('Aggregate answer count refreshes without replacing the question',async({page})=>{
 const s=state();s.teams[0].answered=0;await projector(page,s);
 await expect(page.locator('#teamAnswerCount')).toContainText('0 ответов');
 await page.evaluate(()=>window.questionHeading=document.querySelector('.projection-question-only h1'));
 await page.evaluate(()=>{window.fixture.teams[0].answered=1;render(window.fixture)});
 await expect(page.locator('#teamAnswerCount')).toContainText('1 ответов');
 await page.evaluate(()=>{window.fixture.teams[0].answered=5;render(window.fixture)});
 await expect(page.locator('#teamAnswerCount')).toContainText('5 ответов');
 expect(await page.evaluate(()=>window.questionHeading===document.querySelector('.projection-question-only h1'))).toBe(true);
});
test('Numeric absolute timer and time bar decrease together',async({page})=>{
 await page.clock.install();await projector(page,state());const before=Number(await page.locator('#stageTimer').textContent()),transform=await page.locator('.clock-track>span').evaluate(el=>getComputedStyle(el).transform);
 await page.clock.fastForward(3200);expect(Number(await page.locator('#stageTimer').textContent())).toBeLessThan(before);
 await expect.poll(()=>page.locator('.clock-track>span').evaluate(el=>getComputedStyle(el).transform)).not.toBe(transform);
});
test('Ten warning ticks and distinct expiry sound do not repeat on clock refresh',async({page})=>{
 await projector(page,state());const cues=await page.evaluate(()=>{const heard=[];QwizStage.audio.play=kind=>heard.push(kind);for(let n=10;n>=0;n--){const s={code:'test',index:2,phase:'question',duration:30,ends_at:new Date(Date.now()+n*1000).toISOString()};QwizStage.updateClock(s);QwizStage.updateClock(s)}return heard});
 expect(cues.filter(x=>x==='tick')).toHaveLength(10);expect(cues.filter(x=>x==='timeup')).toHaveLength(1);
});
test('Public projector keeps sound controls private but obeys moderator audio settings',async({page})=>{
 await projector(page,state());
 await expect(page.locator('#projectionSound')).toBeHidden();
 await page.evaluate(()=>{
  render({...window.fixture,screen_settings:{sound_enabled:false,volume:20,music_enabled:false}});
 });
 expect(await page.evaluate(()=>QwizStage.audio.enabled)).toBe(false);
 expect(await page.evaluate(()=>QwizStage.audio.volume)).toBe(.2);
 await page.evaluate(()=>render({...window.fixture,screen_settings:{sound_enabled:true,volume:60,music_enabled:false}}));
 expect(await page.evaluate(()=>QwizStage.audio.enabled)).toBe(true);
 expect(await page.evaluate(()=>QwizStage.audio.volume)).toBe(.6);
});
test('Server result reveals exactly one correct answer without a duplicated choice grid',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await projector(page,state('result'));
 await expect(page.locator('.projection-answer-reveal')).toBeVisible();
 await expect(page.locator('.projection-answer-single')).toHaveCount(1);
 await expect(page.locator('.projection-answer-text')).toHaveText('Меркурий');
 await expect(page.locator('.projection-reveal-option')).toHaveCount(0);
 await expect(page.locator('.habitat-team')).toHaveCount(0);
 const box=await page.locator('.projection-answer-reveal').boundingBox();
 expect(box).not.toBeNull();expect(box.y+box.height).toBeLessThanOrEqual(1000);
});
test('Question expiry reveals the answer and advances to the next server question',async({page})=>{
 await page.clock.install();const s=state();s.ends_at=new Date(Date.now()+1100).toISOString();await projector(page,s);
 await page.evaluate(()=>{ctx.client.rpc=async()=>{if(window.fixture.phase==='question'&&Date.now()>=Date.parse(window.fixture.ends_at))window.fixture={...window.fixture,phase:'result',duration:5,answer:{text:'Меркурий'},ends_at:new Date(Date.now()+5000).toISOString()};else if(window.fixture.phase==='result'&&Date.now()>=Date.parse(window.fixture.ends_at))window.fixture={...window.fixture,phase:'question',index:2,answer:null,ends_at:new Date(Date.now()+30000).toISOString()};return {data:window.fixture}}});
 await page.clock.fastForward(1700);await expect(page.locator('.projection-answer-text')).toHaveText('Меркурий');
 await page.clock.fastForward(5600);await expect(page.locator('.question-step')).toContainText('Вопрос 3');
 await expect(page.locator('.projection-answer-reveal')).toHaveCount(0);
});
test('Finale shows fifteen teams, forty people, three best and three most-missed questions',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await projector(page,state('finished'));await expect(page.locator('.habitat-team')).toHaveCount(15);await expect(page.locator('.player-leaderboard li')).toHaveCount(40);
 for(const section of [0,1])await expect(page.locator('.question-insights section').nth(section).locator('li')).toHaveCount(3);
 await page.locator('.all-question-stats summary').click();await expect(page.locator('.all-question-stats li')).toHaveCount(8);await page.screenshot({path:'visual-artifacts/finale-stage-1440.png',fullPage:true,animations:'disabled'});
});
test('All phases fit phones, tablets and a full HD projector without horizontal scrolling',async({page})=>{
 for(const phase of ['question','result','finished'])for(const width of [320,390,768,1920]){await page.setViewportSize({width,height:1080});await projector(page,state(phase));expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);if(width===390)await page.screenshot({path:'visual-artifacts/'+phase+'-stage-390.png',fullPage:true,animations:'disabled'})}
});
test('Reduced motion keeps answer legible and disables decorative animation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await projector(page,state('result'));
 await expect(page.locator('.projection-answer-text')).toBeVisible();
 expect(await page.locator('.projection-answer-reveal').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
test('Selecting a round is separate from opening settings with double-click or Shift+Enter',async({page})=>{
 await workspace(page);await page.locator('[data-section="builder"]').click();await page.locator('#newBuild').click();
 const card=page.locator('.round-card[data-type="round"]');
 await card.locator('h3').click();await expect(card).toHaveAttribute('aria-current','true');
 await expect(page.locator('#cardDialog')).not.toBeVisible();
 await card.locator('h3').dblclick();await expect(page.locator('#cardDialog')).toBeVisible();
 await expect(page.locator('#cardAnswerSeconds')).toHaveValue('10');
 await page.locator('#cardDialog [data-close]').first().click();
 await card.focus();await page.keyboard.press('Shift+Enter');await expect(page.locator('#cardDialog')).toBeVisible();
 await page.locator('#cardAnswerSeconds').fill('5');await page.locator('#cardForm button[type="submit"]').click();
 await expect(card.locator('.round-sub')).toContainText('ответ 5 сек.');
});
test('Bulk timing reaches all rounds and persists in the build payload',async({page})=>{
 await workspace(page);await page.locator('[data-section="builder"]').click();await page.locator('#newBuild').click();await page.locator('#appendRound').click();await page.locator('#generalSettings').click();await page.locator('#generalSeconds').fill('45');await page.locator('#generalAnswerSeconds').fill('30');await page.locator('#generalForm button[type="submit"]').click();
 await expect(page.locator('.round-card[data-type="round"] .round-sub')).toHaveText(['Тема не выбрана · Все доступные механики · 5 вопр. · 45 сек. · ответ 30 сек.','Тема не выбрана · Все доступные механики · 5 вопр. · 45 сек. · ответ 30 сек.']);await page.locator('#buildTitle').fill('Общая игра');await page.locator('#saveBuild').click();
 expect(await page.evaluate(()=>window.savedBuild.cards.filter(c=>c.type==='round').every(c=>c.settings.seconds===45&&c.settings.answer_seconds===30&&c.settings.count===5))).toBe(true);
});
test('Final card stays last and opens settings only on double click',async({page})=>{
 await workspace(page);await page.locator('[data-section="builder"]').click();await page.locator('#newBuild').click();
 const final=page.locator('.round-card[data-type="finale"]');
 await expect(final.locator('svg')).toBeVisible();await expect(final.locator('[data-delete-card]')).toHaveCount(0);
 await final.locator('h3').click();await expect(final).toHaveAttribute('aria-current','true');
 await expect(page.locator('#cardDialog')).not.toBeVisible();
 await final.locator('h3').dblclick();await expect(page.locator('#cardFinalePreview')).toBeVisible();
 await expect(page.locator('#cardRoundSettings')).toBeHidden();
});
test('Moderator Next is available in question and answer and uses the protected RPC',async({page})=>{
 await workspace(page);await page.evaluate(s=>{window.fixture={...s,room_id:'room',players:[],teams:[]};state.roomCode=s.code;state.room=window.fixture;document.getElementById('liveConsole').hidden=false;section('rooms');renderLive(window.fixture)},state());
 await expect(page.locator('#liveNext')).toBeVisible();await expect(page.locator('#liveNext')).toContainText('Далее');await page.locator('#liveNext').click();await expect(page.locator('#livePhase')).toHaveText('Разбор ответа');await expect(page.locator('#liveNext')).toBeVisible();
 expect(await page.evaluate(()=>window.actions.some(([name,args])=>name==='qwiz_party_control'&&args.p_action==='next'))).toBe(true);
});
test('Broken illustration still leaves a drawing in the moving frame',async({page})=>{
 const s=state();s.question.illustration_url='https://assets.example.org/missing.svg';await page.route('https://assets.example.org/**',r=>r.fulfill({status:404,body:''}));await projector(page,s);await expect(page.locator('.question-picture svg')).toBeVisible();await expect(page.locator('.question-frame figcaption')).toHaveText('Иллюстрация недоступна');
});
test('Hotspot answer marker follows the displayed aspect ratio of the image',async({page})=>{
 const s=state('result');s.question={...s.question,kind:'hotspot',media_url:'https://assets.example.org/image.svg'};s.answer={text:'Правильная область',hotspot:{x:50,y:50,radius:10}};
 await page.route('https://assets.example.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 250" width="1000" height="250"><rect width="1000" height="250" fill="#d8c3f0"/></svg>'}));await projector(page,s);await expect(page.locator('.question-picture img')).toHaveJSProperty('naturalWidth',1000);
 const g=await page.locator('.question-picture').evaluate(el=>{const b=el.getBoundingClientRect(),m=el.querySelector('.answer-hotspot').getBoundingClientRect();return {dx:Math.abs(m.x+m.width/2-b.x-b.width/2),dy:Math.abs(m.y+m.height/2-b.y-b.height/2),ratio:m.width/m.height}});expect(g.dx).toBeLessThan(1);expect(g.dy).toBeLessThan(1);expect(g.ratio).toBeCloseTo(4,1);
});
test('Participant sees answer and the same real team and individual results at phone width',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{}})})}'}));await page.setViewportSize({width:390,height:900});await page.goto(base);
 await page.evaluate(s=>{ctx.room={...s,room_id:'r',public_stats:{teams:s.teams,players:s.players,question_stats:[]},me:{id:'me',team_id:'team-1'}};showScreen('game');renderGame()},state('result'));
 await expect(page.locator('.player-answer h2')).toHaveText('Меркурий');await expect(page.locator('.personal-results .habitat-team')).toHaveCount(15);await expect(page.locator('.personal-results .player-leaderboard li')).toHaveCount(10);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:'visual-artifacts/player-answer-390.png',fullPage:true,animations:'disabled'});
});
