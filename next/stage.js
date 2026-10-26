'use strict';
// Shared question visuals and audio; scoring and phase transitions stay on the server.
window.QwizStage=(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>Math.round(Number(n)||0).toLocaleString('ru-RU',{maximumFractionDigits:0});
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
  // Memory mechanic: show the source flag first, then hide it at the shared
  // absolute deadline. Never generate a new deadline during a re-render.
  if(q.flag_memory&&!answer){
   const image=typeof q.media_url==='string'&&/^https:\/\//i.test(q.media_url)?q.media_url:'';
   const open=Number.isFinite(Date.parse(q.memory_until))&&Date.parse(q.memory_until)>Date.now();
   return '<figure class="question-frame memory-frame" data-memory-study '+(!open?'hidden':'')+'>'+
    '<div class="question-picture">'+(image?'<img class="question-art" src="'+esc(image)+'" alt="Запомните флаг">':'')+'</div>'+
    '<figcaption>Запомните флаг до появления вариантов ответа</figcaption></figure>';
  }
  // A flag-identification question must keep the flag visible until the answer; never replace it with a recall placeholder.
  if(Array.isArray(q.options)&&q.options.some(x=>x&&typeof x==='object'&&typeof x.image_url==='string')&&!q.media_url&&!q.illustration_url)return '';
  if(q.flag_assembly&&!answer)return '';
  const source=q.flag_visual?.type?q.media_url:q.kind==='hotspot'?q.media_url:q.illustration_url||(!['audio','video'].includes(q.kind)?q.media_url:'');
  if(q.flag_visual?.type&&typeof source==='string'&&/^https:\/\//i.test(source)){
   const revealed=!!answer;
   return '<figure class="question-frame flag-question-frame"><div class="question-picture">'+flagVisualContent(source,q.flag_visual,revealed)+'</div><figcaption>'+(revealed?'Полный флаг государства':'Определите государство по детали флага')+'</figcaption></figure>';
  }
  const url=typeof source==='string'&&/^https:\/\//i.test(source)?source:'';
  const drawing='<svg class="question-art quiz-drawing" viewBox="0 0 640 260" aria-hidden="true"><path d="M95 214c-23-39 10-71 30-99s-2-66 40-78 64 9 97-3 92-8 123 15 73-1 105 19 31 62 49 82-2 62-34 69-375 17-410-5Z" fill="#e8ddfc"/><ellipse cx="320" cy="220" rx="128" ry="12" fill="#d5c4f4"/><path d="m232 65 170-13 17 150-169 13-18-150Z" fill="#fff"/><path d="m232 65 18 150 77-24 75 11 17-150-88 24-99-11Z" fill="none" stroke="#7646cd" stroke-width="5" stroke-linejoin="round"/><path d="m327 191 4-115M267 100l39 7m-35 16 31 6m-28 16 30 5m49-49 36-9m-36 31 39-9m-39 32 42-9" stroke="#b49adf" stroke-width="5" stroke-linecap="round"/><path d="m171 152 5-18 5 18 18 5-18 5-5 18-5-18-18-5 18-5Zm288-87 3-13 4 13 13 4-13 3-4 13-3-13-13-3 13-4Z" fill="#a27adf"/><circle cx="443" cy="185" r="11" fill="#f2bb62"/><circle cx="206" cy="53" r="7" fill="#9165d5"/></svg>';
  const spot=answer?.hotspot,marker=spot?'<span class="answer-hotspot" data-x="'+Math.max(0,Math.min(100,Number(spot.x)))+'" data-y="'+Math.max(0,Math.min(100,Number(spot.y)))+'" data-radius="'+Math.max(0,Math.min(50,Number(spot.radius)))+'" aria-label="Правильная область"></span>':'';
  return '<figure class="question-frame'+(url?' flag-media-frame':'')+'">'+(url?'':'<div class="frame-orbit" aria-hidden="true"><i></i><i></i></div>')+'<div class="question-picture">'+(content||(url?'<img class="question-art" src="'+esc(url)+'" alt="Изображение задания">':drawing))+marker+'</div>'+(url?'':'<figcaption>Время открытий</figcaption>')+'</figure>';
 }
 function hydrateIllustrations(root=document){
  hydrateFlagVisuals(root);
  for(const img of root.querySelectorAll('.question-picture img')){
   const picture=img.closest('.question-picture'),marker=picture.querySelector('.answer-hotspot');
   const fit=()=>{if(!marker||!img.naturalWidth)return;const box={width:picture.clientWidth,height:picture.clientHeight},scale=Math.min(box.width/img.naturalWidth,box.height/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    Object.assign(marker.style,{left:(box.width-w)/2+w*Number(marker.dataset.x)/100+'px',top:(box.height-h)/2+h*Number(marker.dataset.y)/100+'px',width:w*Number(marker.dataset.radius)/50+'px',height:h*Number(marker.dataset.radius)/50+'px'})};
   img.onload=fit;img.onerror=()=>{const fallback=document.createElement('div');fallback.innerHTML=illustration({});picture.replaceChildren(fallback.querySelector('svg'));(()=>{const figure=picture.closest('figure');let caption=figure?.querySelector('figcaption');if(figure&&!caption){caption=document.createElement('figcaption');figure.appendChild(caption)}if(caption)caption.textContent='Иллюстрация недоступна';})()};
   if(img.complete){if(img.naturalWidth)fit();else img.onerror()}
   if(marker){const observer=new ResizeObserver(()=>{if(picture.isConnected)fit();else observer.disconnect()});observer.observe(picture)}
  }
 }
 const duration=s=>Number(s.duration||s.question?.duration)||Math.max(1,Math.ceil((Date.parse(s.ends_at)-Date.now())/1000))||30;
 function clockMarkup(s,id='stageTimer'){return '<div class="stage-clock" data-phase="'+esc(s.phase)+'"><div class="clock-label">'+(s.phase==='result'?'Следующий этап через':'Время на ответ')+'</div><div class="clock-value"><strong id="'+id+'">0</strong><span>сек.</span></div><div class="clock-track" role="progressbar" aria-label="Оставшееся время" aria-valuemin="0" aria-valuemax="'+duration(s)+'"><span></span></div><span class="clock-warning" aria-live="polite"></span></div>'}
 const audio={context:null,enabled:(()=>{try{return localStorage.getItem('qwiz-audio-preference-v1')!=='off'}catch{return true}})(),volume:.45,voices:new Set(),lastTick:'',unlocking:null,musicTimer:null,musicKey:'',themeTimer:null,themeWanted:false,themeStep:0,
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
  stop(){this.stopMusic();this.stopTheme();for(const o of this.voices){try{o.stop()}catch{}}this.voices.clear()},
  stopMusic(){if(this.musicTimer)clearInterval(this.musicTimer);this.musicTimer=null;this.musicKey=''},
  music(kind='arcade',id='',durationMs=16000){
   if(!this.enabled||document.hidden)return;
   const key=kind+':'+id;if(this.musicTimer&&this.musicKey===key)return;
   this.stopMusic();this.musicKey=key;
   let beat=0;const melody=kind==='intro'?['sunrise','sparkle','bells','fanfare']:kind==='victory'?['victory','sparkle','triumphant','bells']:['arcade','retro','synth','sprint'];
   const playBeat=()=>{if(document.hidden||!this.enabled){this.stopMusic();return}this.play(melody[beat++%melody.length]);if(durationMs&&beat*2350>=durationMs)this.stopMusic()};
   playBeat();this.musicTimer=setInterval(playBeat,2350);
  },
  async startTheme(){
   this.themeWanted=true;
   if(!this.enabled||this.themeTimer||document.hidden)return;
   if(!(await this.unlock())||!this.themeWanted||this.themeTimer)return;
   const progression=[0,7,9,5],base=[48,55,57,53],scale=[0,2,4,7,9,12,14,16];
   const notes=[0,2,4,7,9,7,4,2,7,9,12,9,7,4,2,4,9,12,14,12,9,7,4,7,7,9,7,4,2,4,7,2];
   const play=()=>{
    if(!this.enabled||document.hidden||!this.themeWanted){this.stopTheme();return}
    const context=this.context;if(!context||context.state!=='running')return;
    const n=this.themeStep++,bar=Math.floor(n/8)%4,root=base[bar],when=context.currentTime+.02;
    const tone=(midi,len,kind,vol)=>{
     if(this.voices.size>28)return;
     const osc=context.createOscillator(),gain=context.createGain();
     osc.type=kind;osc.frequency.setValueAtTime(440*Math.pow(2,(midi-69)/12),when);
     gain.gain.setValueAtTime(.0001,when);
     gain.gain.linearRampToValueAtTime(Math.max(.0002,this.volume*vol),when+.02);
     gain.gain.exponentialRampToValueAtTime(.0001,when+len);
     osc.connect(gain);gain.connect(context.destination);this.voices.add(osc);
     osc.onended=()=>{this.voices.delete(osc);try{osc.disconnect();gain.disconnect()}catch{}};
     osc.start(when);osc.stop(when+len+.025);
    };
    tone(root+12+notes[n%notes.length],.36,'triangle',.09);
    if(n%4===0)tone(root-.5,.83,'sine',.075);
    if(n%2===0)tone(root+7,.25,'triangle',.028);
   };
   this.themeStep=0;play();this.themeTimer=setInterval(play,380);
  },
  stopTheme(){this.themeWanted=false;if(this.themeTimer)clearInterval(this.themeTimer);this.themeTimer=null;},
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
 const unlockOnGesture=()=>{if(audio.enabled)void audio.unlock().then(()=>{if(audio.themeWanted&&!audio.themeTimer)audio.startTheme()})};
 document.addEventListener('pointerdown',unlockOnGesture,{passive:true});
 document.addEventListener('keydown',unlockOnGesture);
 const roundArtPaths={
  flag:'<path d="M5 22V3m0 2c5-3 8 2 15-1v12c-7 3-10-2-15 1"/>',
  round:'<path d="M5 22V3m0 2c5-3 8 2 15-1v12c-7 3-10-2-15 1"/>',
  map:'<circle cx="12" cy="12" r="9"/><path d="m16.5 7.5-3.3 6-5.7 3 3-5.7z"/>',
  arcade_rocket:'<path d="M4 16c-1.8 1.5-2 5-2 5s3.5-.2 5-2a2 2 0 0 0-3-3Z"/><path d="m12 15-3-3c1-3 2.6-5.6 5.5-7.5C16.8 3 19 2 22 2c0 3-1 5.2-2.5 7.5C17.6 12.4 15 14 12 15Z"/><path d="M9 12H4c.5-3 2.3-5.5 6-5.5M12 15v5c3-.5 5.5-2.3 5.5-6"/><circle cx="16.2" cy="7.8" r="1.2"/>',
  arcade_blitz:'<circle cx="12" cy="12.5" r="8"/><path d="M10 2h4m-2 2v2m6.5 0L20 4.5M12.5 8l-4 6h4l-1 4 5-7h-4z"/>',
  arcade_tug:'<path d="M2 12h7m6 0h7M7 8l-4 4 4 4m10-8 4 4-4 4"/><path d="m9.5 11 2.5-3 2.5 3v3L12 17l-2.5-3z"/>',
  arcade_captain:'<path d="M5 3 19 17m-5 3 6-6m-15 2 3 3m-3 2 3-3M19 3 5 17m5 3-6-6m15 2-3 3m3 2-3-3"/>',
  intro:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  finale:'<path d="M7 4h10v7c0 7-10 7-10 0V4ZM7 7H3v3c0 3 3 5 6 5m8-8h4v3c0 3-3 5-6 5m-3 2v4m-4 0h8"/>'
 };
 function roundIconSvg(key){
  // A sculpted, layered waving pennant instead of the primitive outline.
  if(key==='flag'||key==='round')return '<svg class="round-art-svg round-flag-sculpture" viewBox="0 0 240 160" fill="none" aria-hidden="true">'+
   '<defs><linearGradient id="qwizFlagMaterial" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#C8B0FF"/><stop offset=".28" stop-color="#8D5BE8"/><stop offset=".63" stop-color="#6A38C8"/><stop offset="1" stop-color="#A985F3"/></linearGradient>'+
   '<linearGradient id="qwizFlagSheen" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fff" stop-opacity=".56"/><stop offset=".38" stop-color="#fff" stop-opacity=".03"/><stop offset=".76" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#30146e" stop-opacity=".17"/></linearGradient></defs>'+
   '<path d="M42 21v128" stroke="#5E389C" stroke-width="7" stroke-linecap="round"/><circle cx="42" cy="19" r="6" fill="#B98AF3"/>'+
   '<g class="flag-sculpture-cloth"><path d="M46 33C92 8 116 48 157 31c20-9 36-12 53-6v94c-23-7-40-2-58 7-39 18-67-21-106 0Z" fill="url(#qwizFlagMaterial)"/>'+
   '<path d="M46 33C92 8 116 48 157 31c20-9 36-12 53-6v94c-23-7-40-2-58 7-39 18-67-21-106 0Z" fill="url(#qwizFlagSheen)"/>'+
   '<path d="M46 62c42-23 74 17 111-2 17-9 35-10 53-7M46 93c42-20 74 19 111 0 17-9 35-10 53-6" stroke="#F2E9FF" stroke-opacity=".66" stroke-width="5"/>'+
   '<path d="M158 31c-15 18-13 75-6 95" stroke="#291255" stroke-opacity=".15" stroke-width="12"/></g></svg>';
  return '<svg class="round-art-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
    (roundArtPaths[key]||roundArtPaths.flag)+'</svg>';
 }
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
  pause:'<rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/>',
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
  if(question?.flag_assembly){
   // A finished assembly reveals the actual country flag, never the answer as words.
   const prompt=String(question.prompt||'');
   const country=/государств[ао]\s+[«"]([^»"]+)[»"]/iu.exec(prompt)?.[1]?.toLocaleLowerCase('ru-RU');
   const iso={'германия':'de','россия':'ru','венгрия':'hu','болгария':'bg','нидерланды':'nl',
    'эстония':'ee','литва':'lt','люксембург':'lu','йемен':'ye','габон':'ga','армения':'am',
    'сьерра-леоне':'sl','франция':'fr','италия':'it','ирландия':'ie','бельгия':'be',
    'румыния':'ro','мали':'ml','гвинея':'gn','чад':'td'}[country];
   if(iso)return '<div class="correct-flag-art"><img src="./assets/flags-world/'+iso+'.svg" alt="Правильный флаг: '+esc(country)+'" loading="eager" decoding="async"></div>';
   const sequence=Array.isArray(question.solution?.order)?question.solution.order:[];
   const palette=question.flag_assembly.colors||{};
   const stripes=sequence.map(name=>palette[name]);
   if(stripes.length>=2&&stripes.every(hex=>/^#[0-9a-f]{6}$/i.test(hex))){
    return '<div class="correct-flag-art">'+stripeOption({orientation:question.flag_assembly.orientation,stripes})+'</div>';
   }
  }

  const opts=Array.isArray(question?.options)?question.options:[];
  const idx=Array.isArray(answer?.indices)&&answer.indices.length===1?Number(answer.indices[0]):NaN;
  const item=Number.isInteger(idx)&&idx>=0&&idx<opts.length?opts[idx]:null;
  const wrap=art=>'<div class="correct-flag-art" role="group" aria-label="Правильный флаг">'+art+'</div>';
  // First use precisely the stripe colours returned by the server.
  const flag=stripeOption(item);
  if(flag)return wrap(flag);
  const svgUrl=v=>typeof v==='string'&&/^https:\/\/[^\s]+[.]svg(?:\?[^\s]*)?$/i.test(v)?v:'';
  const image=svgUrl(item&&typeof item==='object'?item.image_url:null)||svgUrl(answer?.image_url);
  if(image)return wrap('<img src="'+esc(image)+'" alt="Правильный флаг" loading="eager" decoding="async">');
  // Legacy questions sometimes store colour-order answers as text, not stripe objects.
  // Only treat these as flag artwork when the question explicitly asks about flag stripes.
  const prompt=String(question?.prompt||'');
  if(question?.kind!=='flag'||!/цвет|полос|порядок/iu.test(prompt))return '';
  const raw=typeof item==='string'?item:String(answer?.text||'');
  const words=raw.split(/\s*(?:—|–|→|,|;|\s-\s)\s*/u).map(x=>x.trim().toLocaleLowerCase('ru-RU'));
  const palette={'красный':'#CE293D','белый':'#FFFFFF','зелёный':'#477050',
   'синий':'#0039A6','голубой':'#4891D9','чёрный':'#000000','черный':'#000000',
   'жёлтый':'#FCD116','желтый':'#FCD116','золотой':'#FFCE00','оранжевый':'#FF883E'};
  if(words.length<2||words.length>4||words.some(w=>!palette[w]))return '';
  // Approved flags already exist in the local asset library: use the actual
  // national SVG when the country is named, rather than approximate colours.
  const country=/государств[ао]\s+[«"]([^»"]+)[»"]/iu.exec(prompt)?.[1]?.toLocaleLowerCase('ru-RU');
  const iso={'германия':'de','россия':'ru','венгрия':'hu','болгария':'bg',
   'нидерланды':'nl','эстония':'ee','литва':'lt','люксембург':'lu',
   'йемен':'ye','габон':'ga','армения':'am','сьерра-леоне':'sl',
   'франция':'fr','италия':'it','ирландия':'ie','бельгия':'be',
   'румыния':'ro','мали':'ml','гвинея':'gn','чад':'td'}[country];
  if(iso)return wrap('<img src="./assets/flags-world/'+iso+'.svg" alt="Правильный флаг государства" loading="eager" decoding="async">');
  const orientation=/вертикальн|слева направо/iu.test(prompt)?'vertical':'horizontal';
  const stripes=stripeOption({orientation,stripes:words.map(w=>palette[w])});
  return stripes?wrap(stripes):'';
 }
 // The client does not choose the deadline; the server supplies memory_until.
 // On resume, compare the absolute deadline instead of restarting study time.
 function updateMemory(root,s,offset=0){
  const q=s?.question;
  if(!q?.flag_memory||s?.phase!=='question')return;
  const until=Date.parse(q.memory_until);
  const studying=Number.isFinite(until)&&until>Date.now()+Number(offset||0);
  for(const study of root.querySelectorAll('[data-memory-study]'))study.hidden=!studying;
  for(const answers of root.querySelectorAll('[data-memory-answer]')){
   answers.hidden=studying;
   answers.setAttribute('aria-hidden',String(studying));
   for(const control of answers.querySelectorAll('button,input,select')){
    if(control.dataset.memoryWasDisabled===undefined)control.dataset.memoryWasDisabled=String(control.disabled);
    control.disabled=studying||control.dataset.memoryWasDisabled==='true';
   }
  }
 }
 function assemblyPalette(q){return '';} // The colors now belong below the flag, never above the question.
 function assemblyMarkup(q,locked=false){
  const colors=q.flag_assembly?.colors||{}, vertical=q.flag_assembly?.orientation==='vertical';
  const options=Array.isArray(q.options)?q.options:[];
  const choice=(name,i)=>'<button type="button" class="assembly-color" data-assembly-color="'+i+'" draggable="'+(!locked)+'"'+(locked?' disabled':'')+'><i class="assembly-swatch" style="background:'+esc(/^#[0-9a-f]{6}$/i.test(colors[name])?colors[name]:'#888888')+'"></i><span>'+esc(capitalize(name))+'</span><span class="assembly-grip" aria-hidden="true">⠿</span></button>';
  return '<div class="assembly-builder" data-assembly-builder data-assembly-locked="'+Boolean(locked)+'">'+
   '<div class="assembly-preview '+(vertical?'vertical':'horizontal')+'" aria-label="Соберите флаг: '+(vertical?'полосы слева направо':'полосы сверху вниз')+'">'+
    options.map((_,i)=>'<button type="button" class="assembly-slot" data-assembly-slot="'+i+'" data-value=""'+(locked?' disabled':'')+' aria-label="Поместить цвет в полосу '+(i+1)+'"><span aria-hidden="true">↓</span></button>').join('')+
   '</div><div class="assembly-colors" aria-label="Цвета для перетаскивания">'+options.map(choice).join('')+'</div>'+
   '<p class="assembly-hint">Перетащите цвет пальцем или мышью на нужную полосу. До нажатия «ОК» можно перемещать цвета.</p></div>';
 }
 function assemblyItems(root,q){
  const slots=[...root.querySelectorAll('[data-assembly-slot]')];
  if(slots.length!==(q?.options||[]).length)return null;
  const values=slots.map(s=>s.dataset.value);
  if(values.some(v=>v==='')||new Set(values).size!==values.length)return null;
  return values.map(v=>q.options[Number(v)]);
 }
 function hydrateAssembly(root,q){
  if(!q?.flag_assembly)return;
  const builder=root.querySelector('[data-assembly-builder]');
  if(!builder||builder.dataset.assemblyLocked==='true')return;
  const slots=[...builder.querySelectorAll('[data-assembly-slot]')];
  const colors=[...builder.querySelectorAll('[data-assembly-color]')];
  const submit=root.querySelector('[data-submit-rich]');
  const palette=q.flag_assembly.colors||{};
  const state=Array(slots.length).fill(null);
  let dragging=null,pointer=null,ghost=null;
  const paint=()=>{
   slots.forEach((slot,i)=>{
    const n=state[i],name=n===null?'':q.options[n],hex=palette[name]||'';
    slot.dataset.value=n===null?'':String(n);
    slot.style.background=n===null?'':(/^#[0-9a-f]{6}$/i.test(hex)?hex:'');
    slot.classList.toggle('is-filled',n!==null);
    slot.textContent=n===null?'↓':'';
    slot.draggable=n!==null;
    slot.setAttribute('aria-label',n===null?'Полоса '+(i+1)+': пусто':'Полоса '+(i+1)+': цвет установлен. Перетащите для изменения');
   });
   colors.forEach((b,i)=>{b.hidden=state.includes(i)});
   if(submit)submit.disabled=state.includes(null);
  };
  const place=(target,n)=>{
   if(!Number.isInteger(target)||target<0||target>=slots.length||
      !Number.isInteger(n)||n<0||n>=colors.length)return;
   const current=state.indexOf(n);
   if(current===target)return;
   const prev=state[target];
   if(current>=0)state[current]=prev;
   state[target]=n;paint();
  };
  const sourceIndex=target=>{
   const color=target.closest('[data-assembly-color]');
   if(color)return Number(color.dataset.assemblyColor);
   const slot=target.closest('[data-assembly-slot]');
   if(slot&&slot.dataset.value!=='')return Number(slot.dataset.value);
   return null;
  };
  builder.addEventListener('dragstart',event=>{
   const n=sourceIndex(event.target);
   if(n===null)return;
   dragging=n;event.dataTransfer.setData('text/plain',String(n));
   event.dataTransfer.effectAllowed='move';
  });
  builder.addEventListener('dragover',event=>{
   if(event.target.closest('[data-assembly-slot]')){
    event.preventDefault();event.dataTransfer.dropEffect='move';
   }
  });
  builder.addEventListener('drop',event=>{
   const target=event.target.closest('[data-assembly-slot]');
   if(!target||dragging===null)return;
   event.preventDefault();place(Number(target.dataset.assemblySlot),dragging);dragging=null;
  });
  builder.addEventListener('dragend',()=>{dragging=null});
  // Drag the chip itself with the finger. A tap alone NEVER teleports a colour.
  builder.addEventListener('pointerdown',event=>{
   if(event.pointerType==='mouse')return;
   const n=sourceIndex(event.target);
   if(n===null)return;
   pointer={id:event.pointerId,n,x:event.clientX,y:event.clientY,moved:false};
  },{passive:true});
  builder.addEventListener('pointermove',event=>{
   if(!pointer||event.pointerId!==pointer.id)return;
   if(Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<7&&!pointer.moved)return;
   event.preventDefault();pointer.moved=true;
   if(!ghost){
    ghost=document.createElement('div');ghost.className='assembly-drag-ghost';
    ghost.innerHTML='<span class="assembly-swatch" style="background:'+
      esc(palette[q.options[pointer.n]]||'#999')+'"></span>'+esc(capitalize(q.options[pointer.n]));
    ghost.style.pointerEvents='none';document.body.appendChild(ghost);
   }
   ghost.style.transform='translate3d('+(event.clientX-62)+'px,'+(event.clientY-24)+'px,0)';
   const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-assembly-slot]');
   slots.forEach(x=>x.classList.toggle('is-drop-target',x===target));
  },{passive:false});
  const cleanup=()=>{
   ghost?.remove();ghost=null;pointer=null;
   slots.forEach(x=>x.classList.remove('is-drop-target'));
  };
  builder.addEventListener('pointerup',event=>{
   if(!pointer||event.pointerId!==pointer.id)return;
   if(pointer.moved){
    const slot=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-assembly-slot]');
    if(slot&&builder.contains(slot))place(Number(slot.dataset.assemblySlot),pointer.n);
   }
   cleanup();
  });
  builder.addEventListener('pointercancel',cleanup);
  // Accessible keyboard alternative; touch remains drag-only.
  let keyboardColor=null;
  builder.addEventListener('keydown',event=>{
   if(event.key!=='Enter'&&event.key!==' ')return;
   const color=event.target.closest('[data-assembly-color]');
   const slot=event.target.closest('[data-assembly-slot]');
   if(color){event.preventDefault();keyboardColor=Number(color.dataset.assemblyColor);return}
   if(slot&&keyboardColor!==null){
    event.preventDefault();place(Number(slot.dataset.assemblySlot),keyboardColor);keyboardColor=null;
   }
  });
  paint();
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
 return{esc,fmt,habitats,icon,roundIconSvg,teamTile,teams,patchTeams,progress,leaderboard,illustration,hydrateIllustrations,clockMarkup,updateClock,audio,questionStats,stripeOption,correctFlagMarkup,flagVisualContent,hydrateFlagVisuals,uiIcon,iconLabel,decorateControls,updateMemory,assemblyPalette,assemblyMarkup,assemblyItems,hydrateAssembly,sourceLinks,capitalize,countLabel,phaseLabel,bindFullscreen,exitFullscreen};
})();
