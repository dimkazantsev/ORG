'use strict';
// Shared question visuals and audio; scoring and phase transitions stay on the server.
window.QwizStage=(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>Number(n||0).toLocaleString('ru-RU');
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
  return '<li class="habitat-team" data-team="'+esc(t.id||t.position)+'">'+(ranked?'<span class="team-place">'+fmt(t.rank||1)+'</span>':'')+'<div class="habitat-wrap">'+icon(t,full)+(ranked?badge:'')+'</div><strong title="'+esc(t.name)+'">'+esc(t.name)+'</strong><span class="team-detail">'+(ranked?(t.mean_seconds==null?'Время не записано':Number(t.mean_seconds).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+' с / чел.'):'<b class="team-answered">'+fmt(t.answered)+'</b> / '+fmt(t.members??t.players)+' ответили')+'</span>'+(ranked?'<span class="team-points">'+fmt(t.score)+' баллов</span>':'')+'</li>';
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
 function illustration(q,answer,content=''){
  const source=q.kind==='hotspot'?q.media_url:q.illustration_url||(!['audio','video'].includes(q.kind)?q.media_url:'');
  const url=typeof source==='string'&&/^https:\/\//i.test(source)?source:'';
  const drawing='<svg class="question-art quiz-drawing" viewBox="0 0 640 260" aria-hidden="true"><path d="M95 214c-23-39 10-71 30-99s-2-66 40-78 64 9 97-3 92-8 123 15 73-1 105 19 31 62 49 82-2 62-34 69-375 17-410-5Z" fill="#e8ddfc"/><ellipse cx="320" cy="220" rx="128" ry="12" fill="#d5c4f4"/><path d="m232 65 170-13 17 150-169 13-18-150Z" fill="#fff"/><path d="m232 65 18 150 77-24 75 11 17-150-88 24-99-11Z" fill="none" stroke="#7646cd" stroke-width="5" stroke-linejoin="round"/><path d="m327 191 4-115M267 100l39 7m-35 16 31 6m-28 16 30 5m49-49 36-9m-36 31 39-9m-39 32 42-9" stroke="#b49adf" stroke-width="5" stroke-linecap="round"/><path d="m171 152 5-18 5 18 18 5-18 5-5 18-5-18-18-5 18-5Zm288-87 3-13 4 13 13 4-13 3-4 13-3-13-13-3 13-4Z" fill="#a27adf"/><circle cx="443" cy="185" r="11" fill="#f2bb62"/><circle cx="206" cy="53" r="7" fill="#9165d5"/></svg>';
  const spot=answer?.hotspot,marker=spot?'<span class="answer-hotspot" data-x="'+Math.max(0,Math.min(100,Number(spot.x)))+'" data-y="'+Math.max(0,Math.min(100,Number(spot.y)))+'" data-radius="'+Math.max(0,Math.min(50,Number(spot.radius)))+'" aria-label="Правильная область"></span>':'';
  return '<figure class="question-frame"><div class="frame-orbit" aria-hidden="true"><i></i><i></i></div><div class="question-picture">'+(content||(url?'<img class="question-art" src="'+esc(url)+'" alt="Иллюстрация к вопросу">':drawing))+marker+'</div><figcaption>'+(url?'Иллюстрация к вопросу':'Время открытий')+'</figcaption></figure>';
 }
 function hydrateIllustrations(root=document){
  for(const img of root.querySelectorAll('.question-picture img')){
   const picture=img.closest('.question-picture'),marker=picture.querySelector('.answer-hotspot');
   const fit=()=>{if(!marker||!img.naturalWidth)return;const box=picture.getBoundingClientRect(),scale=Math.min(box.width/img.naturalWidth,box.height/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    Object.assign(marker.style,{left:(box.width-w)/2+w*Number(marker.dataset.x)/100+'px',top:(box.height-h)/2+h*Number(marker.dataset.y)/100+'px',width:w*Number(marker.dataset.radius)/50+'px',height:h*Number(marker.dataset.radius)/50+'px'})};
   img.onload=fit;img.onerror=()=>{const fallback=document.createElement('div');fallback.innerHTML=illustration({});picture.replaceChildren(fallback.querySelector('svg'));picture.closest('figure').querySelector('figcaption').textContent='Иллюстрация недоступна'};
   if(img.complete){if(img.naturalWidth)fit();else img.onerror()}
   if(marker){const observer=new ResizeObserver(()=>{if(picture.isConnected)fit();else observer.disconnect()});observer.observe(picture)}
  }
 }
 const duration=s=>Number(s.duration||s.question?.duration)||Math.max(1,Math.ceil((Date.parse(s.ends_at)-Date.now())/1000))||30;
 function clockMarkup(s,id='stageTimer'){return '<div class="stage-clock" data-phase="'+esc(s.phase)+'"><div class="clock-label">'+(s.phase==='result'?'Следующий этап через':'Время на ответ')+'</div><div class="clock-value"><strong id="'+id+'">0</strong><span>сек.</span></div><div class="clock-track" role="progressbar" aria-label="Оставшееся время" aria-valuemin="0" aria-valuemax="'+duration(s)+'"><span></span></div><span class="clock-warning" aria-live="polite"></span></div>'}
 const audio={context:null,enabled:false,volume:.45,voices:new Set(),lastTick:'',
  async toggle(){if(this.enabled){this.enabled=false;this.stop();return false}try{this.context ||=new(window.AudioContext||window.webkitAudioContext)();await this.context.resume();this.enabled=this.context.state==='running';if(this.enabled)this.play('start')}catch{this.enabled=false}return this.enabled},
  stop(){for(const o of this.voices){try{o.stop()}catch{}}this.voices.clear()},
  setVolume(v){this.volume=Math.max(0,Math.min(1,Number(v)||0))},
  play(kind){
   if(!this.enabled||!this.context||this.context.state!=='running'||document.hidden||kind==='none')return;
   const patterns={tick:[[880,0,.1]],timeup:[[587,0,.22],[740,.12,.26],[880,.27,.5]],reveal:[[523,0,.2],[659,.09,.22],[784,.18,.24],[1047,.3,.5]],start:[[659,0,.13],[988,.13,.3]],accept:[[698,0,.12],[1047,.12,.25]],pop:[[784,0,.12]],round:[[523,0,.15],[784,.16,.3]],fanfare:[[523,0,.18],[659,.15,.18],[784,.3,.2],[1047,.5,.5]],synth:[[440,0,.16],[659,.16,.2],[988,.35,.4]],funny:[[659,0,.13],[523,.14,.13],[880,.3,.28]]},now=this.context.currentTime+.015;
   for(const [pitch,delay,len]of patterns[kind]||patterns.round){if(this.voices.size>=16)break;const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type='sine';osc.frequency.value=pitch;
    gain.gain.setValueAtTime(.0001,now+delay);gain.gain.linearRampToValueAtTime(this.volume*(kind==='tick'?.12:.18),now+delay+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+len);
    osc.connect(gain);gain.connect(this.context.destination);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect()};osc.start(now+delay);osc.stop(now+delay+len+.03)}
  },
  countdown(s,left){if(s.phase!=='question'||left>10||left<0)return;const key=[s.code,s.index,s.ends_at,left].join(':');if(this.lastTick===key)return;this.lastTick=key;this.play(left===0?'timeup':'tick')}
 };
 function updateClock(s,offset=0,root=document,id='stageTimer',withSound=true){
  const ms=Math.max(0,Date.parse(s.ends_at)-Date.now()-offset)||0,left=Math.ceil(ms/1000),total=duration(s);
  const number=root.querySelector('#'+id);if(number)number.textContent=left;
  const clock=root.querySelector('.stage-clock');if(clock){clock.classList.toggle('is-urgent',s.phase==='question'&&left<=10);const bar=clock.querySelector('.clock-track');bar?.setAttribute('aria-valuenow',String(Math.min(total,left)));if(bar?.firstElementChild)bar.firstElementChild.style.transform='scaleX('+Math.min(1,ms/(total*1000))+')';const label=clock.querySelector('.clock-warning');if(label)label.textContent=s.phase==='question'&&left<=10?(left?'Осталось '+left+' сек.':'Время вышло'):''}
  if(withSound)audio.countdown(s,left);return left;
 }
 function questionStats(rows){
  const scored=(rows||[]).filter(x=>x.participants>0&&x.correct_rate!=null);
  const items=(list,errors=false)=>list.map(x=>'<li><span class="insight-question-number">'+(Number(x.index)+1)+'</span><div><strong>'+esc(x.prompt)+'</strong><small>'+x.correct+' из '+x.participants+' верно · '+x.incorrect+' ошибок · '+x.unanswered+' без ответа</small></div><b title="'+(errors?'Доля ошибочных ответов':'Доля правильных ответов')+'">'+fmt(errors?(x.incorrect_rate??100-x.correct_rate):x.correct_rate)+'%</b></li>').join('');
  const best=scored.slice().sort((a,b)=>b.correct_rate-a.correct_rate||a.index-b.index).slice(0,3);
  const hardest=scored.filter(x=>x.answered>0).sort((a,b)=>(b.incorrect_rate??100-b.correct_rate)-(a.incorrect_rate??100-a.correct_rate)||b.incorrect-a.incorrect||a.index-b.index).slice(0,3);
  return '<div class="question-insights"><section><h2>Знаем лучше всего</h2><p>Три вопроса с наибольшей долей верных ответов.</p><ol>'+items(best)+'</ol></section><section><h2>Чаще ошибались</h2><p>Три вопроса с наибольшей долей ошибок. Пропуски считаются отдельно.</p><ol>'+items(hardest,true)+'</ol></section></div><details class="all-question-stats"><summary>Все вопросы · '+rows.length+'</summary><ol>'+items(rows)+'</ol></details>';
 }
 return{esc,fmt,habitats,icon,teamTile,teams,patchTeams,progress,leaderboard,illustration,hydrateIllustrations,clockMarkup,updateClock,audio,questionStats};
})();
