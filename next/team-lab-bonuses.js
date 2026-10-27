'use strict';
/*
 QWIZ-PARTY BONUS EXPLORER.
 Local, explicitly labelled simulation. Neither cards nor actions call the server.
 Contract grounded in public.qwiz_apply_round_boost and qwiz_boost_lock (2026-10-28).
 */
window.QwizBonusExplorer=(()=>{
 const byId=id=>document.getElementById(id);
 const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const effects=Object.freeze([
  {id:'headstart',title:'Фора',tone:'positive',value:'+12',detail:'Прибавляет 12 очков своей команде.',formula:'Счёт + 12'},
  {id:'teamwork',title:'Командный рывок',tone:'positive',value:'+3 × игроков',detail:'Три очка за каждого участника команды, максимум 24.',formula:'min(24, 3 × участников)'},
  {id:'momentum',title:'Импульс',tone:'positive',value:'+15%',detail:'15% от текущих очков команды; минимум 5, максимум 30.',formula:'min(30, max(5, округлить(счёт × 0,15)))'},
  {id:'fog',title:'Туман соперника',tone:'negative',value:'−5',detail:'Снимает до пяти очков у основного соперника.',formula:'max(0, счёт соперника − 5)'},
  {id:'storm',title:'Штормовой заслон',tone:'negative',value:'−8',detail:'Снимает до восьми очков у основного соперника.',formula:'max(0, счёт соперника − 8)'},
  {id:'drain',title:'Энергетический отток',tone:'negative',value:'−12',detail:'Снимает до двенадцати очков у основного соперника.',formula:'max(0, счёт соперника − 12)'}
 ]);
 const get=id=>effects.find(x=>x.id===id);
 const rand=n=>Math.floor(Math.random()*n);
 let trial=null,used=0,initialised=false;
 function scores(){
  const snap=window.QwizTeamLab?.snapshot?.();
  return Array.isArray(snap?.scores)&&snap.scores.length===2?snap.scores.slice():[0,0];
 }
 function allowedStrategy(winner,strategy){
  if(strategy==='support')return true;
  // The live game prohibits sabotage unless there is a rival team.
  return winner===0||winner===1;
 }
 function value(key,before,members){
  const n=Math.max(0,Math.round(Number(before)||0)),count=Math.max(0,Math.round(Number(members)||0));
  switch(key){
   case 'headstart':return 12;
   case 'teamwork':return Math.min(24,3*count);
   case 'momentum':return Math.min(30,Math.max(5,Math.round(n*.15)));
   case 'fog':return -Math.min(5,n);
   case 'storm':return -Math.min(8,n);
   case 'drain':return -Math.min(12,n);
   default:return 0;
  }
 }
 function winningChoice(votes){
  const tally=Object.entries(votes.reduce((acc,v)=>(acc[v]=(acc[v]||0)+1,acc),{})).sort((a,b)=>b[1]-a[1]);
  return tally[0]?.[1]>votes.length/2?tally[0][0]:null;
 }
 function votesBlock(){
  const votes=trial.votes||[];
  const keys=trial.stage==='strategy'?['support','sabotage']:effects.filter(e=>e.tone===(trial.strategy==='support'?'positive':'negative')).map(e=>e.id);
  return '<div class="team-lab-vote-counts" aria-live="polite">'+
   keys.map(key=>{
    const count=votes.filter(v=>v===key).length;
    const name=key==='support'?'Усилить себя':key==='sabotage'?'Ослабить соперника':get(key)?.title||key;
    return '<div><span>'+html(name)+'</span><b>'+count+'/3</b><span class="team-lab-vote-track"><i style="width:'+(count/3*100)+'%"></i></span></div>';
   }).join('')+'</div>';
 }
 function display(){
  const panel=byId('teamLabBonusDemo');if(!panel||!trial)return;
  const winner=trial.winner===0?'Преподаватель':'Случайная команда';
  const rival=trial.winner===0?'Случайная команда':'Преподаватель';
  const who=trial.winner===0?'Вы управляете тремя голосами: одно нажатие = 3 из 3.':
   'Система независимо выбирает три голоса. Отсутствие большинства означает, что эффекта нет.';
  const head='<div class="team-lab-demo-header"><span class="team-lab-demo-stage">ШАГ '+
   (trial.stage==='strategy'?'1/3':trial.stage==='option'?'2/3':'3/3')+
   ' · '+html(winner)+'</span><button type="button" data-bonus-reset>↻ Новое голосование</button></div>'+
   '<p class="team-lab-demo-detail">'+html(who)+'</p>';
  if(trial.stage==='strategy'){
   panel.innerHTML=head+'<h4>Команда-победитель выбирает стратегию</h4><div class="team-lab-demo-options">'+
   '<button type="button" data-demo-strategy="support"><strong>Усилить себя</strong><small>Зелёный маршрут · получить очки</small></button>'+
   '<button type="button" data-demo-strategy="sabotage"><strong>Ослабить соперника</strong><small>Красный манёвр · снять очки</small></button></div>'+votesBlock();
  }else if(trial.stage==='option'){
   const arr=effects.filter(e=>e.tone===(trial.strategy==='support'?'positive':'negative'));
   panel.innerHTML=head+'<h4>Большинство определило маршрут: '+(trial.strategy==='support'?'усиление':'штраф')+'</h4>'+
    '<p class="team-lab-demo-detail">Теперь выбирается конкретный эффект. Нужно минимум 2 совпадающих голоса из 3.</p>'+
    '<div class="team-lab-demo-options">'+arr.map(e=>'<button type="button" data-demo-option="'+e.id+'"><strong>'+
       html(e.title)+' · '+html(e.value)+'</strong><small>'+html(e.detail)+'</small></button>').join('')+'</div>'+votesBlock();
  }else{
   const effect=get(trial.effect);
   const target=trial.target===0?'Преподаватель':'Случайная команда';
   const colors=trial.delta>=0?'is-positive':'is-negative';
   panel.innerHTML=head+(effect?
    '<h4>'+html(effect.title)+' · '+html(target)+'</h4>'+
    '<div class="team-lab-demo-timeline">'+
     '<div><small>ДО</small><b>'+trial.before+'</b></div>'+
     '<span aria-hidden="true">→</span><div><small>ИЗМЕНЕНИЕ</small><b class="'+colors+'">'+(trial.delta>0?'+':'')+trial.delta+'</b></div>'+
     '<span aria-hidden="true">→</span><div><small>ПОСЛЕ</small><b>'+trial.after+'</b></div></div>'+
     '<p class="team-lab-demo-detail">Расчёт: '+html(effect.formula)+'. '+html(effect.detail)+'</p>'+
     '<p class="team-lab-demo-note">В настоящей комнате эффект возникает после двух голосований большинства победившей команды и применяется в следующем обычном раунде с вопросами. Здесь — моментальный локальный расчёт для проверки.</p>'+
     (trial.applied?'<div class="team-lab-feedback" role="status">Тестовый счёт изменён на '+(trial.delta>0?'+':'')+trial.delta+'; в журнале зафиксирован эффект.</div>':
       '<button class="team-lab-primary" type="button" data-demo-apply>Применить к тестовому счёту</button>'):
    '<h4>Эффект не получен</h4><p class="team-lab-demo-note">Три голоса разошлись: большинство не выбрало один вариант. В настоящей игре бонус не начисляется.</p>')+
    '<div class="team-lab-demo-votes-summary">Этап 1: '+html(trial.strategyVotes.join(' · '))+
    ' · Этап 2: '+html(trial.optionVotes.join(' · '))+'</div>';
  }
  panel.hidden=false;
 }
 function effectComplete(id){
  const effect=get(id);
  if(!effect){trial={...trial,stage:'result',effect:null,strategyVotes:trial.strategyVotes||[],optionVotes:trial.votes||[]};display();return}
  const recipient=effect.tone==='negative'?1-trial.winner:trial.winner;
  const before=Math.max(0,Math.round(Number(scores()[recipient])||0));
  const change=value(id,before,3);
  trial={...trial,stage:'result',effect:id,target:recipient,before,delta:change,after:before+change,
   optionVotes:trial.votes.slice(),applied:false};
  display();
 }
 function selectStrategy(strategy){
  if(!trial||trial.stage!=='strategy'||!allowedStrategy(trial.winner,strategy))return;
  trial.votes=trial.winner===0?[strategy,strategy,strategy]:
   Array.from({length:3},()=>rand(2)===0?'support':'sabotage');
  const picked=winningChoice(trial.votes);
  trial.strategyVotes=trial.votes.slice();
  if(!picked){trial.stage='result';trial.effect=null;trial.optionVotes=[];display();return}
  trial.strategy=picked;trial.stage='option';trial.votes=[];display();
 }
 function selectOption(choice){
  if(!trial||trial.stage!=='option')return;
  const opts=effects.filter(x=>x.tone===(trial.strategy==='support'?'positive':'negative')).map(x=>x.id);
  if(!opts.includes(choice))return;
  trial.votes=trial.winner===0?[choice,choice,choice]:
   Array.from({length:3},()=>opts[rand(opts.length)]);
  effectComplete(winningChoice(trial.votes));
 }
 function restart(){
  const winner=Number(byId('teamLabBonusWinner')?.value||0);
  trial={stage:'strategy',winner:winner===1?1:0,strategy:null,strategyVotes:[],optionVotes:[],votes:[],effect:null,applied:false};
  display();
 }
 function init(){
  if(initialised||!byId('teamLabBonusExplorer'))return;
  initialised=true;
  const catalog=byId('teamLabBonusCatalog');
  catalog.innerHTML=effects.map(e=>'<article class="team-lab-catalog-card '+(e.tone==='positive'?'is-positive':'is-negative')+'">'+
    '<div class="team-lab-catalog-title"><strong>'+html(e.title)+'</strong><b>'+html(e.value)+'</b></div>'+
    '<p>'+html(e.detail)+'</p></article>').join('');
  const root=byId('teamLabBonusExplorer');
  root.addEventListener('click',event=>{
   const button=event.target.closest('button');if(!button)return;
   if(button.hasAttribute('data-bonus-start')||button.hasAttribute('data-bonus-reset'))restart();
   else if(button.hasAttribute('data-demo-strategy'))selectStrategy(button.dataset.demoStrategy);
   else if(button.hasAttribute('data-demo-option'))selectOption(button.dataset.demoOption);
   else if(button.hasAttribute('data-demo-apply')&&trial?.stage==='result'&&!trial.applied&&trial.effect){
    const lab=window.QwizTeamLab;
    if(lab?.applyDemoEffect){
     const result=lab.applyDemoEffect({key:trial.effect,target:trial.target,delta:trial.delta,source:'catalogue',expected:trial.before});
     if(result?.ok){
      trial.applied=true;trial.before=result.before;trial.delta=result.delta;trial.after=result.after;
     }else{byId('teamLabBonusFeedback').textContent=result?.message||'Сначала запустите тест команды.'}
    }else byId('teamLabBonusFeedback').textContent='Для изменения тестового счёта сначала запустите игру.';
    display();
   }
  });
  byId('teamLabBonusWinner').addEventListener('change',()=>{
   if(trial)restart();
  });
 }
 document.addEventListener('DOMContentLoaded',init);
 return Object.freeze({effects,calc:value,init});
})();