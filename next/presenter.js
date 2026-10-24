'use strict';
// Public audience screen. Never asks for the teacher's login or answer keys.
// The shared room code grants READ-ONLY projection, not administrative control.
const SUPABASE_URL='https://bderfrcfuhnutuoyudje.supabase.co';
const KEY='sb_publishable_Hv7NgYuVsfKhFuhX_9pl0Q_qXWA2wOr';
let room=new URLSearchParams(location.search).get('room')?.trim().toUpperCase()||'';
const $=id=>document.getElementById(id);
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={client:null,last:null,channel:null,local:null,checking:false,timer:null,previousQuestion:-2,finalStep:0,finalTimer:null,sound:false,audio:null,lastReleaseAttempt:0,offset:0,renderKey:''};
const seconds=t=>Math.max(0,Math.ceil((Date.parse(t)-Date.now()-ctx.offset)/1000))||0;
function showError(s){$('projectionError').textContent=s;$('projectionError').hidden=false}
function clearError(){$('projectionError').hidden=true}
function qr(div,url){if(typeof QRCode==='function'&&div){div.replaceChildren();new QRCode(div,{text:url,width:240,height:240,colorLight:'#fff',colorDark:'#27302b',correctLevel:QRCode.CorrectLevel.M})}}
function link(code){const u=new URL('./',location.href);u.searchParams.set('room',code);return u.toString()}
const recentRoomKey='qwiz-presenter-recent-room';
const roomPattern=/^[A-F0-9]{8}$/;
function joinHref(code=''){return roomPattern.test(code||'')?link(code):new URL('./',location.href).toString()}
function rememberRoom(code){
 try{if(roomPattern.test(code||''))sessionStorage.setItem(recentRoomKey,code)}
 catch{}
}
function openJoinQr(code=''){
 const href=joinHref(code),dialog=$('projectionQrDialog');
 qr($('projectionQrZoom'),href);
 $('projectionQrRoom').textContent=roomPattern.test(code||'')?code:'пока не создан';
 $('projectionQrLink').href=href;
 $('projectionQrLink').textContent=href;
 $('projectionQrCopyStatus').textContent='';
 if(!dialog.open)dialog.showModal();
}
function setup(){
 $('projectionRoom').textContent='';
 $('projectionJoinQr').hidden=true;
 const root=$('projectionMain');
 root.innerHTML='<section class="projection-setup"><div class="projection-eyebrow">QWIZ-PARTY / ЭКРАН АУДИТОРИИ</div>'+
 '<h1>Присоединяйтесь к игре!</h1><p>Наведите камеру телефона на QR-код. Код комнаты появится автоматически, когда преподаватель создаст игру.</p>'+
 '<div class="projection-setup-grid"><section class="projection-setup-form" aria-labelledby="projectionActiveTitle">'+
 '<div class="projection-current-room"><span id="projectionActiveTitle" class="projection-active-label">ТЕКУЩАЯ ИГРА</span>'+
 '<strong id="projectionActiveCode" class="projection-active-code" aria-live="polite">— — — — — — — —</strong>'+
 '<span id="projectionActiveName" class="projection-active-name">Комната ещё не создана</span></div>'+
 '<button id="projectionOpenGame" type="button" disabled>Открыть игру →</button>'+
 '<p id="projectionAutoStatus" class="projection-auto-status" role="status" aria-live="polite">Ожидаем запуска игры преподавателем. QR уже доступен.</p>'+
 '<details class="projection-manual-choice"><summary>Выбрать другую комнату вручную</summary><form id="projectionJoin" class="projection-switch-form"><label for="projectionCode">Код другой комнаты</label>'+
 '<div class="projection-switch-row"><input id="projectionCode" maxlength="8" pattern="[A-Fa-f0-9]{8}" placeholder="Код комнаты" autocomplete="off" spellcheck="false" inputmode="text">'+
 '<button type="submit">Переключиться</button></div>'+
 '<span id="projectionInputStatus" role="status" aria-live="polite">Вводить код для QR не требуется.</span></form></details></section>'+
 '<aside class="projection-quick-qr" aria-labelledby="projectionSetupQrTitle"><span class="projection-quick-qr-eyebrow">БЫСТРЫЙ ВХОД</span>'+
 '<h2 id="projectionSetupQrTitle">Подключиться с телефона</h2>'+
 '<button type="button" id="projectionSetupQrOpen" class="projection-quick-qr-button" aria-label="Увеличить QR-код входа в игру">'+
 '<span id="projectionSetupQrImage" class="projection-quick-qr-image"></span>'+
 '<span id="projectionSetupQrZoomLabel" class="projection-quick-qr-action">Увеличить QR ↗</span></button>'+
 '<p id="projectionSetupQrHint" class="projection-quick-qr-hint">QR открыт сразу. Когда появится игра, ссылка обновится автоматически.</p>'+
 '<a id="projectionSetupQrLink" class="projection-quick-qr-link" target="_blank" rel="noopener">Открыть ссылку игрока ↗</a></aside></div></section>';
 const input=$('projectionCode'),status=$('projectionInputStatus'),hint=$('projectionSetupQrHint');
 let selectedCode='',manualPinned=false,checking=false,manualRequest=0,autoRequest=0;
 let renderedHref='';
 function paintQr(){
  const href=joinHref(selectedCode);
  if(href===renderedHref)return;
  renderedHref=href;
  qr($('projectionSetupQrImage'),href);
  $('projectionSetupQrLink').href=href;
  hint.textContent=selectedCode
   ?'Сканируйте: телефон откроет комнату '+selectedCode+'.'
   :'QR работает без кода и открывает вход в QWIZ-PARTY. Ссылка обновится при создании игры.';
 }
 function showRoom(code,title='',source='auto'){
  if(!roomPattern.test(code||''))return;
  selectedCode=code;rememberRoom(code);
  $('projectionActiveCode').textContent=code;
  $('projectionActiveName').textContent=title||'Игра доступна';
  $('projectionOpenGame').disabled=false;
  $('projectionAutoStatus').textContent=source==='manual'
   ?'Комната выбрана вручную. QR обновлён.'
   :'Комната найдена автоматически. QR ведёт прямо в неё.';
  paintQr();
 }
 function clearAuto(){
  if(manualPinned)return;
  selectedCode='';
  $('projectionActiveCode').textContent='— — — — — — — —';
  $('projectionActiveName').textContent='Комната ещё не создана';
  $('projectionOpenGame').disabled=true;
  $('projectionAutoStatus').textContent='Ожидаем запуска игры преподавателем. QR уже доступен.';
  paintQr();
 }
 function client(){
  if(!window.supabase?.createClient)return null;
  if(!ctx.client)ctx.client=window.supabase.createClient(SUPABASE_URL,KEY);
  return ctx.client;
 }
 async function discover(){
  if(manualPinned||checking||document.hidden)return;
  const api=client();if(!api){$('projectionAutoStatus').textContent='Нет связи с сервером. Общий QR доступен.';return}
  checking=true;const stamp=++autoRequest;
  try{
   const {data,error}=await api.rpc('qwiz_audience_active_room');
   if(stamp!==autoRequest||manualPinned)return;
   if(error)throw Error(error.message||'Сервис недоступен');
   if(data&&roomPattern.test(data.code)&&data.phase!=='finished')showRoom(data.code,data.title);
   else clearAuto();
  }catch(e){
   if(!selectedCode&&!manualPinned)$('projectionAutoStatus').textContent='Нет связи с комнатами. Общий QR работает, попробуем снова.';
  }finally{checking=false}
 }
 $('projectionOpenGame').onclick=()=>{
  if(!roomPattern.test(selectedCode))return;
  const next=new URL(location.href);next.searchParams.set('room',selectedCode);location.assign(next.toString());
 };
 $('projectionSetupQrOpen').onclick=()=>openJoinQr(selectedCode);
 input.oninput=e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-F0-9]/g,'');status.textContent='Ввод не влияет на QR текущей игры.'};
 $('projectionJoin').onsubmit=async e=>{
  e.preventDefault();const code=input.value.trim();
  if(!roomPattern.test(code)){status.textContent='Укажите код из 8 символов.';return}
  const api=client();if(!api){status.textContent='Подключение к серверу недоступно.';return}
  const stamp=++manualRequest;status.textContent='Проверяем другую комнату…';
  try{
   const {data,error}=await api.rpc('qwiz_party_projection',{p_code:code});
   if(stamp!==manualRequest||input.value!==code)return;
   if(error||!data||data.code!==code||data.phase==='finished')throw Error('Комната недоступна');
   manualPinned=true;showRoom(code,data.title,'manual');status.textContent='Комната выбрана. Можно открыть игру или сканировать QR.';
  }catch{if(stamp===manualRequest)status.textContent='Комната не найдена или уже завершена.'}
 };
 paintQr(); // Always draw a useful QR immediately, without entering a code.
 void discover();
 setInterval(discover,8000); // Lightweight one-RPC check, only while the setup screen is visible.
}
function tone(kind){QwizStage.audio.play(kind==='end'?'timeup':kind)}
function ranking(rows,key){
 const first=(rows||[]).slice(0,100);
 return '<ol class="projection-ranking">'+first.map((x,i)=>'<li><span class="projection-rank">'+(i+1)+'</span>'+
 '<strong>'+escapeText(x[key]||'Игрок')+'</strong><b>'+Number(x.score||0).toLocaleString('ru-RU')+'</b></li>').join('')+'</ol>';
}
function questionStats(rows){return QwizStage.questionStats(rows)}
function finalShow(state){
 const teams=state.teams||[],players=state.players||[],stats=state.question_stats||[];
 const answered=stats.reduce((sum,x)=>sum+Number(x.answered||0),0),correct=stats.reduce((sum,x)=>sum+Number(x.correct||0),0);
 const accuracy=answered?Math.round(correct*100/answered):0;
 const title=state.activity?.title&&state.activity.title!=='Финал игры'?state.activity.title:'Вот это была игра!';
 $('projectionMain').innerHTML='<section class="projection-finale"><div class="finale-heading"><div><span class="projection-eyebrow">QWIZ-PARTY / ФИНАЛ</span><h1>'+escapeText(title)+'</h1><p>'+escapeText(state.title)+' · '+teams.length+' команд · '+players.length+' участников</p></div><span class="finale-star" aria-hidden="true">✦</span></div>'+
 '<div class="finale-summary"><div><strong>'+stats.length+'</strong><span>сыграно вопросов</span></div><div><strong>'+answered+'</strong><span>ответов участников</span></div><div><strong>'+accuracy+'%</strong><span>верных ответов</span></div></div>'+ 
 '<section class="stage-team-results"><div class="stage-section-head"><h2>Рейтинг команд</h2><span>По баллам; при равенстве — по средней скорости</span></div>'+QwizStage.teams(teams,{full:true,ranked:true})+'</section>'+
 '<section class="stage-player-results"><div class="stage-section-head"><h2>Личный рейтинг</h2><span>Баллы → верный ответ → скорость</span></div>'+QwizStage.leaderboard(players,80)+'</section>'+
 (stats.length?questionStats(stats):'<p class="stage-empty">Статистика вопросов появится после первого сыгранного вопроса.</p>')+'</section>';
}
function projectionOption(value,index){
 const bands=QwizStage.stripeOption(value);if(bands)return bands;
 if(value&&typeof value==='object'&&typeof value.image_url==='string'&&/^https:\/\//i.test(value.image_url)){
  return '<span class="flag-choice-with-label"><img class="flag-choice-art" src="'+escapeText(value.image_url)+'" alt="Флаг, вариант '+String.fromCharCode(65+index)+'" loading="lazy" decoding="async">'+(typeof value.label==='string'?'<span class="flag-choice-label">'+escapeText(value.label)+'</span>':'')+'</span>';
 }
 return '<span>'+escapeText(typeof value==='object'?value?.label||'':value)+'</span>';
}
function questionScene(state){
 const q=state.question;
 const media=typeof q.media_url==='string'&&/^https:\/\//i.test(q.media_url)&&['audio','video'].includes(q.kind)
  ?'<'+q.kind+' class="projection-'+q.kind+'" controls preload="metadata" src="'+escapeText(q.media_url)+'"></'+q.kind+'>':'';
 // While answering, flag-picker options are private to the players. At reveal,
 // the audience sees the same four flag pictures and the correct one highlighted.
 const selectingFlag=/^(?:выберите|найдите)\s+(?:государственный\s+)?флаг\b/i.test(q.prompt||'')&&!q.media_url&&!q.illustration_url;
 const frame=selectingFlag?'':QwizStage.illustration(q,state.phase==='result'?state.answer:null);
 const top='<div class="projection-topline"><div><span class="projection-count">'+escapeText(q.round_title||q.topic||'Раунд вопросов')+
  '</span><p class="question-step">Вопрос '+(state.index+1)+' <span>/ '+state.total+'</span></p></div>'+
  QwizStage.clockMarkup(state)+'</div>';
 const finished=state.phase==='result'&&!!state.answer;
 const answer=finished?state.answer:null;
 const correctIndices=Array.isArray(answer?.indices)?answer.indices.map(Number).filter(Number.isInteger):[];
 const choices=finished&&Array.isArray(q.options)?q.options.slice(0,10).map((option,i)=>{
   const correct=correctIndices.includes(i);
   return '<div class="projection-reveal-option'+(correct?' is-correct':'')+'">'+
    '<span class="projection-reveal-letter">'+String.fromCharCode(65+i)+'</span>'+
    '<div class="projection-reveal-option-body">'+projectionOption(option,i)+'</div>'+
    (correct?'<span class="projection-reveal-check" aria-label="Правильный ответ">✓ Верно</span>':'')+
    '</div>';
 }).join(''):'';
 const answerImage=typeof answer?.image_url==='string'&&/^https:\/\//i.test(answer.image_url)?answer.image_url:'';
 const answerText=answer?.text||'Ответ не указан';
 const correctFlag=finished?QwizStage.correctFlagMarkup(q,answer):'';
 const explanation=answer?.explanation||'';
 const reveal=finished?
  '<section class="projection-answer-reveal" role="status" aria-label="Разбор вопроса">'+
   '<div class="projection-answer-heading"><span>ПРАВИЛЬНЫЙ ОТВЕТ</span>'+(correctFlag?correctFlag:'<strong>'+escapeText(answerText)+'</strong>')+'</div>'+
   (choices?'<div class="projection-reveal-options'+(choices.includes('flag-choice-art')?' has-flag-options':'')+'">'+choices+'</div>':
     (answerImage?'<img class="projection-answer-image" src="'+escapeText(answerImage)+'" alt="Правильный флаг" decoding="async">':''))+
   (explanation?'<p class="projection-answer-explanation">'+escapeText(explanation)+'</p>':'')+
  '</section>':'';
 return '<section class="projection-question projection-question-only'+(state.phase==='result'?' is-result':'')+'">'+top+
  '<h1>'+escapeText(q.prompt)+'</h1>'+frame+media+
  (finished?reveal:
   '<div class="projection-question-instruction">'+
    (state.phase==='result'?'Время ответа завершено. Разбор появится на общем экране.':
     'Варианты ответа доступны на устройствах участников.')+'</div>')+
  (!finished?'<div class="projection-response-count">'+
   (state.teams||[]).reduce((n,t)=>n+Number(t.answered||0),0)+' ответов получено</div>':'')+
  '</section>';
}
// Keep the visible scene inside the actual TV/projector viewport.
 let fitQueued=false;
 function fitProjectionScene(){
  fitQueued=false;
  const main=$('projectionMain'),scene=main?.firstElementChild;
  if(!main||!scene||main.clientHeight<100)return;
  scene.style.zoom='1';scene.style.maxWidth='100%';
  const h=main.clientHeight-8,w=main.clientWidth-8;
  const scale=Math.max(.36,Math.min(1,h/Math.max(1,scene.scrollHeight),w/Math.max(1,scene.scrollWidth)));
  scene.style.zoom=String(scale);
 }
 function scheduleFitProjection(){if(fitQueued)return;fitQueued=true;requestAnimationFrame(()=>requestAnimationFrame(fitProjectionScene))}
