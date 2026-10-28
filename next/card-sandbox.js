'use strict';
/* QWIZ-PARTY isolated card test runner.
   Never joins/creates a room, subscribes to realtime, submits an answer or writes a score.
   All gameplay actions stay in memory; questions are fetched once, read-only, on open. */
window.QwizCardSandbox=(()=>{
 const el=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=n=>window.QwizStage?.uiIcon(n)||'';
 const names={locate:'Найти субъект',identify:'Угадать название',capital:'Административный центр',flag:'Флаг субъекта',silhouette:'Угадать по контуру',neighbour:'Соседи',detective:'Географический детектив',district:'Федеральный округ'};
 const secretGlyphs={red:'🔴',blue:'🔵',yellow:'🟡',green:'🟢',ru:'🇷🇺',cn:'🇨🇳',br:'🇧🇷',jp:'🇯🇵',fr:'🇫🇷',de:'🇩🇪',it:'🇮🇹',star:'⭐',shield:'🛡️',crown:'👑',eagle:'🦅',globe:'🌐',torch:'🔥',letter:'📜',dove:'🕊️',key:'🔑',seal:'📩'};
 const secretGlyph=value=>secretGlyphs[value]||'◆';
 let session=null,seq=0;
 const safeImage=url=>typeof url==='string'&&(/^https:\/\//i.test(url)||/^\.\/assets\//.test(url))?url:'';
 const cap=(x,min,max)=>Math.min(max,Math.max(min,Number(x)||min));
 const unique=items=>items.filter((x,i)=>items.indexOf(x)===i);
 function shuffle(values){const arr=values.slice();for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
 function resetRound(){
  if(!session)return;
  session.picks=new Map();session.mapPicks=new Map();session.geoPicks=new Map();session.taps=0;session.blitzVote=null;session.captainVote=null;
  session.faces=shuffle(['◆','✦','☼','●','▲','♣','◆','✦','☼','●','▲','♣']);
  session.faceUp=[];session.matched=[];session.moves=0;
  clearTimeout(session.secretTimer);session.secretTimer=null;session.secretShowStart=0;
  session.secretAnswer=[];session.secretSubmitted=false;session.secretPoints=0;session.secretExact=0;
  if(session.secretTemplate)session.secretCode=buildSecretCode(session.secretTemplate);
 }
 function isArcade(s){return ['tug','captain','blitz','sequence_memory'].includes(s.card.settings?.arcade_mode)}
 function stages(s){
  const c=s.card,settings=c.settings||{},mode=settings.arcade_mode;
  if(mode==='russia_map'){
   const steps=[{kind:'intro',label:'Заставка'}];
   s.geoQuestions.forEach((q,i)=>{steps.push({kind:'geo-question',i,label:'Вопрос '+(i+1)});steps.push({kind:'geo-answer',i,label:'Ответ '+(i+1)})});
   steps.push({kind:'summary',label:'Итоги'});return steps;
  }
  if(mode==='sequence_memory')return [
   {kind:'intro',label:'Заставка'},
   {kind:'secret-show',label:'Показ кода'},
   {kind:'secret-answer',label:'Ввод кода'},
   {kind:'secret-result',label:'Результат'},
   {kind:'bonus',label:'Бонус'}];
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
  const q=s.geoQuestions[step.i],regions=s.mapRegions;
  if(!q)return '<p class="card-play-note">Географический вопрос не загружен. Проверьте справочник.</p>';
  if(!regions.length)return '<p class="card-play-note">Карта недоступна. Проверьте источник геометрии.</p>';
  const region=regions.find(x=>String(x.id)===String(q.region));
  const selectedMap=s.mapPicks.get(step.i),selectedOption=s.geoPicks.get(step.i);
  const selected=q.mode==='locate'?selectedMap:selectedOption;
  const success=selected!=null&&String(selected)===String(q.correctId);
  const targetBox=region?.box||[0,0,1120,480];
  const image=q.flag&&/^[\w.-]{1,140}$/u.test(q.flag)
   ?'<div class="card-play-geo-media"><img alt="Флаг субъекта России" src="https://raw.githubusercontent.com/russian-flags/regions/3c411c7b305c678c49798cc610538c66108adbde/assets/'+encodeURIComponent(q.flag)+'/index.svg" loading="lazy" decoding="async"></div>':'';
  const outlines=q.silhouette&&region?[region]:regions;
  const paths=outlines.map(g=>{
   const id=String(g.id),correct=reveal&&id===String(q.region);
   const isChosen=!reveal&&q.mode==='locate'&&id===String(selectedMap);
   const isWrong=reveal&&q.mode==='locate'&&selectedMap&&id===String(selectedMap)&&id!==String(q.region);
   const isFocused=!reveal&&q.focus!=null&&id===String(q.focus);
   const style=correct?' is-right':isWrong?' is-wrong':isChosen?' is-selected':isFocused?' is-focused':'';
   const active=q.mode==='locate'&&!reveal&&s.view==='player';
   return '<path class="'+style+'" d="'+esc(g.path)+'"'+
    (active?' data-card-region="'+esc(id)+'" role="button" tabindex="0" aria-label="'+esc(g.name)+'" aria-pressed="'+(isChosen?'true':'false')+'"':' aria-hidden="true"')+'/>';
  }).join('');
  const map=q.showMap?'<div class="card-play-map-wrap"><svg class="card-play-map" viewBox="'+
   (q.silhouette?targetBox.join(' '):'0 0 1120 480')+
   '" preserveAspectRatio="xMidYMid meet" role="'+(q.mode==='locate'&&!reveal?'group':'img')+
   '" aria-label="Карта 89 субъектов России"><g>'+paths+'</g></svg></div>':'';
  const options=q.options?.length?'<div class="card-play-answers">'+q.options.map((o,i)=>{
   const picked=String(selectedOption)===String(o.id),right=String(q.correctId)===String(o.id);
   const style=reveal?(right?' is-correct':picked?' is-wrong':''):picked?' is-picked':'';
   return '<button type="button" class="card-play-answer'+style+'" data-card-geo-choice="'+step.i+':'+esc(o.id)+
    '" aria-pressed="'+picked+'" '+(reveal||s.view==='audience'?'disabled':'')+'>'+
    '<span class="card-play-letter">'+String.fromCharCode(65+i)+'</span><span class="card-play-choice">'+esc(o.text)+'</span>'+
    (reveal&&right?'<span class="card-play-mark">✓</span>':'')+'</button>';
  }).join('')+'</div>':'';
  const clues=q.clues?.length?'<div class="card-play-geo-clues">'+q.clues.map(t=>'<span>'+esc(t)+'</span>').join('')+'</div>':'';
  const revealHtml=reveal?'<div class="card-play-reveal" role="status"><strong>'+
   (selected==null?'Правильный ответ':success?'Верно!':'Неверно. Правильный ответ')+': '+esc(q.correctText)+
   '</strong><p>'+esc(q.explanation)+(selected==null?' Ответ не был выбран.':'')+'</p></div>':'';
  return '<section class="card-play-question card-play-geography"><div class="card-play-overline">ГЕОГРАФИЯ РОССИИ · '+
   esc(names[q.mode]||q.mode)+' · ВОПРОС '+(step.i+1)+' ИЗ '+s.geoQuestions.length+'</div>'+
   '<h3>'+esc(q.prompt)+'</h3>'+clues+image+map+options+
   (selectedMap&&!reveal&&q.mode==='locate'?'<p class="card-play-map-choice" role="status">Выбрано: '+
      esc(regions.find(g=>String(g.id)===String(selectedMap))?.name||'Субъект')+'</p>':'')+
   (!reveal&&q.mode==='locate'&&s.view==='player'?
      '<button type="button" class="card-play-confirm" data-card-confirm '+(!selectedMap?'disabled':'')+'>Подтвердить выбор</button>':'')+
   (!reveal&&q.mode!=='locate'?'<p class="card-play-note">'+(s.view==='audience'?
      'Экран аудитории: демонстрация вопроса без выбора ответа.':
      'Выберите ответ. Для проверки перейдите к следующему этапу.')+'</p>':'')+
   revealHtml+'</section>';
 }


 // The sandbox uses the public catalogue, but invents only a LOCAL practice sequence.
 // It never requests the server's secret, affects a real session, or awards points.
 function buildSecretCode(template){
  const palette=unique((template.palette||[]).filter(id=>Object.hasOwn(secretGlyphs,id)));
  const length=cap(template.symbols,4,8);
  if(palette.length<2)throw Error('У испытания отсутствует палитра символов.');
  const variant=template.variant||'basic';
  const repeats=variant==='one_repeat'?1:variant==='two_repeats'?2:0;
  if((variant==='all_unique'||repeats>0)&&palette.length<length-repeats)
   throw Error('Недостаточно символов для испытания.');
  const code=shuffle(palette).slice(0,Math.min(palette.length,length-repeats));
  if(repeats){
   const repeated=shuffle(code).slice(0,repeats);
   code.push(...repeated);
  }
  while(code.length<length)code.push(palette[Math.floor(Math.random()*palette.length)]);
  return shuffle(code.slice(0,length));
 }
 function secretHtml(s,kind){
  const template=s.secretTemplate,code=s.secretCode||[];
  if(!template||!code.length)return '<div class="card-play-intro"><h3>'+(s.error?'Испытание недоступно':'Загружаем испытание…')+'</h3><p>'+esc(s.error||'Получаем выбранный шаблон из каталога 30 испытаний.')+'</p></div>';
  const showing=kind==='secret-show',answering=kind==='secret-answer',result=kind==='secret-result';
  let index=-1;
  if(showing){
   if(!s.secretShowStart)s.secretShowStart=Date.now();
   const elapsed=Date.now()-s.secretShowStart;
   if(elapsed>=1500)index=Math.floor((elapsed-1500)/1100);
   const remaining=elapsed<1500?1500-elapsed:1100-((elapsed-1500)%1100);
   clearTimeout(s.secretTimer);
   s.secretTimer=setTimeout(()=>{if(session===s&&s.step===1)paint()},Math.max(20,remaining+12));
  }
  const glyph=showing&&index>=0&&index<code.length?secretGlyph(code[index]):answering?'🔒':result?'✓':'✦';
  const label=showing?(index<0?'ПРИГОТОВЬТЕСЬ':'ЗАПОМНИТЕ СИМВОЛ'):answering?'ВОССТАНОВИТЕ КОД':'РЕЗУЛЬТАТ';
  const progress=showing?(index<0?'Символы появятся по одному':(Math.min(code.length,index+1)+' / '+code.length)):
   answering?'Введите символы в показанном порядке':'Локальный результат испытания';
  let panel='';
  if(answering){
   const chosen=s.secretAnswer||[];
   panel='<p class="arcade-secret-hint">'+(s.view==='audience'?'Участники восстанавливают последовательность на телефонах.':
    'Вспомните порядок символов. Нажимайте кнопки ниже; повторы допускаются.')+'</p>'+
    '<div class="arcade-secret-slots" aria-label="Ваш код">'+Array.from({length:code.length},(_,i)=>
     '<span class="arcade-secret-slot'+(chosen[i]?' filled':'')+'">'+(chosen[i]&&s.view==='player'?secretGlyph(chosen[i]):i+1)+'</span>').join('')+'</div>';
   if(s.view==='player'&&!s.secretSubmitted)panel+='<div class="arcade-secret-choices" role="group" aria-label="Кнопки кода">'+
    template.palette.map(id=>'<button type="button" data-card-secret-choice="'+esc(id)+'" aria-label="Добавить символ '+esc(id)+'" '+(chosen.length>=code.length?'disabled':'')+'>'+secretGlyph(id)+'</button>').join('')+'</div>'+
    '<div class="arcade-secret-actions"><button type="button" data-card-secret-undo '+(!chosen.length?'disabled':'')+'>Удалить</button>'+
    '<button type="button" data-card-secret-submit '+(chosen.length!==code.length?'disabled':'')+'>Подтвердить</button></div>';
   if(s.secretSubmitted)panel+='<p class="arcade-secret-done">Демонстрационный ответ подтверждён.</p>';
  }else if(result){
   panel=s.secretSubmitted?'<p class="arcade-secret-done">В тесте: '+s.secretPoints+' / 10 · совпало '+s.secretExact+' из '+code.length+'</p>'+
    '<p class="arcade-secret-hint">Правильный код: '+code.map(secretGlyph).join(' ')+'</p>':
    '<p class="arcade-secret-hint">Ответ ещё не подтверждён. Вернитесь к этапу «Ввод кода», затем нажмите «Подтвердить».</p>';
  }else panel='<p class="arcade-secret-hint">Следите за сменой символов. Это локальная демонстрация, без связи с комнатой.</p>';
  return '<section class="card-play-arcade card-play-secret"><div class="arcade-shell arcade-player" data-arcade-root="sequence_memory">'+
   '<p class="card-play-overline">'+esc(template.name)+' · уровень '+Number(template.level||1)+' · '+code.length+' символов</p>'+
   '<div class="arcade-scene"><div class="arcade-secret-scene" role="status" aria-live="off">'+
   '<span class="arcade-secret-eyebrow">'+label+'</span><span class="arcade-secret-symbol">'+glyph+'</span>'+
   '<span class="arcade-secret-progress">'+progress+'</span></div></div>'+
   '<div class="arcade-secret-panel">'+panel+'</div></div></section>';
 }

 function memoryHtml(s){
  return '<div class="card-play-memory">'+s.faces.map((symbol,i)=>'<button type="button" data-card-flip="'+i+'" class="'+(s.matched.includes(i)?' is-matched':s.faceUp.includes(i)?' is-open':'')+'" aria-label="Плитка '+(i+1)+'">'+
    (s.matched.includes(i)||s.faceUp.includes(i)?esc(symbol):'✦')+'</button>').join('')+'</div>'+
    '<p class="card-play-note">'+s.matched.length/2+' из 6 пар · '+s.moves+' попыток. Найдите все пары, не обращаясь к серверу.</p>';
 }

 function arcadeHtml(s,kind){
  const mode=s.card.settings.arcade_mode;
  const originalArt=window.QwizArcade?.previewArt?.(mode)||'';
  if(mode==='tug')return '<div class="card-play-arcade">'+
    '<div class="arcade-shell arcade-player card-play-arcade-shell" data-arcade-root="tug"><div class="arcade-scene">'+originalArt+
    '<button class="arcade-tap-btn arcade-tap-center" type="button" data-card-tap>ТАП!</button></div></div>'+
    '<div class="card-play-tap-art"><span>✦</span><strong>'+s.taps+'</strong><small>нажатий в тесте</small></div>'+
    '<p>Нажимайте сколько угодно раз. Это локальный счетчик одного игрока, не командный результат.</p></div>';
  if(mode==='captain')return '<div class="card-play-arcade"><div class="arcade-shell arcade-player card-play-arcade-shell" data-arcade-root="captain"><div class="arcade-scene">'+originalArt+
    '</div></div><p>Откройте по две плитки и соберите 6 пар.</p>'+memoryHtml(s)+'</div>';
  const options=['A','B','C','D'];
  const captain=kind==='captain-vote',chosen=captain?s.captainVote:s.blitzVote;
  return '<div class="card-play-question"><div class="card-play-arcade-blitz-hero arcade-shell" data-arcade-root="blitz"><div class="arcade-scene">'+originalArt+'</div></div>'+
    '<div class="card-play-overline">'+(captain?'РЕШЕНИЕ КАПИТАНА':'ГОЛОС УЧАСТНИКА')+'</div>'+
    '<h3>'+(captain?'Капитан выбирает окончательный ответ команды':'Тестирование выбора варианта участником')+'</h3>'+
    '<p class="card-play-note">В реальном Блиц-консенсусе вопрос и варианты выдаёт сервер. Здесь проверяются только этапы и управление голосованием; варианты A–D — обозначения, а не реальные вопросы.</p>'+
    '<div class="card-play-answers">'+options.map((v,i)=>'<button type="button" data-card-vote="'+(captain?'captain':'player')+':'+i+'" class="card-play-answer'+(chosen===i?' is-picked':'')+'" aria-pressed="'+(chosen===i)+'" '+(s.view==='audience'?'disabled':'')+'><span class="card-play-letter">'+v+'</span><span class="card-play-choice">Выбрать '+v+'</span></button>').join('')+'</div></div>';
 }
 function introHtml(s){
  const mode=s.card.settings?.arcade_mode,meta={russia_map:'Карта России',tug:'Тап-баттл',blitz:'Блиц-консенсус',captain:'Мэмори капитанов',sequence_memory:'Секретный код'};
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
   case 'geo-question':return mapHtml(s,step,false);
   case 'geo-answer':return mapHtml(s,step,true);
   case 'arcade':case 'vote':case 'captain-vote':return arcadeHtml(s,step.kind);
   case 'secret-show':case 'secret-answer':case 'secret-result':return secretHtml(s,step.kind);
   case 'arcade-result':case 'summary':case 'bonus':return summaryHtml(s,step.kind);
   case 'generic':return genericHtml(s);
   default:return introHtml(s);
  }
 }
 function paint(){
  const s=session;if(!s)return;
  const dialog=el('cardPlayDialog');if(!dialog?.open)return;
  const steps=stages(s);s.step=cap(s.step,0,steps.length-1);
  if(s.step===1&&steps[1]?.kind==='secret-show'&&s.secretShowStart&&s.secretCode?.length&&
     Date.now()-s.secretShowStart>=1500+s.secretCode.length*1100){s.step=2;}
  clearTimeout(s.secretTimer);s.secretTimer=null;
  const current=steps[s.step];
  const visibleStep=s.step+':'+s.view;
  const changed=s.visibleStep!==visibleStep;s.visibleStep=visibleStep;
  el('cardPlayTitle').textContent=s.card.title||'Проверка карточки';
  el('cardPlayMeta').textContent='Этап '+(s.step+1)+' из '+steps.length+' · '+(s.topic||'Конструктор');
  el('cardPlaySafety').textContent=s.loading?'Загружаем данные для локальной проверки…':s.error?
   'Данные частично недоступны: '+s.error:s.card.settings?.arcade_mode==='sequence_memory'?
   'Локальная демонстрация · код создаётся только для теста · без комнаты, сервера и начисления баллов':
   'Тест без комнаты и начисления баллов · переходы вручную';
  el('cardPlaySafety').classList.toggle('is-error',!!s.error);
  el('cardPlaySteps').innerHTML=steps.map((step,i)=>'<button type="button" data-card-step="'+i+'" class="'+(i===s.step?' is-current':'')+'" aria-current="'+(i===s.step?'step':'false')+'">'+esc(step.label)+'</button>').join('');
  el('cardPlayPrev').disabled=s.step<=0;
  el('cardPlayNext').disabled=s.step>=steps.length-1;
  el('cardPlayNext').innerHTML=icon('forward')+'<span>'+(s.step>=steps.length-1?'Последний этап':'Далее')+'</span>';
  for(const b of dialog.querySelectorAll('[data-card-view]'))b.setAttribute('aria-pressed',String(b.dataset.cardView===s.view));
  el('cardPlayScreen').classList.toggle('is-audience',s.view==='audience');
  el('cardPlayScreen').classList.toggle('is-player',s.view==='player');
  el('cardPlayScreen').innerHTML=scene(s,current);
  if(changed){const scroll=el('cardPlayScreen')?.parentElement;if(scroll)scroll.scrollTop=0}
  el('cardPlaySteps').querySelector('.is-current')?.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 function close(){
  if(session)clearTimeout(session.secretTimer);
  ++seq;session=null;
  const dialog=el('cardPlayDialog');if(dialog?.open)dialog.close();
  if(el('cardPlayScreen'))el('cardPlayScreen').replaceChildren();
 }
 async function open({card,topic,loadQuestions,loadMap,loadCatalog}){
  const dialog=el('cardPlayDialog');if(!dialog)return;
  if(dialog.open)dialog.close();
  const token=++seq;
  session={card:JSON.parse(JSON.stringify(card)),topic:String(topic||''),view:'player',step:0,questions:[],geoQuestions:[],mapRegions:[],optionOrder:new WeakMap(),loading:false,error:''};
  resetRound();
  const s=session;
  const mode=s.card.settings?.arcade_mode;
  const needsData=mode==='sequence_memory'||(s.card.type==='round'&&(!mode||mode==='russia_map'));
  s.loading=needsData;
  dialog.showModal();
  paint();
  if(!needsData)return;
  try{
   if(mode==='sequence_memory'){
    // Only the public 30-template catalogue is read; never a real game session.
    const response=await fetch(new URL('./memory-challenges.plan.json',location.href),{cache:'force-cache'});
    if(!response.ok)throw Error('Не удалось загрузить каталог «Секретного кода».');
    const plan=await response.json();
    const items=(plan.levels||[]).flatMap(level=>level.items||[]);
    if(items.length!==30)throw Error('В каталоге должно быть 30 испытаний.');
    const requested=Number(s.card.settings?.secret_challenge)||0;
    const chosen=requested>=1&&requested<=30?items[requested-1]:items[Math.floor(Math.random()*items.length)];
    if(!chosen)throw Error('Выбранное испытание недоступно.');
    if(token!==seq||session!==s)return;
    s.secretTemplate=chosen;s.secretCode=buildSecretCode(chosen);
   }else if(mode==='russia_map'){
    // Two independent read-only sources are fetched once when the preview opens.
    // All eight question modes are generated from the verified catalog and real SVG paths.
    const [mapRegions,catalog]=await Promise.all([loadMap(),loadCatalog()]);
    if(token!==seq||session!==s)return;
    s.mapRegions=mapRegions;
    s.geoQuestions=window.QwizCardGeoPreview.build({card:s.card,catalog,geometry:mapRegions});
   }else{
    const questions=await loadQuestions(s.card);
    if(token!==seq||session!==s)return;
    s.questions=(Array.isArray(questions)?questions:[]).map(q=>({...q,options:Array.isArray(q.options)?q.options:[]}));
    if(!s.questions.length)s.error='Для выбранной темы и механик вопросы не найдены. Сначала добавьте или опубликуйте вопросы.';
   }
  }catch(e){s.error=e?.message||'Не удалось получить вопросы'}
  finally{if(token===seq&&session===s){s.loading=false;paint()}}
 }
 function init(){
  const dialog=el('cardPlayDialog');if(!dialog)return;
  dialog.addEventListener('close',()=>{if(session)clearTimeout(session.secretTimer);++seq;session=null;el('cardPlayScreen').replaceChildren()});
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
   if(button.hasAttribute('data-card-geo-choice')){
    const pair=button.dataset.cardGeoChoice.split(':');s.geoPicks.set(Number(pair[0]),pair.slice(1).join(':'));paint();return;
   }
   if(button.hasAttribute('data-card-confirm')){s.step=Math.min(s.step+1,stages(s).length-1);paint();return}
   if(s.card.settings?.arcade_mode==='sequence_memory'&&s.view==='player'&&stages(s)[s.step]?.kind==='secret-answer'&&!s.secretSubmitted){
    if(button.hasAttribute('data-card-secret-choice')&&s.secretAnswer.length<s.secretCode.length){
     const choice=button.dataset.cardSecretChoice;
     if(s.secretTemplate.palette.includes(choice)){s.secretAnswer.push(choice);paint()}
     return;
    }
    if(button.hasAttribute('data-card-secret-undo')){s.secretAnswer.pop();paint();return}
    if(button.hasAttribute('data-card-secret-submit')&&s.secretAnswer.length===s.secretCode.length){
     s.secretExact=s.secretAnswer.filter((id,i)=>id===s.secretCode[i]).length;
     s.secretPoints=s.secretExact===s.secretCode.length?10:s.secretExact===s.secretCode.length-1?6:
      s.secretExact>=Math.ceil(s.secretCode.length/2)?3:0;
     s.secretSubmitted=true;s.step=3;paint();return;
    }
   }
   if(button.hasAttribute('data-card-tap')){s.taps+=1;const count=el('cardPlayScreen')?.querySelector('.card-play-tap-art strong');if(count)count.textContent=String(s.taps);return}
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
   const current=stages(session)[session.step];if(current?.kind!=='geo-question'||session.geoQuestions[current.i]?.mode!=='locate')return;
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