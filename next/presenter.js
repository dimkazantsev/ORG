'use strict';
// Public audience screen. Never asks for the teacher's login or answer keys.
// The shared room code grants READ-ONLY projection, not administrative control.
const SUPABASE_URL='https://bderfrcfuhnutuoyudje.supabase.co';
const KEY='sb_publishable_Hv7NgYuVsfKhFuhX_9pl0Q_qXWA2wOr';
let room=new URLSearchParams(location.search).get('room')?.trim().toUpperCase()||'';
const $=id=>document.getElementById(id);
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={client:null,last:null,channel:null,local:null,checking:false,timer:null,previousQuestion:-2,finalStep:0,finalTimer:null,sound:false,audio:null};
const seconds=t=>Math.max(0,Math.ceil((Date.parse(t)-Date.now())/1000))||0;
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
function tone(kind){
 if(!ctx.sound)return;
 try{
  ctx.audio ||= new (window.AudioContext||window.webkitAudioContext)();
  const now=ctx.audio.currentTime;const osc=ctx.audio.createOscillator(),g=ctx.audio.createGain();
  osc.type=kind==='end'?'triangle':'sine';osc.frequency.setValueAtTime(kind==='end'?350:510,now);
  osc.frequency.exponentialRampToValueAtTime(kind==='end'?180:790,now+.23);
  g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(.07,now+.03);g.gain.exponentialRampToValueAtTime(.001,now+.35);
  osc.connect(g).connect(ctx.audio.destination);osc.start(now);osc.stop(now+.36);
 }catch{}
}
function ranking(rows,key){
 const first=(rows||[]).slice(0,100);
 return '<ol class="projection-ranking">'+first.map((x,i)=>'<li><span class="projection-rank">'+(i+1)+'</span>'+
 '<strong>'+escapeText(x[key]||'Игрок')+'</strong><b>'+Number(x.score||0).toLocaleString('ru-RU')+'</b></li>').join('')+'</ol>';
}
function finalShow(state){
 const teams=state.teams||[],players=state.players||[];
 const isTeams=ctx.finalStep%2===0;
 $('projectionMain').innerHTML='<div class="projection-finale"><div class="projection-eyebrow">QWIZ-PARTY / ФИНАЛ</div>'+
  '<h1>'+(isTeams?'Результаты команд':'Рейтинг участников')+'</h1>'+
  '<p>'+(isTeams?'Места по итогам всех сыгранных вопросов.':'Рейтинг без публикации личных данных участников.')+'</p>'+
  ranking(isTeams?teams:players,isTeams?'name':'nickname')+'</div>';
}
function render(state){clearError();$('projectionRoom').textContent=state.code||'';
 if(state.phase==='lobby'){
  $('projectionMain').innerHTML='<section class="projection-lobby"><div><div class="projection-eyebrow">КОМНАТА ОТКРЫТА</div>'+
   '<h1>Присоединяйтесь!</h1><p>Наведите камеру на QR-код или введите код комнаты на телефоне.</p>'+
   '<strong class="projection-code">'+escapeText(state.code)+'</strong></div><div class="projection-qr" id="projectionQr"></div></section>';
  qr($('projectionQr'),link(state.code));return;
 }
 if(state.phase==='finished'){
  finalShow(state);
  if(!ctx.finalTimer)ctx.finalTimer=setInterval(()=>{ctx.finalStep++;if(ctx.last?.phase==='finished')finalShow(ctx.last)},11000);
  return;
 }
 if(ctx.finalTimer){clearInterval(ctx.finalTimer);ctx.finalTimer=null}
 if(state.phase==='countdown'){
  const left=seconds(state.ends_at);
  $('projectionMain').innerHTML='<div class="countdown-scene"><span class="projection-eyebrow">СЛЕДУЮЩИЙ РАУНД</span><h1>Приготовьтесь!</h1><div class="countdown-number" id="countdownNumber">'+left+'</div><p>Вопрос появится после обратного отсчёта.</p></div>';
  return;
 }
 if(!state.question){$('projectionMain').innerHTML='<div class="projection-loading"><h1>Следующий раунд</h1><p>Смотрите на экран.</p></div>';return}
 const q=state.question,round=q.topic||'Раунд вопросов';
 if(ctx.previousQuestion!==state.index){tone('start');ctx.previousQuestion=state.index}
 $('projectionMain').innerHTML='<section class="projection-question"><div class="projection-topline"><span class="projection-count">'+
 escapeText(round.toUpperCase())+' · ВОПРОС '+(state.index+1)+' / '+state.total+'</span>'+
 '<span class="projection-timer" id="projectionTimer">'+(state.phase==='question'?seconds(state.ends_at)+' сек.':'Ответы приняты')+'</span></div>'+
 '<h1>'+escapeText(q.prompt)+'</h1><div class="projection-options">'+(Array.isArray(q.options)?q.options:[]).map((v,i)=>
 '<div class="projection-option"><span class="letter">'+String.fromCharCode(65+i)+'</span><span>'+escapeText(v)+'</span></div>').join('')+'</div></section>';
}
async function refresh(){if(!ctx.client||!room||ctx.checking)return;ctx.checking=true;
 try{const {data,error}=await ctx.client.rpc('qwiz_public_screen',{p_code:room});if(error)throw Error(error.message);
  if(data.phase==='countdown' && seconds(data.ends_at)===0){
    await ctx.client.rpc('qwiz_release_countdown',{p_code:room});
    const fresh=await ctx.client.rpc('qwiz_public_screen',{p_code:room});
    if(!fresh.error && fresh.data){ctx.last=fresh.data;render(fresh.data)}
   } else if(JSON.stringify(ctx.last)!==JSON.stringify(data)){ctx.last=data;render(data)}
  clearError();
 }catch(e){showError('Нет доступа к экрану игры: '+e.message)}finally{ctx.checking=false}}
function subscribe(){if(ctx.channel)ctx.client.removeChannel(ctx.channel);
 ctx.channel=ctx.client.channel('org-next-'+room,{config:{broadcast:{ack:false}}});
 for(const event of ['phase','answer','team'])ctx.channel.on('broadcast',{event},()=>refresh());
 ctx.channel.subscribe();
 if('BroadcastChannel' in window){ctx.local=new BroadcastChannel('qwiz-projector-'+room);ctx.local.onmessage=()=>refresh()}
}
async function init(){
 $('projectionFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{showError('Используйте F11 для полноэкранного режима.')}};
 $('projectionSound').onclick=async()=>{
  ctx.sound=!ctx.sound;$('projectionSound').textContent=ctx.sound?'♫ Звук включён':'♫ Включить звук';
  if(ctx.sound){tone('start');await ctx.audio?.resume()}
 };
 if(!room){setup();return}
 if(!/^[A-F0-9]{8}$/.test(room)){showError('Некорректный код');setup();return}
 if(!window.supabase?.createClient){showError('Не удалось подключить Supabase');return}
 ctx.client=window.supabase.createClient(SUPABASE_URL,KEY);
 subscribe();await refresh();
 setInterval(()=>{if(!document.hidden)refresh()},7000);
 setInterval(()=>{
   if(ctx.last?.phase==='question'&&$('projectionTimer'))$('projectionTimer').textContent=seconds(ctx.last.ends_at)+' сек.';
   if(ctx.last?.phase==='countdown'){
    const n=seconds(ctx.last.ends_at);
    if($('countdownNumber'))$('countdownNumber').textContent=n;
    if(n===0)refresh();
   }
 },250);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
}
window.addEventListener('DOMContentLoaded',init);