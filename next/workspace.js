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
 // Former flag memorization has moved out of this question category.
 ['geo','География и карты',true],
 ['history','История и символика',true]
];
// Align live teacher preview with arcade labels in existing saved rooms.
const ARCADE_VISIBLE_NAMES={tug:'Тап-баттл',blitz:'Блиц-консенсус',captain:'Мэмори капитанов'};
const hostArcadeActivity=a=>{const mode=a?.settings?.arcade_mode||a?.settings?.queued_settings?.arcade_mode;return mode&&ARCADE_VISIBLE_NAMES[mode]?{...a,title:ARCADE_VISIBLE_NAMES[mode],icon:mode==='blitz'?'arcade_consensus':a.icon}:a};
const titleKind=id=>flagModes.find(x=>x[0]===id)?.[1]||'Флаги мира';
const icons={round:'▦',intro:'◉',break:'♫',team_stats:'▥',player_stats:'♙',bonus:'✦',duel:'⇄',finale:'★'};
const cardSvgPaths={
 round:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
 intro:'<circle cx="12" cy="12" r="8.5"/><path d="m10 8 6 4-6 4z"/>',
 break:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
 team_stats:'<circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2c0-3 2-5 5.5-5s5.5 2 5.5 5v2M17 5a3 3 0 0 1 0 6M17 14c2.5 0 4 2 4 4v2"/>',
 player_stats:'<circle cx="12" cy="7" r="4"/><path d="M4.5 21v-2c0-4.2 3-7 7.5-7s7.5 2.8 7.5 7v2"/>',
 bonus:'<path d="m12 2 2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6L12 2Z"/>',
  arcade_rocket:'<path d="M4 16 2 11l6 3 1-5 3-3h4V3h4v4l2 2v3h-7v4l-3 3H7l-3-3Z"/><path d="M10 19v3m5-4v4M18 10h.01"/><path d="M20 22v-7m-2 4h4m-4-2-2-2m6 2 1-2"/>',
 arcade_blitz:'<circle cx="10.5" cy="13.5" r="7.5"/><path d="M8 2h5m-2.5 4V3m6.5 3.5 1.5-1.5"/><path d="m11.5 9-3 5h3l-1 4 4-6h-3Z"/>',
  arcade_tug:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m9.5 7.5 1-2m4 12 1.5 1.5M12 1v2M12 21v2M1 12h2m18 0h2"/><path d="M11 9v4l2 1"/>',
  arcade_captain:'<rect x="2.8" y="3.5" width="8.5" height="8.5" rx="1.7"/><rect x="12.7" y="3.5" width="8.5" height="8.5" rx="1.7"/><rect x="2.8" y="13" width="8.5" height="8.5" rx="1.7"/><rect x="12.7" y="13" width="8.5" height="8.5" rx="1.7"/><path d="m6 8 1.1 1.4L9 7m7.3 1 1.1 1.4L19.1 7m-9 10h4"/>',
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
const playCardSvg='<svg class="play-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z" fill="currentColor" stroke="none"/></svg>';
const trashSvg='<svg class="trash-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 4h4m-7 3 1 13h8l1-13M10 11v6m4-6v6"/></svg>';
const moveIconLeft='<svg class="move-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg>';
const moveIconRight='<svg class="move-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>';
const legacyArcadeTitles={'Командная тапалка':'Тап-баттл','Дуэль капитанов · Memory':'Мэмори капитанов','Перетягивание очков':'Тап-баттл','Дуэль капитанов':'Мэмори капитанов'};
// Saved legacy duplicates may contain several appended suffixes. Display
// the original title, but do not rename user-defined descriptive titles.
const cleanCardTitle=value=>String(value||'').replace(/(?:\s*[—–-]\s*копия(?:\s*№?\d+)?|\s*\(\s*копия(?:\s*№?\d+)?\s*\))+\s*$/giu,'').trim();
const gameTitle=c=>cleanCardTitle(arcadeGames[c?.settings?.arcade_mode]?.title&&legacyArcadeTitles[c.title]
 ?arcadeGames[c.settings.arcade_mode].title:c.title)||titles[c?.type]||'Карточка';
const titles={round:'Раунд вопросов',intro:'Начало игры',break:'Музыкальная пауза',team_stats:'Рейтинг команд',player_stats:'Статистика игроков',bonus:'Бонусная активность',duel:'Дуэль команд',finale:'Финал игры'};
const buildDefaults={count:5,seconds:30,answer_seconds:10,order:'random',offset:0,team_cap:null,player_cap:null,sound:'fanfare',lead_seconds:5,stats_seconds:7,bonus_percent:70,bonus_lead:15};
const arcadeGames={
 blitz:{title:'Блиц-консенсус',icon:'arcade_blitz',seconds:60,help:'Участники голосуют за ответ, затем капитан видит результаты и принимает итоговое решение. Без решения капитана выбирается мнение большинства. Правильный ответ: настроенные баллы рейтинга (по умолчанию 10) каждой ответившей верно команде.'},
 tug:{title:'Тап-баттл',icon:'arcade_tug',seconds:45,help:'Все участники нажимают большую 3D-кнопку. Сервер складывает число нажатий игроков в командный результат. Победа: настроенные баллы рейтинга (по умолчанию 15).'},
 captain:{title:'Мэмори капитанов',icon:'arcade_captain',seconds:100,help:'Все капитаны одновременно ищут пары среди 12 плиток. Побеждает завершивший за наименьшее время; при равенстве выигрывает меньшее число ходов. Победа: настроенные баллы рейтинга (по умолчанию 15).'}
};
const state={db:null,accountId:null,topics:[],builds:[],questions:[],questionTotal:0,cards:[],buildId:null,editingQuestion:null,editingCard:null,roomCode:null,room:null,roomBusy:false,bankOffset:0,bankPageSize:25,bankRequest:0,channel:null,insights:null,bankTimer:null,roomTimer:null,activePage:'bank',buildsReady:false,dragFrom:null,selectedCard:null,clockOffset:0,liveKey:'',lastDeadlineRefresh:0};
function msg(id,text='',isError=false){const el=$(id);if(!el)return;el.textContent=text;el.classList.toggle('error',!!isError)}
function disable(id,value){const el=$(id);if(el)el.disabled=value}
function fmt(x){return Math.round(Number(x)||0).toLocaleString('ru-RU',{maximumFractionDigits:0})}
async function rpc(method,args={}){const {data,error}=await state.db.rpc(method,args);if(error)throw new Error(error.message||'Ошибка базы данных');return data}
async function studio(action,p_input={}){return rpc('qwiz_studio',{p_action:action,p_input})}
window.QwizBonusRulesApi=Object.freeze({
 list:buildId=>rpc('qwiz_teacher_bonus_rules',{p_action:'list',p_build:buildId}),
 async save(buildId,cardId,settings){
  const result=await rpc('qwiz_teacher_bonus_rules',{p_action:'save',p_build:buildId,p_card:cardId,p_settings:settings});
  // Keep an open builder draft in sync, so a later ordinary build save does not revert this edit.
  if(state.buildId===buildId){
   const updated=(result?.cards||[]).find(c=>String(c.id)===String(cardId));
   if(updated){
    const card=state.cards.find(c=>String(c.id)===String(cardId));
    if(card)card.settings={...card.settings,arcade_score_points:updated.arcade_score_points,bonus_min_points:updated.bonus_min_points,
     bonus_percent:updated.bonus_percent,bonus_lead:updated.bonus_lead,
     ...(updated.bonus_vote_seconds==null?{}:{bonus_vote_seconds:updated.bonus_vote_seconds})};
    if(card&&updated.bonus_vote_seconds==null)delete card.settings.bonus_vote_seconds;
   }
  }
  return result;
 }
});

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
const lastBuildKeyBase='qwiz-studio-last-opened-build-v1:';
function lastBuildKey(){return state.accountId?lastBuildKeyBase+state.accountId:null}
function storedLastBuild(){
 const key=lastBuildKey();if(!key)return null;
 try{return localStorage.getItem(key)||null}catch{return null}
}
function rememberLastBuild(id){
 const key=lastBuildKey();if(!key||!id)return;
 try{localStorage.setItem(key,id)}catch{}
}
function forgetLastBuild(id){
 const key=lastBuildKey();if(!key||!id)return;
 try{if(localStorage.getItem(key)===id)localStorage.removeItem(key)}catch{}
}
function lastAvailableBuild(){
 if(!state.buildsReady||!state.builds.length)return null;
 const candidate=[storedLastBuild(),readPosition()?.buildId,state.buildId];
 return candidate.find(id=>id&&state.builds.some(b=>b.id===id))||state.builds[0].id;
}
let autoLoadingBuild=false;
async function ensureLastBuildOpen(){
 if(autoLoadingBuild||!state.buildsReady||state.activePage!=='builder')return;
 // Never overwrite open drafts or loaded games merely by switching sections.
 if(!$('composer').hidden)return;
 const id=lastAvailableBuild();if(!id)return;
 autoLoadingBuild=true;
 try{await loadBuild(id)}finally{autoLoadingBuild=false}
}
let requestedBuildSerial=0;
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
  return x&&['bank','builder','rooms','insights','bonuses'].includes(x.section)?x:null
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
  if(last.section==='builder'){
   const id=last.buildId&&state.builds.some(b=>b.id===last.buildId)?last.buildId:lastAvailableBuild();
   if(id)await loadBuild(id);
   else section('builder');
  }else section(last.section);
  if(last.section==='rooms'&&last.roomCode&&state.hostRooms?.some(r=>r.code===last.roomCode))await selectRoom(last.roomCode);
  const target=Math.max(0,Number(last.scrollY)||0);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  window.scrollTo({top:target,behavior:'instant'});
  // Restore a second time after layout, fonts and asynchronous cards have settled.
  requestAnimationFrame(()=>window.scrollTo({top:target,behavior:'instant'}));
 }finally{restoringView=false;savePosition()}
}
function section(section){state.activePage=section;for(const id of ['bank','builder','rooms','insights','bonuses'])$(id+'Page').hidden=id!==section;
 for(const n of all('[data-section]')){const selected=n.dataset.section===section;n.classList.toggle('selected',selected);if(selected)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')}
 animatePage($(section+'Page'));
 if(section==='rooms')loadRooms();if(section==='insights')loadInsights();if(section==='bonuses')window.QwizBonusSettings?.loadIfNeeded();if(section==='builder')void ensureLastBuildOpen();
 window.scrollTo({top:0,behavior:'instant'});if(!restoringView)history.replaceState(null,'','#'+section);savePosition()}
function createOption(value,label){const n=document.createElement('option');n.value=value;n.textContent=label;return n}
function fillSelect(select,options,placeholder,selected=''){select.replaceChildren();if(placeholder!==null)select.add(createOption('',placeholder));for(const [value,title]of options)select.add(createOption(value,title));select.value=selected}
function nameTopic(id){return state.topics.find(t=>t.id===id)?.name||'Все темы'}
async function overview(){
 const d=await studio('overview');state.topics=d.topics||[];state.builds=d.builds||[];state.buildsReady=true;window.QwizTeamLab?.refreshBuilds();window.QwizBonusSettings?.refreshBuilds(state.builds);
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
function topicIdByName(name){return state.topics.find(t=>t.name===name)?.id||null}
function cardMechanicTopic(card){
 if(card.type!=='round')return null;
 const settings=card.settings||{};
 if(settings.arcade_mode==='russia_map')return topicIdByName('География России');
 if(settings.arcade_mode)return null;
 const flags=Array.isArray(settings.flag_modes)&&settings.flag_modes.length>0;
 const geography=Array.isArray(settings.geo_modes)&&settings.geo_modes.length>0;
 if(flags===geography)return null; // No modes or incompatible legacy modes: do not guess.
 return topicIdByName(flags?'Флаги мира':'География России');
}
function synchronizeCardTopic(card,{defaultFlag=false}={}){
 if(card.type!=='round')return false;
 const mapMode=card.settings?.arcade_mode==='russia_map';
 const suggested=cardMechanicTopic(card);
 const next=mapMode?suggested:(!card.topic_id?(suggested||(defaultFlag?topicIdByName('Флаги мира'):null)):null);
 if(!next||next===card.topic_id)return false;
 card.topic_id=next;return true;
}
function card(type){
 const created={type,title:titles[type]||'Раунд',icon:icons[type]||'◫',topic_id:null,
  settings:{...buildDefaults,flag_modes:[],geo_modes:[]}};
 if(type==='round')synchronizeCardTopic(created,{defaultFlag:true});
 return created;
}
function ensureFinale(){state.cards=state.cards.filter((c,i)=>c.type!=='finale'||i===state.cards.length-1);
 if(!state.cards.some(c=>c.type==='finale'))state.cards.push(card('finale'))}
function newBuild(){requestedBuildSerial++;state.buildId=null;state.selectedCard=null;state.cards=[card('intro'),card('round'),card('finale')];$('buildTitle').value='';$('composer').hidden=false;renderCards();$('buildTitle').focus()}
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
  const title=gameTitle(state.cards[Number(element.dataset.index)])||'Карточка';
  element.setAttribute('aria-label',title+(active?
   '. Выбрана как позиция вставки. Дважды нажмите для настройки.':
   '. Выбрать позицию вставки; двойное нажатие — настройки.'));
 }
 const hint=$('insertAfterHint');
 if(hint)hint.textContent=selected<0?'Новые карточки добавляются перед финалом':
  selected===state.cards.length-1?'Следующая карточка — перед финалом':
  'Следующая карточка — после «'+gameTitle(state.cards[selected])+'»';
}
function selectCard(index){state.selectedCard=state.cards[index]||null;updateCardSelection()}
function appendCard(type='round',arcadeMode=null){
 if(arcadeMode==='rocket')return null;
 if(state.cards.length>=60){msg('buildMessage','Не больше 60 карточек.',true);return null}
 const added=card(type);
 if(arcadeMode&&arcadeGames[arcadeMode]){const meta=arcadeGames[arcadeMode];added.title=meta.title;added.icon=meta.icon;added.settings.arcade_mode=arcadeMode;added.settings.arcade_seconds=meta.seconds;}
 state.cards.splice(cardInsertIndex(),0,added);
 state.selectedCard=added;
 renderCards();
 return added;
}
function cardDesc(c){const settings=c.settings||{};
 if(settings.arcade_mode==='russia_map')return 'География России · карта · '+(settings.geo_count||15)+' случайных субъектов каждому игроку · '+((settings.geo_count||15)*((settings.seconds||30)+(settings.answer_seconds||10)))+' сек. · '+(settings.seconds||30)+' сек. на вопрос · '+(settings.answer_seconds||10)+' сек. на ответ';
  if(arcadeGames[settings.arcade_mode])return 'Командная мини-игра · '+Math.max(30,Math.min(120,Number(settings.arcade_seconds)||arcadeGames[settings.arcade_mode].seconds))+' секунд · командное голосование за усиления';
 if(c.type==='round'){const geography=state.topics.some(t=>t.id===c.topic_id&&t.name==='География России');const selected=geography?(settings.geo_modes||[]).map(m=>({capital:'Административный центр',district:'Федеральный округ'}[m]||m)):(settings.flag_modes||[]).map(titleKind);return (c.topic_id?nameTopic(c.topic_id):'Тема не выбрана')+' · '+(selected.length?selected.join(', '):'Выберите механики перед запуском')+' · '+(settings.count||5)+' вопр. · '+(settings.seconds||30)+' сек. · ответ '+(settings.answer_seconds||10)+' сек.';}
 if(c.type==='intro')return 'Анимированная заставка перед первым раундом';
 if(c.type==='break')return 'Музыкальная пауза между раундами';
 if(['team_stats','player_stats'].includes(c.type))return 'Устаревшая карточка статистики · удалите её из сборки';
 if(['bonus','duel'].includes(c.type))return 'Механика не выбрана · настройте карточку перед запуском';
 if(c.type==='finale')return 'Итог всей игры: результаты команд и каждого игрока · автоматически';
 return 'Дополнительная активность · настройки в карточке'}
