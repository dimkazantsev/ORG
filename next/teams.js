'use strict';
// Invitation links carry a team and optional inviter, never a session or password.
window.QwizTeams=(()=>{
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const animals=new Set(['fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear',
  'giraffe','gorilla','hyena','kangaroo','leopard','lion','orca','polarbear','rhinoceros','toucan','turtle','wolf','zebra']);
 const qrCache=new WeakMap();
 // Some early raster atlases were blank/corrupt. Render the verified SVG
 // portraits unless a real multi-portrait atlas loads and decodes successfully.
 if(typeof Image==='function'){
  const atlas=new Image();
  atlas.onload=()=>{
   if(atlas.naturalWidth>=240&&atlas.naturalHeight>=180 &&
      Math.abs(atlas.naturalWidth/atlas.naturalHeight-4/3)<.15)
     document.documentElement.classList.add('portrait-atlas-verified');
  };
  atlas.onerror=()=>document.documentElement.classList.remove('portrait-atlas-verified');
  atlas.src='./assets/animal-portraits.webp?v=portrait-check-20261024-1';
 }
 function intent(search=location.search){const p=new URLSearchParams(search),team=p.get('team'),via=p.get('via'),room=p.get('room');
  return {room:room?.toUpperCase(),team:team&&uuid.test(team)?team:null,via:via&&uuid.test(via)?via:null,invalid:(team!==null&&!uuid.test(team))||(via!==null&&(!uuid.test(via)||!team))};}
 function joinRequest(code,name,group=''){
  const target=intent();if(target.room===code&&target.invalid)throw Error('Некорректное приглашение. Попросите новый QR-код.');
  const args={p_code:code,p_name:name,p_group:group};
  return target.room===code&&target.team?{method:'qwiz_join_team',args:{...args,p_team:target.team,p_inviter:target.via}}:{method:'org_next_join',args};
 }
 function url(code,team=null,via=null){const u=new URL('./',location.href);u.searchParams.set('room',code);
  if(team&&uuid.test(team))u.searchParams.set('team',team);if(via&&uuid.test(via))u.searchParams.set('via',via);return u.toString();}
 function avatar(key){
  const safe=animals.has(key)?key:'fox';
  const src=window.QwizAvatarArt?.[safe]||
   (safe==='red-panda'?window.QwizAvatarArt?.redpanda:
    safe==='bear'?window.QwizAvatarArt?.polarbear:null);
  const fallback=['fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear'].includes(safe)?safe:'fox';
  return '<span class="team-avatar animal-portrait'+(src?' has-avatar-photo':'')+'" role="img" aria-label="Персонаж" data-animal="'+safe+'">'+
    (src?'<img class="animal-photo" src="'+escape(src)+'" alt="" loading="lazy" decoding="async">':'')+
    '<svg class="animal-fallback-svg" viewBox="0 0 100 100" aria-hidden="true"><use href="./assets/animals.svg?v=avatar-safe-20261024-2#'+fallback+'"></use></svg></span>';
 }
 document.addEventListener('error',e=>{
  if(e.target?.matches?.('.animal-photo'))e.target.closest('.animal-portrait')?.classList.add('avatar-photo-failed');
 },true);
 function qr(node,link,size=180){if(!node||qrCache.get(node)===link+':'+size)return;node.replaceChildren();
  if(typeof QRCode!=='function'){node.textContent='QR-код недоступен. Используйте ссылку.';return;}
  new QRCode(node,{text:link,width:size,height:size,colorDark:'#33234f',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  qrCache.set(node,link+':'+size);const img=node.querySelector('img');if(img)img.alt='QR-код входа в команду';}
 async function copy(link,feedback){try{await navigator.clipboard.writeText(link);feedback.textContent='Ссылка скопирована.';}catch{feedback.textContent='Выделите и скопируйте ссылку выше.';}}
 function showQr({code,team,inviter=null,title='Приглашение в команду'}){
  let dialog=document.getElementById('teamQrDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='teamQrDialog';dialog.className='team-qr-dialog';dialog.setAttribute('aria-labelledby','teamQrTitle');document.body.append(dialog);}
  const link=url(code,team?.id,inviter);
  dialog.innerHTML='<div class="team-dialog-head"><div><span class="eyebrow">ВХОД ПО QR</span><h2 id="teamQrTitle">'+escape(title)+'</h2></div><button type="button" data-qr-close aria-label="Закрыть приглашение">×</button></div>'+
   '<div class="team-dialog-identity">'+(team?QwizStage.icon(team,true):'')+'<strong>'+escape(team?.name||code)+'</strong></div><div class="team-qr-large"></div><p class="team-qr-caption">Сканируйте QR-код для входа в текущую игру.</p><label>Ссылка на команду<input class="team-invite-url" readonly value="'+escape(link)+'"></label><p class="team-copy-status" role="status"></p><div class="team-dialog-actions"><button type="button" class="secondary-button" data-qr-copy>Скопировать ссылку</button><button type="button" class="primary-button" data-qr-close>Закрыть</button></div>';
  for(const b of dialog.querySelectorAll('[data-qr-close]'))b.onclick=()=>dialog.close();
  dialog.querySelector('[data-qr-copy]').onclick=()=>copy(link,dialog.querySelector('[role="status"]'));
  dialog.onclick=e=>{if(e.target===dialog)dialog.close();};qr(dialog.querySelector('.team-qr-large'),link,256);if(!dialog.open)dialog.showModal();
 }
 function playerPanel(root,s){if(!root)return;const team=(s.teams||[]).find(t=>t.id===s.me?.team_id),key=[s.code,s.me?.id,team?.id,team?.name,team?.position,s.phase==='finished'].join(':');
  if(root.dataset.teamKey===key)return;root.dataset.teamKey=key;
  root.innerHTML=team?'<div class="my-team-identity">'+QwizStage.icon(team,true)+'<div><span>ВАША КОМАНДА</span><strong>'+escape(team.name)+'</strong></div></div>'+(s.phase!=='finished'?'<button type="button" class="team-invite-button">Пригласить в команду <span aria-hidden="true">↗</span></button>':''):
   '<div class="team-waiting"><strong>Преподаватель распределяет команды</strong><p>Вы уже в комнате. Ваша команда появится здесь автоматически.</p></div>';
  const button=root.querySelector('button');if(button)button.onclick=()=>showQr({code:s.code,team,inviter:s.me.id,title:'Ваш QR-код команды'});
 }
 function board(root,teams,code){if(!root)return;const key=code+':'+teams.map(t=>[t.id,t.name,t.position].join(':')).join('|');
  if(root.dataset.boardKey!==key){root.dataset.boardKey=key;root.innerHTML=teams.map(t=>'<button type="button" class="team-board-card" data-board-team="'+escape(t.id)+'" aria-label="Увеличить QR команды '+escape(t.name)+'">'+
   '<div class="team-board-heading">'+QwizStage.icon(t,true)+'<strong>'+escape(t.name)+'</strong></div><div class="team-board-qr"></div><span class="board-count"></span></button>').join('');
   for(const card of root.children){const team=teams.find(t=>t.id===card.dataset.boardTeam);qr(card.querySelector('.team-board-qr'),url(code,team?.id),144);card.onclick=()=>showQr({code,team,title:team?'Приглашение в команду':'Вход в игру '+code});}
  }
  for(const card of root.children){const team=teams.find(t=>t.id===card.dataset.boardTeam);if(team)card.querySelector('.board-count').textContent=((n)=>n+' '+({one:'участник',few:'участника',many:'участников'})[new Intl.PluralRules('ru').select(n)])(Number(team.members??team.players??0));}
 }
 function keepInvitationLinks(){const target=intent();if(!target.room||!/^[A-F0-9]{8}$/.test(target.room)||target.invalid)return;
  for(const a of document.querySelectorAll('a[href]')){const u=new URL(a.getAttribute('href'),location.href);if(u.origin!==location.origin)continue;
   if(u.pathname.endsWith('/profile.html')||(location.pathname.endsWith('/profile.html')&&u.pathname.endsWith('/'))){for(const k of ['room','team','via'])if(target[k])u.searchParams.set(k,target[k]);a.href=u.toString();}
  }
 }
 return {intent,joinRequest,url,avatar,qr,showQr,playerPanel,board,keepInvitationLinks};
})();
window.addEventListener('DOMContentLoaded',()=>QwizTeams.keepInvitationLinks());
