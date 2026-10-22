'use strict';
// QWIZ-PARTY Studio: server-owned sessions; no scoring/answer keys in public displays.
const SUPABASE_URL='https://bderfrcfuhnutuoyudje.supabase.co';
const SUPABASE_KEY='sb_publishable_Hv7NgYuVsfKhFuhX_9pl0Q_qXWA2wOr';
const $=id=>document.getElementById(id);
const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds=[
 ['single','Один правильный'],['boolean','Да / нет'],['multi','Несколько правильных'],
 ['match','Соответствие'],['order','Порядок'],['text','Короткий ответ'],
 ['number','Числовой ответ'],['flag','Флаги'],['portrait','Лица и портреты'],
 ['image','Изображение'],['audio','Музыка и аудио'],['video','Видео'],
 ['map','География и карта'],['date','Историческая дата'],['estimate','На глаз'],
 ['sequence','Продолжить последовательность'],['hotspot','Найди на картинке'],
 ['puzzle','Головоломка'],['riddle','Загадка'],['auction','Аукцион'],
 ['blitz','Блиц'],['poll','Опрос']];
const supported=new Set(['single','boolean','multi','match','order','sequence','text','number','date','estimate','riddle','puzzle','blitz','flag','portrait','image','audio','video','map','poll','hotspot']);
const titleKind=id=>kinds.find(x=>x[0]===id)?.[1]||id;
const icons={round:'▦',intro:'◉',break:'♫',team_stats:'▥',player_stats:'♙',bonus:'✦',duel:'⇄',finale:'★'};
const titles={round:'Раунд вопросов',intro:'Начало игры',break:'Музыкальная пауза',team_stats:'Рейтинг команд',player_stats:'Статистика игроков',bonus:'Бонусная активность',duel:'Дуэль команд',finale:'Финал игры'};
const state={db:null,topics:[],builds:[],questions:[],questionTotal:0,cards:[],buildId:null,editingQuestion:null,editingCard:null,roomCode:null,room:null,roomBusy:false,channel:null,insights:null,bankTimer:null,roomTimer:null,activePage:'bank',dragFrom:null};
function msg(id,text='',isError=false){const el=$(id);if(!el)return;el.textContent=text;el.classList.toggle('error',!!isError)}
function disable(id,value){const el=$(id);if(el)el.disabled=value}
function fmt(x){return Number(x||0).toLocaleString('ru-RU')}
async function rpc(method,args={}){const {data,error}=await state.db.rpc(method,args);if(error)throw new Error(error.message||'Ошибка базы данных');return data}
async function studio(action,p_input={}){return rpc('qwiz_studio',{p_action:action,p_input})}
function section(section){state.activePage=section;for(const id of ['bank','builder','rooms','insights'])$(id+'Page').hidden=id!==section;
 for(const n of all('[data-section]'))n.classList.toggle('selected',n.dataset.section===section);
 if(section==='rooms')loadRooms();if(section==='insights')loadInsights();
 window.scrollTo({top:0,behavior:'instant'})}
