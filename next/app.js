'use strict';
// QWIZ-PARTY 3 — no dependency on old app.js and no client-side answer checking.
const URL_SUPABASE='https://bderfrcfuhnutuoyudje.supabase.co';
const KEY_SUPABASE='sb_publishable_Hv7NgYuVsfKhFuhX_9pl0Q_qXWA2wOr';
const $=id=>document.getElementById(id);
const q=(selector,root=document)=>root.querySelector(selector);
const qa=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const storage={get(k){try{return sessionStorage.getItem('org2:'+k)}catch{return null}},set(k,v){try{sessionStorage.setItem('org2:'+k,v)}catch{}},del(k){try{sessionStorage.removeItem('org2:'+k)}catch{}}};
const ctx={client:null,role:'player',roomCode:null,room:null,quizzes:[],channel:null,refreshing:false,lastRefresh:0,releaseAttemptAt:0,refreshTimer:null,clock:null,mode:'home',visibleTab:'library',clockOffset:0,gameCue:''};
function text(id,value){if($(id))$(id).textContent=value==null?'':String(value)}
function notice(id,value,type=''){const el=$(id);if(!el)return;el.textContent=value||'';el.classList.toggle('error',type==='error');el.classList.toggle('success',type==='success')}
function showScreen(name){ctx.mode=name;for(const id of ['home','studio','game'])$(id+'View').hidden=id!==name;window.scrollTo({top:0,behavior:'auto'})}
function setRole(role){ctx.role=role;storage.set('entry-role',role);for(const [name,id] of [['player','rolePlayer'],['host','roleHost']]){$(id).setAttribute('aria-selected',String(role===name));$(id).tabIndex=role===name?0:-1}$('playerEntry').hidden=role!=='player';$('hostEntry').hidden=role!=='host'}
function teacherSession(session){
 ctx.teacherSession=session||null;
 $('hostSession').hidden=!session;$('loginForm').hidden=!!session;
 text('hostSessionEmail',session?.user?.email||'Аккаунт преподавателя');
 text('hostEntryDescription',session?'Авторизация сохранена. Выберите, когда открыть кабинет.':'Войдите, чтобы подготовить и провести квиз.');
}
function resumeOffer(){const code=ctx.roomCode||storage.get('room');$('resumeGame').hidden=!code;text('resumeCode',code);}
async function resumeGame(){
 const code=ctx.roomCode||storage.get('room');if(!code)return;
 busy($('resumeGameButton'),true);notice('joinNotice','Возвращаемся в игру…');
 try{ctx.roomCode=code;await refreshRoom(false);if(!ctx.room)throw Error('Комната недоступна. Проверьте код или присоединитесь к другой игре.');showScreen('game');renderGame();notice('joinNotice','')}
 catch(error){notice('joinNotice',error.message,'error')}
 finally{busy($('resumeGameButton'),false)}
}
function tab(name){ctx.visibleTab=name;for(const id of ['library','room','results'])$(id+'Tab').hidden=id!==name;for(const el of qa('[data-tab]'))el.setAttribute('aria-current',name===el.dataset.tab?'page':'false');text('studioHeading',({library:'Библиотека',room:'Провести игру',results:'Результаты'})[name]);text('studioDescription',({library:'Все наборы вопросов в одном месте.',room:'Комната, команды и управление раундами.',results:'Командный рейтинг и результаты.'})[name]);if(name==='results')renderResults();if(name==='room')renderRoom()}
function busy(button,active){if(!button)return;button.disabled=active;button.setAttribute('aria-busy',String(active))}
async function rpc(name,params={}){if(!ctx.client)throw Error('Нет соединения с игрой. Проверьте подключение к интернету.');const {data,error}=await ctx.client.rpc(name,params);if(error)throw Error(error.message||'Ошибка запроса');return data}
async function ensureAuth(){const {data:{session},error}=await ctx.client.auth.getSession();if(error)throw Error(error.message);if(session)return session;const r=await ctx.client.auth.signInAnonymously();if(r.error)throw Error(r.error.message);return r.data.session}
function dataState(room){if(room?.server_now)ctx.clockOffset=Date.parse(room.server_now)-Date.now();ctx.room=room; if(!room)return;renderQrPanels();connectRoom(room.code); if(ctx.mode==='studio'){renderRoom();renderResults()}else if(ctx.mode==='game')renderGame()}
function cleanupRoom(){if(ctx.channel){ctx.client?.removeChannel(ctx.channel);ctx.channel=null}ctx.room=null;ctx.roomCode=null;storage.del('room');renderQrPanels();}
function connectRoom(code){if(!ctx.client||!code)return;if(ctx.channel&&ctx.channel.topic==='realtime:org-next-'+code)return;if(ctx.channel)ctx.client.removeChannel(ctx.channel);
 ctx.channel=ctx.client.channel('org-next-'+code,{config:{broadcast:{ack:false}}})
 .on('broadcast',{event:'phase'},()=>scheduleRefresh(500))
 .on('broadcast',{event:'team'},()=>scheduleRefresh(600))
 .on('broadcast',{event:'answer'},()=>{if(ctx.mode==='studio')scheduleRefresh(1300)})
 .subscribe();
}
function signal(event){
 ctx.channel?.send({type:'broadcast',event,payload:{changed:true}})?.catch(()=>{});
 if(ctx.roomCode&&'BroadcastChannel' in window){
   const channel=new BroadcastChannel('qwiz-projector-'+ctx.roomCode);
   channel.postMessage({event,code:ctx.roomCode}); channel.close();
 }
}
function scheduleRefresh(delay=800){if(ctx.refreshTimer)clearTimeout(ctx.refreshTimer);ctx.refreshTimer=setTimeout(()=>refreshRoom(false),delay)}
async function refreshRoom(showError=true){if(!ctx.roomCode||ctx.refreshing||!ctx.client)return;
 ctx.refreshing=true;try{const data=await rpc('org_next_state',{p_code:ctx.roomCode});ctx.lastRefresh=Date.now();dataState(data);if(showError){notice('hostNotice','');notice('gameNotice','')}}catch(error){if(showError){notice('hostNotice',error.message,'error');notice('gameNotice',error.message,'error')}}finally{ctx.refreshing=false}}