function renderCards(){state.cards=state.cards.filter(c=>c.settings?.arcade_mode!=='rocket');ensureFinale();if(!state.cards.includes(state.selectedCard))state.selectedCard=null;$('roundCards').innerHTML=state.cards.map((c,i)=>{
 const final=c.type==='finale',emblem=final?'<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M15 7h18v13c0 13-18 13-18 0V7ZM15 11H7v6c0 7 8 10 12 8M33 11h8v6c0 7-8 10-12 8M24 30v10M16 41h16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>':cardIconSvg(c.type,arcadeGames[c.settings?.arcade_mode]?.icon||(c.settings?.arcade_mode==='russia_map'?'map':c.icon));
 return '<article class="round-card'+(c===state.selectedCard?' is-selected':'')+'" data-index="'+i+'" data-type="'+esc(c.type)+'" data-mechanic="'+esc(c.settings?.arcade_mode||'')+'" tabindex="0" role="group" aria-current="'+(c===state.selectedCard?'true':'false')+'" aria-label="'+esc(gameTitle(c))+'. Выбрать позицию вставки; двойное нажатие — настройки" draggable="'+!final+'"><div class="round-card-heading"><span class="round-icon" aria-hidden="true">'+emblem+'</span><span class="small-help">'+(final?'ФИНАЛ ИГРЫ':'КАРТОЧКА '+(i+1).toString().padStart(2,'0'))+'</span></div><h3>'+esc(gameTitle(c))+'</h3><p class="round-sub">'+esc(cardDesc(c))+'</p>'+
 (final?'<div class="finale-card-tags"><span>Команды</span><span>Участники</span><span>3 + 3 вопроса</span></div>':'')+'<div class="round-actions">'+(!final?'<button type="button" data-move="'+i+':-1" aria-label="Раньше" '+(i===0?'disabled':'')+'>'+moveIconLeft+'</button><button type="button" data-move="'+i+':1" aria-label="Позже" '+(i>=state.cards.length-2?'disabled':'')+'>'+moveIconRight+'</button>':'')+'<button type="button" class="round-edit" data-edit-card="'+i+'">'+(final?'Настроить финал':'Настроить')+'</button></div>'+'<div class="round-card-tools"><button type="button" class="card-play round-play" data-play-card="'+i+'" title="Проверить карточку в тестовом режиме" aria-label="Проверить карточку '+esc(gameTitle(c))+' в тестовом режиме">'+playCardSvg+'</button>'+(final?'':'<button type="button" class="card-copy round-copy" data-duplicate-card="'+i+'" title="Дублировать карточку" aria-label="Дублировать карточку '+esc(c.title)+'">'+copySvg+'</button><button type="button" class="card-trash round-trash" data-delete-card="'+i+'" title="Удалить карточку" aria-label="Удалить карточку '+esc(c.title)+'">'+trashSvg+'</button>')+'</div>'+'</article>';
 }).join('');updateCardSelection();}

