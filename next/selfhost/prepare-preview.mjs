// Create a LOCAL preview of QWIZ-PARTY wired to an isolated self-hosted backend.
// Does not edit next/ and NEVER publishes or commits the generated preview.
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveLoadTarget} from './target.mjs';

const repoRoot=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const from=join(repoRoot,'next');
const out=join(repoRoot,'visual-artifacts','qwiz-selfhost-preview');
const to=join(out,'ORG','next');
const app=await readFile(join(from,'app.js'),'utf8');
const origin=app.match(/const URL_SUPABASE='([^']+)'/)?.[1];
const key=app.match(/const KEY_SUPABASE='([^']+)'/)?.[1];
if(!origin||!key)throw Error('Cannot determine frontend API placeholders: refusing preview');
const target=resolveLoadTarget(process.env,origin,key);
if(target.target!=='selfhost')throw Error('Refusing to generate a cloud-backed preview');
await rm(out,{recursive:true,force:true});
await mkdir(join(out,'ORG'),{recursive:true});
const ignored=new Set(['migrations','docs','scripts','selfhost','test-results']);
await cp(from,to,{recursive:true,filter:p=>{
 const rel=p.slice(from.length).replace(/^[\\/]/,'');
 const first=rel.split(/[\\/]/)[0];
 return !ignored.has(first) && !/\.(?:sql|test\.mjs|spec\.mjs)$/.test(p);
}});
await cp(join(repoRoot,'favicon.svg'),join(out,'ORG','favicon.svg'));
const suffix=new Set(['.js','.html','.css','.json','.webmanifest']);
let replaced=0,files=0;
async function walk(dir){
 for(const e of await readdir(dir,{withFileTypes:true})){
  const file=join(dir,e.name);
  if(e.isDirectory()){await walk(file);continue}
  if(!suffix.has(extname(e.name)) && !e.name.endsWith('.webmanifest'))continue;
  const text=await readFile(file,'utf8');
  const change=text.split(origin).join(target.url).split(key).join(target.key);
  if(change!==text){await writeFile(file,change);replaced++;}files++;
 }
}
await walk(to);
if(replaced===0)throw Error('Frontend API endpoint was not replaced');
console.log(JSON.stringify({preview:out,sourceFilesScanned:files,replacedFiles:replaced,apiOrigin:target.url},null,2));
console.log('Serve this directory only on a separate test origin; NEVER deploy it over /ORG/ production.');
