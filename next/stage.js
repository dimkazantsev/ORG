'use strict';
// Shared question visuals and audio; scoring and phase transitions stay on the server.
window.QwizStage=(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>Number(n||0).toLocaleString('ru-RU');
 const capitalize=value=>{const text=String(value??'');return text.charAt(0).toLocaleUpperCase('ru-RU')+text.slice(1)};
 const countLabel=(value,forms)=>Number(value||0).toLocaleString('ru-RU')+' '+forms[new Intl.PluralRules('ru').select(Number(value)||0)];
 const phaseLabel=phase=>({lobby:'Ожидание участников',question:'Вопрос',result:'Разбор ответа',finished:'Игра завершена',countdown:'Подготовка',intermission:'Перерыв'})[phase]||'Ожидание данных';
 const habitats=[['forest','Лес','#278563'],['reef','Коралловый риф','#bb537e'],['savanna','Саванна','#a97920'],['mountains','Горы','#6962c4'],['arctic','Арктика','#2484a6'],['desert','Пустыня','#c46b38'],['jungle','Джунгли','#4b872c'],['ocean','Океан','#356cc1'],['wetland','Болото','#80822b'],['island','Остров','#229b8e'],['cave','Пещера','#8b678c'],['river','Река','#3494bc'],['meadow','Луг','#bb5b38'],['volcano','Вулкан','#c34d59'],['mangrove','Мангры','#97673e']];
 const fillCut=t=>{const size=Math.max(0,Number(t.members??t.players)||0),answered=Math.min(size,Math.max(0,Number(t.answered)||0));return size&&answered?Math.max(0,94-88*answered/size):100};
 function icon(t,full=false){
  const [id,label,color]=habitats[(Math.max(1,Number(t.position)||1)-1)%15],size=Math.max(0,Number(t.members??t.players)||0),answered=Math.min(size,Math.max(0,Number(t.answered)||0));
  const seams=Array.from({length:Math.max(0,Math.min(80,size)-1)},(_,i)=>'<path d="M4 '+(94-88*(i+1)/size).toFixed(3)+'H96"/>').join('');
  return '<svg class="habitat-icon" viewBox="0 0 100 100" role="img" aria-label="'+esc(label)+': '+answered+' из '+size+' ответили" style="--team-color:'+color+'"><use class="habitat-base" href="./assets/habitats.svg#'+id+'"/><g class="habitat-color" style="clip-path:inset('+(full?0:fillCut(t))+'% 0 0)"><use href="./assets/habitats.svg#'+id+'"/></g><g class="habitat-seams" aria-hidden="true">'+seams+'</g></svg>';
 }
 function teamTile(t,{full=false,ranked=false}={}){
  const d=t.speed_delta==null?null:Number(t.speed_delta);
  const badge=d==null?'<span class="speed-delta neutral" title="Сравнение появится после второго вопроса">—</span>':'<span class="speed-delta '+(d>0?'faster':d<0?'slower':'neutral')+'" title="Изменение скорости относительно прошлого вопроса">'+(d>0?'↑ +':d<0?'↓ −':'')+fmt(Math.abs(d))+'%</span>';
  return '<li class="habitat-team" data-team="'+esc(t.id||t.position)+'">'+(ranked?'<span class="team-place">'+fmt(t.rank||1)+'</span>':'')+'<div class="habitat-wrap">'+icon(t,full)+(ranked?badge:'')+'</div>'+(t.boost?'<span class="team-boost-chip" title="'+esc(t.boost.title||'Усиление следующего раунда')+'">✦ '+esc(t.boost.title||'Усиление')+'</span>':'')+'<strong title="'+esc(t.name)+'">'+esc(t.name)+'</strong><span class="team-detail">'+(ranked?(t.mean_seconds==null?'Время не записано':Number(t.mean_seconds).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+' с / чел.'):'<b class="team-answered">'+fmt(t.answered)+'</b> / '+fmt(t.members??t.players)+' ответили')+'</span>'+(ranked?'<span class="team-points">'+fmt(t.score)+' баллов</span>':'')+'</li>';
 }
 function teams(rows,options={}){return '<ol class="habitat-grid'+(options.ranked?' ranked':'')+'" style="--team-count:'+Math.max(1,Math.min(15,rows?.length||0))+'">'+(rows||[]).map(t=>teamTile(t,options)).join('')+'</ol>'}
 function patchTeams(root,rows){
  for(const t of rows||[]){
   const el=Array.from(root.querySelectorAll('[data-team]')).find(x=>x.dataset.team===String(t.id||t.position));if(!el)continue;
   const fill=el.querySelector('.habitat-color');if(fill)fill.style.clipPath='inset('+fillCut(t)+'% 0 0)';
   const count=el.querySelector('.team-answered');if(count)count.textContent=Number(t.answered||0);
   el.querySelector('svg')?.setAttribute('aria-label',habitats[(Math.max(1,Number(t.position)||1)-1)%15][1]+': '+Number(t.answered||0)+' из '+Number(t.members??t.players??0)+' ответили');
  }
 }
 function progress(root,rows){
  if(!root)return;const key=rows.map(t=>t.id||t.position).join(':');
  if(root.dataset.progressKey!==key||!root.querySelector('.habitat-grid')){root.innerHTML=teams(rows);root.dataset.progressKey=key}else patchTeams(root,rows);
 }
 function leaderboard(rows,limit=10){return rows?.length?'<ol class="player-leaderboard">'+rows.slice(0,limit).map((p,i)=>'<li><span class="player-place">'+(p.position||i+1)+'</span><strong>'+esc(p.nickname||'Игрок')+'</strong><span class="player-correct">'+fmt(p.correct)+' верных</span><b>'+fmt(p.score)+'</b></li>').join('')+'</ol>':'<p class="stage-empty">Рейтинг появится после первых ответов.</p>'}
 function flagVisualContent(url,visual,revealed=false){
  if(typeof url!=='string'||!/^https:\/\//i.test(url)||!visual||!['symbol','crop','pixel'].includes(visual.type))return '';
  const x=Math.max(10,Math.min(90,Number(visual.x)||50)),y=Math.max(10,Math.min(90,Number(visual.y)||50));
  const zoom=Math.max(1.5,Math.min(4,Number(visual.zoom)||2.5));
  const pixels=Math.max(14,Math.min(48,Number(visual.pixels)||24));
  const style='--focus-x:'+x+'%;--focus-y:'+y+'%;--focus-zoom:'+zoom+';';
  return '<div class="flag-visual-frame '+(revealed?'is-revealed':'is-obscured')+'" data-visual="'+esc(visual.type)+'" style="'+style+'">'+
    '<img class="flag-visual-image" src="'+esc(url)+'" alt="'+(revealed?'Полный флаг государства':'Фрагмент флага без названия государства')+'" decoding="async" loading="eager">'+
    (!revealed&&visual.type==='pixel'?'<canvas class="flag-pixel-canvas" data-pixels="'+pixels+'" role="img" aria-label="Пикселизированный флаг"></canvas>':'')+'</div>';
 }
 function hydrateFlagVisuals(root=document){
  for(const canvas of root.querySelectorAll('.flag-pixel-canvas:not([data-ready])')){
   const image=canvas.parentElement?.querySelector('.flag-visual-image');
   if(!image)continue;
   const draw=()=>{
    if(!image.naturalWidth||!image.naturalHeight)return;
    const w=480,h=260,small=document.createElement('canvas');
    const size=Math.max(14,Math.min(48,Number(canvas.dataset.pixels)||24));
    small.width=size;small.height=Math.max(8,Math.round(size*h/w));canvas.width=w;canvas.height=h;
    const low=small.getContext('2d'),large=canvas.getContext('2d');
    if(!low||!large)return;
    low.fillStyle='#ffffff';low.fillRect(0,0,small.width,small.height);
    const scale=Math.min(small.width/image.naturalWidth,small.height/image.naturalHeight);
    const iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;
    low.drawImage(image,(small.width-iw)/2,(small.height-ih)/2,iw,ih);
    large.imageSmoothingEnabled=false;large.drawImage(small,0,0,w,h);
    canvas.dataset.ready='true';
   };
   if(image.complete)draw();else image.addEventListener('load',draw,{once:true});
  }
 }
 function illustration(q,answer,content=''){
  // A flag-identification question must keep the flag visible until the answer; never replace it with a recall placeholder.
  if(Array.isArray(q.options)&&q.options.some(x=>x&&typeof x==='object'&&typeof x.image_url==='string')&&!q.media_url&&!q.illustration_url)return '';
  if(q.flag_assembly&&!answer)return '<figure class="question-frame assembly-frame"><div class="question-picture">'+assemblyPalette(q)+'</div><figcaption>Соберите флаг из этих полос</figcaption></figure>';
  const source=q.flag_visual?.type?q.media_url:q.kind==='hotspot'?q.media_url:q.illustration_url||(!['audio','video'].includes(q.kind)?q.media_url:'');
  if(q.flag_visual?.type&&typeof source==='string'&&/^https:\/\//i.test(source)){
   const revealed=!!answer;
   return '<figure class="question-frame flag-question-frame"><div class="question-picture">'+flagVisualContent(source,q.flag_visual,revealed)+'</div><figcaption>'+(revealed?'Полный флаг государства':'Определите государство по детали флага')+'</figcaption></figure>';
  }
  const url=typeof source==='string'&&/^https:\/\//i.test(source)?source:'';
  const drawing='<svg class="question-art quiz-drawing" viewBox="0 0 640 260" aria-hidden="true"><path d="M95 214c-23-39 10-71 30-99s-2-66 40-78 64 9 97-3 92-8 123 15 73-1 105 19 31 62 49 82-2 62-34 69-375 17-410-5Z" fill="#e8ddfc"/><ellipse cx="320" cy="220" rx="128" ry="12" fill="#d5c4f4"/><path d="m232 65 170-13 17 150-169 13-18-150Z" fill="#fff"/><path d="m232 65 18 150 77-24 75 11 17-150-88 24-99-11Z" fill="none" stroke="#7646cd" stroke-width="5" stroke-linejoin="round"/><path d="m327 191 4-115M267 100l39 7m-35 16 31 6m-28 16 30 5m49-49 36-9m-36 31 39-9m-39 32 42-9" stroke="#b49adf" stroke-width="5" stroke-linecap="round"/><path d="m171 152 5-18 5 18 18 5-18 5-5 18-5-18-18-5 18-5Zm288-87 3-13 4 13 13 4-13 3-4 13-3-13-13-3 13-4Z" fill="#a27adf"/><circle cx="443" cy="185" r="11" fill="#f2bb62"/><circle cx="206" cy="53" r="7" fill="#9165d5"/></svg>';
  const spot=answer?.hotspot,marker=spot?'<span class="answer-hotspot" data-x="'+Math.max(0,Math.min(100,Number(spot.x)))+'" data-y="'+Math.max(0,Math.min(100,Number(spot.y)))+'" data-radius="'+Math.max(0,Math.min(50,Number(spot.radius)))+'" aria-label="Правильная область"></span>':'';
  return '<figure class="question-frame"><div class="frame-orbit" aria-hidden="true"><i></i><i></i></div><div class="question-picture">'+(content||(url?'<img class="question-art" src="'+esc(url)+'" alt="Иллюстрация к вопросу">':drawing))+marker+'</div><figcaption>'+(url?'Иллюстрация к вопросу':'Время открытий')+'</figcaption></figure>';
 }
 function hydrateIllustrations(root=document){
  hydrateFlagVisuals(root);
  for(const img of root.querySelectorAll('.question-picture img')){
   const picture=img.closest('.question-picture'),marker=picture.querySelector('.answer-hotspot');
   const fit=()=>{if(!marker||!img.naturalWidth)return;const box={width:picture.clientWidth,height:picture.clientHeight},scale=Math.min(box.width/img.naturalWidth,box.height/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    Object.assign(marker.style,{left:(box.width-w)/2+w*Number(marker.dataset.x)/100+'px',top:(box.height-h)/2+h*Number(marker.dataset.y)/100+'px',width:w*Number(marker.dataset.radius)/50+'px',height:h*Number(marker.dataset.radius)/50+'px'})};
   img.onload=fit;img.onerror=()=>{const fallback=document.createElement('div');fallback.innerHTML=illustration({});picture.replaceChildren(fallback.querySelector('svg'));picture.closest('figure').querySelector('figcaption').textContent='Иллюстрация недоступна'};
   if(img.complete){if(img.naturalWidth)fit();else img.onerror()}
   if(marker){const observer=new ResizeObserver(()=>{if(picture.isConnected)fit();else observer.disconnect()});observer.observe(picture)}
  }
 }
 const duration=s=>Number(s.duration||s.question?.duration)||Math.max(1,Math.ceil((Date.parse(s.ends_at)-Date.now())/1000))||30;
 function clockMarkup(s,id='stageTimer'){return '<div class="stage-clock" data-phase="'+esc(s.phase)+'"><div class="clock-label">'+(s.phase==='result'?'Следующий этап через':'Время на ответ')+'</div><div class="clock-value"><strong id="'+id+'">0</strong><span>сек.</span></div><div class="clock-track" role="progressbar" aria-label="Оставшееся время" aria-valuemin="0" aria-valuemax="'+duration(s)+'"><span></span></div><span class="clock-warning" aria-live="polite"></span></div>'}
 const audio={context:null,enabled:(()=>{try{return localStorage.getItem('qwiz-audio-preference-v1')!=='off'}catch{return true}})(),volume:.45,voices:new Set(),lastTick:'',unlocking:null,musicTimer:null,musicKey:'',
  async unlock(){
   if(!this.enabled)return false;
   if(this.context?.state==='running')return true;
   if(this.unlocking)return this.unlocking;
   this.unlocking=(async()=>{try{
     this.context ||=new(window.AudioContext||window.webkitAudioContext)();
     await this.context.resume();
     return this.context.state==='running';
   }catch{return false}finally{this.unlocking=null}})();
   return this.unlocking;
  },
  async toggle(){
   if(this.enabled){this.enabled=false;this.stop();try{localStorage.setItem('qwiz-audio-preference-v1','off')}catch{}return false}
   this.enabled=true;try{localStorage.setItem('qwiz-audio-preference-v1','on')}catch{}
   if(await this.unlock())this.play('start');
   return true;
  },
  stop(){this.stopMusic();for(const o of this.voices){try{o.stop()}catch{}}this.voices.clear()},
  stopMusic(){if(this.musicTimer)clearInterval(this.musicTimer);this.musicTimer=null;this.musicKey=''},
  music(kind='arcade',id='',durationMs=16000){
   if(!this.enabled||document.hidden)return;
   const key=kind+':'+id;if(this.musicTimer&&this.musicKey===key)return;
   this.stopMusic();this.musicKey=key;
   let beat=0;const melody=kind==='intro'?['sunrise','sparkle','bells','fanfare']:kind==='victory'?['victory','sparkle','triumphant','bells']:['arcade','retro','synth','sprint'];
   const playBeat=()=>{if(document.hidden||!this.enabled){this.stopMusic();return}this.play(melody[beat++%melody.length]);if(durationMs&&beat*2350>=durationMs)this.stopMusic()};
   playBeat();this.musicTimer=setInterval(playBeat,2350);
  },
  setVolume(v){this.volume=Math.max(0,Math.min(1,Number(v)||0))},
  play(kind){
   if(!this.enabled||!this.context||this.context.state!=='running'||document.hidden||kind==='none')return;
   const patterns={tick:[[880,0,.1]],timeup:[[587,0,.22],[740,.12,.26],[880,.27,.5]],reveal:[[523,0,.2],[659,.09,.22],[784,.18,.24],[1047,.3,.5]],start:[[659,0,.13],[988,.13,.3]],accept:[[698,0,.12],[1047,.12,.25]],pop:[[784,0,.12]],round:[[523,0,.15],[784,.16,.3]],fanfare:[[523,0,.18],[659,.15,.18],[784,.3,.2],[1047,.5,.5]],synth:[[440,0,.16],[659,.16,.2],[988,.35,.4]],funny:[[659,0,.13],[523,.14,.13],[880,.3,.28]],
   victory:[[523,0,.16],[659,.14,.16],[784,.3,.16],[1047,.46,.2],[1319,.67,.65]],
   sparkle:[[1047,0,.11],[1319,.12,.14],[1568,.25,.18],[2093,.45,.35]],
   arcade:[[392,0,.1],[494,.11,.1],[587,.22,.1],[784,.33,.1],[988,.44,.4]],
   mystery:[[392,0,.3],[370,.24,.25],[311,.5,.3],[233,.8,.65]],
   cosmic:[[440,0,.4],[554,.28,.35],[659,.62,.35],[880,1,.58]],
   retro:[[523,0,.11],[659,.13,.11],[523,.26,.11],[784,.4,.13],[1047,.59,.4]],
   triumphant:[[392,0,.2],[523,.19,.2],[659,.38,.2],[784,.57,.2],[1047,.78,.7]],
   heartbeat:[[220,0,.12],[220,.19,.18],[294,.55,.25],[392,.82,.4]],
   bells:[[784,0,.25],[1047,.21,.27],[1319,.49,.28],[1568,.83,.7]],
   sprint:[[659,0,.09],[784,.1,.09],[880,.2,.09],[988,.3,.09],[1175,.4,.4]],
   sunrise:[[330,0,.28],[440,.24,.29],[554,.51,.29],[659,.79,.29],[880,1.1,.75]],
   jazz:[[392,0,.15],[466,.14,.15],[587,.3,.17],[740,.48,.25],[659,.75,.45]],
   suspense:[[246,0,.18],[277,.2,.18],[311,.4,.18],[349,.6,.18],[370,.8,.5]]},now=this.context.currentTime+.015;
   for(const [pitch,delay,len]of patterns[kind]||patterns.round){if(this.voices.size>=16)break;const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type='sine';osc.frequency.value=pitch;
    gain.gain.setValueAtTime(.0001,now+delay);gain.gain.linearRampToValueAtTime(this.volume*(kind==='tick'?.12:.18),now+delay+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+len);
    osc.connect(gain);gain.connect(this.context.destination);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect()};osc.start(now+delay);osc.stop(now+delay+len+.03)}
  },
  countdown(s,left){if(s.phase!=='question'||left>10||left<0)return;const key=[s.code,s.index,s.ends_at,left].join(':');if(this.lastTick===key)return;this.lastTick=key;this.play(left===0?'timeup':'tick')}
 };
 // A browser blocks autoplay until a real key/pointer gesture. Keep audio preference ON
 // by default, but unlock the AudioContext only after the first deliberate interaction.
 const unlockOnGesture=()=>{if(audio.enabled)void audio.unlock()};
 document.addEventListener('pointerdown',unlockOnGesture,{passive:true});
 document.addEventListener('keydown',unlockOnGesture);
 const uiPaths={
  volume:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/>',
  muted:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  play:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>',
  users:'<path d="M16 20v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="3.5"/><path d="M20 20v-2a4 4 0 0 0-3-3.9M16 3.2a3.5 3.5 0 0 1 0 6.6"/>',
  user:'<circle cx="12" cy="7" r="4"/><path d="M4.5 21v-2c0-4.2 3-7 7.5-7s7.5 2.8 7.5 7v2"/>',
  sparkles:'<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z"/>',
  arrows:'<path d="m8 4-4 4 4 4M4 8h16m-4 4 4 4-4 4M20 16H4"/>',
  add:'<path d="M12 5v14M5 12h14"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M20 12a8 8 0 0 0-.2-1.5L22 9l-2-3.5-2.5.8a8 8 0 0 0-2.5-1.5L14.5 2h-5L9 4.8a8 8 0 0 0-2.5 1.5L4 5.5 2 9l2.2 1.5a8 8 0 0 0 0 3L2 15l2 3.5 2.5-.8A8 8 0 0 0 9 19.2l.5 2.8h5l.5-2.8a8 8 0 0 0 2.5-1.5l2.5.8L22 15l-2.2-1.5A8 8 0 0 0 20 12Z"/>',
  monitor:'<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14-5L3 9m0-5v5h5M4 13a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>',
  qr:'<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14v2m4-2v2m-4 4h7m-3-7v7"/>',
  forward:'<path d="M4 12h16m-7-7 7 7-7 7"/>',
  search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  flag:'<path d="M5 21V3m0 1c5-3 8 2 15-1v11c-7 3-10-2-15 1"/>',
  full:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  trash:'<path d="M4 7h16M10 4h4m-7 3 1 13h8l1-13M10 11v6m4-6v6"/>',
  chart:'<path d="M4 20V10M12 20V4M20 20v-7"/>',
  close:'<path d="M5 5 19 19M19 5 5 19"/>'
 };
 function uiIcon(name){return '<svg class="ui-icon unified-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(uiPaths[name]||uiPaths.sparkles)+'</svg>'}
 function iconLabel(el,label,name){if(!el)return;el.innerHTML=uiIcon(name)+'<span>'+esc(label)+'</span>'}
 function decorateControls(root=document){
  const mapped={studioSound:audio.enabled?'volume':'muted',gameSound:audio.enabled?'volume':'muted',projectionSound:audio.enabled?'volume':'muted',
   cardSoundPreview:'volume',generalSettings:'settings',addCard:'add',appendRound:'add',saveBuild:'check',
   launchButton:'play',reloadRooms:'refresh',copyRoomUrl:'copy',openScreen:'monitor',showPublicScreen:'monitor',
   refreshRoomContent:'refresh',addRoomQuestions:'add',shuffleTeams:'users',manageTeams:'users',
   showTeamBoard:'qr',reloadInsights:'refresh',liveStart:'play',liveReveal:'check',liveNext:'forward',
   liveFinish:'close',projectionFullscreen:'full',openPresenterSide:'monitor',openPresenter:'monitor',
   refreshCatalog:'refresh',refreshRoom:'refresh',hostStart:'play',hostReveal:'check',hostNext:'forward',
   createRoomButton:'play',addQuestion:'add',createQuizToggle:'add',importQuiz:'add',copyInvite:'copy',
   resumeGameButton:'forward',joinButton:'play',newBuild:'add',newQuestion:'add'};
  for(const [id,name]of Object.entries(mapped)){
   const el=root.getElementById?.(id);if(!el||el.querySelector('svg'))continue;
   const first=el.firstChild;
   if(first?.nodeType===3&&/^\s*[♫◫▦▥✦⇄▶↻+]/.test(first.textContent))first.textContent=first.textContent.replace(/^\s*[♫◫▦▥✦⇄▶↻+]\s*/,'');
   el.insertAdjacentHTML('afterbegin',uiIcon(name));
  }
 }
 function updateClock(s,offset=0,root=document,id='stageTimer',withSound=true){
  updateMemory(root,s,offset);
  const ms=Math.max(0,Date.parse(s.ends_at)-Date.now()-offset)||0,left=Math.ceil(ms/1000),total=duration(s);
  const number=root.querySelector('#'+id);if(number)number.textContent=left;
  const clock=root.querySelector('.stage-clock');if(clock){clock.classList.toggle('is-urgent',s.phase==='question'&&left<=10);const bar=clock.querySelector('.clock-track');bar?.setAttribute('aria-valuenow',String(Math.min(total,left)));if(bar?.firstElementChild)bar.firstElementChild.style.transform='scaleX('+Math.min(1,ms/(total*1000))+')';const label=clock.querySelector('.clock-warning');if(label)label.textContent=s.phase==='question'&&left<=10?(left?'Осталось '+left+' сек.':'Время вышло'):''}
  if(withSound)audio.countdown(s,left);return left;
 }
 function stripeOption(value){
  if(!value||!Array.isArray(value.stripes)||![2,3,4].includes(value.stripes.length)
   ||!value.stripes.every(v=>typeof v==='string'&&/^#[a-fA-F0-9]{6}$/.test(v))
   ||!['horizontal','vertical'].includes(value.orientation))return '';
  const vertical=value.orientation==='vertical';
  return '<span class="flag-stripe-art '+(vertical?'vertical':'horizontal')+'" role="img" aria-label="Полосы флага">'+
    value.stripes.map(color=>'<span style="background:'+esc(color)+'"></span>').join('')+'</span>';
 }
 // The authoritative answer indices are provided by the server after reveal.
 // For colour-order questions, the correct answer is a flag drawing, never
 // a label such as "синий — жёлтый — красный".
 function correctFlagMarkup(question,answer){
  const idx=Array.isArray(answer?.indices)?Number(answer.indices[0]):NaN;
  if(!Number.isInteger(idx)||idx<0||!Array.isArray(question?.options)||idx>=question.options.length)return '';
  const item=question.options[idx];
  const flag=stripeOption(item);
  if(flag)return '<div class="correct-flag-art" role="group" aria-label="Правильный флаг">'+flag+'</div>';
  if(item&&typeof item==='object'&&typeof item.image_url==='string'&&/^https:\/\/[^\s]+[.]svg(?:\?[^\s]*)?$/i.test(item.image_url))
   return '<div class="correct-flag-art"><img src="'+esc(item.image_url)+'" alt="Правильный флаг" loading="eager" decoding="async"></div>';
  return '';
 }
 // Existing flag-memory questions now behave as ordinary visible-flag questions.
 // Keep the method for the shared stage API, without hiding the question or answers.
 function updateMemory(root,s,offset=0){return;}
 function assemblyPalette(q){
  const colors=q.flag_assembly?.colors||{};
  return '<div class="assembly-palette">'+(q.options||[]).map(name=>'<span><i style="background:'+esc(/^#[0-9a-f]{6}$/i.test(colors[name])?colors[name]:'#888888')+'" aria-hidden="true"></i>'+esc(capitalize(name))+'</span>').join('')+'</div>';
 }
 function assemblyMarkup(q,locked=false){
  const vertical=q.flag_assembly?.orientation==='vertical';
  return '<p class="muted-small">Расположите полосы '+(vertical?'слева направо':'сверху вниз')+'. Каждый цвет используется один раз.</p><div class="assembly-preview flag-stripe-art '+(vertical?'vertical':'horizontal')+'" role="img" aria-label="Собираемый флаг">'+(q.options||[]).map(()=>'<span></span>').join('')+'</div><div class="rich-rows">'+(q.options||[]).map((_,i)=>'<label class="rich-row"><span>Полоса '+(i+1)+'</span><select class="rich-order"'+(locked?' disabled':'')+'><option value="">Выберите цвет</option>'+(q.options||[]).map((name,k)=>'<option value="'+k+'">'+esc(capitalize(name))+'</option>').join('')+'</select></label>').join('')+'</div>';
 }
 function hydrateAssembly(root,q){
  if(!q.flag_assembly)return;
  const preview=root.querySelector('.assembly-preview');if(!preview)return;
  const inputs=Array.from(root.querySelectorAll('select.rich-order'));
  const update=()=>{
   const labels=[];
   inputs.forEach((input,i)=>{const name=input.value===''?'':q.options[Number(input.value)],color=q.flag_assembly.colors?.[name];preview.children[i].style.background=/^#[0-9a-f]{6}$/i.test(color)?color:'';labels.push(name||'не выбрана')});
   preview.setAttribute('aria-label','Полосы: '+labels.join(', '));
  };
  inputs.forEach(input=>input.addEventListener('change',update));update();
 }
 function sourceLinks(answer){
  const urls=(Array.isArray(answer?.sources)?answer.sources:[]).filter(url=>typeof url==='string'&&/^https:\/\//i.test(url));
  return urls.length?'<p class="answer-sources">'+urls.map((url,i)=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Источник'+(urls.length>1?' '+(i+1):'')+'</a>').join(' · ')+'</p>':'';
 }
 async function exitFullscreen(){
  document.documentElement.classList.remove('quiz-focus');
  if(document.fullscreenElement)try{await document.exitFullscreen()}catch{}
  document.dispatchEvent(new Event('quizfullscreenchange'));
 }
 function bindFullscreen(button){
  if(!button)return;
  const root=document.documentElement;
  const active=()=>!!document.fullscreenElement||root.classList.contains('quiz-focus');
  const update=()=>{iconLabel(button,active()?'Вернуть обычный вид':'На весь экран','full');button.setAttribute('aria-pressed',String(active()))};
  button.onclick=async()=>{
   if(active())await exitFullscreen();
   else if(root.requestFullscreen&&document.fullscreenEnabled!==false){try{await root.requestFullscreen()}catch{root.classList.add('quiz-focus')}}
   else root.classList.add('quiz-focus');
   update();
  };
  document.addEventListener('fullscreenchange',update);
  document.addEventListener('quizfullscreenchange',update);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&root.classList.contains('quiz-focus')){root.classList.remove('quiz-focus');update()}});
  update();
 }
 function questionStats(rows){
  const scored=(rows||[]).filter(x=>x.participants>0&&x.correct_rate!=null);
  const items=(list,errors=false)=>list.map(x=>'<li><span class="insight-question-number">'+(Number(x.index)+1)+'</span><div><strong>'+esc(x.prompt)+'</strong><small>'+x.correct+' из '+x.participants+' верно · '+x.incorrect+' ошибок · '+x.unanswered+' без ответа</small></div><b title="'+(errors?'Доля ошибочных ответов':'Доля правильных ответов')+'">'+fmt(errors?(x.incorrect_rate??100-x.correct_rate):x.correct_rate)+'%</b></li>').join('');
  const best=scored.slice().sort((a,b)=>b.correct_rate-a.correct_rate||a.index-b.index).slice(0,3);
  const hardest=scored.filter(x=>x.answered>0).sort((a,b)=>(b.incorrect_rate??100-b.correct_rate)-(a.incorrect_rate??100-a.correct_rate)||b.incorrect-a.incorrect||a.index-b.index).slice(0,3);
  return '<div class="question-insights"><section><h2>Знаем лучше всего</h2><p>Три вопроса с наибольшей долей верных ответов.</p><ol>'+items(best)+'</ol></section><section><h2>Чаще ошибались</h2><p>Три вопроса с наибольшей долей ошибок. Пропуски считаются отдельно.</p><ol>'+items(hardest,true)+'</ol></section></div><details class="all-question-stats"><summary>Все вопросы · '+rows.length+'</summary><ol>'+items(rows)+'</ol></details>';
 }
 return{esc,fmt,habitats,icon,teamTile,teams,patchTeams,progress,leaderboard,illustration,hydrateIllustrations,clockMarkup,updateClock,audio,questionStats,stripeOption,correctFlagMarkup,flagVisualContent,hydrateFlagVisuals,uiIcon,iconLabel,decorateControls,updateMemory,assemblyPalette,assemblyMarkup,hydrateAssembly,sourceLinks,capitalize,countLabel,phaseLabel,bindFullscreen,exitFullscreen};
})();