// This preview never creates a room or modifies a score. Question reads happen once per open.
async function loadSandboxQuestions(card){
 const settings=card.settings||{},topic=state.topics.find(t=>t.id===card.topic_id)?.name||'';
 if(!card.topic_id)throw Error('Сначала выберите тему в настройках карточки.');
 const requested=Math.min(100,Math.max(1,Number(settings.count)||5));
 const modes=topic==='Флаги мира'?(settings.flag_modes||[]):topic==='География России'?(settings.geo_modes||[]):[];
 const selected=[...new Set(modes.filter(Boolean))];
 const order=settings.order==='reverse'?'newest':'oldest';
 const load=async mode=>{
  const params={search:'',sort:order,offset:Math.max(0,Number(settings.offset)||0),
   limit:Math.min(100,Math.max(5,Math.ceil(requested/Math.max(1,selected.length))+3))};
  const response=topic==='География России'
   ?await rpc('qwiz_geo_questions',{p_search:'',p_mode:mode,p_sort:order,p_offset:params.offset,p_limit:params.limit})
   :await studio('questions',{...params,topic_id:card.topic_id,kind:topic==='Флаги мира'?'flag':'',mode});
  return (response?.items||[]).filter(q=>topic!=='Флаги мира'||q.tags?.includes('fw:published'));
 };
 // Read at most three selected mechanics concurrently; never poll as the host navigates.
 const chunks=selected.length?[]:[await load('')];
 if(selected.length)for(let i=0;i<selected.length;i+=3){
  const batch=await Promise.all(selected.slice(i,i+3).map(mode=>load(mode)));
  chunks.push(...batch);
 }
 const seen=new Set(),mixed=[],length=Math.max(0,...chunks.map(c=>c.length));
 for(let i=0;i<length;i++)for(const group of chunks){
  const q=group[i];if(q&&q.id&&!seen.has(q.id)){seen.add(q.id);mixed.push(q)}
 }
 if(settings.order==='random')for(let i=mixed.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[mixed[i],mixed[j]]=[mixed[j],mixed[i]]}
 return mixed.slice(0,requested);
}
function playCardPreview(index){
 const c=state.cards[index];if(!c)return;
 const topic=state.topics.find(t=>t.id===c.topic_id)?.name||'';
 window.QwizCardSandbox?.open({card:{...c,title:gameTitle(c)},topic,
  loadQuestions:loadSandboxQuestions,loadMap:()=>window.QwizGeo.loadMap(),
  loadCatalog:()=>rpc('qwiz_geo_catalog')});
}
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
 clone.title=gameTitle(original); // Duplicate without appending 'копия' or a counter.
 state.cards.splice(index+1,0,clone);
 renderCards();
 msg('buildMessage','Создана копия карточки «'+original.title+'» сразу после оригинала. Сохраните сборку, чтобы применить изменения.');
 const newCard=$('roundCards').querySelector('.round-card[data-index="'+(index+1)+'"]');
 newCard?.scrollIntoView({block:'nearest',behavior:motionPreference.matches?'auto':'smooth'});
 newCard?.focus({preventScroll:true});
}
function moveCard(i,j){if(j<0||j>=state.cards.length-1||i<0||i>=state.cards.length-1)return;
 const [item]=state.cards.splice(i,1);state.cards.splice(j,0,item);renderCards()}
function syncCardModePanels(){
 const card=state.cards[state.editingCard];if(!card)return;
 const mapMode=card.settings?.arcade_mode==='russia_map';
 const select=$('cardTopic');
 // Keep the explicit topic when the option list is reloaded. Otherwise the
 // chosen mechanics panel disappears and valid card edits silently fail.
 if(card.type==='round'&&!select.value&&card.topic_id&&state.topics.some(topic=>topic.id===card.topic_id)){
  select.value=card.topic_id;
 }
 if(mapMode){
  const geoId=topicIdByName('География России');
  if(geoId)select.value=geoId;
 }
 if(card.type==='round'&&!select.value&&!mapMode){
  const flags=all('#cardFlagModes [data-card-mode]:checked').length>0;
  const geography=all('#cardGeoQuestionModes [data-geo-question-mode]:checked').length>0;
  const inferred=flags===geography?null:topicIdByName(flags?'Флаги мира':'География России');
  if(inferred)select.value=inferred;
 }
 const topic=state.topics.find(t=>t.id===select.value);
 const geoQuestion=card.type==='round'&&!mapMode&&topic?.name==='География России';
 const flagQuestion=card.type==='round'&&!mapMode&&topic?.name==='Флаги мира';
 const genericQuestion=card.type==='round'&&!mapMode&&!!topic&&!geoQuestion&&!flagQuestion;
 $('cardFlagModes').hidden=!flagQuestion;
 $('cardGeoQuestionModes').hidden=!geoQuestion;
 $('cardGeoSettings').hidden=!mapMode;
 $('cardOtherTopicNote').hidden=!genericQuestion;
 $('cardModesDetails').querySelector('.card-modes-title').textContent=mapMode?'Механики карты России':geoQuestion?'Механики географии':flagQuestion?'Механики внутри темы':'Механики внутри темы';
 $('cardModesInfo').textContent=mapMode?'Карта России · режимы игрока':geoQuestion?'Вопросы о регионах':flagQuestion?'Флаги мира · выберите нужные':genericQuestion?'Вопросы выбранной темы':'Выберите тему';
 select.disabled=mapMode;
 select.required=card.type==='round'&&!mapMode;
}
function editCard(i){state.editingCard=i;const c=state.cards[i],s=c.settings||{};
 $('cardTitle').value=gameTitle(c);$('cardTopic').value=c.topic_id||cardMechanicTopic(c)||'';$('cardIcon').value=c.icon||'▦';
 $('cardCount').value=s.count||5;$('cardSeconds').value=s.seconds||30;$('cardAnswerSeconds').value=s.answer_seconds||10;
 $('cardRoundSettings').hidden=c.type!=='round';$('cardFinalePreview').hidden=c.type!=='finale';
 const arcade=arcadeGames[s.arcade_mode];$('cardArcadeSettings').hidden=!arcade;
  const geo=s.arcade_mode==='russia_map';$('cardModesDetails').open=c.type==='round';
  if(geo)$('cardModesInfo').textContent='8 способов ответа · выберите нужные';
  if(geo){$('cardTopic').value=topicIdByName('География России')||'';
   $('cardGeoCount').value=s.geo_count||15;$('cardGeoSeconds').value=s.seconds||30;
   for(const item of all('#cardGeoModes input:not(:disabled)'))item.checked=Array.isArray(s.geo_modes)&&s.geo_modes.includes(item.value);}
 $('cardArcadeSeconds').value=Math.max(30,Math.min(120,Number(s.arcade_seconds)||arcade?.seconds||45));
 $('cardArcadeHelp').textContent=arcade?.help||'';
 $('cardOrder').value=s.order||'random';$('cardOffset').value=(s.offset||0)+1;
 $('cardTeamCap').value=s.team_cap||'';$('cardPlayerCap').value=s.player_cap||'';
 $('cardSound').value=s.sound||'fanfare';
 const selected=Array.isArray(s.flag_modes)?s.flag_modes:[];
 for(const el of all('#cardGeoQuestionModes [data-geo-question-mode]'))el.checked=Array.isArray(s.geo_modes)&&s.geo_modes.includes(el.value);
 $('cardFlagModes').innerHTML=flagModes.map(([id,name,ready])=>'<label class="check-row flag-mode-item '+(!ready?'unavailable':'')+'"><input type="checkbox" data-card-mode="'+esc(id)+'" '+(selected.includes(id)&&ready?'checked ':'')+(ready?'':'disabled ')+'><span>'+esc(name)+(ready?'':' · скоро')+'</span></label>').join('');
 syncCardModePanels();
 $('cardModesDetails').open=c.type==='round';
 $('cardDialog').showModal()}
