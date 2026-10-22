'use strict';
// QWIZ-PARTY Studio: server-owned sessions; no scoring/answer keys in public displays.
const SUPABASE_URL='https://bderfrcfuhnutuoyudje.supabase.co';
const SUPABASE_KEY='sb_publishable_Hv7NgYuVsfKhFuhX_9pl0Q_qXWA2wOr';
const $=id=>document.getElementById(id);
const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Only the approved "Flags of the World" formats are exposed in the new library.
// The old scoring primitives remain server-side for compatibility with historic rooms.
const flagModes=[
 ['country','Угадать страну по флагу',true],
 ['picker','Выбрать флаг по названию',true],
 ['colors','Цвета и полосы',true],
 ['symbols','Символы и гербы',false],
 ['fragments','Скрытые фрагменты и пиксели',false],
 ['errors','Поиск ошибок',false],
 ['similar','Похожие флаги',false],
 ['assemble','Сборка флага',false],
 ['multiple','Несколько правильных ответов',false],
 ['memory','Задания на память',false],
 ['geo','География и карты',false],
 ['history','История и символика',false]
];
const titleKind=id=>flagModes.find(x=>x[0]===id)?.[1]||'Флаги мира';
const icons={round:'▦',intro:'◉',break:'♫',team_stats:'▥',player_stats:'♙',bonus:'✦',duel:'⇄',finale:'★'};
const cardSvgPaths={
 round:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
 intro:'<circle cx="12" cy="12" r="8.5"/><path d="m10 8 6 4-6 4z"/>',
 break:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
 team_stats:'<circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2c0-3 2-5 5.5-5s5.5 2 5.5 5v2M17 5a3 3 0 0 1 0 6M17 14c2.5 0 4 2 4 4v2"/>',
 player_stats:'<circle cx="12" cy="7" r="4"/><path d="M4.5 21v-2c0-4.2 3-7 7.5-7s7.5 2.8 7.5 7v2"/>',
 bonus:'<path d="m12 2 2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6L12 2Z"/>',
 duel:'<path d="m4 7 4-4m0 0 4 4M8 3v12M20 17l-4 4m0 0-4-4m4 4V9"/>',
 finale:'<path d="M7 4h10v7c0 7-10 7-10 0V4ZM7 7H3v3c0 3 3 5 6 5m8-8h4v3c0 3-3 5-6 5m-3 2v4m-4 0h8"/>',
 flag:'<path d="M5 21V3m0 1c5-3 8 2 15-1v11c-7 3-10-2-15 1"/>',
 map:'<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.7 4.9-4.9 2.7 2.7-4.9 4.9-2.7z"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 logic:'<path d="m12 2 9 10-9 10L3 12l9-10z"/>'
};
const glyphToCardIcon={'▦':'round','◉':'intro','♫':'break','▥':'team_stats','♙':'player_stats','✦':'bonus','⇄':'duel','★':'finale','⚑':'flag','⌖':'map','☷':'list','◆':'logic'};
function cardIconSvg(type,glyph=null){
 const key=glyphToCardIcon[glyph]||type;
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(cardSvgPaths[key]||cardSvgPaths.round)+'</svg>';
}
const titles={round:'Раунд вопросов',intro:'Начало игры',break:'Музыкальная пауза',team_stats:'Рейтинг команд',player_stats:'Статистика игроков',bonus:'Бонусная активность',duel:'Дуэль команд',finale:'Финал игры'};
const buildDefaults={count:5,seconds:30,answer_seconds:10,order:'random',offset:0,team_cap:null,player_cap:null,sound:'fanfare',lead_seconds:5};
const state={db:null,topics:[],builds:[],questions:[],questionTotal:0,cards:[],buildId:null,editingQuestion:null,editingCard:null,roomCode:null,room:null,roomBusy:false,bankOffset:0,bankPageSize:25,channel:null,insights:null,bankTimer:null,roomTimer:null,activePage:'bank',dragFrom:null,clockOffset:0,liveKey:'',lastDeadlineRefresh:0};
function msg(id,text='',isError=false){const el=$(id);if(!el)return;el.textContent=text;el.classList.toggle('error',!!isError)}
function disable(id,value){const el=$(id);if(el)el.disabled=value}
function fmt(x){return Number(x||0).toLocaleString('ru-RU')}
async function rpc(method,args={}){const {data,error}=await state.db.rpc(method,args);if(error)throw new Error(error.message||'Ошибка базы данных');return data}
async function studio(action,p_input={}){return rpc('qwiz_studio',{p_action:action,p_input})}
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
const runningMotion=new Map();
function animateView(element,frames,options={}){
 if(!element||!element.animate||motionPreference.matches||element.hidden)return;
 runningMotion.get(element)?.cancel();
 const animation=element.animate(frames,{duration:480,easing:'cubic-bezier(.16,1,.3,1)',...options});
 runningMotion.set(element,animation);
 const clear=()=>{if(runningMotion.get(element)===animation)runningMotion.delete(element)};
 animation.finished.then(clear,clear);
}
motionPreference.addEventListener?.('change',event=>{if(event.matches)for(const animation of runningMotion.values())animation.cancel()});
function animatePage(element){animateView(element,[{opacity:.25,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}])}
function connection(status,text){const el=$('connText');el.dataset.state=status;el.textContent=text;el.title=text;el.setAttribute('aria-label',text)}
let refreshFeedbackTimer;
async function refreshWorkspace(){
 const button=$('refreshAll');if(button.disabled)return;
 clearTimeout(refreshFeedbackTimer);button.disabled=true;button.setAttribute('aria-busy','true');button.dataset.state='loading';$('refreshLabel').textContent='Обновляем';
 try{await overview();await loadRooms();if(state.roomCode)await refreshLive();
  button.dataset.state='done';$('refreshLabel').textContent='Готово';connection('ready','Кабинет подключён');
  refreshFeedbackTimer=setTimeout(()=>{delete button.dataset.state;$('refreshLabel').textContent='Обновить'},1600);
 }catch(error){button.dataset.state='error';$('refreshLabel').textContent='Повторить';msg('bankMessage',error.message,true);connection('error','Не удалось обновить кабинет')}
 finally{button.disabled=false;button.setAttribute('aria-busy','false')}
}
function section(section){state.activePage=section;for(const id of ['bank','builder','rooms','insights'])$(id+'Page').hidden=id!==section;
 for(const n of all('[data-section]')){const selected=n.dataset.section===section;n.classList.toggle('selected',selected);if(selected)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')}
 animatePage($(section+'Page'));
 if(section==='rooms')loadRooms();if(section==='insights')loadInsights();
 window.scrollTo({top:0,behavior:'instant'})}
function createOption(value,label){const n=document.createElement('option');n.value=value;n.textContent=label;return n}
function fillSelect(select,options,placeholder,selected=''){select.replaceChildren();if(placeholder!==null)select.add(createOption('',placeholder));for(const [value,title]of options)select.add(createOption(value,title));select.value=selected}
function nameTopic(id){return state.topics.find(t=>t.id===id)?.name||'Все темы'}
async function overview(){const d=await studio('overview');state.topics=d.topics||[];state.builds=d.builds||[];renderTopics();renderBuilds();updateSelectors();await loadQuestions()}
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
 const input={search:$('bankSearch').value.trim().slice(0,90),topic_id:$('bankTopic').value,kind:'flag',mode:$('bankMode').value,sort:$('bankSort').value,offset:state.bankOffset,limit:state.bankPageSize};
 try{const data=await studio('questions',input);state.questions=data.items||[];state.questionTotal=data.total||0;
  $('navQuestionCount').textContent=fmt(state.questionTotal);$('questionsTotal').textContent='('+fmt(state.questionTotal)+')';
  const totalPages=Math.max(1,Math.ceil(state.questionTotal/state.bankPageSize));
  $('bankPageInfo').textContent='Страница '+(Math.floor(state.bankOffset/state.bankPageSize)+1)+' из '+totalPages;
  $('bankPrevious').disabled=state.bankOffset===0;
  $('bankNext').disabled=state.bankOffset+state.bankPageSize>=state.questionTotal;
  renderQuestions();renderTopics();msg('bankMessage','');
 }catch(e){msg('bankMessage',e.message,true)}
}
let previewWindow=null,previewPage=[],previewOffset=0,previewIndex=0,previewTotal=0;
function previewFilter(offset){
 return {search:$('bankSearch').value.trim().slice(0,90),topic_id:$('bankTopic').value,kind:'flag',
  mode:$('bankMode').value,sort:$('bankSort').value,limit:25,offset};
}
function previewSend(){
 if(!previewWindow||previewWindow.closed||!previewPage[previewIndex])return;
 previewWindow.postMessage({type:'qwiz-preview-data',question:previewPage[previewIndex],index:previewOffset+previewIndex+1,total:previewTotal},location.origin);
}
function previewQuestion(id){
 const index=state.questions.findIndex(q=>q.id===id);
 if(index<0)return;
 previewPage=state.questions.slice();previewIndex=index;previewOffset=state.bankOffset;previewTotal=state.questionTotal;
 const url=new URL('./question-preview.html',location.href);
 previewWindow=window.open(url.href,'qwiz_party_question_preview','popup=yes,width=1020,height=780,resizable=yes,scrollbars=yes');
 if(!previewWindow){msg('bankMessage','Браузер заблокировал окно. Разрешите всплывающие окна для сайта.',true);return}
 previewWindow.focus();
}
window.addEventListener('message',async e=>{
 if(e.origin!==location.origin||e.source!==previewWindow)return;
 if(e.data?.type==='qwiz-preview-ready'){previewSend();return}
 if(e.data?.type==='qwiz-preview-edit'){const question=previewPage[previewIndex];if(question)editQuestion(question.id);return}
 if(e.data?.type!=='qwiz-preview-step')return;
 const step=Number(e.data.step)===-1?-1:1;
 const next=previewIndex+step;
 if(next>=0&&next<previewPage.length){previewIndex=next;previewSend();return}
 const target=previewOffset+next;
 if(target<0||target>=previewTotal)return;
 try{
  const offset=Math.floor(target/25)*25;
  const page=await studio('questions',previewFilter(offset));
  if(!page.items?.length)return;
  previewPage=page.items;previewOffset=offset;previewIndex=target-offset;previewSend();
 }catch(error){msg('bankMessage','Ошибка предпросмотра: '+error.message,true)}
});
function renderQuestions(){
 $('bankItems').innerHTML=state.questions.length?state.questions.map(q=>'<article class="question-row">'+
  '<div><div class="question-meta"><span class="chip">'+esc(titleKind(q.solution?.flag_mode))+'</span><span class="chip lilac">'+esc(nameTopic(q.topic_id))+'</span><span class="chip">★ '+esc(q.difficulty)+'</span></div>'+
  '<h3>'+esc(q.prompt)+'</h3><p>'+(q.tags?.includes('fw:published')?'Проверен · доступен для игры':'Черновик · не участвует в раундах')+'</p></div>'+
  '<div class="question-actions"><button type="button" class="small-button" data-preview-question="'+esc(q.id)+'">Предпросмотр</button><button type="button" class="small-button" data-edit-question="'+esc(q.id)+'">Изменить</button>'+
  (!q.tags?.includes('fw:published')?'<button class="small-button" data-publish-question="'+esc(q.id)+'" title="После проверки правильного ответа и изображения">Опубликовать</button>':'')+
  '</div></article>').join(''):
  '<div class="empty">Вопросов пока нет. Выберите тему и добавьте первый вопрос.</div>';
 if(state.activePage==='bank')animateView($('bankItems'),[{opacity:.35,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:420});
}
async function saveTopic(e){e.preventDefault();
 try{const name=$('topicName').value.trim(),category=$('topicCategory').value;
  await studio('topic_save',{name,category});$('topicDialog').close();$('topicForm').reset();await overview();
 }catch(err){msg('topicNotice',err.message,true)}
}
function answerEditor(mode,question){
 const opts=question?.options||[],sol=question?.solution||{};
 const count=4;
 if(mode==='colors'){
  const orientation=opts[0]?.orientation||'horizontal';
  const sequence=Array.from({length:4},(_,i)=>{
   const colors=Array.isArray(opts[i]?.stripes)?opts[i].stripes:['#000000','#dd0000','#ffce00'];
   return '<div class="color-answer-row"><strong>Вариант '+String.fromCharCode(65+i)+'</strong>'+
    '<div class="color-chip-inputs">'+colors.slice(0,3).map((color,j)=>'<label>Полоса '+(j+1)+'<input type="color" data-stripe="'+i+':'+j+'" value="'+esc(/^#[0-9a-f]{6}$/i.test(color)?color:'#000000')+'" aria-label="Вариант '+String.fromCharCode(65+i)+', полоса '+(j+1)+'"></label>').join('')+'</div>'+
    '<label>Описание последовательности для показа ответа<input data-color-label="'+i+'" maxlength="120" required value="'+esc(sol.option_labels?.[i]||'')+'" placeholder="Например: чёрный — красный — жёлтый"></label></div>';
  }).join('');
  $('answerEditor').innerHTML='<div class="answer-fields"><label>Направление полос<select id="colorOrientation"><option value="horizontal" '+(orientation==='horizontal'?'selected':'')+'>Горизонтальные · сверху вниз</option><option value="vertical" '+(orientation==='vertical'?'selected':'')+'>Вертикальные · слева направо</option></select></label><p class="small-help">Задайте для каждого варианта три цветные полосы. Студенты увидят цвета, а не текст подсказок.</p>'+sequence+
   '<label>Правильный вариант<select id="correctAnswer">'+Array.from({length:4},(_,i)=>'<option value="'+i+'" '+(Number(sol.correct||0)===i?'selected':'')+'>'+String.fromCharCode(65+i)+'</option>').join('')+'</select></label></div>';
  return;
 }
 const title=mode==='picker'?'Флаги — варианты ответа':'Страны — варианты ответа';
 const content=Array.from({length:count},(_,i)=>{
  const item=opts[i];
  if(mode==='picker'){
   const url=typeof item==='object'&&item?item.image_url||'':'';
   const label=sol.option_labels?.[i]||((typeof item==='object'&&item)?item.label||'':'');
   return '<div class="flag-option-editor"><label>Флаг '+String.fromCharCode(65+i)+' · HTTPS-ссылка на SVG<input data-flag-image="'+i+'" type="url" required value="'+esc(url)+'" placeholder="https://…/fr.svg"></label><label>Страна на флаге '+String.fromCharCode(65+i)+'<input data-flag-label="'+i+'" required maxlength="100" value="'+esc(label)+'" placeholder="Название для проверки и разбора"></label></div>';
  }
  return '<label>'+String.fromCharCode(65+i)+' · страна<input data-option="'+i+'" required maxlength="120" value="'+esc(typeof item==='string'?item:'')+'" placeholder="Название страны"></label>';
 }).join('');
 $('answerEditor').innerHTML='<div class="answer-fields"><span class="mini-label">'+title+'</span>'+content+
 '<label>Правильный вариант<select id="correctAnswer">'+Array.from({length:count},(_,i)=>'<option value="'+i+'" '+(Number(sol.correct||0)===i?'selected':'')+'>'+String.fromCharCode(65+i)+'</option>').join('')+'</select></label></div>'+
 (mode==='country'?'<label>SVG флага (HTTPS)<input id="questionMediaUrl" type="url" required placeholder="https://…/fr.svg" value="'+esc(sol.media_url||'')+'"></label>':
 '<p class="small-help">На экране студент увидит изображения без названий стран. Названия нужны только для проверки и раскрытия ответа.</p>');
}
function editQuestion(id=null){
 const question=state.questions.find(q=>q.id===id)||null;
 if(question&&question.kind!=='flag'){msg('bankMessage','Этот старый формат не доступен в новой библиотеке.',true);return}
 state.editingQuestion=question?.id||null;
 $('questionDialogTitle').textContent=question?'Редактирование вопроса':'Создание вопроса';
 $('editKind').value=flagModes.some(x=>x[0]===question?.solution?.flag_mode&&x[2])?question.solution.flag_mode:'country';
 $('editTopic').value=question?.topic_id||state.topics.find(t=>t.name==='Флаги мира')?.id||'';
 $('editPrompt').value=question?.prompt||'';
 $('editIllustration').value=question?.solution?.illustration_url||'';
 $('editExplanation').value=question?.explanation||'';
 $('editDifficulty').value=String(question?.difficulty||2);
 answerEditor($('editKind').value,question);msg('questionSaveMessage','');$('questionDialog').showModal();
}
async function saveQuestion(event){
 event.preventDefault();
 const mode=$('editKind').value;
 if(!flagModes.some(([id,,ready])=>id===mode&&ready)){msg('questionSaveMessage','Эта механика ещё не подключена к игровому движку.',true);return}
 const isUrl=value=>/^https:\/\/[^/?#]+\/\S+$/i.test(value);
 const options=mode==='colors'?Array.from({length:4},(_,i)=>({
  orientation:$('colorOrientation').value,
  stripes:all('[data-stripe]',$('answerEditor')).filter(input=>input.dataset.stripe.startsWith(i+':')).map(input=>input.value)
 })):mode==='picker'?all('[data-flag-image]',$('answerEditor')).map(input=>({image_url:input.value.trim()})):
  all('[data-option]',$('answerEditor')).map(input=>input.value.trim());
 const labels=mode==='colors'?all('[data-color-label]',$('answerEditor')).map(input=>input.value.trim()):
  mode==='picker'?all('[data-flag-label]',$('answerEditor')).map(input=>input.value.trim()):options;
 if(options.length!==4||labels.some(v=>!v)||new Set(labels.map(x=>x.toLocaleLowerCase('ru-RU'))).size!==4){
  msg('questionSaveMessage','Нужно четыре разных и заполненных варианта.',true);return
 }
 if(mode==='picker'&&(options.some(x=>!isUrl(x.image_url))||new Set(options.map(x=>x.image_url)).size!==4)){
  msg('questionSaveMessage','Для каждого варианта нужна своя корректная HTTPS-ссылка на флаг.',true);return
 }
 const solution={correct:Number($('correctAnswer').value),flag_mode:mode};
 if(mode==='picker'||mode==='colors')solution.option_labels=labels;
 const mediaUrl=$('questionMediaUrl')?.value.trim()||'';
 if(mode==='country'){if(!isUrl(mediaUrl)){msg('questionSaveMessage','Укажите HTTPS-ссылку на изображение флага.',true);return}solution.media_url=mediaUrl}
 const illustration=$('editIllustration').value.trim();
 if(illustration){if(!isUrl(illustration)){msg('questionSaveMessage','Для иллюстрации нужна HTTPS-ссылка.',true);return}solution.illustration_url=illustration}
 disable('questionSubmit',true);
 try{
  await studio('question_save',{id:state.editingQuestion||undefined,kind:'flag',
   topic_id:$('editTopic').value||null,prompt:$('editPrompt').value.trim(),
   options,solution,difficulty:Number($('editDifficulty').value),
   explanation:$('editExplanation').value.trim()});
  $('questionDialog').close();await loadQuestions();
 }catch(e){msg('questionSaveMessage',e.message,true)}
 finally{disable('questionSubmit',false)}
}
function card(type){return {type,title:titles[type]||'Раунд',icon:icons[type]||'◫',topic_id:null,
 settings:{...buildDefaults,flag_modes:[]}}}
function ensureFinale(){state.cards=state.cards.filter((c,i)=>c.type!=='finale'||i===state.cards.length-1);
 if(!state.cards.some(c=>c.type==='finale'))state.cards.push(card('finale'))}
function newBuild(){state.buildId=null;state.cards=[card('intro'),card('round'),card('finale')];$('buildTitle').value='';$('composer').hidden=false;renderCards();$('buildTitle').focus()}
function appendCard(type='round'){if(state.cards.length>=60){msg('buildMessage','Не больше 60 карточек.',true);return}
 state.cards.splice(Math.max(0,state.cards.length-1),0,card(type));renderCards()}
function cardDesc(c){const settings=c.settings||{};
 if(c.type==='round')return (c.topic_id?nameTopic(c.topic_id):'Тема не выбрана')+' · '+(Array.isArray(settings.flag_modes)&&settings.flag_modes.length?settings.flag_modes.map(titleKind).join(', '):'Все доступные механики')+' · '+(settings.count||5)+' вопр. · '+(settings.seconds||30)+' сек. · ответ '+(settings.answer_seconds||10)+' сек.';
 if(c.type==='finale')return 'Команды, личный рейтинг и вопросы, которые запомнились';
 return 'Дополнительная активность · настройки в карточке'}
function renderCards(){ensureFinale();$('roundCards').innerHTML=state.cards.map((c,i)=>{
 const final=c.type==='finale',emblem=final?'<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M15 7h18v13c0 13-18 13-18 0V7ZM15 11H7v6c0 7 8 10 12 8M33 11h8v6c0 7-8 10-12 8M24 30v10M16 41h16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>':cardIconSvg(c.type,c.icon);
 return '<article class="round-card" data-index="'+i+'" data-type="'+esc(c.type)+'" tabindex="0" role="group" aria-label="'+esc(c.title)+'. Открыть настройки" draggable="'+!final+'"><div class="round-card-heading"><span class="round-icon" aria-hidden="true">'+emblem+'</span><span class="small-help">'+(final?'ФИНАЛ ИГРЫ':'КАРТОЧКА '+(i+1).toString().padStart(2,'0'))+'</span></div><h3>'+esc(c.title)+'</h3><p class="round-sub">'+esc(cardDesc(c))+'</p>'+
 (final?'<div class="finale-card-tags"><span>Команды</span><span>Участники</span><span>3 + 3 вопроса</span></div>':'')+'<div class="round-actions">'+(!final?'<button type="button" data-move="'+i+':-1" aria-label="Раньше" '+(i===0?'disabled':'')+'>←</button><button type="button" data-move="'+i+':1" aria-label="Позже" '+(i>=state.cards.length-2?'disabled':'')+'>→</button>':'')+'<button type="button" class="round-edit" data-edit-card="'+i+'">'+(final?'Настроить финал':'Настроить')+'</button>'+(!final?'<button type="button" data-delete-card="'+i+'" aria-label="Удалить карточку">✕</button>':'')+'</div></article>';
 }).join('');}
function moveCard(i,j){if(j<0||j>=state.cards.length-1||i<0||i>=state.cards.length-1)return;
 const [item]=state.cards.splice(i,1);state.cards.splice(j,0,item);renderCards()}
function editCard(i){state.editingCard=i;const c=state.cards[i],s=c.settings||{};
 $('cardTitle').value=c.title;$('cardTopic').value=c.topic_id||'';$('cardIcon').value=c.icon||'▦';
 $('cardCount').value=s.count||5;$('cardSeconds').value=s.seconds||30;$('cardAnswerSeconds').value=s.answer_seconds||10;
 $('cardRoundSettings').hidden=c.type!=='round';$('cardFinalePreview').hidden=c.type!=='finale';
 $('cardOrder').value=s.order||'random';$('cardOffset').value=(s.offset||0)+1;
 $('cardTeamCap').value=s.team_cap||'';$('cardPlayerCap').value=s.player_cap||'';
 $('cardSound').value=s.sound||'fanfare';
 const selected=Array.isArray(s.flag_modes)&&s.flag_modes.length?s.flag_modes:['country','picker','colors'];
 $('cardFlagModes').innerHTML=flagModes.map(([id,name,ready])=>'<label class="check-row flag-mode-item '+(!ready?'unavailable':'')+'"><input type="checkbox" data-card-mode="'+esc(id)+'" '+(selected.includes(id)&&ready?'checked ':'')+(ready?'':'disabled ')+'><span>'+esc(name)+(ready?'':' · скоро')+'</span></label>').join('');
 $('cardModesInfo').textContent=selected.length===1?'Одна механика':selected.length===2?'Две механики':'Все доступные механики';
 $('cardModesDetails').open=false;
 $('cardDialog').showModal()}
function saveCard(event){event.preventDefault();const c=state.cards[state.editingCard];
 const selected=all('[data-card-mode]:checked',$('cardFlagModes')).map(x=>x.dataset.cardMode);
 if(c.type==='round'&&!selected.length){
  const first=$('cardFlagModes').querySelector('[data-card-mode]:not(:disabled)');
  first?.setCustomValidity('Выберите хотя бы одну доступную механику');first?.reportValidity();
  first?.addEventListener('change',()=>first.setCustomValidity(''),{once:true});return;
 }
 c.title=$('cardTitle').value.trim();
 c.topic_id=$('cardTopic').value||null;c.icon=$('cardIcon').value||icons[c.type]||'▦';
 c.settings={...c.settings,count:Number($('cardCount').value),seconds:Number($('cardSeconds').value),answer_seconds:Number($('cardAnswerSeconds').value),
  order:$('cardOrder').value,offset:Math.max(0,Number($('cardOffset').value)-1),
  team_cap:$('cardTeamCap').value?Number($('cardTeamCap').value):null,
  player_cap:$('cardPlayerCap').value?Number($('cardPlayerCap').value):null,
  sound:$('cardSound').value,lead_seconds:5,flag_modes:selected.length===3?[]:selected};
 $('cardDialog').close();renderCards()}
function generalSettings(){
 const first=state.cards.find(c=>c.type==='round')?.settings||buildDefaults;
 $('generalSeconds').value=first.seconds||30;$('generalAnswerSeconds').value=first.answer_seconds||10;$('generalCount').value=first.count||5;$('generalSound').value=first.sound||'fanfare';
 $('generalApplyCount').checked=false;$('generalApplySound').checked=false;$('generalCount').disabled=true;$('generalSound').disabled=true;
 $('generalRoundCount').textContent=state.cards.filter(c=>c.type==='round').length;$('generalDialog').showModal();
}
function saveGeneralSettings(event){
 event.preventDefault();const timing={seconds:Number($('generalSeconds').value),answer_seconds:Number($('generalAnswerSeconds').value)};
 if(timing.seconds<10||timing.seconds>120||timing.answer_seconds<5||timing.answer_seconds>30)return;
 if($('generalApplyCount').checked)timing.count=Number($('generalCount').value);
 if($('generalApplySound').checked)timing.sound=$('generalSound').value;
 Object.assign(buildDefaults,timing);for(const c of state.cards)if(c.type==='round')c.settings={...buildDefaults,...c.settings,...timing};
 $('generalDialog').close();renderCards();msg('buildMessage','Общие настройки применены. Сохраните сборку, чтобы использовать их в игре.');QwizStage.audio.play('accept');
}
function renderBuilds(){$('savedBuilds').innerHTML=state.builds.length?state.builds.map(b=>
 '<div class="saved-build-wrap"><button type="button" class="saved-build" data-load-build="'+esc(b.id)+'"><span>СОХРАНЁННАЯ СБОРКА</span><strong>'+esc(b.title)+'</strong><span>Редактировать →</span></button><button type="button" class="small-button delete-small" data-delete-build="'+esc(b.id)+'" aria-label="Удалить сборку '+esc(b.title)+'">Удалить</button></div>').join(''):'<div class="empty">Сборок пока нет. Создайте первую.</div>'}
async function deleteBuild(id){
 const build=state.builds.find(b=>b.id===id);if(!build)return;
 if(!confirm('Удалить сборку «'+build.title+'»? Сыгранные комнаты и результаты сохранятся.'))return;
 try{
  await studio('build_delete',{id});
  if(state.buildId===id){state.buildId=null;$('composer').hidden=true}
  await overview();
  msg('buildMessage','Сборка удалена. История сыгранных комнат сохранена.');
 }catch(error){msg('buildMessage',error.message,true)}
}
async function deleteRoom(id){
 const room=state.hostRooms?.find(x=>x.id===id);if(!room)return;
 if(!confirm('Убрать комнату «'+room.title+'»? Если в ней уже участвовали студенты, результаты сохранятся в архиве.'))return;
 try{
  const result=await rpc('qwiz_remove_room',{p_room:id});
  if(state.roomCode===room.code){state.roomCode=null;sessionStorage.removeItem('qwiz-host-room');$('liveConsole').hidden=true;if(state.channel)state.db.removeChannel(state.channel);state.channel=null}
  await loadRooms();
  msg('launchMessage',result.archived?'Комната убрана из списка. История ответов сохранена.':'Пустая комната удалена.');
 }catch(error){msg('launchMessage',error.message,true)}
}
async function loadBuild(id){try{const r=await studio('build_get',{id});state.buildId=r.build.id;
 $('buildTitle').value=r.build.title;state.cards=r.cards||[];ensureFinale();$('composer').hidden=false;renderCards();section('builder');
 }catch(e){msg('buildMessage',e.message,true)}}
async function saveBuild(){disable('saveBuild',true);msg('buildMessage','Сохранение…');
 try{ensureFinale();if(!state.cards.some(c=>c.type==='round'))throw Error('Добавьте хотя бы один раунд вопросов.');
 const result=await studio('build_save',{id:state.buildId||undefined,title:$('buildTitle').value.trim(),
  cards:state.cards});state.buildId=result.id;
 await overview();msg('buildMessage','Сборка сохранена. Её можно запустить с любого вашего устройства.');}
 catch(e){msg('buildMessage',e.message,true)}finally{disable('saveBuild',false)}}
async function loadRooms(){try{const list=await rpc('qwiz_host_rooms');state.hostRooms=list;$('hostRoomList').innerHTML=list.length?list.map(r=>
 '<article class="room-row"><div><div class="question-meta"><span class="chip">'+esc(r.phase)+'</span><span class="chip lilac">'+esc(r.code)+'</span></div><h3>'+esc(r.title)+'</h3><p>'+esc(r.players)+' участников · '+esc(r.teams)+' команд</p></div><div class="room-row-actions"><button class="primary-button" data-room="'+esc(r.code)+'">Управлять →</button><button class="small-button delete-small" data-delete-room="'+esc(r.id)+'">Удалить</button></div></article>').join(''):
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
 try{const s=await rpc('org_next_state',{p_code:state.roomCode});if(s.server_now)state.clockOffset=Date.parse(s.server_now)-Date.now();state.room=s;renderLive(s);msg('liveMessage','')}
 catch(e){msg('liveMessage',e.message,true)}finally{state.roomBusy=false}}
function renderLive(s){
 const key=s.phase+':'+s.index;if(key!==state.liveKey){state.liveKey=key;if(s.phase==='result')QwizStage.audio.play('reveal');else if(s.phase==='finished')QwizStage.audio.play(s.activity?.sound||'fanfare')}
 $('liveClock').innerHTML=['question','result'].includes(s.phase)?QwizStage.clockMarkup(s,'liveTimer'):'';QwizStage.updateClock(s,state.clockOffset,document,'liveTimer',false);
$('activeRoomName').textContent=s.title;$('activeRoomCode').textContent=s.code;
 $('livePlayers').textContent=(s.players||[]).length;$('liveTeams').textContent=(s.teams||[]).length;
 $('livePhase').textContent=({lobby:'Ожидание',question:'Вопрос',result:'Разбор',finished:'Финал',countdown:'5…4…3…',intermission:'Активность'})[s.phase]||s.phase;
 $('liveAnswers').textContent=s.answers_count||0;
 $('liveStart').hidden=s.phase!=='lobby';$('liveReveal').hidden=true;
 $('liveNext').hidden=!['question','result','intermission'].includes(s.phase);$('liveNext').textContent=s.phase==='question'?'Далее: открыть ответ →':s.phase==='intermission'?'Продолжить →':'Следующий вопрос →';$('liveFinish').hidden=s.phase==='finished';
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
 $('studentRows').innerHTML=rows.map((s,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.group)+'</td><td>'+fmt(s.games)+'</td><td>'+fmt(s.answers)+'</td><td>'+fmt(s.correct)+'</td><td>'+fmt(s.accuracy)+'%</td><td>'+fmt(s.score)+'</td></tr>').join('')||'<tr><td colspan="8">Пока нет ответов.</td></tr>';
 const best=Math.max(1,...rows.slice(0,10).map(x=>Number(x.correct||0)));
 $('studentChart').innerHTML=rows.slice(0,10).map(s=>'<div class="bar-row"><span>'+esc(s.name)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+(100*Number(s.correct||0)/best).toFixed(2)+'%"></div></div><strong>'+fmt(s.correct)+'</strong></div>').join('')||'<p class="small-help">Нет данных для диаграммы.</p>';
 const bar=(arr,label)=>arr.length?arr.map(x=>{
  const total=Math.max(1,Number(x.answers||0));const good=Number(x.correct||0);
  const pct=Math.max(0,Math.min(100,Math.round(100*good/total)));
  return '<div class="bar-row"><span title="'+esc(x[label])+'">'+esc(String(x[label]||'Без темы').slice(0,25))+'</span>'+
   '<div class="bar-track" title="'+pct+'% правильных"><div class="bar-fill" style="width:'+pct+'%"></div></div>'+
   '<strong>'+pct+'%</strong></div>';
 }).join(''):'<p class="small-help">Пока нет результатов для расчёта.</p>';
 $('groupChart').innerHTML=bar(d.groups||[],'name');
 $('topicChart').innerHTML=bar(d.by_topic||[],'topic');
 $('questionChart').innerHTML=bar(d.by_question||[],'prompt');
}
async function signOut(){await state.db.auth.signOut();location.replace('./')}
function wire(){
 for(const b of all('#cardPalette [data-card]')){
  const label=b.textContent.trim().replace(/^[^\s]+\s+/,'');
  b.innerHTML=cardIconSvg(b.dataset.card)+'<span>'+esc(label)+'</span>';
 }
 for(const b of all('[data-section]'))b.onclick=()=>section(b.dataset.section);
 $('signOut').onclick=signOut;
 $('refreshAll').onclick=refreshWorkspace;
 document.addEventListener('keydown',event=>{if(event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]')||state.activePage!=='bank')return;event.preventDefault();$('bankSearch').focus()});
 $('bankSearch').oninput=()=>{clearTimeout(state.bankTimer);state.bankOffset=0;state.bankTimer=setTimeout(loadQuestions,350)};
 for(const id of ['bankTopic','bankMode','bankSort'])$(id).onchange=()=>{state.bankOffset=0;loadQuestions()};
 $('topicChips').onclick=e=>{const b=e.target.closest('[data-topic]');if(!b)return;$('bankTopic').value=b.dataset.topic;state.bankOffset=0;loadQuestions()};
 $('bankPrevious').onclick=()=>{state.bankOffset=Math.max(0,state.bankOffset-state.bankPageSize);loadQuestions()};
 $('bankNext').onclick=()=>{if(state.bankOffset+state.bankPageSize<state.questionTotal){state.bankOffset+=state.bankPageSize;loadQuestions()}};
 $('newTopic').onclick=()=>{$('topicDialog').showModal();$('topicName').focus()};$('topicForm').onsubmit=saveTopic;$('newQuestion').onclick=()=>editQuestion();
 $('bankItems').onclick=async e=>{
  const preview=e.target.closest('[data-preview-question]');
  if(preview){previewQuestion(preview.dataset.previewQuestion);return}
  const publish=e.target.closest('[data-publish-question]');
  if(publish){
   publish.disabled=true;
   try{await studio('flag_publish',{id:publish.dataset.publishQuestion});await loadQuestions()}
   catch(err){msg('bankMessage',err.message,true);publish.disabled=false}
   return;
  }
  const b=e.target.closest('[data-edit-question]');if(b)editQuestion(b.dataset.editQuestion)
 };
 $('editKind').onchange=()=>answerEditor($('editKind').value,null);
 $('questionForm').onsubmit=saveQuestion;
 $('newBuild').onclick=newBuild;$('generalSettings').onclick=generalSettings;$('generalForm').onsubmit=saveGeneralSettings;
 $('generalApplyCount').onchange=e=>{$('generalCount').disabled=!e.target.checked};$('generalApplySound').onchange=e=>{$('generalSound').disabled=!e.target.checked};
 $('studioSound').onclick=async()=>{const enabled=await QwizStage.audio.toggle();$('studioSound').setAttribute('aria-pressed',String(enabled));$('studioSound').textContent=enabled?'♫ Звук включён':'♫ Звук'};
 $('cardSoundPreview').onclick=async()=>{if(!QwizStage.audio.enabled)await QwizStage.audio.toggle();QwizStage.audio.play($('cardSound').value)};
 $('addCard').onclick=()=>appendCard('round');$('appendRound').onclick=()=>appendCard('round');
 $('cardPalette').onclick=e=>{const b=e.target.closest('[data-card]');if(b)appendCard(b.dataset.card)};
 $('roundCards').onclick=e=>{
  const edit=e.target.closest('[data-edit-card]');if(edit){editCard(Number(edit.dataset.editCard));return}
  const del=e.target.closest('[data-delete-card]');if(del){state.cards.splice(Number(del.dataset.deleteCard),1);renderCards();return}
  const move=e.target.closest('[data-move]');if(move){const [a,d]=move.dataset.move.split(':').map(Number);moveCard(a,a+d);return}
  const card=e.target.closest('.round-card');if(card&&!e.target.closest('button'))editCard(Number(card.dataset.index));
 };
 $('roundCards').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.round-card')){e.preventDefault();editCard(Number(e.target.dataset.index))}});
 $('roundCards').addEventListener('dragstart',e=>{const x=e.target.closest('.round-card');if(!x||x.dataset.type==='finale')return;
 state.dragFrom=Number(x.dataset.index);x.classList.add('dragging');e.dataTransfer.effectAllowed='move'});
 $('roundCards').addEventListener('dragover',e=>{const x=e.target.closest('.round-card');if(!x||x.dataset.type==='finale')return;e.preventDefault();x.classList.add('drop-here')});
 $('roundCards').addEventListener('dragleave',e=>e.target.closest('.round-card')?.classList.remove('drop-here'));
 $('roundCards').addEventListener('drop',e=>{const x=e.target.closest('.round-card');if(!x)return;e.preventDefault();
 if(state.dragFrom!==null)moveCard(state.dragFrom,Number(x.dataset.index));state.dragFrom=null});
 $('roundCards').addEventListener('dragend',()=>{state.dragFrom=null;all('.round-card').forEach(x=>x.classList.remove('dragging','drop-here'))});
 $('cardForm').onsubmit=saveCard;$('saveBuild').onclick=saveBuild;
 $('savedBuilds').onclick=e=>{const d=e.target.closest('[data-delete-build]');if(d){deleteBuild(d.dataset.deleteBuild);return}
  const b=e.target.closest('[data-load-build]');if(b)loadBuild(b.dataset.loadBuild)};
 $('launchButton').onclick=launch;$('reloadRooms').onclick=loadRooms;
 $('hostRoomList').onclick=e=>{const d=e.target.closest('[data-delete-room]');if(d){deleteRoom(d.dataset.deleteRoom);return}
  const b=e.target.closest('[data-room]');if(b)selectRoom(b.dataset.room)};
 $('liveStart').onclick=()=>control('start');$('liveReveal').onclick=()=>control('reveal');
 $('liveNext').onclick=()=>control('next');$('liveFinish').onclick=()=>control('finish');
 $('copyRoomUrl').onclick=copyRoom;$('openScreen').onclick=projection;$('showPublicScreen').onclick=projection;
 $('reloadInsights').onclick=loadInsights;$('studentSort').onchange=renderInsights;
 for(const b of all('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
 for(const dialog of all('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
}
async function init(){
 wire();animatePage($('bankPage'));
 fillSelect($('bankMode'),flagModes.map(([id,title])=>[id,title]),'Все механики');
 const select=$('editKind');
 select.replaceChildren();
 for(const [id,label,ready] of flagModes){
  const option=createOption(id,label+(ready?'':' · в разработке'));
  option.disabled=!ready;select.add(option);
 }
 select.value='country';
 for(let i=1;i<=15;i++)$('launchTeams').add(createOption(String(i),i+' '+(i===1?'команда':'команд')));
 $('launchTeams').value='4';
 if(!window.supabase?.createClient){connection('error','Не удалось подключиться');return}
 state.db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 try{const {data:{session}}=await state.db.auth.getSession();if(!session)throw Error('Войдите как преподаватель на главной.');
  if(!await rpc('org_quiz_is_admin_check'))throw Error('У вас нет прав преподавателя.');
  connection('ready','Кабинет подключён');
  await overview();await loadRooms();
  const code=sessionStorage.getItem('qwiz-host-room');if(code){section('rooms');await selectRoom(code)}
  state.roomTimer=setInterval(()=>{if(state.roomCode&&!document.hidden)refreshLive()},8000);
  setInterval(()=>{if(!state.room||document.hidden)return;const s=state.room;if(['question','result'].includes(s.phase)){const left=QwizStage.updateClock(s,state.clockOffset,document,'liveTimer');if(left===0&&Date.now()-state.lastDeadlineRefresh>1500){state.lastDeadlineRefresh=Date.now();refreshLive()}}else if(s.phase==='countdown'&&Date.parse(s.ends_at)<=Date.now()+state.clockOffset&&Date.now()-state.lastDeadlineRefresh>1500){state.lastDeadlineRefresh=Date.now();refreshLive()}},250);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.roomCode)refreshLive()});
 }catch(e){connection('error',e.message);$('bankItems').innerHTML='<div class="empty">'+esc(e.message)+' <a href="./">Вернуться ко входу</a></div>'}
}
window.addEventListener('DOMContentLoaded',init);
