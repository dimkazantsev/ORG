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
 'window.savedBuild=null;window.actions=[];window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:"host"}}}}),signOut:async()=>({})},rpc:async(name,args)=>{window.actions.push([name,args]);if(name==="org_quiz_is_admin_check")return {data:true};if(name==="qwiz_studio"&&args.p_action==="overview")return {data:{topics:[],builds:[],total_questions:0}};if(name==="qwiz_studio"&&args.p_action==="questions")return {data:{items:[],total:0}};if(name==="qwiz_studio"&&args.p_action==="build_save"){window.savedBuild=args.p_input;return {data:{id:"saved"}}}if(name==="qwiz_host_rooms")return {data:[]};if(name==="qwiz_party_state")return {data:window.fixture};if(name==="qwiz_party_control_checked"){window.fixture={...window.fixture,phase:window.fixture.phase==="question"?"result":"question",ends_at:new Date(Date.now()+10000).toISOString()};return {data:window.fixture.phase}}return {data:{items:[],total:0}}},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}})};'}));
 await page.goto(base+'workspace.html');await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
}
test('Question screen remains readable without leaking team standings or fallback decorations',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await projector(page,state());
 await expect(page.locator('.projection-question-only h1')).toContainText('Какая планета');
 // Audience receives non-secret choices; correct answer indicators stay private until result.
 await expect(page.locator('.projection-public-options .projection-option')).toHaveCount(4);
 await expect(page.locator('.projection-answer-reveal')).toHaveCount(0);
 await expect(page.locator('.habitat-team')).toHaveCount(0);
 await expect(page.locator('.question-frame')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
test('Aggregate answer count refreshes without replacing the question',async({page})=>{
 const s=state();s.teams.forEach(t=>t.answered=0);await projector(page,s);
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
test('Finale keeps all participants counted but displays a readable top six on the projector',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await projector(page,state('finished'));
 const finale=page.locator('.projection-finale-compact');
 await expect(finale).toBeVisible();
 await expect(finale).toContainText('15 команд · 40 участников');
 await expect(finale.locator('.finale-summary')).toContainText('8');
 await expect(finale.locator('.projection-round-columns .stage-team-results li')).toHaveCount(6);
 await expect(finale.locator('.projection-round-columns .stage-player-results li')).toHaveCount(6);
 await expect(finale.locator('.projection-round-columns .stage-team-results li').first()).toContainText('Несгибаемые');
 await expect(finale.locator('.projection-round-columns .stage-player-results li').first()).toContainText('Участник 1');
 await expect(finale.locator('.projection-rank-more')).toHaveCount(2);
 await expect(finale.locator('.projection-rank-more').first()).toContainText('Ещё 9');
 await expect(finale.locator('.projection-rank-more').last()).toContainText('Ещё 34');
 const report=finale.locator('.projection-finale-report');
 await expect(report).not.toHaveAttribute('open');
 await expect(finale.locator('.projection-answer-reveal')).toHaveCount(0);
 const scene=await finale.boundingBox(),screen=await page.locator('#projectionMain').boundingBox();
 expect(scene && screen).toBeTruthy();
 expect(scene.y+scene.height).toBeLessThanOrEqual(screen.y+screen.height+4);
 await page.screenshot({path:'visual-artifacts/finale-stage-1440.png',fullPage:true,animations:'disabled'});
 // Complete results remain available on demand, without compressing the short public finale.
 await report.locator('summary').first().click();
 await expect(report).toHaveAttribute('open');
 await expect(report.locator('.habitat-team')).toHaveCount(15);
 await expect(report.locator('.player-leaderboard li')).toHaveCount(40);
 await expect(report.locator('.question-insights section')).toHaveCount(2);
 await report.locator('.all-question-stats summary').click();
 await expect(report.locator('.all-question-stats li')).toHaveCount(8);
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
 await page.evaluate(()=>{state.topics=[{id:'flags-topic',name:'Флаги мира'}];state.cards[1].topic_id='flags-topic';state.cards[1].settings.flag_modes=['country'];updateSelectors();renderCards();});
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
 await expect(page.locator('.round-card[data-type="round"] .round-sub')).toHaveText(['Тема не выбрана · Выберите механики перед запуском · 5 вопр. · 45 сек. · ответ 30 сек.','Тема не выбрана · Выберите механики перед запуском · 5 вопр. · 45 сек. · ответ 30 сек.']);await page.locator('#buildTitle').fill('Общая игра');await page.locator('#saveBuild').click();
 expect(await page.evaluate(()=>window.savedBuild.cards.filter(c=>c.type==='round').every(c=>c.settings.seconds===45&&c.settings.answer_seconds===30&&c.settings.count===5))).toBe(true);
});
test('Final card stays last and opens settings only on double click',async({page})=>{
 await workspace(page);await page.locator('[data-section="builder"]').click();await page.locator('#newBuild').click();
 const final=page.locator('.round-card[data-type="finale"]');
 await expect(final.locator('svg')).toBeVisible();await expect(final.locator('[data-delete-card]')).toHaveCount(0);
 await final.locator('h3').click();await expect(final).toHaveAttribute('aria-current','true');
 await expect(page.locator('#cardDialog')).not.toBeVisible();
 await page.waitForTimeout(600); // a new deliberate double tap, not a third click in the prior sequence
 await final.locator('h3').dblclick();await expect(page.locator('#cardFinalePreview')).toBeVisible();
 await expect(page.locator('#cardRoundSettings')).toBeHidden();
});
test('Moderator Next is available in question and answer and uses the protected RPC',async({page})=>{
 await workspace(page);await page.evaluate(s=>{window.fixture={...s,room_id:'room',control_revision:'revision-1',players:[],teams:[]};state.roomCode=s.code;state.room=window.fixture;document.getElementById('liveConsole').hidden=false;section('rooms');renderLive(window.fixture)},state());
 await expect(page.locator('#liveNext')).toBeVisible();await expect(page.locator('#liveNext')).toContainText('Далее');await page.locator('#liveNext').click();await expect(page.locator('#livePhase')).toHaveText('Разбор ответа');await expect(page.locator('#liveNext')).toBeVisible();
 expect(await page.evaluate(()=>window.actions.some(([name,args])=>name==='qwiz_party_control_checked'&&args.p_action==='next'&&args.p_revision==='revision-1'))).toBe(true);
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


test('Overlapping student refreshes keep the latest phase instead of dropping the notification',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{},error:null}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}})};'}));
 await page.goto(base);await page.waitForFunction(()=>ctx.client!==null);
 await page.evaluate(()=>{
  const room={code:'ABCDEF12',room_id:'room-1',phase:'question',index:0,total:1,duration:30,
   ends_at:new Date(Date.now()+30000).toISOString(),title:'Первый вопрос',
   question:{kind:'single',prompt:'Какой вариант?',options:['А','Б']},
   teams:[],public_stats:{teams:[],players:[]},me:{id:'player',team_id:'team-1'},eligible:true};
  ctx.roomCode=room.code;ctx.room=room;showScreen('game');renderGame();
  window.pendingReads=[];ctx.client.rpc=(name,args)=>new Promise(resolve=>window.pendingReads.push({name,args,resolve}));
  window.refreshA=refreshRoom(false);window.refreshB=refreshRoom(false);
 });
 await expect.poll(()=>page.evaluate(()=>window.pendingReads.length)).toBe(1);
 await page.evaluate(()=>window.pendingReads[0].resolve({data:{...ctx.room,server_now:new Date().toISOString()},error:null}));
 await expect.poll(()=>page.evaluate(()=>window.pendingReads.length)).toBe(2);
 await page.evaluate(()=>{
  const s={...ctx.room,phase:'result',answer:{text:'А'},ends_at:new Date(Date.now()+10000).toISOString()};
  window.pendingReads[1].resolve({data:s,error:null});
 });
 await expect.poll(()=>page.evaluate(()=>ctx.room?.phase)).toBe('result');
 await expect(page.locator('.player-answer')).toBeVisible();
});

