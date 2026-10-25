import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:8080/next/';
const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const names=['Космические','Лавандовые','Невозмутимые','Бархатные','Зазеркальные','Гравитационные','Пружинистые','Невесомые','Молниеносные','Запредельные','Искристые','Неслучайные','Шелестящие','Фантастические','Непотопляемые'];
function fixture(count=5,people=30){const teams=Array.from({length:count},(_,i)=>({id:uid(i+1),position:i+1,name:names[i]||'Команда '+(i+1),score:0,players:0}));
 const players=Array.from({length:people},(_,i)=>({id:uid(i+101),name:'Тестовый Студент '+(i+1),group:'Группа 101',avatar:i%2?'owl':'fox',team_id:teams[i%count].id}));
 for(const t of teams)t.players=players.filter(p=>p.team_id===t.id).length;
 return {room_id:uid(999),code:'AABBCCDD',title:'Семинар · команды',phase:'lobby',index:-1,total:0,teams,players,host:true,team_mode:'random',unassigned_count:0,setup_issues:[{title:'Флаги стран',topic_id:uid(555),reason:'Нет игровых вопросов с выбранного номера'}],me:null};
}
async function mock(page,room,{host=true,registered=false}={}){
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:`
 window.fixture=${JSON.stringify(room)};window.actions=[];window.fixtureHost=${host};window.registered=${registered};window.joined=false;
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.fixtureHost||window.registered?{user:{id:'host'}}:null}}),signInAnonymously:async()=>({data:{session:{}},error:null}),signOut:async()=>({})},
 rpc:async(name,args={})=>{window.actions.push([name,args]);const s=window.fixture;
 if(name==='org_quiz_is_admin_check')return {data:window.fixtureHost};
 if(name==='qwiz_student_identity')return {data:window.registered?{registered:true,full_name:'Тестовый Студент'}:{registered:false}};
 if(name==='qwiz_studio'&&args.p_action==='overview')return {data:{topics:[{id:'${uid(555)}',name:'Флаги стран'}],builds:[{id:'${uid(556)}',title:'Сборка ОРГ'}]}};
 if(name==='qwiz_studio'&&args.p_action==='questions')return {data:{items:[],total:0}};
 if(name==='qwiz_host_rooms')return {data:[{code:s.code,title:s.title,phase:s.phase,players:s.players.length,teams:s.teams.length}]};
 if(name==='qwiz_prepare_room')return {data:{code:s.code,room_id:s.room_id,total_questions:s.total,issues:s.setup_issues}};
 if(name==='qwiz_party_state')return {data:s};
 if(name==='qwiz_party_projection')return {data:{...s,team_lobby:s.team_lobby||{mode:'random',confirmed:true,team_count:s.teams.length,captain_count:0,captains_ready:false},players:[],lobby_teams:s.teams.map(t=>({...t,members:s.players.filter(p=>p.team_id===t.id).length}))}};
 if(name==='qwiz_lobby_action'){
  if(args.p_action==='confirm'&&s.team_lobby?.mode==='random'){
   s.team_lobby.confirmed=true;
   s.players.forEach((p,i)=>p.team_id=s.teams[i%s.teams.length].id);
   s.unassigned_count=0;
   s.teams.forEach(t=>t.players=s.players.filter(p=>p.team_id===t.id).length);
  }
  if(args.p_action==='claim'&&s.team_lobby?.mode==='captain'){
   s.team_lobby.captain_count++;s.team_lobby.my_captain=true;
   s.team_lobby.captain_started_at=new Date().toISOString();
   s.me.team_id=s.teams[0].id;
   s.team_lobby.captains_ready=s.team_lobby.captain_count===s.team_lobby.team_count;
  }
  if(args.p_action==='rename')s.teams[0].name=args.p_input.name;
  return {data:{ok:true}};
 }
 if(name==='qwiz_team_admin'){
  if(window.failMove&&args.p_action==='move')return {error:{message:'Перенос не сохранён. Повторите попытку.'}};
  if(args.p_action==='move'){const p=s.players.find(p=>p.id===args.p_input.player_id);p.team_id=args.p_input.team_id;}
  if(args.p_action==='shuffle')s.players.forEach((p,i)=>p.team_id=s.teams[i%s.teams.length].id);
  if(args.p_action==='settings'){s.team_mode=args.p_input.mode;if(s.team_mode==='manual'&&!s.players.some(p=>p.id==='${uid(800)}'))s.players.push({id:'${uid(800)}',name:'Новый Студент',team_id:null,avatar:'cat'});}
  if(args.p_action==='refresh_content'){s.total=10;s.setup_issues=[];}
  s.teams.forEach(t=>t.players=s.players.filter(p=>p.team_id===t.id).length);s.unassigned_count=s.players.filter(p=>!p.team_id).length;return {data:{ok:true}};
 }
 if(name==='org_next_join'||name==='qwiz_join_team'){window.joined=true;s.host=false;s.me={id:'${uid(701)}',team_id:args.p_team||s.teams[0].id,entry_question:0};return {data:{code:s.code,player_id:s.me.id,team_id:s.me.team_id}};}
 return {data:[]};},channel:()=>({on(){return this},subscribe(){return this},send:async()=>({})}),removeChannel:()=>{}})};` }));
}
async function host(page,room=fixture()){
 await mock(page,room);await page.goto(base+'workspace.html');await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 await page.locator('[data-section="rooms"]').click();await page.locator('#hostRoomList [data-room]').click();await expect(page.locator('#teamGrid .team-card')).toHaveCount(room.teams.length);
}
test('Empty question bank still creates a room and clearly gates question start',async({page})=>{
 await mock(page,fixture());await page.goto(base+'workspace.html');await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');await page.locator('[data-section="rooms"]').click();
 await page.locator('#launchBuild').selectOption(uid(556));await expect(page.locator('#launchButton')).toBeVisible();await page.locator('#launchButton').click();
 await expect(page.locator('#activeRoomCode')).toHaveText('AABBCCDD');await expect(page.locator('#liveStart')).toBeDisabled();await expect(page.locator('#roomReadinessText')).toContainText('Нет игровых вопросов');await expect(page.locator('#teamGrid .team-member')).toHaveCount(30);
 expect(await page.evaluate(()=>window.actions.some(([name])=>name==='qwiz_prepare_room'))).toBe(true);
 await page.screenshot({path:'visual-artifacts/teams-setup-1440.png',fullPage:true,animations:'disabled'});
});
test('Refresh room questions enables start without recreating the room',async({page})=>{
 await host(page);await page.locator('#refreshRoomContent').click();await expect(page.locator('#liveStart')).toBeEnabled();await expect(page.locator('#roomReadinessTitle')).toContainText('10');await expect(page.locator('#activeRoomCode')).toHaveText('AABBCCDD');
});
test('Shuffle uses the server action and redraws balanced memberships',async({page})=>{
 const s=fixture();s.players.forEach(p=>p.team_id=s.teams[0].id);await host(page,s);await page.locator('#shuffleTeams').click();
 await expect(page.locator('#teamMessage')).toContainText('поровну');for(const card of await page.locator('#teamGrid .team-card').all())await expect(card.locator('.team-member')).toHaveCount(6);
 expect(await page.evaluate(()=>window.actions.some(([n,a])=>n==='qwiz_team_admin'&&a.p_action==='shuffle'))).toBe(true);
});
test('Teacher can drag a student with avatar to another team',async({page})=>{
 await host(page);const player=uid(101),target=uid(2);await page.locator('[data-player-id="'+player+'"] .team-member-name').dragTo(page.locator('[data-drop-team="'+target+'"] .team-card-head'));
 await expect(page.locator('[data-drop-team="'+target+'"] [data-player-id="'+player+'"]')).toBeVisible();
 expect(await page.evaluate(()=>window.actions.filter(([n,a])=>n==='qwiz_team_admin'&&a.p_action==='move').at(-1)[1].p_input)).toEqual({player_id:player,team_id:target});
});
test('Mobile transfer works without dragging and fits 390 pixels',async({page})=>{
 await page.setViewportSize({width:390,height:844});await host(page,fixture(5,10));const player=uid(101),target=uid(3);
 await page.locator('[data-team-player="'+player+'"]').selectOption(target);await expect(page.locator('[data-drop-team="'+target+'"] [data-player-id="'+player+'"]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:'visual-artifacts/teams-mobile-390.png',fullPage:true,animations:'disabled'});
});
test('Manual mode exposes the pending list and lets teacher assign a newcomer',async({page})=>{
 await host(page);await page.locator('#teamMode').selectOption('manual');await page.locator('#applyTeamSettings').click();await expect(page.locator('#teamPool')).toBeVisible();await expect(page.locator('#teamPool')).toContainText('Новый Студент');
 await page.locator('#teamPool [data-team-player]').selectOption(uid(4));await expect(page.locator('#teamPool')).toBeHidden();await expect(page.locator('[data-drop-team="'+uid(4)+'"]')).toContainText('Новый Студент');
});
test('Failed move preserves the roster and displays a retry message',async({page})=>{
 await host(page);await page.evaluate(()=>window.failMove=true);await page.locator('[data-team-player="'+uid(101)+'"]').selectOption(uid(2));await expect(page.locator('#teamMessage')).toContainText('не сохранён');await expect(page.locator('[data-drop-team="'+uid(1)+'"] [data-player-id="'+uid(101)+'"]')).toBeVisible();
});
test('Moderator roster contains no team QR controls',async({page})=>{
 await host(page);await expect(page.locator('#teamGrid .team-card')).toHaveCount(5);
 await expect(page.locator('#teamGrid .team-qr-button')).toHaveCount(0);
 await expect(page.locator('#showTeamBoard')).toHaveCount(0);
 await expect(page.locator('#copyRoomUrl')).toBeVisible();
});
test('Classroom board renders 15 habitat icons and locally generated QR codes',async({page})=>{
 const s=fixture(15,30);await mock(page,s,{host:false});await page.setViewportSize({width:1440,height:900});await page.goto(base+'presenter.html?room=AABBCCDD');
 await expect(page.locator('.team-board-card')).toHaveCount(15);await expect(page.locator('.team-board-qr canvas')).toHaveCount(15);await expect(page.locator('#projectionMain')).not.toContainText('Тестовый Студент');
 expect(await page.locator('.team-board-heading .habitat-base').evaluateAll(nodes=>new Set(nodes.map(n=>n.getAttribute('href'))).size)).toBe(15);
 expect(await page.locator('.team-board-card').last().evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThan(900);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:'visual-artifacts/teams-projector-15.png',fullPage:true,animations:'disabled'});
});
test('Fifteen teams and their QR controls fit a 720p classroom screen',async({page})=>{
 await mock(page,fixture(15,30),{host:false});
 await page.setViewportSize({width:1280,height:720});
 await page.goto(base+'presenter.html?room=AABBCCDD');
 await expect(page.locator('.team-board-card')).toHaveCount(15);
 const bounds=await page.locator('.team-board-card').evaluateAll(cards=>cards.map(c=>{
  const box=c.getBoundingClientRect();return {top:box.top,bottom:box.bottom,right:box.right,left:box.left};
 }));
 expect(Math.min(...bounds.map(b=>b.top))).toBeGreaterThanOrEqual(0);
 expect(Math.max(...bounds.map(b=>b.bottom))).toBeLessThanOrEqual(719);
 expect(Math.min(...bounds.map(b=>b.left))).toBeGreaterThanOrEqual(0);
 expect(Math.max(...bounds.map(b=>b.right))).toBeLessThanOrEqual(1280);
 await expect(page.locator('.team-board-card').last()).toBeInViewport();
});

test('Adaptive classroom layout shows every QR at 1, 3, 8 and 16 teams without scrolling',async({page})=>{
 for(const {count,width,height,columns,rows} of [
  {count:1,width:1280,height:720,columns:1,rows:1},
  {count:3,width:1280,height:720,columns:3,rows:1},
  {count:8,width:1280,height:720,columns:4,rows:2},
  {count:16,width:1280,height:720,columns:8,rows:2},
  {count:16,width:1440,height:900,columns:8,rows:2},
  {count:16,width:1920,height:1080,columns:8,rows:2}
 ]){
  await page.setViewportSize({width,height});
  await mock(page,fixture(count,count*2),{host:false});
  await page.goto(base+'presenter.html?room=AABBCCDD');
  await expect(page.locator('.team-board-card')).toHaveCount(count);
  await expect.poll(()=>page.locator('#projectionTeamBoard').getAttribute('data-columns')).toBe(String(columns));
  await expect(page.locator('#projectionTeamBoard')).toHaveAttribute('data-rows',String(rows));
  await expect(page.locator('.team-board-qr canvas')).toHaveCount(count);
  const bounds=await page.evaluate(()=>{
   const viewport=document.querySelector('#projectionMain').getBoundingClientRect();
   const cards=[...document.querySelectorAll('.team-board-card')].map(c=>{
    const r=c.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
   });
   const board=document.querySelector('#projectionTeamBoard');
   return {viewport,cards,qrSize:parseFloat(getComputedStyle(board).getPropertyValue('--team-qr-size')),
    pageScroll:document.documentElement.scrollHeight-innerHeight};
  });
  expect(bounds.qrSize,'QR size at '+width+'x'+height+' for '+count+' teams').toBeGreaterThanOrEqual(70);
  for(const card of bounds.cards){
   expect(card.left,'card left at '+width+'x'+height).toBeGreaterThanOrEqual(bounds.viewport.left-2);
   expect(card.right,'card right at '+width+'x'+height).toBeLessThanOrEqual(bounds.viewport.right+2);
   expect(card.top,'card top at '+width+'x'+height).toBeGreaterThanOrEqual(bounds.viewport.top-2);
   expect(card.bottom,'card bottom at '+width+'x'+height).toBeLessThanOrEqual(bounds.viewport.bottom+2);
  }
  expect(bounds.pageScroll,'page must fit at '+width+'x'+height).toBeLessThanOrEqual(2);
  await page.locator('.team-board-card').last().click();
  await expect(page.locator('#teamQrDialog')).toBeVisible();
  await expect(page.locator('.team-qr-large canvas')).toHaveCount(1);
  await page.keyboard.press('Escape');
 }
});
test('Shared classroom QR enlarges without consuming a team slot',async({page})=>{
 await mock(page,fixture(15,30),{host:false});await page.setViewportSize({width:1440,height:900});await page.goto(base+'presenter.html?room=AABBCCDD');
 await expect(page.locator('.team-board-card')).toHaveCount(0);
 await expect(page.locator('.lobby-cinema-qr')).toBeVisible();
 await page.locator('#projectionQr').click();await expect(page.locator('#projectionQrDialog')).toBeVisible();
 await expect(page.locator('#projectionQrZoom canvas')).toHaveCount(1);
 await page.locator('#projectionQrClose').click();await expect(page.locator('#projectionQrDialog')).toBeHidden();
});
test('Classroom membership refresh keeps QR elements stable',async({page})=>{
 const state=fixture();state.team_lobby={mode:'random',confirmed:true,team_count:5,captain_count:0,captains_ready:false};
 await mock(page,state,{host:false});await page.goto(base+'presenter.html?room=AABBCCDD');await expect(page.locator('.team-board-card')).toHaveCount(5);
 await page.evaluate(()=>{window.firstQr=document.querySelector('.team-board-qr canvas');window.fixture.lobby_teams=window.fixture.teams.map((t,i)=>({...t,members:i===0?7:6}));render(window.fixture);});
 await expect(page.locator('.board-count').first()).toHaveText('7 участников');expect(await page.evaluate(()=>window.firstQr===document.querySelector('.team-board-qr canvas'))).toBe(true);
});
test('Captain QR link joins the intended team, ordinary members have no own QR',async({page})=>{
 await mock(page,fixture(5,0),{host:false});await page.goto(base+'?room=AABBCCDD&team='+uid(3)+'&via='+uid(111));await expect(page.locator('#teamInvitationNotice')).toBeVisible();
 await page.locator('#joinName').fill('Тестовый Участник');await page.locator('#joinButton').click();await expect(page.locator('#gameView')).toBeVisible();
 const request=await page.evaluate(()=>window.actions.find(([n])=>n==='qwiz_join_team'));expect(request[1].p_team).toBe(uid(3));expect(request[1].p_inviter).toBe(uid(111));
 await expect(page.locator('#playerTeamPanel .captain-qr-image')).toHaveCount(0);
});
test('Saved student profile autojoins a QR link without losing team intent',async({page})=>{
 await mock(page,fixture(5,0),{host:false,registered:true});await page.goto(base+'?room=AABBCCDD&team='+uid(2));await expect(page.locator('#gameView')).toBeVisible();
 expect(await page.evaluate(()=>window.actions.find(([n])=>n==='qwiz_join_team')[1].p_team)).toBe(uid(2));
});
test('Invalid invitation cannot silently join a random team',async({page})=>{
 await mock(page,fixture(5,0),{host:false});await page.goto(base+'?room=AABBCCDD&team=bad');await page.locator('#joinName').fill('Тестовый Участник');await page.locator('#joinButton').click();await expect(page.locator('#joinNotice')).toContainText('Некорректное приглашение');
 expect(await page.evaluate(()=>window.actions.some(([n])=>['qwiz_join_team','org_next_join'].includes(n)))).toBe(false);
});
test('Profile navigation carries the selected room and team',async({page})=>{
 await mock(page,fixture(5,0),{host:false});await page.goto(base+'?room=AABBCCDD&team='+uid(2)+'&via='+uid(111));
 const link=new URL(await page.locator('.profile-link').getAttribute('href'));expect(link.searchParams.get('team')).toBe(uid(2));
 await page.goto(base+'profile.html?room=AABBCCDD&team='+uid(2)+'&via='+uid(111));await expect(page.locator('a.back')).toHaveAttribute('href',new RegExp('room=AABBCCDD.*team='+uid(2)));
});
test('Manual waiting state is visible and never offers a wrong-team invitation',async({page})=>{
 const s=fixture(5,0);s.me={id:uid(701),team_id:null};s.host=false;s.team_mode='manual';await mock(page,s,{host:false});await page.goto(base);await page.evaluate(()=>{ctx.roomCode='AABBCCDD';ctx.room=window.fixture;showScreen('game');renderGame();});
 await expect(page.locator('#playerTeamPanel')).toContainText('Ожидаем распределения');await expect(page.locator('#playerTeamPanel button')).toHaveCount(0);
});


test('TV overscan keeps all QR cards, readable emblems, and screen chrome within safe margins',async({page})=>{
 for(const {count,width,height,minIcon} of [
  {count:2,width:1280,height:720,minIcon:54},
  {count:3,width:1920,height:1080,minIcon:66},
  {count:8,width:1280,height:720,minIcon:40},
  {count:16,width:1280,height:720,minIcon:32},
  {count:16,width:3840,height:2160,minIcon:40}
 ]){
  await page.setViewportSize({width,height});
  await mock(page,fixture(count,count*2),{host:false});
  await page.goto(base+'presenter.html?room=AABBCCDD');
  await expect(page.locator('.team-board-card')).toHaveCount(count);
  await expect.poll(()=>page.locator('#projectionTeamBoard').getAttribute('data-columns')).not.toBeNull();
  const report=await page.evaluate(()=>{
   const box=el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   const root=document.getElementById('projectionShell');
   const cards=[...document.querySelectorAll('.team-board-card')];
   return {safe:box(root),padding:getComputedStyle(root).padding,
    bounds:[...document.querySelectorAll('.projection-header,.projection-footer,#projectionMain .projection-lobby,#projectionMain .projection-team-entry')].map(el=>({name:el.className,hidden:getComputedStyle(el).display==='none',...box(el)})),
    entries:cards.map(el=>({card:box(el),icon:box(el.querySelector('.habitat-icon')),
     title:box(el.querySelector('.team-board-heading strong')),
     qr:box([...el.querySelectorAll('.team-board-qr img,.team-board-qr canvas')].find(node=>{const style=getComputedStyle(node);return style.display!=='none'&&style.visibility!=='hidden'&&node.getBoundingClientRect().width>0})||el.querySelector('.team-board-qr')),
     count:box(el.querySelector('.board-count'))})),
    overflow:document.documentElement.scrollWidth-innerWidth,
    pageScroll:document.documentElement.scrollHeight-innerHeight};
  });
  const marginX=Math.min(width*.048,192),marginY=Math.min(height*.048,110);
  for(const item of report.bounds){
   if(item.hidden)continue;
   expect(item.left,'left TV overscan in '+item.name+' at '+width+' for '+count+' with '+report.padding).toBeGreaterThanOrEqual(marginX-2);
   expect(item.right,'right TV overscan at '+width+' for '+count).toBeLessThanOrEqual(width-marginX+2);
   expect(item.top,'top TV overscan at '+height+' for '+count).toBeGreaterThanOrEqual(marginY-2);
   expect(item.bottom,'bottom TV overscan at '+height+' for '+count).toBeLessThanOrEqual(height-marginY+2);
  }
  for(const item of report.entries){
   expect(item.icon.width,'emblem visibility at '+width+' for '+count).toBeGreaterThanOrEqual(minIcon-2);
   expect(item.qr.width,'QR must be genuinely visible at '+width+' for '+count).toBeGreaterThan(30);
   for(const part of [item.icon,item.title,item.qr,item.count]){
    expect(part.left,'content left at '+width+' for '+count).toBeGreaterThanOrEqual(item.card.left-2);
    expect(part.right,'content right at '+width+' for '+count).toBeLessThanOrEqual(item.card.right+2);
    expect(part.top,'content top at '+width+' for '+count).toBeGreaterThanOrEqual(item.card.top-2);
    expect(part.bottom,'content bottom at '+width+' for '+count).toBeLessThanOrEqual(item.card.bottom+2);
   }
  }
  expect(report.overflow,'no horizontal scrolling on TV').toBeLessThanOrEqual(2);
  expect(report.pageScroll,'no hidden vertical QR rows').toBeLessThanOrEqual(2);
 }
});


test('New random room requires moderator confirmation before public team QR',async({page})=>{
 const s=fixture(3,9);s.total=10;s.setup_issues=[];s.players.forEach(p=>p.team_id=null);s.unassigned_count=9;
 s.team_lobby={mode:'random',confirmed:false,team_count:3,captain_count:0,captains_ready:false,effects_history:[],captains:[]};
 await host(page,s);
 await expect(page.locator('#confirmTeams')).toBeVisible();
 await expect(page.locator('#liveStart')).toBeDisabled();
 await page.locator('#confirmTeams').click();
 await expect(page.locator('#liveStart')).toBeEnabled();
 expect(await page.evaluate(()=>window.actions.some(([n,a])=>n==='qwiz_lobby_action'&&a.p_action==='confirm'))).toBe(true);
 s.team_lobby.confirmed=true;
 s.players.forEach((p,i)=>p.team_id=s.teams[i%s.teams.length].id);
 await mock(page,s,{host:false});await page.goto(base+'presenter.html?room=AABBCCDD');
 await expect(page.locator('.team-board-card')).toHaveCount(3);
 await expect(page.locator('#projectionMain')).toContainText('Идите к своей команде');
});
test('Cinematic projector lobby has exactly one large room QR, no team QR',async({page})=>{
 const s=fixture(5,12);s.team_lobby={mode:'random',confirmed:false,team_count:5,captain_count:0,captains_ready:false};
 await mock(page,s,{host:false});await page.setViewportSize({width:1280,height:720});
 await page.goto(base+'presenter.html?room=AABBCCDD');
 await expect(page.locator('.lobby-cinematic')).toBeVisible();
 await expect(page.locator('.lobby-cinema-qr img')).toHaveCount(1);
 await expect(page.locator('.team-board-card')).toHaveCount(0);
 await expect(page.locator('.lobby-cinema-code')).toHaveText('AABBCCDD');
 const b=await page.locator('.lobby-qr-frame').boundingBox();
 expect(b.width).toBeGreaterThan(170);
 expect(b.x).toBeGreaterThan(40);
 expect(b.x+b.width).toBeLessThan(1240);
});
test('Captain signup and QR are directly visible on mobile, not hidden in statistics',async({page})=>{
 const s=fixture(2,2);s.host=false;s.me={id:uid(701),team_id:null};s.team_mode='captain';
 s.team_lobby={mode:'captain',confirmed:false,team_count:2,captain_count:0,captains_ready:false,can_claim:true,my_captain:false,team_members:[]};
 await mock(page,s,{host:false});await page.setViewportSize({width:390,height:844});
 await page.goto(base);
 await page.evaluate(()=>{ctx.roomCode='AABBCCDD';ctx.room=window.fixture;showScreen('game');renderGame()});
 await expect(page.locator('#playerTeamPanel [data-captain-claim]')).toBeVisible();
 await page.locator('#playerTeamPanel [data-captain-claim]').click();
 await expect.poll(()=>page.evaluate(()=>window.actions.some(([n,a])=>n==='qwiz_lobby_action'&&a.p_action==='claim'))).toBe(true);
 await page.evaluate(()=>{window.fixture.team_lobby.captains_ready=true;window.fixture.team_lobby.captain_count=2;dataState(window.fixture)});
 await expect(page.locator('#playerTeamPanel .captain-qr-image img')).toHaveCount(1);
 const rect=await page.locator('#playerTeamPanel .captain-qr-image').boundingBox();
 expect(rect.width).toBeGreaterThan(230);
 await page.evaluate(()=>{
   window.fixture.phase='countdown';
   QwizTeams.playerPanel(document.getElementById('playerTeamPanel'),window.fixture);
 });
 await expect(page.locator('#playerTeamPanel .captain-qr-hero')).toHaveCount(0);
});

test('Legacy audience also uses one central room QR, never team links before play',async({page})=>{
 const s=fixture(3,6);await mock(page,s,{host:false});
 await page.goto(base+'presenter.html?room=AABBCCDD');
 await page.evaluate(()=>{
  const state={...window.fixture,team_lobby:null,
   lobby_teams:window.fixture.teams.map(t=>({...t,members:2}))};
  render(state);
 });
 await expect(page.locator('.lobby-cinematic')).toBeVisible();
 await expect(page.locator('.lobby-cinema-qr img')).toHaveCount(1);
 await expect(page.locator('.team-board-card')).toHaveCount(0);
});


test('Switching lobby from random to captain updates the phone and projector without a page reload',async({page})=>{
 const s=fixture(2,2);s.host=false;s.me={id:uid(701),team_id:null};s.team_mode='random';
 s.team_lobby={mode:'random',team_count:2,confirmed:false,captain_count:0,captains_ready:false,can_claim:false,my_captain:false};
 await mock(page,s,{host:false});await page.setViewportSize({width:390,height:844});
 await page.goto(base);
 await page.evaluate(()=>{ctx.roomCode='AABBCCDD';ctx.room=window.fixture;showScreen('game');renderGame()});
 await expect(page.locator('#gameContent')).toContainText('Создаю команды');
 await page.evaluate(()=>{window.fixture.team_mode='captain';window.fixture.team_lobby.mode='captain';window.fixture.team_lobby.can_claim=true;dataState(window.fixture)});
 await expect(page.locator('#gameContent')).toContainText('Выбираем капитанов');
 await expect(page.locator('#playerTeamPanel [data-captain-claim]')).toBeVisible();
 s.team_mode='captain';s.team_lobby.mode='captain';s.team_lobby.can_claim=true;
 await page.setViewportSize({width:1280,height:720});
 await mock(page,s,{host:false});await page.goto(base+'presenter.html?room=AABBCCDD');
 await expect(page.locator('.lobby-cinema-instructions')).toContainText('Выбираем капитанов');
 await page.evaluate(()=>{window.fixture.team_mode='random';window.fixture.team_lobby.mode='random';render(window.fixture)});
 await expect(page.locator('.lobby-cinema-instructions')).toContainText('Преподаватель распределит');
});
