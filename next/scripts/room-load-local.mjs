// QWIZ-PARTY isolated 40-client HTTP benchmark. NEVER contacts production Supabase.
// Models full state JSON for 15 teams and 40 players. Measures localhost ONLY.
// node next/scripts/room-load-local.mjs [--output visual-artifacts/room-load-local.json]
import {createServer} from 'node:http';
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import assert from 'node:assert/strict';

const clients=40;
const teams=Array.from({length:15},(_,i)=>({
 id:'team-'+i,name:'Команда '+(i+1),score:100*(15-i),
 rank:i+1,members:i<10?3:2,answered:i%3
}));
const players=Array.from({length:40},(_,i)=>({
 id:'player-'+i,nickname:'Участник '+(i+1),
 team_id:'team-'+(i%15),score:100*(i%8),
 has_answer:i%2===0,correct:i%4,position:i+1
}));
const sample={
 code:'A1B2C3D4',room_id:'fixture-only',title:'Изолированная игра с 40 участниками',
 phase:'question',index:3,total:16,paused:false,duration:30,
 question:{kind:'single',prompt:'Какое государство изображено на флаге?',
  options:['Российская Федерация','Республика Казахстан','Республика Беларусь','Кыргызская Республика'],
  media_url:'/next/assets/flags-world/ru.svg'},
 teams,players,public_stats:{teams,players},answers_count:20,eligible:true,has_answer:false
};
const byteLength=s=>Buffer.byteLength(s,'utf8');
const percentile=(values,fraction)=>values.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*fraction)-1)];
const fixed=n=>Math.round(n*100)/100;
async function main(){
 let receivedRequests=0;
 let serverBytesIn=0,serverBytesOut=0;
 const requestsPerSecond=new Map();
 const startTime=performance.now();
 const server=createServer(async(req,res)=>{
  if(req.method!=='POST'||req.url!=='/rest/v1/rpc/qwiz_party_state'){
   res.writeHead(404);res.end();return;
  }
  let body='';
  for await(const chunk of req)body+=chunk;
  const size=byteLength(body);
  serverBytesIn+=size;
  const n=receivedRequests++;
  const second=Math.floor((performance.now()-startTime)/1000);
  requestsPerSecond.set(second,(requestsPerSecond.get(second)||0)+1);
  let player=0;
  try{
   const input=JSON.parse(body);
   player=Number(input.player);
   assert.equal(input.p_code,'A1B2C3D4');
   assert(Number.isInteger(player)&&player>=0&&player<clients);
  }catch{
   res.writeHead(400);res.end('Invalid local fixture request');return;
  }
  // Predictable simulated server work. This is not a Supabase latency sample.
  await new Promise(resolve=>setTimeout(resolve,20+5*(n%7)));
  const response=JSON.stringify({...sample,
   server_now:new Date().toISOString(),
   ends_at:new Date(Date.now()+30000).toISOString(),
   me:{id:'player-'+player,team_id:'team-'+(player%15)}
  });
  const bytes=byteLength(response);
  serverBytesOut+=bytes;
  res.writeHead(200,{'Content-Type':'application/json','Content-Length':bytes,
   'Cache-Control':'no-store'});res.end(response);
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 try{
  const url='http://127.0.0.1:'+server.address().port+'/rest/v1/rpc/qwiz_party_state';
  const send=async(player)=>{
   const body=JSON.stringify({p_code:'A1B2C3D4',player});
   const start=performance.now();
   const response=await fetch(url,{method:'POST',
    headers:{'Content-Type':'application/json'},body});
   const raw=await response.text();
   const data=JSON.parse(raw);
   assert.equal(response.status,200);
   assert.equal(data.code,'A1B2C3D4');
   assert.equal(data.me.id,'player-'+player);
   assert.equal(data.players.length,40);
   return {player,ms:performance.now()-start,request_bytes:byteLength(body),
    response_bytes:byteLength(raw)};
  };
  // First burst is a genuine wave of 40 concurrent LOCAL HTTP requests.
  const burst=await Promise.all(Array.from({length:clients},(_,i)=>send(i)));
  // Second wave is the next poll for each virtual player, staggered over 2s
  // (accelerated by 10x; do NOT misrepresent this as 20s observed traffic).
  const staggered=await Promise.all(Array.from({length:clients},(_,i)=>
   new Promise((resolve,reject)=>setTimeout(()=>send(i).then(resolve,reject),
    Math.round(i*1900/(clients-1))))));
  const rows=[...burst,...staggered];
  const inBytes=rows.reduce((n,x)=>n+x.request_bytes,0);
  const outBytes=rows.reduce((n,x)=>n+x.response_bytes,0);
  assert.equal(receivedRequests,80);
  assert.equal(serverBytesIn,inBytes);
  assert.equal(serverBytesOut,outBytes);
  const meanJsonBytes=(inBytes+outBytes)/rows.length;
  const pollIntervalSec=20;
  const sessionMinutes=90;
  const sessionsPerMonth=20;
  const perSession=meanJsonBytes*clients*sessionMinutes*60/pollIntervalSec;
  const report={
   scope:'LOCAL_LOOPBACK_SYNTHETIC_NO_SUPABASE',
   description:'15 teams, 40 synthetic players, 40 simultaneous reads and 40 staggered reads',
   virtual_clients:clients,local_http_requests:rows.length,
   requests_successful:rows.length,requests_failed:0,
   burst:{count:burst.length,p50_ms:fixed(percentile(burst.map(x=>x.ms),.5)),
    p95_ms:fixed(percentile(burst.map(x=>x.ms),.95))},
   staggered:{count:staggered.length,p50_ms:fixed(percentile(staggered.map(x=>x.ms),.5)),
    p95_ms:fixed(percentile(staggered.map(x=>x.ms),.95))},
   peak_local_requests_per_second:Math.max(...requestsPerSecond.values()),
   measured_json_body_bytes:{requests:inBytes,responses:outBytes,
    avg_per_read:fixed(meanJsonBytes),headers_tls_websocket_excluded:true},
   projection_only_not_measured:{
    assumed_poll_interval_seconds:pollIntervalSec,
    assumed_session_minutes:sessionMinutes,
    assumed_sessions_per_month:sessionsPerMonth,
    mib_json_per_session:fixed(perSession/1048576),
    gib_json_per_month:fixed(perSession*sessionsPerMonth/1073741824),
    excludes:'assets, TLS/HTTP headers, WebSocket, auth, extra event-triggered polls'
   },
   caveat:'No production or Supabase calls; local mock latency cannot establish real-world latency or concurrent player capacity'
  };
  const outputAt=process.argv.indexOf('--output');
  if(outputAt>=0&&process.argv[outputAt+1]){
   const filepath=process.argv[outputAt+1];
   await mkdir(dirname(filepath),{recursive:true});
   await writeFile(filepath,JSON.stringify(report,null,2)+'\n');
  }
  console.log('QWIZ LOCAL LOAD '+JSON.stringify(report));
 }finally{await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
