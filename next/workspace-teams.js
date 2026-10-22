'use strict';
const teamUI={key:'',dragged:null,busy:false};
function roomReadiness(s){
 const issues=s.setup_issues||[],waiting=Number(s.unassigned_count)||0,ready=s.total>0&&!issues.length;
 $('roomReadiness').hidden=s.phase!=='lobby';
 $('roomReadinessTitle').textContent=ready?'Вопросы готовы · '+s.total: 'Комната создана · вопросы ещё не готовы';
 $('roomReadinessText').textContent=issues.length?issues.map(x=>x.title+': '+x.reason).join('. '):waiting?'Ожидают распределения: '+waiting+'. Назначьте им команды перед началом.':'Можно собирать команды и начинать игру.';
 $('addRoomQuestions').hidden=ready;$('refreshRoomContent').hidden=s.phase!=='lobby';
 $('liveStart').disabled=!ready||waiting>0||teamUI.busy;
 $('liveStart').title=!ready?'Добавьте вопросы и нажмите «Обновить вопросы»':waiting?'Распределите ожидающих участников':'';
}
function teamMember(p,s){
 const movable=!teamUI.busy&&(s.phase==='lobby'||(!p.team_id&&s.phase!=='finished'));
 return '<div class="team-member" data-player-id="'+esc(p.id)+'" draggable="'+movable+'">'+QwizTeams.avatar(p.avatar)+'<div class="team-member-name">'+esc(p.name)+(p.group?'<small>'+esc(p.group)+'</small>':'')+'</div>'+
 '<select data-team-player="'+esc(p.id)+'" aria-label="Команда: '+esc(p.name)+'" '+(!movable?'disabled':'')+'><option value="">Без команды</option>'+(s.teams||[]).map(t=>'<option value="'+esc(t.id)+'" '+(t.id===p.team_id?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></div>';
}
function renderTeamManager(s){
 roomReadiness(s);const editing=$('teamSettings').contains(document.activeElement);
 if(!editing){$('teamCount').value=s.teams?.length||1;$('teamMode').value=s.team_mode||'random';}
 const editable=s.phase==='lobby';for(const id of ['teamCount','teamMode','applyTeamSettings','shuffleTeams'])$(id).disabled=!editable||teamUI.busy;
 $('teamEditHint').textContent=editable?(s.team_mode==='manual'?'Обычный вход — в список ожидания. QR-код сразу выбирает команду.':'Обычный вход — в случайную наименьшую команду. QR-код выбирает указанную команду.'):'Составы зафиксированы. Новые участники смогут отвечать со следующего вопроса.';
 const players=s.players||[],teams=s.teams||[],key=JSON.stringify([s.code,s.phase,s.team_mode,teams,players,teamUI.busy]);
 if(teamUI.key===key||teamUI.dragged||$('teamGrid').contains(document.activeElement)||$('teamPool').contains(document.activeElement))return;
 teamUI.key=key;
 const pending=players.filter(p=>!p.team_id);$('teamPool').hidden=!pending.length;
 $('teamPool').innerHTML='<h4>Ожидают распределения · '+pending.length+'</h4><div class="team-members">'+pending.map(p=>teamMember(p,s)).join('')+'</div>';
 const qrIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-6v-2"/></svg>';
 $('teamGrid').innerHTML=teams.map(t=>{const members=players.filter(p=>p.team_id===t.id);return '<article class="team-card" data-drop-team="'+esc(t.id)+'"><div class="team-card-head">'+QwizStage.icon(t,true)+'<div><h4>'+esc(t.name)+'</h4><small>'+members.length+' участников</small></div><button type="button" class="team-qr-button" data-team-qr="'+esc(t.id)+'" aria-label="QR-код команды '+esc(t.name)+'">'+qrIcon+'</button></div><div class="team-members">'+(members.length?members.map(p=>teamMember(p,s)).join(''):'<p class="team-empty">Перенесите участника или пригласите по QR-коду.</p>')+'</div></article>';}).join('');
}
async function teamAction(action,input={}){
 if(!state.room||teamUI.busy)return;teamUI.busy=true;msg('teamMessage','Сохраняем…');renderTeamManager(state.room);
 try{await rpc('qwiz_team_admin',{p_room:state.room.room_id,p_action:action,p_input:input});
  state.channel?.send({type:'broadcast',event:'team',payload:{changed:true}})?.catch(()=>{});
  if('BroadcastChannel' in window){const c=new BroadcastChannel('qwiz-projector-'+state.roomCode);c.postMessage({event:'team'});c.close();}
  teamUI.key='';await refreshLive();msg('teamMessage',action==='shuffle'?'Участники распределены случайно и поровну.':action==='refresh_content'?'Вопросы обновлены из сохранённой сборки.':'Распределение сохранено.');QwizStage.audio.play('accept');
 }catch(e){teamUI.key='';msg('teamMessage',e.message,true);await refreshLive();}
 finally{teamUI.busy=false;if(state.room)renderTeamManager(state.room);}
}
function teamDropClear(){teamUI.dragged=null;all('.is-drop-target,.is-dragging').forEach(el=>el.classList.remove('is-drop-target','is-dragging'));}
window.addEventListener('DOMContentLoaded',()=>{
 $('manageTeams').onclick=()=>{$('teamManager').scrollIntoView({behavior:motionPreference.matches?'instant':'smooth',block:'start'});$('teamManagerHeading').focus({preventScroll:true});};
 $('showTeamBoard').onclick=projection;
 $('teamSettings').onsubmit=e=>{e.preventDefault();if(e.target.reportValidity())teamAction('settings',{count:Number($('teamCount').value),mode:$('teamMode').value});};
 $('shuffleTeams').onclick=()=>teamAction('shuffle');$('refreshRoomContent').onclick=()=>teamAction('refresh_content');
 $('addRoomQuestions').onclick=()=>{section('bank');const topic=state.room?.setup_issues?.find(x=>x.topic_id)?.topic_id;if(topic){$('bankTopic').value=topic;loadQuestions();}};
 $('teamManager').addEventListener('click',e=>{const b=e.target.closest('[data-team-qr]');if(b){const team=state.room?.teams.find(t=>t.id===b.dataset.teamQr);if(team)QwizTeams.showQr({code:state.roomCode,team});}});
 $('teamManager').addEventListener('change',e=>{if(e.target.matches('[data-team-player]')){const input={player_id:e.target.dataset.teamPlayer,team_id:e.target.value||null};e.target.blur();teamAction('move',input);}});
 $('teamManager').addEventListener('dragstart',e=>{const row=e.target.closest('[data-player-id]');if(!row||row.draggable!==true||e.target.closest('select')){e.preventDefault();return;}teamUI.dragged=row.dataset.playerId;e.dataTransfer.setData('text/plain',teamUI.dragged);e.dataTransfer.effectAllowed='move';row.classList.add('is-dragging');});
 $('teamManager').addEventListener('dragover',e=>{const card=e.target.closest('[data-drop-team]');if(!card||!teamUI.dragged)return;e.preventDefault();card.classList.add('is-drop-target');e.dataTransfer.dropEffect='move';});
 $('teamManager').addEventListener('dragleave',e=>{const card=e.target.closest('[data-drop-team]');if(card&&!card.contains(e.relatedTarget))card.classList.remove('is-drop-target');});
 $('teamManager').addEventListener('drop',e=>{const card=e.target.closest('[data-drop-team]'),player=teamUI.dragged;if(!card||!player)return;e.preventDefault();teamDropClear();teamAction('move',{player_id:player,team_id:card.dataset.dropTeam||null});});
 $('teamManager').addEventListener('dragend',teamDropClear);
});
