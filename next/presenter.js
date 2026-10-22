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
function setup(){
 const root=$('projectionMain');$('projectionRoom').textContent='';
 root.innerHTML='<section class="projection-setup"><div class="projection-eyebrow">QWIZ-PARTY / ЭКРАН АУДИТОРИИ</div>'+
 '<h1>Какая игра сегодня?</h1><p>Введите код комнаты, полученный у преподавателя. Вход в кабинет на этом экране не нужен.</p>'+
 '<form id="projectionJoin" class="projection-setup-form"><label for="projectionCode">Код комнаты</label>'+
 '<input id="projectionCode" maxlength="8" pattern="[A-Fa-f0-9]{8}" placeholder="A1B2C3D4" required autocomplete="off">'+
 '<button type="submit">Открыть игру →</button></form></section>';
 $('projectionCode').oninput=e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-F0-9]/g,'')};
 $('projectionJoin').onsubmit=e=>{e.preventDefault();const code=$('projectionCode').value;
 if(!/^[A-F0-9]{8}$/.test(code))return;const url=new URL(location.href);url.searchParams.set('room',code);location.assign(url.toString())};
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
 const q=state.question,answer=state.answer,isResult=state.phase==='result';
 const media=typeof q.media_url==='string'&&/^https:\/\//i.test(q.media_url)&&['audio','video'].includes(q.kind)?'<'+q.kind+' class="projection-'+q.kind+'" controls preload="metadata" src="'+escapeText(q.media_url)+'"></'+q.kind+'>':'';
 const frame=QwizStage.illustration(q,answer);
 const top='<div class="projection-topline"><div><span class="projection-count">'+escapeText(q.round_title||q.topic||'Раунд вопросов')+'</span><p class="question-step">Вопрос '+(state.index+1)+' <span>/ '+state.total+'</span></p></div>'+QwizStage.clockMarkup(state)+'</div>';
 if(isResult)return '<section class="projection-question is-result">'+top+'<div class="answer-scene answer-reveal">'+frame+'<div class="answer-copy"><span class="answer-label">'+(q.kind==='poll'?'ИТОГ ГОЛОСОВАНИЯ':'ПРАВИЛЬНЫЙ ОТВЕТ')+'</span><h1>'+escapeText(answer?.text||'Ответ открыт')+'</h1>'+(answer?.explanation?'<p>'+escapeText(answer.explanation)+'</p>':'')+'</div></div>'+
 '<section class="stage-team-results"><div class="stage-section-head"><h2>Скорость команд</h2><span>Среднее время на участника · ↑ быстрее, ↓ медленнее</span></div>'+QwizStage.teams(state.teams,{full:true,ranked:true})+'</section>'+
 '<section class="stage-player-results"><div class="stage-section-head"><h2>Личный рейтинг</h2><span>Баллы → верный ответ → скорость</span></div>'+QwizStage.leaderboard(state.players,10)+'</section></section>';
 return '<section class="projection-question">'+top+frame+'<h1>'+escapeText(q.prompt)+'</h1>'+media+'<div class="projection-options">'+(Array.isArray(q.options)?q.options:[]).map((v,i)=>'<div class="projection-option"><span class="letter">'+String.fromCharCode(65+i)+'</span><span>'+projectionOption(v,i)+'</span></div>').join('')+'</div>'+
 (q.kind==='match'?'<div class="projection-match-bank">'+(q.match_choices||[]).map(x=>'<span>'+escapeText(x)+'</span>').join('')+'</div>':'')+
 '<section class="question-team-strip"><div class="stage-section-head"><h2>Команды в игре</h2><span><b id="teamAnswerCount">'+(state.teams||[]).reduce((a,t)=>a+Number(t.answered||0),0)+'</b> из '+(state.teams||[]).reduce((a,t)=>a+Number(t.members||0),0)+' ответили</span></div>'+QwizStage.teams(state.teams)+'</section></section>';
}
function render(state){
 clearError();$('projectionRoom').textContent=state.code||'';$('projectionPaused').hidden=!state.paused;
 $('projectionPlay').hidden=!state.code;$('projectionPlay').href=link(state.code);
 const key=[state.code,state.phase,state.index,state.activity?.title,state.activity?.type,state.activity?.settings?.arcade_mode].join(':');
 if(key===ctx.renderKey){
  if(state.phase==='lobby')QwizTeams.board($('projectionTeamBoard'),state.lobby_teams||[],state.code);
  if(state.phase==='question'){QwizStage.patchTeams($('projectionMain'),state.teams);if($('teamAnswerCount'))$('teamAnswerCount').textContent=(state.teams||[]).reduce((a,t)=>a+Number(t.answered||0),0)}
  if(!state.paused)QwizStage.updateClock(state,ctx.offset);return;
 }
 ctx.renderKey=key;const previous=ctx.lastPhase;ctx.lastPhase=state.phase;QwizStage.audio.stopMusic();
 if(state.phase!=='intermission')window.QwizArcade?.stop('screen');
 if(state.phase==='lobby'){
  $('projectionMain').innerHTML='<section class="projection-lobby has-team-entry"><div><div class="projection-eyebrow">КОМНАТА ОТКРЫТА</div><h1>Присоединяйтесь!</h1><p>Наведите камеру на QR-код или введите код комнаты на телефоне.</p><strong class="projection-code">'+escapeText(state.code)+'</strong></div><div class="projection-qr" id="projectionQr"></div></section><section class="projection-team-entry"><h2>Выберите свою команду</h2><p>Сканируйте QR под её иконкой. Нажмите на карточку, чтобы увеличить код.</p><div class="team-board" id="projectionTeamBoard"></div></section>';qr($('projectionQr'),link(state.code));$('projectionQr').setAttribute('role','button');$('projectionQr').setAttribute('tabindex','0');$('projectionQr').setAttribute('aria-label','Увеличить общий QR-код входа в игру');$('projectionQr').onclick=()=>$('projectionJoinQr').click();$('projectionQr').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('projectionJoinQr').click()}};QwizTeams.board($('projectionTeamBoard'),state.lobby_teams||[],state.code);return;
 }
 if(state.phase==='finished'){QwizStage.audio.music('victory',state.code+':finale',12000);finalShow(state);return}
 if(state.phase==='countdown'){QwizStage.audio.music('round',state.code+':'+state.index,6500);$('projectionMain').innerHTML='<div class="countdown-scene"><span class="projection-eyebrow">СЛЕДУЮЩИЙ РАУНД</span><h1>Приготовьтесь!</h1><div class="countdown-number" id="countdownNumber">'+seconds(state.ends_at)+'</div><p>Вопрос появится после обратного отсчёта.</p></div>';return}
 if(state.phase==='intermission'){
  const activity=state.activity||{},type=activity.type||'break';QwizStage.audio.music(type==='intro'?'intro':'round',state.code+':'+state.index+':'+type,type==='intro'?9000:12000);
  if(window.QwizArcade?.mountProjector($('projectionMain'),state,ctx.client))return;
   if(type==='intro'){$('projectionMain').innerHTML='<section class="projection-welcome"><div class="welcome-orbit" aria-hidden="true"><span>✦</span><span>★</span><span>✧</span></div><span class="projection-eyebrow">QWIZ-PARTY · ДОБРО ПОЖАЛОВАТЬ</span><h1>'+escapeText(activity.title||'Большая игра начинается!')+'</h1><p>Команды готовы? Проверьте подключение и приготовьтесь к первому раунду.</p><div class="welcome-dots"><i></i><i></i><i></i><i></i><i></i></div></section>';return;}
  const extras=type==='team_stats'?QwizStage.teams(state.teams,{full:true,ranked:true}):type==='player_stats'?QwizStage.leaderboard(state.players,20):'';
  $('projectionMain').innerHTML='<section class="projection-activity" data-type="'+escapeText(type)+'"><span class="projection-eyebrow">QWIZ-PARTY · ПРОДОЛЖАЕМ ИГРУ</span><div class="activity-emblem" aria-hidden="true">✦</div><h1>'+escapeText(activity.title||'Дополнительная активность')+'</h1><p>Следующий этап запускает преподаватель.</p>'+extras+'</section>';return;
 }
 if(!state.question){$('projectionMain').innerHTML='<div class="projection-loading"><h1>Следующий раунд</h1><p>Смотрите на экран.</p></div>';return}
 if(state.phase==='result')tone('reveal');else if(previous!=='question'||ctx.previousQuestion!==state.index)tone('pop');ctx.previousQuestion=state.index;
 $('projectionMain').innerHTML=questionScene(state);
 if(state.phase==='question'&&state.question.flag_memory)$('projectionMain').querySelector('.projection-options')?.setAttribute('data-memory-answer','');
 if(state.phase==='result')$('projectionMain').querySelector('.answer-copy')?.insertAdjacentHTML('beforeend',QwizStage.sourceLinks(state.answer));
 QwizStage.updateClock(state,ctx.offset);QwizStage.hydrateIllustrations($('projectionMain'));
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
  joinQr.onclick=()=>{qr($('projectionQrZoom'),link(room));qrModal.showModal()};
  $('projectionQrClose').onclick=()=>qrModal.close();
  qrModal.addEventListener('click',e=>{if(e.target===qrModal)qrModal.close()});
  if(room){joinQr.hidden=false;qr($('projectionJoinQrImage'),link(room))}
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
window.addEventListener('DOMContentLoaded',init);
