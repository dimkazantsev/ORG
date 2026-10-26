import {test,expect} from '@playwright/test';

const base='http://127.0.0.1:8080/next/';
async function ready(page){
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{registered:false},error:null}),channel:name=>({topic:"realtime:"+name,on(){return this},subscribe(){return this}}),removeChannel:()=>{}})};'
 }));
 await page.goto(base);
 await page.waitForFunction(()=>Boolean(ctx.client));
}
const fixture=()=>({
 code:'ABCDEF12',room_id:'00000000-0000-4000-8000-000000000081',title:'Длинная игра',
 phase:'question',index:0,total:2,duration:30,ends_at:new Date(Date.now()+30000).toISOString(),
 question:{kind:'text',prompt:'Напишите название столицы',options:[]},
 me:{id:'p',team_id:'t'},eligible:true,has_answer:false,
 teams:[{id:'t',name:'Команда',score:0}],public_stats:{teams:[],players:[]}
});

test('A 90-minute outage keeps the draft and locks answers until fresh state is confirmed',async({page})=>{
 await page.clock.install();await ready(page);
 await page.evaluate(room=>{
  window.roomFixture=room;window.stateCalls=0;
  ctx.roomCode=room.code;ctx.room=room;showScreen('game');renderGame();
  ctx.client.rpc=async(name)=>{
   if(name==='qwiz_party_state'){
    window.stateCalls++;
    return {data:{...window.roomFixture,ends_at:new Date(Date.now()+30000).toISOString(),
      server_now:new Date().toISOString()},error:null};
   }
   return {data:{accepted:true},error:null};
  };
 },fixture());
 await page.locator('#richTextAnswer').fill('Москва');
 await page.context().setOffline(true);
 await expect(page.locator('#richTextAnswer')).toBeDisabled();
 await expect(page.locator('#gameContent [data-submit-rich]')).toBeDisabled();
 await expect(page.locator('#gameNotice')).toContainText('Нет интернета.');
 await page.clock.fastForward(90*60*1000);
 await expect(page.locator('#richTextAnswer')).toHaveValue('Москва');
 expect(await page.evaluate(()=>window.stateCalls)).toBe(0);
 await page.context().setOffline(false);
 await page.clock.fastForward(500);
 await expect.poll(()=>page.evaluate(()=>window.stateCalls)).toBeGreaterThanOrEqual(1);
 await expect(page.locator('#richTextAnswer')).toBeEnabled();
 await expect(page.locator('#gameContent [data-submit-rich]')).toBeEnabled();
 await expect(page.locator('#richTextAnswer')).toHaveValue('Москва');
 await expect(page.locator('#gameNotice')).toBeEmpty();
});

test('Failed polls retry with capped backoff rather than a tight request loop',async({page})=>{
 await page.clock.install();await page.addInitScript(()=>{Math.random=()=>0.99});
 await ready(page);
 await page.evaluate(room=>{
  ctx.roomCode=room.code;ctx.room=room;showScreen('game');renderGame();
  window.attempts=0;
  ctx.client.rpc=async(name)=>{
   if(name==='qwiz_party_state'){
    window.attempts++;
    if(window.attempts<3)throw Error('Temporary connection failure');
    return {data:{...room,ends_at:new Date(Date.now()+30000).toISOString(),
      server_now:new Date().toISOString()},error:null};
   }
   return {data:null,error:null};
  };
  window.firstPoll=refreshRoom(false);
 },fixture());
 await expect.poll(()=>page.evaluate(()=>window.attempts)).toBe(1);
 await expect(page.locator('#richTextAnswer')).toBeEnabled();
 await expect(page.locator('#gameNotice')).toBeEmpty();
 expect(await page.evaluate(()=>ctx.connectionStale)).toBe(false);
 await page.clock.fastForward(2100);
 await expect.poll(()=>page.evaluate(()=>window.attempts)).toBe(2);
 await page.clock.fastForward(4100);
 await expect.poll(()=>page.evaluate(()=>window.attempts)).toBe(3);
 await expect(page.locator('#richTextAnswer')).toBeEnabled();
 expect(await page.evaluate(()=>ctx.connectionStale)).toBe(false);
 expect(await page.evaluate(()=>window.attempts)).toBe(3);
});

test('A hanging room RPC times out and retries, without accepting a late stale answer',async({page})=>{
 await page.clock.install();await ready(page);
 await page.evaluate(room=>{
  ctx.roomCode=room.code;ctx.room=room;showScreen('game');renderGame();
  window.roomCalls=0;window.hungSignal=null;
  ctx.client.rpc=(name)=>{
   if(name!=='qwiz_party_state')return Promise.resolve({data:null,error:null});
   window.roomCalls++;
   if(window.roomCalls===1)return {
    abortSignal(signal){window.hungSignal=signal;return this;},
    then(){return new Promise(()=>{});}
   };
   return Promise.resolve({data:{...room,ends_at:new Date(Date.now()+30000).toISOString(),
    server_now:new Date().toISOString()},error:null});
  };
  window.firstRoomRead=refreshRoom(false);
  // Simulate a wave of notifications while the first RPC is still hung.
  for(let n=0;n<12;n++)refreshRoom(false);
 },fixture());
 await expect.poll(()=>page.evaluate(()=>window.roomCalls)).toBe(1);
 await page.clock.fastForward(10100);
 await expect.poll(()=>page.evaluate(()=>window.hungSignal?.aborted)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>ctx.connectionStale)).toBe(true);
 // Queued notifications must not bypass exponential backoff after failure.
 expect(await page.evaluate(()=>window.roomCalls)).toBe(1);
 await expect(page.locator('#richTextAnswer')).toBeEnabled();
 await expect(page.locator('#gameNotice')).toBeEmpty();
 expect(await page.evaluate(()=>ctx.connectionStale)).toBe(false);
 await page.clock.fastForward(2100);
 await expect.poll(()=>page.evaluate(()=>window.roomCalls)).toBe(2);
 await expect.poll(()=>page.evaluate(()=>ctx.connectionStale)).toBe(false);
 await expect(page.locator('#richTextAnswer')).toBeEnabled();
});

