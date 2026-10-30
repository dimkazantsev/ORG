// All output is read-only / local. No network or Supabase mutations.
const CLOUD=/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i;
const LOCAL=/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/i;
export function apiOrigin(value,label){
 let u;try{u=new URL(String(value||''))}catch{throw Error(label+' must be an absolute URL')}
 if(u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error(label+' must be a plain API origin');
 if(u.protocol!=='https:'&&!LOCAL.test(u.origin))throw Error(label+' must use HTTPS, except localhost');
 return u.origin.toLowerCase();
}
export function requirePublicKey(key){
 if(typeof key!=='string'||!key.trim())throw Error('Missing QWIZ publishable or anon key');
 if(key.startsWith('sb_secret_')||key.startsWith('sb_service_role_'))throw Error('Secret/service-role key cannot be exposed to QWIZ browser');
 if(key.startsWith('sb_publishable_'))return;
 const p=key.split('.');
 if(p.length!==3)throw Error('Use a publishable or legacy anon key');
 try{if(JSON.parse(Buffer.from(p[1],'base64url').toString('utf8')).role==='anon')return}catch{}
 throw Error('Only JWT role=anon is allowed');
}
export function validateBoundary({gosUrl,oldQwizUrl,newQwizUrl,newQwizKey}){
 const gos=apiOrigin(gosUrl,'GOS URL'),old=apiOrigin(oldQwizUrl,'Legacy QWIZ URL');
 const next=apiOrigin(newQwizUrl,'New QWIZ URL');
 requirePublicKey(newQwizKey);
 if(gos!==old)throw Error('Expected legacy QWIZ and GOS to share the original Supabase project during migration');
 if(next===gos)throw Error('QWIZ remains in GOS Supabase; a new project ref is required');
 if(next.endsWith('.supabase.co')&&CLOUD.test(next)&&CLOUD.exec(next)[1]===CLOUD.exec(gos)?.[1])
  throw Error('GOS and QWIZ cannot have the same Supabase project ref');
 return {gos,next,isolated:true};
}
