'use strict';
/* QWIZ-PARTY isolated card test runner.
   Never joins/creates a room, subscribes to realtime, submits an answer or writes a score.
   All gameplay actions stay in memory; questions are fetched once, read-only, on open. */
window.QwizCardSandbox=(()=>{
 const el=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=n=>window.QwizStage?.uiIcon(n)||'';
 const names={locate:'Найти субъект',identify:'Угадать название',capital:'Административный центр',flag:'Флаг субъекта',silhouette:'Угадать по контуру',neighbour:'Соседи',detective:'Географический детектив',district:'Федеральный округ'};
 let session=null,seq=0;
 const safeImage=url=>typeof url==='string'&&(/^https:\/\//i.test(url)||/^\.\/assets\//.test(url))?url:'';
 const cap=(x,min,max)=>Math.min(max,Math.max(min,Number(x)||min));
 const unique=items=>items.filter((x,i)=>items.indexOf(x)===i);
 function shuffle(values){const arr=values.slice();for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
 function resetRound(){
  if(!session)return;
  session.picks=new Map();session.mapPicks=new Map();session.taps=0;session.blitzVote=null;session.captainVote=null;
  session.faces=shuffle(['◆','✦','☼','●','▲','♣','◆','✦','☼','●','▲','♣']);
  session.faceUp=[];session.matched=[];session.moves=0;
 }
 function isArcade(s){return ['tug','captain','blitz'].includes(s.card.settings?.arcade_mode)}
 function stages(s){
  const c=s.card,settings=c.settings||{},mode=settings.arcade_mode;
  if(mode==='russia_map'){
   const limit=cap(settings.geo_count||15,1,89),modes=(settings.geo_modes||[]).filter(x=>names[x]);
   const steps=[{kind:'intro',label:'Заставка'}];
   for(let i=0;i<limit;i++){steps.push({kind:'map',i,mode:modes[i%modes.length]||'locate',label:'Карта '+(i+1)});steps.push({kind:'map-answer',i,mode:modes[i%modes.length]||'locate',label:'Ответ '+(i+1)})}
   steps.push({kind:'summary',label:'Итоги'});return steps;
  }
  if(isArcade(s)){
   const types=mode==='blitz'?['intro','vote','captain-vote','arcade-result','bonus']:['intro','arcade','arcade-result','bonus'];
   return types.map((kind,i)=>({kind,label:['Заставка',mode==='blitz'?'Голосование':'Игра',mode==='blitz'?'Капитан':'Результат',mode==='blitz'?'Результат':'Бонус', 'Бонус'][i]}));
  }
  if(c.type==='round'){
   const steps=[{kind:'intro',label:'Заставка'}];
   s.questions.forEach((q,i)=>{steps.push({kind:'question',i,label:'Вопрос '+(i+1)});steps.push({kind:'answer',i,label:'Ответ '+(i+1)})});
   steps.push({kind:'summary',label:'Итоги'});return steps;
  }
  if(c.type==='finale')return[{kind:'intro',label:'Финал'},{kind:'summary',label:'Общий зачёт'}];
  return [{kind:'intro',label:'Заставка'},{kind:'generic',label:'Показ карточки'},{kind:'summary',label:'Далее'}];
 }
 function answerKeys(q){
  const solution=q.solution||{};
  if(Array.isArray(solution.correct_indices))return solution.correct_indices.filter(Number.isInteger);
  if(Number.isInteger(solution.correct))return [solution.correct];
  if(Number.isInteger(q.correct))return [q.correct];
  return [];
 }
 function displayed(q,s){
  if(!s.optionOrder.has(q)){
   const order=Array.from({length:Math.min(20,(q.options||[]).length)},(_,i)=>i);
   s.optionOrder.set(q,shuffle(order));
  }
  return s.optionOrder.get(q);
 }
 function optionHtml(value){
  if(value&&typeof value==='object'){
   if(safeImage(value.image_url))return '<img class="card-play-flag" src="'+esc(value.image_url)+'" loading="lazy" decoding="async" alt="'+esc(value.label||'Изображение варианта')+'">'+(value.label?'<span>'+esc(value.label)+'</span>':'');
   if(Array.isArray(value.stripes))return window.QwizStage?.stripeOption(value)||esc(value.label||'Вариант');
   return esc(value.text||value.label||'Вариант');
  }
  return esc(value);
 }
 function mediaHtml(q){
  const src=safeImage(q.media_url||q.solution?.media_url||q.solution?.illustration_url||q.illustration_url);
  return src?'<div class="card-play-media"><img src="'+esc(src)+'" alt="Иллюстрация вопроса" loading="lazy"></div>':'';
 }
 function questionHtml(s,step,reveal){
  const q=s.questions[step.i];if(!q)return '<p class="card-play-note">Вопрос не загружен.</p>';
  const order=displayed(q,s),chosen=s.picks.get(step.i)||new Set(),correct=answerKeys(q);
  const multi=Array.isArray(q.solution?.correct_indices),hasKey=correct.length>0;
  const selectedText=q.options&&q.options.length?'':'<p class="card-play-note">Вопрос без вариантов. Проверьте настройки в банке.</p>';
  return '<div class="card-play-question">'+
   '<div class="card-play-overline">ВОПРОС '+(step.i+1)+' ИЗ '+s.questions.length+' · '+esc(q.solution?.flag_mode||q.solution?.geo_mode||s.topic||'Квиз')+'</div>'+
   mediaHtml(q)+'<h3>'+esc(q.prompt||'Текст вопроса отсутствует')+'</h3>'+
   '<div class="card-play-answers">'+order.map((original,displayIndex)=>{
    const value=q.options[original],picked=chosen.has(original),right=hasKey&&correct.includes(original);
    const color=reveal?(right?' is-correct':picked?' is-wrong':''):picked?' is-picked':'';
    return '<button type="button" data-card-pick="'+step.i+':'+original+'" class="card-play-answer'+color+'" aria-pressed="'+picked+'" '+(reveal||s.view==='audience'?'disabled':'')+'>'+
     '<span class="card-play-letter">'+String.fromCharCode(65+displayIndex)+'</span><span class="card-play-choice">'+optionHtml(value)+'</span>'+
     (reveal&&right?'<span class="card-play-mark" aria-label="Верно">✓</span>':'')+'</button>';
   }).join('')+'</div>'+selectedText+
   (reveal?'<div class="card-play-reveal"><strong>'+(hasKey?'Правильный ответ выделен зелёным':'Ключ ответа не предоставлен библиотекой')+'</strong>'+
    (q.explanation?'<p>'+esc(q.explanation)+'</p>':'')+'</div>':
    '<p class="card-play-note">'+(s.view==='audience'?'Вид аудитории: варианты показываются без возможности голосовать.':multi?'Выберите несколько вариантов. Ответ никуда не отправляется.':'Выберите вариант для локальной проверки. Ответ никуда не отправляется.')+'</p>')+
   '</div>';
 }
 function mapHtml(s,step,reveal){
  const regions=s.mapRegions;if(!regions.length)return '<div class="card-play-note">Геометрия карты не загрузилась. Проверьте источник карты в настройках.</div>';
  const target=regions[(step.i*13+7)%regions.length],selected=s.mapPicks.get(step.i);
  const mode=step.mode;const locationTask=mode==='locate';
  const supported=['locate','identify','silhouette'].includes(mode);
  const prompt=mode==='locate'?'Найдите на карте: '+target.name:mode==='identify'?'Как называется выделенный субъект?':mode==='silhouette'?'Назовите субъект по контуру':names[mode]||'География России';
  const rect=mode==='silhouette'?target.box.join(' '):'0 0 1120 480';
  const paths=(mode==='silhouette'?[target]:regions).map(g=>'<path d="'+esc(g.path)+'" data-card-region="'+esc(g.id)+'" class="'+(String(g.id)===String(target.id)&&reveal?' is-right':String(g.id)===String(selected)&&!reveal?' is-selected':String(g.id)===String(target.id)&&mode==='identify'?' is-focused':'')+'" aria-label="'+esc(g.name)+'" tabindex="'+(reveal?'-1':'0')+'" role="button"/>').join('');
  return '<div class="card-play-question"><div class="card-play-overline">КАРТА · ЗАДАНИЕ '+(step.i+1)+' · '+esc(names[mode]||mode)+'</div><h3>'+esc(prompt)+'</h3>'+
    (!supported?'<p class="card-play-note">Для этого режима необходимы вопросы сервера. Здесь проверяются переключение экранов и отрисовка карты, а не правильность географического ответа.</p>':'')+
    '<div class="card-play-map-wrap"><svg class="card-play-map" viewBox="'+rect+'" role="group" aria-label="Карта субъектов России">'+paths+'</svg></div>'+
    (selected&&!reveal?'<p class="card-play-map-choice">Вы выбрали: '+esc(regions.find(x=>String(x.id)===String(selected))?.name||'субъект')+'</p>':'')+
    (!reveal&&s.view==='player'?'<button type="button" data-card-confirm class="card-play-confirm" '+(!selected?'disabled':'')+'>Подтвердить выбор</button>':'')+
    (reveal?'<div class="card-play-reveal"><strong>Целевой субъект: '+esc(target.name)+'</strong><p>Проверка ответа демонстрационная, очки не начисляются.</p></div>':'')+
    '</div>';
 }
 function memoryHtml(s){
  return '<div class="card-play-memory">'+s.faces.map((symbol,i)=>'<button type="button" data-card-flip="'+i+'" class="'+(s.matched.includes(i)?' is-matched':s.faceUp.includes(i)?' is-open':'')+'" aria-label="Плитка '+(i+1)+'">'+
    (s.matched.includes(i)||s.faceUp.includes(i)?esc(symbol):'✦')+'</button>').join('')+'</div>'+
    '<p class="card-play-note">'+s.matched.length/2+' из 6 пар · '+s.moves+' попыток. Найдите все пары, не обращаясь к серверу.</p>';
 }
 function arcadeHtml(s,kind){
  const mode=s.card.settings.arcade_mode;
  if(mode==='tug')return '<div class="card-play-arcade"><div class="card-play-tap-art"><span>✦</span><strong>'+s.taps+'</strong><small>нажатий в тесте</small></div>'+
     '<button class="card-play-tap" type="button" data-card-tap>ТАП!</button><p>Нажимайте столько раз, сколько нужно. Это счётчик одного тестового игрока, не командный результат.</p></div>';
  if(mode==='captain')return '<div class="card-play-arcade"><p>Откройте по две плитки и соберите 6 пар.</p>'+memoryHtml(s)+'</div>';
  const options=['A','B','C','D'];
  const captain=kind==='captain-vote';const chosen=captain?s.captainVote:s.blitzVote;
  return '<div class="card-play-question"><div class="card-play-overline">'+(captain?'РЕШЕНИЕ КАПИТАНА':'ГОЛОС УЧАСТНИКА')+'</div>'+
   '<h3>'+(captain?'Капитан выбирает окончательный ответ команды':'Тестирование выбора варианта участником')+'</h3>'+
   '<p class="card-play-note">В реальном Блиц-консенсусе вопрос и варианты выдаёт сервер. Здесь проверяются только этапы и управление голосованием; варианты A–D — обозначения, а не реальные вопросы.</p>'+
   '<div class="card-play-answers">'+options.map((v,i)=>'<button type="button" data-card-vote="'+(captain?'captain':'player')+':'+i+'" class="card-play-answer'+(chosen===i?' is-picked':'')+'" aria-pressed="'+(chosen===i)+'" '+(s.view==='audience'?'disabled':'')+'><span class="card-play-letter">'+v+'</span><span class="card-play-choice">Выбрать '+v+'</span></button>').join('')+'</div></div>';
 }
 function introHtml(s){
  const mode=s.card.settings?.arcade_mode,meta={russia_map:'Карта России',tug:'Тап-баттл',blitz:'Блиц-консенсус',captain:'Мэмори капитанов'};
  const title=s.card.title||'Новый этап';
  return '<div class="card-play-intro"><div class="card-play-orb" aria-hidden="true">'+icon(mode==='russia_map'?'flag':mode?'play':'sparkles')+'</div>'+
    '<span class="card-play-overline">QWIZ-PARTY · '+esc(mode&&meta[mode]||s.topic||'КВИЗ')+'</span><h3>'+esc(title)+'</h3>'+
    '<p>'+esc(mode==='russia_map'?'У каждого участника индивидуальные задания на карте.':s.card.type==='finale'?'Показываются финальные результаты игры.':isArcade(s)?'Командное испытание начинается с заставки.':'Стартовая анимация и объявление темы.')+'</p></div>';
 }
 function summaryHtml(s,kind){
  const mode=s.card.settings?.arcade_mode;
  if(kind==='bonus')return '<div class="card-play-intro"><div class="card-play-orb">'+icon('sparkles')+'</div><h3>Командные усиления</h3><p>После победы команда может выбрать стратегию, затем бонус или помеху. В этом режиме ничего не начисляется.</p>'+
    '<div class="card-play-kpis"><span>Фора +12</span><span>Командный рывок</span><span>Импульс +15%</span></div></div>';
  const label=kind==='arcade-result'?'Результат испытания':s.card.type==='finale'?'Финальный рейтинг':'Итоги этапа';
  return '<div class="card-play-intro"><div class="card-play-orb">'+icon('chart')+'</div><span class="card-play-overline">ТЕСТОВЫЙ ЭКРАН</span><h3>'+label+'</h3>'+
     (mode==='tug'?'<p>Личные нажатия в тесте: <strong>'+s.taps+'</strong>.</p>':mode==='captain'?'<p>Найдено пар: '+(s.matched.length/2)+' из 6.</p>':mode==='blitz'?'<p>Голос участника: '+(s.blitzVote==null?'не выбран':String.fromCharCode(65+s.blitzVote))+'. Капитан: '+(s.captainVote==null?'не выбрал':String.fromCharCode(65+s.captainVote))+'.</p>':'<p>Рейтинг команд и личная статистика рассчитываются сервером только в настоящей игре. Здесь они не подменяются выдуманными цифрами.</p>')+
     '<p class="card-play-note">Настоящие результаты студентов и таблицы рейтинга не затронуты.</p></div>';
 }
 function genericHtml(s){
  return '<div class="card-play-intro"><span class="card-play-overline">РАУНД</span><h3>'+esc(s.card.title||'Карточка')+'</h3><p>'+esc(
   s.card.type==='break'?'Музыкальная пауза: преподаватель продолжает игру вручную.':
   ['bonus','duel'].includes(s.card.type)?'У этой карточки не выбрана действующая мини-игра. Выберите её в настройках перед запуском.':
   ['team_stats','player_stats'].includes(s.card.type)?'Устаревший тип статистики, отдельный раунд больше не используется.':'Элемент игровой программы')+'</p></div>';
 }
 function scene(s,step){
  switch(step.kind){
   case 'question':return questionHtml(s,step,false);
   case 'answer':return questionHtml(s,step,true);
   case 'map':return mapHtml(s,step,false);
   case 'map-answer':return mapHtml(s,step,true);
   case 'arcade':case 'vote':case 'captain-vote':return arcadeHtml(s,step.kind);
   case 'arcade-result':case 'summary':case 'bonus':return summaryHtml(s,step.kind);
   case 'generic':return genericHtml(s);
   default:return introHtml(s);
  }
 }
 function paint(){
  const s=session;if(!s)return;
  const dialog=el('cardPlayDialog');if(!dialog?.open)return;
  const steps=stages(s);s.step=cap(s.step,0,steps.length-1);
  const current=steps[s.step];
  el('cardPlayTitle').textContent=s.card.title||'Проверка карточки';
  el('cardPlayMeta').textContent='Этап '+(s.step+1)+' из '+steps.length+' · '+(s.topic||'Конструктор');
  el('cardPlaySafety').textContent=s.loading?'Загружаем данные для локальной проверки…':s.error?
   'Данные частично недоступны: '+s.error:'Тест без комнаты и начисления баллов · переходы вручную';
  el('cardPlaySafety').classList.toggle('is-error',!!s.error);
  el('cardPlaySteps').innerHTML=steps.map((step,i)=>'<button type="button" data-card-step="'+i+'" class="'+(i===s.step?' is-current':'')+'" aria-current="'+(i===s.step?'step':'false')+'">'+esc(step.label)+'</button>').join('');
  el('cardPlayPrev').disabled=s.step<=0;
  el('cardPlayNext').disabled=s.step>=steps.length-1;
  el('cardPlayNext').innerHTML=icon('forward')+'<span>'+(s.step>=steps.length-1?'Последний этап':'Далее')+'</span>';
  for(const b of dialog.querySelectorAll('[data-card-view]'))b.setAttribute('aria-pressed',String(b.dataset.cardView===s.view));
  el('cardPlayScreen').classList.toggle('is-audience',s.view==='audience');
  el('cardPlayScreen').classList.toggle('is-player',s.view==='player');
  el('cardPlayScreen').innerHTML=scene(s,current);
  el('cardPlaySteps').querySelector('.is-current')?.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 function close(){
  ++seq;session=null;
  const dialog=el('cardPlayDialog');if(dialog?.open)dialog.close();
  if(el('cardPlayScreen'))el('cardPlayScreen').replaceChildren();
 }
 async function open({card,topic,loadQuestions,loadMap}){
  const dialog=el('cardPlayDialog');if(!dialog)return;
  if(dialog.open)dialog.close();
  const token=++seq;
  session={card:JSON.parse(JSON.stringify(card)),topic:String(topic||''),view:'player',step:0,questions:[],mapRegions:[],optionOrder:new WeakMap(),loading:false,error:''};
  resetRound();
  dialog.showModal();
  paint();
  const s=session;
  const mode=s.card.settings?.arcade_mode;
  if(s.card.type!=='round'||(mode&&mode!=='russia_map'))return;
  s.loading=true;paint();
  try{
   if(mode==='russia_map'){
    s.mapRegions=await loadMap();
   }else{
    const questions=await loadQuestions(s.card);
    s.questions=(Array.isArray(questions)?questions:[]).map(q=>({...q,options:Array.isArray(q.options)?q.options:[]}));
    if(!s.questions.length)s.error='Для выбранной темы и механик вопросы не найдены. Сначала добавьте или опубликуйте вопросы.';
   }
  }catch(e){s.error=e?.message||'Не удалось получить вопросы'}
  finally{if(token===seq&&session===s){s.loading=false;paint()}}
 }
 function init(){
  const dialog=el('cardPlayDialog');if(!dialog)return;
  dialog.addEventListener('close',()=>{++seq;session=null;el('cardPlayScreen').replaceChildren()});
  dialog.addEventListener('click',e=>{
   if(e.target===dialog){close();return}
   const button=e.target.closest('button');
   if(!button||!session)return;
   const s=session;
   if(button.matches('[data-card-close]')){close();return}
   if(button.hasAttribute('data-card-step')){s.step=Number(button.dataset.cardStep);paint();return}
   if(button.id==='cardPlayPrev'){s.step-=1;paint();return}
   if(button.id==='cardPlayNext'){s.step+=1;paint();return}
   if(button.hasAttribute('data-card-view')){s.view=button.dataset.cardView;paint();return}
   if(button.hasAttribute('data-card-restart')){s.step=0;resetRound();paint();return}
   if(button.hasAttribute('data-card-pick')){
    const [idx,orig]=button.dataset.cardPick.split(':').map(Number);
    const selected=s.picks.get(idx)||new Set(),multiple=Array.isArray(s.questions[idx]?.solution?.correct_indices);
    if(!multiple)selected.clear();
    if(multiple&&selected.has(orig))selected.delete(orig);else selected.add(orig);
    s.picks.set(idx,selected);paint();return;
   }
   if(button.hasAttribute('data-card-region')){
    const svg=button.closest('svg');if(svg)return; // region SVG paths are handled below
   }
   if(button.hasAttribute('data-card-confirm')){s.step=Math.min(s.step+1,stages(s).length-1);paint();return}
   if(button.hasAttribute('data-card-tap')){s.taps+=1;paint();return}
   if(button.hasAttribute('data-card-vote')){const [kind,num]=button.dataset.cardVote.split(':');if(kind==='captain')s.captainVote=Number(num);else s.blitzVote=Number(num);paint();return}
   if(button.hasAttribute('data-card-flip')){
    const index=Number(button.dataset.cardFlip);
    if(s.matched.includes(index)||s.faceUp.includes(index))return;
    if(s.faceUp.length===2)s.faceUp=[];
    s.faceUp.push(index);
    if(s.faceUp.length===2){s.moves++;if(s.faces[s.faceUp[0]]===s.faces[s.faceUp[1]]){s.matched.push(...s.faceUp);s.faceUp=[]}}
    paint();
   }
  });
  dialog.addEventListener('click',e=>{
   const path=e.target.closest('[data-card-region]');if(!path||!session||session.view!=='player')return;
   const current=stages(session)[session.step];if(current?.kind!=='map')return;
   session.mapPicks.set(current.i,path.dataset.cardRegion);paint();
  });
  dialog.addEventListener('keydown',e=>{
   const path=e.target.closest('[data-card-region]');
   if(path&&(e.key==='Enter'||e.key===' ')){e.preventDefault();path.dispatchEvent(new MouseEvent('click',{bubbles:true}))}
  });
 }
 document.addEventListener('DOMContentLoaded',init);
 return Object.freeze({open,close});
})();