$('cardTopic').addEventListener('change',()=>{
 $('cardTopic').setCustomValidity('');
 syncCardModePanels();
});
$('cardFlagModes').addEventListener('change',event=>{
 if(event.target.matches('[data-card-mode]')&&event.target.checked&&!$('cardTopic').value){
  $('cardTopic').value=topicIdByName('Флаги мира')||'';
 }
 syncCardModePanels();
});
$('cardGeoQuestionModes').addEventListener('change',event=>{
 if(event.target.matches('[data-geo-question-mode]')&&event.target.checked&&!$('cardTopic').value){
  $('cardTopic').value=topicIdByName('География России')||'';
 }
 syncCardModePanels();
});
function saveCard(event){
 event.preventDefault();
 const c=state.cards[state.editingCard],s=c.settings||{};
 const mapMode=s.arcade_mode==='russia_map';
 const selected=all('[data-card-mode]:checked',$('cardFlagModes')).map(x=>x.dataset.cardMode);
 const geoSelected=all('#cardGeoQuestionModes [data-geo-question-mode]:checked').map(x=>x.value);
 const mapModes=all('#cardGeoModes input:checked:not(:disabled)').map(x=>x.value);
 const topicId=mapMode?topicIdByName('География России'):$('cardTopic').value;
 const topic=state.topics.find(t=>t.id===topicId);
 const ordinaryGeo=c.type==='round'&&!mapMode&&topic?.name==='География России';
 const flagQuestion=c.type==='round'&&!mapMode&&topic?.name==='Флаги мира';
 if(c.type==='round'&&!topic){
  $('cardTopic').disabled=false;
  $('cardTopic').setCustomValidity('Выберите тему, соответствующую механикам');
  $('cardTopic').reportValidity();
  return;
 }
 if(mapMode&&!mapModes.length){
  $('cardModesDetails').open=true;
  msg('buildMessage','Выберите хотя бы одну механику карты России.',true);
  return;
 }
 if(ordinaryGeo&&!geoSelected.length){
  const first=$('cardGeoQuestionModes').querySelector('input:not(:disabled)');
  first?.setCustomValidity('Выберите административный центр и/или федеральный округ');
  first?.reportValidity();
  first?.addEventListener('change',()=>first.setCustomValidity(''),{once:true});
  return;
 }
 if(flagQuestion&&!selected.length){
  const first=$('cardFlagModes').querySelector('[data-card-mode]:not(:disabled)');
  first?.setCustomValidity('Выберите хотя бы одну доступную механику');
  first?.reportValidity();
  first?.addEventListener('change',()=>first.setCustomValidity(''),{once:true});
  return;
 }
 // Only currently relevant selections reach the server. Hidden, leftover
 // checkboxes must never activate a mechanic from another topic.
 const nextSettings={...s,count:Number($('cardCount').value),seconds:Number($('cardSeconds').value),
  answer_seconds:Number($('cardAnswerSeconds').value),order:$('cardOrder').value,
  offset:Math.max(0,Number($('cardOffset').value)-1),
  team_cap:$('cardTeamCap').value?Number($('cardTeamCap').value):null,
  player_cap:$('cardPlayerCap').value?Number($('cardPlayerCap').value):null,
  sound:$('cardSound').value,lead_seconds:s.lead_seconds??buildDefaults.lead_seconds,
  stats_seconds:s.stats_seconds??buildDefaults.stats_seconds,
  bonus_percent:s.bonus_percent??buildDefaults.bonus_percent,
  bonus_lead:s.bonus_lead??buildDefaults.bonus_lead,
  flag_modes:flagQuestion?selected:[],
  geo_modes:mapMode?mapModes:(ordinaryGeo?geoSelected:[])};
 if(arcadeGames[s.arcade_mode])
  nextSettings.arcade_seconds=Math.max(30,Math.min(120,Number($('cardArcadeSeconds').value)||arcadeGames[s.arcade_mode].seconds));
 if(mapMode){
  nextSettings.geo_count=Math.max(1,Math.min(89,Number($('cardGeoCount').value)||15));
  nextSettings.seconds=Math.max(1,Math.min(120,Number($('cardSeconds').value)||30));
  nextSettings.answer_seconds=Math.max(1,Math.min(30,Number($('cardAnswerSeconds').value)||10));
  nextSettings.geo_seconds=nextSettings.geo_count*(nextSettings.seconds+nextSettings.answer_seconds);
 }
 c.title=cleanCardTitle($('cardTitle').value.trim())||titles[c.type]||'Карточка';
 c.topic_id=c.type==='round'?topicId:(c.topic_id||null);
 c.icon=$('cardIcon').value||icons[c.type]||'▦';
 c.settings=nextSettings;
 $('cardTopic').setCustomValidity('');
 $('cardDialog').close();renderCards();
}
function generalSettings(){
 const first=state.cards.find(c=>c.type==='round')?.settings||buildDefaults;
 $('generalLeadSeconds').value=first.lead_seconds??5;$('generalStatsSeconds').value=first.stats_seconds??7;
 $('generalSeconds').value=first.seconds||30;$('generalAnswerSeconds').value=first.answer_seconds||10;$('generalCount').value=first.count||5;$('generalSound').value=first.sound||'fanfare';
 $('generalApplyCount').checked=false;$('generalApplySound').checked=false;$('generalCount').disabled=true;$('generalSound').disabled=true;
 $('generalRoundCount').textContent=state.cards.filter(c=>c.type==='round').length;$('generalDialog').showModal();
}
function saveGeneralSettings(event){
 event.preventDefault();const timing={seconds:Number($('generalSeconds').value),answer_seconds:Number($('generalAnswerSeconds').value),
 lead_seconds:Number($('generalLeadSeconds').value),stats_seconds:Number($('generalStatsSeconds').value)};
 if(timing.seconds<10||timing.seconds>120||timing.answer_seconds<5||timing.answer_seconds>30||
 timing.lead_seconds<1||timing.lead_seconds>5||timing.stats_seconds<5||timing.stats_seconds>10)return;
 if($('generalApplyCount').checked)timing.count=Number($('generalCount').value);
 if($('generalApplySound').checked)timing.sound=$('generalSound').value;
 Object.assign(buildDefaults,timing);
 for(const c of state.cards){
  if(c.type==='round')c.settings={...buildDefaults,...c.settings,...timing};
  else if(['blitz','tug','captain'].includes(c.settings?.arcade_mode))
   c.settings={...c.settings,stats_seconds:timing.stats_seconds,lead_seconds:timing.lead_seconds};
 }
 $('generalDialog').close();renderCards();msg('buildMessage','Общие настройки применены. Сохраните сборку, чтобы использовать их в игре.');QwizStage.audio.play('accept');
}
function openGeneralBonusRules(){
 // One source of truth: eligibility lives on each saved mini-game card, not in round timing.
 $('generalDialog').close();
 section('bonuses');
 window.QwizBonusSettings?.focusBuild?.(state.buildId);
}
function renderBuilds(){$('savedBuilds').innerHTML=state.builds.length?state.builds.map(b=>
 '<div class="saved-build-wrap"><button type="button" class="saved-build" data-load-build="'+esc(b.id)+'"><span>Сохранённая сборка</span><strong>'+esc(QwizStage.capitalize(b.title))+'</strong><span>Редактировать →</span></button><button type="button" class="card-trash" data-delete-build="'+esc(b.id)+'" title="Удалить сборку" aria-label="Удалить сборку '+esc(b.title)+'">'+trashSvg+'</button></div>').join(''):'<div class="empty">Сборок пока нет. Создайте первую.</div>'}
