// One-time, bounded integration test. Run ONLY against dedicated QWIZ LOAD 40 fixture.
// Uses 40 genuine Supabase anonymous sessions and the same join/state/answer RPCs as phones.
// No service secrets; the publishable key is already embedded in the public website.
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const ROOM=process.env.QWIZ_LOAD_ROOM;
const MODE=process.env.QWIZ_LOAD_MODE||'public';
const TAG=process.env.QWIZ_LOAD_TAG||'qwiz_perf_40_20261026';
const SUPABASE_URL='https://bderfrcfuhnutuoyudje.supabase.co';
const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const KEY=source.match(/const KEY_SUPABASE='([^']+)'/)?.[1];
if(!KEY||!/^[A-F0-9]{8}$/.test(ROOM||'')||!['public','full'].includes(MODE))throw Error('Dedicated fixture, publishable key and run mode required');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function client(){return createClient(SUPABASE_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})}
function percentile(arr,p){const a=arr.slice().sort((x,y)=>x-y);return a[Math.max(0,Math.ceil(a.length*p)-1)]??null}
function report(name,arr){
 const durations=arr.filter(x=>x.ok).map(x=>x.ms);
 const errs=arr.filter(x=>!x.ok);
 console.log(JSON.stringify({step:name,clients:arr.length,ok:durations.length,failed:errs.length,p50_ms:percentile(durations,.5),p95_ms:percentile(durations,.95),p99_ms:percentile(durations,.99),max_ms:durations.length?Math.max(...durations):null,failures:errs.slice(0,6).map(e=>({status:e.status,error:e.error?.slice(0,110)}))}));
 return errs.length===0;
}
async function timed(fn){
 const at=performance.now();
 try{const value=await Promise.race([fn(),sleep(12000).then(()=>{throw Error('timeout 12s')})]);
  return {ok:true,ms:Math.round(performance.now()-at),value};
 }catch(error){return {ok:false,ms:Math.round(performance.now()-at),error:String(error?.message||error).slice(0,130)}}
}
async function publicRun(){
 const rounds=[];
 for(let round=0;round<3;round++){
  const batch=await Promise.all(Array.from({length:40},(_,i)=>timed(async()=>{
   const endpoint=SUPABASE_URL+'/rest/v1/rpc/qwiz_party_projection';
   const res=await fetch(endpoint,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({p_code:ROOM}),signal:AbortSignal.timeout(11000)});
   const body=await res.json();
   if(!res.ok||body.code!==ROOM)throw Error('HTTP '+res.status+': '+String(body?.message||'wrong room'));
   if(body?.question?.correct!==undefined||body?.question?.solution!==undefined)throw Error('Public response exposed solution');
   return body.phase;
  })));
  rounds.push(...batch);
  report('public_snapshot_batch_'+(round+1),batch);
  if(round<2)await sleep(1100);
 }
 if(!report('public_snapshot_120_requests',rounds))process.exitCode=1;
}
async function fullRun(){
 // Create only test-tagged anonymous accounts; operator will delete these IDs after the run.
 const signups=[];
 for(let i=0;i<40;i+=5){
  const batch=await Promise.all(Array.from({length:5},(_,j)=>{
   const id=i+j;
   const c=client();
   return timed(async()=>{
    const {data,error}=await c.auth.signInAnonymously({options:{data:{qwiz_performance_test:TAG}}});
    if(error||!data?.user?.id)throw Error('auth: '+(error?.message||'empty user'));
    return {client:c,id:data.user.id,number:id};
   });
  }));
  signups.push(...batch);
  await sleep(330);
 }
 report('real_anonymous_auth',signups);
 const users=signups.filter(x=>x.ok).map(x=>x.value);
 if(users.length!==40){console.error('AUTH_BLOCKED: required 40 distinct sessions, actual '+users.length);process.exitCode=1;return}
 const joins=await Promise.all(users.map((u,i)=>timed(async()=>{
  const {data,error}=await u.client.rpc('org_next_join',{p_code:ROOM,p_name:'Тестовый Участник '+String(i+1).padStart(2,'0'),p_group:'PERF40'});
  if(error||!data?.player_id)throw Error('join: '+(error?.message||'missing player'));
  return data;
 })));
 report('40_real_player_join',joins);
 if(joins.some(x=>!x.ok)){process.exitCode=1;return}
 const lobby=await Promise.all(users.map(u=>timed(async()=>{
  const {data,error}=await u.client.rpc('qwiz_party_state',{p_code:ROOM});
  if(error||data?.code!==ROOM)throw Error('state: '+(error?.message||'invalid code'));
  return {phase:data.phase,room_id:data.room_id};
 })));
 report('40_authenticated_room_reads',lobby);
 if(lobby.some(x=>!x.ok)){process.exitCode=1;return}
 console.log('ALL_40_JOINED_READY_FOR_QUESTION_STAGE');
 // The test fixture is started by operator after confirming 40 joins.
 let started=false;
 for(let i=0;i<60;i++){
  await sleep(1400);
  const {data,error}=await users[0].client.rpc('qwiz_party_state',{p_code:ROOM});
  if(!error&&data?.phase==='question'){started=true;break}
 }
 if(!started){console.error('QUESTION_STAGE_NOT_STARTED: stopping without answer writes');process.exitCode=1;return}
 const roomId=lobby[0]?.value?.room_id;
 if(!/^[0-9a-f-]{36}$/i.test(roomId||''))throw Error('Test room ID not resolved from authenticated state');
 const answers=await Promise.all(users.map((u,i)=>timed(async()=>{
  const {data,error}=await u.client.rpc('org_next_answer',{p_room:roomId,p_choice:i%2});
  if(error||!data?.accepted)throw Error('answer: '+(error?.message||'not confirmed'));
  return data;
 })));
 report('40_real_simultaneous_answers',answers);
 if(answers.some(x=>!x.ok))process.exitCode=1;
 const verify=await Promise.all(users.map(u=>timed(async()=>{
  const {data,error}=await u.client.rpc('qwiz_party_state',{p_code:ROOM});
  if(error||!data?.has_answer)throw Error('ack recovery: '+(error?.message||'no answer'));
  return data?.has_answer;
 })));
 report('40_answer_acknowledgments',verify);
 if(verify.some(x=>!x.ok))process.exitCode=1;
}
if(MODE==='public')await publicRun();else await fullRun();
