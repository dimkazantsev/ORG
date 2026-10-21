'use strict';
// Projection-only window. Uses a read-only, minimum-payload server RPC.
// Correct answers, scores, usernames and teacher controls never enter this view.
const SUPABASE_URL='https://bderfrcfuhnutuoyudje.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_Hv7NgYuVsfKhFuhX_9pl0Q_qXWA2wOr';
const room=new URLSearchParams(location.search).get('room')?.trim().toUpperCase()||'';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const ctx={client:null,channel:null,local:null,last:null,checking:false,refreshTimer:null};
function inviteUrl(code){const url=new URL('./',location.href);url.searchParams.set('room',code);return url.toString()}
function safeQr(node,url){node.replaceChildren();if(typeof QRCode!=='function')return;
 new QRCode(node,{text:url,width:240,height:240,colorDark:'#202627',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M})}
function seconds(end){return end?Math.max(0,Math.ceil((Date.parse(end)-Date.now())/1000)):0}
function showError(message){$('projectionError').textContent=message;$('projectionError').hidden=false}
function render(state){const root=$('projectionMain');$('projectionError').hidden=true;
 $('projectionRoom').textContent=state.code||'';
 if(state.phase==='lobby'){
  root.innerHTML='<section class="projection-lobby"><div><div class="projection-eyebrow">Комната открыта</div>'+
   '<h1>Подключайтесь к игре</h1><p>Наведите камеру телефона на QR-код или введите код комнаты.</p>'+
   '<strong class="projection-code">'+esc(state.code)+'</strong></div>'+
   '<div class="projection-qr" id="projectionQr"></div></section>';
  safeQr($('projectionQr'),inviteUrl(state.code));return;
 }
 if(state.phase==='finished'){
  root.innerHTML='<div class="projection-loading"><h1>Игра завершена</h1><p>Спасибо за участие в QWIZ-PARTY.</p></div>';return;
 }
 if(!state.question){
  root.innerHTML='<div class="projection-loading"><h1>Следующий вопрос</h1><p>Приготовьтесь отвечать.</p></div>';return;
 }
 const q=state.question;
 root.innerHTML='<section class="projection-question"><div class="projection-topline"><span class="projection-count">ВОПРОС '+(state.index+1)+' / '+state.total+'</span>'+
 '<span class="projection-timer" id="projectionTimer">'+(state.phase==='question'?seconds(state.ends_at)+' сек.':'Ответы приняты')+'</span></div>'+
 '<h1>'+esc(q.prompt)+'</h1><div class="projection-options">'+(Array.isArray(q.options)?q.options:[]).map((option,i)=>
 '<div class="projection-option"><span class="letter">'+String.fromCharCode(65+i)+'</span><span>'+esc(option)+'</span></div>').join('')+'</div></section>';
}
async function refresh(){if(ctx.checking||!ctx.client)return;ctx.checking=true;
 try{const {data,error}=await ctx.client.rpc('org_next_presenter_state',{p_code:room});
  if(error)throw Error(error.message);
  if(JSON.stringify(data)!==JSON.stringify(ctx.last)){ctx.last=data;render(data)}
  $('projectionError').hidden=true;
 }catch(e){showError('Нет соединения с комнатой: '+e.message)}finally{ctx.checking=false}
}
function scheduleRefresh(delay=250){clearTimeout(ctx.refreshTimer);ctx.refreshTimer=setTimeout(refresh,delay)}
function connectRealtime(){
 ctx.channel=ctx.client.channel('org-next-'+room,{config:{broadcast:{ack:false}}});
 for(const event of ['phase','team','answer'])
  ctx.channel.on('broadcast',{event},()=>scheduleRefresh(event==='phase'?150:500));
 ctx.channel.subscribe();
 if('BroadcastChannel' in window){
  ctx.local=new BroadcastChannel('qwiz-projector-'+room);
  ctx.local.onmessage=e=>{if(e.data?.code===room)scheduleRefresh(100)};
 }
}
async function init(){
 $('projectionFullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}
  catch(e){showError('Не удалось открыть полноэкранный режим. Используйте F11.')}
 });
 if(!/^[A-F0-9]{8}$/.test(room)){showError('Некорректный код комнаты. Откройте этот экран из кабинета преподавателя.');return}
 if(!window.supabase?.createClient){showError('Не загружена библиотека подключения.');return}
 ctx.client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
 const {data:{session}}=await ctx.client.auth.getSession();
 if(!session){showError('Авторизуйтесь в кабинете преподавателя в этом браузере и откройте экран повторно.');return}
 connectRealtime();await refresh();
 setInterval(()=>{if(!document.hidden)refresh()},12000);
 setInterval(()=>{if(ctx.last?.phase==='question'){
  const timer=$('projectionTimer');if(timer)timer.textContent=seconds(ctx.last.ends_at)+' сек.'}},250);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleRefresh(100)});
}
window.addEventListener('DOMContentLoaded',init);
