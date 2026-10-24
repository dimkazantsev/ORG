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

test('Moderator Start is enabled for ready room and opens separate exact-room public screen',async({page})=>{
 await page.goto(BASE+'workspace.html');
 await page.evaluate(()=>{
  window.__projectorLink='';
  window.open=(url)=>{window.__projectorLink=url;return {closed:false,focus(){},moveTo(){},resizeTo(){}};};
  const room={room_id:'00000000-0000-4000-8000-000000000024',code:'EE31D25A',title:'Игровая комната',
   phase:'lobby',index:-1,total:5,setup_issues:[],unassigned_count:0,players:[],teams:[],answers_count:0};
  state.room=room;state.roomCode=room.code;state.db={rpc:async(name,args)=>{
   if(name==='qwiz_party_control'){window.__lastControl={name,args};return {data:{phase:'intermission'},error:null};}
   if(name==='qwiz_party_state')return {data:room,error:null};
   return {data:{},error:null};
  }};
  wire();renderLive(room);roomReadiness(room);
  document.getElementById('roomsPage').hidden=false;
  document.getElementById('liveConsole').hidden=false;
 });
 await expect(page.locator('#liveStart')).toBeEnabled();
 await page.locator('#liveStart').click();
 await expect.poll(()=>page.evaluate(()=>window.__lastControl?.args?.p_action)).toBe('start');
 const link=await page.evaluate(()=>window.__projectorLink);
 expect(link).toContain('presenter.html');
 expect(link).toContain('room=EE31D25A');
 await expect(page.locator('#liveScreenMirror')).toHaveCount(0);
});
test('Moderator can pause a geography intermission and continue with server state',async({page})=>{
 await page.goto(BASE+'workspace.html');
 await page.evaluate(()=>{
  const room={room_id:'00000000-0000-4000-8000-000000000024',code:'EE31D25A',title:'География России',
   phase:'intermission',activity:{title:'География России',settings:{arcade_mode:'russia_map'}},
   index:-1,total:0,setup_issues:[],unassigned_count:0,players:[],teams:[],answers_count:0,paused:false};
  state.room=room;state.roomCode=room.code;state.db={rpc:async(name,args)=>{
   if(name==='qwiz_party_control'){window.__lastAction=args.p_action;room.paused=args.p_action==='pause';return {data:{paused:room.paused},error:null};}
   if(name==='qwiz_party_state')return {data:room,error:null};
   return {data:{},error:null};
  }};
  wire();renderLive(room);document.getElementById('liveConsole').hidden=false;
 });
 await expect(page.locator('#livePause')).toBeEnabled();
 await page.locator('#livePause').click();
 await expect.poll(()=>page.evaluate(()=>window.__lastAction)).toBe('pause');
 await expect(page.locator('#livePause')).toContainText('Продолжить');
 await page.locator('#livePause').click();
 await expect.poll(()=>page.evaluate(()=>window.__lastAction)).toBe('resume');
});
