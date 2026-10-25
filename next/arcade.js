'use strict';
/* QWIZ-PARTY: synchronised team arcade. Client shows state; Postgres owns scores, boosts and achievements. */
window.QwizArcade=(()=>{
 const META={
  rocket:{title:'Дино-забег',desc:'Случайно выбранный игрок каждой команды прыгает через препятствия. Одно нажатие — один прыжок. Скорость растёт. Побеждает наибольшая дистанция.',cta:'ПРЫЖОК!'},
  blitz:{title:'Блиц-вопрос',desc:'Захватите право ответить первыми. Команда-победитель получит право проголосовать за усиление следующего раунда.',cta:'ЗАХВАТИТЬ ВОПРОС'},
  tug:{title:'Тап-баттл',desc:'Все участники нажимают кнопку одновременно. Считаются реальные суммарные нажатия всей команды, а не среднее значение на человека.',cta:'ТАП!'},
  captain:{title:'Мэмори капитанов',desc:'Все капитаны играют одновременно. Открывайте по две плитки и собирайте пары. Быстрейший проходит первым; при ничьей побеждает тот, у кого меньше ходов.',cta:'ОТКРЫТЬ ПЛИТКУ'}
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
  if(mode==='rocket')return '<div class="arcade-runner-world" role="img" aria-label="Бегун и движущееся препятствие"><div class="arcade-runner-sky"><i></i><i></i><i></i></div><div class="arcade-runner-character" data-runner-character><span class="runner-head"></span><span class="runner-eye"></span><span class="runner-body"></span><span class="runner-tail"></span><span class="runner-foot left"></span><span class="runner-foot right"></span></div><div class="arcade-runner-obstacle" data-runner-obstacle><span></span><i></i><b></b></div><div class="arcade-runner-floor"></div></div>';
  if(mode==='tug')return '<div class="arcade-tap-stage" aria-hidden="true"><div class="arcade-tap-glow"></div><span class="arcade-tap-sparks">✧　✦　✧</span></div>';
  if(mode==='captain')return '<div class="arcade-memory-hero" aria-hidden="true"><div class="memory-stage"><span class="memory-stage-halo"></span><span class="memory-stage-card memory-stage-card-a"><i>◈</i></span><span class="memory-stage-card memory-stage-card-b"><i>✦</i></span><span class="memory-stage-card memory-stage-card-c"><i>◈</i></span><span class="memory-stage-card memory-stage-card-d"><i>✦</i></span></div><span class="memory-hero-caption">Найдите шесть пар раньше соперников</span></div>';
  return '<div class="arcade-3d-world arcade-world-blitz" role="img" aria-label="Трёхмерный энергетический кристалл для блиц-вопроса">'+ground+
   '<div class="arcade-3d-object arcade-model-blitz">'+
    '<span class="arcade-blitz-facet facet-left"></span><span class="arcade-blitz-facet facet-back"></span>'+
    '<span class="arcade-blitz-facet facet-right"></span><span class="arcade-blitz-bolt">ϟ</span>'+
   '</div><span class="arcade-blitz-ring ring-a"></span><span class="arcade-blitz-ring ring-b"></span></div>';
 }
 function rankMarkup(v){const teams=v?.teams||[],max=Math.max(1,...teams.map(t=>Number(t.points)||0));
  return teams.map((t,i)=>{const d=(v.extra?.players||[]).find(p=>p.team_id===t.id);
   const score=v.mode==='captain'?(d?.completed_ms!=null?(d.completed_ms/1000).toFixed(2)+' сек.':(d?.pairs||0)+'/6 пар'):
    v.mode==='rocket'?(d?.cleared||0)+' препятствий':v.mode==='tug'?Number(t.taps||0).toLocaleString('ru-RU')+' тапов':Number(t.points||0).toFixed(1);
   return '<div class="arcade-rank"><span class="arcade-rank-name" title="'+escape(t.name)+'">'+escape(t.name)+'</span><div class="arcade-rank-track"><div class="arcade-rank-fill" style="--arcade-value:'+Math.max(0,100*(Number(t.points)||0)/max).toFixed(2)+'%;--arcade-team-color:'+COLORS[i%COLORS.length]+'"></div></div><span class="arcade-rank-score">'+score+'</span></div>';}).join('');
 }
 function rootMarkup(mode,kind='player'){const m=META[mode];return '<div class="arcade-shell arcade-'+kind+'" data-arcade-root="'+mode+'">'+
  '<div class="arcade-head"><div><span class="arcade-kicker">QWIZ-PARTY · КОМАНДНОЕ ИСПЫТАНИЕ</span><h2>'+escape(m.title)+'</h2></div><span class="arcade-countdown" data-arcade-clock>—</span></div>'+
  '<p class="arcade-lead">'+escape(m.desc)+'</p><div class="arcade-scene">'+art(mode)+(kind==='player'&&['tug','rocket'].includes(mode)?'<button type="button" class="arcade-tap-btn '+(mode==='tug'?'arcade-tap-center':'arcade-runner-jump-btn')+'" data-arcade-tap disabled>'+escape(m.cta)+'</button>':'')+'</div>'+
  '<div data-arcade-question hidden></div>'+(mode==='captain'&&kind==='player'?'<div class="arcade-memory-info" data-memory-info></div><div class="arcade-memory-board" data-arcade-memory role="group" aria-label="Поле Memory"></div>':'')+'<div class="arcade-ranks" data-arcade-ranks></div>'+
  (kind==='player'?(['tug','rocket'].includes(mode)?'':'<button type="button" class="arcade-tap-btn" data-arcade-tap '+(mode==='captain'?'hidden ':'')+'disabled>'+escape(m.cta)+'</button>')+'<span class="arcade-tap-caption" data-arcade-personal>Синхронизация с игровым сервером…</span>':'')+
  '<div class="arcade-alert" role="status" aria-live="polite" data-arcade-alert>Подключаем результаты…</div><div class="arcade-badges" data-arcade-badges></div><section class="arcade-vote" data-arcade-vote hidden></section></div>';
 }
 function stop(kind){const tr=ui[kind];if(!tr)return;if(tr.interval)clearInterval(tr.interval);if(tr.clock)clearInterval(tr.clock);if(tr.flushTimer)clearTimeout(tr.flushTimer);if(tr.onClick)tr.root?.removeEventListener('click',tr.onClick);tr.closed=true;ui[kind]=null;}
 async function fetchState(tr){if(tr.closed||tr.fetching)return;tr.fetching=true;const id=tr.key;
  try{const {data,error}=await tr.client.rpc('qwiz_party_arcade',{p_code:tr.code});if(error)throw error;if(tr.closed||tr.key!==id)return;
   // A repeated mechanic in a later card is a new game, not a continuation
   // of the previous card's taps, question, selection or pending work.
   if(tr.view?.card_position!==undefined&&tr.view.card_position!==data.card_position){
     tr.pending=0;tr.qkey='';tr.alertOverride=0;
      tr.memoryKey=null;tr.lastJumpTarget=null;tr.gameBusy=false;tr.visualTapCount=0;
     if(tr.flushTimer){clearTimeout(tr.flushTimer);tr.flushTimer=null;}
   }
   tr.view=data;tr.offset=Date.parse(data.server_now)-Date.now();paint(tr);if(tr.kind==='player')paintWallet(data);
  }catch(e){const status=tr.root?.querySelector('[data-arcade-personal]');if(status)status.textContent='Связь с серверным таймером прервана. Повторяем подключение…';showMessage(tr,e.message||'Состояние игры недоступно',true)}finally{tr.fetching=false}
 }
 function showMessage(tr,msg,bad=false){const el=tr.root?.querySelector('[data-arcade-alert]');if(el){el.textContent=msg;el.dataset.error=String(!!bad)}}
 function promptMarkup(q,allow,shown){if(!q)return '';const images=(q.options||[]).map((o,i)=>{const img=o&&typeof o==='object'&&/^https:\/\/\S+$/.test(o.image_url||'')?'<img class="arcade-choice-image" src="'+escape(o.image_url)+'" alt="Вариант '+(i+1)+'">':'<span>'+escape(typeof o==='string'?o:o?.label||'Флаг')+'</span>';
   return '<button type="button" data-arcade-answer="'+i+'" '+(!allow?'disabled':'')+'><span class="arcade-choice-letter">'+String.fromCharCode(65+i)+'</span>'+img+'</button>'}).join('');
  const figure=/^https:\/\/\S+$/.test(q.media_url||'')?'<img class="arcade-choice-image" style="max-height:140px;max-width:100%" src="'+escape(q.media_url)+'" alt="Флаг для блиц-вопроса">':'';
  return '<article class="arcade-question"><span class="arcade-kicker">ДОПОЛНИТЕЛЬНЫЙ ВОПРОС</span><h3>'+escape(q.prompt)+'</h3>'+figure+'<div class="arcade-choices">'+images+'</div>'+
  (shown?'<div class="arcade-reveal">Верный ответ: '+String.fromCharCode(65+Number(q.correct))+'</div>':'')+'</article>';
 }
 function paint(tr){const v=tr.view;if(!v?.mode||tr.closed)return;const now=currentTime(tr),capture=Date.parse(v.capture_until||'')||0,end=Date.parse(v.ends_at||'')||0;
  const valid=v.running&&now<end,claim=v.mode==='blitz'&&now<capture;
  const list=tr.root.querySelector('[data-arcade-ranks]');if(list)list.innerHTML=rankMarkup(v);

  const mine=v.mine||{},myTeam=mine.team_id,leader=(v.teams||[]).find(t=>t.place===1&&Number(t.points)>0),canAnswer=v.mode==='blitz'&&valid&&!claim&&v.blitz_eligible_team===myTeam&&v.answer_correct!==true&&v.question;
  const qroot=tr.root.querySelector('[data-arcade-question]');
  if(qroot){const qkey=v.question?JSON.stringify([v.question.prompt,v.answered_at,v.blitz_attempts,canAnswer,v.question.correct]):'';
   if(tr.qkey!==qkey){tr.qkey=qkey;qroot.hidden=!v.question;qroot.innerHTML=v.question?promptMarkup(v.question,tr.kind==='player'&&canAnswer,v.question.correct!==null&&v.question.correct!==undefined):'';}
  }
  if(v.mode==='captain'&&tr.kind==='player'){
   const board=tr.root.querySelector('[data-arcade-memory]'),info=tr.root.querySelector('[data-memory-info]');
   const m=v.extra||{},enabled=valid&&!!m.captain&&m.completed_ms==null;
   if(info)info.textContent=!m.captain?'Мэмори: играют капитаны, остальные наблюдают.':m.completed_ms!=null?'Готово за '+(m.completed_ms/1000).toFixed(2)+' сек. · '+m.moves+' ходов.':'Найдено '+(m.pairs||0)+'/6 пар · '+(m.moves||0)+' ходов. Откройте две плитки.';
   if(board){const key=JSON.stringify([m.tiles,m.moves,enabled]);if(tr.memoryKey!==key){
    tr.memoryKey=key;board.innerHTML=(m.tiles||[]).map(tile=>'<button type="button" class="arcade-memory-tile'+(tile.matched?' is-matched':'')+(tile.icon?' is-open':'')+'" data-arcade-tile="'+tile.index+'" '+(!enabled||tile.matched||tile.open?'disabled':'')+' aria-label="'+(tile.icon?'Открытая':'Закрытая')+' плитка '+(tile.index+1)+'"><span class="arcade-memory-tile-inner"><span class="arcade-memory-back">✦</span><span class="arcade-memory-front">'+escape(tile.icon||'')+'</span></span></button>').join('');
   }}
  }
  if(v.mode==='rocket'){const run=v.extra||{},figure=tr.root.querySelector('[data-runner-character]');
   if(figure)figure.classList.toggle('runner-eliminated',!!run.selected&&!run.alive);
   const obstacle=tr.root.querySelector('[data-runner-obstacle]');if(obstacle)obstacle.hidden=!run.next_at||!!run.selected&&!run.alive;}
  const tap=tr.root.querySelector('[data-arcade-tap]');
  if(tap){let eligible=valid&&(v.mode!=='blitz'||claim)&&!!myTeam;
   if(v.mode==='captain')eligible=false;if(v.mode==='rocket')eligible=eligible&&!!v.extra?.selected&&!!v.extra?.alive;
   tap.disabled=!eligible;tap.textContent=META[v.mode].cta;
   const personal=tr.root.querySelector('[data-arcade-personal]');
    if(personal)personal.textContent=v.mode==='captain'?(v.extra?.captain?'Переворачивайте по две плитки.':'Наблюдайте за вашим капитаном.'):v.mode==='rocket'?(v.extra?.selected?(v.extra.alive?'Вы бегун! Прыгайте перед препятствием.':'Столкновение. Сравниваем результаты.'):'От команды выбран один случайный бегун.'):v.mode==='blitz'&&!claim?(canAnswer?'Ваша команда выиграла захват! Выберите ответ.':'Захват завершён. Смотрите рейтинг.'):'Все игроки нажимают. До 8 нажатий в секунду на человека.';
  }
  const badges=tr.root.querySelector('[data-arcade-badges]');if(badges)badges.innerHTML=(v.awards||[]).slice(0,12).map(a=>'<span class="arcade-award">'+escape(a.title)+' · +'+Number(a.credits)+' жет.</span>').join('');
  const vote=v.vote,ballot=tr.root.querySelector('[data-arcade-vote]');
  // The ballot replaces the spent arcade scene on a player's phone; never send it below the viewport.
  tr.root.querySelector('.arcade-shell.arcade-player')?.classList.toggle('is-boost-voting',Boolean(vote&&tr.kind==='player'&&vote.can_vote));
  if(ballot){
   ballot.hidden=!vote;
   if(vote){
    const champion=(v.teams||[]).find(t=>t.id===vote.winner_team);
    const tally=vote.counts||{},mine=vote.my_choice;
    const remaining=Math.max(0,Math.ceil((Date.parse(vote.vote_ends_at)-currentTime(tr))/1000));
    const strategyStage=vote.stage==='strategy';
    const selections=strategyStage?STRATEGIES:vote.strategy==='sabotage'?HINDRANCES:vote.strategy==='support'?BOOSTS:[];
    const canChoose=tr.kind==='player'&&vote.can_vote&&vote.open&&remaining>0;
    const tone=vote.strategy==='sabotage'?'harm':'boost';
    const title=strategyStage?'Что выбирает команда?':vote.strategy==='sabotage'?'Выберите ограничение сопернику':'Выберите усиление своей команде';
    const subtitle=strategyStage?'ЭТАП 1 / 2 · СТРАТЕГИЯ': 'ЭТАП 2 / 2 · КОНКРЕТНЫЙ ЭФФЕКТ';
    ballot.setAttribute('role','dialog');ballot.setAttribute('aria-label','Голосование за командное преимущество');
    ballot.className='arcade-vote '+(strategyStage?'arcade-vote-strategy ':'arcade-vote-effects ')+(vote.strategy==='sabotage'?'is-harm':'is-boost');
    ballot.innerHTML='<div class="arcade-vote-title"><span>'+subtitle+' · 🏆 '+escape(champion?.name||'Лидеры')+'</span>'+
      '<strong>'+escape(title)+'</strong>'+
      '<p>'+(strategyStage?'Победившая команда выбирает: зелёный путь усиливает себя, красный накладывает штраф на соперника.':'Выберите конкретный бонус или штраф. Он применяется в следующем раунде.')+' Нажмите вариант, голосование решается большинством. До 15 секунд на два этапа. '+(vote.target_name?'Соперник: '+escape(vote.target_name)+'. ':'')+'Осталось '+remaining+' сек.</p></div>'+
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
  const status=v.awarded_at?'Результат зафиксирован. Награды зачислены.':
   !v.running?'Соревнование завершено.':
   v.mode==='blitz'?(claim?'Борьба за право ответа.':v.answer_correct===true?'Правильный ответ! Блиц завершён.':v.blitz_eligible_team===null?'Попытки закончились.':canAnswer?'Ваш ход! Ответьте на блиц-вопрос.':'Право ответа у команды '+escape((v.teams||[]).find(t=>t.id===v.blitz_eligible_team)?.name||'лидера')+'.') :
   v.mode==='captain'?'Все капитаны одновременно ищут пары. Учитываются время и ходы.':
   !valid?'Время вышло. Ведущий продолжит игру.':'Идёт командная битва! Показатели обновляются автоматически.';
  if(!tr.alertOverride||Date.now()>tr.alertOverride)showMessage(tr,status);
  tick(tr);
 }
 function tick(tr){const v=tr.view;if(!v||tr.closed)return;
  const clock=tr.root.querySelector('[data-arcade-clock]');const sec=left(v.ends_at,tr);
  if(clock){clock.textContent=sec+' сек.';clock.dataset.urgent=String(sec<=3);}
  if(v.mode==='rocket'){const obstacle=tr.root.querySelector('[data-runner-obstacle]');if(obstacle&&!obstacle.hidden){const dt=(Date.parse(v.extra?.next_at)-currentTime(tr))/1000;obstacle.style.left=(20+78*Math.max(0,Math.min(1,dt/2.25)))+'%';}}
  const button=tr.root.querySelector('[data-arcade-tap]');
  if(button&&sec===0)button.disabled=true;
 }
 function activate(kind,root,code,roomId,client,mode){
  if(!root||!client||!META[mode])return;
  const key=code+':'+mode+':'+(kind==='player'?roomId||'':'');
  if(ui[kind]?.key===key&&ui[kind].root===root)return;
  stop(kind);
  const tr={kind,key,root,code,roomId,client,mode,offset:0,closed:false,fetching:false,pending:0,sending:false,view:null,flushTimer:null,qkey:''};
  ui[kind]=tr;root.innerHTML=rootMarkup(mode,kind);
  if(kind==='player'){tr.onClick=e=>{
    if(e.target.closest('[data-arcade-tap]'))tap(tr);const tile=e.target.closest('[data-arcade-tile]');if(tile)flip(tr,Number(tile.dataset.arcadeTile));
    const opt=e.target.closest('[data-arcade-answer]');if(opt)answer(tr,Number(opt.dataset.arcadeAnswer));
    const boost=e.target.closest('[data-boost-choice]');if(boost)voteBoost(tr,boost.dataset.boostChoice);
   };root.addEventListener('click',tr.onClick);}
  fetchState(tr);tr.interval=setInterval(()=>fetchState(tr),kind==='screen'?1300:1600);
  tr.clock=setInterval(()=>tick(tr),120);
 }
 async function voteBoost(tr,choice){
  if(tr.closed||tr.voteBusy||!tr.roomId||!ALL_VOTES.some(x=>x[0]===choice))return;
  tr.voteBusy=true;
  try{const {error}=await tr.client.rpc('qwiz_vote_boost',{p_room:tr.roomId,p_choice:choice});
   if(error)throw error;await fetchState(tr)
  }catch(e){showMessage(tr,e.message||'Голос не принят',true);tr.alertOverride=Date.now()+5000}
  finally{tr.voteBusy=false}
 }
 function animateTap(tr){
  const scene=tr.root.querySelector('.arcade-scene'),button=tr.root.querySelector('[data-arcade-tap]');
  if(!scene||!button)return;
  const now=Date.now();if(now-(tr.lastVisualTap||0)<95)return;
  tr.lastVisualTap=now;
  scene.classList.remove('arcade-burst-active');
  void scene.offsetWidth;scene.classList.add('arcade-burst-active');
  const fleck=document.createElement('span');fleck.className='arcade-tap-particle';
  fleck.textContent='✦';
  const spread=(tr.visualTapCount=(tr.visualTapCount||0)+1)*29%70-35;
  fleck.style.setProperty('--arcade-particle-x',spread+'px');
  scene.appendChild(fleck);
  setTimeout(()=>{fleck.remove();scene.classList.remove('arcade-burst-active')},700);
 }
 function tap(tr){const v=tr.view;if(tr.closed||!v||!v.running||!v.mine)return;
  const now=currentTime(tr),end=Date.parse(v.ends_at)||0;
  if(now>end)return;
  if(v.mode==='blitz'&&now>(Date.parse(v.capture_until)||0))return;
  animateTap(tr);
  if(v.mode==='captain')return;if(v.mode==='rocket'){jump(tr);return;}
  tr.pending=Math.min(24,tr.pending+1);
  const label=tr.root.querySelector('[data-arcade-personal]');
  if(label)label.textContent='Нажатие получено · передаём очки серверу…';
  // Start the first batch promptly while keeping subsequent batches below
  // the server's eight-clicks-per-second acceptance limit.
  if(!tr.flushTimer)tr.flushTimer=setTimeout(()=>flush(tr),220);
 }
 async function flush(tr){if(tr.closed)return;tr.flushTimer=null;if(tr.sending||!tr.pending)return;
  const amount=Math.min(6,tr.pending);tr.pending-=amount;await sendTap(tr,amount);
  if(tr.pending&&!tr.flushTimer)tr.flushTimer=setTimeout(()=>flush(tr),700);
 }
 async function sendTap(tr,count){if(tr.sending||tr.closed)return;tr.sending=true;
  try{const {data,error}=await tr.client.rpc('qwiz_arcade_action',{p_room:tr.roomId,p_action:'tap',p_count:count});if(error)throw error;
   if(data?.false_start){showMessage(tr,'Фальстарт! Попытка капитана использована.',true);tr.alertOverride=Date.now()+3000;}
  }catch(e){showMessage(tr,e.message||'Не удалось засчитать нажатие',true);tr.alertOverride=Date.now()+2500;}
  finally{tr.sending=false;if(tr.pending&&!tr.flushTimer&&!tr.closed)tr.flushTimer=setTimeout(()=>flush(tr),750)}
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
 function flip(tr,index){const v=tr.view;if(!v?.running||!v.extra?.captain||v.extra.completed_ms!=null)return;gameAction(tr,'flip',index);}
 function jump(tr){const v=tr.view;if(!v?.running||!v.extra?.selected||!v.extra?.alive)return;
  const k=v.extra.next_at;if(tr.lastJumpTarget===k||tr.gameBusy)return;tr.lastJumpTarget=k;
  const sprite=tr.root.querySelector('[data-runner-character]');
  if(sprite){sprite.classList.remove('runner-jump');void sprite.offsetWidth;sprite.classList.add('runner-jump');}
  gameAction(tr,'jump');
 }
 async function answer(tr,choice){if(tr.closed||tr.answerBusy)return;tr.answerBusy=true;
  try{const {data,error}=await tr.client.rpc('qwiz_arcade_action',{p_room:tr.roomId,p_action:'answer',p_choice:choice});if(error)throw error;
   showMessage(tr,data.correct?'Правильный ответ! +80 очков и достижение.':'Ответ неверный. Ход переходит следующей команде.',!data.correct);
   tr.alertOverride=Date.now()+3500;await fetchState(tr);
  }catch(e){showMessage(tr,e.message||'Ответ отклонён',true);tr.alertOverride=Date.now()+3200}
  finally{tr.answerBusy=false}
 }
 function mountPlayer(el,s,ctx){if(!isArcade(s.activity))return false;activate('player',el,s.code,s.room_id,ctx.client,s.activity.settings.arcade_mode);return true;}
 function mountProjector(el,s,client){if(!isArcade(s.activity))return false;activate('screen',el,s.code,null,client,s.activity.settings.arcade_mode);return true;}
 function mountHost(el,s,client){if(!el)return;if(s.phase==='intermission'&&isArcade(s.activity)){el.hidden=false;activate('host',el,s.code,s.room_id,client,s.activity.settings.arcade_mode)}else{el.hidden=true;stop('host')}}
 const UPGRADES=[['turbo','Ускоритель (архив)',15,'Не влияет на новую игру'],['grip','Хват (архив)',15,'Не влияет на число тапов'],['navigator','Навигатор',20,'+10% к результату захвата блиц-вопроса']];
 function paintWallet(view){wallet.view=view;
  const el=document.getElementById('arcadeWalletPanel');if(!el)return;
  if(!view?.mine){el.hidden=true;return}
  const mine=view.mine;el.hidden=false;
  el.innerHTML='<div class="arcade-wallet-title"><span>Командная мастерская</span><span class="arcade-wallet-total">'+Number(mine.credits||0)+' жетонов</span></div>'+
   '<div class="arcade-store">'+UPGRADES.map(([id,title,price,desc])=>
     '<button type="button" data-arcade-buy="'+id+'" '+(mine[id]||['turbo','grip'].includes(id)||mine.credits<price||wallet.phase==='intermission'?'disabled':'')+'><strong>'+
     escape(title)+'</strong><span>'+escape(desc)+'</span><span>'+ (mine[id]?'Приобретено':'Купить · '+price+' жет.')+'</span></button>').join('')+'</div>'+
    '<div class="arcade-badges">'+(mine.achievements||[]).slice(0,6).map(a=>'<span class="arcade-award">'+escape(a.title)+' · +'+Number(a.credits)+'</span>').join('')+'</div>';
  if(!el.dataset.arcadeWired){el.dataset.arcadeWired='1';el.addEventListener('click',async e=>{
    const button=e.target.closest('[data-arcade-buy]');if(!button||wallet.busy)return;
    wallet.busy=true;button.disabled=true;
    try{const {error}=await wallet.client.rpc('qwiz_arcade_action',{p_room:wallet.roomId,p_action:'buy',p_upgrade:button.dataset.arcadeBuy});
     if(error)throw error;wallet.lastFetch=0;await syncWallet({code:wallet.code,room_id:wallet.roomId,phase:wallet.phase},{client:wallet.client});
    }catch(err){el.insertAdjacentHTML('beforeend','<p class="arcade-alert" data-error="true">'+escape(err.message)+'</p>')}finally{wallet.busy=false}
   });}
 }
 async function syncWallet(s,ctx){if(!s?.code||!ctx?.client)return;wallet.phase=s.phase;
  if(s.phase==='intermission'&&isArcade(s.activity)){if(ui.player?.view)paintWallet(ui.player.view);return}
  wallet.code=s.code;wallet.roomId=s.room_id;wallet.client=ctx.client;
  if(wallet.busy||Date.now()-wallet.lastFetch<3200)return;
  wallet.lastFetch=Date.now();
  try{const {data,error}=await ctx.client.rpc('qwiz_party_arcade',{p_code:s.code});if(!error)paintWallet(data)}catch{}
 }
 return {isArcade,mountPlayer,mountProjector,mountHost,syncWallet,stop};
})();
