'use strict';
/* QWIZ-PARTY: synchronised team arcade. Client shows state; Postgres owns scores, boosts and achievements. */
window.QwizArcade=(()=>{
 const META={
  blitz:{title:'Блиц-консенсус',desc:'Сначала голосует каждый участник. Затем капитан видит мнения команды и выбирает окончательный ответ.',cta:'ГОЛОСОВАТЬ'},
  tug:{title:'Тап-баттл',desc:'Все участники нажимают кнопку одновременно. Считаются реальные суммарные нажатия всей команды, а не среднее значение на человека.',cta:'ТАП!'},
  captain:{title:'Мэмори капитанов',desc:'Открывайте по две плитки и собирайте пары. Быстрее всех!',cta:'ОТКРЫТЬ ПЛИТКУ'},
   sequence_memory:{title:'Секретный код',desc:'Запомните последовательность символов и воспроизведите весь порядок. Каждый участник играет за свою команду.',cta:'ПОДТВЕРДИТЬ'}
 };
 const COLORS=['#9470e2','#b58add','#e6a95d','#76ad83','#ea7f9b','#a78be5','#bb86c8'];
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const BOOSTS=[['headstart','Фора +12','+12 очков вашей команде'],['teamwork','Командный рывок','+3 за каждого участника, до 24'],['momentum','Импульс','+15% к текущим очкам, до 30']];
 const HINDRANCES=[['fog','Туман соперника','−5 очков главному сопернику'],['storm','Штормовой заслон','−8 очков главному сопернику'],['drain','Энергетический отток','−12 очков главному сопернику']];
 const STRATEGIES=[['support','Зелёный маршрут','Усиление собственной команды'],['sabotage','Красный манёвр','Ограничение для главного соперника']];
 const ALL_VOTES=[...BOOSTS,...HINDRANCES,...STRATEGIES];
 // Clear vector identity: green shield helps our team, red target hinders a rival.
 function strategyIcon(id){
  if(id!=='support'&&id!=='sabotage')return '';
  const inner=id==='support'
   ?'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'
   :'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>';
  return '<span class="arcade-strategy-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+inner+'</svg></span>';
 }

  const ui={player:null,screen:null,host:null};let wallet={code:null,client:null,roomId:null,lastFetch:0,busy:false,view:null};
 const isArcade=a=>!!META[a?.settings?.arcade_mode];
 function modeTitle(mode){return META[mode]?.title||'Командная игра'}
 const currentTime=tr=>Date.now()+(tr.offset||0);
 // Avoid ambiguous operator precedence: timestamps are always milliseconds.
 const left=(end,tr)=>Math.max(0,Math.ceil(((Date.parse(end)||0)-currentTime(tr))/1000));
 function art(mode){
  // A real CSS-3D stage (multiple independently transformed depth planes),
  // rather than a flat emoji or an image with a perspective filter.
  const ground='<span class="arcade-3d-horizon" aria-hidden="true"></span><span class="arcade-3d-shadow" aria-hidden="true"></span>';
  if(mode==='rocket')return '<div class="arcade-runner-world" role="img" aria-label="Пиксельный динозавр перепрыгивает кактусы"><div class="arcade-runner-sky"><i></i><i></i><i></i></div>'+
    '<div class="arcade-runner-character" data-runner-character><svg class="dino-pixel" viewBox="0 0 96 100" aria-hidden="true" shape-rendering="crispEdges">'+
    '<path d="M50 7H78V13H84V34H76V42H61V48H55V59H49V68H43V73H33V68H25V60H19V52H12V42H18V47H24V53H34V38H40V22H50Z" fill="#353544"/>'+
    '<path d="M64 18H71V25H64Z" fill="#faf9ff"/><path d="M66 19H70V23H66Z" fill="#282739"/>'+
    '<path d="M63 34H81V39H63Z" fill="#faf9ff"/><path d="M55 52H64V56H59V65H55Z" fill="#353544"/>'+
    '<g class="dino-leg-a" fill="#353544"><path d="M38 67H47V83H52V89H33V84H38Z"/></g>'+
    '<g class="dino-leg-b" fill="#353544"><path d="M52 65H61V82H67V89H49V84H52Z"/></g></svg></div>'+
    '<div class="arcade-runner-obstacle" data-runner-obstacle><svg viewBox="0 0 52 86" class="dino-cactus" shape-rendering="crispEdges" aria-hidden="true"><path d="M20 6H31V78H20Z M9 25H18V51H9Z M9 45H26V54H9Z M33 34H43V60H33Z M26 51H43V61H26Z M16 77H36V84H16Z" fill="#4c806c"/></svg></div><div class="arcade-runner-floor"></div><span class="arcade-runner-score" aria-hidden="true">ДИНО · ЗАБЕГ</span></div>';
  if(mode==='tug')return '<div class="arcade-tap-stage" aria-hidden="true"><div class="arcade-tap-glow"></div><span class="arcade-tap-sparks">✧　✦　✧</span></div>';
  if(mode==='sequence_memory')return '<div class="arcade-secret-scene" data-secret-stage role="status" aria-live="off"><span class="arcade-secret-eyebrow" data-secret-phase>ПОДГОТОВКА КОДА</span><span class="arcade-secret-symbol" data-secret-symbol>✦</span><span class="arcade-secret-progress" data-secret-progress>Синхронизация времени</span></div>';
  if(mode==='captain')return '<div class="arcade-memory-hero" aria-hidden="true"><div class="memory-stage"><span class="memory-stage-halo"></span><span class="memory-stage-card memory-stage-card-a"><i>◈</i></span><span class="memory-stage-card memory-stage-card-b"><i>✦</i></span><span class="memory-stage-card memory-stage-card-c"><i>◈</i></span><span class="memory-stage-card memory-stage-card-d"><i>✦</i></span></div></div>';
  return '<div class="consensus-hero" role="img" aria-label="Участники команды голосуют, капитан принимает решение">'+
    '<span class="consensus-hero-aura"></span>'+
    '<span class="consensus-hero-card consensus-hero-card-left"><b>A</b><i></i><i></i></span>'+
    '<span class="consensus-hero-card consensus-hero-card-center"><b>✓</b><i></i><i></i></span>'+
    '<span class="consensus-hero-card consensus-hero-card-right"><b>C</b><i></i><i></i></span>'+
    '<span class="consensus-hero-stars" aria-hidden="true">✦　✧　✦</span>'+
    '<span class="consensus-hero-label">ОДИН ВОПРОС · ОБЩЕЕ РЕШЕНИЕ</span></div>';
 }
 function rankMarkup(v){
  if(v?.mode==='blitz'){
   const totals=v.consensus?.team_progress||[];
   return '<div class="consensus-progress"><span class="arcade-kicker">КОМАНДЫ · ХОД ГОЛОСОВАНИЯ</span>'+
     totals.map(t=>'<div class="consensus-progress-row"><strong>'+escape(t.name)+'</strong>'+
      '<div class="consensus-progress-track"><span style="width:'+Math.min(100,100*Number(t.votes||0)/Math.max(1,Number(t.members||1)))+'%"></span></div>'+
      '<span>'+Number(t.votes||0)+'/'+Number(t.members||0)+'</span>'+
      (t.submitted?'<em>Ответ капитана принят</em>':'')+'</div>').join('')+'</div>';
  }
  const teams=v?.teams||[],max=Math.max(1,...teams.map(t=>Number(t.points)||0));
  return teams.map((t,i)=>{const d=(v.extra?.players||[]).find(p=>p.team_id===t.id);
   const score=v.mode==='sequence_memory'?Number(t.points||0).toFixed(1).replace(/\.0$/,'')+' / 10':v.mode==='captain'?(d?.completed_ms!=null?Math.ceil(d.completed_ms/1000)+' сек.':(d?.pairs||0)+'/6 пар'):
    v.mode==='rocket'?(d?.cleared||0)+' препятствий':v.mode==='tug'?Number(t.taps||0).toLocaleString('ru-RU')+' тапов':Math.round(Number(t.points)||0).toLocaleString('ru-RU');
   return '<div class="arcade-rank"><span class="arcade-rank-name" title="'+escape(t.name)+'">'+escape(t.name)+'</span><div class="arcade-rank-track"><div class="arcade-rank-fill" style="--arcade-value:'+Math.max(0,100*(Number(t.points)||0)/max).toFixed(2)+'%;--arcade-team-color:'+COLORS[i%COLORS.length]+'"></div></div><span class="arcade-rank-score">'+score+'</span></div>';}).join('');
 }
 function rootMarkup(mode,kind='player'){const m=META[mode];return '<div class="arcade-shell arcade-'+kind+(kind==='screen'?' arcade-projection':'')+'" data-arcade-root="'+mode+'">'+
  '<div class="arcade-head"><div><span class="arcade-kicker">QWIZ-PARTY · КОМАНДНОЕ ИСПЫТАНИЕ</span><h2>'+escape(m.title)+'</h2></div><span class="arcade-countdown" data-arcade-clock>—</span></div>'+
  '<p class="arcade-lead">'+escape(m.desc)+'</p><div class="arcade-scene">'+art(mode)+(kind==='screen'&&mode==='tug'?'<div class="arcade-projection-tap-button" aria-label="ЖМИ! — нажимайте кнопку на телефонах" role="img"><strong>ЖМИ!</strong><small>Нажимайте на телефонах</small></div>':'')+(kind==='player'&&['tug','rocket'].includes(mode)?'<button type="button" class="arcade-tap-btn '+(mode==='tug'?'arcade-tap-center':'arcade-runner-jump-btn')+'" data-arcade-tap disabled>'+escape(m.cta)+'</button>':'')+'</div>'+
  '<div data-arcade-question hidden></div>'+(mode==='sequence_memory'?'<section class="arcade-secret-panel" data-secret-panel role="region" aria-label="Восстановление секретного кода"></section>':'')+(mode==='captain'&&kind==='player'?'<div class="arcade-memory-info" data-memory-info role="status"></div><div class="arcade-memory-board" data-arcade-memory role="group" aria-label="Поле Мэмори"></div>':'')+'<section class="arcade-vote-transition" data-arcade-vote-transition role="status" hidden><span class="arcade-kicker">РЕЗУЛЬТАТЫ КОМАНД</span><strong>Подводим итоги</strong><p>Ожидаем следующего этапа голосования.</p></section><div class="arcade-ranks" data-arcade-ranks></div>'+
  (kind==='player'?(['tug','rocket'].includes(mode)?'':(['captain','blitz','sequence_memory'].includes(mode)?'':'<button type="button" class="arcade-tap-btn" data-arcade-tap disabled>'+escape(m.cta)+'</button>'))+(['captain','blitz','sequence_memory'].includes(mode)?'':'<span class="arcade-tap-caption" data-arcade-personal>Синхронизация с игровым сервером…</span>'):'')+
  '<div class="arcade-alert" role="status" aria-live="polite" data-arcade-alert>Подключаем результаты…</div><div class="arcade-badges" data-arcade-badges></div><section class="arcade-vote" data-arcade-vote hidden></section></div>'+
  (kind==='screen'?'<section class="arcade-vote-projection" data-arcade-vote-screen hidden role="region" aria-label="Голосование за бонус или штраф"></section>':'');
 }
 function stop(kind){const tr=ui[kind];if(!tr)return;if(tr.interval)clearTimeout(tr.interval);if(tr.clock)clearInterval(tr.clock);if(tr.flushTimer)clearTimeout(tr.flushTimer);if(tr.finalRefreshTimer)clearTimeout(tr.finalRefreshTimer);if(tr.messageTimer)clearTimeout(tr.messageTimer);if(tr.voteTimer)clearTimeout(tr.voteTimer);window.QwizSecretCode?.stop(tr);if(tr.onClick)tr.root?.removeEventListener('click',tr.onClick);if(tr.onPointerDown)tr.root?.removeEventListener('pointerdown',tr.onPointerDown);if(tr.memory)tr.memory.runId+=1;if(tr.voteDialog){if(tr.voteDialog.open)tr.voteDialog.close();tr.voteDialog.remove();tr.voteDialog=null;}tr.closed=true;ui[kind]=null;}
 async function fetchState(tr){if(tr.closed||tr.fetching||!navigator.onLine)return;tr.fetching=true;const id=tr.key;
  try{
   // Abort a stalled snapshot read; otherwise 'fetching' could stay true forever.
   const ac=new AbortController();
   const query=tr.client.rpc('qwiz_party_arcade',{p_code:tr.code});
   const request=typeof query?.abortSignal==='function'?query.abortSignal(ac.signal):query;
   let timeout;
   let result;
   try{result=await Promise.race([request,new Promise((_,reject)=>{
    timeout=setTimeout(()=>{ac.abort();reject(Error('Сервер не ответил за 9 секунд'));},9000);
   })]);}finally{clearTimeout(timeout);}
   const {data,error}=result;if(error)throw error;if(tr.closed||tr.key!==id)return;
   // A repeated mechanic in a later card is a new game, not a continuation
   // of the previous card's taps, question, selection or pending work.
   if(tr.view?.card_position!==undefined&&tr.view.card_position!==data.card_position){
     tr.root.querySelector('.arcade-player')?.classList.remove('is-tap-finalizing');tr.pending=0;tr.batch=null;tr.freezeTaps=false;tr.confirmedTaps=0;tr.rejectedTaps=0;tr.finalStateRequested=false;tr.finalRefreshRequested=false;tr.qkey='';tr.consensusKey='';tr.consensusBusy=false;tr.alertOverride=0;
      tr.memoryKey=null;if(tr.memory)tr.memory.runId+=1;tr.memory=null;tr.lastJumpTarget=null;tr.gameBusy=false;tr.visualTapCount=0;tr.localTaps=0;tr.secretAnswer=[];tr.secretState=null;
     if(tr.flushTimer){clearTimeout(tr.flushTimer);tr.flushTimer=null;}
   }
   tr.failures=0;tr.view=data;if(data.mode==='sequence_memory'&&data.secret_code)tr.secretState=data.secret_code;tr.offset=Date.parse(data.server_now)-Date.now();paint(tr);if(tr.kind==='player')paintWallet(data);
  }catch(e){tr.failures=(tr.failures||0)+1;const status=tr.root?.querySelector('[data-arcade-personal]');if(status)status.textContent='Связь с серверным таймером прервана. Повторяем подключение…';showMessage(tr,e.message||'Состояние игры недоступно',true)}finally{tr.fetching=false}
 }
 function showMessage(tr,msg,bad=false){
 const el=tr.root?.querySelector('[data-arcade-alert]');if(!el)return;
 if(tr.messageTimer)clearTimeout(tr.messageTimer);
 el.textContent=msg;el.dataset.error=String(!!bad);
 if(bad||/восстанавливаем связь/i.test(msg)){
  const message=msg;
  tr.messageTimer=setTimeout(()=>{if(!tr.closed&&el.textContent===message){el.textContent='';el.dataset.error='false';}},3800);
 }
}
 function promptMarkup(q,allow,shown){if(!q)return '';const images=(q.options||[]).map((o,i)=>{const img=o&&typeof o==='object'&&/^https:\/\/\S+$/.test(o.image_url||'')?'<img class="arcade-choice-image" src="'+escape(o.image_url)+'" alt="Вариант '+(i+1)+'">':'<span>'+escape(typeof o==='string'?o:o?.label||'Флаг')+'</span>';
   return '<button type="button" data-arcade-answer="'+i+'" '+(!allow?'disabled':'')+'><span class="arcade-choice-letter">'+String.fromCharCode(65+i)+'</span>'+img+'</button>'}).join('');
  const figure=/^https:\/\/\S+$/.test(q.media_url||'')?'<img class="arcade-choice-image" style="max-height:140px;max-width:100%" src="'+escape(q.media_url)+'" alt="Флаг для блиц-вопроса">':'';
  return '<article class="arcade-question"><span class="arcade-kicker">ДОПОЛНИТЕЛЬНЫЙ ВОПРОС</span><h3>'+escape(q.prompt)+'</h3>'+figure+'<div class="arcade-choices">'+images+'</div>'+
  (shown?'<div class="arcade-reveal">Верный ответ: '+String.fromCharCode(65+Number(q.correct))+'</div>':'')+'</article>';
 }

 function renderConsensus(tr,v){
  const root=tr.root.querySelector('[data-arcade-question]');if(!root)return;
  const state=v.consensus||{},q=v.question;
  const stage=state.stage||'reading';
  const isPlayer=tr.kind==='player',canVote=isPlayer&&stage==='voting'&&!!state.my_team_id;
  const canFinalize=isPlayer&&stage==='captain'&&state.captain;
  const selected=stage==='captain'?state.final_choice:state.my_choice;
  const tally=new Map((state.my_team_votes||[]).map(x=>[Number(x.choice),Number(x.votes)||0]));
  const deadline=stage==='voting'?state.vote_ends_at:state.ends_at;
  const time=Math.max(0,Math.ceil(((Date.parse(deadline)||0)-currentTime(tr))/1000));
  const labels={reading:'Знакомимся с вопросом',voting:'ЭТАП 1 / 2 · ГОЛОСОВАНИЕ КОМАНДЫ',
    captain:'ЭТАП 2 / 2 · РЕШЕНИЕ КАПИТАНА',completed:'РЕЗУЛЬТАТЫ КОНСЕНСУСА'};
  const key=JSON.stringify([v.card_position,stage,state.my_choice,state.final_choice,
    state.captain,state.my_team_votes,q?.prompt,q?.correct,state.team_decision,canVote,canFinalize]);
  if(tr.consensusKey===key)return;
  tr.consensusKey=key;
  if(!q){
   root.hidden=false;
   root.innerHTML='<div class="consensus-wait"><span class="arcade-kicker">БЛИЦ-КОНСЕНСУС</span>'+
    '<strong>Вопрос появится через несколько секунд</strong><p>Все участники увидят одинаковые варианты ответа.</p></div>';
   return;
  }
  const media=/^https:\/\/\S+$/.test(q.media_url||'')?
   '<img class="consensus-flag" src="'+escape(q.media_url)+'" alt="Изображение к вопросу">':'';
  const options=(q.options||[]).map((opt,i)=>{
   const image=opt&&typeof opt==='object'&&/^https:\/\/\S+$/.test(opt.image_url||'')?
    '<img loading="lazy" src="'+escape(opt.image_url)+'" alt="Вариант '+(i+1)+'">':
    '<span>'+escape(typeof opt==='string'?opt:opt?.label||'Вариант '+(i+1))+'</span>';
   const chosen=selected===i;
   const showCounts=stage==='captain'&&state.captain;
   const showCorrect=stage==='completed'&&Number.isInteger(q.correct);
   return '<button type="button" class="consensus-option'+(chosen?' is-chosen':'')+
    (showCorrect&&q.correct===i?' is-correct':'')+'" data-consensus-choice="'+i+'" '+
    ((!canVote&&!canFinalize||tr.consensusBusy)?'disabled':'')+
    ' aria-pressed="'+chosen+'"><b class="consensus-letter">'+String.fromCharCode(65+i)+'</b>'+
    image+(showCounts?'<strong class="consensus-votes">'+(tally.get(i)||0)+' гол.</strong>':'')+
    (chosen?'<span class="consensus-selected">✓</span>':'')+'</button>';
  }).join('');
  const caption=stage==='reading'?'Читайте вопрос. Голосование скоро откроется.':
   stage==='voting'?(isPlayer?'Выберите ответ. До конца этапа можно изменить голос.':'Все участники выбирают ответ одновременно.'):
   stage==='captain'?(state.captain?'Вы — капитан. Сравните голоса и зафиксируйте решение.':'Капитан видит распределение голосов и выбирает ответ команды.'):
   (state.team_decision==null?'Команда не отправила ответ.':
    'Ответ команды: '+String.fromCharCode(65+Number(state.team_decision))+
     (Number.isInteger(q.correct)?(state.team_decision===q.correct?' · верно, +10 баллов':' · неверно, 0 баллов'):''));
  root.hidden=false;
  root.innerHTML='<article class="consensus-question" aria-label="Блиц-консенсус">'+
   '<div class="consensus-phase"><span>'+labels[stage]+'</span><strong data-consensus-clock>'+time+' сек.</strong></div>'+
   '<h3>'+escape(q.prompt)+'</h3>'+media+
   '<div class="consensus-options">'+options+'</div>'+
   (stage==='captain'&&state.captain?
     '<p class="consensus-detail">Голоса вашей команды: '+Number(state.my_team_count||0)+
      '. Если капитан не выберет ответ, победит вариант большинства.</p>':'')+
   (stage==='completed'&&Number.isInteger(q.correct)?'<div class="consensus-correct">Правильный ответ: '+
      String.fromCharCode(65+q.correct)+'</div>':'')+
   '<p class="consensus-caption" role="status">'+caption+'</p></article>';
 }
 async function consensusVote(tr,choice){
  if(tr.closed||tr.consensusBusy||!Number.isInteger(choice)||choice<0||choice>3)return;
  const phase=tr.view?.consensus?.stage;
  if(!['voting','captain'].includes(phase))return;
  if(phase==='captain'&&!tr.view?.consensus?.captain)return;
  tr.consensusBusy=true;
  // Selected state responds immediately; server remains authoritative.
  const root=tr.root.querySelector('[data-arcade-question]');
  root?.querySelectorAll('[data-consensus-choice]').forEach(button=>{
    const selected=Number(button.dataset.consensusChoice)===choice;
    button.classList.toggle('is-chosen',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  try{
   const {error}=await tr.client.rpc('qwiz_consensus_vote',
     {p_room:tr.roomId,p_choice:choice,p_phase:phase==='captain'?'final':'vote'});
   if(error)throw error;
   tr.consensusKey='';await fetchState(tr);
  }catch(e){
   tr.consensusKey='';showMessage(tr,e.message||'Голос не принят',true);
   tr.alertOverride=Date.now()+2500;renderConsensus(tr,tr.view);
  }finally{tr.consensusBusy=false;}
 }
 // Memory: the 12 DOM buttons are stable throughout a round. Never rebuild them
 // after each RPC: removing/recreating nodes was swallowing rapid touches.
 function memoryTile(tr,index){
  return tr.root?.querySelector('[data-arcade-memory] [data-arcade-tile="'+index+'"]');
 }
 function memoryFace(tr,index,icon,matched=false){
  const el=memoryTile(tr,index);if(!el)return;
  el.classList.add('is-open');el.classList.remove('is-pending','is-queued');
  el.classList.toggle('is-matched',!!matched);
  el.querySelector('.arcade-memory-front').textContent=icon||'·';
  el.dataset.icon=icon||'';
  el.disabled=true;
  el.setAttribute('aria-label','Открытая плитка '+(index+1));
  el.removeAttribute('aria-busy');
 }
 function memoryClosed(tr,index){
  const el=memoryTile(tr,index);
  if(!el||el.classList.contains('is-matched'))return;
  el.classList.remove('is-open','is-pending','is-queued');
  el.querySelector('.arcade-memory-front').textContent='';
  el.dataset.icon='';
  el.disabled=false;el.removeAttribute('aria-busy');
  el.setAttribute('aria-label','Закрытая плитка '+(index+1));
 }
 function memoryStatus(tr,m){
  const el=tr.root.querySelector('[data-memory-info]');if(!el)return;
  const cards=tr.root.querySelectorAll('[data-arcade-memory] .is-matched').length;
  const pairs=Math.max(Number(m?.pairs)||0,Math.floor(cards/2));
  const moves=Math.max(Number(m?.moves)||0,Number(tr.memory?.localMoves)||0);
  el.textContent=m?.captain===false?'Играет капитан вашей команды':
   m?.completed_ms!=null?'Все 6 пар найдены · '+moves+' ходов':
    'Найдено '+pairs+'/6 пар · '+moves+' ходов';
 }
 function paintMemory(tr,m,valid){
  const board=tr.root.querySelector('[data-arcade-memory]');if(!board)return;
  const serverTiles=Array.isArray(m.tiles)?m.tiles:[];
  if(serverTiles.length!==12)return;
  const mem=tr.memory||(tr.memory={processing:false,requests:[],next:[],visible:[],localMoves:0,holdUntil:0,runId:0});
  const enabled=valid&&!!m.captain&&m.completed_ms==null;
  if(board.children.length!==12){
   board.innerHTML=serverTiles.map(tile=>'<button type="button" class="arcade-memory-tile" data-arcade-tile="'+tile.index+
    '" aria-label="Закрытая плитка '+(tile.index+1)+'"><span class="arcade-memory-tile-inner">'+
    '<span class="arcade-memory-back">✦</span><span class="arcade-memory-front"></span></span></button>').join('');
  }
  // A background snapshot may predate acknowledged flips; do not rewind local animation.
  const syncing=mem.processing||mem.requests.length>0||mem.visible.length>0||
   mem.next.length>0||Date.now()<mem.holdUntil;
  if(!syncing){
   for(const tile of serverTiles){
    const el=memoryTile(tr,tile.index);if(!el)continue;
    if(tile.matched||tile.icon)memoryFace(tr,tile.index,tile.icon,!!tile.matched);
    else memoryClosed(tr,tile.index);
    el.disabled=!enabled||!!tile.matched||!!tile.open;
   }
   mem.localMoves=0;
  }
  if(!enabled){
   board.querySelectorAll('[data-arcade-tile]').forEach(el=>{el.disabled=true;});
  }
  memoryStatus(tr,m);
 }
 function memoryStage(tr){
  const mem=tr.memory;
  if(!mem||tr.closed)return;
  while(mem.visible.length<2&&mem.next.length){
   const index=mem.next.shift();
   const tile=memoryTile(tr,index);
   if(!tile||tile.classList.contains('is-matched'))continue;
   tile.classList.remove('is-queued');tile.classList.add('is-open','is-pending');
   tile.querySelector('.arcade-memory-front').textContent='·';
   tile.setAttribute('aria-busy','true');
   mem.visible.push(index);mem.requests.push(index);
  }
 }
 async function processMemory(tr){
  const mem=tr.memory;if(!mem||mem.processing||tr.closed)return;
  mem.processing=true;const runId=mem.runId;
  try{
   while(mem.requests.length&&!tr.closed&&runId===mem.runId){
    const index=mem.requests.shift();
    let answer=null;
    for(let attempt=0;attempt<3;attempt++){
     const {data,error}=await tr.client.rpc('qwiz_arcade_play',
       {p_room:tr.roomId,p_action:'flip',p_tile:index});
     if(error)throw error;
     if(tr.closed||runId!==mem.runId)return;
     if(data?.wait){
      const delay=Math.min(720,Math.max(80,Number(data.retry_ms)||190));
      await new Promise(resolve=>setTimeout(resolve,delay+30));
      continue;
     }
     answer=data;break;
    }
    if(!answer?.ok){
     memoryClosed(tr,index);
     mem.visible=mem.visible.filter(x=>x!==index);
     if(answer?.completed)break;
     continue;
    }
    memoryFace(tr,index,answer.icon);
    if(Object.hasOwn(answer,'match')){
     const first=mem.visible.find(x=>x!==index);
     if(Number.isInteger(first)&&answer.first_icon)
      memoryFace(tr,first,answer.first_icon,!!answer.match);
     if(answer.match){
      memoryFace(tr,index,answer.icon,true);
      mem.localMoves+=1;
      mem.visible=[];mem.holdUntil=Date.now()+850;
      memoryStage(tr);
      memoryStatus(tr,tr.view?.extra||{});
      if(answer.completed){showMessage(tr,'Мэмори пройдена. Все пары найдены.');break;}
     }else{
      mem.localMoves+=1;memoryStatus(tr,tr.view?.extra||{});
      // The server holds a mismatched pair for just 640ms (was 1900ms).
      // Queue later touches immediately, then start the next pair in order.
      await new Promise(resolve=>setTimeout(resolve,Math.max(130,Number(answer.hide_ms)||640)));
      if(tr.closed||runId!==mem.runId)return;
      for(const old of mem.visible)memoryClosed(tr,old);
      mem.visible=[];mem.holdUntil=Date.now()+650;
      memoryStage(tr);
     }
    }
   }
  }catch(error){
   if(!tr.closed&&runId===mem.runId){
    showMessage(tr,error.message||'Не удалось открыть плитку. Повторите нажатие.',true);
    tr.alertOverride=Date.now()+2200;
    for(const index of [...mem.visible,...mem.next])memoryClosed(tr,index);
    mem.visible=[];mem.requests=[];mem.next=[];mem.localMoves=0;mem.holdUntil=0;
   }
  }finally{
   if(runId===mem.runId){
    mem.processing=false;
    if(!tr.closed){
     memoryStage(tr);
     if(mem.requests.length)void processMemory(tr);
     else void fetchState(tr);
    }
   }
  }
 }

 // On the audience display the whole vote occupies a dedicated scene.
 // The authoritative clock, eligible team and ballot options come from the server,
 // not from a client-side guess about when the next round should begin.
 function paintProjectionVote(tr,v,vote){
  if(tr.kind!=='screen')return;
  const panel=tr.root.querySelector('[data-arcade-vote-screen]');
  const arcade=tr.root.querySelector('.arcade-shell');
  if(!panel||!arcade)return;
  const visible=Boolean(vote?.open&&(vote.stage==='strategy'||vote.stage==='option')&&
    Date.parse(vote.full_vote_ends_at||vote.vote_ends_at)>currentTime(tr));
  panel.hidden=!visible;
  arcade.hidden=visible;
  panel.classList.toggle('is-solo',(v.teams||[]).length===1);
  if(!visible){tr.projectionVoteKey='';return;}
  const stage1=vote.stage==='strategy';
  const winning=(v.teams||[]).find(x=>String(x.id)===String(vote.winner_team));
  const team=winning?.name||'Команда-победитель';
  const entries=stage1?(vote.target_name?STRATEGIES:STRATEGIES.filter(x=>x[0]==='support')):
   vote.strategy==='sabotage'?HINDRANCES:vote.strategy==='support'?BOOSTS:[];
  const key=[v.card_position,vote.stage,vote.strategy,vote.winner_team,vote.target_name].join(':');
  if(tr.projectionVoteKey!==key){
   tr.projectionVoteKey=key;
   const label=stage1?'Выбор стратегии':vote.strategy==='sabotage'?'Выбор штрафа':'Выбор бонуса';
   const heading=stage1?'Как поступит команда-победитель?':
    vote.strategy==='sabotage'?'Какое ограничение получит соперник?':'Какое усиление получит команда?';
   const copy=stage1?'Зелёный маршрут усиливает свою команду. Красный манёвр ограничивает соперника.':
    vote.strategy==='sabotage'?'Команда определяет штраф для '+(vote.target_name||'соперника')+'.':
    'Команда определяет преимущество для следующего раунда.';
   panel.className='arcade-vote-projection '+(vote.strategy==='sabotage'?'is-harm':'is-boost')+((v.teams||[]).length===1?' is-solo':'');
   panel.innerHTML='<div class="arcade-projection-vote-top"><span class="arcade-projection-vote-kicker">QWIZ-PARTY · РЕШЕНИЕ КОМАНДЫ</span>'+
    '<span class="arcade-projection-vote-step">'+(stage1?'ЭТАП 1 ИЗ 2':'ЭТАП 2 ИЗ 2')+'</span></div>'+
    '<div class="arcade-projection-vote-heading"><span>'+escape(label)+'</span>'+
      '<h1>'+escape(heading)+'</h1><p>'+escape(copy)+'</p></div>'+
    '<div class="arcade-projection-vote-champion"><span aria-hidden="true">✦</span><strong>'+escape(team)+'</strong><small>Выбор делает победившая команда со своих телефонов</small></div>'+
    '<div class="arcade-projection-vote-options" role="list">'+
     (entries.length?entries.map(([id,title,description])=>
      '<article class="arcade-projection-vote-option" role="listitem" data-projection-vote-option="'+escape(id)+'" data-vote-tone="'+(id==='sabotage'||HINDRANCES.some(x=>x[0]===id)?'harm':'boost')+'">'+
      strategyIcon(id)+'<strong>'+escape(title)+'</strong><span>'+escape(description)+'</span>'+
      '<div class="arcade-projection-vote-count"><b data-projection-vote-count="'+escape(id)+'">0</b><span>голосов</span></div></article>').join(''):
      '<p class="arcade-projection-vote-wait">Ожидаем окончательного решения команды.</p>')+'</div>'+
    '<div class="arcade-projection-vote-bottom"><span>Голосование проходит на телефонах участников</span>'+
    '<div class="arcade-projection-vote-timer" role="timer" aria-live="off"><strong data-projection-vote-seconds>—</strong><small>секунд осталось</small></div></div>';
  }
  const counts=vote.counts||{};
  panel.querySelectorAll('[data-projection-vote-count]').forEach(el=>{
   el.textContent=String(Math.max(0,Number(counts[el.dataset.projectionVoteCount])||0));
  });
  const seconds=panel.querySelector('[data-projection-vote-seconds]');
  if(seconds)seconds.textContent=String(left(vote.vote_ends_at,tr));
 }
 function paint(tr){const v=tr.view;if(!v?.mode||tr.closed)return;const now=currentTime(tr),capture=Date.parse(v.capture_until||'')||0,end=Date.parse(v.ends_at||'')||0;
  const valid=v.running&&now<end,claim=v.mode==='blitz'&&now<capture;
  const list=tr.root.querySelector('[data-arcade-ranks]');if(list)list.innerHTML=rankMarkup(v);

  const mine=v.mine||{},myTeam=mine.team_id,leader=(v.teams||[]).find(t=>t.place===1&&Number(t.points)>0),canAnswer=v.mode==='blitz'&&valid&&!claim&&v.blitz_eligible_team===myTeam&&v.answer_correct!==true&&v.question;
  if(v.mode==='blitz')renderConsensus(tr,v);
  else {
   const qroot=tr.root.querySelector('[data-arcade-question]');
   if(qroot){const qkey=v.question?JSON.stringify([v.question.prompt,v.answered_at,v.blitz_attempts,false,v.question.correct]):'';
    if(tr.qkey!==qkey){tr.qkey=qkey;qroot.hidden=!v.question;
      qroot.innerHTML=v.question?promptMarkup(v.question,false,v.question.correct!==null&&v.question.correct!==undefined):'';}}
  }
  if(v.mode==='captain'&&tr.kind==='player')paintMemory(tr,v.extra||{},valid);
   if(v.mode==='sequence_memory')window.QwizSecretCode?.render(tr,tr.secretState||v.secret_code||{});
  if(v.mode==='rocket'){const run=v.extra||{},figure=tr.root.querySelector('[data-runner-character]');
   if(figure)figure.classList.toggle('runner-eliminated',!!run.selected&&!run.alive);
   const obstacle=tr.root.querySelector('[data-runner-obstacle]');if(obstacle)obstacle.hidden=!run.next_at||!!run.selected&&!run.alive;}
  const tap=tr.root.querySelector('[data-arcade-tap]');
  if(tap){let eligible=valid&&(v.mode!=='blitz'||claim)&&!!myTeam;
   if(v.mode==='tug')eligible=eligible&&!tr.freezeTaps&&now<end-5000;
   if(v.mode==='captain')eligible=false;if(v.mode==='rocket')eligible=eligible&&!!v.extra?.selected&&!!v.extra?.alive;
   tap.disabled=!eligible;tap.textContent=META[v.mode].cta;
   const personal=tr.root.querySelector('[data-arcade-personal]');
    if(personal)personal.textContent=v.mode==='captain'?(v.extra?.captain?'Переворачивайте по две плитки.':'Наблюдайте за вашим капитаном.'):v.mode==='rocket'?(v.extra?.selected?(v.extra.alive?'Вы бегун! Прыгайте перед препятствием.':'Столкновение. Сравниваем результаты.'):'От команды выбран один случайный бегун.'):v.mode==='blitz'&&!claim?(canAnswer?'Ваша команда выиграла захват! Выберите ответ.':'Захват завершён. Смотрите рейтинг.'):tapStatus(tr);
  }
  const badges=tr.root.querySelector('[data-arcade-badges]');if(badges)badges.innerHTML=(v.awards||[]).slice(0,12).map(a=>'<span class="arcade-award">'+escape(a.title)+'</span>').join('');
  const vote=v.vote,ballot=tr.kind==='player'?tr.voteDialog?.querySelector('[data-arcade-vote]'):tr.root.querySelector('[data-arcade-vote]');
  // Each voting stage is independent. Closing one ballot must not hide the next stage.
  const voteKey=vote?.open&&vote?.can_vote?[tr.roomId,v.card_position,vote.stage,vote.vote_ends_at].join(':'):'';
  if(voteKey!==tr.voteKey){
   if(tr.voteTimer)clearTimeout(tr.voteTimer);
   tr.voteTimer=null;tr.voteKey=voteKey;tr.voteDismissed=false;
   if(voteKey){
    const remaining=Math.max(0,Date.parse(vote.vote_ends_at)-currentTime(tr));
    tr.voteTimer=setTimeout(()=>{
     if(!tr.closed&&tr.voteKey===voteKey){
      tr.voteDismissed=true;
      if(tr.voteDialog?.open)tr.voteDialog.close();
     }
    },Math.min(10000,remaining));
   }
  }
  // A ballot is a top-layer <dialog>. Never hide the underlying scene just
  // because vote.can_vote is true: after an accepted vote or between stages
  // the dialog closes and the participant must see team results, not white.

  if(ballot){
   ballot.hidden=!vote;
   if(vote){
    const champion=(v.teams||[]).find(t=>t.id===vote.winner_team);
    const tally=vote.counts||{},mine=vote.my_choice;
    const remaining=Math.max(0,Math.ceil((Date.parse(vote.vote_ends_at)-currentTime(tr))/1000));
    const strategyStage=vote.stage==='strategy';
    const selections=strategyStage?(vote.target_name?STRATEGIES:STRATEGIES.filter(x=>x[0]==='support')):vote.strategy==='sabotage'?HINDRANCES:vote.strategy==='support'?BOOSTS:[];
    const canChoose=tr.kind==='player'&&vote.can_vote&&vote.open&&remaining>0;
    const tone=vote.strategy==='sabotage'?'harm':'boost';
    const title=strategyStage?'Что выбирает команда?':vote.strategy==='sabotage'?'Выберите ограничение сопернику':'Выберите усиление своей команде';
    const subtitle=strategyStage?'ЭТАП 1 / 2 · СТРАТЕГИЯ': 'ЭТАП 2 / 2 · КОНКРЕТНЫЙ ЭФФЕКТ';
    ballot.setAttribute('role',tr.kind==='player'?'group':'region');ballot.setAttribute('aria-label','Голосование за командное преимущество');
    ballot.className='arcade-vote '+(strategyStage?'arcade-vote-strategy ':'arcade-vote-effects ')+(vote.strategy==='sabotage'?'is-harm':'is-boost');
    ballot.innerHTML='<div class="arcade-vote-title"><span>'+subtitle+' · 🏆 '+escape(champion?.name||'Лидеры')+'</span>'+
      '<strong>'+escape(title)+'</strong>'+
      '<p>'+(tr.kind==='player'?(strategyStage?'Выберите усиление своей команды или помеху сопернику.':'Выберите эффект. Решение определяется большинством голосов.'):(strategyStage?'Победившая команда выбирает: зелёный путь усиливает себя, красный накладывает штраф на соперника.':'Выберите конкретный бонус или штраф. Он применяется в следующем раунде.')+' Нажмите вариант, голосование решается большинством. Решение принимается в два этапа.')+' '+(vote.target_name?'Соперник: '+escape(vote.target_name)+'. ':'')+'Осталось '+remaining+' сек.</p></div>'+
      (selections.length?'<div class="arcade-boost-grid">'+selections.map(([id,caption,description])=>
        '<button type="button" data-boost-choice="'+id+'" '+(!canChoose||tr.voteBusy?'disabled':'')+
        ' data-vote-tone="'+(id==='sabotage'||HINDRANCES.some(item=>item[0]===id)?'harm':'boost')+'"'+
        ' class="'+(mine===id?'selected':'')+'">'+strategyIcon(id)+'<strong>'+escape(caption)+'</strong>'+
        '<span>'+escape(description)+'</span><b>'+Number(tally[id]||0)+' голосов</b></button>').join('')+'</div>':
        '<p class="arcade-vote-wait">Большинство не выбрало единую стратегию. Раунд продолжится автоматически.</p>')+
      '<p class="arcade-vote-rule">'+(canChoose?'Нажмите карточку. До завершения этапа вы можете изменить голос.':
       vote.can_vote?'Ожидаем голосования команды…':'Голосуют только участники команды-лидера.')+'</p>';

   }
  }
  paintProjectionVote(tr,v,vote);
  // Native modal stays in the top layer, independent from the arcade scene and bottom player bar.
  // Only the winning team's eligible participants see the ballot; no duplicate DOM votes.
  if(tr.voteDialog){
   const open=Boolean(vote?.can_vote&&vote?.open&&!tr.voteDismissed&&Date.parse(vote.vote_ends_at)>currentTime(tr));
   if(open&&!tr.voteDialog.open)tr.voteDialog.showModal();
   else if(!open&&tr.voteDialog.open)tr.voteDialog.close();
  }
  const playerShell=tr.kind==='player'?tr.root.querySelector('.arcade-shell.arcade-player'):null;
  const ballotVisible=Boolean(tr.voteDialog?.open);
  const showingResults=Boolean(vote)&&!ballotVisible;
  playerShell?.classList.toggle('is-boost-voting',ballotVisible);
  playerShell?.classList.toggle('is-vote-transition',showingResults);
  const transition=tr.root.querySelector('[data-arcade-vote-transition]');
  if(transition){
   transition.hidden=!showingResults;
   if(showingResults){
    const heading=transition.querySelector('strong');
    const info=transition.querySelector('p');
    if(heading)heading.textContent=vote?.stage==='strategy'?
      'Считаем голоса за стратегию':'Результаты испытания';
    if(info)info.textContent=vote?.open?
      'Ваш голос принят или ожидается выбор команды. Счёт обновляется по данным сервера.':
      'Голосование завершено. Следующий этап откроется автоматически.';
   }
  }
  const status=v.awarded_at?'Результат зафиксирован. Награды зачислены.':
   !v.running?'Соревнование завершено.':
   v.mode==='blitz'?'':
   v.mode==='captain'?'':
   !valid?'Время вышло. Ведущий продолжит игру.':'Идёт командная битва! Показатели обновляются автоматически.';
  if(!tr.alertOverride||Date.now()>tr.alertOverride)showMessage(tr,status);
  tick(tr);
 }
 function tick(tr){const v=tr.view;if(!v||tr.closed)return;
  const clock=tr.root.querySelector('[data-arcade-clock]');const sec=left(v.ends_at,tr);
  if(clock){clock.textContent=sec+' сек.';clock.dataset.urgent=String(sec<=3);}
  if(tr.kind==='screen'&&v.vote){
   const projectionSeconds=tr.root.querySelector('[data-projection-vote-seconds]');
   if(projectionSeconds)projectionSeconds.textContent=String(left(v.vote.vote_ends_at,tr));
  }
  const consentClock=tr.root.querySelector('[data-consensus-clock]');if(consentClock){const at=tr.view?.consensus?.stage==='voting'?tr.view?.consensus?.vote_ends_at:tr.view?.consensus?.ends_at;consentClock.textContent=left(at,tr)+' сек.';}
  if(v.mode==='rocket'){const obstacle=tr.root.querySelector('[data-runner-obstacle]');if(obstacle&&!obstacle.hidden){const dt=(Date.parse(v.extra?.next_at)-currentTime(tr))/1000;obstacle.style.left=(20+78*Math.max(0,Math.min(1,dt/2.25)))+'%';}}
  const button=tr.root.querySelector('[data-arcade-tap]');
  if(v.mode==='tug'&&v.running){
   const leftMs=(Date.parse(v.ends_at)||0)-currentTime(tr);
   if(leftMs<=5000){
    tr.freezeTaps=true;
    tr.root.querySelector('.arcade-player')?.classList.add('is-tap-finalizing');
    if(button)button.disabled=true;
    // The final five seconds are for reliable submission, not new clicks.
    if((tr.batch||tr.pending)&&!tr.sending&&!tr.flushTimer)void flush(tr);
    if(!tr.finalRefreshRequested){
     tr.finalRefreshRequested=true;
     // Stagger classroom clients: don't make 40 phones query at the same instant.
     tr.finalRefreshTimer=setTimeout(()=>{tr.finalRefreshTimer=null;if(!tr.closed)void fetchState(tr);},250+Math.floor(Math.random()*500));
    }
    if(leftMs<=0&&!tr.finalStateRequested){
     tr.finalStateRequested=true;
     tr.finalRefreshTimer=setTimeout(()=>{tr.finalRefreshTimer=null;if(!tr.closed)void fetchState(tr);},650+Math.floor(Math.random()*500));
    }
   }
   updateTapStatus(tr);
  }
  if(button&&sec===0)button.disabled=true;
 }
 function activate(kind,root,code,roomId,client,mode){
  if(!root||!client||!META[mode])return;
  const key=code+':'+mode+':'+(kind==='player'?roomId||'':'');
  if(ui[kind]?.key===key&&ui[kind].root===root)return;
  stop(kind);
  const tr={kind,key,root,code,roomId,client,mode,offset:0,closed:false,fetching:false,pending:0,batch:null,sending:false,view:null,flushTimer:null,confirmedTaps:0,rejectedTaps:0,freezeTaps:false,finalStateRequested:false,finalRefreshRequested:false,finalRefreshTimer:null,qkey:'',secretAnswer:[],secretState:null,secretBusy:false};
  ui[kind]=tr;root.innerHTML=rootMarkup(mode,kind);
  if(kind==='player'){
   // A dedicated browser top-layer dialog prevents bonus cards from being cut off
   // by the previous mini-game, any scroll container or the bottom stats bar.
   const voteDialog=document.createElement('dialog');
   voteDialog.className='arcade-boost-dialog';
   voteDialog.setAttribute('aria-label','Выбор командного усиления или штрафа');
   voteDialog.innerHTML='<section class="arcade-vote" data-arcade-vote hidden></section>';
   document.body.append(voteDialog);tr.voteDialog=voteDialog;
   voteDialog.addEventListener('click',event=>{
    const choice=event.target.closest('[data-boost-choice]');
    if(choice&&!choice.disabled)void voteBoost(tr,choice.dataset.boostChoice);
   });
   voteDialog.addEventListener('cancel',()=>{
    // Escape/back closes a stuck ballot without changing the server vote.
    tr.voteDismissed=true;
   });
   tr.onClick=e=>{
     if(window.QwizSecretCode?.click(tr,e))return;
    if(e.target.closest('[data-arcade-tap]')){
      if(tr.mode!=='tug'||e.detail===0||Date.now()-(tr.lastPointerTapAt||0)>700)tap(tr);
     }
     const tile=e.target.closest('[data-arcade-tile]');if(tile&&e.detail===0)flip(tr,Number(tile.dataset.arcadeTile));
    const opt=e.target.closest('[data-arcade-answer]');if(opt)answer(tr,Number(opt.dataset.arcadeAnswer));
    const consensus=e.target.closest('[data-consensus-choice]');if(consensus)void consensusVote(tr,Number(consensus.dataset.consensusChoice));
    const boost=e.target.closest('[data-boost-choice]');if(boost)voteBoost(tr,boost.dataset.boostChoice);
   };root.addEventListener('click',tr.onClick);
    tr.onPointerDown=e=>{
     const button=e.target.closest('[data-arcade-tap]');
     if(tr.mode==='captain'){
      const tile=e.target.closest('[data-arcade-tile]');
      if(tile&&!tile.disabled&&e.isPrimary){e.preventDefault();flip(tr,Number(tile.dataset.arcadeTile));}
      return;
     }
     if(!button||tr.mode!=='tug'||button.disabled||!e.isPrimary)return;
     e.preventDefault();
     tr.lastPointerTapAt=Date.now();tap(tr);
    };
    root.addEventListener('pointerdown',tr.onPointerDown,{passive:false});
   }
  // Spread room state reads: 40 devices no longer hit the same RPC 25 times/sec.
  // Actions still refresh immediately. Transient failures back off, preserving the last view.
  const poll=()=>{if(tr.closed)return;const base=tr.view?.mode==='blitz'?(tr.kind==='player'?2400:3300):tr.view?.vote?.open?(tr.kind==='player'?2400:3200):tr.kind==='player'?6200:tr.kind==='screen'?4800:7000;
   const retry=Math.min(20000,base*Math.pow(1.6,Math.min(tr.failures||0,4)));
   tr.interval=setTimeout(async()=>{if(tr.closed)return;
    if(navigator.onLine&&document.visibilityState!=='hidden')await fetchState(tr);
    poll();
   },retry+Math.floor(Math.random()*900));};
  fetchState(tr);poll();window.QwizSecretCode?.start(tr);
  tr.clock=setInterval(()=>tick(tr),mode==='rocket'?250:500);
 }
 async function voteBoost(tr,choice){
  if(tr.closed||tr.voteBusy||!tr.roomId||!ALL_VOTES.some(x=>x[0]===choice))return;
  tr.voteBusy=true;
  try{const {error}=await tr.client.rpc('qwiz_vote_boost',{p_room:tr.roomId,p_choice:choice});
   if(error)throw error;
   // Confirmed server vote: close immediately, even if the next state read is slow.
   tr.voteDismissed=true;
   if(tr.voteTimer){clearTimeout(tr.voteTimer);tr.voteTimer=null;}
   if(tr.voteDialog?.open)tr.voteDialog.close();
   await fetchState(tr)
  }catch(e){showMessage(tr,e.message||'Голос не принят',true);tr.alertOverride=Date.now()+5000}
  finally{tr.voteBusy=false;if(!tr.closed&&tr.view)paint(tr)}
 }
 function animateTap(tr){
  const scene=tr.root.querySelector('.arcade-scene'),button=tr.root.querySelector('[data-arcade-tap]');
  if(!scene||!button)return;
  // Only animate compositor properties: no forced reflow or DOM particles on each tap.
  if(tr.mode==='tug'&&typeof button.animate==='function'){
   button.animate([{scale:'1'},{scale:'.955'},{scale:'1'}],{duration:115,easing:'ease-out'});
  }
 }
 function tapStatus(tr){
  const confirmed=tr.confirmedTaps||0;
  const waiting=(tr.pending||0)+(tr.batch?.count||0);
  const lost=tr.rejectedTaps||0;
  if(lost)return 'Подтверждено: '+confirmed+' · не принято сервером: '+lost+(waiting?' · отправляется: '+waiting:'');
  if(tr.freezeTaps||((Date.parse(tr.view?.ends_at)||0)-currentTime(tr))<=5000)
   return waiting?'Приём нажатий завершён. Подтверждено: '+confirmed+' · отправляется: '+waiting:
    'Приём нажатий завершён. Подтверждено сервером: '+confirmed+'. Ожидаем итоги команд.';
  return 'Подтверждено сервером: '+confirmed+(waiting?' · отправляется: '+waiting:' · нажимайте!');
 }
 function updateTapStatus(tr){
  if(tr.mode!=='tug')return;
  const label=tr.root?.querySelector('[data-arcade-personal]');
  if(label)label.textContent=tapStatus(tr);
 }
 function tap(tr){const v=tr.view;if(tr.closed||!v||!v.running||!v.mine)return;
  const now=currentTime(tr),end=Date.parse(v.ends_at)||0;
  if(now>end)return;
  if(v.mode==='tug'&&(tr.freezeTaps||now>=end-5000))return;
  if(v.mode==='blitz'&&now>(Date.parse(v.capture_until)||0))return;
  animateTap(tr);
  if(v.mode==='captain')return;if(v.mode==='rocket'){jump(tr);return;}
  if(tr.pending>=48)return; // Bounded buffer; never claim a click we cannot submit.
  tr.pending++;tr.localTaps=(tr.localTaps||0)+1;
  updateTapStatus(tr);
  // Start the first batch promptly while keeping subsequent batches below
  // the server's eight-clicks-per-second acceptance limit.
  if(!tr.flushTimer&&!tr.sending)tr.flushTimer=setTimeout(()=>flush(tr),160);
 }
 async function flush(tr){
  if(tr.closed||tr.sending)return;
  tr.flushTimer=null;
  if(!tr.batch){
   if(!tr.pending)return;
   if(tr.mode==='tug'&&currentTime(tr)>=(Date.parse(tr.view?.ends_at)||0)){
    tr.rejectedTaps=(tr.rejectedTaps||0)+tr.pending;
    tr.pending=0;
    updateTapStatus(tr);
    showMessage(tr,'Приём завершён. Часть нажатий не удалось подтвердить до истечения времени.',true);
    return;
   }
   const elapsed=Date.now()-(tr.lastTapBatchAt||0);
   if(elapsed<320){tr.flushTimer=setTimeout(()=>flush(tr),320-elapsed);return;}
   const count=Math.min(5,tr.pending);
   tr.pending-=count;
   tr.lastTapBatchAt=Date.now();
   // One stable UUID per batch: HTTP retries never create duplicate points.
   tr.batch={id:crypto.randomUUID(),count,attempts:0,card:tr.view?.card_position};
  }
  await sendTap(tr);
 }
 async function sendTap(tr){
  if(tr.sending||tr.closed||!tr.batch)return;
  const batch=tr.batch;tr.sending=true;
  try{
   if(!navigator.onLine)throw Error('Нет подключения к серверу');
   const controller=new AbortController();
   const q=tr.client.rpc('qwiz_arcade_tap_once',
    {p_room:tr.roomId,p_batch:batch.id,p_count:batch.count});
   const request=typeof q?.abortSignal==='function'?q.abortSignal(controller.signal):q;
   let timer;
   let result;
   try{
    result=await Promise.race([request,new Promise((_,reject)=>{
     timer=setTimeout(()=>{controller.abort();reject(Error('Нет ответа сервера'));},8000);
    })]);
   }finally{clearTimeout(timer);}
   if(result?.error)throw result.error;
   if(tr.closed||tr.batch!==batch)return;
   if(result?.data?.ok!==true)throw Error('Нажатия не подтверждены');
   tr.batch=null;tr.batchRetries=0;
   tr.confirmedTaps=(tr.confirmedTaps||0)+batch.count;
   updateTapStatus(tr);
  }catch(e){
   if(tr.closed||tr.batch!==batch)return;
   batch.attempts++;
   const age=Date.now()+(tr.offset||0)-(Date.parse(tr.view?.ends_at)||0);
   const rejected=/Время нажатий истекло|Испытание сейчас не проводится|Здесь нет активной|Некорректный пакет|не найдена|засчитана/i.test(String(e.message||''));
   if(rejected||age>15000||batch.attempts>6){
    tr.batch=null;tr.rejectedTaps=(tr.rejectedTaps||0)+batch.count;
    updateTapStatus(tr);
    showMessage(tr,'Не удалось подтвердить '+batch.count+' нажатий. Они не вошли в результат.',true);
   }else{
    showMessage(tr,'Восстанавливаем связь и повторяем пакет без двойного начисления…',true);
   }
   tr.alertOverride=Date.now()+2200;
  }finally{
   tr.sending=false;
   updateTapStatus(tr);
   if(!tr.closed&&(tr.batch||tr.pending)&&!tr.flushTimer){
    const wait=tr.batch?Math.min(5000,400*Math.pow(2,Math.min(3,batch.attempts))):320;
    tr.flushTimer=setTimeout(()=>flush(tr),wait+Math.floor(Math.random()*250));
   }
  }
 }
 async function gameAction(tr,action,tile=null){
  if(tr.closed||tr.gameBusy||!tr.roomId)return;tr.gameBusy=true;
  try{const {data,error}=await tr.client.rpc('qwiz_arcade_play',{p_room:tr.roomId,p_action:action,p_tile:tile});if(error)throw error;
   if(data?.early){tr.lastJumpTarget=null;showMessage(tr,'Рано! Прыгните ближе к препятствию.');}
   else if(data?.eliminated)showMessage(tr,'Столкновение. Попытка завершена.',true);
   else if(data?.completed)showMessage(tr,'Мэмори пройдена. Результат зафиксирован.');
   await fetchState(tr);
  }catch(e){showMessage(tr,e.message||'Действие не принято',true);tr.alertOverride=Date.now()+2600}
  finally{tr.gameBusy=false}
 }
 function flip(tr,index){
  const v=tr.view,m=v?.extra;
  if(tr.closed||!v?.running||!m?.captain||m.completed_ms!=null||
     !Number.isInteger(index)||index<0||index>=12)return;
  const tile=memoryTile(tr,index);if(!tile||tile.disabled||
    tile.classList.contains('is-open')||tile.classList.contains('is-matched')||
    tile.classList.contains('is-queued'))return;
  const mem=tr.memory||(tr.memory={processing:false,requests:[],next:[],visible:[],localMoves:0,holdUntil:0,runId:0});
  tile.disabled=true;
  // Immediate touch feedback; the actual hidden face comes from the server.
  if(mem.visible.length>=2){
   if(mem.next.length>=2){tile.disabled=false;return;}
   mem.next.push(index);tile.classList.add('is-queued');
   tile.setAttribute('aria-label','Плитка '+(index+1)+' в очереди');
   return;
  }
  mem.visible.push(index);mem.requests.push(index);
  tile.classList.add('is-open','is-pending');
  tile.querySelector('.arcade-memory-front').textContent='·';
  tile.setAttribute('aria-busy','true');
  void processMemory(tr);
 }
 function jump(tr){const v=tr.view;if(!v?.running||!v.extra?.selected||!v.extra?.alive)return;
  const k=v.extra.next_at;if(tr.lastJumpTarget===k||tr.gameBusy)return;tr.lastJumpTarget=k;
  const sprite=tr.root.querySelector('[data-runner-character]');
  if(sprite){sprite.classList.remove('runner-jump');void sprite.offsetWidth;sprite.classList.add('runner-jump');}
  gameAction(tr,'jump');
 }
 async function answer(tr,choice){if(tr.closed||tr.answerBusy)return;tr.answerBusy=true;
  try{const {data,error}=await tr.client.rpc('qwiz_arcade_action',{p_room:tr.roomId,p_action:'answer',p_choice:choice});if(error)throw error;
   showMessage(tr,data.correct?'Правильный ответ! +10 очков и достижение.':'Ответ неверный. Ход переходит следующей команде.',!data.correct);
   tr.alertOverride=Date.now()+3500;await fetchState(tr);
  }catch(e){showMessage(tr,e.message||'Ответ отклонён',true);tr.alertOverride=Date.now()+3200}
  finally{tr.answerBusy=false}
 }
 function mountPlayer(el,s,ctx){if(!isArcade(s.activity))return false;activate('player',el,s.code,s.room_id,ctx.client,s.activity.settings.arcade_mode);return true;}
 function mountProjector(el,s,client){if(!isArcade(s.activity))return false;activate('screen',el,s.code,null,client,s.activity.settings.arcade_mode);return true;}
 function mountHost(el,s,client){if(!el)return;if(s.phase==='intermission'&&isArcade(s.activity)){el.hidden=false;activate('host',el,s.code,s.room_id,client,s.activity.settings.arcade_mode)}else{el.hidden=true;stop('host')}}
 function paintWallet(view){
  if(view)wallet.view=view;
  const el=document.getElementById('arcadeWalletPanel');
  if(!el)return;
  const effects=(wallet.effects||[]).filter(x=>wallet.isHost||x.team_id===wallet.teamId);
  const vote=wallet.view?.vote,canVote=Boolean(vote?.can_vote&&vote?.open);
  if((!wallet.teamId&&!wallet.isHost)||(!effects.length&&!vote)){el.hidden=true;return}
  el.hidden=false;
  const labels={headstart:['Фора +12','+12 очков команды'],teamwork:['Командный рывок','+3 за участника (до 24)'],
   momentum:['Импульс','+15% к счёту (до 30)'],fog:['Туман соперника','−5 очков сопернику'],
   storm:['Штормовой заслон','−8 очков сопернику'],drain:['Энергетический отток','−12 очков сопернику']};
  const cards=effects.map(x=>{
   const label=labels[x.choice]||['Командный эффект','Результат голосования'];
   return '<article class="arcade-bonus-card"><span class="arcade-bonus-icon" aria-hidden="true">✦</span>'+
    '<div><strong>'+escape(label[0])+'</strong><span>'+escape(label[1])+'</span></div>'+
    '<span class="arcade-bonus-state">'+(x.applied_at?'Применён':'На следующий раунд')+'</span></article>';
  }).join('');
  let ballot='';
  if(vote){
   const leader=(wallet.view?.teams||[]).find(t=>t.id===vote.winner_team)?.name||'Команда-победитель';
   const strategy=vote.stage==='strategy';
   const items=strategy?(vote.target_name?STRATEGIES:STRATEGIES.filter(v=>v[0]==='support')):
    vote.strategy==='sabotage'?HINDRANCES:vote.strategy==='support'?BOOSTS:[];
   const seconds=Math.max(0,Math.ceil((Date.parse(vote.vote_ends_at||'')-Date.now()-(wallet.clockOffset||0))/1000));
   ballot='<section class="arcade-bonus-ballot"><small>ГОЛОСОВАНИЕ · '+(strategy?'ЭТАП 1 / 2':'ЭТАП 2 / 2')+'</small>'+
    '<h3>'+escape(strategy?'Выберите путь команды':'Выберите конкретный бонус')+'</h3>'+
    '<p>'+escape(leader)+' · '+seconds+' сек. · решение принимается большинством команды.</p>'+
    '<div class="arcade-bonus-ballot-options">'+items.map(([id,title,description])=>
     '<button type="button" data-wallet-boost-choice="'+id+'" '+(!canVote?'disabled':'')+
     ' class="'+(vote.my_choice===id?'selected':'')+'"><strong>'+escape(title)+'</strong><span>'+escape(description)+'</span>'+
     '<b>'+Math.round(Number(vote.counts?.[id]||0))+' голосов</b></button>').join('')+'</div>'+
    '<p class="arcade-bonus-ballot-note">'+(vote.can_vote?'До конца этапа вы можете изменить голос.':'Голосует команда-победитель.')+'</p></section>';
  }
  el.innerHTML='<div class="arcade-bonus-header"><h2>Командные бонусы</h2>'+
   '<p>После победы команда голосует за стратегию и конкретное усиление следующего раунда. Достижения не заменяют голосование.</p></div>'+
   ballot+(cards?'<details class="arcade-bonus-history"><summary>История достижений и эффектов · '+effects.length+'</summary><div class="arcade-bonus-list">'+cards+'</div></details>':'<p class="arcade-bonus-empty">Пока нет активных усилений.</p>');
  if(!el.dataset.voteBound){
   el.dataset.voteBound='true';
   el.addEventListener('click',async event=>{
    const item=event.target.closest('[data-wallet-boost-choice]');
    if(!item||item.disabled||wallet.voteBusy||!wallet.client||!wallet.roomId)return;
    wallet.voteBusy=true;item.disabled=true;
    try{
     const {error}=await wallet.client.rpc('qwiz_vote_boost',{p_room:wallet.roomId,p_choice:item.dataset.walletBoostChoice});
     if(error)throw error;
     if(ui.player&&!ui.player.closed)await fetchState(ui.player);
     else{
      const result=await wallet.client.rpc('qwiz_party_arcade',{p_code:wallet.code});
      if(result.error)throw result.error;
      paintWallet(result.data);
     }
    }catch(error){const node=el.querySelector('.arcade-bonus-ballot-note');
     if(node)node.textContent=error?.message||'Голос не принят';}
    finally{wallet.voteBusy=false;if(item.isConnected)item.disabled=false}
   });
  }
 }
 async function syncWallet(s,ctx){
  if(!s?.code||!ctx?.client)return;
  wallet.phase=s.phase;wallet.code=s.code;wallet.roomId=s.room_id;wallet.client=ctx.client;
  wallet.teamId=s.me?.team_id;wallet.isHost=Boolean(s.host);
  wallet.effects=Array.isArray(s.team_effects)?s.team_effects:[];
  if(s.phase==='intermission'&&isArcade(s.activity)){
   if(ui.player?.view){wallet.clockOffset=ui.player.offset;paintWallet(ui.player.view)}
   return;
  }
  wallet.view=null;wallet.clockOffset=0;paintWallet(null);
 }
 // An interrupted mobile connection must not require a page reload.
 window.addEventListener('online',()=>{for(const tr of Object.values(ui)){if(tr&&!tr.closed){fetchState(tr);if(tr.batch&&!tr.sending)flush(tr);}}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){for(const tr of Object.values(ui)){if(tr&&!tr.closed)fetchState(tr);}}});
 return {isArcade,mountPlayer,mountProjector,mountHost,syncWallet,stop,previewArt:art};
})();
