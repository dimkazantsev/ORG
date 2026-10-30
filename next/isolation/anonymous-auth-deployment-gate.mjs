// Nonmutating deploy gate: students require enabled Supabase anonymous sign-in.
// Reports config only; never creates users, sessions or game data.
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const url=app.match(/const URL_SUPABASE='([^']+)'/)?.[1];
const key=app.match(/const KEY_SUPABASE='([^']+)'/)?.[1];
if(url!=='https://vwsoergltegncrretxnz.supabase.co'||!key?.startsWith('sb_publishable_')) {
  throw Error('QWIZ frontend is not configured for independent Free project');
}
const r=await fetch(url+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(10000)});
if(!r.ok)throw Error('Cannot check QWIZ Free Auth settings: HTTP '+r.status);
const settings=await r.json();
const enabled=settings?.external?.anonymous_users;
console.log(JSON.stringify({new_qwiz_auth_health:true,anonymous_sign_in_enabled:enabled===true}));
if(enabled!==true) {
  throw Error('ANONYMOUS_SIGNIN_DISABLED: Enable Anonymous Sign-Ins in new QWIZ Free Supabase Authentication > Providers before deploying frontend. Do not change old GOS.');
}
