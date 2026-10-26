import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:8080/next/';
const sdkStub="window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null},error:null})},rpc:async()=>({data:{registered:false},error:null}),channel:name=>({topic:'realtime:'+name,on(){return this},subscribe(cb){if(cb)cb('SUBSCRIBED');return this}}),removeChannel:()=>{}})};";
const fixture=()=>({
 code:'ABCDEF12',room_id:'00000000-0000-4000-8000-000000000081',
 title:'Синхронизация 40 игроков',phase:'question',index:0,total:2,
 duration:50,ends_at:new Date(Date.now()+50000).toISOString(),
 question:{kind:'single',prompt:'Выберите ответ',options:['А','Б','В','Г'],correct:null},
 me:{id:'player',team_id:'team'},eligible:true,has_answer:false,
 teams:[{id:'team',name:'Команда',score:0}],public_stats:{teams:[],players:[]}
});
async function open(page){
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:sdkStub}));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>Boolean(ctx.client));
 await page.evaluate(s=>{
  window.__fixture=s;window.__failReads=false;window.__readCount=0;
  ctx.roomCode=s.code;ctx.room=s;showScreen('game');renderGame();
  ctx.client.rpc=async(name)=>{
   if(name==='qwiz_party_state'){
    window.__readCount++;
    if(window.__failReads)throw Error('Temporary HTTP 503');
    return {data:{...window.__fixture,server_now:new Date().toISOString(),
     ends_at:new Date(Date.now()+50000).toISOString()},error:null};
   }
   return {data:null,error:null};
  };
 },fixture());
}
test('40 isolated browser players recover snapshots after a simulated server outage',async({browser})=>{
 test.setTimeout(150000);
 // Synthetic 40-browser test: no production Supabase load or real credentials.
 const context=await browser.newContext({serviceWorkers:'block'});
 const pages=[];
 try{
  for(let i=0;i<40;i+=10){
   const batch=await Promise.all(Array.from({length:10},async()=>{
    const page=await context.newPage();await open(page);return page;
   }));
   pages.push(...batch);
  }
  const healthy=await Promise.all(pages.map(p=>p.evaluate(async()=>{await refreshRoom(false);return !ctx.connectionStale&&ctx.room?.code==='ABCDEF12'})));
  expect(healthy.every(Boolean)).toBe(true);
  const failing=await Promise.all(pages.map(p=>p.evaluate(async()=>{
   window.__failReads=true;
   await refreshRoom(false);
   // One lost room snapshot is not evidence that answer writes are impossible.
   return !ctx.connectionStale&&ctx.snapshotFailures>=1;
  })));
  expect(failing.every(Boolean)).toBe(true);
  const healed=await Promise.all(pages.map(p=>p.evaluate(async()=>{
   window.__failReads=false;
   await refreshRoom(false);
   return !ctx.connectionStale&&ctx.snapshotFailures===0&&ctx.room?.code==='ABCDEF12'&&!ctx.refreshPromise;
  })));
  expect(healed.every(Boolean)).toBe(true);
  const count=await Promise.all(pages.map(p=>p.evaluate(()=>window.__readCount)));
  expect(Math.min(...count)).toBeGreaterThanOrEqual(3);
  expect(Math.max(...count)).toBeLessThan(12);
 }finally{await context.close()}
});
test('Lost answer acknowledgment is reconciled without a duplicate submission',async({browser})=>{
 const context=await browser.newContext({serviceWorkers:'block'});
 const page=await context.newPage();
 try{
  await page.clock.install();
  await open(page);
  await page.evaluate(()=>{
   window.__writes=0;window.__accepted=false;
   ctx.client.rpc=name=>{
    if(name==='org_next_answer'){
     window.__writes++;window.__accepted=true;
     return new Promise(()=>{}); // server committed, HTTP acknowledgment lost
    }
    if(name==='qwiz_party_state'){
     return Promise.resolve({data:{...window.__fixture,has_answer:window.__accepted,
      ends_at:new Date(Date.now()+50000).toISOString(),
      server_now:new Date().toISOString()},error:null});
    }
    return Promise.resolve({data:null,error:null});
   };
   window.__answerPromise=submitAnswer(0);
  });
  await page.clock.fastForward(9400);
  await expect.poll(()=>page.evaluate(()=>ctx.room?.has_answer)).toBe(true);
  expect(await page.evaluate(()=>window.__writes)).toBe(1);
  await expect(page.locator('.player-answer-confirmation')).toContainText('Ответ принят.');
  await expect(page.locator('#gameNotice')).toBeHidden();
 }finally{await context.close()}
});
