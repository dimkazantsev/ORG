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
 function update(){if(!navigator.onLine)show('Нет сети. Интерфейс доступен, отправка ответов временно невозможна.');else if(status.isConnected){status.hidden=true;status.textContent='';}}
 window.addEventListener('offline',update);
 window.addEventListener('online',()=>{update();window.dispatchEvent(new CustomEvent('qwiz:connection-restored'));});
 const installButton=document.createElement('button');
 installButton.type='button';installButton.id='qwizInstallApp';installButton.textContent='Установить приложение';
 installButton.style.cssText='display:none;width:100%;margin-top:12px;padding:11px 16px;border:1px solid #d9c9f5;border-radius:13px;background:#f7f2ff;color:#603bb1;font:700 14px system-ui,sans-serif;cursor:pointer';
 installButton.addEventListener('click',async()=>{
  if(await window.QwizPWA.install())installButton.style.display='none';
 });
 document.addEventListener('DOMContentLoaded',()=>{
  const entry=document.querySelector('#homeView .entry');
  if(entry){entry.append(installButton);if(deferred)installButton.style.display='block';}
 },{once:true});
 window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferred=e;
  installButton.style.display='block';
  window.dispatchEvent(new CustomEvent('qwiz:pwa-install-ready'));
 });
 window.addEventListener('appinstalled',()=>{deferred=null;installButton.style.display='none';});
 window.QwizPWA={install:async()=>{if(!deferred)return false;const e=deferred;deferred=null;await e.prompt();return (await e.userChoice).outcome==='accepted';},get canInstall(){return !!deferred;}};
 window.addEventListener('load',()=>{
  update();
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
   // A previously installed PWA can stay on an old worker indefinitely.
   // Activate a waiting update at the HOME screen only; NEVER reload a live game.
   const activateOnHome=()=>{
    const game=document.getElementById('gameView');
    if(game&&!game.hidden)return; // never take over an active student round
    const roomPage=document.getElementById('roomsPage');
    if(roomPage&&!roomPage.hidden&&document.getElementById('liveConsole')&&!document.getElementById('liveConsole').hidden)return; // protect active teacher session
    reg.waiting?.postMessage({type:'SKIP_WAITING'});
   };
   activateOnHome();
   reg.addEventListener('updatefound',()=>{
    const worker=reg.installing;if(!worker)return;
    worker.addEventListener('statechange',()=>{
     if(worker.state==='installed')activateOnHome();
    });
   });
   const check=()=>{
    if(document.hidden)return;
    reg.update().then(activateOnHome).catch(()=>{});
   };
   document.addEventListener('visibilitychange',check);
   window.addEventListener('pageshow',check);
  }).catch(err=>console.warn('QWIZ-PARTY: offline resources unavailable',err));
 });
})();