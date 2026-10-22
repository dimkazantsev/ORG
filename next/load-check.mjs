// QWIZ-PARTY: bounded, opt-in test of 40 simultaneous PUBLIC SCREEN reads.
// Not a 40-player game simulation. No account credentials, answer submissions or mutations.
// Usage: QWIZ_ROOM_CODE=ABCDEF12 QWIZ_PUBLIC_KEY=sb_publishable_... node next/load-check.mjs
const code=(process.env.QWIZ_ROOM_CODE||'').trim().toUpperCase();
const key=(process.env.QWIZ_PUBLIC_KEY||'').trim();
const base=(process.env.QWIZ_SUPABASE_URL||'https://bderfrcfuhnutuoyudje.supabase.co').replace(/\/+$/,'');
const concurrency=Math.max(1,Math.min(40,Number(process.env.QWIZ_CONCURRENCY||40)));
if(!/^[A-F0-9]{8}$/.test(code)||!key){
 console.error('Provide a valid QWIZ_ROOM_CODE (8 hex characters) and QWIZ_PUBLIC_KEY. No request sent.');
 process.exitCode=2;
}else{
 const endpoint=base+'/rest/v1/rpc/qwiz_public_screen';
 const run=async(i)=>{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);
  const start=performance.now();
  try{
   const response=await fetch(endpoint,{method:'POST',signal:ctrl.signal,
    headers:{apikey:key,'Content-Type':'application/json','Cache-Control':'no-store'},
    body:JSON.stringify({p_code:code})});
   const result=await response.json();
   if(!response.ok||result?.code!==code)throw Error('HTTP '+response.status+' unexpected room state');
   if(result?.question?.correct!==undefined||result?.question?.solution!==undefined)throw Error('Audience answer-key exposure');
   return {ok:true,ms:Math.round(performance.now()-start)};
  }catch(error){return {ok:false,ms:Math.round(performance.now()-start),error:String(error.message).slice(0,120)}}
  finally{clearTimeout(timer)}
 };
 console.log('QWIZ bounded public read check:',concurrency,'one-time concurrent calls (not a gameplay test)');
 const result=await Promise.all(Array.from({length:concurrency},(_,i)=>run(i)));
 const sorted=result.map(r=>r.ms).sort((a,b)=>a-b);
 const percentile=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
 const failed=result.filter(r=>!r.ok);
 console.log(JSON.stringify({concurrency,successful:result.length-failed.length,failed:failed.length,
  p50_ms:percentile(.5),p95_ms:percentile(.95),max_ms:sorted.at(-1),errors:failed.slice(0,4)},null,2));
 if(failed.length)process.exitCode=1;
}