async function deleteBuild(id){
 const build=state.builds.find(b=>b.id===id);if(!build)return;
 if(!confirm('Удалить сборку «'+build.title+'»? Сыгранные комнаты и результаты сохранятся.'))return;
 try{
  await studio('build_delete',{id});
  forgetLastBuild(id);
  if(state.buildId===id){requestedBuildSerial++;state.buildId=null;state.cards=[];state.selectedCard=null;$('composer').hidden=true;savePosition()}
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
let clearingFinishedArchive=false;
async function clearFinishedArchive(){
 if(clearingFinishedArchive)return;
 clearingFinishedArchive=true;
 const trigger=$('clearFinishedArchive');
 if(trigger){trigger.disabled=true;trigger.setAttribute('aria-busy','true')}
 try{
  // Preview from the server also includes completed rooms previously hidden
  // via qwiz_remove_room. Never rely only on the visible (limit 30) room list.
  const preview=await rpc('qwiz_clear_finished_rooms',{p_confirm:false});
  const count=Number(preview?.count)||0;
  if(count===0){
   await loadRooms();
   msg('launchMessage','Архив уже пуст.');
   return;
  }
  const noun=QwizStage.countLabel(count,{one:'завершённую игру',few:'завершённые игры',many:'завершённых игр',other:'завершённых игр'});
  const confirmed=window.confirm(
   'Очистить архив?\n\nБудут безвозвратно удалены '+noun+', включая скрытые ранее сессии, их ответы и результаты.\n\nДействующие игры, сборки и данные профиля останутся.\n\nОтменить удаление после подтверждения невозможно.'
  );
  if(!confirmed)return;
  const result=await rpc('qwiz_clear_finished_rooms',{p_confirm:true});
  const deleted=Number(result?.count)||0;
  if(state.room?.phase==='finished'){
   state.room=null;state.roomCode=null;
   sessionStorage.removeItem('qwiz-host-room');
   $('liveConsole').hidden=true;
   if(state.channel)state.db.removeChannel(state.channel);
   state.channel=null;
   savePosition();
  }
  await loadRooms();
  msg('launchMessage','Архив очищен: '+QwizStage.countLabel(deleted,{one:'игра удалена',few:'игры удалены',many:'игр удалено',other:'игр удалено'})+'.');
 }catch(error){
  msg('launchMessage',error.message||'Не удалось очистить архив.',true);
 }finally{
  clearingFinishedArchive=false;
  const button=$('clearFinishedArchive');
  if(button){button.disabled=button.dataset.archiveEmpty==='true';button.removeAttribute('aria-busy')}
 }
}
async function loadBuild(id){
 if(!id)return false;
 const serial=++requestedBuildSerial;
 try{
  const r=await studio('build_get',{id});
  // Slow responses may not replace a more recently opened game or new draft.
  if(serial!==requestedBuildSerial)return false;
  if(!r?.build?.id||!Array.isArray(r.cards))throw Error('Сервер не вернул содержание сохранённой игры.');
  state.buildId=r.build.id;
  $('buildTitle').value=r.build.title;
  state.selectedCard=null;
  state.cards=r.cards.filter(c=>!['team_stats','player_stats'].includes(c.type)&&c.settings?.arcade_mode!=='rocket')
   .map(c=>({...c,title:gameTitle(c)}));
  const inferred=state.cards.filter(c=>synchronizeCardTopic(c)).length;
  ensureFinale();
  $('composer').hidden=false;
  rememberLastBuild(state.buildId);
  renderCards();renderBuilds();section('builder');savePosition();
  if(inferred)msg('buildMessage','Темы '+inferred+' карточек восстановлены по выбранным механикам. Сохраните сборку, чтобы применить изменения.');
  return true;
 }catch(e){if(serial===requestedBuildSerial)msg('buildMessage',e.message,true);return false}
}
function validBuildActivity(card){
 if(card?.type==='round'&&card?.settings?.arcade_mode!=='russia_map')return true;
 if((card?.type==='round'||card?.type==='bonus'||card?.type==='duel')&&
  ['blitz','captain','tug','russia_map'].includes(card?.settings?.arcade_mode))return true;
 return false;
}
function buildSaveNotice(text='',isError=false){
 msg('buildMessage',text,isError);
 const el=$('buildSaveNotice');
 if(!el)return;
 el.textContent=text;el.hidden=!text;
 el.classList.toggle('error',!!isError);
 el.setAttribute('role',isError?'alert':'status');
}
async function saveBuild(){
 if($('saveBuild')?.disabled)return;
 disable('saveBuild',true);
 buildSaveNotice('Сохранение сборки…');
 try{
  ensureFinale();
  if(!state.cards.some(validBuildActivity)){
   throw Error('Добавьте хотя бы одну настроенную игру или раунд вопросов.');
  }
  for(const c of state.cards){
   // New cards must have an explicit rating reward in the room timeline.
   // This keeps old room snapshots unchanged, while newly compiled rooms use
   // the teacher's settings (including an intentional zero).
   if(['tug','blitz','captain'].includes(c.settings?.arcade_mode)&&c.settings.arcade_score_points==null)
    c.settings.arcade_score_points=c.settings.arcade_mode==='blitz'?10:15;
   if(c.type!=='round')continue;
   synchronizeCardTopic(c);
   const modes=c.settings||{},flags=Array.isArray(modes.flag_modes)&&modes.flag_modes.length>0;
   const geo=Array.isArray(modes.geo_modes)&&modes.geo_modes.length>0;
   const topic=state.topics.find(t=>t.id===c.topic_id);
   if((flags||geo)&&!topic)throw Error('В карточке «'+c.title+'» выбраны механики без темы. Откройте настройки.');
   if(modes.arcade_mode==='russia_map'&&topic?.name!=='География России')throw Error('Для карты России требуется тема «География России».');
   if(!modes.arcade_mode&&((flags&&topic?.name!=='Флаги мира')||(geo&&topic?.name!=='География России')))
    throw Error('Механики карточки «'+c.title+'» не соответствуют теме. Откройте настройки карточки.');
  }
  const title=$('buildTitle').value.trim();
  if(title.length<2)throw Error('Укажите название сборки (не менее 2 символов).');
  const result=await studio('build_save',{id:state.buildId||undefined,title,cards:state.cards});
  if(!result?.id)throw Error('Сервер не подтвердил сохранение. Повторите попытку.');
  state.buildId=result.id;
  rememberLastBuild(result.id);
  // build_save replaces card rows. Refresh their IDs before any later bonus-rule edit
  // or another save, otherwise a stale draft could undo the editor's saved thresholds.
  try{
   const latest=await studio('build_get',{id:result.id});
   if(Array.isArray(latest?.cards)&&latest.cards.length===state.cards.length){
    state.cards=latest.cards.map(c=>({...c,title:gameTitle(c)}));
    renderCards();
   }
  }catch(error){console.warn('Saved build card IDs could not be refreshed:',error)}
  savePosition();
  buildSaveNotice('Сборка сохранена. Игры можно запускать без обычных раундов вопросов.');
  try{await overview();}
  catch(e){console.warn('Build saved; refreshing overview failed:',e);
   buildSaveNotice('Сборка сохранена, но список сборок не обновился. Обновите страницу.');}
 }catch(e){
  buildSaveNotice(e?.message||'Не удалось сохранить сборку.',true);
 }finally{disable('saveBuild',false)}
}
function roomRowMarkup(room){
 return '<article class="room-row"><div><div class="question-meta"><span class="chip">'+esc(QwizStage.phaseLabel(room.phase))+'</span><span class="chip lilac">'+esc(room.code)+'</span></div><h3>'+esc(QwizStage.capitalize(room.title))+'</h3><p>'+esc(QwizStage.countLabel(room.players,{one:'участник',few:'участника',many:'участников',other:'участника'}))+' · '+esc(QwizStage.countLabel(room.teams,{one:'команда',few:'команды',many:'команд',other:'команды'}))+'</p></div><div class="room-row-actions"><button class="primary-button" data-room="'+esc(room.code)+'">'+(room.phase==='finished'?'Результаты →':'Управлять →')+'</button><button type="button" class="card-trash" data-delete-room="'+esc(room.id)+'" title="Удалить комнату" aria-label="Удалить комнату '+esc(room.title)+'">'+trashSvg+'</button></div></article>';
}
function roomsListMarkup(rooms,archiveCount=null){
 const current=rooms.filter(room=>room.phase!=='finished');
 const history=rooms.filter(room=>room.phase==='finished');
 const countKnown=Number.isInteger(archiveCount)&&archiveCount>=0;
 const total=countKnown?archiveCount:history.length;
 const archiveEmpty=countKnown&&total===0;
 const archiveBusy=clearingFinishedArchive;
 const summary=history.length?history.map(roomRowMarkup).join(''):
  '<p class="empty rooms-history-empty">'+(total>0
   ?'Ранее скрытые завершённые игры по-прежнему находятся в архиве. Очистка удалит и их.'
   :'Завершённых игр в списке нет.')+'</p>';
 const remainder=countKnown&&total>history.length?
  '<p class="rooms-history-note">Показано '+history.length+' из '+total+'. Очистка удалит все завершённые игры, включая скрытые.</p>':'';
 return '<div class="active-rooms" aria-label="Текущие комнаты">'+
  (current.length?current.map(roomRowMarkup).join(''):'<p class="empty rooms-empty-active">Активных комнат пока нет. Выберите сборку и создайте новую игру.</p>')+
  '</div><div class="rooms-history-group"><details class="rooms-history"><summary>История завершённых игр <span class="rooms-history-count">'+
  total+'</span></summary><div class="rooms-history-list">'+summary+remainder+
  '</div></details><button type="button" class="clear-archive-button" id="clearFinishedArchive" title="Безвозвратно удалить все завершённые игры" aria-label="Очистить архив завершённых игр" data-archive-empty="'+archiveEmpty+'" '+
  (archiveEmpty||archiveBusy?'disabled ':'')+(archiveBusy?'aria-busy="true" ':'')+'>'+
  trashSvg+'<span>Очистить архив</span></button></div>';
}
let roomsLoadRevision=0;
async function loadRooms(){
 const revision=++roomsLoadRevision;
 try{
  // The host list is capped; the archive count must come from the server.
  // A failed count request must not hide the button or break room management.
  const [roomResult,countResult]=await Promise.allSettled([
   rpc('qwiz_host_rooms'),
   rpc('qwiz_clear_finished_rooms',{p_confirm:false})
  ]);
  if(revision!==roomsLoadRevision)return;
  if(roomResult.status==='rejected')throw roomResult.reason;
  const list=Array.isArray(roomResult.value)?roomResult.value:[];
  const raw=countResult.status==='fulfilled'?countResult.value?.count:null;
  const archiveCount=raw!==null&&Number.isInteger(Number(raw))?Math.max(0,Number(raw)):null;
  state.hostRooms=list;
  $('hostRoomList').innerHTML=roomsListMarkup(list,archiveCount);
 }catch(e){if(revision===roomsLoadRevision)msg('launchMessage',e.message,true)}
}
// Preview the *entire* saved build, not just the currently edited card.
// In particular, map modes and normal Geography of Russia question modes
// are independent cards, so show them distinctly before creating a room.
const launchModeNames={
 country:'Страна по флагу',picker:'Выбор флага',colors:'Цвета',symbols:'Символы',
 fragments:'Фрагменты',errors:'Поиск ошибок',similar:'Похожие флаги',
 assemble:'Сборка флага',multiple:'Несколько ответов',
 geo:'География флага',history:'История флага',
 capital:'Административный центр',district:'Федеральный округ',
 locate:'Найти субъект',identify:'Угадать название',flag:'Узнать по флагу',
 silhouette:'Угадать по силуэту',neighbour:'Соседние субъекты',
 detective:'Географический детектив'
};
function describeLaunchCard(c){
 const settings=c.settings||{},mode=settings.arcade_mode||'';
 const title=gameTitle(c);
 if(c.type==='finale')return {title,description:'Финал всей игры и общая статистика'};
 if(['team_stats','player_stats'].includes(c.type))return {title,description:'Устаревшая карточка рейтинга. Откройте редактор и сохраните сборку, чтобы исключить её.',invalid:true};
 if(mode==='russia_map'){
  const selected=Array.isArray(settings.geo_modes)?settings.geo_modes:[];
  return {title,description:'Карта России · '+(selected.length?selected.map(x=>launchModeNames[x]||x).join(', '):'механики не выбраны'),invalid:!selected.length};
 }
 if(arcadeGames[mode])return {title,description:'Командная мини-игра · '+arcadeGames[mode].title};
 if(['bonus','duel'].includes(c.type))return {title,description:'Механика мини-игры не выбрана — настройте или удалите карточку',invalid:true};
 if(c.type==='round'){
  const topic=state.topics.find(x=>x.id===c.topic_id)?.name||'Тема не выбрана';
  const selected=topic==='География России'?(settings.geo_modes||[]):(settings.flag_modes||[]);
  const needsModes=topic==='География России'||topic==='Флаги мира';
  const invalid=!c.topic_id||(needsModes&&(!Array.isArray(selected)||!selected.length));
  const modeText=needsModes?
    (Array.isArray(selected)&&selected.length?selected.map(x=>launchModeNames[x]||x).join(', '):'механики не выбраны'):
    'Вопросы выбранной темы';
  return {title,description:'Раунд вопросов · '+topic+' · '+modeText+' · до '+QwizStage.countLabel(settings.count||5,{one:'вопрос',few:'вопроса',many:'вопросов'}),invalid};
 }
 return {title,description:({'intro':'Вступительная заставка','break':'Пауза',
  'duel':'Дополнительная игра','bonus':'Бонусная карточка'}[c.type]||'Дополнительная карточка')};
}
let launchPlanRequest=0;
async function previewLaunchBuild(){
 const id=$('launchBuild').value,serial=++launchPlanRequest;
 const container=$('launchPlan'),list=$('launchPlanCards');
 if(!id){container.hidden=true;list.replaceChildren();return;}
 container.hidden=false;
 list.innerHTML='<li class="small-help">Проверяем карточки сборки…</li>';
 $('launchPlanNotice').textContent='';
 try{
  const snapshot=await studio('build_get',{id});
  if(serial!==launchPlanRequest||$('launchBuild').value!==id)return;
  const cards=snapshot.cards||[]; // Show legacy cards too: the compiler must not launch hidden mechanics.
  const plan=cards.map(describeLaunchCard);
  list.innerHTML=plan.map((row,i)=>'<li class="launch-plan-item'+(row.invalid?' is-unconfigured':'')+'">'+
   '<span class="launch-plan-number">'+(i+1)+'</span><span class="launch-plan-detail"><strong>'+
   esc(row.title)+'</strong><span>'+esc(row.description)+'</span></span></li>').join('');
  const obsolete=cards.some(c=>['team_stats','player_stats'].includes(c.type));
  $('launchPlanNotice').textContent=plan.some(x=>x.invalid)?
   'Внимание: есть карточки без темы или механик либо устаревшие рейтинги. Настройте или удалите их перед запуском.'+
   (obsolete?' Чтобы исключить старые отдельные рейтинги, откройте и сохраните сборку.':''):
   'Будут запущены все перечисленные карточки по порядку. Для изменения состава откройте настройки сборки.';
 }catch(error){
  if(serial!==launchPlanRequest)return;
  list.innerHTML='<li class="small-help">Не удалось получить список карточек.</li>';
  $('launchPlanNotice').textContent=error.message;
 }
}
let launchRequestBusy=false;
async function launch(){if(launchRequestBusy)return;launchRequestBusy=true;disable('launchButton',true);msg('launchMessage','');
 try{if(!$('launchBuild').value)throw Error('Выберите сборку.');
 const created=await rpc('qwiz_prepare_room',{p_build:$('launchBuild').value,p_title:$('launchTitle').value.trim()||null,p_teams:1});
 msg('launchMessage','Комната '+created.code+(created.reused?' уже подготовлена — открываем существующую, без дубликата.':' создана.')+' Вопросов: '+created.total_questions+'. Пригласите участников и затем начните игру.');
 await loadRooms();await selectRoom(created.code);if(audienceWindow&&!audienceWindow.closed){const url=new URL('./presenter.html',location.href);url.searchParams.set('room',created.code);audienceWindow.location.href=url.toString()}}
 catch(e){msg('launchMessage',e.message,true)}finally{launchRequestBusy=false;disable('launchButton',false)}}
let roomEventTimer=null;
function scheduleRoomRefresh(){
 if(roomEventTimer)clearTimeout(roomEventTimer);
 roomEventTimer=setTimeout(()=>{roomEventTimer=null;if(state.roomCode)refreshLive();},
  250+Math.floor(Math.random()*450));
}
function subscribeRoom(code){if(state.channel){state.db.removeChannel(state.channel);state.channel=null}
 if(roomEventTimer)clearTimeout(roomEventTimer);
 state.channel=state.db.channel('org-next-'+code,{config:{broadcast:{ack:false}}})
 .on('broadcast',{event:'phase'},scheduleRoomRefresh)
 .on('broadcast',{event:'team'},scheduleRoomRefresh)
 .subscribe(status=>{
  if(code!==state.roomCode)return;
  if(status==='SUBSCRIBED')scheduleRoomRefresh();
  else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))scheduleRoomRefresh();
 });
}
async function selectRoom(code){state.roomCode=code;sessionStorage.setItem('qwiz-host-room',code);
 $('liveConsole').hidden=false;subscribeRoom(code);await refreshLive();void loadProjectorPreferences();
 $('liveConsole').scrollIntoView({behavior:'instant',block:'start'});savePosition()}
