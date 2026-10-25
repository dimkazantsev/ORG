'use strict';
const teamUI={key:'',dragged:null,busy:false};
function roomReadiness(s){
 const issues=s.setup_issues||[],waiting=Number(s.unassigned_count)||0,ready=!issues.length&&(s.total>0||s.has_geo_round===true);
 $('roomReadiness').hidden=s.phase!=='lobby';
 $('roomReadinessTitle').textContent=ready?(s.total>0?'Вопросы готовы · '+s.total:'Карта России готова · 89 субъектов'): 'Комната создана · вопросы ещё не готовы';
 $('roomReadinessText').textContent=issues.length?issues.map(x=>x.title+': '+x.reason).join('. '):waiting?'Ожидают распределения: '+waiting+'. Назначьте им команды перед началом.':'Можно собирать команды и начинать игру.';
 $('addRoomQuestions').hidden=ready;$('refreshRoomContent').hidden=s.phase!=='lobby';
 // Completed sessions can always be replayed; readiness only guards a NEW lobby start.
 // The prior readiness code silently disabled the renamed “Повторить игру” button.
 const replay=s.phase==='finished';
 const lobby=s.team_lobby;
 const formed=!lobby||(lobby.mode==='random'&&lobby.confirmed)||(lobby.mode==='captain'&&lobby.captains_ready);
 const hasPlayers=(s.players||[]).length>0;
 $('liveStart').disabled=!replay&&(teamUI.busy||s.phase!=='lobby'||!ready||waiting>0||!formed||(!!lobby&&!hasPlayers));
 $('liveStart').title=replay?'Создать новую игровую комнату с теми же заданиями. История результатов сохранится.':
  !ready?'Добавьте вопросы или картографический раунд в сборку':waiting?'Распределите ожидающих участников':!formed?'Сначала завершите формирование команд':'';
}
function teamMember(p,s){
 const movable=!teamUI.busy&&((s.phase==='lobby'&&!s.team_lobby?.confirmed)||(s.phase!=='finished'&&!p.team_id&&!s.team_lobby));
 return '<div class="team-member" data-player-id="'+esc(p.id)+'" draggable="'+movable+'">'+QwizTeams.avatar(p.avatar)+'<div class="team-member-name">'+esc(p.name)+(p.group?'<small>'+esc(p.group)+'</small>':'')+'</div>'+
 '<select data-team-player="'+esc(p.id)+'" aria-label="Команда: '+esc(p.name)+'" '+(!movable?'disabled':'')+'><option value="">Без команды</option>'+(s.teams||[]).map(t=>'<option value="'+esc(t.id)+'" '+(t.id===p.team_id?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></div>';
}
function renderTeamManager(s){
 roomReadiness(s);
 const lobby=s.team_lobby,old=!lobby,editable=s.phase==='lobby'&&!lobby?.confirmed&&!(lobby?.mode==='captain'&&lobby.captain_count>0);
 const editing=$('teamSettings').contains(document.activeElement);
 if(!editing){$('teamCount').value=s.teams?.length||1;$('teamMode').value=s.team_mode||'random';}
 for(const id of ['teamCount','teamMode','applyTeamSettings'])$(id).disabled=!editable||teamUI.busy;
 $('shuffleTeams').hidden=s.team_mode!=='random'||!!lobby?.confirmed;
 $('shuffleTeams').disabled=!editable||teamUI.busy;
 $('confirmTeams').hidden=!lobby||s.team_mode!=='random'||!!lobby.confirmed||s.phase!=='lobby';
 $('confirmTeams').disabled=teamUI.busy||!(s.players||[]).length;
 $('teamEditHint').textContent=lobby?
  s.team_mode==='captain'?
   'Капитанский набор: '+lobby.captain_count+'/'+lobby.team_count+' капитанов. Первые участники нажимают «Я капитан». QR команд появятся у них одновременно после набора всех капитанов.':
   lobby.confirmed?'Распределение подтверждено. Пригласите участников подойти к своим командам.':
   'Студенты подключаются по одному QR комнаты и видят «Создаю команды». Нажмите «Перемешать», затем «Подтвердить».':
  s.team_mode==='manual'?'Ручная расстановка, команды перетаскиваются.':'В прежних комнатах действует первоначальная логика распределения.';
 const players=s.players||[],teams=s.teams||[];
 const key=JSON.stringify([s.code,s.phase,s.team_mode,teams,players,lobby,teamUI.busy,s.public_stats?.teams]);
 if(teamUI.key===key||teamUI.dragged||$('teamGrid').contains(document.activeElement)||$('teamPool').contains(document.activeElement))return;
 teamUI.key=key;
 const pending=players.filter(p=>!p.team_id);
 $('teamPool').hidden=!pending.length;
 $('teamPool').innerHTML='<h4>Ожидают команду · '+pending.length+'</h4><div class="team-members">'+pending.map(p=>teamMember(p,s)).join('')+'</div>';
 const captains=new Map((lobby?.captains||[]).map(x=>[x.team_id,x.player_id]));
 const effectMap=new Map((lobby?.effects_history||[]).reduce((a,e)=>{a.set(e.team_id,[...(a.get(e.team_id)||[]),e]);return a;},new Map()));
 $('teamGrid').innerHTML=teams.map(t=>{
   const members=players.filter(p=>p.team_id===t.id),effects=effectMap.get(t.id)||[];
   return '<article class="team-card" data-drop-team="'+esc(t.id)+'"><div class="team-card-head">'+QwizStage.icon(t,true)+
    '<div><h4>'+esc(t.name)+'</h4><small>'+members.length+' '+(members.length===1?'участник':'участников')+'</small></div></div>'+
    (captains.get(t.id)?'<div class="team-captain-tag">★ Капитан: '+esc(players.find(p=>p.id===captains.get(t.id))?.name||'Назначен')+'</div>':'')+
    (effects.length?'<div class="team-effects-history"><strong>Бонусы и штрафы</strong>'+effects.map(x=>{
      const labels={headstart:'Фора',teamwork:'Командный рывок',momentum:'Импульс',fog:'Туман',storm:'Шторм',drain:'Потеря очков'};
      const penalty=['fog','storm','drain'].includes(x.choice);
      return '<span class="'+(penalty?'is-penalty':'is-bonus')+'">'+(penalty?'− ':'+ ')+esc(labels[x.choice]||x.choice)+' · '+(x.applied_at?(Number(x.points_awarded)>=0?'+':'')+Number(x.points_awarded)+' очков':'ожидает применения')+'</span>';
    }).join('')+'</div>':'')+
    '<div class="team-members">'+(members.length?members.map(p=>teamMember(p,s)).join(''):'<p class="team-empty">Ожидание участников.</p>')+'</div></article>';
 }).join('');
}
async function teamAction(action,input={}){
 if(!state.room||teamUI.busy)return;teamUI.busy=true;msg('teamMessage','Сохраняем…');renderTeamManager(state.room);
 try{await rpc(action==='confirm'?'qwiz_lobby_action':'qwiz_team_admin',{p_room:state.room.room_id,p_action:action,p_input:input});
  state.channel?.send({type:'broadcast',event:'team',payload:{changed:true}})?.catch(()=>{});
  if('BroadcastChannel' in window){const c=new BroadcastChannel('qwiz-projector-'+state.roomCode);c.postMessage({event:'team'});c.close();}
  teamUI.key='';await refreshLive();msg('teamMessage',action==='shuffle'?'Участники распределены случайно и поровну.':action==='confirm'?'Команды подтверждены. Экран аудитории показывает их расположение.':action==='refresh_content'?'Вопросы обновлены из сохранённой сборки.':'Распределение сохранено.');QwizStage.audio.play('accept');
 }catch(e){teamUI.key='';msg('teamMessage',e.message,true);await refreshLive();}
 finally{teamUI.busy=false;if(state.room)renderTeamManager(state.room);}
}
function teamDropClear(){teamUI.dragged=null;all('.is-drop-target,.is-dragging').forEach(el=>el.classList.remove('is-drop-target','is-dragging'));}
window.addEventListener('DOMContentLoaded',()=>{
 $('manageTeams').onclick=()=>{$('teamManager').scrollIntoView({behavior:motionPreference.matches?'instant':'smooth',block:'start'});$('teamManagerHeading').focus({preventScroll:true});};

 $('teamSettings').onsubmit=e=>{e.preventDefault();if(e.target.reportValidity())teamAction('settings',{count:Number($('teamCount').value),mode:$('teamMode').value});};
 $('shuffleTeams').onclick=()=>teamAction('shuffle');$('confirmTeams').onclick=()=>teamAction('confirm');$('refreshRoomContent').onclick=()=>teamAction('refresh_content');
 $('addRoomQuestions').onclick=()=>{section('bank');const topic=state.room?.setup_issues?.find(x=>x.topic_id)?.topic_id;if(topic){$('bankTopic').value=topic;loadQuestions();}};

 $('teamManager').addEventListener('change',e=>{if(e.target.matches('[data-team-player]')){const input={player_id:e.target.dataset.teamPlayer,team_id:e.target.value||null};e.target.blur();teamAction('move',input);}});
 $('teamManager').addEventListener('pointerdown',e=>{if(e.target.closest('.team-member'))window.scrollTo({top:window.scrollY,left:window.scrollX,behavior:'instant'});});
 $('teamManager').addEventListener('dragstart',e=>{const row=e.target.closest('[data-player-id]');if(!row||row.draggable!==true||e.target.closest('select')){e.preventDefault();return;}teamUI.dragged=row.dataset.playerId;e.dataTransfer.setData('text/plain',teamUI.dragged);e.dataTransfer.effectAllowed='move';row.classList.add('is-dragging');});
 $('teamManager').addEventListener('dragover',e=>{const card=e.target.closest('[data-drop-team]');if(!card||!teamUI.dragged)return;e.preventDefault();card.classList.add('is-drop-target');e.dataTransfer.dropEffect='move';});
 $('teamManager').addEventListener('dragleave',e=>{const card=e.target.closest('[data-drop-team]');if(card&&!card.contains(e.relatedTarget))card.classList.remove('is-drop-target');});
 $('teamManager').addEventListener('drop',e=>{const card=e.target.closest('[data-drop-team]'),player=teamUI.dragged;if(!card||!player)return;e.preventDefault();teamDropClear();teamAction('move',{player_id:player,team_id:card.dataset.dropTeam||null});});
 $('teamManager').addEventListener('dragend',teamDropClear);
});
