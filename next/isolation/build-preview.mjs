// Offline-only staging build for BOTH QWIZ frontends: /ORG/ and /ORG/next/.
// Never modifies tracked files, never deploys, never accesses Supabase.
// Generated build uses a separate public backend and lives under ignored .local/.
import {cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateBoundary} from './boundary.mjs';

const repo=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const rootApp=await readFile(join(repo,'app.js'),'utf8');
const nextApp=await readFile(join(repo,'next/app.js'),'utf8');
const legacyUrl=rootApp.match(/const SUPABASE_URL\s*=\s*["']([^"']+)["']/)?.[1];
const legacyKey=rootApp.match(/const SUPABASE_KEY\s*=\s*["']([^"']+)["']/)?.[1];
const nextUrl=nextApp.match(/const URL_SUPABASE\s*=\s*["']([^"']+)["']/)?.[1];
const nextKey=nextApp.match(/const KEY_SUPABASE\s*=\s*["']([^"']+)["']/)?.[1];
if(!legacyUrl||!legacyKey||!nextUrl||!nextKey||legacyUrl!==nextUrl||legacyKey!==nextKey)
 throw Error('Current QWIZ entrypoints use mismatched/unknown backend config; refusing build');
const cfg=validateBoundary({
 gosUrl:process.env.GOS_SUPABASE_URL||legacyUrl,oldQwizUrl:legacyUrl,
 newQwizUrl:process.env.QWIZ_NEW_SUPABASE_URL,
 newQwizKey:process.env.QWIZ_NEW_SUPABASE_PUBLISHABLE_KEY
});
const output=join(repo,'.local','qwiz-isolation-preview');
const dest=join(output,'ORG');
await rm(output,{recursive:true,force:true});
await mkdir(dest,{recursive:true});
const entries=['index.html','app.js','styles.css','design-2026.css','studio-2026.css','ui-ux-pro-max.css','favicon.svg','next','lib','data'];
for(const entry of entries){
 try{
  await cp(join(repo,entry),join(dest,entry),{
   recursive:true,
   filter:path=>!(/(?:^|[\\/])(?:migrations|isolation|selfhost|docs|scripts|__tests__|test-results)(?:[\\/]|$)/.test(path))&&!/\.(?:sql|test\.mjs|spec\.mjs)$/.test(path)
  });
 }catch(error){if(error.code==='ENOENT')throw Error('Missing required website asset '+entry);throw error}
}
const safeExtensions=new Set(['.html','.js','.css','.json','.webmanifest']);
let changed=0,scanned=0;
async function patch(directory){
 for(const ent of await readdir(directory,{withFileTypes:true})){
  const file=join(directory,ent.name);
  if(ent.isDirectory()){await patch(file);continue}
  if(!safeExtensions.has(extname(file)))continue;
  const src=await readFile(file,'utf8');
  const rewritten=src.replaceAll(legacyUrl,cfg.next).replaceAll(legacyKey,process.env.QWIZ_NEW_SUPABASE_PUBLISHABLE_KEY);
  if(rewritten!==src){await writeFile(file,rewritten);changed++}
  scanned++;
  if(rewritten.includes(legacyUrl))throw Error('A stale legacy endpoint survived in '+ent.name);
 }
}
await patch(dest);
if(changed<3)throw Error('Unexpectedly few backend references updated; preview not trustworthy');
console.log(JSON.stringify({preview:output,frontend:'both QWIZ versions',oldHost:new URL(legacyUrl).host,newHost:new URL(cfg.next).host,scanned,changed},null,2));
console.log('Staging preview only: no production files or existing Supabase data have changed.');
