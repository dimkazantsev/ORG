/* PWA install/status. Gameplay and Supabase RPCs remain authoritative online. */
'use strict';
(()=>{
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 let deferred=null;
 const status=document.createElement('div');
 status.id='qwizPwaStatus';
 status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 status.hidden=true;
 status.style.cssText='position:fixed;z-index:3000;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);transform:translateX(-50%);max-width:calc(100vw - 28px);padding:10px 16px;background:#fff;color:#4a3568;border:1px solid #dfd2f2;border-radius:16px;box-shadow:0 8px 30px #3f2b5d25;font:600 13px system-ui,sans-serif;text-align:center;pointer-events:none';
 document.addEventListener('DOMContentLoaded',()=>document.body.append(status),{once:true});
 function show(msg){if(!status.isConnected)return;status.textContent=msg;status.hidden=false;}
 function update(){if(!navigator.onLine)show('Нет подключения. Ресурсы сохранены, ответы ожидают связи с сервером.');else if(status.isConnected){status.hidden=true;status.textContent='';}}
 window.addEventListener('offline',update);
 window.addEventListener('online',()=>{update();window.dispatchEvent(new CustomEvent('qwiz:connection-restored'));});
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;window.dispatchEvent(new CustomEvent('qwiz:pwa-install-ready'));});
 window.QwizPWA={install:async()=>{if(!deferred)return false;const e=deferred;deferred=null;await e.prompt();return (await e.userChoice).outcome==='accepted';},get canInstall(){return !!deferred;}};
 window.addEventListener('load',()=>{
  update();
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
   // Defer updates during active gameplay; never reload an ongoing room.
   const check=()=>{if(!document.hidden)reg.update().catch(()=>{});};
   document.addEventListener('visibilitychange',check);
  }).catch(err=>console.warn('QWIZ-PARTY: offline resources unavailable',err));
 });
})();