async function joinRoom(event){event.preventDefault();const button=$('joinButton');busy(button,true);notice('joinNotice','Подключение…');
 try{await ensureAuth();const code=$('joinCode').value.trim().toUpperCase();const name=$('joinName').value.trim();const group=$('joinGroup').value.trim();
  if(!/^[A-F0-9]{8}$/.test(code))throw Error('Код комнаты должен содержать восемь символов.');
  const request=QwizTeams.joinRequest(code,name,group);await rpc(request.method,request.args);
  ctx.roomCode=code;storage.set('room',code);showScreen('game');await refreshRoom();signal('team');
  notice('joinNotice','');
 }catch(error){notice('joinNotice',error.message,'error')}finally{busy(button,false)}}
async function login(event){event.preventDefault();busy($('loginButton'),true);notice('loginNotice','Проверка доступа…');
 try{const {data,error}=await ctx.client.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});if(error)throw Error(error.message);
  const isAdmin=await rpc('org_quiz_is_admin_check');
  if(!isAdmin){await ctx.client.auth.signOut();throw Error('У этой учётной записи нет прав преподавателя.')}
  $('loginPassword').value='';teacherSession(data.session);await enterStudio();
 }catch(error){notice('loginNotice',error.message,'error')}finally{busy($('loginButton'),false)}}
async function enterStudio(){location.assign(new URL('./workspace.html',location.href).toString());return;
/* Legacy studio kept for compatibility; the v4 workspace handles the teacher's tasks. */
showScreen('studio');tab('library');await loadCatalog();
 const code=storage.get('host-room');if(code){ctx.roomCode=code;await refreshRoom(false);if(ctx.room)tab('room')}}
