// QWIZ-PARTY / standalone, bounded 40-client Realtime test.
// Self-hosted target ONLY. No data mutations to QWIZ tables, no real classroom room.
// Requires Node 22+, @supabase/supabase-js v2 and a disposable fixture room.
import {performance} from 'node:perf_hooks';
import {createClient} from '@supabase/supabase-js';
import {resolveLoadTarget} from './target.mjs';

const {target,url,key} = resolveLoadTarget(process.env,'','');
if(target!=='selfhost') throw Error('Realtime test requires QWIZ_LOAD_TARGET=selfhost');
const room = (process.env.QWIZ_LOAD_ROOM || '').toUpperCase().trim();
if(!/^[A-F0-9]{8}$/.test(room)) throw Error('QWIZ_LOAD_ROOM must be an isolated eight-character hexadecimal fixture code');
const number = (name,defaultValue,min,max) => {
 const raw=process.env[name];
 const v=raw===undefined?defaultValue:Number(raw);
 if(!Number.isInteger(v)||v<min||v>max) throw Error(name+' must be between '+min+' and '+max);
 return v;
};
const CLIENTS=number('QWIZ_WS_CLIENTS',40,1,40);
const EVENTS=number('QWIZ_WS_EVENTS',10,1,20);
const HOLD_MS=number('QWIZ_WS_HOLD_MS',5000,0,120000);
const JOIN_TIMEOUT=15000, DELIVERY_TIMEOUT=6000;
const EVENT='qwiz_perf_probe';
const TOPIC='org-next-'+room;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const percentile=(arr,p)=>{
 if(!arr.length)return null;
 const sorted=[...arr].sort((a,b)=>a-b);
 return Math.round(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]*10)/10;
};
const stats=arr=>({
 count:arr.length,p50_ms:percentile(arr,.5),p95_ms:percentile(arr,.95),
 p99_ms:percentile(arr,.99),max_ms:arr.length?Math.round(Math.max(...arr)*10)/10:null
});
function client(){
 return createClient(url,key,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  realtime:{params:{eventsPerSecond:10}}
 });
}
const clients=[],channels=new Map(),drops=[],received=new Map(),sentAt=new Map();
let shuttingDown=false;
async function join(index){
 const c=clients[index];
 const ch=c.channel(TOPIC,{config:{private:false,broadcast:{ack:false,self:false}}});
 ch.on('broadcast',{event:EVENT},message=>{
  const seq=message?.payload?.sequence;
  if(!Number.isInteger(seq)||!sentAt.has(seq))return;
  const samples=received.get(seq);
  if(samples&&!samples.has(index))samples.set(index,performance.now()-sentAt.get(seq));
 });
 const start=performance.now();
 try{
  const elapsed=await new Promise((resolve,reject)=>{
   let done=false;
   const timer=setTimeout(()=>finish(new Error('subscribe timeout '+index)),JOIN_TIMEOUT);
   function finish(error){
    if(done)return;
    done=true;clearTimeout(timer);
    if(error)reject(error);else resolve(performance.now()-start);
   }
   ch.subscribe((status,error)=>{
    if(status==='SUBSCRIBED')finish();
    else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
     if(!done)finish(new Error(index+' status '+status+' '+(error?.message||'')));
     else if(!shuttingDown) drops.push({client:index,status});
    }
   });
  });
  channels.set(index,ch);
  return elapsed;
 }catch(e){
  try{await c.removeChannel(ch)}catch{}
  throw e;
 }
}
async function oneBroadcast(seq){
 const samples=new Map();
 received.set(seq,samples);
 sentAt.set(seq,performance.now());
 const channel=clients[0].channel(TOPIC,{config:{private:false}});
 // httpSend makes a REST request; it never opens a publisher WebSocket.
 const status=await channel.httpSend(EVENT,{sequence:seq,marker:'QWIZ-WS-ISOLATED-TEST'});
 if(status!=='ok'&&status?.status!=='ok')throw Error('Broadcast request was not accepted: '+String(status));
 const until=performance.now()+DELIVERY_TIMEOUT;
 while(samples.size<CLIENTS&&performance.now()<until)await sleep(25);
 const result={sequence:seq,received:samples.size,missing:CLIENTS-samples.size,...stats([...samples.values()])};
 received.delete(seq);sentAt.delete(seq);
 return result;
}
async function burst(start,count){
 const reports=[];
 for(let seq=start;seq<start+count;seq++){
  reports.push(await oneBroadcast(seq));
  await sleep(120);
 }
 return {attempted:count,delivered:reports.reduce((n,x)=>n+x.received,0),
  expected:CLIENTS*count,missing:reports.reduce((n,x)=>n+x.missing,0),
  ...stats(reports.flatMap(x=>x.count?Array.from({length:0}):[])),per_event:reports};
}
async function main(){
 if(typeof globalThis.WebSocket!=='function')throw Error('Node 22+ with WebSocket support is required');
 const pre=client();
 const {data,error}=await pre.rpc('qwiz_party_projection',{p_code:room});
 if(error||data?.title!=='QWIZ LOAD 40 · disposable fixture')throw Error('Refusing websocket test: dedicated QWIZ LOAD 40 fixture not verified');
 console.log('QWIZ WS isolated preflight: '+JSON.stringify({target,url:new URL(url).origin,topic:TOPIC,clients:CLIENTS,events:EVENTS,hold_ms:HOLD_MS}));
 for(let i=0;i<CLIENTS;i++)clients.push(client());
 const connected=await Promise.allSettled(clients.map((_,i)=>join(i)));
 const failed=connected.filter(x=>x.status==='rejected');
 if(failed.length)throw Error('Realtime subscriptions failed: '+failed.length+'; first '+String(failed[0].reason));
 const joins=connected.map(x=>x.value);
 console.log('QWIZ_WS_JOIN '+JSON.stringify({subscribed:joins.length,failures:0,...stats(joins)}));
 const before=await burst(1,EVENTS);
 console.log('QWIZ_WS_BROADCAST '+JSON.stringify(before));
 // Keep 40 sockets open for a bounded period and detect unexpected closures.
 await sleep(HOLD_MS);
 // Recreate 10 independent socket subscriptions; this is resubscription, not a physical Wi-Fi outage.
 const indices=Array.from({length:Math.min(10,CLIENTS)},(_,i)=>i);
 const reconnect=await Promise.allSettled(indices.map(async i=>{
  const old=channels.get(i);
  await clients[i].removeChannel(old);
  channels.delete(i);
  return join(i);
 }));
 const failures=reconnect.filter(x=>x.status==='rejected');
 console.log('QWIZ_WS_REJOIN '+JSON.stringify({attempted:indices.length,successful:indices.length-failures.length,failed:failures.length,...stats(reconnect.filter(x=>x.status==='fulfilled').map(x=>x.value))}));
 if(failures.length)throw Error('Reconnect failed for '+failures.length+' subscribers');
 const after=await burst(1000,Math.min(EVENTS,5));
 console.log('QWIZ_WS_AFTER_REJOIN '+JSON.stringify(after));
 const result={ok:before.missing===0&&after.missing===0&&drops.length===0,
  clients:CLIENTS,topic:TOPIC,join:stats(joins),
  initial_broadcast:{expected:before.expected,delivered:before.delivered,missing:before.missing,
   p95_ms:percentile(before.per_event.map(e=>e.p95_ms).filter(x=>x!==null),.95)},
  rejoin:{count:indices.length,failures:0},
  after_rejoin:{expected:after.expected,delivered:after.delivered,missing:after.missing,
   p95_ms:percentile(after.per_event.map(e=>e.p95_ms).filter(x=>x!==null),.95)},
  unexpected_channel_closures:drops.length};
 console.log('QWIZ_WS_SUMMARY '+JSON.stringify(result));
 if(!result.ok)process.exitCode=1;
}
try{await main()}catch(error){console.error('QWIZ_WS_ERROR',String(error?.message||error));process.exitCode=1}
finally{
 shuttingDown=true;
 await Promise.allSettled(clients.map(c=>c.removeAllChannels()));
 for(const c of clients){try{c.realtime.disconnect()}catch{}}
}
