'use strict';
// QWIZ-PARTY interactive Russia geography game.
// Geography facts/scoring are server-owned. Map source is external and replaceable.
// Shape geometry source (provisional): prokopenkoad42-creator/karta-rossii; verify upstream reuse terms.
(()=>{
 const MAP_URL='https://raw.githubusercontent.com/prokopenkoad42-creator/karta-rossii/ea0c39727c406603402ce35121cc5f52dcdc9e3a/data/regions.topojson';
 const sessions=new Map();
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={locate:'Найди субъект',identify:'Определи субъект',capital:'Административный центр',flag:'Узнай по флагу',
  silhouette:'Узнай по контуру',neighbour:'Соседние субъекты',detective:'Географический детектив',district:'Федеральный округ',coat:'Герб субъекта'};
 let geometry=null,loadPromise=null;
 const project=([lon,lat])=>[(lon-19.5)*6.55,(82-lat)*11.6];
 function arcCoords(t,idx){
  const rev=idx<0,arc=t.arcs[rev?~idx:idx];if(!arc)return [];
  let x=0,y=0;const pts=arc.map(p=>{x+=p[0];y+=p[1];return project([x*t.transform.scale[0]+t.transform.translate[0],y*t.transform.scale[1]+t.transform.translate[1]])});
  return rev?pts.reverse():pts;
 }
 function ring(t,ids){
  const coords=[];for(const id of ids){const a=arcCoords(t,id);if(coords.length)a.shift();coords.push(...a)}
  return coords.length?'M'+coords.map(x=>x.map(z=>z.toFixed(1)).join(',')).join('L')+'Z':'';
 }
 function shape(t,g){
  const polys=g.type==='Polygon'?[g.arcs]:g.arcs;
  return polys.map(p=>p.map(a=>ring(t,a)).join('')).join('');
 }
 async function loadMap(){
  if(geometry)return geometry;
  if(loadPromise)return loadPromise;
  loadPromise=fetch(MAP_URL,{mode:'cors',cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('Карта временно недоступна');return r.json()})
   .then(t=>{
    const item=t.objects.ru89;
    if(item.geometries.length!==89)throw Error('В картографическом наборе нет 89 регионов');
    geometry=item.geometries.map(g=>{const path=shape(t,g),n=[...path.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
     const bounds=n.reduce((a,p)=>[Math.min(a[0],p[0]),Math.min(a[1],p[1]),Math.max(a[2],p[0]),Math.max(a[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
     const x=bounds[0],y=bounds[1],w=Math.max(8,bounds[2]-x),h=Math.max(8,bounds[3]-y);
     const padding=Math.max(10,Math.max(w,h)*.22);
     return{id:g.properties.id,path,name:g.properties.name_full,box:[x-padding,y-padding,w+2*padding,h+2*padding].map(z=>+z.toFixed(1)),
      cx:project([g.properties.clon,g.properties.clat])[0],cy:project([g.properties.clon,g.properties.clat])[1]}});
    return geometry;
   }).catch(e=>{loadPromise=null;throw e});
  return loadPromise;
 }
 function mapMarkup(active=null,interactive=false,silhouette=false){
  if(!geometry)return '<div class="geo-map-loading">Загружаем карту субъектов России…</div>';
  if(silhouette){
    const g=geometry.find(z=>z.id===active);
    return g?'<svg class="geo-map-svg geo-silhouette" viewBox="'+g.box.join(' ')+'" role="img" aria-label="Контур неизвестного субъекта"><path d="'+g.path+'"/></svg>':'';
  }
  const paths=geometry.map(g=>'<path class="geo-region '+(g.id===active?'geo-focus':'')+'" data-region="'+esc(g.id)+'" d="'+g.path+'" aria-label="'+esc(g.name)+'" '+(interactive?'role="button" tabindex="0"':'')+'/>').join('');
  // Avoid overlapping transparent hit targets that select neighboring regions.
  return '<div class="geo-map-frame"><svg class="geo-map-svg" viewBox="0 0 1120 480" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Интерактивная карта субъектов России"><g>'+paths+'</g></svg>'+
    '</div>';
 }
 function options(q,t=null,feedbackActive=false){
  const correct=feedbackActive?String(t?.lastAnswer?.correct_text||'').trim():null;
  const chosen=feedbackActive?t?.chosenAnswerId:null;
  return '<div class="geo-options">'+(q.options||[]).map(x=>{
    const right=Boolean(correct&&String(x.text||'').trim()===correct);
    const wrong=feedbackActive&&!right&&x.id===chosen;
    const css=right?'geo-option-correct':wrong?'geo-option-wrong':'';
    const explanation=right?'Правильный ответ':wrong?'Ваш ответ':'Вариант ответа';
    return '<button type="button" data-geo-answer="'+esc(x.id)+'" class="'+css+'" aria-label="'+explanation+': '+esc(x.text)+'"'+
      (feedbackActive?' disabled':'')+'>'+esc(x.text)+(right?' ✓':'')+'</button>';
   }).join('')+'</div>';
 }
 function prompt(q){
  switch(q.mode){
   case 'locate':return 'Найдите на карте: '+q.name;
   case 'identify':return 'Как называется выделенный субъект?';
   case 'capital':return 'Какой административный центр у субъекта «'+q.name+'»?';
   case 'flag':return 'Какому субъекту принадлежит этот флаг?';
   case 'silhouette':return 'Какой субъект изображён по контуру?';
   case 'neighbour':return 'Какой субъект граничит с «'+q.name+'»?';
   case 'detective':return 'Найдите субъект по подсказкам';
   case 'district':return 'К какому федеральному округу относится «'+q.name+'»?';
   default:return 'Определите субъект';
  }
 }
 function roundState(t){
  const v=t.view;if(!v)return;
  const root=t.root;
  if(!root?.isConnected){stop(t.kind);return}
  if(!v.active){root.innerHTML='<div class="geo-wait">Раунд карты завершён.</div>';return}
  const feedbackActive=Boolean(t.lastAnswer&&Date.now()<t.feedbackUntil);
   const q=feedbackActive?(t.revealQuestion||v.question):v.question,done=!q||(!v.open&&!feedbackActive);
   const key=[v.index,q?.mode,q?.name,q?.region,feedbackActive].join(':');
   const taskKey=[v.index,q?.mode,q?.name,q?.region].join(':');
   if(t.taskKey!==undefined&&t.taskKey!==taskKey&&!feedbackActive){t.selectedRegion=null;t.message='';}
   if(!feedbackActive)t.taskKey=taskKey;
   if(t.renderKey===key&&root.querySelector('.geo-game')){
     const time=root.querySelector('.geo-footer>span');if(time)time.textContent='Осталось '+Math.max(0,v.remaining)+' сек.';
     return;
   }
   t.renderKey=key;
   const oldSvg=root.querySelector('.geo-map-frame .geo-map-svg');
   if(oldSvg&&!oldSvg.classList.contains('geo-silhouette'))t.zoomBox=oldSvg.getAttribute('viewBox');
  let hint='';
  if(q?.mode==='detective')hint='<div class="geo-clues"><span>Подсказка 1: '+esc(q.region_type)+'</span><span>Подсказка 2: '+esc(q.district)+'</span><span>Подсказка 3: центр — '+esc(q.capital)+'</span></div>';
  const img=q?.mode==='flag'&&q.flag?'<img class="geo-flag" loading="lazy" decoding="async" alt="Флаг субъекта России" src="https://raw.githubusercontent.com/russian-flags/regions/3c411c7b305c678c49798cc610538c66108adbde/assets/'+encodeURIComponent(q.flag)+'/index.svg">':'';
  const qmode=q?.mode||'locate';const interactive=qmode==='locate',silhouette=qmode==='silhouette';const showMap=['locate','identify','silhouette'].includes(qmode);
  const feedback=feedbackActive?'<div class="geo-answer-feedback '+(t.lastAnswer.correct?'':'is-wrong')+'" role="status">'+(t.lastAnswer.correct?'Верно! ':'Неверно. ')+'Правильный ответ: '+esc(t.lastAnswer.correct_text||'—')+'.</div>':'';
   root.innerHTML='<section class="geo-game"><div class="geo-header"><span>КАРТА РОССИИ / '+esc(labels[qmode]||'Знание регионов')+'</span><strong>'+v.index+' / '+v.total+' пройдено · '+v.score+' очков</strong></div>'+
   '<div class="geo-progress"><span style="width:'+Math.min(100,100*v.index/Math.max(1,v.total))+'%"></span></div>'+feedback+
   (done?'<div class="geo-done"><h2>'+(v.finished?'Готово!':'Время вышло')+'</h2><p>Верно: '+v.correct+' из '+v.total+'. Баллы сохранены на сервере.</p></div>':
   '<h2>'+esc(prompt(q))+'</h2>'+hint+img+
   (showMap?(t.mapError?'<div class="geo-map-loading">Не удалось загрузить карту. <button type="button" data-geo-map-retry>Повторить загрузку</button></div>':(geometry&&qmode==='silhouette'?mapMarkup(q.region,false,true):mapMarkup(qmode==='identify'?q.region:null,interactive&&!feedbackActive))):'')+
   (showMap&&qmode!=='silhouette'?'<div class="geo-map-toolbar" aria-label="Масштаб карты"><button type="button" data-geo-zoom="in" aria-label="Увеличить">＋</button><button type="button" data-geo-zoom="out" aria-label="Уменьшить">−</button><button type="button" data-geo-zoom="reset">Вся карта</button></div>':'')+
   (interactive?'<p class="geo-tip">Один раз нажмите на субъект, проверьте выделение и нажмите «Подтвердить выбор». Карту можно перемещать пальцем и двумя пальцами изменять масштаб.</p>'+
    '<button type="button" class="geo-confirm" data-geo-confirm '+(!t.selectedRegion?'hidden disabled':'')+'>'+ (t.selectedRegion?'Подтвердить выбранный регион':'Подтвердить выбранный регион')+'</button>':options(q,t,feedbackActive)))+
   '<p class="geo-message" role="status" aria-live="polite">'+esc(t.message||'')+'</p>'+
   '<div class="geo-footer"><span>Осталось '+v.remaining+' сек.</span><small>Результат каждого игрока индивидуален</small></div></section>';
  const nextSvg=root.querySelector('.geo-map-frame .geo-map-svg');
   if(nextSvg&&!nextSvg.classList.contains('geo-silhouette')){
     // Fill the available phone viewport without distorting the outline.
     // Touch drag and zoom controls expose regions outside the initial crop.
     nextSvg.setAttribute('preserveAspectRatio','xMidYMid meet');
     if(!t.zoomBox&&window.matchMedia('(max-width:680px)').matches){
        // Start at a readable crop and allow horizontal dragging to every region.
        const w=Math.max(440,Math.min(790,Math.round(window.innerWidth*1.9)));
        t.zoomBox=[Math.round((1120-w)/2),0,w,480].join(' ');
     }
     if(t.zoomBox)nextSvg.setAttribute('viewBox',t.zoomBox);
     if(t.selectedRegion&&!feedbackActive)nextSvg.querySelectorAll('.geo-region').forEach(p=>p.classList.toggle('geo-selected',p.dataset.region===t.selectedRegion));
     if(feedbackActive&&t.lastAnswer.correct_region_id){
       nextSvg.querySelectorAll('[data-region]').forEach(n=>{
         if(n.dataset.region===t.lastAnswer.correct_region_id)n.classList.add('geo-correct-answer');
         else if(n.dataset.region===t.lastAnswer.selected_region_id)n.classList.add('geo-wrong-answer');
       });
     }
   }
   if(showMap&&!geometry&&!done&&!t.mapPending&&!t.mapError){t.mapPending=true;loadMap().then(()=>{t.mapPending=false;t.renderKey=null;roundState(t)}).catch(e=>{t.mapPending=false;t.mapError=true;t.renderKey=null;t.message='Геометрия недоступна: '+e.message;roundState(t)})}
 }
 async function fetchView(t,answer=null){
  if(t.busy||t.closed)return;
  t.busy=true;
  try{
   const {data,error}=await t.client.rpc('qwiz_geo_play',{p_room:t.roomId,p_answer:answer});
   if(error)throw error;
   if(answer!==null&&data.last_answer){
     t.revealQuestion=t.view?.question;
     t.lastAnswer=data.last_answer;t.feedbackUntil=Date.now()+3800;
     setTimeout(()=>{if(!t.closed&&Date.now()>=t.feedbackUntil){
       t.lastAnswer=null;t.revealQuestion=null;t.renderKey=null;roundState(t);
     }},3850);
   }
   t.view=data;
   t.message=answer===null?'':data.last_correct?'Верно! +100 очков':'Нет, этот ответ неверный.';
   roundState(t);
  }catch(e){t.message=e.message||'Нет связи';if(t.root)t.root.innerHTML='<div class="geo-wait">'+esc(t.message)+'</div>'}
  finally{t.busy=false}
 }
 function bindZoom(root){
  const svg=root.querySelector('.geo-map-svg');if(!svg)return;
  let box=[0,0,1120,480];
  const update=()=>svg.setAttribute('viewBox',box.join(' '));
  root.addEventListener('click',e=>{
   const z=e.target.closest('[data-geo-zoom]');if(!z)return;
   const a=z.dataset.geoZoom;
   if(a==='reset')box=[0,0,1120,480];
   else{const k=a==='in'?.72:1.38,w=Math.max(62,Math.min(1120,box[2]*k)),h=w*480/1120;
    box=[Math.max(0,Math.min(1120-w,box[0]+(box[2]-w)/2)),Math.max(0,Math.min(480-h,box[1]+(box[3]-h)/2)),w,h];}
   update();
  });
 }
 function modifyView(svg,scale=1,dx=0,dy=0,px=null,py=null){
  if(!svg)return;
  const rect=svg.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  let [x,y,w,h]=svg.getAttribute('viewBox').split(' ').map(Number);
  const u=px===null?.5:Math.max(0,Math.min(1,(px-rect.left)/rect.width));
  const v=py===null?.5:Math.max(0,Math.min(1,(py-rect.top)/rect.height));
  const nw=Math.max(55,Math.min(1120,w/Math.max(.4,Math.min(2.5,scale)))),nh=nw*480/1120;
  x=Math.max(0,Math.min(1120-nw,x+(w-nw)*u-dx*nw/rect.width));
  y=Math.max(0,Math.min(480-nh,y+(h-nh)*v-dy*nh/rect.height));
  svg.setAttribute('viewBox',[x,y,nw,nh].join(' '));
 }
 function selectRegion(t,node){
  const selected=node?.dataset?.region;
  if(!selected||t.busy||!t.view?.open||t.view?.question?.mode!=='locate')return false;
  t.selectedRegion=selected;
  t.root.querySelectorAll('.geo-region').forEach(p=>p.classList.toggle('geo-selected',p.dataset.region===selected));
  const button=t.root.querySelector('[data-geo-confirm]');
  if(button){button.disabled=false;button.hidden=false;button.textContent='Подтвердить: '+(node.getAttribute('aria-label')||'регион');button.setAttribute('aria-label','Подтвердить выбранный регион');}
  t.message='Регион выбран. Нажмите «Подтвердить».';
  const label=t.root.querySelector('.geo-message');if(label)label.textContent=t.message;
  return true;
 }
 function mountPlayer(root,s,ctx){
  if(s.phase!=='intermission'||s.activity?.settings?.arcade_mode!=='russia_map')return false;
  const key=s.code+':player',existing=sessions.get(key);
  if(existing&&!existing.closed&&existing.root===root)return true;
  stop('player');
  const t={root,client:ctx.client||ctx.db,roomId:s.room_id,kind:'player',closed:false,view:null,busy:false,message:'',mapPending:false,pointers:new Map(),suppressUntil:0,zoomBox:null,selectedRegion:null,lastAnswer:null,feedbackUntil:0,revealQuestion:null,renderKey:null,gestureMoved:false};sessions.set(key,t);
  root.innerHTML='<section class="geo-game"><h2>Карта России</h2><p>Готовим вашу индивидуальную карту…</p></section>';
  t.onClick=e=>{
   if(e.target.closest('[data-geo-map-retry]')){t.mapError=false;t.message='Повторяем загрузку карты…';roundState(t);return}
   const zoom=e.target.closest('[data-geo-zoom]');
   if(zoom){const svg=root.querySelector('.geo-map-frame .geo-map-svg');if(!svg)return;
    const action=zoom.dataset.geoZoom;let [x,y,w,h]=svg.getAttribute('viewBox').split(' ').map(Number);
    if(action==='reset'){
      const narrow=window.matchMedia('(max-width:680px)').matches;
      w=narrow?Math.max(440,Math.min(790,Math.round(window.innerWidth*1.9))):1120;
      x=(1120-w)/2;y=0;h=480;
     }
    else{const f=action==='in'?.72:1.38;const nw=Math.max(55,Math.min(1120,w*f)),nh=nw*480/1120;
     x=Math.max(0,Math.min(1120-nw,x+(w-nw)/2));y=Math.max(0,Math.min(480-nh,y+(h-nh)/2));w=nw;h=nh}
    t.zoomBox=[x,y,w,h].join(' ');svg.setAttribute('viewBox',t.zoomBox);return;
   }
   if(Date.now()<t.suppressUntil||Date.now()<t.feedbackUntil||t.pointers.size)return;
   if(Date.now()<(t.regionPointerSelectedUntil||0)&&e.target.closest('[data-region]'))return;
   if(e.target.closest('[data-geo-confirm]')){if(t.selectedRegion&&!t.busy&&t.view?.open)fetchView(t,t.selectedRegion);return;}
   const b=e.target.closest('[data-geo-answer],[data-region]');if(!b||!t.view?.open||t.busy||!t.view?.question)return;
   const selected=b.dataset.geoAnswer||b.dataset.region;
   if(b.dataset.region&&t.view.question.mode!=='locate')return;
   if(b.dataset.region){selectRegion(t,b);return;}
   t.chosenAnswerId=selected;
   fetchView(t,selected);
  };
  root.addEventListener('click',t.onClick);
  t.onPointerDown=e=>{
   const svg=e.target.closest?.('.geo-map-frame .geo-map-svg');if(!svg)return;
   t.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,region:e.target.closest?.('[data-region]')||null});
   if(t.pointers.size===1)t.gestureMoved=false;
    // A drag or pinch must not submit a region as an answer.
  };
  t.onPointerMove=e=>{
   if(!t.pointers.has(e.pointerId))return;
   const svg=root.querySelector('.geo-map-frame .geo-map-svg');if(!svg)return;
   const before=[...t.pointers.values()].map(p=>({...p}));
   const old=t.pointers.get(e.pointerId);const dx=e.clientX-old.x,dy=e.clientY-old.y;
   t.pointers.set(e.pointerId,{...old,x:e.clientX,y:e.clientY});
   const now=[...t.pointers.values()];
   const dragDistance=Math.hypot(e.clientX-old.startX,e.clientY-old.startY);
   if(before.length===1&&dragDistance<14)return; // A small normal click must still select a region.
   if(Math.abs(dx)+Math.abs(dy)<.5)return;
   t.gestureMoved=true;t.suppressUntil=Date.now()+850;e.preventDefault();
   if(before.length===1)modifyView(svg,1,dx,dy);
   else{
    const dist=p=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
    const centre=p=>({x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2});
    const previous=centre(before),next=centre(now);
    modifyView(svg,Math.max(.5,Math.min(2,dist(now)/Math.max(1,dist(before)))),next.x-previous.x,next.y-previous.y,previous.x,previous.y);
   }
   t.zoomBox=svg.getAttribute('viewBox');
  };
  t.onPointerUp=e=>{
   const pointer=t.pointers.get(e.pointerId);t.pointers.delete(e.pointerId);
   if(t.gestureMoved){t.suppressUntil=Date.now()+850;return}
   if(pointer?.region&&Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)<16){
    if(selectRegion(t,pointer.region))t.regionPointerSelectedUntil=Date.now()+350;
   }
  };
  t.onWheel=e=>{
   const svg=e.target.closest?.('.geo-map-frame .geo-map-svg');if(!svg)return;
   e.preventDefault();t.suppressUntil=Date.now()+600;
   modifyView(svg,e.deltaY<0?1.23:.81,0,0,e.clientX,e.clientY);
   t.zoomBox=svg.getAttribute('viewBox');
  };
  t.onKeyDown=e=>{
   if((e.key!=='Enter'&&e.key!==' ')||!e.target.matches?.('.geo-region[data-region]'))return;
   e.preventDefault();if(t.busy||!t.view?.open||t.view?.question?.mode!=='locate')return;
   if(selectRegion(t,e.target))root.querySelector('[data-geo-confirm]')?.focus();
  };
  root.addEventListener('pointerdown',t.onPointerDown);
  root.addEventListener('pointermove',t.onPointerMove);
  root.addEventListener('pointerup',t.onPointerUp);
  root.addEventListener('pointercancel',t.onPointerUp);
  root.addEventListener('wheel',t.onWheel,{passive:false});
  root.addEventListener('keydown',t.onKeyDown);

  fetchView(t);
  t.interval=setInterval(()=>{if(document.hidden||t.busy)return;if(t.view?.remaining>0)t.view.remaining-=1; if(t.view){const foot=root.querySelector('.geo-footer>span');if(foot)foot.textContent='Осталось '+Math.max(0,t.view.remaining)+' сек.';} if(!t.view||t.view.remaining%5===0)fetchView(t)},1000);
  return true;
 }
 function mountProjector(root,s,client){
  if(s.phase!=='intermission'||s.activity?.settings?.arcade_mode!=='russia_map')return false;
  const key=s.code+':screen',existing=sessions.get(key);if(existing&&!existing.closed&&existing.root===root)return true;
  stop('screen');
  const t={root,client,kind:'screen',closed:false};sessions.set(key,t);
  root.innerHTML='<section class="geo-projector"><span class="geo-kicker">ГЕОГРАФИЧЕСКИЙ РАУНД</span><h1>'+esc(s.activity?.title||'Карта России')+'</h1><p>У каждого игрока — индивидуальная карта и случайные задания.</p>'+
   '<div class="geo-projector-stats"><div><strong id="geoProjCount">—</strong><span>субъектов на игрока</span></div><div><strong id="geoProjPlayers">0</strong><span>в игре</span></div><div><strong id="geoProjAnswered">0</strong><span>ответов</span></div><div><strong id="geoProjTime">—</strong><span>секунд осталось</span></div></div>'+
   '<p>Найдите регион, столицу, флаг, контур или соседа на своём телефоне. Ответы на общий экран не выводятся.</p></section>';
  const update=async()=>{if(t.closed||!t.root.isConnected)return;
   const {data,error}=await client.rpc('qwiz_geo_projection',{p_code:s.code});if(error||!data?.active)return;
   const set=(id,x)=>{const n=document.getElementById(id);if(n)n.textContent=x};
   set('geoProjCount',data.count);set('geoProjPlayers',data.players);set('geoProjAnswered',data.answered);set('geoProjTime',data.remaining);
  };
  update();t.interval=setInterval(update,3500);return true;
 }
 function stop(kind){for(const [key,t] of sessions){if(t.kind!==kind)continue;t.closed=true;clearInterval(t.interval);if(t.onClick)t.root?.removeEventListener('click',t.onClick);for(const [event,handler] of [['pointerdown',t.onPointerDown],['pointermove',t.onPointerMove],['pointerup',t.onPointerUp],['pointercancel',t.onPointerUp],['wheel',t.onWheel],['keydown',t.onKeyDown]])if(handler)t.root?.removeEventListener(event,handler);sessions.delete(key)}}
 window.QwizGeo=Object.freeze({mountPlayer,mountProjector,stop,loadMap,labels,MAP_URL});
})();
