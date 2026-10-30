// Nonmutating 40-concurrent read probe of actual independent QWIZ Free.
// No Auth creation, no joins, no answers, no room changes, no source GOS traffic.
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const root=readFileSync(new URL('../../app.js',import.meta.url),'utf8');
const URL_=app.match(/const URL_SUPABASE='([^']+)'/)?.[1];
const KEY=app.match(/const KEY_SUPABASE='([^']+)'/)?.[1];
if(URL_!=='https://vwsoergltegncrretxnz.supabase.co' ||
 !KEY?.startsWith('sb_publishable_') ||
 !root.includes(URL_) || !root.includes(KEY))
 throw Error('Refusing smoke test: QWIZ browser endpoints not isolated on expected Free project');
const ctrl=ms=>AbortSignal.timeout(ms);
const health=await fetch(URL_+'/auth/v1/health',{headers:{apikey:KEY},signal:ctrl(12000)});
if(!health.ok)throw Error('New QWIZ Auth health endpoint failed HTTP '+health.status);
const attempts=await Promise.all(Array.from({length:40},async()=>{
 const start=performance.now();
 try {
  const response=await fetch(URL_+'/rest/v1/rpc/qwiz_party_projection',{
   method:'POST',headers:{apikey:KEY,'Content-Type':'application/json','Cache-Control':'no-store'},
   body:JSON.stringify({p_code:'FFFFFFFF'}),
   signal:ctrl(12000)
  });
  const j=await response.json();
  // An unknown room must raise P0001 before qwiz_tick, so these forty
  // concurrent requests remain strictly non-mutating in the new database.
  // This is an API/connectivity smoke, NOT a forty-player gameplay test.
  const expectedMissing=(response.status===400 && j?.code==='P0001' &&
    j?.message==='Комната не найдена');
  if(!expectedMissing)throw Error('Unexpected HTTP '+response.status+' / SQLSTATE '+String(j?.code||''));
  return {ok:true,ms:Math.round(performance.now()-start)};
 }catch(e){return {ok:false,error:String(e.message||e).slice(0,90),ms:Math.round(performance.now()-start)}}
}));
const ok=attempts.filter(x=>x.ok).map(x=>x.ms).sort((a,b)=>a-b);
const failures=attempts.filter(x=>!x.ok);
const p95=ok.length?ok[Math.max(0,Math.ceil(ok.length*.95)-1)]:null;
console.log(JSON.stringify({project:'independent QWIZ Free',requests:attempts.length,success:ok.length,failures:failures.length,p95_ms:p95,max_ms:ok.at(-1)??null,errors:failures.slice(0,3)}));
if(failures.length)process.exitCode=1;