function applyProjectionSettings(settings){
 if(!settings)return;
 const sound=Boolean(settings.sound_enabled),volume=Number(settings.volume);
 if(Number.isFinite(volume))QwizStage.audio.setVolume(Math.max(0,Math.min(1,volume/100)));
 if(QwizStage.audio.enabled!==sound){
   if(!sound)QwizStage.audio.stopMusic();
   QwizStage.audio.enabled=sound;
 }
}
function render(state){
 applyProjectionSettings(state.screen_settings);
 document.body.classList.toggle('projection-screen-ready',Boolean(state.code));
 clearError();$('projectionRoom').textContent=state.code||'';$('projectionPaused').hidden=!state.paused;
 if(state.code&&/^[A-F0-9]{8}$/.test(state.code)){
  rememberRoom(state.code);
  const joinQr=$('projectionJoinQr');if(joinQr.dataset.room!==state.code){joinQr.dataset.room=state.code;qr($('projectionJoinQrImage'),link(state.code))}
  joinQr.hidden=true; // The lobby has one large QR; live questions stay QR-free.
 }
 $('projectionPlay').hidden=!state.code;$('projectionPlay').href=link(state.code);
 const key=[state.code,state.phase,state.index,state.activity?.title,state.activity?.type,state.activity?.settings?.arcade_mode].join(':');
 if(key===ctx.renderKey){
  if(state.phase==='lobby')QwizTeams.board($('projectionTeamBoard'),state.lobby_teams||[],state.code);
  if(state.phase==='question'){QwizStage.patchTeams($('projectionMain'),state.teams);if($('teamAnswerCount'))$('teamAnswerCount').textContent=(state.teams||[]).reduce((a,t)=>a+Number(t.answered||0),0)}
  if(!state.paused)QwizStage.updateClock(state,ctx.offset);return;
 }
 ctx.renderKey=key;const previous=ctx.lastPhase;ctx.lastPhase=state.phase;QwizStage.audio.stopMusic();
 if(state.phase!=='intermission')window.QwizArcade?.stop('screen');
 if(state.phase!=='intermission'||state.activity?.settings?.arcade_mode!=='russia_map')window.QwizGeo?.stop('screen');
 if(state.phase==='lobby'){
  $('projectionMain').innerHTML='<section class="projection-lobby has-team-entry"><div><div class="projection-eyebrow">КОМНАТА ОТКРЫТА</div><h1>Присоединяйтесь!</h1><p>Наведите камеру на QR-код или введите код комнаты на телефоне.</p><strong class="projection-code">'+escapeText(state.code)+'</strong></div><div class="projection-qr" id="projectionQr"></div></section><section class="projection-team-entry"><h2>Выберите свою команду</h2><p>Сканируйте QR под её иконкой. Нажмите на карточку, чтобы увеличить код.</p><div class="team-board" id="projectionTeamBoard"></div></section>';qr($('projectionQr'),link(state.code));$('projectionQr').setAttribute('role','button');$('projectionQr').setAttribute('tabindex','0');$('projectionQr').setAttribute('aria-label','Увеличить общий QR-код входа в игру');$('projectionQr').onclick=()=>openJoinQr(state.code);$('projectionQr').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openJoinQr(state.code)}};QwizTeams.board($('projectionTeamBoard'),state.lobby_teams||[],state.code);scheduleFitProjection();return;
 }
 if(state.phase==='finished'){QwizStage.audio.music('victory',state.code+':finale',12000);finalShow(state);scheduleFitProjection();return}
 if(state.phase==='countdown'){QwizStage.audio.music('round',state.code+':'+state.index,6500);$('projectionMain').innerHTML='<div class="countdown-scene"><span class="projection-eyebrow">СЛЕДУЮЩИЙ РАУНД</span><h1>Приготовьтесь!</h1><div class="countdown-number" id="countdownNumber">'+seconds(state.ends_at)+'</div><p>Вопрос появится после обратного отсчёта.</p></div>';return}
 if(state.phase==='intermission'){
  const activity=state.activity||{},type=activity.type||'break';QwizStage.audio.music(type==='intro'?'intro':'round',state.code+':'+state.index+':'+type,type==='intro'?9000:12000);
  if(window.QwizGeo?.mountProjector($('projectionMain'),state,ctx.client)){scheduleFitProjection();return;}
  if(window.QwizArcade?.mountProjector($('projectionMain'),state,ctx.client)){scheduleFitProjection();return;}
   if(type==='intro'){$('projectionMain').innerHTML='<section class="projection-welcome"><div class="welcome-orbit" aria-hidden="true"><span>✦</span><span>★</span><span>✧</span></div><span class="projection-eyebrow">QWIZ-PARTY · ДОБРО ПОЖАЛОВАТЬ</span><h1>'+escapeText(activity.title||'Большая игра начинается!')+'</h1><p>Команды готовы? Проверьте подключение и приготовьтесь к первому раунду.</p><div class="welcome-dots"><i></i><i></i><i></i><i></i><i></i></div></section>';return;}
  const extras=type==='team_stats'?QwizStage.teams(state.teams,{full:true,ranked:true}):type==='player_stats'?QwizStage.leaderboard(state.players,20):'';
  $('projectionMain').innerHTML='<section class="projection-activity" data-type="'+escapeText(type)+'"><span class="projection-eyebrow">QWIZ-PARTY · ПРОДОЛЖАЕМ ИГРУ</span><div class="activity-emblem" aria-hidden="true">✦</div><h1>'+escapeText(activity.title||'Дополнительная активность')+'</h1><p>Следующий этап начнётся автоматически.</p>'+extras+'</section>';return;
 }
 if(!state.question){$('projectionMain').innerHTML='<div class="projection-loading"><h1>Следующий раунд</h1><p>Смотрите на экран.</p></div>';return}
 if(state.phase==='result')tone('reveal');else if(previous!=='question'||ctx.previousQuestion!==state.index)tone('pop');ctx.previousQuestion=state.index;
 $('projectionMain').innerHTML=questionScene(state);


 QwizStage.updateClock(state,ctx.offset);QwizStage.hydrateIllustrations($('projectionMain'));scheduleFitProjection();
}
async function refresh(){if(!ctx.client||!room||ctx.checking)return;ctx.checking=true;
 try{const sentAt=Date.now();const {data,error}=await ctx.client.rpc('qwiz_party_projection',{p_code:room});if(error)throw Error(error.message);
  if(data.server_now)ctx.offset=Date.parse(data.server_now)-(sentAt+Date.now())/2;ctx.last=data;render(data);clearError();
 }catch(e){showError('Связь с игрой прервана. Пробуем восстановить: '+e.message)}finally{ctx.checking=false}}