function createOption(value,label){const n=document.createElement('option');n.value=value;n.textContent=label;return n}
function fillSelect(select,options,placeholder,selected=''){select.replaceChildren();if(placeholder!==null)select.add(createOption('',placeholder));for(const [value,title]of options)select.add(createOption(value,title));select.value=selected}
function nameTopic(id){return state.topics.find(t=>t.id===id)?.name||'Все темы'}
async function overview(){let d=await studio('overview');if(!d.topics?.length){await rpc('qwiz_seed_topics');d=await studio('overview')}state.topics=d.topics||[];state.builds=d.builds||[];renderTopics();renderBuilds();updateSelectors();await loadQuestions()}
function updateSelectors(){
 const items=state.topics.map(t=>[t.id,t.name]);
 for(const id of ['bankTopic','editTopic','cardTopic']){const el=$(id),selected=el.value;fillSelect(el,items,id==='bankTopic'?'Все темы':'Без темы',selected)}
 const buildEl=$('launchBuild'),sel=buildEl.value;fillSelect(buildEl,state.builds.map(x=>[x.id,x.title]),'Выберите сборку',sel);
}
function renderTopics(){
 const items=[{id:'',name:'Все темы'},...state.topics];
 $('topicChips').innerHTML=items.map(t=>'<button type="button" class="topic-chip '+($('bankTopic').value===t.id?'current':'')+'" data-topic="'+esc(t.id)+'">'+esc(t.name)+'</button>').join('');
}
async function loadQuestions(){
 const input={search:$('bankSearch').value.trim().slice(0,90),topic_id:$('bankTopic').value,kind:$('bankKind').value,sort:$('bankSort').value,offset:0};
 try{const data=await studio('questions',input);state.questions=data.items||[];state.questionTotal=data.total||0;
  $('navQuestionCount').textContent=fmt(state.questionTotal);$('questionsTotal').textContent='('+fmt(state.questionTotal)+')';
  renderQuestions();renderTopics();msg('bankMessage','');
 }catch(e){msg('bankMessage',e.message,true)}
}
function renderQuestions(){
 $('bankItems').innerHTML=state.questions.length?state.questions.map(q=>'<article class="question-row">'+
  '<div><div class="question-meta"><span class="chip">'+esc(titleKind(q.kind))+'</span><span class="chip lilac">'+esc(nameTopic(q.topic_id))+'</span><span class="chip">★ '+esc(q.difficulty)+'</span></div>'+
  '<h3>'+esc(q.prompt)+'</h3><p>'+(supported.has(q.kind)?'Доступен для обычной игры':'В банке · игровой обработчик ещё не подключён')+'</p></div>'+
  '<button class="small-button" data-edit-question="'+esc(q.id)+'">Изменить</button></article>').join(''):
  '<div class="empty">Вопросов пока нет. Выберите тему и добавьте первый вопрос.</div>';
}
async function saveTopic(e){e.preventDefault();
 try{const name=$('topicName').value.trim(),category=$('topicCategory').value;
  await studio('topic_save',{name,category});$('topicDialog').close();$('topicForm').reset();await overview();
 }catch(err){msg('topicNotice',err.message,true)}
}
function answerEditor(kind,question){
 const opts=question?.options||[], sol=question?.solution||{};
 const choice=['single','boolean','flag','portrait','image','audio','video','map','poll','multi'].includes(kind);
 const bo=kind==='boolean',count=Math.max(bo?2:2,Math.min(6,opts.length||(bo?2:4)));
 if(choice){
  $('answerEditor').innerHTML='<div class="answer-fields"><span class="mini-label">Варианты ответа</span>'+
   Array.from({length:count},(_,i)=>'<label>'+String.fromCharCode(65+i)+'<input data-option="'+i+'" value="'+esc(opts[i]??(bo?['Да','Нет'][i]:''))+'" required></label>').join('')+
   (kind==='poll'?'<p class="small-help">Опрос собирает ответы без начисления очков.</p>':kind==='multi'?
    '<label>Номера правильных вариантов через запятую (например, 1,3)<input id="correctIndices" value="'+esc((sol.correct_indices||[]).map(x=>x+1).join(','))+'" required></label>':
    '<label>Правильный вариант<select id="correctAnswer">'+Array.from({length:count},(_,i)=>'<option value="'+i+'" '+(Number(sol.correct||0)===i?'selected':'')+'>'+String.fromCharCode(65+i)+'</option>').join('')+'</select></label>')+
    '</div>';
  if(['flag','portrait','image','audio','video','map'].includes(kind))
    $('answerEditor').insertAdjacentHTML('beforeend','<label>Медиафайл (публичный HTTPS-адрес)<input id="questionMediaUrl" type="url" placeholder="https://..." value="'+esc(sol.media_url||'')+'"></label>');
  return;
 }
 if(['match','order','sequence'].includes(kind)){
  $('answerEditor').innerHTML='<label>'+(kind==='match'?'Пары «предмет = соответствие», каждая с новой строки':'Элементы в правильном порядке, каждый с новой строки')+
   '<textarea id="genericItems" rows="6" required placeholder="'+(kind==='match'?'Франция = Париж&#10;Россия = Москва':'Первое событие&#10;Второе событие&#10;Третье событие')+'">'+esc(opts.join('\n'))+'</textarea></label>'+
   '<p class="small-help">В игре порядок будет перемешан, а соответствия потребуется подобрать.</p>';
  return;
 }
 if(kind==='hotspot'){
  $('answerEditor').innerHTML='<label>Ссылка на изображение (HTTPS)<input id="questionMediaUrl" type="url" required value="'+esc(sol.media_url||'')+'" placeholder="https://..."></label>'+
  '<div class="mini-grid"><label>Координата X, %<input type="number" id="hotspotX" min="0" max="100" step="0.1" required value="'+esc(sol.x??50)+'"></label>'+
  '<label>Координата Y, %<input type="number" id="hotspotY" min="0" max="100" step="0.1" required value="'+esc(sol.y??50)+'"></label>'+
  '<label>Допуск, %<input type="number" id="hotspotRadius" min="0.1" max="100" step="0.1" required value="'+esc(sol.radius??12)+'"></label></div>';
  return;
 }
 if(kind==='auction'){
  $('answerEditor').innerHTML='<p class="small-help">Ставки между командами требуют отдельного сценария и ручного подтверждения ведущего. Этот формат пока не участвует в игровых раундах.</p>';
  return;
 }
 $('answerEditor').innerHTML='<label>Правильный ответ<input id="genericAnswer" required placeholder="Введите ответ" value="'+esc(sol.answer||'')+'"></label>'+
 (kind==='estimate'?'<label>Допустимое отклонение от числа<input type="number" min="0" step="any" id="answerTolerance" value="'+esc(sol.tolerance??0)+'"></label>':'')+
 '<p class="small-help">Ответ проверяется сервером: без учёта регистра и лишних пробелов; для числа учитывается заданный допуск.</p>';
}
function editQuestion(id=null){const question=state.questions.find(q=>q.id===id)||null;state.editingQuestion=question?.id||null;
 $('questionDialogTitle').textContent=question?'Редактирование вопроса':'Создание вопроса';
 $('editKind').value=question?.kind||'single';
 $('editTopic').value=question?.topic_id||'';
 $('editPrompt').value=question?.prompt||'';
 $('editExplanation').value=question?.explanation||'';
 $('editDifficulty').value=String(question?.difficulty||2);
 answerEditor($('editKind').value,question);msg('questionSaveMessage','');$('questionDialog').showModal();
}
async function saveQuestion(event){event.preventDefault();const kind=$('editKind').value;
 const options=all('[data-option]',$('answerEditor')).map(x=>x.value.trim());
 let solution={};
 if(['single','boolean','flag','portrait','image','audio','video','map','poll','multi'].includes(kind)){
  solution=kind==='poll'?{}:kind==='multi'?{correct_indices:$('correctIndices').value.split(',').map(x=>Number(x.trim())-1)}:{correct:Number($('correctAnswer').value)};
  const mediaUrl=$('questionMediaUrl')?.value.trim()||'';
  if(mediaUrl){
    if(!/^https:\/\//i.test(mediaUrl)){msg('questionSaveMessage','Изображение должно использовать HTTPS.',true);return}
    solution.media_url=mediaUrl;
  }
 }
 else if(kind==='hotspot'){solution={media_url:$('questionMediaUrl').value.trim(),x:Number($('hotspotX').value),y:Number($('hotspotY').value),radius:Number($('hotspotRadius').value)}}
 else{solution={answer:$('genericAnswer')?.value.trim()||''};
 if(kind==='estimate')solution.tolerance=Number($('answerTolerance').value||0)}

 if(!options.length&&$('genericItems'))options.splice(0,0,...$('genericItems').value.split('\n').map(x=>x.trim()).filter(Boolean));
 if(['single','boolean','flag','portrait','image','audio','video','map','poll','multi'].includes(kind)&&options.some(x=>!x)){msg('questionSaveMessage','Заполните все варианты.',true);return}
 disable('questionSubmit',true);
 try{await studio('question_save',{id:state.editingQuestion||undefined,kind,topic_id:$('editTopic').value||null,
  prompt:$('editPrompt').value.trim(),options,solution,
  difficulty:Number($('editDifficulty').value),explanation:$('editExplanation').value.trim()});
  $('questionDialog').close();await loadQuestions();
 }catch(e){msg('questionSaveMessage',e.message,true)}finally{disable('questionSubmit',false)}}
function card(type){return {type,title:titles[type]||'Раунд',icon:icons[type]||'◫',topic_id:null,
 settings:{count:5,seconds:30,order:'random',offset:0,team_cap:null,player_cap:null,sound:'fanfare'}}}
function ensureFinale(){state.cards=state.cards.filter((c,i)=>c.type!=='finale'||i===state.cards.length-1);
 if(!state.cards.some(c=>c.type==='finale'))state.cards.push(card('finale'))}
function newBuild(){state.buildId=null;state.cards=[card('intro'),card('round'),card('finale')];$('buildTitle').value='';$('composer').hidden=false;renderCards();$('buildTitle').focus()}
function appendCard(type='round'){if(state.cards.length>=60){msg('buildMessage','Не больше 60 карточек.',true);return}
 state.cards.splice(Math.max(0,state.cards.length-1),0,card(type));renderCards()}
function cardDesc(c){const settings=c.settings||{};
 if(c.type==='round')return (c.topic_id?nameTopic(c.topic_id):'Тема не выбрана')+' · '+(settings.count||5)+' вопр. · '+(settings.seconds||30)+' сек.';
 if(c.type==='finale')return 'Финальный рейтинг команд и участников';
 return 'Дополнительная активность · настройки в карточке'}
function renderCards(){ensureFinale();$('roundCards').innerHTML=state.cards.map((c,i)=>
 '<article class="round-card" data-index="'+i+'" data-type="'+esc(c.type)+'" draggable="'+(c.type!=='finale')+'">'+
 '<span class="round-icon" aria-hidden="true">'+esc(c.icon||icons[c.type])+'</span><span class="small-help">КАРТОЧКА '+(i+1).toString().padStart(2,'0')+'</span>'+
 '<h3>'+esc(c.title)+'</h3><p class="round-sub">'+esc(cardDesc(c))+'</p>'+
 '<div class="round-actions"><button type="button" data-move="'+i+':-1" aria-label="Раньше" '+(i===0||c.type==='finale'?'disabled':'')+'>←</button>'+
 '<button type="button" data-move="'+i+':1" aria-label="Позже" '+(i>=state.cards.length-2?'disabled':'')+'>→</button>'+
 '<button type="button" class="round-edit" data-edit-card="'+i+'">Настроить</button>'+
 '<button type="button" data-delete-card="'+i+'" aria-label="Удалить карточку" '+(c.type==='finale'?'disabled':'')+'>✕</button></div></article>').join('');}
function moveCard(i,j){if(j<0||j>=state.cards.length-1||i<0||i>=state.cards.length-1)return;
 const [item]=state.cards.splice(i,1);state.cards.splice(j,0,item);renderCards()}
function editCard(i){state.editingCard=i;const c=state.cards[i],s=c.settings||{};
 $('cardTitle').value=c.title;$('cardTopic').value=c.topic_id||'';$('cardIcon').value=c.icon||'▦';
 $('cardCount').value=s.count||5;$('cardSeconds').value=s.seconds||30;
 $('cardOrder').value=s.order||'random';$('cardOffset').value=(s.offset||0)+1;
 $('cardTeamCap').value=s.team_cap||'';$('cardPlayerCap').value=s.player_cap||'';
 $('cardSound').value=s.sound||'fanfare';
 $('cardDialog').showModal()}
function saveCard(event){event.preventDefault();const c=state.cards[state.editingCard];c.title=$('cardTitle').value.trim();
 c.topic_id=$('cardTopic').value||null;c.icon=$('cardIcon').value||icons[c.type]||'▦';
 c.settings={count:Number($('cardCount').value),seconds:Number($('cardSeconds').value),
  order:$('cardOrder').value,offset:Math.max(0,Number($('cardOffset').value)-1),
  team_cap:$('cardTeamCap').value?Number($('cardTeamCap').value):null,
  player_cap:$('cardPlayerCap').value?Number($('cardPlayerCap').value):null,
  sound:$('cardSound').value,lead_seconds:5};
 $('cardDialog').close();renderCards()}
function renderBuilds(){$('savedBuilds').innerHTML=state.builds.length?state.builds.map(b=>
 '<button type="button" class="saved-build" data-load-build="'+esc(b.id)+'"><span>СОХРАНЁННАЯ СБОРКА</span><strong>'+esc(b.title)+'</strong><span>Редактировать →</span></button>').join(''):'<div class="empty">Сборок пока нет. Создайте первую.</div>'}
async function loadBuild(id){try{const r=await studio('build_get',{id});state.buildId=r.build.id;
 $('buildTitle').value=r.build.title;state.cards=r.cards||[];ensureFinale();$('composer').hidden=false;renderCards();section('builder');
 }catch(e){msg('buildMessage',e.message,true)}}
async function saveBuild(){disable('saveBuild',true);msg('buildMessage','Сохранение…');
 try{ensureFinale();if(!state.cards.some(c=>c.type==='round'))throw Error('Добавьте хотя бы один раунд вопросов.');
 const result=await studio('build_save',{id:state.buildId||undefined,title:$('buildTitle').value.trim(),
  cards:state.cards});state.buildId=result.id;
 await overview();msg('buildMessage','Сборка сохранена. Её можно запустить с любого вашего устройства.');}
 catch(e){msg('buildMessage',e.message,true)}finally{disable('saveBuild',false)}}
async function loadRooms(){try{const list=await rpc('qwiz_host_rooms');$('hostRoomList').innerHTML=list.length?list.map(r=>
 '<article class="room-row"><div><div class="question-meta"><span class="chip">'+esc(r.phase)+'</span><span class="chip lilac">'+esc(r.code)+'</span></div><h3>'+esc(r.title)+'</h3><p>'+esc(r.players)+' участников · '+esc(r.teams)+' команд</p></div><button class="primary-button" data-room="'+esc(r.code)+'">Управлять →</button></article>').join(''):
 '<div class="empty">Создайте комнату из сохранённой сборки.</div>';
 }catch(e){msg('launchMessage',e.message,true)}}
async function launch(){disable('launchButton',true);msg('launchMessage','');
 try{if(!$('launchBuild').value)throw Error('Выберите сборку.');
 const created=await rpc('qwiz_launch_build',{p_build:$('launchBuild').value,p_title:$('launchTitle').value.trim()||null,p_teams:Number($('launchTeams').value)});
 msg('launchMessage','Комната '+created.code+' создана. Вопросов: '+created.total_questions);
 await loadRooms();await selectRoom(created.code)}
 catch(e){msg('launchMessage',e.message,true)}finally{disable('launchButton',false)}}
function subscribeRoom(code){if(state.channel){state.db.removeChannel(state.channel);state.channel=null}
 state.channel=state.db.channel('org-next-'+code,{config:{broadcast:{ack:false}}})
 .on('broadcast',{event:'phase'},()=>refreshLive())
 .on('broadcast',{event:'team'},()=>refreshLive())
 .on('broadcast',{event:'answer'},()=>refreshLive())
 .subscribe();
}
async function selectRoom(code){state.roomCode=code;sessionStorage.setItem('qwiz-host-room',code);
 $('liveConsole').hidden=false;subscribeRoom(code);await refreshLive();
 $('liveConsole').scrollIntoView({behavior:'smooth',block:'start'})}
async function refreshLive(){if(!state.roomCode||state.roomBusy)return;state.roomBusy=true;
 try{const s=await rpc('org_next_state',{p_code:state.roomCode});state.room=s;renderLive(s);msg('liveMessage','')}
 catch(e){msg('liveMessage',e.message,true)}finally{state.roomBusy=false}}
function renderLive(s){$('activeRoomName').textContent=s.title;$('activeRoomCode').textContent=s.code;
 $('livePlayers').textContent=(s.players||[]).length;$('liveTeams').textContent=(s.teams||[]).length;
 $('livePhase').textContent=({lobby:'Ожидание',question:'Вопрос',result:'Разбор',finished:'Финал',countdown:'5…4…3…',intermission:'Активность'})[s.phase]||s.phase;
 $('liveAnswers').textContent=s.answers_count||0;
 $('liveStart').hidden=s.phase!=='lobby';$('liveReveal').hidden=s.phase!=='question';
 $('liveNext').hidden=!['result','intermission'].includes(s.phase);$('liveFinish').hidden=s.phase==='finished';
 $('liveQuestion').textContent=s.phase==='intermission'?(s.activity?.title||'Дополнительная активность')+
  ' · нажмите «Следующий вопрос», чтобы продолжить':
  s.phase==='countdown'?'Серверный обратный отсчёт: 5 секунд':
  s.question?s.question.prompt+' · '+(s.index+1)+' / '+s.total:
  s.phase==='finished'?'Игра завершена. Итоги на экране аудитории.':'Ожидание начала игры.';
 $('liveRanking').innerHTML=(s.teams||[]).slice().sort((a,b)=>b.score-a.score).map((t,i)=>
  '<div class="live-line"><span>'+ (i+1)+'. '+esc(t.name)+'</span><strong>'+esc(t.score)+'</strong></div>').join('');
 $('liveRoster').innerHTML=(s.players||[]).map(p=>'<div class="live-line"><span>'+esc(p.name)+'</span><small>'+
 esc(s.teams.find(t=>t.id===p.team_id)?.name||'—')+'</small></div>').join('')}
async function control(action){if(!state.room)return;for(const id of ['liveStart','liveReveal','liveNext','liveFinish'])disable(id,true);
 try{if(action==='finish'&&!confirm('Завершить игру?'))return;
 await rpc('org_next_advance',{p_room:state.room.room_id,p_action:action});
 state.channel?.send({type:'broadcast',event:'phase',payload:{room:state.roomCode}})?.catch(()=>{});
 await refreshLive()}catch(e){msg('liveMessage',e.message,true)}
 finally{for(const id of ['liveStart','liveReveal','liveNext','liveFinish'])disable(id,false)}}
function projection(){const u=new URL('./presenter.html',location.href);if(state.roomCode)u.searchParams.set('room',state.roomCode);
 window.open(u.toString(),'qwiz_party_public_screen','noopener,width=1280,height=760')}
async function copyRoom(){const u=new URL('./',location.href);u.searchParams.set('room',state.roomCode);
 try{await navigator.clipboard.writeText(u.toString());msg('liveMessage','Ссылка на вход скопирована.')}
 catch{prompt('Ссылка:',u.toString())}}
async function loadInsights(){try{state.insights=await rpc('qwiz_teacher_stats');renderInsights()}
 catch(e){$('insightMetrics').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}
function renderInsights(){const d=state.insights||{},overview=d.overview||{},students=d.students||[];
 $('insightMetrics').innerHTML=[['Комнат',overview.rooms||0],['Завершено',overview.completed||0],['Студентов',students.length],['Ответов',students.reduce((s,x)=>s+Number(x.answers||0),0)]]
  .map(([label,value])=>'<div><span>'+label+'</span><strong>'+fmt(value)+'</strong></div>').join('');
 const key=$('studentSort').value;const rows=students.slice().sort((a,b)=>Number(b[key]||0)-Number(a[key]||0));
 $('studentRows').innerHTML=rows.map((s,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.group)+'</td><td>'+fmt(s.games)+'</td><td>'+fmt(s.answers)+'</td><td>'+fmt(s.correct)+'</td><td>'+fmt(s.score)+'</td></tr>').join('')||'<tr><td colspan="7">Пока нет ответов.</td></tr>';
 const best=Math.max(1,...rows.slice(0,10).map(x=>Number(x.correct||0)));
 $('studentChart').innerHTML=rows.slice(0,10).map(s=>'<div class="bar-row"><span>'+esc(s.name)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+(100*Number(s.correct||0)/best).toFixed(2)+'%"></div></div><strong>'+fmt(s.correct)+'</strong></div>').join('')||'<p class="small-help">Нет данных для диаграммы.</p>';
 const bar=(arr,label)=>arr.length?arr.map(x=>{
  const total=Math.max(1,Number(x.answers||0));const good=Number(x.correct||0);
  const pct=Math.max(0,Math.min(100,Math.round(100*good/total)));
  return '<div class="bar-row"><span title="'+esc(x[label])+'">'+esc(String(x[label]||'Без темы').slice(0,25))+'</span>'+
   '<div class="bar-track" title="'+pct+'% правильных"><div class="bar-fill" style="width:'+pct+'%"></div></div>'+
   '<strong>'+pct+'%</strong></div>';
 }).join(''):'<p class="small-help">Пока нет результатов для расчёта.</p>';
 $('topicChart').innerHTML=bar(d.by_topic||[],'topic');
 $('questionChart').innerHTML=bar(d.by_question||[],'prompt');
}
async function signOut(){await state.db.auth.signOut();location.replace('./')}
function wire(){
 for(const b of all('[data-section]'))b.onclick=()=>section(b.dataset.section);
 $('signOut').onclick=signOut;
 $('refreshAll').onclick=async()=>{await overview();await loadRooms();if(state.roomCode)await refreshLive()};
 $('bankSearch').oninput=()=>{clearTimeout(state.bankTimer);state.bankTimer=setTimeout(loadQuestions,350)};
 for(const id of ['bankTopic','bankKind','bankSort'])$(id).onchange=loadQuestions;
 $('topicChips').onclick=e=>{const b=e.target.closest('[data-topic]');if(!b)return;$('bankTopic').value=b.dataset.topic;loadQuestions()};
 $('newTopic').onclick=()=>{$('topicDialog').showModal();$('topicName').focus()};$('topicForm').onsubmit=saveTopic;$('newQuestion').onclick=()=>editQuestion();
 $('bankItems').onclick=e=>{const b=e.target.closest('[data-edit-question]');if(b)editQuestion(b.dataset.editQuestion)};
 $('editKind').onchange=()=>answerEditor($('editKind').value,null);
 $('questionForm').onsubmit=saveQuestion;
 $('newBuild').onclick=newBuild;
 $('addCard').onclick=()=>appendCard('round');$('appendRound').onclick=()=>appendCard('round');
 $('cardPalette').onclick=e=>{const b=e.target.closest('[data-card]');if(b)appendCard(b.dataset.card)};
 $('roundCards').onclick=e=>{
  const edit=e.target.closest('[data-edit-card]');if(edit){editCard(Number(edit.dataset.editCard));return}
  const del=e.target.closest('[data-delete-card]');if(del){state.cards.splice(Number(del.dataset.deleteCard),1);renderCards();return}
  const move=e.target.closest('[data-move]');if(move){const [a,d]=move.dataset.move.split(':').map(Number);moveCard(a,a+d)}
 };
 $('roundCards').addEventListener('dragstart',e=>{const x=e.target.closest('.round-card');if(!x||x.dataset.type==='finale')return;
 state.dragFrom=Number(x.dataset.index);x.classList.add('dragging');e.dataTransfer.effectAllowed='move'});
 $('roundCards').addEventListener('dragover',e=>{const x=e.target.closest('.round-card');if(!x||x.dataset.type==='finale')return;e.preventDefault();x.classList.add('drop-here')});
 $('roundCards').addEventListener('dragleave',e=>e.target.closest('.round-card')?.classList.remove('drop-here'));
 $('roundCards').addEventListener('drop',e=>{const x=e.target.closest('.round-card');if(!x)return;e.preventDefault();
 if(state.dragFrom!==null)moveCard(state.dragFrom,Number(x.dataset.index));state.dragFrom=null});
 $('roundCards').addEventListener('dragend',()=>{state.dragFrom=null;all('.round-card').forEach(x=>x.classList.remove('dragging','drop-here'))});
 $('cardForm').onsubmit=saveCard;$('saveBuild').onclick=saveBuild;
 $('savedBuilds').onclick=e=>{const b=e.target.closest('[data-load-build]');if(b)loadBuild(b.dataset.loadBuild)};
 $('launchButton').onclick=launch;$('reloadRooms').onclick=loadRooms;
 $('hostRoomList').onclick=e=>{const b=e.target.closest('[data-room]');if(b)selectRoom(b.dataset.room)};
 $('liveStart').onclick=()=>control('start');$('liveReveal').onclick=()=>control('reveal');
 $('liveNext').onclick=()=>control('next');$('liveFinish').onclick=()=>control('finish');
 $('copyRoomUrl').onclick=copyRoom;$('openScreen').onclick=projection;$('showPublicScreen').onclick=projection;
 $('reloadInsights').onclick=loadInsights;$('studentSort').onchange=renderInsights;
 for(const b of all('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
 for(const dialog of all('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
}
async function init(){
 wire();fillSelect($('bankKind'),kinds,'Все типы');fillSelect($('editKind'),kinds,null,'single');
 for(let i=1;i<=15;i++)$('launchTeams').add(createOption(String(i),i+' '+(i===1?'команда':'команд')));
 $('launchTeams').value='4';
 if(!window.supabase?.createClient){$('connText').textContent='Сбой загрузки Supabase';return}
 state.db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 try{const {data:{session}}=await state.db.auth.getSession();if(!session)throw Error('Войдите как преподаватель на главной.');
  if(!await rpc('org_quiz_is_admin_check'))throw Error('У вас нет прав преподавателя.');
  $('connText').textContent='● Кабинет подключён';
  await overview();await loadRooms();
  const code=sessionStorage.getItem('qwiz-host-room');if(code){section('rooms');await selectRoom(code)}
  state.roomTimer=setInterval(()=>{if(state.roomCode&&!document.hidden)refreshLive()},12000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.roomCode)refreshLive()});
 }catch(e){$('connText').textContent=e.message;$('bankItems').innerHTML='<div class="empty">'+esc(e.message)+' <a href="./">Вернуться ко входу</a></div>'}
}
window.addEventListener('DOMContentLoaded',init);
