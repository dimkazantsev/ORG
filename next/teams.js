'use strict';
// Invitation links carry a team and optional inviter, never a session or password.
window.QwizTeams=(()=>{
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const animals=new Set(['fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear']);
 const qrCache=new WeakMap();
 function intent(search=location.search){const p=new URLSearchParams(search),team=p.get('team'),via=p.get('via'),room=p.get('room');
  return {room:room?.toUpperCase(),team:team&&uuid.test(team)?team:null,via:via&&uuid.test(via)?via:null,invalid:(team!==null&&!uuid.test(team))||(via!==null&&(!uuid.test(via)||!team))};}
 function joinRequest(code,name,group=''){
  const target=intent();if(target.room===code&&target.invalid)throw Error('Некорректное приглашение. Попросите новый QR-код.');
  const args={p_code:code,p_name:name,p_group:group};
  return target.room===code&&target.team?{method:'qwiz_join_team',args:{...args,p_team:target.team,p_inviter:target.via}}:{method:'org_next_join',args};
 }
 function url(code,team=null,via=null){const u=new URL('./',location.href);u.searchParams.set('room',code);u.searchParams.set('join','1');
  if(team&&uuid.test(team))u.searchParams.set('team',team);if(via&&uuid.test(via))u.searchParams.set('via',via);return u.toString();}
 function avatar(key){return '<svg class="team-avatar" aria-hidden="true" viewBox="0 0 100 100"><use href="./assets/animals.svg#'+(animals.has(key)?key:'fox')+'"></use></svg>';}
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
  for(const card of root.children){const team=teams.find(t=>t.id===card.dataset.boardTeam);if(team)card.querySelector('.board-count').textContent=Number(team.members??team.players??0)+' участников';}
 }
 function keepInvitationLinks(){const target=intent();if(!target.room||!/^[A-F0-9]{8}$/.test(target.room)||target.invalid)return;
  for(const a of document.querySelectorAll('a[href]')){const u=new URL(a.getAttribute('href'),location.href);if(u.origin!==location.origin)continue;
   if(u.pathname.endsWith('/profile.html')||(location.pathname.endsWith('/profile.html')&&u.pathname.endsWith('/'))){for(const k of ['room','team','via'])if(target[k])u.searchParams.set(k,target[k]);a.href=u.toString();}
  }
 }
 return {intent,joinRequest,url,avatar,qr,showQr,playerPanel,board,keepInvitationLinks};
})();
window.addEventListener('DOMContentLoaded',()=>QwizTeams.keepInvitationLinks());