function subscribe(){if(ctx.channel)ctx.client.removeChannel(ctx.channel);
 ctx.channel=ctx.client.channel('org-next-'+room,{config:{broadcast:{ack:false}}});
 for(const event of ['phase','answer','team'])ctx.channel.on('broadcast',{event},()=>refresh());
 ctx.channel.subscribe();
 if('BroadcastChannel' in window){ctx.local=new BroadcastChannel('qwiz-projector-'+room);ctx.local.onmessage=()=>refresh()}
}
async function init(){
 QwizStage.bindFullscreen($('projectionFullscreen'));
  const joinQr=$('projectionJoinQr');const qrModal=$('projectionQrDialog');
  joinQr.onclick=()=>openJoinQr(joinQr.dataset.room);
  $('projectionQrClose').onclick=()=>qrModal.close();
  $('projectionQrCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('projectionQrLink').href);$('projectionQrCopyStatus').textContent='Ссылка скопирована.'}catch{$('projectionQrCopyStatus').textContent='Скопируйте ссылку под QR-кодом.'}};
  qrModal.addEventListener('click',e=>{if(e.target===qrModal)qrModal.close()});
  if(new URLSearchParams(location.search).get('embedded')==='1'){
   document.body.classList.add('projection-embedded');QwizStage.audio.enabled=false;QwizStage.audio.stop();
  }
 QwizStage.decorateControls();
 QwizStage.iconLabel($('projectionSound'),QwizStage.audio.enabled?'Звук включён':'Звук выключен',QwizStage.audio.enabled?'volume':'muted');
 $('projectionSound').setAttribute('aria-pressed',String(QwizStage.audio.enabled));
 $('projectionSound').onclick=async()=>{const enabled=await QwizStage.audio.toggle();QwizStage.iconLabel($('projectionSound'),enabled?'Звук включён':'Звук выключен',enabled?'volume':'muted');$('projectionSound').setAttribute('aria-pressed',String(enabled))};
 $('projectionVolume').oninput=e=>QwizStage.audio.setVolume(Number(e.target.value)/100);
 if(!room){setup();return}
 if(!/^[A-F0-9]{8}$/.test(room)){showError('Некорректный код');setup();return}
 if(!window.supabase?.createClient){showError('Не удалось подключиться к игре');return}
 ctx.client=window.supabase.createClient(SUPABASE_URL,KEY);
 subscribe();await refresh();
 setInterval(()=>{if(!document.hidden)refresh()},3000);
 setInterval(()=>{
  const s=ctx.last;if(!s||document.hidden)return;
  if(['question','result'].includes(s.phase)&&!s.paused){const left=QwizStage.updateClock(s,ctx.offset);if(left===0&&Date.now()-ctx.lastReleaseAttempt>750){ctx.lastReleaseAttempt=Date.now();refresh()}}
  if(s.phase==='countdown'&&!s.paused){const n=seconds(s.ends_at);if($('countdownNumber'))$('countdownNumber').textContent=n;if(n===0&&Date.now()-ctx.lastReleaseAttempt>750){ctx.lastReleaseAttempt=Date.now();refresh()}}
 },200);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
}
window.addEventListener('resize',scheduleFitProjection,{passive:true});
 document.addEventListener('load',e=>{if(e.target?.closest?.('#projectionMain'))scheduleFitProjection()},true);
 window.addEventListener('DOMContentLoaded',init);