test('Switching rooms rejects the previous room late response and reads the selected room',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{},error:null}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}})};'}));
 await page.goto(base);await page.waitForFunction(()=>ctx.client!==null);
 await page.evaluate(()=>{
  const room={code:'ABCDEF12',room_id:'room-A',phase:'question',index:0,total:1,duration:30,
   ends_at:new Date(Date.now()+30000).toISOString(),title:'Старая комната',
   question:{kind:'single',prompt:'Старый вопрос?',options:['А','Б']},
   teams:[],public_stats:{teams:[],players:[]},me:{id:'player',team_id:'team-1'},eligible:true};
  ctx.roomCode=room.code;ctx.room=room;showScreen('game');renderGame();
  window.pendingReads=[];ctx.client.rpc=(name,args)=>new Promise(resolve=>window.pendingReads.push({name,args,resolve}));
  window.requestOld=refreshRoom(false);
  ctx.roomCode='1234ABCD';ctx.room=null;
  window.requestNew=refreshRoom(false);
 });
 await expect.poll(()=>page.evaluate(()=>window.pendingReads.length)).toBe(1);
 await page.evaluate(()=>{
  const old={code:'ABCDEF12',title:'Старая комната',phase:'lobby',index:0,total:1,teams:[],me:null};
  window.pendingReads[0].resolve({data:old,error:null});
 });
 await expect.poll(()=>page.evaluate(()=>window.pendingReads.length)).toBe(2);
 expect(await page.evaluate(()=>ctx.room)).toBeNull();
 expect(await page.evaluate(()=>window.pendingReads[1].args.p_code)).toBe('1234ABCD');
 await page.evaluate(()=>{
  const room={code:'1234ABCD',room_id:'room-B',phase:'lobby',index:0,total:1,title:'Новая комната',
   teams:[],public_stats:{teams:[]},me:{id:'player',team_id:'team-1'}};
  window.pendingReads[1].resolve({data:room,error:null});
 });
 await expect.poll(()=>page.evaluate(()=>ctx.room?.code)).toBe('1234ABCD');
 await expect(page.locator('#playerGameTitle')).toHaveText('Новая комната');
});

