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
 ['symbols','Символы и гербы',true],
 ['fragments','Скрытые фрагменты и пиксели',true],
 ['errors','Поиск ошибок на флагах',true],
 ['similar','Похожие флаги',true],
 ['assemble','Сборка флага',true],
 ['multiple','Несколько правильных ответов',true],
 ['memory','Задания на память',true],
 ['geo','География и карты',true],
 ['history','История и символика',true]
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
 arcade_rocket:'<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.7-.84.7-2.13-.1-2.91a2 2 0 0 0-2.9-.09Z"/><path d="m12 15-3-3c.9-2.6 2.6-4.9 5-6.6C16.6 3.5 19.3 2 22 2c0 2.7-1.5 5.4-3.4 8a17.6 17.6 0 0 1-6.6 5Z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/><circle cx="16.2" cy="7.8" r="1.5"/>',
 arcade_blitz:'<circle cx="10.5" cy="13.5" r="7.5"/><path d="M8 2h5m-2.5 4V3m6.5 3.5 1.5-1.5"/><path d="m11.5 9-3 5h3l-1 4 4-6h-3Z"/>',
 arcade_tug:'<path d="M3 12h6m6 0h6M6 8l-4 4 4 4m12-8 4 4-4 4"/><path d="m10 10.3 2-2.3 2 2.3v3.4L12 16l-2-2.3Z"/><path d="m10 10.3 4 3.4m0-3.4-4 3.4"/>',
 arcade_captain:'<path d="m14.5 17.5 3-3L6.75 3.75a2.12 2.12 0 0 0-3 3L14.5 17.5Z"/><path d="m13 19 6-6m-3 3 4 4m-1 1 2-2"/><path d="m14.5 6.5 3-3a2.12 2.12 0 0 1 3 3l-3 3M5 14l-3 3 5 5 3-3"/>',
 duel:'<path d="m4 7 4-4m0 0 4 4M8 3v12M20 17l-4 4m0 0-4-4m4 4V9"/>',
 finale:'<path d="M7 4h10v7c0 7-10 7-10 0V4ZM7 7H3v3c0 3 3 5 6 5m8-8h4v3c0 3-3 5-6 5m-3 2v4m-4 0h8"/>',
 flag:'<path d="M5 21V3m0 1c5-3 8 2 15-1v11c-7 3-10-2-15 1"/>',
 map:'<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.7 4.9-4.9 2.7 2.7-4.9 4.9-2.7z"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 logic:'<path d="m12 2 9 10-9 10L3 12l9-10z"/>'
};
const glyphToCardIcon={'▦':'round','◉':'intro','♫':'break','▥':'team_stats','♙':'player_stats','✦':'bonus','⇄':'duel','★':'finale','⚑':'flag','⌖':'map','☷':'list','◆':'logic'};
function cardIconSvg(type,glyph=null){
 const key=cardSvgPaths[glyph]?glyph:(glyphToCardIcon[glyph]||type);
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(cardSvgPaths[key]||cardSvgPaths.round)+'</svg>';
}
const copySvg='<svg class="copy-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
const trashSvg='<svg class="trash-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 4h4m-7 3 1 13h8l1-13M10 11v6m4-6v6"/></svg>';
const titles={round:'Раунд вопросов',intro:'Начало игры',break:'Музыкальная пауза',team_stats:'Рейтинг команд',player_stats:'Статистика игроков',bonus:'Бонусная активность',duel:'Дуэль команд',finale:'Финал игры'};
const buildDefaults={count:5,seconds:30,answer_seconds:10,order:'random',offset:0,team_cap:null,player_cap:null,sound:'fanfare',lead_seconds:5,stats_seconds:7,bonus_percent:70,bonus_lead:15};
const arcadeGames={
 rocket:{title:'Ракетная гонка',icon:'arcade_rocket',seconds:30,help:'Все игроки разгоняют командную ракету. Учитывается средний вклад игрока, а не размер команды. Победа: +25 очков и награда.'},
 blitz:{title:'Блиц-вопрос',icon:'arcade_blitz',seconds:35,help:'7 секунд команды борются за право ответа. После захвата открывается вопрос из банка флагов. Правильный ответ: +80 очков.'},
 tug:{title:'Перетягивание очков',icon:'arcade_tug',seconds:30,help:'Команды соревнуются нажатиями. Лидеру +15 очков, последняя активная команда уступает не более 15 очков (ниже нуля не опускается).'},
 captain:{title:'Дуэль капитанов',icon:'arcade_captain',seconds:30,help:'Капитан команды ждёт 3 секунды до сигнала, затем нажимает один раз. Фальстарт расходует попытку. Участникам показываются ход дуэли и результаты. Победа: +15 очков.'}
};
const state={db:null,topics:[],builds:[],questions:[],questionTotal:0,cards:[],buildId:null,editingQuestion:null,editingCard:null,roomCode:null,room:null,roomBusy:false,bankOffset:0,bankPageSize:25,bankRequest:0,channel:null,insights:null,bankTimer:null,roomTimer:null,activePage:'bank',dragFrom:null,selectedCard:null,clockOffset:0,liveKey:'',lastDeadlineRefresh:0};
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
const resumeKey='qwiz-studio-position-v3';
let restoringView=true,restoreScrollQueued=false; // Lock persistence during initial render; F5 must not overwrite saved section.
function savePosition(){
 if(restoringView)return;
 try{sessionStorage.setItem(resumeKey,JSON.stringify({
  section:state.activePage,scrollY:Math.max(0,Math.round(window.scrollY)),
  buildId:state.buildId,roomCode:state.roomCode,bankOffset:state.bankOffset,
  search:$('bankSearch')?.value||'',topic:$('bankTopic')?.value||'',
  mode:$('bankMode')?.value||'',sort:$('bankSort')?.value||''
 }))}catch{}
}
function readPosition(){
 try{const x=JSON.parse(sessionStorage.getItem(resumeKey)||'null');
  return x&&['bank','builder','rooms','insights'].includes(x.section)?x:null
 }catch{return null}
}
async function restorePosition(last=readPosition()){
 if(!last)return;
 restoringView=true;
 try{
  if(typeof last.search==='string')$('bankSearch').value=last.search.slice(0,90);
  for(const [id,key]of [['bankTopic','topic'],['bankSort','sort']])
   if(typeof last[key]==='string'&&[...$(id).options].some(o=>o.value===last[key]))$(id).value=last[key];
  configureBankModes();
  if(typeof last.mode==='string'&&[...$('bankMode').options].some(o=>o.value===last.mode))$('bankMode').value=last.mode;
  state.bankOffset=Math.max(0,Math.floor(Number(last.bankOffset)||0));
  await loadQuestions();
  if(last.section==='builder'&&last.buildId&&state.builds.some(b=>b.id===last.buildId))await loadBuild(last.buildId);
  else section(last.section);
  if(last.section==='rooms'&&last.roomCode&&state.hostRooms?.some(r=>r.code===last.roomCode))await selectRoom(last.roomCode);
  const target=Math.max(0,Number(last.scrollY)||0);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  window.scrollTo({top:target,behavior:'instant'});
  // Restore a second time after layout, fonts and asynchronous cards have settled.
  requestAnimationFrame(()=>window.scrollTo({top:target,behavior:'instant'}));
 }finally{restoringView=false;savePosition()}
}
function section(section){state.activePage=section;for(const id of ['bank','builder','rooms','insights'])$(id+'Page').hidden=id!==section;
 for(const n of all('[data-section]')){const selected=n.dataset.section===section;n.classList.toggle('selected',selected);if(selected)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')}
 animatePage($(section+'Page'));
 if(section==='rooms')loadRooms();if(section==='insights')loadInsights();
 window.scrollTo({top:0,behavior:'instant'});if(!restoringView)history.replaceState(null,'','#'+section);savePosition()}
function createOption(value,label){const n=document.createElement('option');n.value=value;n.textContent=label;return n}
function fillSelect(select,options,placeholder,selected=''){select.replaceChildren();if(placeholder!==null)select.add(createOption('',placeholder));for(const [value,title]of options)select.add(createOption(value,title));select.value=selected}
function nameTopic(id){return state.topics.find(t=>t.id===id)?.name||'Все темы'}
async function overview(){
 const d=await studio('overview');state.topics=d.topics||[];state.builds=d.builds||[];
 updateSelectors();configureBankModes();renderTopics();renderBuilds();await loadQuestions();
}
function updateSelectors(){
 const items=state.topics.map(t=>[t.id,t.name]);
 for(const id of ['bankTopic','editTopic','cardTopic']){
  const el=$(id),selected=el.value;
  fillSelect(el,items,id==='bankTopic'?'Все темы':'Без темы',selected);
 }
 const buildEl=$('launchBuild'),sel=buildEl.value;
 fillSelect(buildEl,state.builds.map(x=>[x.id,x.title]),'Выберите сборку',sel);
}
function renderTopics(){
 const selected=$('bankTopic').value,items=[{id:'',name:'Все темы'},...state.topics];
 $('topicChips').innerHTML=items.map(t=>
  '<button type="button" class="topic-chip '+(selected===t.id?'current':'')+
  '" aria-pressed="'+(selected===t.id)+'" data-topic="'+esc(t.id)+'">'+esc(t.name)+'</button>'
 ).join('');
}

const geoModeNames={locate:'Найти субъект на карте',identify:'Угадать название на карте',capital:'Административный центр',flag:'Узнать по флагу',silhouette:'Угадать по силуэту',neighbour:'Соседние субъекты',detective:'Географический детектив',district:'Федеральный округ'};
const geoStoredModes=new Set(['capital','district']);
function isGeoTopic(id=$('bankTopic')?.value){return !!id&&state.topics.some(t=>t.id===id&&t.name==='География России')}
function isFlagTopic(id=$('bankTopic')?.value){return !!id&&state.topics.some(t=>t.id===id&&t.name==='Флаги мира')}
function configureBankModes(){
 const choose=$('bankMode'),previous=choose.value;
 const options=isGeoTopic()?Object.entries(geoModeNames):isFlagTopic()?flagModes.map(([id,name])=>[id,name]):[];
 fillSelect(choose,options,'Все механики',previous);
}
function updateBankHeading(){
 const topic=state.topics.find(t=>t.id===$('bankTopic').value)?.name||'Все вопросы';
 const title=$('bankHeading'),subtitle=$('bankDescription');
 if(title)title.textContent=topic;
 if(subtitle)subtitle.textContent=topic==='География России'
   ?'178 проверенных вопросов по 89 субъектам: административные центры и федеральные округа. В игровых раундах также доступны восемь интерактивных механик карты России.'
   :topic==='Флаги мира'
    ?'Чистая библиотека: 193 государства — члена ООН и два наблюдателя. Проверенные изображения и вопросы.'
    :'Все темы и игровые задания в одной библиотеке. Выберите тему для фильтрации.';
}
async function loadQuestions(){
 const request=++state.bankRequest;
 const topic=$('bankTopic').value,mode=$('bankMode').value;
 const search=$('bankSearch').value.trim().slice(0,90),sort=$('bankSort').value;
 const offset=state.bankOffset,limit=state.bankPageSize;
 const geo=isGeoTopic(topic),flags=isFlagTopic(topic);
 updateBankHeading();renderTopics();msg('bankMessage','');
 try{
  const data=geo
   ?await rpc('qwiz_geo_questions',{p_search:search,p_mode:mode,p_sort:sort,p_offset:offset,p_limit:limit})
   :await studio('questions',{search,topic_id:topic,kind:flags?'flag':'',mode:flags?mode:'',sort,offset,limit});
  if(request!==state.bankRequest)return;
  state.questions=data.items||[];state.questionTotal=Number(data.total)||0;
  $('navQuestionCount').textContent=fmt(state.questionTotal);
  $('questionsTotal').textContent='('+fmt(state.questionTotal)+')';
  const totalPages=Math.max(1,Math.ceil(state.questionTotal/limit));
  $('bankPageInfo').textContent='Страница '+(Math.floor(offset/limit)+1)+' из '+totalPages;
  $('bankPrevious').disabled=offset===0;$('bankNext').disabled=offset+limit>=state.questionTotal;
  renderQuestions();savePosition();
 }catch(e){
  if(request!==state.bankRequest)return;
  state.questions=[];state.questionTotal=0;
  $('bankItems').innerHTML='<div class="empty">Не удалось загрузить вопросы. Обновите раздел.</div>';
  msg('bankMessage',e.message,true);
 }
}
let previewWindow=null,previewPage=[],previewOffset=0,previewIndex=0,previewTotal=0;
function previewFilter(offset){
 const geo=isGeoTopic(),flags=isFlagTopic();
 const search=$('bankSearch').value.trim().slice(0,90),mode=$('bankMode').value,sort=$('bankSort').value;
 return geo?{p_search:search,p_mode:mode,p_sort:sort,p_limit:25,p_offset:offset}
  :{search,topic_id:$('bankTopic').value,kind:flags?'flag':'',mode:flags?mode:'',sort,limit:25,offset};
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
  const page=isGeoTopic()?await rpc('qwiz_geo_questions',previewFilter(offset)):await studio('questions',previewFilter(offset));
  if(!page.items?.length)return;
  previewPage=page.items;previewOffset=offset;previewIndex=target-offset;previewSend();
 }catch(error){msg('bankMessage','Ошибка предпросмотра: '+error.message,true)}
});
function renderQuestions(){
 $('bankItems').innerHTML=state.questions.length?state.questions.map(q=>{
  const geography=!!q.solution?.geo_mode;
  const mode=geography?geoModeNames[q.solution.geo_mode]||'География России':titleKind(q.solution?.flag_mode);
  const reviewed=geography||q.tags?.includes('fw:published');
  const text=geography?'Проверен по справочнику регионов · готов к игре':
   reviewed?'Проверен · доступен для игры':'Черновик · не участвует в раундах';
  return '<article class="question-row"><div><div class="question-meta"><span class="chip">'+esc(mode)+'</span>'+
   '<span class="chip lilac">'+esc(nameTopic(q.topic_id))+'</span><span class="chip">★ '+esc(q.difficulty)+'</span></div>'+
   '<h3>'+esc(q.prompt)+'</h3><p>'+text+'</p></div>'+
   '<div class="question-actions"><button type="button" class="small-button" data-preview-question="'+esc(q.id)+'">Предпросмотр</button>'+
   (geography?'':'<button type="button" class="small-button" data-edit-question="'+esc(q.id)+'">Изменить</button>'+
   (!reviewed?'<button class="small-button" data-publish-question="'+esc(q.id)+'" title="После проверки правильного ответа и изображения">Опубликовать</button>':''))+
   '</div></article>';
 }).join(''):
 (isGeoTopic()&&!geoStoredModes.has($('bankMode').value)&&$('bankMode').value
  ?'<div class="empty">Этот картографический режим создаёт индивидуальные задания непосредственно во время игры. Они не являются заранее записанными вопросами. Выберите «Все механики», «Административный центр» или «Федеральный округ», чтобы увидеть сохранённые вопросы.</div>'
  :'<div class="empty">По выбранным условиям вопросов не найдено.</div>');
 if(state.activePage==='bank')animateView($('bankItems'),[{opacity:.35,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:420});
}
async function saveTopic(e){e.preventDefault();
 try{const name=$('topicName').value.trim(),category=$('topicCategory').value;
  await studio('topic_save',{name,category});$('topicDialog').close();$('topicForm').reset();await overview();
 }catch(err){msg('topicNotice',err.message,true)}
}
function answerEditor(mode,question){
 const opts=question?.options||[],sol=question?.solution||{};
 $('editIllustration').closest('label').hidden=mode==='memory';
 const count=4;
 if(mode==='assemble'){
  const names=opts.length?opts:['синий','белый','красный'];
  $('answerEditor').innerHTML='<div class="answer-fields"><p class="small-help">Три равные полосы без герба. Укажите правильный порядок; в игре полосы перемешиваются. Студент собирает флаг и видит результат своего выбора.</p><label>Направление полос<select id="assemblyOrientation"><option value="horizontal">Горизонтально · сверху вниз</option><option value="vertical">Вертикально · слева направо</option></select></label>'+names.map((name,i)=>'<div class="two-inputs"><label>Полоса '+(i+1)+' · название цвета<input data-assembly-name required maxlength="40" value="'+esc(name)+'"></label><label>Цвет полосы<input type="color" data-assembly-color value="'+esc(sol.flag_assembly?.colors?.[name]||['#0055a4','#ffffff','#ef4135'][i])+'"></label></div>').join('')+'</div>';
  $('assemblyOrientation').value=sol.flag_assembly?.orientation||'horizontal';return;
 }
 if(['similar','multiple','memory','geo','history'].includes(mode)){
  const pictures=['similar','multiple','geo'].includes(mode);
  $('answerEditor').innerHTML='<div class="answer-fields"><p class="small-help">'+({similar:'Подберите близкие по рисунку флаги с однозначным отличием. Избегайте почти неразличимых изображений.',multiple:'Отметьте все правильные флаги. Баллы начисляются только за полный набор без лишних вариантов.',memory:'Флаг показывается в начале вопроса, затем скрывается на всех экранах. Ответы принимаются только после скрытия.',geo:'Добавьте карту или контур страны без названия. Студент выбирает соответствующий флаг.',history:'Укажите проверяемый факт и ссылку на первичный источник. Ссылка появится в разборе.'})[mode]+'</p>'+Array.from({length:4},(_,i)=>pictures?'<div class="flag-option-editor"><label>Флаг '+String.fromCharCode(65+i)+' · SVG<input data-new-image type="url" required value="'+esc(opts[i]?.image_url||'')+'"></label><label>Страна<input data-new-label required maxlength="110" value="'+esc(sol.option_labels?.[i]||'')+'"></label></div>':'<label>Вариант '+String.fromCharCode(65+i)+'<input data-new-text required maxlength="120" value="'+esc(typeof opts[i]==='string'?opts[i]:'')+'"></label>').join('')+
  (mode==='multiple'?'<fieldset><legend>Правильные варианты</legend>'+Array.from({length:4},(_,i)=>'<label class="check-row"><input type="checkbox" data-new-correct="'+i+'" '+(sol.correct_indices?.includes(i)?'checked':'')+'>Вариант '+String.fromCharCode(65+i)+'</label>').join('')+'</fieldset>':'<label>Правильный вариант<select id="correctAnswer">'+Array.from({length:4},(_,i)=>'<option value="'+i+'" '+(Number(sol.correct||0)===i?'selected':'')+'>'+String.fromCharCode(65+i)+'</option>').join('')+'</select></label>')+
  (['memory','geo'].includes(mode)?'<label>'+(mode==='memory'?'Флаг для запоминания':'Карта или контур без подписей')+' · SVG<input id="newMediaUrl" type="url" required value="'+esc(sol.media_url||'')+'"></label>':'')+
  (mode==='memory'?'<label>Время запоминания, секунд<input id="memorySeconds" type="number" min="3" max="10" value="'+esc(sol.flag_memory?.seconds||5)+'" required></label>':'')+
  (mode==='history'?'<label>Первичный источник · HTTPS<input id="historySource" type="url" required value="'+esc(sol.source_urls?.[0]||'')+'"></label>':'')+'</div>';return;
 }
 if(mode==='errors'){
  const choices=Array.from({length:4},(_,i)=>{
   const value=typeof opts[i]==='object'&&opts[i]?opts[i]:{};
   return '<div class="flag-option-editor">'+
    '<label>Вариант '+String.fromCharCode(65+i)+' · ссылка на флаг SVG<input data-error-image="'+i+'" type="url" required value="'+esc(value.image_url||'')+'" placeholder="https://…/fr.svg"></label>'+
    '<label>Подпись под флагом<input data-error-label="'+i+'" required maxlength="110" value="'+esc(value.label||'')+'" placeholder="Название государства"></label></div>';
  }).join('');
  $('answerEditor').innerHTML='<div class="answer-fields"><p class="small-help">Покажите четыре изображения с названиями стран. Только одна подпись должна быть ошибочной; этот вариант выбирается правильным ответом. Остальные три подписи должны точно соответствовать флагам.</p>'+choices+
    '<label>Вариант с ошибкой<select id="correctAnswer">'+Array.from({length:4},(_,i)=>'<option value="'+i+'" '+(Number(sol.correct||0)===i?'selected':'')+'>'+String.fromCharCode(65+i)+'</option>').join('')+'</select></label></div>';
  return;
 }
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
 (['country','symbols','fragments'].includes(mode)?'<label>SVG флага (HTTPS)<input id="questionMediaUrl" type="url" required placeholder="https://…/fr.svg" value="'+esc(sol.media_url||'')+'"></label>'+
 (['symbols','fragments'].includes(mode)?'<div class="visual-settings"><span class="mini-label">Как показывать флаг без раскрытия ответа</span>'+
 (mode==='fragments'?'<label>Способ скрытия<select id="visualType"><option value="crop" '+(sol.flag_visual?.type!=='pixel'?'selected':'')+'>Фрагмент флага</option><option value="pixel" '+(sol.flag_visual?.type==='pixel'?'selected':'')+'>Пикселизация</option></select></label>':'<p class="small-help">Показываем увеличенный символ или герб. Выбирайте страны, где он действительно есть на флаге.</p>')+
 '<div class="visual-fields"><label>Положение по горизонтали, %<input id="visualX" type="number" min="10" max="90" value="'+esc(sol.flag_visual?.x??50)+'"></label>'+
 '<label>Положение по вертикали, %<input id="visualY" type="number" min="10" max="90" value="'+esc(sol.flag_visual?.y??50)+'"></label>'+
 '<label>Увеличение фрагмента<input id="visualZoom" type="number" min="1.5" max="4" step="0.5" value="'+esc(sol.flag_visual?.zoom??2.5)+'"></label>'+
 (mode==='fragments'?'<label>Размер блоков, пикселей<input id="visualPixels" type="number" min="14" max="48" value="'+esc(sol.flag_visual?.pixels??24)+'"></label>':'')+'</div></div>':''):
 '<p class="small-help">На экране студент увидит изображения без названий стран. Названия нужны только для проверки и раскрытия ответа.</p>');
}
function editQuestion(id=null){
 const question=state.questions.find(q=>q.id===id)||null;
 if(question&&!flagModes.some(x=>x[0]===question.solution?.flag_mode)){msg('bankMessage','Этот старый формат не доступен в новой библиотеке.',true);return}
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
 if(['similar','assemble','multiple','memory','geo','history'].includes(mode)){
  let options,solution={flag_mode:mode},kind='flag';
  const sources=state.questions.find(q=>q.id===state.editingQuestion)?.solution?.source_urls;
  if(sources)solution.source_urls=sources;
  if(mode==='assemble'){
   options=all('[data-assembly-name]',$('answerEditor')).map(x=>x.value.trim());
   const colors=all('[data-assembly-color]',$('answerEditor')).map(x=>x.value);
   if(options.some(x=>!x)||new Set(options.map(x=>x.toLowerCase())).size!==3||new Set(colors).size!==3){msg('questionSaveMessage','Нужны три разных названия и цвета полос.',true);return}
   kind='order';solution.flag_assembly={orientation:$('assemblyOrientation').value,colors:Object.fromEntries(options.map((x,i)=>[x,colors[i]]))};
  }else{
   const pictures=['similar','multiple','geo'].includes(mode);
   options=pictures?all('[data-new-image]',$('answerEditor')).map(x=>({image_url:x.value.trim()})):all('[data-new-text]',$('answerEditor')).map(x=>x.value.trim());
   const labels=pictures?all('[data-new-label]',$('answerEditor')).map(x=>x.value.trim()):options;
   if(labels.some(x=>!x)||new Set(labels.map(x=>x.toLowerCase())).size!==4||pictures&&(options.some(x=>!isUrl(x.image_url))||new Set(options.map(x=>x.image_url)).size!==4)){msg('questionSaveMessage','Нужны четыре разных заполненных варианта и корректные защищённые ссылки.',true);return}
   if(pictures)solution.option_labels=labels;
   if(mode==='multiple'){
    kind='multi';solution.correct_indices=all('[data-new-correct]',$('answerEditor')).filter(x=>x.checked).map(x=>Number(x.dataset.newCorrect));
    if(solution.correct_indices.length<2||solution.correct_indices.length>3){msg('questionSaveMessage','Отметьте два или три правильных варианта.',true);return}
   }else solution.correct=Number($('correctAnswer').value);
   if(['memory','geo'].includes(mode)){
    solution.media_url=$('newMediaUrl').value.trim();if(!isUrl(solution.media_url)){msg('questionSaveMessage','Укажите защищённую ссылку на изображение флага.',true);return}
   }
   if(mode==='memory')solution.flag_memory={seconds:Number($('memorySeconds').value)};
   if(mode==='history'){
    solution.source_urls=[$('historySource').value.trim()];if(!isUrl(solution.source_urls[0])){msg('questionSaveMessage','Укажите ссылку на первичный источник.',true);return}
   }
  }
  const illustration=$('editIllustration').value.trim();
  if(illustration&&mode!=='memory'){if(!isUrl(illustration)){msg('questionSaveMessage','Для иллюстрации нужна защищённая ссылка.',true);return}solution.illustration_url=illustration}
  disable('questionSubmit',true);
  try{await studio('question_save',{id:state.editingQuestion||undefined,kind,topic_id:$('editTopic').value||null,prompt:$('editPrompt').value.trim(),options,solution,difficulty:Number($('editDifficulty').value),explanation:$('editExplanation').value.trim()});$('questionDialog').close();await loadQuestions()}
  catch(error){msg('questionSaveMessage',error.message,true)}finally{disable('questionSubmit',false)}return;
 }
 const options=mode==='errors'?Array.from({length:4},(_,i)=>({
  image_url:$('answerEditor').querySelector('[data-error-image="'+i+'"]')?.value.trim()||'',
  label:$('answerEditor').querySelector('[data-error-label="'+i+'"]')?.value.trim()||''
 })):mode==='colors'?Array.from({length:4},(_,i)=>({
  orientation:$('colorOrientation').value,
  stripes:all('[data-stripe]',$('answerEditor')).filter(input=>input.dataset.stripe.startsWith(i+':')).map(input=>input.value)
 })):mode==='picker'?all('[data-flag-image]',$('answerEditor')).map(input=>({image_url:input.value.trim()})):
  all('[data-option]',$('answerEditor')).map(input=>input.value.trim());
 const labels=mode==='errors'?options.map(o=>o.label):mode==='colors'?all('[data-color-label]',$('answerEditor')).map(input=>input.value.trim()):
  mode==='picker'?all('[data-flag-label]',$('answerEditor')).map(input=>input.value.trim()):options;
 if(options.length!==4||labels.some(v=>!v)||new Set(labels.map(x=>x.toLocaleLowerCase('ru-RU'))).size!==4){
  msg('questionSaveMessage','Нужно четыре разных и заполненных варианта.',true);return
 }
 if(['picker','errors'].includes(mode)&&(options.some(x=>!isUrl(x.image_url))||new Set(options.map(x=>x.image_url)).size!==4)){
  msg('questionSaveMessage','Для каждого варианта нужна своя корректная защищённая ссылка на флаг.',true);return
 }
 const solution={correct:Number($('correctAnswer').value),flag_mode:mode};
 if(mode==='errors')solution.error_kind='mislabeled';
 if(mode==='picker'||mode==='colors')solution.option_labels=labels;
 const mediaUrl=$('questionMediaUrl')?.value.trim()||'';
 if(['country','symbols','fragments'].includes(mode)){
  if(!isUrl(mediaUrl)){msg('questionSaveMessage','Укажите защищённую ссылку на изображение флага.',true);return}
  solution.media_url=mediaUrl;
  if(mode!=='country'){
   const type=mode==='symbols'?'symbol':$('visualType').value;
   const visual={type,x:Number($('visualX').value),y:Number($('visualY').value),zoom:Number($('visualZoom').value)};
   if(mode==='fragments')visual.pixels=Number($('visualPixels').value);
   if(!['symbol','crop','pixel'].includes(type)||visual.x<10||visual.x>90||visual.y<10||visual.y>90||visual.zoom<1.5||visual.zoom>4||!Number.isFinite(visual.zoom)||visual.pixels!==undefined&&(visual.pixels<14||visual.pixels>48)){
    msg('questionSaveMessage','Некорректные настройки скрытого флага.',true);return;
   }
   solution.flag_visual=visual;
  }
 }
 const illustration=$('editIllustration').value.trim();
 if(illustration){if(!isUrl(illustration)){msg('questionSaveMessage','Для иллюстрации нужна защищённая ссылка.',true);return}solution.illustration_url=illustration}
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
function newBuild(){state.buildId=null;state.selectedCard=null;state.cards=[card('intro'),card('round'),card('finale')];$('buildTitle').value='';$('composer').hidden=false;renderCards();$('buildTitle').focus()}
function cardInsertIndex(){
 const index=state.cards.indexOf(state.selectedCard);
 return index<0?Math.max(0,state.cards.length-1):Math.min(index+1,state.cards.length-1);
}
function updateCardSelection(){
 const selected=state.cards.indexOf(state.selectedCard);
 for(const element of all('#roundCards .round-card')){
  const active=Number(element.dataset.index)===selected;
  element.classList.toggle('is-selected',active);
  element.setAttribute('aria-current',String(active));
  const title=state.cards[Number(element.dataset.index)]?.title||'Карточка';
  element.setAttribute('aria-label',title+(active?
   '. Выбрана как позиция вставки. Дважды нажмите для настройки.':
   '. Выбрать позицию вставки; двойное нажатие — настройки.'));
 }
 const hint=$('insertAfterHint');
 if(hint)hint.textContent=selected<0?'Новые карточки добавляются перед финалом':
  'Следующая карточка — после «'+state.cards[selected].title+'»'+
  (selected===state.cards.length-1?' (перед финалом)':'');
}
function selectCard(index){state.selectedCard=state.cards[index]||null;updateCardSelection()}
function appendCard(type='round',arcadeMode=null){
 if(state.cards.length>=60){msg('buildMessage','Не больше 60 карточек.',true);return null}
 const added=card(type);
 if(arcadeMode&&arcadeGames[arcadeMode]){const meta=arcadeGames[arcadeMode];added.title=meta.title;added.icon=meta.icon;added.settings.arcade_mode=arcadeMode;added.settings.arcade_seconds=meta.seconds;}
 state.cards.splice(cardInsertIndex(),0,added);
 state.selectedCard=added;
 renderCards();
 return added;
}
function cardDesc(c){const settings=c.settings||{};
 if(settings.arcade_mode==='russia_map')return 'География России · карта · '+(settings.geo_count||15)+' случайных субъектов каждому игроку · '+(settings.geo_seconds||180)+' сек. · индивидуальный прогресс';
  if(arcadeGames[settings.arcade_mode])return 'Командная мини-игра · '+(settings.arcade_seconds||arcadeGames[settings.arcade_mode].seconds)+' секунд · достижения и жетоны';
 if(c.type==='round')return (c.topic_id?nameTopic(c.topic_id):'Тема не выбрана')+' · '+(Array.isArray(settings.flag_modes)&&settings.flag_modes.length?settings.flag_modes.map(titleKind).join(', '):'Все доступные механики')+' · '+(settings.count||5)+' вопр. · '+(settings.seconds||30)+' сек. · ответ '+(settings.answer_seconds||10)+' сек.';
 if(c.type==='finale')return 'Итог всей игры: результаты команд и каждого игрока · автоматически';
 return 'Дополнительная активность · настройки в карточке'}
function renderCards(){ensureFinale();if(!state.cards.includes(state.selectedCard))state.selectedCard=null;$('roundCards').innerHTML=state.cards.map((c,i)=>{
 const final=c.type==='finale',emblem=final?'<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M15 7h18v13c0 13-18 13-18 0V7ZM15 11H7v6c0 7 8 10 12 8M33 11h8v6c0 7-8 10-12 8M24 30v10M16 41h16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>':cardIconSvg(c.type,c.icon);
 return '<article class="round-card'+(c===state.selectedCard?' is-selected':'')+'" data-index="'+i+'" data-type="'+esc(c.type)+'" tabindex="0" role="group" aria-current="'+(c===state.selectedCard?'true':'false')+'" aria-label="'+esc(c.title)+'. Выбрать позицию вставки; двойное нажатие — настройки" draggable="'+!final+'"><div class="round-card-heading"><span class="round-icon" aria-hidden="true">'+emblem+'</span><span class="small-help">'+(final?'ФИНАЛ ИГРЫ':'КАРТОЧКА '+(i+1).toString().padStart(2,'0'))+'</span></div><h3>'+esc(c.title)+'</h3><p class="round-sub">'+esc(cardDesc(c))+'</p>'+
 (final?'<div class="finale-card-tags"><span>Команды</span><span>Участники</span><span>3 + 3 вопроса</span></div>':'')+'<div class="round-actions">'+(!final?'<button type="button" data-move="'+i+':-1" aria-label="Раньше" '+(i===0?'disabled':'')+'>←</button><button type="button" data-move="'+i+':1" aria-label="Позже" '+(i>=state.cards.length-2?'disabled':'')+'>→</button>':'')+'<button type="button" class="round-edit" data-edit-card="'+i+'">'+(final?'Настроить финал':'Настроить')+'</button></div>'+(!final?'<div class="round-card-tools"><button type="button" class="card-copy round-copy" data-duplicate-card="'+i+'" title="Дублировать карточку" aria-label="Дублировать карточку '+esc(c.title)+'">'+copySvg+'</button><button type="button" class="card-trash round-trash" data-delete-card="'+i+'" title="Удалить карточку" aria-label="Удалить карточку '+esc(c.title)+'">'+trashSvg+'</button></div>':'')+'</article>';
 }).join('');updateCardSelection();}
function duplicateCard(index){
 const original=state.cards[index];
 if(!original||original.type==='finale')return;
 if(state.cards.length>=60){
  msg('buildMessage','Достигнут лимит 60 карточек. Удалите ненужную карточку, чтобы создать копию.',true);
  return;
 }
 // Deep copy of the saved card format: nested geography / arcade settings
 // and all mode arrays must remain independent from the original.
 const clone=JSON.parse(JSON.stringify(original));
 delete clone.id; // A duplicate must not retain the original database card identity.
 clone.title=(original.title||titles[original.type]||'Карточка')+' — копия';
 state.cards.splice(index+1,0,clone);
 renderCards();
 msg('buildMessage','Создана копия карточки «'+original.title+'» сразу после оригинала. Сохраните сборку, чтобы применить изменения.');
 const newCard=$('roundCards').querySelector('.round-card[data-index="'+(index+1)+'"]');
 newCard?.scrollIntoView({block:'nearest',behavior:motionPreference.matches?'auto':'smooth'});
 newCard?.focus({preventScroll:true});
}
function moveCard(i,j){if(j<0||j>=state.cards.length-1||i<0||i>=state.cards.length-1)return;
 const [item]=state.cards.splice(i,1);state.cards.splice(j,0,item);renderCards()}
function editCard(i){state.editingCard=i;const c=state.cards[i],s=c.settings||{};
 $('cardTitle').value=c.title;$('cardTopic').value=c.topic_id||'';$('cardIcon').value=c.icon||'▦';
 $('cardCount').value=s.count||5;$('cardSeconds').value=s.seconds||30;$('cardAnswerSeconds').value=s.answer_seconds||10;
 $('cardRoundSettings').hidden=c.type!=='round';$('cardFinalePreview').hidden=c.type!=='finale';
 const arcade=arcadeGames[s.arcade_mode];$('cardArcadeSettings').hidden=!arcade;
  const geo=s.arcade_mode==='russia_map';$('cardGeoSettings').hidden=!geo;
  $('cardFlagModes').hidden=geo;$('cardModesDetails').open=geo;
  if(geo)$('cardModesInfo').textContent='8 способов ответа · выберите нужные';
  if(geo){if(!c.topic_id)c.topic_id=state.topics.find(t=>t.name==='География России')?.id||null;$('cardTopic').value=c.topic_id||'';
   $('cardGeoCount').value=s.geo_count||15;$('cardGeoSeconds').value=s.geo_seconds||180;
   for(const item of all('#cardGeoModes input:not(:disabled)'))item.checked=!Array.isArray(s.geo_modes)||s.geo_modes.includes(item.value);}
 $('cardArcadeSeconds').value=s.arcade_seconds||arcade?.seconds||30;
 $('cardArcadeHelp').textContent=arcade?.help||'';
 $('cardOrder').value=s.order||'random';$('cardOffset').value=(s.offset||0)+1;
 $('cardTeamCap').value=s.team_cap||'';$('cardPlayerCap').value=s.player_cap||'';
 $('cardSound').value=s.sound||'fanfare';
 const selected=Array.isArray(s.flag_modes)&&s.flag_modes.length?s.flag_modes:flagModes.filter(x=>x[2]).map(x=>x[0]);
 $('cardFlagModes').innerHTML=flagModes.map(([id,name,ready])=>'<label class="check-row flag-mode-item '+(!ready?'unavailable':'')+'"><input type="checkbox" data-card-mode="'+esc(id)+'" '+(selected.includes(id)&&ready?'checked ':'')+(ready?'':'disabled ')+'><span>'+esc(name)+(ready?'':' · скоро')+'</span></label>').join('');
 $('cardModesInfo').textContent=geo?'8 механик · настройте для каждого игрока':selected.length===1?'Одна механика':selected.length===2?'Две механики':'Все доступные механики';
 $('cardModesDetails').open=geo;
 $('cardDialog').showModal()}
function saveCard(event){event.preventDefault();const c=state.cards[state.editingCard];
 const selected=all('[data-card-mode]:checked',$('cardFlagModes')).map(x=>x.dataset.cardMode);
  if(c.settings?.arcade_mode==='russia_map'){
   const geoTopic=state.topics.find(t=>t.name==='География России');
   if(!geoTopic){msg('buildMessage','Тема «География России» недоступна. Обновите библиотеку.',true);return}
   $('cardTopic').value=geoTopic.id;
  }
 if(c.type==='round'&&c.settings?.arcade_mode!=='russia_map'&&!selected.length){
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
  sound:$('cardSound').value,lead_seconds:c.settings.lead_seconds??buildDefaults.lead_seconds,
  stats_seconds:c.settings.stats_seconds??buildDefaults.stats_seconds,bonus_percent:c.settings.bonus_percent??buildDefaults.bonus_percent,
  bonus_lead:c.settings.bonus_lead??buildDefaults.bonus_lead,flag_modes:selected.length===flagModes.filter(x=>x[2]).length?[]:selected};
 if(arcadeGames[c.settings.arcade_mode])c.settings.arcade_seconds=Math.max(8,Math.min(40,Number($('cardArcadeSeconds').value)||arcadeGames[c.settings.arcade_mode].seconds));
  if(c.settings.arcade_mode==='russia_map'){
   const modes=all('#cardGeoModes input:checked:not(:disabled)').map(x=>x.value);
   if(!modes.length){$('cardModesDetails').open=true;msg('buildMessage','Выберите хотя бы одну механику карты России.',true);return}
   c.settings.geo_count=Math.max(1,Math.min(89,Number($('cardGeoCount').value)||15));
   c.settings.geo_seconds=Math.max(45,Math.min(600,Number($('cardGeoSeconds').value)||180));
   c.settings.geo_modes=modes;
  }
 $('cardDialog').close();renderCards()}
function generalSettings(){
 const first=state.cards.find(c=>c.type==='round')?.settings||buildDefaults;
 $('generalLeadSeconds').value=first.lead_seconds??5;$('generalStatsSeconds').value=first.stats_seconds??7;
 $('generalBonusPercent').value=first.bonus_percent??70;$('generalBonusLead').value=first.bonus_lead??15;
 $('generalSeconds').value=first.seconds||30;$('generalAnswerSeconds').value=first.answer_seconds||10;$('generalCount').value=first.count||5;$('generalSound').value=first.sound||'fanfare';
 $('generalApplyCount').checked=false;$('generalApplySound').checked=false;$('generalCount').disabled=true;$('generalSound').disabled=true;
 $('generalRoundCount').textContent=state.cards.filter(c=>c.type==='round').length;$('generalDialog').showModal();
}
function saveGeneralSettings(event){
 event.preventDefault();const timing={seconds:Number($('generalSeconds').value),answer_seconds:Number($('generalAnswerSeconds').value),
 lead_seconds:Number($('generalLeadSeconds').value),stats_seconds:Number($('generalStatsSeconds').value),
 bonus_percent:Number($('generalBonusPercent').value),bonus_lead:Number($('generalBonusLead').value)};
 if(timing.seconds<10||timing.seconds>120||timing.answer_seconds<5||timing.answer_seconds>30||
 timing.lead_seconds<1||timing.lead_seconds>5||timing.stats_seconds<5||timing.stats_seconds>10||
 timing.bonus_percent<50||timing.bonus_percent>100||timing.bonus_lead<0||timing.bonus_lead>200)return;
 if($('generalApplyCount').checked)timing.count=Number($('generalCount').value);
 if($('generalApplySound').checked)timing.sound=$('generalSound').value;
 Object.assign(buildDefaults,timing);
 for(const c of state.cards){
  if(c.type==='round')c.settings={...buildDefaults,...c.settings,...timing};
  else if(['rocket','blitz','tug','captain'].includes(c.settings?.arcade_mode))
   c.settings={...c.settings,bonus_percent:timing.bonus_percent,bonus_lead:timing.bonus_lead,stats_seconds:timing.stats_seconds,lead_seconds:timing.lead_seconds};
 }
 $('generalDialog').close();renderCards();msg('buildMessage','Общие настройки применены. Сохраните сборку, чтобы использовать их в игре.');QwizStage.audio.play('accept');
}
function renderBuilds(){$('savedBuilds').innerHTML=state.builds.length?state.builds.map(b=>
 '<div class="saved-build-wrap"><button type="button" class="saved-build" data-load-build="'+esc(b.id)+'"><span>Сохранённая сборка</span><strong>'+esc(QwizStage.capitalize(b.title))+'</strong><span>Редактировать →</span></button><button type="button" class="card-trash" data-delete-build="'+esc(b.id)+'" title="Удалить сборку" aria-label="Удалить сборку '+esc(b.title)+'">'+trashSvg+'</button></div>').join(''):'<div class="empty">Сборок пока нет. Создайте первую.</div>'}
async function deleteBuild(id){
 const build=state.builds.find(b=>b.id===id);if(!build)return;
 if(!confirm('Удалить сборку «'+build.title+'»? Сыгранные комнаты и результаты сохранятся.'))return;
 try{
  await studio('build_delete',{id});
  if(state.buildId===id){state.buildId=null;$('composer').hidden=true;savePosition()}
  await overview();
  msg('buildMessage','Сборка удалена. История сыгранных комнат сохранена.');
 }catch(error){msg('buildMessage',error.message,true)}
}
async function deleteRoom(id){
 const room=state.hostRooms?.find(x=>x.id===id);if(!room)return;
 if(!confirm('Убрать комнату «'+room.title+'»? Если в ней уже участвовали студенты, результаты сохранятся в архиве.'))return;
 try{
  const result=await rpc('qwiz_remove_room',{p_room:id});
  if(state.roomCode===room.code){state.roomCode=null;sessionStorage.removeItem('qwiz-host-room');$('liveConsole').hidden=true;if(state.channel)state.db.removeChannel(state.channel);state.channel=null;savePosition()}
  await loadRooms();
  msg('launchMessage',result.archived?'Комната убрана из списка. История ответов сохранена.':'Пустая комната удалена.');
 }catch(error){msg('launchMessage',error.message,true)}
}
async function loadBuild(id){try{const r=await studio('build_get',{id});state.buildId=r.build.id;
 $('buildTitle').value=r.build.title;
 state.selectedCard=null;state.cards=(r.cards||[]).filter(c=>!['team_stats','player_stats'].includes(c.type)&&!(c.type==='bonus'&&!c.settings?.arcade_mode));
 ensureFinale();$('composer').hidden=false;renderCards();section('builder');savePosition();
 }catch(e){msg('buildMessage',e.message,true)}}
async function saveBuild(){disable('saveBuild',true);msg('buildMessage','Сохранение…');
 try{ensureFinale();if(!state.cards.some(c=>c.type==='round'))throw Error('Добавьте хотя бы один раунд вопросов.');
 const result=await studio('build_save',{id:state.buildId||undefined,title:$('buildTitle').value.trim(),
  cards:state.cards});state.buildId=result.id;
 await overview();savePosition();msg('buildMessage','Сборка сохранена. Её можно запустить с любого вашего устройства.');}
 catch(e){msg('buildMessage',e.message,true)}finally{disable('saveBuild',false)}}
async function loadRooms(){try{const list=await rpc('qwiz_host_rooms');state.hostRooms=list;$('hostRoomList').innerHTML=list.length?list.map(r=>
 '<article class="room-row"><div><div class="question-meta"><span class="chip">'+esc(QwizStage.phaseLabel(r.phase))+'</span><span class="chip lilac">'+esc(r.code)+'</span></div><h3>'+esc(QwizStage.capitalize(r.title))+'</h3><p>'+esc(QwizStage.countLabel(r.players,{one:'участник',few:'участника',many:'участников',other:'участника'}))+' · '+esc(QwizStage.countLabel(r.teams,{one:'команда',few:'команды',many:'команд',other:'команды'}))+'</p></div><div class="room-row-actions"><button class="primary-button" data-room="'+esc(r.code)+'">Управлять →</button><button type="button" class="card-trash" data-delete-room="'+esc(r.id)+'" title="Удалить комнату" aria-label="Удалить комнату '+esc(r.title)+'">'+trashSvg+'</button></div></article>').join(''):
 '<div class="empty">Создайте комнату из сохранённой сборки.</div>';
 }catch(e){msg('launchMessage',e.message,true)}}
async function launch(){projection();disable('launchButton',true);msg('launchMessage','');
 try{if(!$('launchBuild').value)throw Error('Выберите сборку.');
 const created=await rpc('qwiz_prepare_room',{p_build:$('launchBuild').value,p_title:$('launchTitle').value.trim()||null,p_teams:Number($('launchTeams').value)});
 msg('launchMessage','Комната '+created.code+' создана. '+(created.issues?.length?'Можно собирать команды; вопросы добавьте перед началом.':'Вопросов: '+created.total_questions));
 await loadRooms();await selectRoom(created.code);if(audienceWindow&&!audienceWindow.closed){const url=new URL('./presenter.html',location.href);url.searchParams.set('room',created.code);audienceWindow.location.href=url.toString()}}
 catch(e){msg('launchMessage',e.message,true)}finally{disable('launchButton',false)}}
function subscribeRoom(code){if(state.channel){state.db.removeChannel(state.channel);state.channel=null}
 state.channel=state.db.channel('org-next-'+code,{config:{broadcast:{ack:false}}})
 .on('broadcast',{event:'phase'},()=>refreshLive())
 .on('broadcast',{event:'team'},()=>refreshLive())
 .on('broadcast',{event:'answer'},()=>refreshLive())
 .subscribe();
}
async function selectRoom(code){state.roomCode=code;sessionStorage.setItem('qwiz-host-room',code);
 $('liveConsole').hidden=false;subscribeRoom(code);await refreshLive();void loadProjectorPreferences();
 $('liveConsole').scrollIntoView({behavior:'instant',block:'start'});savePosition()}
async function refreshLive(){if(!state.roomCode)return;if(state.roomBusy){state.roomRefreshQueued=true;return;}state.roomBusy=true;const code=state.roomCode;
 try{const s=await rpc('qwiz_party_state',{p_code:code});if(code!==state.roomCode)return;if(s.server_now)state.clockOffset=Date.parse(s.server_now)-Date.now();state.room=s;renderLive(s);msg('liveMessage','')}
 catch(e){msg('liveMessage',e.message,true)}finally{state.roomBusy=false;if(state.roomRefreshQueued){state.roomRefreshQueued=false;queueMicrotask(refreshLive);}}}
function renderLive(s){
 const key=s.phase+':'+s.index;if(key!==state.liveKey){state.liveKey=key;if(s.phase==='result')QwizStage.audio.play('reveal');else if(s.phase==='finished')QwizStage.audio.play(s.activity?.sound||'fanfare')}
 $('liveClock').innerHTML=['question','result'].includes(s.phase)?QwizStage.clockMarkup(s,'liveTimer'):'';QwizStage.updateClock(s,state.clockOffset,document,'liveTimer',false);
$('activeRoomName').textContent=s.title;$('activeRoomCode').textContent=s.code;
 $('livePlayers').textContent=(s.players||[]).length;$('liveTeams').textContent=(s.teams||[]).length;
 $('livePhase').textContent=QwizStage.phaseLabel(s.phase);
 $('liveAnswers').textContent=s.answers_count||0;
 $('liveStart').hidden=false;$('liveStart').disabled=!['lobby','finished'].includes(s.phase);
 QwizStage.iconLabel($('liveStart'),s.phase==='finished'?'Повторить игру':'Начать',s.phase==='finished'?'refresh':'play');
 $('liveStart').setAttribute('aria-label',s.phase==='finished'?'Создать новую сессию той же игры, сохранив историю':'Начать текущую игру');
 $('livePause').hidden=false;$('livePause').disabled=!['countdown','question','result','intermission'].includes(s.phase);QwizStage.iconLabel($('livePause'),s.paused?'Продолжить':'Пауза',s.paused?'play':'pause');$('livePause').setAttribute('aria-pressed',String(!!s.paused));
 $('liveNext').hidden=false;$('liveNext').disabled=!!s.paused||!['question','result','intermission'].includes(s.phase);QwizStage.iconLabel($('liveNext'),'Далее','forward');$('liveReveal').hidden=true;$('liveFinish').hidden=false;$('liveFinish').disabled=s.phase==='finished';
 $('liveConsole').classList.toggle('is-finished',s.phase==='finished');
 $('liveControlsHint').textContent=s.phase==='finished'?
   'Начните новую сессию той же сборки. Предыдущая игра и результаты сохранятся.':
   s.phase==='lobby'?'Начните игру, когда команды подключатся.':'';
 $('liveControlsHint').hidden=!['finished','lobby'].includes(s.phase);
 $('liveQuestion').textContent=s.phase==='intermission'?(s.activity?.title||'Дополнительная активность')+
  ' · следующий этап откроется автоматически (можно перейти вручную)':
  s.phase==='countdown'?'Серверный обратный отсчёт: 5 секунд':
  s.question?s.question.prompt+' · '+(s.index+1)+' / '+s.total:
  s.phase==='finished'?'Игра завершена. Итоги на экране аудитории.':'Ожидание начала игры.';
 const boosts=new Map((s.public_stats?.teams||[]).map(t=>[t.id,t.boost]));
 $('liveRanking').innerHTML=(s.teams||[]).slice().sort((a,b)=>b.score-a.score).map((t,i)=>
  '<div class="live-line"><span>'+ (i+1)+'. '+esc(t.name)+' '+(boosts.get(t.id)?'<b class="team-boost-chip" title="Усиление этого раунда">✦ '+esc(boosts.get(t.id).title)+'</b>':'')+'</span><strong>'+esc(t.score)+'</strong></div>').join('');
 const stats=s.public_stats||{};const latest=(stats.question_stats||[]).at(-1);const completed=Math.max(0,s.index+1);
 $('liveRoundStats').textContent='Вопрос '+completed+' / '+s.total+' · Ответов '+(s.answers_count||0)+(latest?' · Верных '+latest.correct+'/'+latest.answered:'')+(s.paused?' · Игра на паузе':'');
 $('liveRoster').innerHTML=(s.players||[]).map(p=>'<div class="live-line"><span>'+esc(p.name)+'</span><small>'+
 esc(s.teams.find(t=>t.id===p.team_id)?.name||'Ожидает распределения')+'</small></div>').join('');renderTeamManager(s);window.QwizArcade?.mountHost($('arcadeHostPanel'),s,state.db);
 void updateModeratorSlides(s);
}
let moderatorDeckKey='',moderatorDeckBusy=false;
let projectorPrefsCode='',projectorPrefs={sound_enabled:true,volume:45,music_enabled:false};
function renderProjectorPreferences(){
 const btn=$('hostProjectorSound'),range=$('hostProjectorVolume');
 if(!btn||!range)return;
 btn.textContent='Звук проектора: '+(projectorPrefs.sound_enabled?'вкл.':'выкл.');
 btn.setAttribute('aria-pressed',String(!!projectorPrefs.sound_enabled));
 const music=$('hostProjectorMusic');if(music){music.textContent='♫ Музыка на всю игру: '+(projectorPrefs.music_enabled?'вкл.':'выкл.');music.setAttribute('aria-pressed',String(!!projectorPrefs.music_enabled));}
 range.value=String(projectorPrefs.volume);
 $('hostProjectorVolumeLabel').textContent=projectorPrefs.volume+'%';
}
async function loadProjectorPreferences(){
 const room=state.room;if(!room||projectorPrefsCode===room.code)return;
 try{
  const value=await rpc('qwiz_projector_settings',{p_room:room.room_id});
  if(state.room?.code!==room.code)return;
  projectorPrefsCode=room.code;projectorPrefs=value;renderProjectorPreferences();
 }catch(err){msg('liveMessage','Настройки проектора: '+err.message,true)}
}
async function updateProjectorPreferences(update){
 const room=state.room;if(!room)return;
 const previous={...projectorPrefs};
 projectorPrefs={...projectorPrefs,...update};renderProjectorPreferences();
 try{
  const params={p_room:room.room_id};
  if('sound_enabled' in update)params.p_enabled=update.sound_enabled;
  if('volume' in update)params.p_volume=update.volume;
  projectorPrefs=('music_enabled' in update)?{...projectorPrefs,...await rpc('qwiz_projector_music',{p_room:room.room_id,p_enable:update.music_enabled})}:await rpc('qwiz_projector_settings',params);
  renderProjectorPreferences();
 }catch(err){projectorPrefs=previous;renderProjectorPreferences();msg('liveMessage','Звук проектора: '+err.message,true)}
}
let moderatorDeckRefreshAt=0;
async function updateModeratorLiveStats(s){
 const host=$('moderatorSlides');if(!host||s.phase!=='intermission')return;
 const target=host.querySelector('.moderator-slide.is-current .moderator-slide-live');
 if(!target||Date.now()-moderatorDeckRefreshAt<3500)return;
 moderatorDeckRefreshAt=Date.now();
 const mode=s.activity?.settings?.arcade_mode||'';
 try{
   if(mode==='russia_map'){
     const d=await rpc('qwiz_geo_projection',{p_code:s.code});
     if(!target.isConnected||state.roomCode!==s.code)return;
     target.innerHTML='<div class="moderator-live-meter"><strong>'+Number(d.answered||0)+'</strong><span>решено заданий</span></div>'+
       '<div class="moderator-live-meter"><strong>'+Number(d.players||0)+'</strong><span>игроков</span></div>'+
       '<div class="moderator-live-meter"><strong>'+Number(d.remaining||0)+' c</strong><span>осталось</span></div>';
   }else if(['rocket','blitz','tug','captain'].includes(mode)){
     const d=await rpc('qwiz_party_arcade',{p_code:s.code});
     if(!target.isConnected||state.roomCode!==s.code)return;
     target.innerHTML=(d.teams||[]).slice(0,8).map(t=>'<div class="moderator-live-team"><span>'+esc(t.name)+'</span><strong>'+Number(t.points||0).toFixed(0)+'</strong></div>').join('')||
       '<p>Ожидаем результаты команд…</p>';
   }
 }catch(e){if(target.isConnected)target.textContent='Синхронизация раунда: '+e.message}
}
async function updateModeratorSlides(s){
 const root=$('moderatorSlides');
 if(!root||!s?.code||moderatorDeckBusy)return;
 const key=[s.code,s.phase,s.index,s.activity?.title,s.activity?.settings?.arcade_mode].join(':');
 if(key===moderatorDeckKey){void updateModeratorLiveStats(s);return}
 moderatorDeckBusy=true;
 try{
  const deck=await rpc('qwiz_host_slide_deck',{p_code:s.code});
  if(state.roomCode!==s.code)return;
  root.innerHTML=(deck.slides||[]).map((slide,i)=>{
   const position=i===0?'Предыдущий':i===1?'Текущий':'Следующий';
   const title=slide.kind==='question'?'Вопрос '+(slide.index+1)+' / '+deck.total:slide.title;
   const image=typeof slide.media_url==='string'&&/^https:\/\//i.test(slide.media_url)
    ?'<div class="moderator-slide-image"><img loading="lazy" decoding="async" src="'+esc(slide.media_url)+'" alt="Иллюстрация вопроса"></div>':'';
   const choices=Array.isArray(slide.options)&&slide.kind==='question'?slide.options.slice(0,4).map((choice,index)=>{
     const done=i===0||s.phase==='result'||s.phase==='finished';
     const letter=String.fromCharCode(65+index);
     const imageUrl=choice&&typeof choice==='object'&&typeof choice.image_url==='string'&&/^https:\/\//i.test(choice.image_url)?choice.image_url:'';
     const stripes=QwizStage.stripeOption(choice);
     const content=imageUrl?'<img class="moderator-option-flag" src="'+esc(imageUrl)+'" alt="Флаг, вариант '+letter+'" loading="lazy" decoding="async">':
       stripes||'<span>'+esc(typeof choice==='string'?choice:choice?.label||choice?.text||'Вариант '+letter)+'</span>';
     return '<span class="moderator-choice '+(imageUrl?'has-flag ':'')+(stripes?'has-stripes ':'')+(done&&Number(slide.correct)===index?'is-correct':'')+'">'+
       '<b class="moderator-option-letter">'+letter+'</b>'+content+'</span>';
   }).join(''):'';
   const map=slide.mode==='russia_map';
   const mode=slide.mode&&slide.mode!=='russia_map';
   const status=i===1&&s.phase==='intermission'&&(map||mode)
     ?'<div class="moderator-slide-live" role="status"><span>Загружаем показатели раунда…</span></div>':'';
   const metrics=slide.kind!=='question'&&['team_stats','player_stats','finale'].includes(slide.type)
     ?'<div class="moderator-slide-metrics">'+
      (slide.type==='player_stats'?(s.public_stats?.players||[]).slice(0,5).map(x=>'<div><span>'+esc(x.nickname||x.name||'Игрок')+'</span><b>'+Number(x.score||0)+'</b></div>').join(''):
      (s.teams||[]).slice().sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,5).map(x=>'<div><span>'+esc(x.name)+'</span><b>'+Number(x.score||0)+'</b></div>').join(''))+'</div>':'';
   return '<article class="moderator-slide '+(i===1?'is-current':'')+' '+(map?'has-map':'')+'" data-kind="'+esc(slide.kind)+'">'+
     '<span class="moderator-slide-overline">'+position+(map?' · КАРТА РФ':mode?' · МИНИ-ИГРА':'')+'</span>'+
     '<h4>'+esc(title)+'</h4><p>'+esc(slide.prompt||slide.title||'Нет слайда')+'</p>'+
     (map?'<div class="moderator-map-symbol" aria-label="Карта России">⌖ <span>89 регионов</span></div>':'')+
     image+metrics+status+(choices?'<div class="moderator-slide-choices">'+choices+'</div>':'')+
     '</article>';
  }).join('');
  moderatorDeckKey=key;moderatorDeckRefreshAt=0;
  if(s.phase==='intermission'&&s.activity?.settings?.arcade_mode==='russia_map'&&window.QwizGeo?.loadMap){
    window.QwizGeo.loadMap().then(shapes=>{
      const shell=root.querySelector('.moderator-slide.is-current .moderator-map-symbol');
      if(!shell||state.roomCode!==s.code||!Array.isArray(shapes))return;
      shell.innerHTML='<svg class="moderator-mini-map" viewBox="0 0 1120 480" role="img" aria-label="Карта России с 89 субъектами">'+
        shapes.map(region=>'<path class="moderator-mini-region" d="'+esc(region.path)+'"/>').join('')+
        '</svg>';
    }).catch(()=>{}); // Current activity and live counters remain usable offline.
  }
  void updateModeratorLiveStats(s);
 }catch(err){root.innerHTML='<p class="small-help">Не удалось загрузить предпросмотр: '+esc(err.message)+'</p>'}
 finally{moderatorDeckBusy=false}
}
// Repeat is a fresh session: never reset the completed game's answer archive.
let repeatRoomBusy=false;
async function repeatFinishedRoom(){
 const source=state.room;
 if(!source||source.phase!=='finished'||repeatRoomBusy)return;
 // Creating a separate room is non-destructive; avoid blocked native confirm dialogs.
 repeatRoomBusy=true;disable('liveStart',true);
 try{
  const created=await rpc('qwiz_repeat_finished_room',{p_room:source.room_id});
  if(!created?.code)throw Error('Сервер не вернул код новой игры');
  await loadRooms();await selectRoom(created.code);
  if(audienceWindow&&!audienceWindow.closed){
   const url=new URL('./presenter.html',location.href);
   url.searchParams.set('room',created.code);audienceWindow.location.href=url.toString();
  }
  msg('liveMessage','Новая игра '+created.code+' подготовлена. Подключите участников по новому QR-коду и нажмите «Начать».');
 }catch(error){msg('liveMessage','Не удалось повторить игру: '+error.message,true)}
 finally{repeatRoomBusy=false;if(state.room)renderLive(state.room)}
}
async function control(action){if(!state.room)return;for(const id of ['liveStart','livePause','liveReveal','liveNext','liveFinish'])disable(id,true);
 try{if(action==='finish'&&!confirm('Завершить игру?'))return;
 await rpc('qwiz_party_control',{p_room:state.room.room_id,p_action:action});
 state.channel?.send({type:'broadcast',event:'phase',payload:{room:state.roomCode}})?.catch(()=>{});
 await refreshLive()}catch(e){msg('liveMessage',e.message,true)}
 finally{for(const id of ['liveStart','livePause','liveReveal','liveNext','liveFinish'])disable(id,false);if(state.room){roomReadiness(state.room);renderLive(state.room)}}}
let audienceWindow=null;
function projection(){const u=new URL('./presenter.html',location.href);if(state.roomCode)u.searchParams.set('room',state.roomCode);
  try{if(audienceWindow&&!audienceWindow.closed){audienceWindow.location.href=u.toString();audienceWindow.focus();return true}
   audienceWindow=window.open(u.toString(),'qwiz_party_public_screen','width=1280,height=760,resizable=yes,scrollbars=yes');
   if(!audienceWindow){msg('liveMessage','Браузер заблокировал отдельный экран. Разрешите всплывающие окна для QWIZ-PARTY.',true);return false}
   audienceWindow.opener=null;return true
  }catch(e){msg('liveMessage','Не удалось открыть экран аудитории: '+e.message,true);return false}}
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
 for(const b of all('#cardPalette [data-card],#arcadePalette [data-card]')){
  // Keep the entire visible title: stripping its first word hid "Карта", "Перетягивание" and "Дуэль".
  const label=b.textContent.replace(/\s+/g,' ').trim();
  const iconKey=b.dataset.arcade?'arcade_'+b.dataset.arcade:b.dataset.geo==='russia_map'?'map':null;
  const icon=cardIconSvg(b.dataset.card,iconKey);
  const game=b.closest('#arcadePalette');
  b.innerHTML=game
   ?'<span class="arcade-palette-icon" aria-hidden="true">'+icon+'</span><span>'+esc(label)+'</span>'
   :icon+'<span>'+esc(label)+'</span>';
 }
 for(const b of all('[data-section]'))b.onclick=()=>section(b.dataset.section);
 $('signOut').onclick=()=>{sessionStorage.removeItem(resumeKey);signOut()};
 window.addEventListener('scroll',()=>{if(!restoreScrollQueued){restoreScrollQueued=true;requestAnimationFrame(()=>{restoreScrollQueued=false;savePosition()})}},{passive:true});
 window.addEventListener('pagehide',savePosition);
 $('refreshAll').onclick=refreshWorkspace;
 document.addEventListener('keydown',event=>{if(event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]')||state.activePage!=='bank')return;event.preventDefault();$('bankSearch').focus()});
 $('bankSearch').oninput=()=>{clearTimeout(state.bankTimer);state.bankOffset=0;state.bankTimer=setTimeout(loadQuestions,350)};
 for(const id of ['bankTopic','bankMode','bankSort'])$(id).onchange=()=>{if(id==='bankTopic')configureBankModes();state.bankOffset=0;loadQuestions()};
 $('topicChips').onclick=e=>{const b=e.target.closest('[data-topic]');if(!b)return;$('bankTopic').value=b.dataset.topic;configureBankModes();state.bankOffset=0;loadQuestions()};
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
 QwizStage.decorateControls();
 QwizStage.iconLabel($('studioSound'),QwizStage.audio.enabled?'Звук включён':'Звук выключен',QwizStage.audio.enabled?'volume':'muted');
 $('studioSound').setAttribute('aria-pressed',String(QwizStage.audio.enabled));
 $('studioSound').onclick=async()=>{const enabled=await QwizStage.audio.toggle();$('studioSound').setAttribute('aria-pressed',String(enabled));QwizStage.iconLabel($('studioSound'),enabled?'Звук включён':'Звук выключен',enabled?'volume':'muted')};
 $('cardSoundPreview').onclick=async()=>{if(!QwizStage.audio.enabled)await QwizStage.audio.toggle();await QwizStage.audio.unlock();QwizStage.audio.play($('cardSound').value)};
 $('addCard').onclick=()=>appendCard('round');$('appendRound').onclick=()=>appendCard('round');
 $('cardPalette').onclick=e=>{const b=e.target.closest('[data-card]');if(!b)return;
   if(b.dataset.geo==='russia_map'){
    const c=appendCard('round');if(!c)return;c.title='География России · карта 89 субъектов';c.icon='map';
    c.topic_id=state.topics.find(t=>t.name==='География России')?.id||null;
    c.settings={...c.settings,arcade_mode:'russia_map',geo_count:15,geo_seconds:180,geo_modes:['locate','identify','capital','flag','silhouette','neighbour','detective','district']};renderCards();
   }else appendCard(b.dataset.card,b.dataset.arcade||null);
  };
 $('openGamesPalette').onclick=()=>{const panel=$('gamesPalette'),show=panel.hidden;panel.hidden=!show;$('openGamesPalette').setAttribute('aria-expanded',String(show));};
 $('addFinaleCard').onclick=()=>{ensureFinale();editCard(state.cards.length-1)};
 $('arcadePalette').onclick=e=>{const b=e.target.closest('[data-arcade],[data-geo]');if(!b)return;
  if(b.dataset.geo==='russia_map'){
   const c=appendCard('round');if(!c)return;c.title='География России · карта 89 субъектов';c.icon='map';
   c.topic_id=state.topics.find(t=>t.name==='География России')?.id||null;
   c.settings={...c.settings,arcade_mode:'russia_map',geo_count:15,geo_seconds:180,
    geo_modes:['locate','identify','capital','flag','silhouette','neighbour','detective','district']};renderCards();
  }else appendCard(b.dataset.card,b.dataset.arcade);
 };
 let lastCardTap=null;
 $('roundCards').onclick=e=>{
  if(e.target.closest('button,a,input,select,textarea'))lastCardTap=null;
  const edit=e.target.closest('[data-edit-card]');if(edit){editCard(Number(edit.dataset.editCard));return}
  const copy=e.target.closest('[data-duplicate-card]');if(copy){duplicateCard(Number(copy.dataset.duplicateCard));return}
  const del=e.target.closest('[data-delete-card]');if(del){const i=Number(del.dataset.deleteCard),c=state.cards[i];if(c&&confirm('Удалить раунд «'+c.title+'» из сборки? Для сохранения изменений нажмите «Сохранить сборку».')){if(state.selectedCard===c)state.selectedCard=null;state.cards.splice(i,1);renderCards();msg('buildMessage','Раунд удалён из конструктора. Сохраните сборку, чтобы применить изменения.')}return}
  const move=e.target.closest('[data-move]');if(move){const [a,d]=move.dataset.move.split(':').map(Number);moveCard(a,a+d);return}
  const element=e.target.closest('.round-card');
  if(element&&!e.target.closest('button,a,input,select,textarea')){
   const index=Number(element.dataset.index),ref=state.cards[index],now=performance.now();
   const secondTap=lastCardTap?.ref===ref&&now-lastCardTap.time<=550;
   if(e.detail>=2||secondTap){lastCardTap=null;selectCard(index);editCard(index)}
   else{lastCardTap={ref,time:now};selectCard(index)}
  }
 };
 $('roundCards').addEventListener('keydown',e=>{
  if(!e.target.matches('.round-card')||(e.key!=='Enter'&&e.key!==' '))return;
  e.preventDefault();
  if(e.shiftKey&&e.key==='Enter')editCard(Number(e.target.dataset.index));
  else selectCard(Number(e.target.dataset.index));
 });
 $('roundCards').addEventListener('dragstart',e=>{if(e.target.closest('button')){e.preventDefault();return}const x=e.target.closest('.round-card');if(!x||x.dataset.type==='finale')return;
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
 // Team setup handlers are owned by workspace-teams.js; no duplicate listeners here.
 $('hostRoomList').onclick=e=>{const d=e.target.closest('[data-delete-room]');if(d){deleteRoom(d.dataset.deleteRoom);return}
  const b=e.target.closest('[data-room]');if(b)selectRoom(b.dataset.room)};
 $('liveStart').onclick=()=>{if(state.room?.phase==='finished'){void repeatFinishedRoom();return;}projection();control('start')};$('liveReveal').onclick=()=>control('reveal');
 $('liveNext').onclick=()=>control('next');$('livePause').onclick=()=>control(state.room?.paused?'resume':'pause');$('liveFinish').onclick=()=>control('finish');
 $('hostProjectorSound').onclick=()=>updateProjectorPreferences({sound_enabled:!projectorPrefs.sound_enabled});
 $('hostProjectorMusic').onclick=()=>updateProjectorPreferences({music_enabled:!projectorPrefs.music_enabled});
 $('hostProjectorVolume').oninput=e=>{$('hostProjectorVolumeLabel').textContent=Number(e.target.value)+'%'};
 $('hostProjectorVolume').onchange=e=>updateProjectorPreferences({volume:Number(e.target.value)});
 $('copyRoomUrl').onclick=copyRoom;$('openScreen').onclick=projection;$('showPublicScreen').onclick=projection;$('showRoomProjection').onclick=projection;
 $('reloadInsights').onclick=loadInsights;$('studentSort').onchange=renderInsights;
 for(const b of all('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
 for(const dialog of all('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
}
function workspaceReady(){document.documentElement.classList.remove('studio-starting');$('workspaceLoading').hidden=true}
async function init(){
 // Read before wiring listeners or awaiting Supabase. The previous code overwrote
 // sessionStorage with the default 'bank' state during initial scroll/layout.
 const savedBeforeBoot=readPosition();
 restoringView=true;
 wire();
 fillSelect($('bankMode'),flagModes.map(([id,title])=>[id,title]),'Все механики');
 const select=$('editKind');
 select.replaceChildren();
 for(const [id,label,ready] of flagModes){
  const option=createOption(id,label+(ready?'':' · в разработке'));
  option.disabled=!ready;select.add(option);
 }
 select.value='country';
 for(let i=1;i<=15;i++)$('launchTeams').add(createOption(String(i),QwizStage.countLabel(i,{one:'команда',few:'команды',many:'команд',other:'команды'})));
 $('launchTeams').value='4';
 if(!window.supabase?.createClient){connection('error','Не удалось подключиться');workspaceReady();return}
 state.db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 try{const {data:{session}}=await state.db.auth.getSession();if(!session)throw Error('Войдите как преподаватель на главной.');
  if(!await rpc('org_quiz_is_admin_check'))throw Error('У вас нет прав преподавателя.');
  connection('ready','Кабинет подключён');
  await overview();await loadRooms();
  if(savedBeforeBoot){await restorePosition(savedBeforeBoot)}
  else{
   const hash=location.hash.slice(1);
   const code=sessionStorage.getItem('qwiz-host-room');
   if(code){section('rooms');await selectRoom(code)}
   else if(['bank','builder','rooms','insights'].includes(hash))section(hash);
   restoringView=false;savePosition();
  }
  state.roomTimer=setInterval(()=>{if(state.roomCode&&!document.hidden)refreshLive()},8000);
  setInterval(()=>{if(!state.room||document.hidden)return;const s=state.room;if(['question','result'].includes(s.phase)&&!s.paused){const left=QwizStage.updateClock(s,state.clockOffset,document,'liveTimer');if(left===0&&Date.now()-state.lastDeadlineRefresh>1500){state.lastDeadlineRefresh=Date.now();refreshLive()}}else if(s.phase==='countdown'&&!s.paused&&Date.parse(s.ends_at)<=Date.now()+state.clockOffset&&Date.now()-state.lastDeadlineRefresh>1500){state.lastDeadlineRefresh=Date.now();refreshLive()}},250);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.roomCode)refreshLive()});
 }catch(e){restoringView=false;connection('error',e.message);$('bankItems').innerHTML='<div class="empty">'+esc(e.message)+' <a href="./">Вернуться ко входу</a></div>'}
 finally{workspaceReady()}
}
window.addEventListener('DOMContentLoaded',init);