test('40 virtual players spread background refreshes across a 20-second window',async({page})=>{
 await ready(page);
 const offsets=await page.evaluate(()=>Array.from({length:40},(_,i)=>roomPollOffset(()=>(i+0.5)/40)));
 expect(offsets).toHaveLength(40);
 expect(Math.min(...offsets)).toBe(250);
 expect(Math.max(...offsets)).toBe(19750);
 // One controlled request per 500-ms slot. This is a scheduler simulation,
 // not a live load test against Supabase or 40 physical phones.
 const counts=new Map();
 for(const offset of offsets){const slot=Math.floor(offset/500);counts.set(slot,(counts.get(slot)||0)+1)}
 expect(Math.max(...counts.values())).toBe(1);
 expect(offsets.reduce((sum,offset)=>sum+Number(offset>=0&&offset<20000),0)).toBe(40);
});

test('A failed room read cannot block a real answer accepted by the server',async({page})=>{
 await ready(page);
 await page.evaluate(room=>{
  room.question={kind:'single',prompt:'Выберите столицу',options:['Москва','Казань','Томск','Омск']};
  window.serverRoom=room;
  ctx.roomCode=room.code;ctx.room=room;showScreen('game');renderGame();
  window.failedReads=0;window.submitted=0;
  ctx.client.rpc=async(name)=>{
   if(name==='qwiz_party_state'){
    window.failedReads++;
    if(window.failedReads===1)throw Error('Temporary 503 on snapshot only');
    return {data:{...window.serverRoom,has_answer:window.submitted>0,server_now:new Date().toISOString()},error:null};
   }
   if(name==='org_next_answer'){window.submitted++;return {data:{accepted:true},error:null};}
   return {data:null,error:null};
  };
 },fixture());
 await page.evaluate(()=>refreshRoom(false));
 await expect(page.locator('#gameNotice')).toBeEmpty();
 expect(await page.evaluate(()=>ctx.connectionStale)).toBe(false);
 await expect(page.locator('[data-answer]').first()).toBeEnabled();
 await page.locator('[data-answer]').first().click();
 await expect.poll(()=>page.evaluate(()=>window.submitted)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>ctx.room?.has_answer)).toBe(true);
 await expect(page.locator('.player-answer-confirmation')).toContainText('Ответ принят.');
 await expect(page.locator('#gameNotice')).toBeEmpty();
});

test('Network returning unlocks answer controls before the next room snapshot',async({page})=>{
 await ready(page);
 await page.evaluate(room=>{
  ctx.roomCode=room.code;ctx.room=room;showScreen('game');renderGame();
  ctx.client.rpc=async()=>({data:{...room,server_now:new Date().toISOString()},error:null});
 },fixture());
 await page.context().setOffline(true);
 await expect(page.locator('#richTextAnswer')).toBeDisabled();
 await page.context().setOffline(false);
 await expect(page.locator('#richTextAnswer')).toBeEnabled();
 await expect(page.locator('#gameNotice')).toBeEmpty();
});

test('Server-accepted answer remains confirmed when the following room snapshot fails',async({page})=>{
 await ready(page);
 await page.evaluate(room=>{
  room.question={kind:'single',prompt:'Государственный символ?',options:['А','Б','В','Г']};
  window.serverRoom=room;window.answerWrites=0;window.stateReads=0;
  ctx.roomCode=room.code;ctx.room=room;showScreen('game');renderGame();
  ctx.client.rpc=async(name)=>{
   if(name==='org_next_answer'){window.answerWrites++;return {data:{accepted:true},error:null};}
   if(name==='qwiz_party_state'){window.stateReads++;throw Error('Temporary snapshot failure');}
   return {data:null,error:null};
  };
 },fixture());
 await page.evaluate(()=>submitAnswer(1));
 await expect(page.locator('.player-answer-confirmation')).toContainText('Ответ принят.');
 await expect(page.locator('#gameNotice')).toBeEmpty();
 expect(await page.evaluate(()=>window.answerWrites)).toBe(1);
 expect(await page.evaluate(()=>ctx.room?.has_answer)).toBe(true);
 // Even an old, out-of-order server read cannot reopen the same answer card.
 await page.evaluate(()=>dataState({...window.serverRoom,has_answer:false,server_now:new Date().toISOString()}));
 expect(await page.evaluate(()=>ctx.room?.has_answer)).toBe(true);
 expect(await page.evaluate(()=>window.answerWrites)).toBe(1);
});