test('Projector processes a phase event that arrives during a slow state request',async({page})=>{
 await projector(page,state());
 await page.evaluate(()=>{
  window.projectorPending=[];ctx.client.rpc=(name,args)=>new Promise(resolve=>window.projectorPending.push({name,args,resolve}));
  window.projectorFirst=refresh();
  window.projectorSecond=refresh();
 });
 await expect.poll(()=>page.evaluate(()=>window.projectorPending.length)).toBe(1);
 await page.evaluate(()=>window.projectorPending[0].resolve({data:window.fixture,error:null}));
 await expect.poll(()=>page.evaluate(()=>window.projectorPending.length)).toBe(2);
 await page.evaluate(()=>{
  window.projectorPending[1].resolve({data:{...window.fixture,phase:'result',
   answer:{text:'Меркурий'},ends_at:new Date(Date.now()+10000).toISOString()},error:null});
 });
 await expect(page.locator('.projection-answer-reveal')).toBeVisible();
 await expect(page.locator('.projection-answer-text')).toHaveText('Меркурий');
});

test('Moderator ignores a double tap while its first server control is pending',async({page})=>{
 await workspace(page);
 await page.evaluate(s=>{
  window.fixture={...s,room_id:'room',control_revision:'revision-1',players:[],teams:[]};
  state.roomCode=s.code;state.room=window.fixture;
  document.getElementById('liveConsole').hidden=false;section('rooms');renderLive(window.fixture);
  window.controlCalls=0;
  const oldRpc=state.db.rpc.bind(state.db);
  state.db.rpc=(name,args)=>{
   if(name==='qwiz_party_control_checked'){
    window.controlCalls++;
    return new Promise(resolve=>{window.finishFirstControl=()=>resolve({data:{phase:'result'},error:null});});
   }
   return oldRpc(name,args);
  };
 },state());
 await page.evaluate(()=>{control('next');control('next');});
 expect(await page.evaluate(()=>window.controlCalls)).toBe(1);
 await page.evaluate(()=>window.finishFirstControl());
 await expect.poll(()=>page.evaluate(()=>controlRequestBusy)).toBe(false);
});