async function refreshLive(){if(!state.roomCode)return;if(state.roomBusy){state.roomRefreshQueued=true;return;}state.roomBusy=true;const code=state.roomCode;
 try{
  const controller=new AbortController();
  const query=state.db.rpc('qwiz_party_state',{p_code:code});
  const request=typeof query?.abortSignal==='function'?query.abortSignal(controller.signal):query;
  let timer;
  let result;
  try{result=await Promise.race([request,new Promise((_,reject)=>{
   timer=setTimeout(()=>{controller.abort();reject(Error('Сервер не ответил за 10 секунд'));},10000);
  })]);}finally{clearTimeout(timer);}
  if(result?.error)throw Error(result.error.message);
  const s=result?.data;
  if(code!==state.roomCode||!s)return;
  if(s.server_now)state.clockOffset=Date.parse(s.server_now)-Date.now();
  state.room=s;renderLive(s);msg('liveMessage','');
 }catch(e){msg('liveMessage',e.message,true)}
 finally{state.roomBusy=false;if(state.roomRefreshQueued){state.roomRefreshQueued=false;queueMicrotask(refreshLive);}}}
function updateLiveMarkup(id,html){const node=$(id);if(node.__qwizMarkup===html)return;node.innerHTML=html;node.__qwizMarkup=html;}
function renderLive(s){
 if(s?.activity)s={...s,activity:hostArcadeActivity(s.activity)};
 const key=s.phase+':'+s.index;if(key!==state.liveKey){state.liveKey=key;if(s.phase==='result')QwizStage.audio.play('reveal');else if(s.phase==='finished')QwizStage.audio.play(s.activity?.sound||'fanfare')}
 const liveClockOn=['question','result'].includes(s.phase),clockKey=liveClockOn?[s.code,s.phase,s.index,s.ends_at,s.paused].join(':'):'';
 if(state.liveClockKey!==clockKey){$('liveClock').innerHTML=liveClockOn?QwizStage.clockMarkup(s,'liveTimer'):'';state.liveClockKey=clockKey;}
 if(liveClockOn)QwizStage.updateClock(s,state.clockOffset,document,'liveTimer',false);
$('activeRoomName').textContent=s.title;$('activeRoomCode').textContent=s.code;
 $('livePlayers').textContent=(s.players||[]).length;$('liveTeams').textContent=(s.teams||[]).length;
 $('livePhase').textContent=QwizStage.phaseLabel(s.phase);
 $('liveAnswers').textContent=s.answers_count||0;
 $('liveStart').hidden=false;$('liveStart').disabled=!['lobby','finished'].includes(s.phase);
 QwizStage.iconLabel($('liveStart'),s.phase==='finished'?'Повторить игру':'Начать',s.phase==='finished'?'refresh':'play');
 $('liveStart').setAttribute('aria-label',s.phase==='finished'?'Создать новую сессию той же игры, сохранив историю':'Начать текущую игру');
 $('livePause').hidden=false;$('livePause').disabled=!['countdown','question','result','intermission'].includes(s.phase);QwizStage.iconLabel($('livePause'),s.paused?'Продолжить':'Пауза',s.paused?'play':'pause');$('livePause').setAttribute('aria-pressed',String(!!s.paused));
 $('liveNext').hidden=false;$('liveNext').disabled=!['countdown','question','result','intermission'].includes(s.phase);const geoPlaying=s.phase==='intermission'&&s.activity?.settings?.arcade_mode==='russia_map';
 const introPlaying=s.phase==='intermission'&&s.activity?.type==='card_intro';
 QwizStage.iconLabel($('liveNext'),geoPlaying?'Следующий вопрос':introPlaying?'Запустить испытание':'Далее','forward');$('liveReveal').hidden=true;$('liveFinish').hidden=false;$('liveFinish').disabled=['lobby','finished'].includes(s.phase);
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
 updateLiveMarkup('liveRanking',(s.teams||[]).slice().sort((a,b)=>b.score-a.score).map((t,i)=>{
  const effects=(s.team_effects||s.team_lobby?.effects_history||[]).filter(x=>x.team_id===t.id);
  return '<div class="live-line"><span>'+(i+1)+'. '+esc(t.name)+
   (boosts.get(t.id)?'<b class="team-boost-chip" title="Активный бонус текущего раунда">✦ '+esc(boosts.get(t.id).title)+'</b>':'')+
   (effects.length?'<small class="team-effects-history">'+effects.map(x=>esc(x.choice)+' ('+(Number(x.points_awarded)>=0?'+':'')+Number(x.points_awarded)+')').join(' · ')+'</small>':'')+
   '</span><strong>'+esc(t.score)+'</strong></div>';
 }).join(''));
 const stats=s.public_stats||{};const latest=(stats.question_stats||[]).at(-1);const completed=Math.max(0,s.index+1);
 $('liveRoundStats').textContent='Вопрос '+completed+' / '+s.total+' · Ответов '+(s.answers_count||0)+(latest?' · Верных '+latest.correct+'/'+latest.answered:'')+(s.paused?' · Игра на паузе':'');
 updateLiveMarkup('liveRoster',(s.players||[]).map(p=>'<div class="live-line"><span>'+esc(p.name)+'</span><small>'+
 esc(s.teams.find(t=>t.id===p.team_id)?.name||'Ожидает распределения')+'</small></div>').join(''));renderTeamManager(s);window.QwizArcade?.mountHost($('arcadeHostPanel'),s,state.db);
 void updateModeratorSlides(s);
}
let moderatorDeckKey='',moderatorDeckBusy=false;
let projectorPrefsCode='',projectorPrefs={sound_enabled:true,volume:45,music_enabled:false};
function renderProjectorPreferences(){
 const btn=$('hostProjectorSound'),range=$('hostProjectorVolume');
 if(!btn||!range)return;
 const soundLabel=btn.querySelector('.projector-pref-label');
 if(soundLabel)soundLabel.textContent='Звук проектора: '+(projectorPrefs.sound_enabled?'вкл.':'выкл.');
 btn.setAttribute('aria-pressed',String(!!projectorPrefs.sound_enabled));
 const music=$('hostProjectorMusic');
 if(music){
  const musicLabel=music.querySelector('.projector-pref-label');
  if(musicLabel)musicLabel.textContent='Музыка на всю игру: '+(projectorPrefs.music_enabled?'вкл.':'выкл.');
  music.setAttribute('aria-pressed',String(!!projectorPrefs.music_enabled));
 }
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
 const host=$('moderatorSlides');if(!host||document.hidden||s.phase!=='intermission')return;
 const target=host.querySelector('.moderator-slide.is-current .moderator-slide-live');
 if(!target||Date.now()-moderatorDeckRefreshAt<5500)return;
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
  msg('liveMessage',(created.reused?'Пустая комната ': 'Новая игра ')+created.code+(created.reused?' уже была подготовлена; повторная копия не создана.':' подготовлена.')+' Подключите участников по QR-коду и нажмите «Начать».');
 }catch(error){msg('liveMessage','Не удалось повторить игру: '+error.message,true)}
 finally{repeatRoomBusy=false;if(state.room)renderLive(state.room)}
}
let controlRequestBusy=false;
async function control(action){
 if(!state.room||controlRequestBusy)return;
 controlRequestBusy=true;
 const roomId=state.room.room_id,roomCode=state.roomCode,revision=state.room.control_revision;
 for(const id of ['liveStart','livePause','liveReveal','liveNext','liveFinish'])disable(id,true);
 try{
  if(action==='finish'&&!confirm('Завершить игру?'))return;
  const completingGeography=action==='next'&&state.room.phase==='intermission'&&state.room.activity?.settings?.arcade_mode==='russia_map';
  const completingIntro=action==='next'&&state.room.phase==='intermission'&&state.room.activity?.type==='card_intro';
  if(!revision){await refreshLive();throw Error('Состояние комнаты обновлено. Повторите действие.');}
  await rpc('qwiz_party_control_checked',{p_room:roomId,p_action:action,p_revision:revision});
  // A slow response for a previous room must not signal the newly selected room.
  if(roomCode===state.roomCode){
   state.channel?.send({type:'broadcast',event:'phase',payload:{room:roomCode}})?.catch(()=>{});
   await refreshLive();
   if(action==='start'){
    if(!state.room||state.room.phase==='lobby')throw Error('Запуск не подтверждён сервером: комната осталась в ожидании. Проверьте распределение игроков и повторите запуск.');
    msg('liveMessage','Запуск подтверждён сервером. Комната перешла в этап «'+QwizStage.phaseLabel(state.room.phase)+'».');
   }
   if(completingGeography&&state.room?.activity?.type==='round_stats')
    msg('liveMessage','Раунд «Регионы» завершён. На экране идут итоги; следующий этап откроется автоматически.');
   else if(completingIntro&&state.room?.phase==='intermission')
    msg('liveMessage','Испытание запущено. Время отсчитывается на сервере.');
  }
 }catch(e){
  if(roomCode===state.roomCode){
   if(/Состояние игры изменилось/.test(e.message))await refreshLive();
   msg('liveMessage',e.message,true);
  }
 }
 finally{
  controlRequestBusy=false;
  if(state.room){roomReadiness(state.room);renderLive(state.room)}
 }
}
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
 const savedAnswers=students.reduce((n,x)=>n+Number(x.answers||0),0);
 const missingResults=students.length>0&&savedAnswers===0;
 const notice=$('insightDataNotice');
 if(notice){notice.hidden=!missingResults;notice.textContent=missingResults?'Участники зарегистрированы, но нет ни одного сохранённого ответа. Рейтинг не сформирован. Локальные тесты не записываются в статистику.':'';}
 $('insightMetrics').innerHTML=[['Комнат',overview.rooms||0],['Завершено',overview.completed||0],['Студентов',students.length],['Ответов',students.reduce((s,x)=>s+Number(x.answers||0),0)]]
  .map(([label,value])=>'<div><span>'+label+'</span><strong>'+fmt(value)+'</strong></div>').join('');
 const key=$('studentSort').value;const rows=students.slice().sort((a,b)=>Number(b[key]||0)-Number(a[key]||0));
 $('studentRows').innerHTML=missingResults?'<tr><td colspan="8">Нет сохранённых ответов — рейтинг не сформирован.</td></tr>':rows.map((s,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.group)+'</td><td>'+fmt(s.games)+'</td><td>'+fmt(s.answers)+'</td><td>'+fmt(s.correct)+'</td><td>'+fmt(s.accuracy)+'%</td><td>'+fmt(s.score)+'</td></tr>').join('')||'<tr><td colspan="8">Пока нет ответов.</td></tr>';
 const best=Math.max(1,...rows.slice(0,10).map(x=>Number(x.correct||0)));
 $('studentChart').innerHTML=missingResults?'<p class="small-help">Нет сохранённых результатов для диаграммы.</p>':rows.slice(0,10).map(s=>'<div class="bar-row"><span>'+esc(s.name)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+(100*Number(s.correct||0)/best).toFixed(2)+'%"></div></div><strong>'+fmt(s.correct)+'</strong></div>').join('')||'<p class="small-help">Нет данных для диаграммы.</p>';
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
 $('newBuild').onclick=newBuild;$('generalSettings').onclick=generalSettings;$('generalForm').onsubmit=saveGeneralSettings;$('generalOpenBonusRules').onclick=openGeneralBonusRules;
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
    c.settings={...c.settings,arcade_mode:'russia_map',geo_count:15,geo_seconds:150,answer_seconds:10,geo_modes:[]};renderCards();
   }else appendCard(b.dataset.card,b.dataset.arcade||null);
  };
 $('openGamesPalette').onclick=()=>{const panel=$('gamesPalette'),show=panel.hidden;panel.hidden=!show;$('openGamesPalette').setAttribute('aria-expanded',String(show));};
 $('addFinaleCard').onclick=()=>{ensureFinale();editCard(state.cards.length-1)};
 $('arcadePalette').onclick=e=>{const b=e.target.closest('[data-arcade],[data-geo]');if(!b)return;
  if(b.dataset.geo==='russia_map'){
   const c=appendCard('round');if(!c)return;c.title='География России · карта 89 субъектов';c.icon='map';
   c.topic_id=state.topics.find(t=>t.name==='География России')?.id||null;
   c.settings={...c.settings,arcade_mode:'russia_map',geo_count:15,geo_seconds:150,answer_seconds:10,
    geo_modes:[]};renderCards();
  }else appendCard(b.dataset.card,b.dataset.arcade);
 };
 let lastCardTap=null;
 $('roundCards').onclick=e=>{
  if(e.target.closest('button,a,input,select,textarea'))lastCardTap=null;
  const play=e.target.closest('[data-play-card]');if(play){playCardPreview(Number(play.dataset.playCard));return}
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
 $('launchBuild').addEventListener('change',()=>void previewLaunchBuild());
 $('launchPlanEdit').onclick=()=>{if($('launchBuild').value)void loadBuild($('launchBuild').value)};
 // Team setup handlers are owned by workspace-teams.js; no duplicate listeners here.
 $('hostRoomList').onclick=e=>{if(e.target.closest('#clearFinishedArchive')){void clearFinishedArchive();return}const d=e.target.closest('[data-delete-room]');if(d){deleteRoom(d.dataset.deleteRoom);return}
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
// Simulator catalog is independent of live-room and team-manager boot.
function initTeamLab(){
 const lab=window.QwizTeamLab;
 if(!lab?.init){
  const select=$('teamLabBuild');select.replaceChildren(new Option('Модуль теста недоступен',''));
  select.disabled=true;$('teamLabStart').disabled=true;
  $('teamLabMessage').textContent='Не удалось загрузить скрипт симулятора. Проверьте подключение и обновите страницу.';
  $('teamLabMessage').classList.add('error');
  $('teamLabRetry').hidden=false;
  $('teamLabRetry').addEventListener('click',()=>location.reload());
  return;
 }
 lab.init({
  ready:()=>state.buildsReady,
  builds:()=>state.builds,
  build:id=>studio('build_get',{id}),
  questions:card=>loadSandboxQuestions(card),
  catalog:()=>rpc('qwiz_geo_catalog'),
  map:()=>window.QwizGeo.loadMap(),
  reload:async()=>{
   if(!state.db)throw Error('Соединение с базой недоступно.');
   const result=await studio('overview');
   state.topics=result.topics||[];state.builds=result.builds||[];
   state.buildsReady=true;updateSelectors();renderTopics();renderBuilds();
   lab.refreshBuilds();
  }
 });
}
function workspaceReady(){document.documentElement.classList.remove('studio-starting');$('workspaceLoading').hidden=true}
async function init(){
 // Read before wiring listeners or awaiting Supabase. The previous code overwrote
 // sessionStorage with the default 'bank' state during initial scroll/layout.
 const savedBeforeBoot=readPosition();
 restoringView=true;
 initTeamLab();
 wire();
 fillSelect($('bankMode'),flagModes.map(([id,title])=>[id,title]),'Все механики');
 const select=$('editKind');
 select.replaceChildren();
 for(const [id,label,ready] of flagModes){
  const option=createOption(id,label+(ready?'':' · в разработке'));
  option.disabled=!ready;select.add(option);
 }
 select.value='country';

 if(!window.supabase?.createClient){
  connection('error','Не удалось подключиться');
  window.QwizTeamLab?.loadError('Не загрузилась библиотека подключения к Supabase.');
  workspaceReady();return;
 }
 state.db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 try{const {data:{session}}=await state.db.auth.getSession();if(!session)throw Error('Войдите как преподаватель на главной.');
  if(!await rpc('org_quiz_is_admin_check'))throw Error('У вас нет прав преподавателя.');
  state.accountId=session.user?.id||null;
  connection('ready','Кабинет подключён');
  // Local timeout changes the UI only, and never polls the API.
  const buildsLoadingTimeout=setTimeout(()=>{
   if(!state.buildsReady)window.QwizTeamLab?.loadError('Сервер не ответил за 15 секунд.');
  },15000);
  try{await overview()}finally{clearTimeout(buildsLoadingTimeout)}await loadRooms();
  if(savedBeforeBoot){await restorePosition(savedBeforeBoot)}
  else{
   const hash=location.hash.slice(1);
   const code=sessionStorage.getItem('qwiz-host-room');
   if(code){section('rooms');await selectRoom(code)}
   else if(['bank','builder','rooms','insights'].includes(hash))section(hash);
   restoringView=false;savePosition();
  }
  state.roomTimer=setInterval(()=>{if(state.roomCode&&!document.hidden&&navigator.onLine)refreshLive()},4500);
  setInterval(()=>{if(!state.room||document.hidden)return;const s=state.room;if(['question','result'].includes(s.phase)&&!s.paused){const left=QwizStage.updateClock(s,state.clockOffset,document,'liveTimer');if(left===0&&Date.now()-state.lastDeadlineRefresh>1500){state.lastDeadlineRefresh=Date.now();refreshLive()}}else if(s.phase==='countdown'&&!s.paused&&Date.parse(s.ends_at)<=Date.now()+state.clockOffset&&Date.now()-state.lastDeadlineRefresh>1500){state.lastDeadlineRefresh=Date.now();refreshLive()}},250);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.roomCode)refreshLive()});
  window.addEventListener('online',()=>{if(state.roomCode)refreshLive()});
  }catch(e){
  restoringView=false;connection('error',e.message);
  if(!state.buildsReady)window.QwizTeamLab?.loadError(e.message);
  $('bankItems').innerHTML='<div class="empty">'+esc(e.message)+' <a href="./">Вернуться ко входу</a></div>'
 }
 finally{workspaceReady()}
}
window.addEventListener('DOMContentLoaded',init);
