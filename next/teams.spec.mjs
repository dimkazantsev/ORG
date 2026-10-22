import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:8080/next/';
const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const names=['Космические','Лавандовые','Невозмутимые','Бархатные','Зазеркальные','Гравитационные','Пружинистые','Невесомые','Молниеносные','Запредельные','Искристые','Неслучайные','Шелестящие','Фантастические','Непотопляемые'];
function fixture(count=5,people=30){const teams=names.slice(0,count).map((name,i)=>({id:uid(i+1),position:i+1,name,score:0,players:0}));
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
 if(name==='qwiz_party_projection')return {data:{...s,players:[],lobby_teams:s.teams.map(t=>({...t,members:s.players.filter(p=>p.team_id===t.id).length}))}};
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
test('Team QR opens an accessible dialog with the exact team link',async({page})=>{
 await host(page);await page.locator('[data-team-qr="'+uid(4)+'"]').click();await expect(page.locator('#teamQrDialog')).toBeVisible();
 const value=await page.locator('.team-invite-url').inputValue(),link=new URL(value);expect(link.searchParams.get('room')).toBe('AABBCCDD');expect(link.searchParams.get('team')).toBe(uid(4));expect(link.searchParams.has('via')).toBe(false);await expect(page.locator('.team-qr-large canvas')).toHaveCount(1);
 await page.keyboard.press('Escape');await expect(page.locator('#teamQrDialog')).toBeHidden();
});
test('Classroom board renders 15 habitat icons and locally generated QR codes',async({page})=>{
 const s=fixture(15,30);await mock(page,s,{host:false});await page.setViewportSize({width:1440,height:900});await page.goto(base+'presenter.html?room=AABBCCDD');
 await expect(page.locator('.team-board-card')).toHaveCount(16);await expect(page.locator('.team-board-qr canvas')).toHaveCount(16);await expect(page.locator('#projectionMain')).not.toContainText('Тестовый Студент');
 expect(await page.locator('.team-board-heading use').evaluateAll(nodes=>new Set(nodes.map(n=>n.getAttribute('href'))).size)).toBe(12);
 expect(await page.locator('.team-board-card').last().evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThan(900);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:'visual-artifacts/teams-projector-15.png',fullPage:true,animations:'disabled'});
});
test('Classroom membership refresh keeps QR elements stable',async({page})=>{
 await mock(page,fixture(),{host:false});await page.goto(base+'presenter.html?room=AABBCCDD');await expect(page.locator('.team-board-card')).toHaveCount(6);
 await page.evaluate(()=>{window.firstQr=document.querySelector('.team-board-qr canvas');window.fixture.lobby_teams=window.fixture.teams.map((t,i)=>({...t,members:i===0?7:6}));render(window.fixture);});
 await expect(page.locator('.team-board-card:not(.team-board-global) .board-count').first()).toHaveText('7 участников');expect(await page.evaluate(()=>window.firstQr===document.querySelector('.team-board-qr canvas'))).toBe(true);
});
test('Team invitation joins the exact team and gives the newcomer a personal QR',async({page})=>{
 await mock(page,fixture(5,0),{host:false});await page.goto(base+'?room=AABBCCDD&team='+uid(3)+'&via='+uid(111));await expect(page.locator('#teamInvitationNotice')).toBeVisible();
 await page.locator('#joinName').fill('Тестовый Участник');await page.locator('#joinButton').click();await expect(page.locator('#gameView')).toBeVisible();
 const request=await page.evaluate(()=>window.actions.find(([n])=>n==='qwiz_join_team'));expect(request[1].p_team).toBe(uid(3));expect(request[1].p_inviter).toBe(uid(111));
 await page.locator('#playerTeamPanel button').click();const link=new URL(await page.locator('.team-invite-url').inputValue());expect(link.searchParams.get('team')).toBe(uid(3));expect(link.searchParams.get('via')).toBe(uid(701));
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
 await expect(page.locator('#playerTeamPanel')).toContainText('Преподаватель распределяет команды');await expect(page.locator('#playerTeamPanel button')).toHaveCount(0);
});