test('Moderator Next in Russia geography opens results and clearly signals the transition',async({page})=>{
 await workspace(page);
 await page.evaluate(s=>{
  window.fixture={...s,room_id:'room',control_revision:'revision-geo-1',phase:'intermission',players:[],teams:[],
   activity:{type:'game',title:'Регионы России',settings:{arcade_mode:'russia_map',geo_seconds:180}}};
  state.roomCode=s.code;state.room=window.fixture;
  document.getElementById('liveConsole').hidden=false;section('rooms');
  const original=state.db.rpc;
  state.db.rpc=async(name,args)=>{
   if(name==='qwiz_party_control_checked'&&args.p_action==='next'){
    window.actions.push([name,args]);
    window.fixture={...window.fixture,activity:{type:'round_stats',title:'Итоги раунда',settings:{stats_seconds:7}}};
    return {data:{phase:'intermission'},error:null};
   }
   return original(name,args);
  };
  renderLive(window.fixture);
 },state());
 await expect(page.locator('#liveNext')).toBeEnabled();
 await expect(page.locator('#liveNext')).toContainText('Показать итоги');
 await page.locator('#liveNext').click();
 await expect(page.locator('#liveQuestion')).toContainText('Итоги раунда');
 await expect(page.locator('#liveMessage')).toContainText('Раунд «Регионы» завершён');
 await expect(page.locator('#liveNext')).toContainText('Далее');
 expect(await page.evaluate(()=>window.actions.some(([name,args])=>name==='qwiz_party_control_checked'&&args.p_action==='next'))).toBe(true);
});

test('Four indie-inspired game stages use distinct palettes and never clip at mobile width',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{registered:false},error:null}),channel:()=>({on(){return this},subscribe(){return this}})})};'}));
 await page.setViewportSize({width:390,height:850});
 await page.goto(base);
 for(const mode of ['rocket','tug','captain','blitz']){
  await page.evaluate(mode=>{
   QwizArcade.stop('player');document.getElementById('arcadeStyleFixture')?.remove();
   const root=document.createElement('section');root.id='arcadeStyleFixture';root.style.width='min(100%,390px)';
   document.querySelector('#mainContent').append(root);
   const now=Date.now(),state={code:'ABCDEF12',room_id:'room',
    activity:{settings:{arcade_mode:mode}}};
   const view={code:'ABCDEF12',mode,running:true,server_now:new Date(now).toISOString(),
    started_at:new Date(now-2000).toISOString(),ends_at:new Date(now+30000).toISOString(),
    teams:[],mine:{team_id:'t',credits:0},awards:[]};
   QwizArcade.mountPlayer(root,state,{client:{rpc:async()=>({data:view,error:null})}});
  },mode);
  const world=page.locator('#arcadeStyleFixture .arcade-3d-world');
  await expect(world).toBeVisible();
  await expect(world).toHaveClass(new RegExp('arcade-world-'+mode));
  const computed=await world.evaluate(el=>{
   const r=el.getBoundingClientRect(),s=getComputedStyle(el);
   return {width:r.width,height:r.height,right:r.right,background:s.backgroundImage,
    scene:getComputedStyle(el.closest('.arcade-scene')).borderTopWidth}
  });
  expect(computed.width).toBeGreaterThan(220);
  expect(computed.height).toBeGreaterThanOrEqual(160);
  expect(computed.right).toBeLessThanOrEqual(392);
  expect(computed.background).toContain('radial-gradient');
  expect(computed.scene).toBe('2px');
  await page.locator('#arcadeStyleFixture .arcade-scene').screenshot({path:'visual-artifacts/indie-arcade-'+mode+'-390.png',animations:'disabled'});
 }
});


test('Unstarted lobby cannot be finished accidentally, but active games can be ended',async({page})=>{
 await workspace(page);
 await page.evaluate(s=>{
  window.fixture={...s,phase:'lobby',room_id:'room',players:[],teams:[],control_revision:'test-lobby'};
  state.roomCode=s.code;state.room=window.fixture;
  document.getElementById('liveConsole').hidden=false;section('rooms');renderLive(window.fixture);
 },state());
 await expect(page.locator('#liveFinish')).toBeDisabled();
 await expect(page.locator('#liveStart')).toBeEnabled();
 await page.evaluate(()=>{state.room={...state.room,phase:'question',question:window.fixture.question};renderLive(state.room)});
 await expect(page.locator('#liveFinish')).toBeEnabled();
 await page.evaluate(()=>{state.room={...state.room,phase:'finished'};renderLive(state.room)});
 await expect(page.locator('#liveFinish')).toBeDisabled();
});
