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
 function playerPanel(root,s){
  if(!root)return;
  const lobby=s.team_lobby,team=(s.teams||[]).find(t=>t.id===s.me?.team_id),mode=lobby?.mode;
  const lockedRandom=mode==='random'&&!lobby.confirmed;
  const key=[s.code,s.me?.id,team?.id,team?.name,s.phase,lobby?.mode,lobby?.team_count,lobby?.can_claim,lobby?.confirmed,lobby?.captain_count,lobby?.captains_ready,lobby?.my_captain,JSON.stringify(lobby?.team_members)].join(':');
  if(root.dataset.teamKey===key)return;root.dataset.teamKey=key;
  if(lockedRandom){
    root.innerHTML='<div class="team-forming-inline"><span class="team-infinity" aria-hidden="true">∞</span><span>Создаю команды</span></div>';
    return;
  }
  if(mode==='captain'&&s.phase==='lobby'&&!team){
    root.innerHTML='<div class="team-captain-claim"><strong>'+(lobby?.can_claim?'Станьте капитаном':'Капитаны выбираются')+'</strong>'+
     '<p>'+(lobby?.can_claim?'Нажмите «Я капитан». Когда будут выбраны все '+lobby.team_count+' капитанов, всем капитанам одновременно откроются QR-коды.':'Места капитанов заняты. Дождитесь приглашения и сканируйте QR-код одного из капитанов.')+'</p>'+
     (lobby?.can_claim?'<button type="button" class="team-invite-button" data-captain-claim>Я капитан</button>':'')+
     (lobby?.captain_started_at?'<span class="captain-claim-clock" data-captain-elapsed="'+escape(lobby.captain_started_at)+'"></span>':'')+'</div>';
    const b=root.querySelector('[data-captain-claim]');if(b)b.onclick=()=>window.QwizLobbyAction?.('claim',{});
    return;
  }
  if(!team){
    root.innerHTML='<div class="team-waiting"><strong>Ожидаем распределения</strong><p>Вы уже подключены. При необходимости отсканируйте QR капитана.</p></div>';return;
  }
  const captain=mode==='captain'&&!!lobby.my_captain;
  const members=(lobby?.team_members||[]).filter(m=>m.id!==s.me?.id);
  root.innerHTML='<div class="my-team-identity">'+QwizStage.icon(team,true)+'<div><span>ВАША КОМАНДА</span><strong>'+escape(team.name)+'</strong></div></div>'+
    (mode==='random'&&lobby.confirmed&&s.phase==='lobby'?'<p class="go-to-team">Идите к своей команде</p>':'')+
    (captain&&!lobby.captains_ready&&s.phase==='lobby'?'<div class="team-captain-pending"><span class="team-infinity">∞</span><p>Ожидаем капитанов: '+lobby.captain_count+' / '+lobby.team_count+'</p><span data-captain-elapsed="'+escape(lobby.captain_started_at||'')+'"></span></div>':'')+
    (captain&&lobby.captains_ready&&s.phase==='lobby'?'<div class="captain-qr-hero"><h3>Ваш QR-код команды</h3><div class="captain-qr-image" aria-label="Приглашение к капитану"></div><p>Покажите код другим игрокам. Сканирование сразу присоединяет к вашей команде.</p></div>':'')+
    (captain?'<form class="captain-rename-form"><label>Название команды<input data-captain-name maxlength="40" minlength="3" value="'+escape(team.name)+'"></label><button type="submit" class="team-invite-button">Сохранить название</button></form>':'')+
    (captain&&s.phase!=='lobby'&&members.length?'<form class="captain-transfer-form"><label>Передать капитанство<select data-captain-successor>'+members.map(m=>'<option value="'+escape(m.id)+'">'+escape(m.name)+'</option>').join('')+'</select></label><button type="submit" class="team-invite-button">Назначить капитана</button></form>':'');
  if(captain&&lobby.captains_ready&&s.phase==='lobby')qr(root.querySelector('.captain-qr-image'),url(s.code,team.id,s.me.id),Math.max(240,Math.min(330,Math.floor(window.innerWidth*.83))));
  const rename=root.querySelector('.captain-rename-form');if(rename)rename.onsubmit=e=>{e.preventDefault();window.QwizLobbyAction?.('rename',{name:rename.querySelector('input').value})};
  const transfer=root.querySelector('.captain-transfer-form');if(transfer)transfer.onsubmit=e=>{e.preventDefault();window.QwizLobbyAction?.('transfer',{player_id:transfer.querySelector('select').value})};
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
