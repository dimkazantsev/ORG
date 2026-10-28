'use strict';
/* QWIZ-PARTY / Секретный код: the server controls symbols, time and score.
   One read per visible symbol, one write per completed answer. */
window.QwizSecretCode=(()=>{
 const symbols={red:'🔴',blue:'🔵',yellow:'🟡',green:'🟢',ru:'🇷🇺',cn:'🇨🇳',br:'🇧🇷',
  jp:'🇯🇵',fr:'🇫🇷',de:'🇩🇪',it:'🇮🇹',star:'⭐',shield:'🛡️',crown:'👑',
  eagle:'🦅',globe:'🌐',torch:'🔥',letter:'📜',dove:'🕊️',key:'🔑',seal:'📩'};
 const glyph=x=>symbols[x]||'◆';
 const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 function render(tr,data){
  if(!data?.phase||tr.closed||tr.mode!=='sequence_memory')return;
  tr.secretState=data;
  const scene=tr.root.querySelector('[data-secret-stage]'),panel=tr.root.querySelector('[data-secret-panel]');
  if(!scene||!panel)return;
  const phase=scene.querySelector('[data-secret-phase]'),center=scene.querySelector('[data-secret-symbol]'),
    progress=scene.querySelector('[data-secret-progress]'),isPlayer=tr.kind==='player';
  phase.textContent={ready:'ПРИГОТОВЬТЕСЬ',show:'ЗАПОМНИТЕ СИМВОЛ',answer:'ВОССТАНОВИТЕ КОД',result:'ИТОГИ РАУНДА'}[data.phase];
  center.textContent=data.phase==='show'?glyph(data.symbol):data.phase==='answer'?'🔒':data.phase==='result'?'✓':'✦';
  scene.classList.toggle('is-showing',data.phase==='show');
  progress.textContent=data.phase==='show'?data.index+' / '+data.length:
    data.phase==='ready'?'Символы появятся по одному':
    data.phase==='answer'?'Воспроизведите показанный код':
    'Ответили '+Number(data.answer_count||0)+' участников';
  if(!isPlayer){panel.innerHTML='<p class="arcade-secret-hint">'+esc(data.template||'Секретный код')+' · уровень '+Number(data.level||1)+'</p>';return}
  if(data.phase==='answer'&&!data.submitted){
   const chosen=tr.secretAnswer||[];
   const slots=Array.from({length:data.length},(_,i)=>'<span class="arcade-secret-slot'+(chosen[i]?' filled':'')+'">'+(chosen[i]?glyph(chosen[i]):i+1)+'</span>').join('');
   const choices=(data.choices||[]).map(c=>'<button type="button" data-secret-choice="'+esc(c)+'" '+(chosen.length>=data.length||tr.secretBusy?'disabled':'')+' aria-label="Добавить символ '+esc(c)+'">'+glyph(c)+'</button>').join('');
   panel.innerHTML='<div class="arcade-secret-slots" aria-label="Ваш код">'+slots+'</div>'+
    '<div class="arcade-secret-choices" role="group" aria-label="Кнопки кода">'+choices+'</div>'+
    '<div class="arcade-secret-actions"><button type="button" data-secret-undo '+(!chosen.length||tr.secretBusy?'disabled':'')+'>Удалить</button>'+
    '<button type="button" data-secret-submit '+(chosen.length!==data.length||tr.secretBusy?'disabled':'')+'>Подтвердить</button></div>';
  }else if(data.submitted){
   panel.innerHTML='<p class="arcade-secret-done">Ответ принят сервером. Ожидайте результатов команд.</p>';
  }else if(data.phase==='result'){
   panel.innerHTML='<p class="arcade-secret-done">Ваш результат: '+Number(data.my_points||0)+' / 10 · совпало '+Number(data.my_exact||0)+' из '+Number(data.length||0)+'</p>'+
    '<p class="arcade-secret-hint">Правильный код: '+(data.solution||[]).map(glyph).join(' ')+'</p>';
  }else panel.innerHTML='<p class="arcade-secret-hint">Следите за сменой символов. Ответить можно после показа.</p>';
 }
 async function refresh(tr){
  if(tr.closed||tr.secretBusyPoll||tr.mode!=='sequence_memory'||!tr.view?.running)return;
  if(tr.secretState&&!['show','ready'].includes(tr.secretState.phase))return;
  tr.secretBusyPoll=true;
  try{
   const {data,error}=await tr.client.rpc('qwiz_secret_code_state',{p_code:tr.code});
   if(error)throw error;
   if(!tr.closed&&data&&tr.view?.mode==='sequence_memory')render(tr,data);
  }catch(_){/* Room snapshot retry takes care of connection errors. */}
  finally{tr.secretBusyPoll=false}
 }
 function start(tr){
  if(tr.mode!=='sequence_memory')return;
  const step=async()=>{if(tr.closed)return;
   if(navigator.onLine&&document.visibilityState!=='hidden')await refresh(tr);
   if(!tr.closed)tr.secretTimer=setTimeout(step,1000+Math.floor(Math.random()*170));
  };
  tr.secretTimer=setTimeout(step,550+Math.floor(Math.random()*120));
 }
 function stop(tr){if(tr.secretTimer)clearTimeout(tr.secretTimer);tr.secretTimer=null}
 async function submit(tr){
  const state=tr.secretState,code=tr.secretAnswer||[];
  if(tr.secretBusy||state?.phase!=='answer'||state.submitted||!tr.roomId||code.length!==state.length)return;
  tr.secretBusy=true;
  try{
   const {error}=await tr.client.rpc('qwiz_secret_code_submit',{p_room:tr.roomId,p_answer:code});
   if(error)throw error;
   render(tr,{...state,submitted:true});
   const msg=tr.root.querySelector('[data-arcade-alert]');
   if(msg)msg.textContent='Ответ принят. Ожидаем результаты других команд.';
  }catch(e){
   const msg=tr.root.querySelector('[data-arcade-alert]');if(msg){msg.textContent=e.message||'Ответ не принят';msg.dataset.error='true';}
  }finally{tr.secretBusy=false;if(!tr.closed&&tr.secretState)render(tr,tr.secretState)}
 }
 function click(tr,event){
  if(tr.mode!=='sequence_memory'||tr.closed)return false;
  const choice=event.target.closest('[data-secret-choice]');
  if(choice){
   const data=tr.secretState;if(data?.phase==='answer'&&!data.submitted&&!tr.secretBusy&&
     (tr.secretAnswer?.length||0)<data.length&&data.choices?.includes(choice.dataset.secretChoice)){
    tr.secretAnswer=[...(tr.secretAnswer||[]),choice.dataset.secretChoice];render(tr,data);
   }return true;
  }
  if(event.target.closest('[data-secret-undo]')){
   tr.secretAnswer=(tr.secretAnswer||[]).slice(0,-1);if(tr.secretState)render(tr,tr.secretState);return true;
  }
  if(event.target.closest('[data-secret-submit]')){void submit(tr);return true}
  return false;
 }
 return {start,stop,render,click,refresh};
})();