async function logout(){if(!ctx.client)return;busy($('changeTeacherAccount'),true);
 try{const {error}=await ctx.client.auth.signOut({scope:'local'});if(error)throw error;teacherSession(null);cleanupRoom();storage.del('host-room');showScreen('home');setRole('host');$('loginEmail').focus();notice('loginNotice','Можно войти в другой аккаунт.','success')}
 catch(error){notice('loginNotice',error.message,'error')}
 finally{busy($('changeTeacherAccount'),false)}
}
function home(){showScreen('home');renderQrPanels();resumeOffer()}
async function loadCatalog(){try{
 ctx.quizzes=await rpc('org_next_catalog');renderCatalog();await loadLegacy();
}catch(e){notice('quizNotice',e.message,'error');$('quizList').innerHTML='<p class="placeholder">Не удалось загрузить наборы.</p>'}}
function renderCatalog(){text('quizCount',ctx.quizzes.length+' наборов');$('quizList').innerHTML=ctx.quizzes.length?ctx.quizzes.map(quiz=>'<div class="list-row"><div><strong>'+esc(quiz.title)+'</strong><small>'+esc(quiz.count)+' вопросов</small></div><button class="btn btn-small" data-pick-quiz="'+esc(quiz.id)+'">Провести →</button></div>').join(''):'<p class="placeholder">Пока нет наборов. Создайте первый или импортируйте старый.</p>';
 $('roomQuizSelect').innerHTML='<option value="">Выберите набор</option>'+ctx.quizzes.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+' · '+esc(x.count)+' вопр.</option>').join('');
}
async function loadLegacy(){try{const {data,error}=await ctx.client.from('org_quiz_sets').select('id,title').is('archived_at',null).order('created_at',{ascending:false}).limit(100);if(error)throw Error(error.message);
 $('legacyQuizSelect').innerHTML='<option value="">Выберите прежний набор</option>'+(data||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join('');
}catch(e){$('legacyQuizSelect').innerHTML='<option value="">Нет доступа к старым наборам</option>'}}
function addQuestion(){const container=$('questionEditors'),index=qa('.question-editor',container).length+1;const wrap=document.createElement('fieldset');wrap.className='question-editor';
 wrap.innerHTML='<legend>Вопрос '+index+'</legend><label>Формулировка<textarea class="q-prompt" rows="2" placeholder="Введите вопрос" minlength="5" required></textarea></label><div class="grid2">'+['А','Б','В','Г'].map(x=>'<label>Вариант '+x+'<input class="q-option" required maxlength="300" placeholder="Текст варианта"></label>').join('')+'</div><div class="grid2"><label>Правильный вариант<select class="q-correct"><option value="0">А</option><option value="1">Б</option><option value="2">В</option><option value="3">Г</option></select></label><label>Время, секунд<input class="q-duration" type="number" min="10" max="120" value="30" required></label></div><button type="button" class="btn btn-small" data-remove-question>Удалить вопрос</button>';
 container.append(wrap);wrap.querySelector('.q-prompt').focus()}
function buildQuestions(){return qa('.question-editor',$('questionEditors')).map(el=>({prompt:q('.q-prompt',el).value.trim(),options:qa('.q-option',el).map(input=>input.value.trim()),correct:Number(q('.q-correct',el).value),duration:Number(q('.q-duration',el).value),explanation:''}))}
async function saveQuiz(event){event.preventDefault();busy($('saveQuizButton'),true);notice('quizNotice','Сохранение…');
 try{const questions=buildQuestions();if(!questions.length)throw Error('Добавьте хотя бы один вопрос.');
  if(questions.some(x=>x.prompt.length<5||x.options.some(s=>!s)||x.duration<10||x.duration>120))throw Error('Заполните все вопросы и варианты.');
  await rpc('org_next_save_quiz',{p_title:$('quizTitle').value.trim(),p_questions:questions});
  $('quizForm').reset();$('questionEditors').innerHTML='';addQuestion();$('quizCreator').hidden=true;await loadCatalog();notice('quizNotice','Набор сохранён.','success');
 }catch(error){notice('quizNotice',error.message,'error')}finally{busy($('saveQuizButton'),false)}}
async function importQuiz(){busy($('importQuiz'),true);notice('importNotice','Импорт…');
 try{const id=$('legacyQuizSelect').value;if(!id)throw Error('Выберите набор.');
 const data=await rpc('org_next_import_legacy',{p_quiz:id});await loadCatalog();notice('importNotice','Импортировано '+data.imported+' вопросов. Исходный набор сохранён.','success');
 }catch(error){notice('importNotice',error.message,'error')}finally{busy($('importQuiz'),false)}}
async function createRoom(event){event.preventDefault();busy($('createRoomButton'),true);notice('createRoomNotice','Создание комнаты…');
 try{const quiz=$('roomQuizSelect').value;if(!quiz)throw Error('Выберите набор.');
 const code=await rpc('org_next_create_room',{p_quiz:quiz,p_title:$('roomTitle').value.trim(),p_teams:Number($('roomTeamCount').value)});
 ctx.roomCode=code;storage.set('host-room',code);renderQrPanels();await refreshRoom();renderRoom();notice('createRoomNotice','');
 }catch(error){notice('createRoomNotice',error.message,'error')}finally{busy($('createRoomButton'),false)}}
function phaseText(phase){return QwizStage.phaseLabel(phase)}
function remaining(date){if(!date)return 0;return Math.max(0,Math.ceil((Date.parse(date)-Date.now()-ctx.clockOffset)/1000))}
function teamMarkup(teams){return (teams||[]).slice().sort((a,b)=>b.score-a.score).map((t,i)=>'<div class="team-row"><div><span class="team-flag">'+(i+1)+'</span> <strong>'+esc(t.name)+'</strong> <small>· '+esc(t.players)+' чел.</small></div><b>'+esc(t.score)+'</b></div>').join('')||'<p class="muted">Команд пока нет.</p>'}
function renderRoom(){if(ctx.mode!=='studio')return;const s=ctx.room;const has=!!(s&&ctx.roomCode);
 $('createRoomPanel').hidden=has;$('activeRoomPanel').hidden=!has;
 if(!has)return;text('hostRoomCode',s.code);text('hostPlayersCount',(s.players||[]).length);text('hostTeamsCount',(s.teams||[]).length);text('hostPhase',phaseText(s.phase));text('hostRound',s.index<0?'До начала':(s.index+1)+' / '+s.total+' · '+phaseText(s.phase));
 $('hostStart').hidden=s.phase!=='lobby';$('hostReveal').hidden=s.phase!=='question';$('hostNext').hidden=!['question','result','intermission'].includes(s.phase);$('hostNext').textContent=s.phase==='question'?'Далее: ответ →':'Следующий вопрос →';$('hostFinish').hidden=s.phase==='finished';$('hostNewRoom').hidden=s.phase!=='finished';$('hostTeams').innerHTML=teamMarkup(s.teams);
 if(s.question&&s.phase!=='lobby'){const x=s.question;$('hostQuestion').hidden=false;
  $('hostQuestion').innerHTML='<div class="row"><span class="eyebrow" style="margin:0">Вопрос '+(s.index+1)+'</span><span class="phase-label">'+(s.phase==='question'?'Ответов: '+s.answers_count+'/'+s.players.length:'Ответ открыт')+'</span></div><h2>'+esc(x.prompt)+'</h2><div class="option-list">'+(x.options||[]).map((option,i)=>'<div class="option '+(s.phase==='result'&&i===Number(x.correct)?'correct':'')+'"><span class="letter">'+String.fromCharCode(65+i)+'</span>'+flagOptionHtml(option,i)+'</div>').join('')+'</div><p class="muted-small">'+(s.phase==='question'?'До конца вопроса: <b id="hostTimer">'+remaining(s.ends_at)+'</b> сек.':'Разбор вопроса')+'</p>';
 }else $('hostQuestion').hidden=true;
 $('hostPlayers').innerHTML=(s.players||[]).length?(s.players||[]).map(p=>'<div class="player-row"><div><strong>'+esc(p.name)+'</strong><small> '+esc(p.group||'')+'</small></div><select aria-label="Команда игрока '+esc(p.name)+'" data-team-for="'+esc(p.id)+'" '+(s.phase==='lobby'?'':'disabled')+'>'+
 (s.teams||[]).map(t=>'<option value="'+esc(t.id)+'" '+(t.id===p.team_id?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></div>').join(''):'<div class="placeholder">Участники появятся после входа по коду.</div>';
}
function renderResults(){if(ctx.mode!=='studio')return;const s=ctx.room;text('resultIntro',s?.phase==='finished'?'Игра завершена. Результаты рассчитаны на сервере.':'Текущие результаты команд. Окончательными они станут после завершения игры.');$('resultTeams').innerHTML=s?teamMarkup(s.teams):'<div class="placeholder">Создайте и проведите игру.</div>'; $('exportResults').disabled=!s}
function flagOptionHtml(value,index){
 const bands=QwizStage.stripeOption(value);if(bands)return bands;
 if(value&&typeof value==='object'&&typeof value.image_url==='string'&&/^https:\/\//i.test(value.image_url)){
  return '<span class="flag-choice-with-label"><img class="flag-choice-art" src="'+esc(value.image_url)+'" alt="Флаг, вариант '+String.fromCharCode(65+index)+'" loading="lazy" decoding="async">'+(typeof value.label==='string'?'<span class="flag-choice-label">'+esc(value.label)+'</span>':'')+'</span>';
 }
 return '<span>'+esc(typeof value==='object'?value?.label||'':value)+'</span>';
}
function flagOptionAnswer(value){return typeof value==='object'?value?.label||'Флаг':String(value??'—')}
function gameRichMarkup(q,locked){
 const kind=q.kind||'single', options=q.options||[], disabled=locked?' disabled':'';
 const select=(values,cls,first='Выберите')=>'<select class="'+cls+'"'+disabled+'><option value="">'+first+'</option>'+
   values.map((v,i)=>'<option value="'+i+'">'+esc(v)+'</option>').join('')+'</select>';
 if(q.flag_assembly)return QwizStage.assemblyMarkup(q,locked)+'<button class="btn btn-dark rich-send" type="button" data-submit-rich'+disabled+'>Отправить собранный флаг →</button>';
 if(kind==='multi')return '<p class="muted-small">Выберите все правильные варианты, затем подтвердите выбор.</p><div class="rich-choices">'+options.map((v,i)=>'<label class="rich-choice"><input type="checkbox" data-multi="'+i+'"'+disabled+'><span class="letter">'+String.fromCharCode(65+i)+'</span><span>'+flagOptionHtml(v,i)+'</span></label>').join('')+'</div>'+
  '<button class="btn btn-dark rich-send" type="button" data-submit-rich'+disabled+'>Подтвердить выбранные варианты →</button>';
 if(kind==='match')return '<div class="rich-rows">'+options.map((v,i)=>'<label class="rich-row"><span>'+esc(v)+'</span>'+select(q.match_choices||[],'rich-match','Соответствие')+'</label>').join('')+'</div>'+
 '<button class="btn btn-dark rich-send" type="button" data-submit-rich'+disabled+'>Проверить соответствия →</button>';
 if(['order','sequence'].includes(kind))return '<p class="muted-small">Укажите правильную последовательность элементов.</p><div class="rich-rows">'+
 options.map((_,i)=>'<label class="rich-row"><span>Позиция '+(i+1)+'</span>'+select(options,'rich-order','Выберите элемент')+'</label>').join('')+'</div>'+
 '<button class="btn btn-dark rich-send" type="button" data-submit-rich'+disabled+'>Отправить порядок →</button>';
 if(['text','riddle','puzzle','blitz','number','date','estimate'].includes(kind))
 return '<label class="rich-free">Ваш ответ<input id="richTextAnswer" maxlength="200" autocomplete="off" placeholder="'+(['number','estimate'].includes(kind)?'Введите число':kind==='date'?'Введите дату':'Введите ответ')+'"'+disabled+'></label>'+
 '<button class="btn btn-dark rich-send" type="button" data-submit-rich'+disabled+'>Отправить ответ →</button>';
 if(kind==='hotspot')return '<p class="muted-small">Нажмите на нужную область фотографии.</p><button type="button" id="richSpot" class="rich-hotspot"'+disabled+' aria-label="Выбрать точку на изображении">'+
 (typeof q.media_url==='string'&&/^https:\/\//i.test(q.media_url)?'<img src="'+esc(q.media_url)+'" alt="Изображение для поиска точки" draggable="false">':'<span>Изображение не указано</span>')+
 '<span class="rich-marker" id="richMarker" hidden>+</span></button><button type="button" class="btn btn-dark rich-send" data-submit-rich'+disabled+'>Подтвердить точку →</button>';
 return '<div class="option-list'+(options.some(option=>typeof option==='string'&&option.length>36)?' has-long-options':'')+'">'+options.map((option,i)=>{
  let classes='option';if(q._phase==='result'&&i===Number(q.correct))classes+=' correct';
  return '<button type="button" class="'+classes+'" data-answer="'+i+'"'+disabled+'><span class="letter">'+String.fromCharCode(65+i)+'</span><span>'+flagOptionHtml(option,i)+'</span></button>';
 }).join('')+'</div>';
}
function gameRichResult(q){
 const k=q.kind||'single',s=q.solution||{};
 if(k==='poll')return 'Голосование завершено.';
 if(k==='multi')return 'Правильные варианты: '+(s.correct_indices||[]).map(i=>(q.options||[])[i]).join(', ');
 if(k==='match')return 'Соответствия: '+(q.options||[]).map((x,i)=>x+' → '+((s.matches||[])[i]||'—')).join('; ');
 if(['order','sequence'].includes(k))return 'Верный порядок: '+(s.order||[]).join(' → ');
 if(['text','riddle','puzzle','blitz','number','date','estimate'].includes(k))return 'Правильный ответ: '+(s.answer||'—');
 if(k==='hotspot')return 'Верная область отмечена ведущим.';
 return 'Правильный ответ: '+flagOptionAnswer((q.options||[])[Number(q.correct)]);
}
function personalResults(s,final=false){
 const metrics=s.public_stats||{};
 return '<section class="personal-results"><h2>'+(final?'Рейтинг команд':'Скорость команд')+'</h2>'+QwizStage.teams(metrics.teams||[],{full:true,ranked:true})+'<h2>Личный рейтинг</h2>'+QwizStage.leaderboard(metrics.players||[],final?80:10)+(final&&metrics.question_stats?.length?QwizStage.questionStats(metrics.question_stats):'')+'</section>';
}
function renderGame(){if(ctx.mode!=='game'||!ctx.room)return;const s=ctx.room;const me=s.me;const myTeam=(s.teams||[]).find(t=>t.id===me?.team_id);
 text('playerGameTitle',s.title);text('playerTeamName',myTeam?.name||'Команда пока не назначена');$('playerScoreboard').innerHTML=teamMarkup(s.teams);
 QwizTeams.playerPanel($('playerTeamPanel'),s);
 const el=$('gameContent');
 const cue=s.phase+':'+s.index;if(cue!==ctx.gameCue){ctx.gameCue=cue;if(s.phase==='result')QwizStage.audio.play('reveal');else if(s.phase==='finished')QwizStage.audio.play(s.activity?.sound||'fanfare');else if(s.phase==='question')QwizStage.audio.play('pop')}
 $('playerTeamProgress').hidden=s.phase!=='question';if(s.phase==='question')QwizStage.progress($('playerTeamProgress'),s.public_stats?.teams||[]);
 window.QwizArcade?.syncWallet(s,ctx);
 const renderKey=[s.code,s.index,s.phase,s.activity?.title,s.activity?.settings?.arcade_mode,s.has_answer,s.eligible,s.total,s.question?.kind,s.question?.prompt,me?.team_id].join(':');
 if(ctx.gameRenderKey===renderKey)return;
 ctx.gameRenderKey=renderKey;
 if(s.phase!=='intermission')window.QwizArcade?.stop('player');
 if(s.phase==='lobby'){el.innerHTML='<div class="game-empty"><div class="eyebrow">Вы в комнате '+esc(s.code)+'</div><h1>Вы в игре.</h1><p>Преподаватель собирает участников. Игра начнётся на всех устройствах одновременно.</p><div class="phase-label">'+esc(myTeam?.name||'Ожидание команды')+'</div></div>';text('playerStatus','Подключён. Ожидайте начала.');return}
 if(s.phase==='finished'){el.innerHTML='<div class="game-empty"><div class="eyebrow">Игра завершена</div><h1>Финальный рейтинг</h1><p>Спасибо за участие. Результаты зафиксированы на сервере.</p>'+personalResults(s,true)+'</div>';text('playerStatus','Игра завершена.');return}
 const question=s.question;
 if(s.phase==='intermission'){
  if(window.QwizArcade?.mountPlayer(el,s,ctx)){
    text('playerStatus','Командное испытание. Действуйте вместе, зарабатывайте достижения и жетоны.');return;
  }
   el.innerHTML='<div class="game-empty"><div class="eyebrow">ДОПОЛНИТЕЛЬНАЯ АКТИВНОСТЬ</div><h1>'+esc(s.activity?.title||'Перерыв')+'</h1><p>Следующий этап откроет преподаватель.</p></div>';
   text('playerStatus','Ожидаем продолжения.');
   return;
 }
 if(s.phase==='countdown'){
   el.innerHTML='<div class="game-empty"><div class="eyebrow">НОВЫЙ РАУНД</div><h1>Скоро начнём!</h1><p>Вопрос откроется на всех устройствах через <strong id="playerCountdown">'+remaining(s.ends_at)+'</strong> сек.</p></div>';
   text('playerStatus','Общий обратный отсчёт перед раундом.');
   // The projector releases promptly; players use a staggered fallback to avoid a simultaneous 40-client burst.
   return;
 }
 if(!question){el.innerHTML='<p class="placeholder">Ожидаем вопрос.</p>';return}
 const time=remaining(s.ends_at);
 const done=!!s.has_answer;const eligible=s.eligible!==false;const locked=s.phase!=='question'||done||time===0||!eligible;
 const richKind=question.kind||'single';
 const richLocked=locked;
 let optsMarkup=gameRichMarkup({...question,_phase:s.phase},richLocked);
 let interactive='';
 if(richKind==='hotspot'&&s.phase==='question'){interactive=optsMarkup.match(/<button type="button" id="richSpot"[\s\S]*?<\/button>/)?.[0]||'';optsMarkup=optsMarkup.replace(interactive,'').replace(/<p class="muted-small">[\s\S]*?<\/p>/,'')}
 const hint=s.phase==='question'?(optsMarkup.match(/^<p class="muted-small">[\s\S]*?<\/p>/)?.[0]||''):'';
 if(hint)optsMarkup=optsMarkup.slice(hint.length);
 const media=QwizStage.illustration(question,s.answer,interactive);
 const clip=typeof question.media_url==='string'&&/^https:\/\//i.test(question.media_url)&&['audio','video'].includes(richKind)?'<'+richKind+' class="rich-media" controls preload="metadata" src="'+esc(question.media_url)+'"></'+richKind+'>':'';
 el.innerHTML='<div class="player-question-top"><span class="eyebrow">Вопрос '+(s.index+1)+' / '+s.total+'</span>'+QwizStage.clockMarkup(s,'playerTimer')+'</div><div class="player-question-layout"><div class="player-prompt">'+media+'<h1>'+esc(question.prompt)+'</h1>'+clip+hint+'</div><div class="player-responses">'+
 (s.phase==='result'?'<section class="player-answer answer-reveal" role="status"><span>'+(richKind==='poll'?'ИТОГ ГОЛОСОВАНИЯ':'ПРАВИЛЬНЫЙ ОТВЕТ')+'</span><h2>'+esc(s.answer?.text||gameRichResult(question).replace(/^Правильный ответ: /,''))+'</h2>'+(question.explanation?'<p>'+esc(question.explanation)+'</p>':'')+'</section>'+personalResults(s):optsMarkup+(done?'<p class="notice success">Ваш ответ принят. Ожидайте остальных участников.</p>':time===0?'<p class="notice">Приём ответов завершён.</p>':''))+'</div></div>';
 if(question.flag_memory&&s.phase==='question'){
  const controls=el.querySelector('.option-list');if(controls)controls.setAttribute('data-memory-answer','');
 }
 if(s.phase==='result')el.querySelector('.player-answer')?.insertAdjacentHTML('beforeend',QwizStage.sourceLinks(s.answer));
 QwizStage.updateClock(s,ctx.clockOffset,document,'playerTimer');QwizStage.hydrateIllustrations(el);QwizStage.hydrateAssembly(el,question);
 text('playerStatus',!eligible?(me?.team_id&&Number(me.entry_question)>s.index?'Вы подключились во время игры. Участвуете со следующего вопроса.':!me?.team_id?'Ожидайте распределения в команду.':'Этот раунд не назначен вашей команде или участнику.'):s.phase==='result'?'Результат открыт. Скоро следующий вопрос.':done?'Ответ записан на сервере.':'Ваш ответ ещё не отправлен.');
}
async function advance(action){const s=ctx.room;if(!s)return;busy($('host'+({start:'Start',reveal:'Reveal',next:'Next',finish:'Finish'})[action]),true);notice('hostNotice','');
 try{if(action==='finish'&&!confirm('Завершить эту игру?'))return;
  await rpc('org_next_advance',{p_room:s.room_id,p_action:action});signal('phase');await refreshRoom();if(action==='finish')tab('results');
 }catch(e){notice('hostNotice',e.message,'error')}finally{for(const b of ['hostStart','hostReveal','hostNext','hostFinish'])busy($(b),false)}}
async function assign(playerId,teamId){if(!ctx.room||ctx.room.phase!=='lobby')return;try{await rpc('org_next_assign',{p_room:ctx.room.room_id,p_player:playerId,p_team:teamId});signal('team');await refreshRoom()}catch(e){notice('hostNotice',e.message,'error')}}
async function submitAnswer(choice){if(ctx.mode!=='game'||!ctx.room||ctx.room.phase!=='question'||ctx.room.has_answer)return;const buttons=qa('[data-answer]');buttons.forEach(x=>busy(x,true));
 notice('gameNotice','Отправляем ответ…');try{await (['single','boolean','flag','portrait','image'].includes(ctx.room.question?.kind||'single')?rpc('org_next_answer',{p_room:ctx.room.room_id,p_choice:choice}):rpc('qwiz_submit_answer',{p_room:ctx.room.room_id,p_payload:{index:choice}}));QwizStage.audio.play('accept');signal('answer');notice('gameNotice','Ответ сохранён.','success');await refreshRoom(false);
 }catch(e){notice('gameNotice',e.message,'error');await refreshRoom(false)}finally{buttons.forEach(x=>busy(x,false))}}
async function submitRichAnswer(){
 const s=ctx.room,q=s?.question;if(!s||!q||s.phase!=='question'||s.has_answer||s.eligible===false)return;
 const kind=q.kind||'single';let payload={};
 if(kind==='multi'){
  const indices=qa('#gameContent [data-multi]').filter(x=>x.checked).map(x=>Number(x.dataset.multi));
  if(!indices.length){notice('gameNotice','Отметьте хотя бы один вариант.','error');return}payload={indices};
 }else if(kind==='match'){
  const rows=qa('#gameContent select.rich-match'),items=rows.map(x=>x.value===''?null:q.match_choices[Number(x.value)]);
  if(items.some(x=>x===null)){notice('gameNotice','Заполните все соответствия.','error');return}
  payload={items};
 }else if(['order','sequence'].includes(kind)){
  const rows=qa('#gameContent select.rich-order'),items=rows.map(x=>x.value===''?null:q.options[Number(x.value)]);
  if(items.some(x=>x===null)||new Set(items).size!==items.length){notice('gameNotice','Каждый элемент должен быть выбран ровно один раз.','error');return}
  payload={items};
 }else if(kind==='hotspot'){
  if(!ctx.hotspotPoint||ctx.hotspotQuestion!==s.code+':'+s.index){notice('gameNotice','Отметьте точку на картинке.','error');return}
  payload=ctx.hotspotPoint;
 }else{
  const textAnswer=$('richTextAnswer')?.value.trim();
  if(!textAnswer){notice('gameNotice','Введите ответ.','error');return}
  payload={text:textAnswer};
 }
 const button=document.querySelector('#gameContent [data-submit-rich]');if(button)busy(button,true);
 try{notice('gameNotice','Отправляем ответ…');
  await rpc('qwiz_submit_answer',{p_room:s.room_id,p_payload:payload});
  QwizStage.audio.play('accept');signal('answer');notice('gameNotice','Ответ принят сервером.','success');await refreshRoom(false);
 }catch(e){notice('gameNotice',e.message,'error');await refreshRoom(false)}
 finally{if(button)busy(button,false)}
}
function exportResults(){const s=ctx.room;if(!s)return;const rows=[['Место','Команда','Игроков','Очков'],...s.teams.slice().sort((a,b)=>b.score-a.score).map((x,i)=>[i+1,x.name,x.players,x.score])];const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='org-party-'+s.code+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function copyInvite(){if(!ctx.roomCode)return;const invite=joinUrl(ctx.roomCode);try{await navigator.clipboard.writeText(invite);notice('hostNotice','Ссылка скопирована.','success')}catch{notice('hostNotice','Ссылка для приглашения: '+invite)}}
function updateClocks(){if(ctx.room?.phase==='countdown'){
   const n=remaining(ctx.room.ends_at);text('playerCountdown',n);
   if(n===0 && !ctx.releaseTimer){
    ctx.releaseTimer=setTimeout(()=>{
     ctx.releaseTimer=null;
     if(ctx.room?.phase!=='countdown')return;
     rpc('qwiz_release_countdown',{p_code:ctx.roomCode}).then(()=>scheduleRefresh(400)).catch(()=>{});
    },1500+Math.floor(Math.random()*2700));
   }
   return;
 }
 if(!['question','result'].includes(ctx.room?.phase))return;
 const seconds=QwizStage.updateClock(ctx.room,ctx.clockOffset,document,'playerTimer');text('hostTimer',seconds);
 if(seconds===0){
  for(const button of qa('#gameContent [data-answer],#gameContent [data-submit-rich],#gameContent #richSpot'))button.disabled=true;
  if(!ctx.releaseTimer)ctx.releaseTimer=setTimeout(()=>{ctx.releaseTimer=null;if(ctx.roomCode)refreshRoom(false)},700+Math.floor(Math.random()*1800));
 }
}
async function restore(){if(!ctx.client)return;try{
 const data=await ctx.client.auth.getSession();if(data.error)throw data.error;const session=data.data.session;if(!session){teacherSession(null);return}
 const incoming=new URLSearchParams(location.search).get('room');
 if(incoming&&/^[A-F0-9]{8}$/i.test(incoming)){
   const code=incoming.toUpperCase();$('joinCode').value=code;
   try{
     const profile=await rpc('qwiz_student_identity',{p_action:'me',p_data:{}});
     if(profile?.registered){
       $('joinName').value=profile.full_name;
       const request=QwizTeams.joinRequest(code,profile.full_name);await rpc(request.method,request.args);
       ctx.roomCode=code;storage.set('room',code);showScreen('game');await refreshRoom(false);signal('team');
       if(ctx.room)return;
     }
   }catch(error){notice('joinNotice',error.message||'Не удалось принять приглашение. Подтвердите вход.','error');}
 }
 resumeOffer();
 const isAdmin=await rpc('org_quiz_is_admin_check');teacherSession(isAdmin?session:null);
 // Credentials restore access; the user chooses when to open the cabinet.
 // An explicit room link still joins, while a normal visit keeps the entry page.
 }catch{showScreen('home')}}
function attach(){q('#logoHome').addEventListener('click',home);
 $('teamInvitationNotice').hidden=!QwizTeams.intent().team;if(QwizTeams.intent().team)setRole('player');
 setRole(storage.get('entry-role')==='host'?'host':'player');
 $('changeTeacherAccount').onclick=logout;$('resumeGameButton').onclick=resumeGame;
 $('togglePassword').onclick=()=>{const visible=$('loginPassword').type==='password';$('loginPassword').type=visible?'text':'password';$('togglePassword').setAttribute('aria-pressed',String(visible));$('togglePassword').setAttribute('aria-label',visible?'Скрыть пароль':'Показать пароль')};
 // The welcome page now has no redundant left-hand navigation.
 $('homeQrOpen').onclick=()=>openQrDialog();$('studioQrOpen').onclick=()=>openQrDialog(ctx.roomCode);
 $('homeQrCopy').onclick=()=>copyQrLink();$('qrCopy').onclick=()=>copyQrLink(activeQrCode);
 $('qrClose').onclick=()=>$('qrDialog').close();$('qrDone').onclick=()=>$('qrDialog').close();
 $('qrDialog').addEventListener('click',e=>{if(e.target===$('qrDialog'))$('qrDialog').close()});
 $('openPresenter').onclick=openPresenterWindow;$('openPresenterSide').onclick=openPresenterWindow;
 $('rolePlayer').onclick=()=>setRole('player');$('roleHost').onclick=()=>setRole('host');
 $('joinCode').addEventListener('input',e=>{e.target.value=e.target.value.replace(/[^a-f0-9]/gi,'').toUpperCase()});
 const roles=q('#entryPanel .switch');
 roles.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const target=event.key==='ArrowLeft'||event.key==='Home'?'player':'host';
  setRole(target);
  $(target==='player'?'rolePlayer':'roleHost').focus();
 });
 $('joinForm').addEventListener('submit',joinRoom);$('loginForm').addEventListener('submit',login);$('logoutButton').onclick=logout;
 document.addEventListener('click',event=>{
  const target=event.target.closest('[data-tab]');if(target&&ctx.mode==='studio')tab(target.dataset.tab);
  const choose=event.target.closest('[data-pick-quiz]');if(choose){$('roomQuizSelect').value=choose.dataset.pickQuiz;tab('room')}
  const remove=event.target.closest('[data-remove-question]');if(remove){const item=remove.closest('.question-editor');if(qa('.question-editor').length>1)item.remove();else notice('quizNotice','Нужен хотя бы один вопрос.','error')}
  const answer=event.target.closest('#gameContent [data-answer]');if(answer)submitAnswer(Number(answer.dataset.answer));
  const submit=event.target.closest('#gameContent [data-submit-rich]');if(submit)submitRichAnswer();
  const spot=event.target.closest('#gameContent #richSpot');if(spot&&ctx.room?.phase==='question'){
   const rect=spot.getBoundingClientRect(),img=spot.querySelector('img');
   const scale=img?.naturalWidth&&img?.naturalHeight?Math.min(rect.width/img.naturalWidth,rect.height/img.naturalHeight):null;
   const drawW=scale?img.naturalWidth*scale:rect.width,drawH=scale?img.naturalHeight*scale:rect.height;
   const padX=(rect.width-drawW)/2,padY=(rect.height-drawH)/2;
   const imageX=event.clientX-rect.left-padX,imageY=event.clientY-rect.top-padY;
   if(imageX<0||imageX>drawW||imageY<0||imageY>drawH)return;
   ctx.hotspotQuestion=ctx.room.code+':'+ctx.room.index;
   ctx.hotspotPoint={x:Number((imageX/drawW*100).toFixed(2)),y:Number((imageY/drawH*100).toFixed(2))};
   const mark=$('richMarker');
   if(mark){mark.hidden=false;mark.style.left=((event.clientX-rect.left)/rect.width*100)+'%';mark.style.top=((event.clientY-rect.top)/rect.height*100)+'%'}
  }
 
 });
 $('createQuizToggle').onclick=()=>{$('quizCreator').hidden=false;$('quizTitle').focus()};
 $('closeQuizCreator').onclick=()=>{$('quizCreator').hidden=true};$('addQuestion').onclick=addQuestion;$('quizForm').addEventListener('submit',saveQuiz);
 $('refreshCatalog').onclick=loadCatalog;$('importQuiz').onclick=importQuiz;
 $('createRoomForm').addEventListener('submit',createRoom);
 $('hostStart').onclick=()=>advance('start');$('hostReveal').onclick=()=>advance('reveal');$('hostNext').onclick=()=>advance('next');$('hostFinish').onclick=()=>advance('finish');$('hostNewRoom').onclick=()=>{cleanupRoom();storage.del('host-room');renderRoom();renderQrPanels();tab('room')};
 $('refreshRoom').onclick=()=>refreshRoom();$('copyInvite').onclick=copyInvite;
 $('exportResults').onclick=exportResults;
 $('hostPlayers').addEventListener('change',e=>{const input=e.target.closest('[data-team-for]');if(input)assign(input.dataset.teamFor,input.value)});
 QwizStage.iconLabel($('gameSound'),QwizStage.audio.enabled?'Звук включён':'Звук выключен',QwizStage.audio.enabled?'volume':'muted');
 $('gameSound').setAttribute('aria-pressed',String(QwizStage.audio.enabled));
 $('gameSound').onclick=async()=>{const on=await QwizStage.audio.toggle();QwizStage.iconLabel($('gameSound'),on?'Звук включён':'Звук выключен',on?'volume':'muted');$('gameSound').setAttribute('aria-pressed',String(on))};
 QwizStage.bindFullscreen($('gameFullscreen'));
 $('leaveGame').onclick=async()=>{await QwizStage.exitFullscreen();cleanupRoom();home()};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ctx.roomCode)scheduleRefresh(200)});
 addQuestion();
 setInterval(()=>{if(ctx.roomCode&&!document.hidden)refreshRoom(false)},20000);
 ctx.clock=setInterval(updateClocks,500);
 renderQrPanels();
 const incoming=new URLSearchParams(location.search).get('room');
 if(incoming&&/^[A-F0-9]{8}$/i.test(incoming))$('joinCode').value=incoming.toUpperCase();
}

/* One locally generated QR code: room-specific after creation, general entry before that.
   No join URL is sent to a third-party QR service. */
let activeQrCode=null;
function joinUrl(code=null){
 const url=new URL('./',window.location.href);
 if(code)url.searchParams.set('room',String(code).toUpperCase());
 return url.toString();
}
const qrCache=new WeakMap();
function writeQR(containerId,url,size){
 const container=$(containerId);if(!container)return;
 const key=url+'|'+size;
 if(qrCache.get(container)===key && container.querySelector('img'))return;
 container.replaceChildren();
 if(typeof QRCode!=='function'){container.textContent='Не удалось загрузить генератор QR';return}
 try{
  new QRCode(container,{text:url,width:size,height:size,
   colorDark:'#232626',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  qrCache.set(container,key);
 }catch(error){container.textContent='QR-код временно недоступен'}
}
function renderQrPanels(){
 const code=ctx.room?.code||storage.get('host-room')||null;
 const homeCode=code||null;
 text('homeQrCode',homeCode||'QWIZ-PARTY');
 text('homeQrText',homeCode
  ?'Отсканируйте код для входа в комнату '+homeCode+'.'
  :'Отсканируйте код, чтобы открыть страницу QWIZ-PARTY на телефоне.');
 writeQR('homeQr',joinUrl(homeCode),160);
 const present=Boolean(ctx.roomCode&&ctx.room);
 $('studioQrOpen').disabled=!present;
 $('openPresenterSide').disabled=!present;
 text('studioQrCode',present?ctx.roomCode:'Нет комнаты');
 text('studioQrIntro',present
  ?'Покажите код участникам. Нажмите на него, чтобы увеличить.'
  :'Создайте комнату, и здесь появится код для подключения участников.');
 if(present)writeQR('studioQr',joinUrl(ctx.roomCode),145);
 else $('studioQr').replaceChildren();
}
function openQrDialog(code){
 activeQrCode=code===undefined?(ctx.room?.code||storage.get('host-room')||null):code;
 const room=Boolean(activeQrCode);
 text('qrDialogTitle',room?'Вход в комнату':'Открыть QWIZ-PARTY');
 text('qrDialogCode',room?activeQrCode:'QWIZ-PARTY');
 writeQR('qrLarge',joinUrl(activeQrCode),320);
 $('qrDialog').showModal();
 $('qrClose').focus();
}
async function copyQrLink(code=ctx.room?.code||storage.get('host-room')||null){
 const address=joinUrl(code);
 try{await navigator.clipboard.writeText(address);
  const target=ctx.mode==='studio'?'hostNotice':'joinNotice';
  notice(target,'Ссылка скопирована.','success');
 }catch{
  window.prompt('Скопируйте ссылку для участников:',address);
 }
}
/* Windows extended desktop: a separate projection-only browser window.
   We request screen management on the actual click, with manual movement fallback. */
async function openPresenterWindow(){
 const code=ctx.room?.code||ctx.roomCode;
 if(!code){notice('presenterNotice','Сначала создайте комнату.','error');return}
 const url=new URL('./presenter.html',location.href);url.searchParams.set('room',code);
 const popup=window.open(url.toString(),'qwiz_party_projector',
  'popup=yes,width=1280,height=760,menubar=no,toolbar=no,location=no,status=no');
 if(!popup){
  notice('presenterNotice','Браузер заблокировал окно. Разрешите всплывающие окна для QWIZ-PARTY.','error');
  return;
 }
 let onSecond=false;
 if('getScreenDetails' in window){
  try{
   const screens=await window.getScreenDetails();
   const secondary=screens.screens.find(s=>!s.isPrimary)
    ||screens.screens.find(s=>s!==screens.currentScreen);
   if(secondary){
    popup.moveTo(secondary.availLeft,secondary.availTop);
    popup.resizeTo(secondary.availWidth,secondary.availHeight);
    onSecond=true;
   }
  }catch{}
 }
 popup.focus();
 notice('presenterNotice',onSecond
  ?'Окно проектора открыто на дополнительном дисплее. В нём включите полноэкранный режим.'
  :'Окно проектора открыто. Если оно осталось на основном мониторе, перенесите его Win + Shift + → или ←, затем нажмите F11.',
 'success');
}

async function init(){attach();QwizStage.decorateControls();if(!window.supabase?.createClient){notice('joinNotice','Не удалось подключиться к игре. Проверьте подключение к интернету.','error');notice('loginNotice','Не удалось подключиться к игре.','error');return}
 ctx.client=window.supabase.createClient(URL_SUPABASE,KEY_SUPABASE);
 await restore();
}
window.addEventListener('DOMContentLoaded',init);
window.addEventListener('pageshow',event=>{if(event.persisted)restore()});
