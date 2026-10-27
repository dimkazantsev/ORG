/* QWIZ-PARTY PWA v1: static shell only; never cache Supabase, RPC or private answers. */
'use strict';
const VERSION='qwiz-pwa-shell-20261027-v22';
const STATIC=VERSION+'-static';
const PAGES=VERSION+'-pages';
const SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const ROOT=new URL('./',self.registration.scope);
const SHELL=['./','./index.html','./workspace.html','./presenter.html','./profile.html','./manifest.webmanifest','./pwa-icon.svg','../favicon.svg','./assets/manrope-variable.ttf','./theme.css','./stage.css','./stage.js','./app.js','./app.css','./arcade.js','./arcade.css','./player-layout.js','./player-layout.css','./russia-geo.js','./russia-geo.css','./lobby.css','./motion.css','./teams.js','./teams.css','./avatar-art.js','./workspace.js','./workspace.css','./workspace-teams.js','./presenter.js','./presenter.css','./profile.js','./profile.css','./vendor/qrcode.min.js'];
const assetPaths=new Set(SHELL.map(p=>new URL(p,ROOT).pathname));
const pagePaths=new Set(['./','./index.html','./workspace.html','./presenter.html','./profile.html'].map(p=>new URL(p,ROOT).pathname));
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(STATIC);
  // Static shell must be complete before an offline install is usable.
  await cache.addAll(SHELL.map(p=>new URL(p,ROOT).href));
  // Only the public JS SDK (never Supabase API data) can be available offline.
  try{const sdk=await fetch(SDK,{mode:'no-cors',signal:AbortSignal.timeout(4500)});await cache.put(SDK,sdk);}catch{ /* Optional CDN cache may fail without blocking PWA installation. */ }
  // No skipWaiting: an active game must not swap worker versions mid-round.
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('qwiz-pwa-')&&!k.startsWith(VERSION)).map(k=>caches.delete(k)));
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
 if(event.data?.type==='CACHE_READY'&&event.ports?.[0]){
  event.waitUntil(caches.has(STATIC).then(ok=>event.ports[0].postMessage({ready:ok})));
 }
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.href===SDK){
  // Pin only the public SDK used by the HTML shell; never store network RPCs.
  event.respondWith((async()=>{
   const c=await caches.open(STATIC);
   try{const response=await fetch(req);if(response.ok||response.type==='opaque')await c.put(SDK,response.clone());return response;}
   catch{return await c.match(SDK)||Response.error();}
  })());return;
 }
 if(url.origin!==self.location.origin)return; // all API/auth/other CDN traffic is network-only
 if(!url.pathname.startsWith(ROOT.pathname))return;
 if(url.pathname.includes('/rest/')||url.pathname.includes('/auth/')||url.pathname.includes('/realtime/'))return;
 if(req.mode==='navigate'){
  if(!pagePaths.has(url.pathname))return;
  event.respondWith((async()=>{
   try{const res=await fetch(req);if(res.ok){const c=await caches.open(PAGES);await c.put(url.pathname,res.clone());}return res;}
   catch{const c=await caches.open(PAGES);return await c.match(url.pathname)||await caches.match(url.pathname)||Response.error();}
  })());
  return;
 }
 if(assetPaths.has(url.pathname)||url.pathname.startsWith(new URL('./assets/',ROOT).pathname)){
  event.respondWith((async()=>{
   const c=await caches.open(STATIC);
   // Versioned URLs always use their own cache key: never combine a new HTML
   // with stale JS/CSS from an older deployment. Keep offline fallback shell.
   const key=url.pathname+url.search;
   const hit=await c.match(key);
   if(hit)return hit;
   try{const res=await fetch(req);if(res.ok&&res.type==='basic')await c.put(key,res.clone());return res;}
   catch{return await c.match(url.pathname)||Response.error();}
  })());
 }
});