'use strict';
/* QWIZ-PARTY: synchronised team arcade. Client shows state; Postgres owns scores, boosts and achievements. */
window.QwizArcade=(()=>{
 const META={
  rocket:{title:'Ракетная гонка',desc:'Быстрее разгоните ракету. Сравнивается средний вклад игроков; победитель выбирает усиление следующего раунда.',cta:'ЗАРЯДИТЬ РАКЕТУ'},
  blitz:{title:'Блиц-вопрос',desc:'Захватите право ответить первыми. Команда-победитель получит право проголосовать за усиление следующего раунда.',cta:'ЗАХВАТИТЬ ВОПРОС'},
  tug:{title:'Перетягивание очков',desc:'Перетяните канат и получите преимущество. Победители также голосуют за усиление следующего раунда.',cta:'ТЯНУТЬ!'},
  captain:{title:'Дуэль капитанов',desc:'Один сигнал — одно нажатие капитана. Самый быстрый побеждает, его команда голосует за усиление следующего раунда.',cta:'УДАР!'}
 };
 const COLORS=['#9470e2','#54a3d8','#e6a95d','#76ad83','#ea7f9b','#8291db','#bb86c8'];
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const BOOSTS=[['headstart','Фора +12','12 очков в начале следующего раунда'],['teamwork','Командный рывок','+3 очка за члена команды, максимум 24'],['momentum','Импульс','+15% к текущим очкам, максимум 30']];
  const ui={player:null,screen:null,host:null};let wallet={code:null,client:null,roomId:null,lastFetch:0,busy:false,view:null};
 const isArcade=a=>!!META[a?.settings?.arcade_mode];
 function modeTitle(mode){return META[mode]?.title||'Командная игра'}
 const currentTime=tr=>Date.now()+(tr.offset||0);
 // Avoid ambiguous operator precedence: timestamps are always milliseconds.
 const left=(end,tr)=>Math.max(0,Math.ceil(((Date.parse(end)||0)-currentTime(tr))/1000));
 function art(mode){
  if(mode==='rocket')return '<svg class="arcade-rocket-art" viewBox="0 0 440 150" role="img" aria-label="Ракета летит к финишу"><path d="M10 112H430" stroke="#d6ccec" stroke-width="4" stroke-dasharray="7 9"/><circle cx="390" cy="42" r="25" fill="#eee5ff"/><circle cx="390" cy="42" r="10" fill="#d8c7f5"/><g transform="translate(110,15) rotate(-12 100 60)"><path class="arcade-flame" d="M55 69 4 60l49-21Z" fill="#ffbc71"/><path d="m53 40 51-22c48-15 67-12 103-7-4 38-24 62-63 76L72 85Z" fill="#8667d5"/><path d="M99 24 75 2l-17 5 13 33m48 44-4 35-19 6-19-45" fill="#bba9ed"/><circle cx="149" cy="43" r="17" fill="#faf6ff"/><circle cx="149" cy="43" r="9" fill="#b9e3ff"/></g></svg>';
  if(mode==='tug')return '<div class="arcade-rope" data-rope style="--arcade-progress:50%" role="img" aria-label="Общий канат, отметка показывает преимущество"></div>';
  if(mode==='captain')return '<div class="arcade-king" aria-hidden="true"><svg viewBox="0 0 120 120" width="110" height="110" fill="none" stroke="#8165d3" stroke-width="6" stroke-linejoin="round"><path d="m15 40 19 20 26-35 26 35 19-20-10 56H25L15 40Z"/><path d="M26 100h68"/></svg></div><div class="arcade-captain-ready" data-reflex-signal>ГОТОВЬТЕСЬ</div>';
  return '<div class="arcade-king" aria-hidden="true"><svg viewBox="0 0 120 120" width="114" height="114" fill="none" stroke="#8165d3" stroke-width="6" stroke-linejoin="round"><path d="M61 10 25 69h31l-6 41 45-67H62l-1-33Z"/></svg></div>';
 }
 function rankMarkup(v){const teams=v?.teams||[],max=Math.max(1,...teams.map(t=>Number(t.points)||0));
  return teams.map((t,i)=>'<div class="arcade-rank"><span class="arcade-rank-name" title="'+escape(t.name)+'">'+escape(t.name)+'</span><div class="arcade-rank-track"><div class="arcade-rank-fill" style="--arcade-value:'+Math.max(0,100*(Number(t.points)||0)/max).toFixed(2)+'%;--arcade-team-color:'+COLORS[i%COLORS.length]+'"></div></div><span class="arcade-rank-score">'+(v.mode==='captain'?(t.points>0?(10000-Number(t.points)).toFixed(0)+' мс':'—'):Number(t.points||0).toFixed(1))+'</span></div>').join('');
 }
 function rootMarkup(mode,kind='player'){const m=META[mode];return '<div class="arcade-shell arcade-'+kind+'" data-arcade-root="'+mode+'">'+
  '<div class="arcade-head"><div><span class="arcade-kicker">QWIZ-PARTY · КОМАНДНОЕ ИСПЫТАНИЕ</span><h2>'+escape(m.title)+'</h2></div><span class="arcade-countdown" data-arcade-clock>—</span></div>'+
  '<p class="arcade-lead">'+escape(m.desc)+'</p><div class="arcade-scene">'+art(mode)+'</div>'+
  '<div data-arcade-question hidden></div><div class="arcade-ranks" data-arcade-ranks></div>'+
  (kind==='player'?'<button type="button" class="arcade-tap-btn" data-arcade-tap>'+escape(m.cta)+'</button><span class="arcade-tap-caption" data-arcade-personal>Ждём команды…</span>':'')+
  '<div class="arcade-alert" role="status" aria-live="polite" data-arcade-alert>Подключаем результаты…</div><div class="arcade-badges" data-arcade-badges></div><section class="arcade-vote" data-arcade-vote hidden></section></div>';
 }
 function stop(kind){const tr=ui[kind];if(!tr)return;if(tr.interval)clearInterval(tr.interval);if(tr.clock)clearInterval(tr.clock);if(tr.flushTimer)clearTimeout(tr.flushTimer);if(tr.onClick)tr.root?.removeEventListener('click',tr.onClick);tr.closed=true;ui[kind]=null;}
 async function fetchState(tr){if(tr.closed||tr.fetching)return;tr.fetching=true;const id=tr.key;
  try{const {data,error}=await tr.client.rpc('qwiz_party_arcade',{p_code:tr.code});if(error)throw error;if(tr.closed||tr.key!==id)return;
   tr.view=data;tr.offset=Date.parse(data.server_now)-Date.now();paint(tr);if(tr.kind==='player')paintWallet(data);
  }catch(e){showMessage(tr,e.message||'Состояние игры недоступно',true)}finally{tr.fetching=false}
 }
 function showMessage(tr,msg,bad=false){const el=tr.root?.querySelector('[data-arcade-alert]');if(el){el.textContent=msg;el.dataset.error=String(!!bad)}}
 function sceneProgress(tr,v){if(v.mode==='rocket'){const lead=Math.max(0,...(v.teams||[]).map(t=>Number(t.points)||0));const rocket=tr.root.querySelector('.arcade-rocket-art');if(rocket)rocket.style.setProperty('--arcade-progress',Math.min(100,lead*7));}
  if(v.mode==='tug'){const teams=v.teams||[],first=Number(teams[0]?.points)||0,last=Number(teams.at(-1)?.points)||0,mark=first+last>0?50+40*(first-last)/(first+last):50;const rope=tr.root.querySelector('[data-rope]');if(rope)rope.style.setProperty('--arcade-progress',Math.max(10,Math.min(90,mark))+'%');}
 }
 function promptMarkup(q,allow,shown){if(!q)return '';const images=(q.options||[]).map((o,i)=>{const img=o&&typeof o==='object'&&/^https:\/\/\S+$/.test(o.image_url||'')?'<img class="arcade-choice-image" src="'+escape(o.image_url)+'" alt="Вариант '+(i+1)+'">':'<span>'+escape(typeof o==='string'?o:o?.label||'Флаг')+'</span>';
   return '<button type="button" data-arcade-answer="'+i+'" '+(!allow?'disabled':'')+'><span class="arcade-choice-letter">'+String.fromCharCode(65+i)+'</span>'+img+'</button>'}).join('');
  const figure=/^https:\/\/\S+$/.test(q.media_url||'')?'<img class="arcade-choice-image" style="max-height:140px;max-width:100%" src="'+escape(q.media_url)+'" alt="Флаг для блиц-вопроса">':'';
  return '<article class="arcade-question"><span class="arcade-kicker">ДОПОЛНИТЕЛЬНЫЙ ВОПРОС</span><h3>'+escape(q.prompt)+'</h3>'+figure+'<div class="arcade-choices">'+images+'</div>'+
  (shown?'<div class="arcade-reveal">Верный ответ: '+String.fromCharCode(65+Number(q.correct))+'</div>':'')+'</article>';
 }
 function paint(tr){const v=tr.view;if(!v?.mode||tr.closed)return;const now=currentTime(tr),capture=Date.parse(v.capture_until||'')||0,end=Date.parse(v.ends_at||'')||0;
  const valid=v.running&&now<end,claim=v.mode==='blitz'&&now<capture;
  const list=tr.root.querySelector('[data-arcade-ranks]');if(list)list.innerHTML=rankMarkup(v);
  sceneProgress(tr,v);
  const mine=v.mine||{},myTeam=mine.team_id,leader=(v.teams||[]).find(t=>t.place===1&&Number(t.points)>0),canAnswer=v.mode==='blitz'&&valid&&!claim&&v.blitz_eligible_team===myTeam&&v.answer_correct!==true&&v.question;
  const qroot=tr.root.querySelector('[data-arcade-question]');
  if(qroot){const qkey=v.question?JSON.stringify([v.question.prompt,v.answered_at,v.blitz_attempts,canAnswer,v.question.correct]):'';
   if(tr.qkey!==qkey){tr.qkey=qkey;qroot.hidden=!v.question;qroot.innerHTML=v.question?promptMarkup(v.question,tr.kind==='player'&&canAnswer,v.question.correct!==null&&v.question.correct!==undefined):'';}
  }
  const tap=tr.root.querySelector('[data-arcade-tap]');
  if(tap){let eligible=valid&&(v.mode!=='blitz'||claim)&&!!myTeam;
   if(v.mode==='captain')eligible=eligible&&mine.captain;
   tap.disabled=!eligible;tap.textContent=v.mode==='captain'?(mine.captain?'НАЖАТЬ ПО СИГНАЛУ':'ОЖИДАЕМ КАПИТАНА'):META[v.mode].cta;
   const personal=tr.root.querySelector('[data-arcade-personal]');
   if(personal)personal.textContent=v.mode==='captain'?(mine.captain?'Вы капитан. Приготовьтесь к сигналу.':'Дуэль проводит капитан команды.'):v.mode==='blitz'&&!claim?(canAnswer?'Ваша команда выиграла захват! Выберите ответ.':'Захват завершён. Проверьте команду-победителя.'):'Нажатия засчитываются сервером, максимум 8 за секунду.';
  }
  const badges=tr.root.querySelector('[data-arcade-badges]');if(badges)badges.innerHTML=(v.awards||[]).slice(0,12).map(a=>'<span class="arcade-award">'+escape(a.title)+' · +'+Number(a.credits)+' жет.</span>').join('');
  const vote=v.vote,ballot=tr.root.querySelector('[data-arcade-vote]');
  if(ballot){
   ballot.hidden=!vote;
   if(vote){
    const champion=(v.teams||[]).find(t=>t.id===vote.winner_team);
    const tally=vote.counts||{},mine=vote.my_choice;
    const remaining=Math.max(0,Math.ceil((Date.parse(vote.vote_ends_at)-currentTime(tr))/1000));
    ballot.innerHTML='<div class="arcade-vote-title"><span>🏆 ПОБЕДИТЕЛЬ · '+escape(champion?.name||'Команда')+'</span><strong>Усиление на следующий раунд</strong><p>Голосование всех участников команды · требуется больше половины голосов · осталось '+remaining+' с</p></div>'+
      '<div class="arcade-boost-grid">'+BOOSTS.map(([id,title,description])=>'<button type="button" data-boost-choice="'+id+'" '+(!(tr.kind==='player'&&vote.can_vote&&vote.open)||tr.voteBusy?'disabled':'')+' class="'+(mine===id?'selected':'')+'"><strong>'+escape(title)+'</strong><span>'+escape(description)+'</span><b>'+Number(tally[id]||0)+' голосов</b></button>').join('')+'</div>'+
      '<p class="arcade-vote-rule">'+(vote.open?(vote.can_vote?'Выберите одно усиление. Голос можно изменить до конца времени.':'Голосуют только игроки победившей команды.'):'Голосование завершено. Усиление с большинством голосов активируется в следующем раунде; без большинства бонус не выдаётся.')+'</p>';
   }
  }
  const status=v.awarded_at?'Результат зафиксирован. Награды зачислены.':
   !v.running?'Соревнование завершено.':
   v.mode==='blitz'?(claim?'Борьба за право ответа.':v.answer_correct===true?'Правильный ответ! Блиц завершён.':v.blitz_eligible_team===null?'Попытки закончились.':canAnswer?'Ваш ход! Ответьте на блиц-вопрос.':'Право ответа у команды '+escape((v.teams||[]).find(t=>t.id===v.blitz_eligible_team)?.name||'лидера')+'.') :
   v.mode==='captain'&&now<Date.parse(v.started_at)+3000?'Не нажимайте до сигнала — фальстарт лишает попытки.':
   !valid?'Время вышло. Ведущий продолжит игру.':'Идёт командная битва! Показатели обновляются автоматически.';
  if(!tr.alertOverride||Date.now()>tr.alertOverride)showMessage(tr,status);
  tick(tr);
 }
 function tick(tr){const v=tr.view;if(!v||tr.closed)return;
  const clock=tr.root.querySelector('[data-arcade-clock]');const sec=left(v.ends_at,tr);
  if(clock){clock.textContent=sec+' c';clock.dataset.urgent=String(sec<=3);}
  if(v.mode==='captain'){const signal=tr.root.querySelector('[data-reflex-signal]');if(signal){const prep=Math.max(0,Math.ceil((Date.parse(v.started_at)+3000-currentTime(tr))/1000));signal.textContent=prep?prep+'…':'ЖМИ!';signal.classList.toggle('go',prep===0)}}
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
    if(e.target.closest('[data-arcade-tap]'))tap(tr);
    const opt=e.target.closest('[data-arcade-answer]');if(opt)answer(tr,Number(opt.dataset.arcadeAnswer));
    const boost=e.target.closest('[data-boost-choice]');if(boost)voteBoost(tr,boost.dataset.boostChoice);
   };root.addEventListener('click',tr.onClick);}
  fetchState(tr);tr.interval=setInterval(()=>fetchState(tr),kind==='screen'?1300:1600);
  tr.clock=setInterval(()=>tick(tr),120);
 }
 async function voteBoost(tr,choice){
  if(tr.closed||tr.voteBusy||!tr.roomId||!BOOSTS.some(x=>x[0]===choice))return;
  tr.voteBusy=true;
  try{const {error}=await tr.client.rpc('qwiz_vote_boost',{p_room:tr.roomId,p_choice:choice});
   if(error)throw error;await fetchState(tr)
  }catch(e){showMessage(tr,e.message||'Голос не принят',true);tr.alertOverride=Date.now()+5000}
  finally{tr.voteBusy=false}
 }
 function tap(tr){const v=tr.view;if(tr.closed||!v||!v.running||!v.mine)return;
  const now=currentTime(tr),end=Date.parse(v.ends_at)||0;
  if(now>end)return;
  if(v.mode==='blitz'&&now>(Date.parse(v.capture_until)||0))return;
  if(v.mode==='captain'){sendTap(tr,1);return;}
  tr.pending=Math.min(24,tr.pending+1);
  if(!tr.flushTimer)tr.flushTimer=setTimeout(()=>flush(tr),750);
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
 const UPGRADES=[['turbo','Ракетный ускоритель',15,'+20% к ракетной гонке'],['grip','Усиленный хват',15,'+20% в перетягивании'],['navigator','Навигатор',20,'+10% в командных тап-раундах']];
 function paintWallet(view){wallet.view=view;
  const el=document.getElementById('arcadeWalletPanel');if(!el)return;
  if(!view?.mine){el.hidden=true;return}
  const mine=view.mine;el.hidden=false;
  el.innerHTML='<div class="arcade-wallet-title"><span>Командная мастерская</span><span class="arcade-wallet-total">'+Number(mine.credits||0)+' жетонов</span></div>'+
   '<div class="arcade-store">'+UPGRADES.map(([id,title,price,desc])=>
     '<button type="button" data-arcade-buy="'+id+'" '+(mine[id]||mine.credits<price||wallet.phase==='intermission'?'disabled':'')+'><strong>'+
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
