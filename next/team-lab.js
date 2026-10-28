'use strict';
/* Two-team instructor versus bot experiment.
 * Six virtual players exist only in this browser. No room join, score writes,
 * Realtime subscriptions, timers or polling. Read-only build and bank on Start.
 */
window.QwizTeamLab=(()=>{
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const sample=a=>a[Math.floor(Math.random()*a.length)];
 const shuffle=a=>{const out=a.slice();for(let i=out.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out};
 const modes={tug:'Тап-баттл',captain:'Мэмори капитанов',blitz:'Блиц-консенсус'};
 const effects={headstart:['Фора +12',12],teamwork:['Командный рывок',9],momentum:['Импульс +15%',null],fog:['Туман соперника −5',-5],storm:['Штормовой заслон −8',-8],drain:['Энергетический отток −12',-12]};
 let adapter=null,run=null,busy=false,serial=0,initialized=false,reloading=false,loadErrorText='';
 const team=i=>run.teams[i];
 const label=(k)=>effects[k]?.[0]||k;
 function setMessage(text,error=false){const el=$('teamLabMessage');if(el){el.textContent=text;el.classList.toggle('error',error)}}
 function open(){
  const v=$('teamLabStage');v.hidden=false;$('teamLabIdle').hidden=true;
  $('teamLabStop').hidden=false;$('teamLabNext').hidden=false;
 }
 function close(){
  run=null;$('teamLabStage').hidden=true;$('teamLabIdle').hidden=false;
  $('teamLabStop').hidden=true;$('teamLabNext').hidden=true;
  $('teamLabNext').disabled=true;$('teamLabPrev').disabled=true;$('teamLabStatus').textContent='Модуль остановлен';
  setMessage('Тест остановлен. Настоящая комната не изменена.');
 }
 function refreshBuilds(){
  const select=$('teamLabBuild');if(!select||!adapter)return;
  const start=$('teamLabStart'),retry=$('teamLabRetry'),previous=select.value;
  const ready=adapter.ready?.()!==false;
  const builds=ready?(adapter.builds()||[]).filter(b=>b?.id):[];
  select.replaceChildren();
  if(!ready){
   select.add(new Option(loadErrorText?'Не удалось загрузить сборки':'Загрузка сохранённых сборок…',''));
   select.disabled=true;start.disabled=true;retry.hidden=!loadErrorText;
   if(loadErrorText)setMessage('Ошибка загрузки сборок: '+loadErrorText+' Нажмите «Обновить список».',true);
   return;
  }
  loadErrorText='';
  select.add(new Option(builds.length?'Выберите сохранённую сборку':'Нет сохранённых сборок',''));
  for(const build of builds)select.add(new Option(String(build.title||build.name||'Без названия'),String(build.id)));
  if(builds.some(b=>String(b.id)===previous))select.value=previous;
  else if(builds.length)select.value=String(builds[0].id);
  select.disabled=!!run||!builds.length;
  start.disabled=busy||!builds.length;
  retry.hidden=!!builds.length;
  if(!run&&!busy){
   if(builds.length)setMessage('Сборка доступна. Запустите тест: 3 игрока против 3 виртуальных соперников.');
   else setMessage('Сохранённых сборок пока нет. Создайте и сохраните игру в конструкторе, затем нажмите «Обновить список».');
  }
 }
 function loadError(error){
  loadErrorText=String(error?.message||error||'Сервер не ответил').slice(0,260);
  if(!run)refreshBuilds();
 }
 async function retryBuilds(){
  if(reloading||busy||run)return;
  const button=$('teamLabRetry');
  reloading=true;button.disabled=true;button.textContent='Обновляем…';
  setMessage('Повторно запрашиваем сохранённые сборки.');
  try{
   if(!adapter?.reload)throw Error('Обновление недоступно. Перезагрузите кабинет.');
   await adapter.reload();refreshBuilds();
  }catch(error){loadError(error)}
  finally{reloading=false;button.disabled=false;button.textContent='↻ Обновить список'}
 }
 function readQuestion(q,card,index){
  const options=Array.isArray(q.options)?q.options:[];
  const sol=q.solution||{};
  const kind=q.kind||'single';
  if(kind==='order'||kind==='sequence'||kind==='match'||sol.flag_assembly||sol.flag_memory)return null;
  const keys=Array.isArray(sol.correct_indices)?sol.correct_indices:Number.isInteger(sol.correct)?[sol.correct]:Number.isInteger(q.correct)?[q.correct]:[];
  const valid=keys.filter(n=>Number.isInteger(n)&&n>=0&&n<options.length);
  if(options.length<2||!valid.length)return null;
  // Keep each original option ID stable even though labels/positions are shuffled.
  const normalized=shuffle(options.map((value,i)=>({id:String(i),value})));
  return{kind:'question',title:card.title||'Раунд',prompt:String(q.prompt||'Вопрос'),
   options:normalized,correct:valid.map(String),multi:valid.length>1,explanation:String(q.explanation||''),
   media:typeof sol.media_url==='string'?sol.media_url:typeof sol.illustration_url==='string'?sol.illustration_url:'',
   original:index,source:'bank'};
 }
 function geoQuestions(q,card){
  if(q.mode==='locate'){
   // The teacher/bot duel uses a factual 4-name choice for this map task.
   // It does not pretend to replicate map-click geometry.
   const extra=shuffle(run.geoCatalog.filter(r=>r.id!==q.region)).slice(0,3);
   const opts=shuffle([{id:q.region,value:q.regionName},...extra.map(x=>({id:x.id,value:x.name}))]);
   return{kind:'question',title:card.title||'География России',prompt:q.prompt+' (название субъекта)',
    options:opts,correct:[q.region],multi:false,explanation:'В симуляции выбор региона заменён четырьмя названиями; настоящая карта работает отдельно.',source:'geo'};
  }
  return{kind:'question',title:card.title||'География России',prompt:q.prompt,
   options:q.options.map(o=>({id:String(o.id),value:o.text})),correct:[String(q.correctId)],
   multi:false,explanation:q.explanation||'',flag:q.flag||'',clues:q.clues||[],source:'geo'};
 }
 async function eventsFor(cards,callbacks){
  const events=[],warnings=[];
  for(const [cardIndex,card] of cards.entries()){
   if(!card||['intro','break','finale','team_stats','player_stats'].includes(card.type))continue;
   const mode=card.settings?.arcade_mode;
   if(modes[mode]){
    events.push({kind:'arcade',mode,title:card.title||modes[mode],settings:card.settings||{},cardIndex});
   }else if(mode==='russia_map'){
    if(!run.geoCatalog){run.geoCatalog=await callbacks.catalog();run.geoMap=await callbacks.map()}
    const geo=window.QwizCardGeoPreview.build({card,catalog:run.geoCatalog,geometry:run.geoMap});
    for(const g of geo)events.push({...geoQuestions(g,card),cardIndex});
   }else if(card.type==='round'){
    if(!card.topic_id){warnings.push('Карточка «'+(card.title||'Раунд')+'» не имеет темы');continue}
    const questions=await callbacks.questions(card);
    let skipped=0;
    for(const [index,q] of (questions||[]).entries()){
     const item=readQuestion(q,card,index);
     if(item)events.push({...item,cardIndex});else skipped++;
    }
    if(skipped)warnings.push('«'+(card.title||'Раунд')+'»: '+skipped+' сложных/неполных заданий не моделируются (порядок, сборка, память или отсутствует ключ)');
   }
  }
  return{events,warnings};
 }
 function active(){return run?.events[run.index]}
 function resetActivity(event){
  run.answer=new Set();run.submitted=false;run.feedback='';run.arcadeResult=null;
  run.taps=[0,0];run.matches=[0,0];run.blitzChoices=[null,null];
  run.pendingVote=null;run.strategy=null;run.boost=null;run.strategyVotes=[];run.optionVotes=[];
  if(event?.kind==='question'&&run.pendingEffect){
   const effect=run.pendingEffect;run.pendingEffect=null;
   const t=team(effect.target),before=t.score;
   const amount=effect.key==='momentum'?Math.min(30,Math.max(5,Math.round(before*.15))):
     effect.key==='teamwork'?Math.min(24,3*t.members):effects[effect.key]?.[1]||0;
   t.score=Math.max(0,before+amount);
   const actual=t.score-before;
   log('Перед вопросом: '+t.name+' · '+label(effect.key)+' · '+(actual>=0?'+':'')+actual+' очков');
  }
 }
 function log(text){run.log.unshift(text);run.log=run.log.slice(0,14)}
 const scoreOption=(o)=>{
  const v=o?.value;
  if(typeof v==='string')return esc(v);
  if(v&&typeof v==='object'){
   if(typeof v.image_url==='string'&&/^https:\/\//i.test(v.image_url))
    return '<img class="team-lab-flag" src="'+esc(v.image_url)+'" alt="Изображение варианта" loading="lazy" decoding="async">'+(v.label?'<small>'+esc(v.label)+'</small>':'');
   if(Array.isArray(v.stripes)&&v.stripes.every(s=>/^#[0-9a-fA-F]{6}$/.test(s))){
    return '<span class="team-lab-stripes">'+v.stripes.map(color=>'<span style="background:'+color+'"></span>').join('')+'</span>';
   }
   return esc(v.label||v.text||'Вариант');
  }
  return esc(v);
 };
 function questionBody(e){
  const correct=new Set(e.correct);
  const media=e.media&&/^https:\/\//i.test(e.media)?'<img class="team-lab-figure" src="'+esc(e.media)+'" alt="Иллюстрация вопроса" loading="lazy">':'';
  const flag=e.flag&&/^[\w.-]{1,140}$/.test(e.flag)?'<img class="team-lab-figure" src="https://raw.githubusercontent.com/russian-flags/regions/3c411c7b305c678c49798cc610538c66108adbde/assets/'+encodeURIComponent(e.flag)+'/index.svg" alt="Флаг региона">':'';
  const clues=e.clues?.length?'<div class="team-lab-clues">'+e.clues.map(s=>'<span>'+esc(s)+'</span>').join('')+'</div>':'';
  const options=e.options.map((o,i)=>{
   const selected=run.answer.has(o.id),right=correct.has(o.id);
   const style=run.submitted?(right?' is-correct':selected?' is-wrong':''):selected?' is-picked':'';
   return '<button type="button" class="team-lab-answer'+style+'" data-lab-answer="'+esc(o.id)+'"'+(run.submitted?' disabled':'')+' aria-pressed="'+selected+'">'+
    '<span class="team-lab-letter">'+String.fromCharCode(65+i)+'</span><span class="team-lab-option">'+scoreOption(o)+'</span></button>';
  }).join('');
  return '<div class="team-lab-prompt"><span class="team-lab-eyebrow">'+esc(e.title)+' · '+(e.multi?'НЕСКОЛЬКО ОТВЕТОВ':'ОДИН ОТВЕТ')+'</span><h4>'+esc(e.prompt)+'</h4>'+clues+media+flag+'</div>'+
   '<div class="team-lab-options">'+options+'</div>'+
   (run.submitted?'<p class="team-lab-feedback" role="status">'+esc(run.feedback)+(e.explanation?' '+esc(e.explanation):'')+'</p>':
    '<button type="button" class="team-lab-primary" data-lab-submit '+(!run.answer.size?'disabled':'')+'>Ответить за трёх игроков</button>');
 }
 function arcadeBody(e){
  const isTug=e.mode==='tug',isCaptain=e.mode==='captain';
  const label=e.mode==='blitz'?'Блиц-консенсус':isCaptain?'Мэмори капитанов':'Тап-баттл';
  const c=isTug?run.taps:isCaptain?run.matches:run.blitzChoices;
  const metric=isTug?'нажатий команды':isCaptain?'найденных пар':'условный выбор';
  const teacherVal=isTug?c[0]:isCaptain?c[0]+'/6':c[0]===null?'—':String.fromCharCode(65+c[0]);
  const botVal=isTug?c[1]:isCaptain?c[1]+'/6':c[1]===null?'—':String.fromCharCode(65+c[1]);
  return '<div class="team-lab-prompt"><span class="team-lab-eyebrow">КОМАНДНАЯ МЕХАНИКА</span><h4>'+esc(label)+'</h4><p>Облегчённая модель действий: без таймера, сетевого соревнования и реальных результатов.</p></div>'+
   '<div class="team-lab-arcade-scores"><div><b>'+esc(teacherVal)+'</b><small>'+esc(metric)+'</small></div><div><b>'+esc(botVal)+'</b><small>'+esc(metric)+'</small></div></div>'+
   (isTug?'<button type="button" class="team-lab-big-tap" data-lab-tap'+(run.arcadeResult?' disabled':'')+'>НАЖАТЬ × 3</button><p class="team-lab-help">Одно нажатие преподавателя = по нажатию от каждого из трёх игроков. Команда соперника нажимает случайно.</p>':
   isCaptain?'<button type="button" class="team-lab-primary" data-lab-pair '+(c[0]>=6||run.arcadeResult?'disabled':'')+'>Найти следующую пару</button><p class="team-lab-help">Считаются найденные пары, а не скорость реального 3D-поля. Соперник продвигается случайно.</p>':
   '<div class="team-lab-blitz">'+['A','B','C','D'].map((c,i)=>'<button type="button" data-lab-blitz="'+i+'" '+(run.arcadeResult?'disabled':'')+' class="'+(run.blitzChoices[0]===i?' is-picked':'')+'">Ответ '+c+'</button>').join('')+'</div>'+
   '<p class="team-lab-help">Условный блиц: голос всей левой команды одинаков. Это проверка голосования, не конкретного вопроса банка.</p>')+
   (run.arcadeResult?'<div class="team-lab-feedback">'+esc(run.feedback)+'</div>':
    '<label class="team-lab-override">Победа в модели <select id="teamLabWinner"><option value="auto">По результату</option><option value="0">Команда преподавателя</option><option value="1">Случайная команда</option></select></label>'+
    '<button type="button" class="team-lab-primary" data-lab-resolve>Завершить мини-игру</button>');
 }
 function bonusBody(){
  const v=run.arcadeResult;if(!v)return '';
  const bot=v.winner===1,winner=team(v.winner);
  const names=k=>k==='support'?'Усилить себя':k==='sabotage'?'Ослабить соперника':label(k);
  const tally=(votes,keys)=>'<div class="team-lab-sandbox-votes">'+
   (run.strategy&&run.strategyVotes.length?
    '<div class="team-lab-strategy-summary">Голоса за стратегию '+esc(run.strategy==='support'?'усилить себя':'ослабить соперника')+
     ' <strong>'+run.strategyVotes.filter(v=>v===run.strategy).length+'/3</strong></div>':'')+keys.map(k=>
   '<div>'+esc(names(k))+' <strong>'+votes.filter(x=>x===k).length+'/3</strong></div>').join('')+'</div>';
  const info='<p class="team-lab-help">Большинство: минимум 2 из 3 одинаковых голосов. В настоящей комнате голосует только команда-победитель.</p>';
  if(!run.strategy)return '<div class="team-lab-prompt"><span class="team-lab-eyebrow">БОНУС · ЭТАП 1 / 2</span><h4>Усилить себя или ослабить соперника?</h4>'+
    '<p>Победитель: '+esc(winner.name)+'. '+(bot?'Откройте три отдельных голоса системы.':'Одно ваше решение повторяют трое игроков.')+'</p></div>'+
    (bot?'<button type="button" class="team-lab-primary" data-lab-bot-vote="strategy">Показать голоса случайной команды</button>':
    '<div class="team-lab-strategies"><button type="button" data-lab-strategy="support">Усилить себя</button><button type="button" data-lab-strategy="sabotage">Ослабить соперника</button></div>')+
    tally(run.strategyVotes,['support','sabotage'])+info;
  const opts=run.strategy==='sabotage'?['fog','storm','drain']:['headstart','teamwork','momentum'];
  return '<div class="team-lab-prompt"><span class="team-lab-eyebrow">БОНУС · ЭТАП 2 / 2</span><h4>'+
    esc(run.strategy==='support'?'Выберите конкретное усиление':'Выберите конкретный штраф')+'</h4><p>Решение первого этапа: '+
    esc(names(run.strategy))+' — '+run.strategyVotes.filter(x=>x===run.strategy).length+'/3 голосов.</p></div>'+
    (bot?'<button type="button" class="team-lab-primary" data-lab-bot-vote="option">Показать выбор трёх игроков системы</button>':
    '<div class="team-lab-strategies">'+opts.map(key=>'<button type="button" data-lab-boost="'+key+'"><strong>'+esc(label(key))+'</strong><small>'+
    esc(window.QwizBonusExplorer?.effects.find(x=>x.id===key)?.detail||'Применение в следующем раунде')+'</small></button>').join('')+'</div>')+
    tally(run.optionVotes,opts)+info;
 }
 function stats(){
  $('teamLabTeacherScore').textContent=String(team(0).score);
  $('teamLabBotScore').textContent=String(team(1).score);
  $('teamLabTeacherMembers').textContent='Преподаватель + 2 копии · 3 игрока';
  $('teamLabBotMembers').textContent='3 виртуальных соперника · случайные ответы';
  $('teamLabHistory').innerHTML=run.log.length?run.log.map(x=>'<li>'+esc(x)+'</li>').join(''):'<li>События появятся после ответов.</li>';
 }
 function draw(){
  if(!run)return;
  const e=active();if(!e){
   $('teamLabStageBody').innerHTML='<p class="team-lab-completed">Тест завершён. Можно проверить бонусы и штрафы в лаборатории выше, увидеть расчёт и применить его к тестовому счёту. Для нового эксперимента нажмите «Запустить тест».</p>';
   $('teamLabNext').disabled=true;$('teamLabPrev').disabled=!run.moments.length;
   $('teamLabStatus').textContent='Финиш';
   $('teamLabBonusCheck').textContent='Это конец сборки: игровой бонус на следующем раунде уже невозможен. Лаборатория эффектов выше позволяет отдельно увидеть голосование и последствия.';
   stats();return;
  }
  $('teamLabStatus').textContent='Этап '+(run.index+1)+' / '+run.events.length+' · '+(e.kind==='arcade'?'Мини-игра':'Вопрос');
  // Teacher owns navigation: unanswered questions and unfinished mini-games may be skipped.
  $('teamLabNext').disabled=run.phase==='bonus';
  $('teamLabPrev').disabled=!run.moments?.length;
  $('teamLabNext').textContent=run.index===run.events.length-1?'К итогам →':'Следующий вопрос / этап →';
  $('teamLabStageBody').innerHTML=run.phase==='bonus'?bonusBody():e.kind==='arcade'?arcadeBody(e):questionBody(e);
  const banner=$('teamLabBonusCheck');
  if(banner){
   const count=run.events.filter(x=>x.kind==='arcade').length;
   banner.textContent=!count?'В этой сборке нет мини-игр: автоматических бонусных голосований не будет. Для изучения всех эффектов воспользуйтесь лабораторией выше.':
    run.phase==='bonus'?'Идёт голосование команды-победителя: нужно большинство по стратегии и конкретному эффекту.':
    e.kind==='arcade'?'Чтобы заработать бонус: завершите мини-игру, выполните условия режима, затем пройдите оба этапа голосования.':
    run.pendingEffect?'Ожидает следующего обычного раунда: '+label(run.pendingEffect.key):
    'В сборке '+count+' мини-игр. Бонусы открываются по условиям серверной механики. Лаборатория выше доступна в любое время.';
  }
  stats();
 }
 function submitAnswer(){
  const e=active();if(!e||e.kind!=='question'||run.submitted||!run.answer.size)return;
  const solution=new Set(e.correct),teacherCorrect=solution.size===run.answer.size&&[...solution].every(k=>run.answer.has(k));
  const options=e.options.map(x=>x.id);
  const each=Array.from({length:3},()=>{const selected=e.multi?shuffle(options).slice(0,solution.size):[sample(options)];return selected.length===solution.size&&selected.every(k=>solution.has(k))});
  const botCorrect=each.filter(Boolean).length;
  const points=[teacherCorrect?30:0,botCorrect*10];
  team(0).score+=points[0];team(1).score+=points[1];
  run.feedback='Вы: '+(teacherCorrect?'верно, +30':'неверно, +0')+'. Соперники: '+botCorrect+'/3 верных, +'+points[1]+'.';
  run.submitted=true;
  log(e.title+': '+run.feedback);
  draw();
 }
 function resolveArcade(){
  const e=active();if(!e||e.kind!=='arcade'||run.arcadeResult)return;
  const forced=$('teamLabWinner')?.value||'auto';
  let points;
  if(e.mode==='tug')points=run.taps.slice();
  else if(e.mode==='captain')points=run.matches.map(v=>v*5);
  else{
   // An abstract consensus choice can be tested, but cannot establish real answer correctness.
   points=[run.blitzChoices[0]===null?0:10,run.blitzChoices[1]===null?0:10];
  }
  let winner=forced==='auto'?(points[0]===points[1]?sample([0,1]):points[0]>points[1]?0:1):Number(forced);
  if(![0,1].includes(winner))winner=0;
  const settings=e.settings||{};
  const configured=Number(settings.arcade_score_points);
  const reward=Number.isInteger(configured)&&configured>=0&&configured<=200?configured:(e.mode==='blitz'?10:15);
  // Local abstraction only: in a live Blitz, points go to each correct team, not to this simulated winner.
  team(winner).score+=reward;
  const lead=Math.max(0,Math.min(200,Number.isFinite(Number(settings.bonus_lead))&&settings.bonus_lead!==undefined?Number(settings.bonus_lead):15));
  const participation=Math.max(50,Math.min(100,Number.isFinite(Number(settings.bonus_percent))?Number(settings.bonus_percent):70));
  const minPoints=Math.max(1,Math.min(e.mode==='blitz'?10:200,Number.isFinite(Number(settings.bonus_min_points))?Number(settings.bonus_min_points):1));
  const activated=e.mode==='tug'?((winner===0?run.taps[0]:run.taps[1])>0?3:0):
    e.mode==='captain'?((winner===0?run.matches[0]:run.matches[1])>0?1:0):
    e.mode==='blitz'?((winner===0?run.blitzChoices[0]:run.blitzChoices[1])!=null?1:0):0;
  // Mirrors live qwiz_bonus_eligible: point >=1, delegate/team participation,
  // normal gap except blitz and a separately following ordinary round.
  const enough=points[winner]>=minPoints&&(e.mode==='blitz'?points[winner]>=points[1-winner]:points[winner]-points[1-winner]>=lead)&&
    (['captain','blitz'].includes(e.mode)?activated>=1:activated*100>=participation*3);
  const overridden=$('teamLabForceBonus')?.checked===true;
  const hasNextQuestion=run.events.slice(run.index+1).some(event=>event.kind==='question'&&
    (e.cardIndex===undefined||event.cardIndex===undefined||event.cardIndex>e.cardIndex));
  const canBoost=hasNextQuestion&&(enough||overridden);
  run.arcadeResult={winner,points,canBoost,eligible:enough,participation,lead,activated,hasNextQuestion};
  run.feedback=team(winner).name+' побеждает (локальная модель), +'+reward+' баллов в рейтинг. '+
    (canBoost?(overridden&&!enough?'Только в симуляции сняты условия допуска.':'Условия допуска выполнены; команда может голосовать.') :
    'Бонус недоступен: '+(!hasNextQuestion?'после этой мини-игры нет следующего обычного раунда вопросов.':
    points[winner]<minPoints?'результат меньше '+minPoints+' игровых очков.':
    activated===0||e.mode==='tug'&&activated*100<participation*3?'не выполнен порог активности команды.':
    'разница результатов меньше '+lead+' очков.'));
  log(run.feedback);
  draw();
 }
 function remember(){
  if(!run)return;
  run.moments.push({index:run.index,phase:run.phase,scores:run.teams.map(t=>t.score),
   log:run.log.slice(),pendingEffect:run.pendingEffect?{...run.pendingEffect}:null,
   answer:[...run.answer],submitted:run.submitted,feedback:run.feedback,
   taps:run.taps.slice(),matches:run.matches.slice(),blitzChoices:run.blitzChoices.slice(),
   arcadeResult:run.arcadeResult?{...run.arcadeResult}:null,strategy:run.strategy,strategyVotes:run.strategyVotes.slice(),optionVotes:run.optionVotes.slice()});
 }
 function previous(){
  if(!run?.moments.length)return;
  const x=run.moments.pop();
  run.index=x.index;run.phase=x.phase;run.log=x.log;run.pendingEffect=x.pendingEffect;
  run.teams.forEach((t,i)=>t.score=x.scores[i]);run.answer=new Set(x.answer);
  run.submitted=x.submitted;run.feedback=x.feedback;run.taps=x.taps;run.matches=x.matches;
  run.blitzChoices=x.blitzChoices;run.arcadeResult=x.arcadeResult;run.strategy=x.strategy;run.strategyVotes=x.strategyVotes||[];run.optionVotes=x.optionVotes||[];
  draw();
 }
 function next(){
  if(!run)return;
  const e=active();if(!e)return;
  if((e.kind==='question'&&!run.submitted)||(e.kind==='arcade'&&!run.arcadeResult)){
   remember();log((e.kind==='question'?'Вопрос пропущен: ':'Мини-игра пропущена: ')+
    (e.title||'Без названия')+'. Баллы не начислялись.');
   run.index++;run.phase='play';resetActivity(active());draw();return;
  }
  if(e.kind==='arcade'&&run.arcadeResult.canBoost&&!run.arcadeResult.boostDone){
   remember();run.phase='bonus';run.arcadeResult.boostDone=true;
   // Show both voting steps for the bot as well as for the teacher.
   draw();return;
  }
  remember();run.index++;run.phase='play';resetActivity(active());draw();
 }
 function setEffect(key){
  const result=run.arcadeResult;if(!result||!effects[key])return;
  const winner=result.winner,penalty=['fog','storm','drain'].includes(key);
  remember();if(!run.optionVotes.length)run.optionVotes=[key,key,key];run.pendingEffect={target:penalty?1-winner:winner,key};
  log(team(winner).name+' выбирает '+label(key)+' → '+team(run.pendingEffect.target).name+'. Эффект ожидает следующий вопрос.');
  run.phase='play';
  run.index++;resetActivity(active());draw();
 }
 function handle(e){
  const b=e.target.closest('button[data-lab-answer],button[data-lab-submit],button[data-lab-tap],button[data-lab-pair],button[data-lab-blitz],button[data-lab-resolve],button[data-lab-strategy],button[data-lab-boost],button[data-lab-bot-vote]');
  if(!b||!run)return;
  const item=active();
  if(b.hasAttribute('data-lab-answer')&&!run.submitted&&item?.kind==='question'){
   const id=b.dataset.labAnswer;
   if(!item.multi)run.answer.clear();
   if(item.multi&&run.answer.has(id))run.answer.delete(id);else run.answer.add(id);
   draw();
  }else if(b.hasAttribute('data-lab-submit'))submitAnswer();
  else if(b.hasAttribute('data-lab-tap')&&item?.mode==='tug'&&!run.arcadeResult){
   run.taps[0]+=3;run.taps[1]+=Math.floor(Math.random()*4);
   // Keep the pressed button mounted on high-frequency inputs.
   const fields=$('teamLabStageBody').querySelectorAll('.team-lab-arcade-scores b');
   if(fields.length===2){fields[0].textContent=run.taps[0];fields[1].textContent=run.taps[1]}
  }else if(b.hasAttribute('data-lab-pair')&&item?.mode==='captain'&&!run.arcadeResult){
   run.matches[0]=Math.min(6,run.matches[0]+1);run.matches[1]=Math.min(6,run.matches[1]+Math.floor(Math.random()*2));draw();
  }else if(b.hasAttribute('data-lab-blitz')&&item?.mode==='blitz'&&!run.arcadeResult){
   run.blitzChoices=[Number(b.dataset.labBlitz),Math.floor(Math.random()*4)];draw();
  }else if(b.hasAttribute('data-lab-resolve'))resolveArcade();
  else if(b.hasAttribute('data-lab-strategy')&&run.phase==='bonus'){
   run.strategy=b.dataset.labStrategy;run.strategyVotes=[run.strategy,run.strategy,run.strategy];draw();
  }else if(b.hasAttribute('data-lab-bot-vote')&&run.phase==='bonus'&&run.arcadeResult?.winner===1){
   if(b.dataset.labBotVote==='strategy'&&!run.strategy){
    const votes=Array.from({length:3},()=>sample(['support','sabotage']));run.strategyVotes=votes;
    run.strategy=['support','sabotage'].find(choice=>votes.filter(x=>x===choice).length>=2)||null;
    if(!run.strategy){log('Три голоса разделились: без большинства по стратегии бонус не получен.');run.phase='play';run.index++;resetActivity(active())}
    draw();
   }else if(b.dataset.labBotVote==='option'&&run.strategy){
    const opts=run.strategy==='support'?['headstart','teamwork','momentum']:['fog','storm','drain'];
    const votes=Array.from({length:3},()=>sample(opts));run.optionVotes=votes;
    const majority=opts.find(choice=>votes.filter(x=>x===choice).length>=2);
    if(!majority){log('Соперник не собрал большинство по эффекту: баллы без изменений.');run.phase='play';run.index++;resetActivity(active());draw()}
    else setEffect(majority);
   }
  }else if(b.hasAttribute('data-lab-boost')&&run.phase==='bonus'){
   const key=b.dataset.labBoost;if(!effects[key])return;
   if((run.strategy==='sabotage')!==['fog','storm','drain'].includes(key))return;
   setEffect(key);
  }
 }
 async function start(){
  if(busy)return;
  const id=$('teamLabBuild').value;
  if(!id){setMessage('Выберите сохранённую сборку для тестирования.',true);return}
  busy=true;const token=++serial;
  const btn=$('teamLabStart');btn.disabled=true;btn.textContent='Загрузка вопросов…';
  setMessage('Читаем сохранённую сборку и вопросы один раз. Комната не затрагивается.');
  try{
   const result=await adapter.build(id);
   if(token!==serial)return;
   const cards=(result.cards||[]).filter(Boolean);
   run={events:[],index:0,phase:'play',log:[],moments:[],geoCatalog:null,geoMap:null,
    pendingEffect:null,teams:[{name:'Команда преподавателя',members:3,score:0},{name:'Случайная команда',members:3,score:0}]};
   const compiled=await eventsFor(cards,adapter);
   if(token!==serial)return;
   if(!compiled.events.length)throw Error('В сборке нет вопросов или поддерживаемых мини-игр для тестирования.');
   run.events=compiled.events;resetActivity(active());open();draw();
   setMessage('Локальный эксперимент: 3 против 3, без создания игроков и серверных начислений.'+
    (compiled.warnings.length?' Пропущено: '+compiled.warnings.join('; '):''));
  }catch(error){
   if(token===serial){run=null;setMessage('Тест не запущен: '+(error?.message||'Ошибка загрузки'),true)}
  }finally{if(token===serial){busy=false;btn.disabled=false;btn.textContent='▶ Запустить тест';refreshBuilds()}}
 }
 function init(callbacks){
  adapter=callbacks;
  const root=$('teamLab');if(!root)return;
  if(initialized){refreshBuilds();return}
  initialized=true;
  $('teamLabStart').addEventListener('click',start);
  $('teamLabRetry').addEventListener('click',retryBuilds);
  $('teamLabNext').addEventListener('click',next);
  $('teamLabPrev').addEventListener('click',previous);
  $('teamLabStop').addEventListener('click',()=>{serial++;close();refreshBuilds()});
  $('teamLabStageBody').addEventListener('click',handle);
  window.QwizBonusExplorer?.init();
  refreshBuilds();
 }
 function applyDemoEffect({key,target}){
  if(!run)return {ok:false,message:'Сначала запустите сохранённую сборку, чтобы менять именно тестовый счёт.'};
  if(!Object.prototype.hasOwnProperty.call(effects,key)||![0,1].includes(target))return {ok:false,message:'Неизвестный эффект.'};
  const before=team(target).score,members=team(target).members;
  const delta=window.QwizBonusExplorer?.calc(key,before,members);
  if(!Number.isFinite(delta))return {ok:false,message:'Формула эффекта недоступна.'};
  team(target).score=Math.max(0,before+delta);
  log('ДЕМОНСТРАЦИЯ (не игровой раунд): '+team(target).name+' · '+label(key)+' · '+(delta>0?'+':'')+delta+' очков · '+before+' → '+team(target).score);
  stats();return {ok:true,before,delta,after:team(target).score};
 }
 function snapshot(){return run?{index:run.index,phase:run.phase,scores:run.teams.map(t=>t.score),length:run.events.length,
  pending:run.pendingEffect?.key||null,log:run.log.slice(),kind:active()?.kind,answered:run.submitted}:null}
 return Object.freeze({init,refreshBuilds,loadError,snapshot,applyDemoEffect});
})();
