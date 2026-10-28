'use strict';
/* Teacher-only editor for server-backed eligibility thresholds on saved bonus mini-game cards.
 * No active-room mutation, no polling, no changes to point awards.
 */
window.QwizBonusSettings=(()=>{
 const $=id=>document.getElementById(id);
 const modes={tug:'Тап-баттл',blitz:'Блиц-консенсус',captain:'Мэмори капитанов',sequence_memory:'Секретный код'};
 const ratingDefaults={tug:15,blitz:10,captain:15,sequence_memory:10};
 let builds=[],cards=[],loading=0,loadedBuild='',initialised=false,busy=false;
 const status=(msg,error=false)=>{const el=$('bonusRulesStatus');if(!el)return;el.textContent=msg;el.classList.toggle('error',error)};
 const option=(value,label)=>new Option(label,String(value));
 const current=()=>cards.find(c=>String(c.id)===$('bonusRulesCard')?.value);
 const activeBuild=()=>$('bonusRulesBuild')?.value||'';
 function populateBuilds(list){
  if(!$('bonusRulesBuild'))return;
  const select=$('bonusRulesBuild'),before=select.value;
  const previousUpdated=builds.find(b=>String(b.id)===before)?.updated_at;
  builds=Array.isArray(list)?list.slice():[];
  const currentUpdated=builds.find(b=>String(b.id)===before)?.updated_at;
  const buildChanged=!!before&&previousUpdated!==undefined&&currentUpdated!==previousUpdated;
  select.replaceChildren(option('','Выберите сохранённую сборку'));
  for(const b of builds)select.add(option(b.id,b.title));
  select.value=builds.some(b=>String(b.id)===before)?before:'';
  if(buildChanged){loadedBuild='';cards=[];$('bonusRulesForm').hidden=true;}
  if(!select.value){
   cards=[];loadedBuild='';$('bonusRulesCard').replaceChildren(option('','Сначала выберите сборку'));
   $('bonusRulesCard').disabled=true;$('bonusRulesForm').hidden=true;
   status(builds.length?'Выберите сборку, затем конкретную мини-игру.':'Сохранённых сборок нет. Сначала создайте и сохраните сборку.');
  }else if(buildChanged&&$('bonusesPage')?.hidden===false)void load();
 }
 async function load(){
  const id=activeBuild(),request=++loading;
  if(!id){cards=[];loadedBuild='';$('bonusRulesForm').hidden=true;return;}
  const choice=$('bonusRulesCard');choice.disabled=true;$('bonusRulesForm').hidden=true;
  status('Загружаем действующие мини-игры и их условия…');
  try{
   if(!window.QwizBonusRulesApi)throw Error('Модуль кабинета ещё не готов. Обновите страницу.');
   const data=await window.QwizBonusRulesApi.list(id);
   if(request!==loading||activeBuild()!==id)return;
   cards=Array.isArray(data?.cards)?data.cards.filter(x=>Object.hasOwn(modes,x.mode)):[];
   loadedBuild=id;choice.replaceChildren(option('','Выберите мини-игру'));
   for(const card of cards){
    const modeTitle=modes[card.mode],customTitle=String(card.title||'').trim();
    const title=customTitle&&customTitle.toLocaleLowerCase('ru')!==modeTitle.toLocaleLowerCase('ru')
     ?customTitle+' · '+modeTitle:modeTitle;
    choice.add(option(card.id,(Number(card.position)+1)+'. '+title));
   }
   choice.disabled=cards.length===0;
   if(cards.length){choice.value=String(cards[0].id);presentCard();status('Настройки загружены. Можно изменять условия выбранной мини-игры.');}
   else status('В этой сборке нет действующих мини-игр с бонусным голосованием. Архивные механики скрыты.');
  }catch(e){if(request!==loading)return;loadedBuild='';cards=[];status(e?.message||'Не удалось загрузить условия.',true)}
 }
 const int=id=>Number($(id)?.value);
 const vote=()=> $('bonusRulesVote').value==='auto'?null:Number($('bonusRulesVote').value);
 function thresholds(){
  return {arcade_score_points:int('bonusRulesReward'),bonus_min_points:int('bonusRulesMin'),bonus_percent:int('bonusRulesActivity'),
    bonus_lead:int('bonusRulesGap'),bonus_vote_seconds:vote()};
 }
 function presentCard(){
  const card=current(),form=$('bonusRulesForm');if(!card){form.hidden=true;return}
  form.hidden=false;
  $('bonusRulesReward').max=['blitz','sequence_memory'].includes(card.mode)?'10':'200';
  $('bonusRulesReward').value=card.arcade_score_points??ratingDefaults[card.mode]??0;
  $('bonusRulesRewardHelp').textContent=card.mode==='sequence_memory'?'До 10 баллов за победу команды со средним результатом памяти. Каждый участник получает 0–10 игровых очков.':card.mode==='blitz'?'Начисляется каждой команде за правильный итоговый ответ, даже если несколько команд ответили верно. От 0 до 10 — правило единой шкалы вопросов.':'Начисляется только команде-победителю в общий рейтинг. От 0 до 200.';
  const minInput=$('bonusRulesMin'),fixedBlitz=card.mode==='blitz';
  // Blitz yields only 0 or 10 game points. Thresholds 1–10 are equivalent.
  minInput.max=['blitz','sequence_memory'].includes(card.mode)?'10':'200';
  minInput.readOnly=fixedBlitz;
  minInput.value=fixedBlitz?10:(card.bonus_min_points??1);
  $('bonusRulesMinLabel').textContent=fixedBlitz?'Условие Блиц-консенсуса':'Минимальный игровой результат';
  $('bonusRulesMinHelp').textContent=card.mode==='sequence_memory'?'Средний результат игроков команды: от 1 до 10. Победа определяется по среднему баллу всех участников.':fixedBlitz?
   'Фиксировано: правильный ответ = 10 игровых очков, неправильный = 0. Порог 15 и выше невозможен. Это не баллы общего рейтинга.':
   'Укажите от 1 до 200 игровых очков победителя; это условие допуска к бонусу, а не награда в рейтинг.';
  $('bonusRulesActivity').value=card.bonus_percent??70;
  $('bonusRulesGap').value=card.bonus_lead??15;
  $('bonusRulesVote').value=card.bonus_vote_seconds==null?'auto':String(card.bonus_vote_seconds);
  const tap=['tug','sequence_memory'].includes(card.mode),blitz=card.mode==='blitz';
  $('bonusRulesActivityWrap').hidden=!tap;$('bonusRulesGapWrap').hidden=blitz;
  $('bonusRulesActivity').disabled=!tap;$('bonusRulesGap').disabled=blitz;
  $('bonusRulesModeHint').textContent=tap?
   'Тап-баттл: победитель получает право голосовать, если набрал достаточно игровых очков, выдержал порог участия и необходимый отрыв.':
   blitz?'Блиц-консенсус: игровой результат бывает только 0 или 10. Нужен правильный ответ и участие делегата; процент участия всей команды и отрыв здесь не применяются. Условие выше 10 очков невозможно.':
   'Мэмори капитанов: достаточно участия капитана. Требуются минимальные игровые очки и установленный отрыв от соперника.';
  showPreview();
 }
 function showPreview(){
  const card=current();if(!card)return;
  const t=thresholds(),blitz=card.mode==='blitz',secret=card.mode==='sequence_memory',tap=['tug','sequence_memory'].includes(card.mode);
  const errors=[];
  if(!Number.isInteger(t.arcade_score_points)||t.arcade_score_points<0||t.arcade_score_points>(blitz||secret?10:200))
   errors.push(blitz?'Блиц-консенсус: награда за правильный ответ может составлять от 0 до 10 баллов рейтинга.':secret?'Награда Секретного кода должна быть от 0 до 10 баллов.':'Награда в рейтинг должна быть целым числом от 0 до 200.');
  if(!Number.isInteger(t.bonus_min_points)||t.bonus_min_points<1||t.bonus_min_points>(blitz||secret?10:200))
   errors.push(blitz?'В Блиц-консенсусе результат бывает только 0 или 10. Условие выше 10 игровых очков недостижимо.':secret?'В Секретном коде средний результат команды составляет от 0 до 10. Укажите порог допуска от 1 до 10.':'Минимальный игровой результат должен быть целым числом от 1 до 200.');
  if(!Number.isInteger(t.bonus_percent)||t.bonus_percent<50||t.bonus_percent>100)
   errors.push('Доля активных игроков должна быть целым числом от 50 до 100%.');
  if(!Number.isInteger(t.bonus_lead)||t.bonus_lead<0||t.bonus_lead>200)
   errors.push('Минимальный отрыв должен быть целым числом от 0 до 200.');
  if(t.bonus_vote_seconds!==null&&(!Number.isInteger(t.bonus_vote_seconds)||t.bonus_vote_seconds<18||t.bonus_vote_seconds>24))
   errors.push('Время голосования должно быть от 18 до 24 секунд.');
  const valid=errors.length===0;
  const validation=$('bonusRulesValidation');
  if(validation){validation.hidden=valid;validation.textContent=errors.join(' ');}

  const pointWord=n=>(n%10===1&&n%100!==11?'очка':'очков');
  const ratingWord=n=>n%100>=11&&n%100<=14?'баллов':n%10===1?'балл':n%10>=2&&n%10<=4?'балла':'баллов';
  const thresholdText=blitz?'правильный ответ (10 игровых очков)':
   (Number.isInteger(t.bonus_min_points)?'не менее '+t.bonus_min_points+' '+pointWord(t.bonus_min_points):'минимальный результат не задан');
  const lines=['Победа в мини-игре',thresholdText];
  if(tap)lines.push('участие от '+t.bonus_percent+'% команды');
  if(!blitz)lines.push('отрыв от соперника от '+t.bonus_lead+' '+pointWord(t.bonus_lead));
  if(blitz)lines.push('результат не хуже другой команды');
  lines.push('2 голосования большинством','следующий обычный раунд с вопросами');
  $('bonusRulesPreview').textContent='В общий рейтинг: '+(Number.isInteger(t.arcade_score_points)?'+'+t.arcade_score_points+' '+ratingWord(t.arcade_score_points):'награда не задана')+(blitz?' каждой команде с правильным ответом.':' команде-победителю.')+' Кредиты достижений рассчитываются отдельно. '+(valid?'Право на бонус: ':'Условия (не сохранены): ')+lines.join(' · ')+'. Голосование: '+(t.bonus_vote_seconds===null?'автоматически 18–24 секунды':t.bonus_vote_seconds+' секунд')+'.';
  $('bonusRulesSave').disabled=!valid||busy;
 }
 async function save(event){
  event?.preventDefault();const card=current(),id=activeBuild();
  if(!card||busy||loadedBuild!==id)return;
  if(!$('bonusRulesForm').reportValidity())return;
  const payload=thresholds();
  if($('bonusRulesSave').disabled)return;
  busy=true;showPreview();status('Сохраняем условия на сервере…');
  try{
   const result=await window.QwizBonusRulesApi.save(id,card.id,payload);
   if(activeBuild()!==id)return;
   cards=Array.isArray(result?.cards)?result.cards.filter(c=>Object.hasOwn(modes,c.mode)):[];
   if(!cards.some(c=>String(c.id)===String(card.id)))throw Error('Сервер не подтвердил сохранение карточки.');
   $('bonusRulesCard').value=String(card.id);presentCard();
   status('Условия сохранены в сборке. Они будут применяться в новых комнатах. Уже созданные и текущие комнаты не изменены.');
  }catch(e){status(e?.message||'Не удалось сохранить условия.',true)}
  finally{busy=false;showPreview()}
 }
 function init(){
  if(initialised||!$('bonusRulesEditor'))return;initialised=true;
  $('bonusRulesJump')?.addEventListener('click',()=>$('bonusRulesEditor').scrollIntoView({behavior:'smooth',block:'start'}));
  $('bonusRulesBuild').addEventListener('change',()=>{void load()});
  $('bonusRulesCard').addEventListener('change',()=>{presentCard();status('Редактирование условий выбранной мини-игры. Сохранение не влияет на текущие комнаты.')});
  $('bonusRulesForm').addEventListener('submit',save);
  $('bonusRulesForm').addEventListener('input',showPreview);
  $('bonusRulesForm').addEventListener('change',showPreview);
  $('bonusRulesReset').addEventListener('click',()=>{
   const card=current();if(!card)return;
   $('bonusRulesReward').value=ratingDefaults[card.mode]??0;
   $('bonusRulesMin').value=card.mode==='blitz'?10:card.mode==='sequence_memory'?3:1;$('bonusRulesActivity').value=70;$('bonusRulesGap').value=15;$('bonusRulesVote').value='auto';
   showPreview();status('Стандартные баллы в рейтинг и пороги восстановлены в форме. Нажмите «Сохранить условия», чтобы записать их в сборку.');
  });
  if(typeof state!=='undefined'&&Array.isArray(state.builds))populateBuilds(state.builds);
 }
 function loadIfNeeded(){
  if(!initialised)init();
  if(activeBuild()&&loadedBuild!==activeBuild())void load();
 }
 function focusBuild(buildId){
  if(!initialised)init();
  const select=$('bonusRulesBuild');
  if(!select)return;
  const desired=String(buildId||'');
  if(desired&&builds.some(b=>String(b.id)===desired)){
   if(select.value!==desired||loadedBuild!==desired){
    select.value=desired;
    void load();
   }
  }else if(!desired){
   // Unpublished drafts cannot be edited by the server-backed bonus editor.
   select.value='';
   loadedBuild='';cards=[];loading++;
   $('bonusRulesCard').replaceChildren(option('','Сначала выберите сборку'));
   $('bonusRulesCard').disabled=true;
   $('bonusRulesForm').hidden=true;
   status('Текущая сборка ещё не сохранена. Сохраните её в конструкторе, затем вернитесь сюда. Или выберите другую сохранённую сборку.');
  }else{
   status('Не удалось найти сборку. Обновите список или сначала сохраните её в конструкторе.',true);
  }
  $('bonusRulesEditor')?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 document.addEventListener('DOMContentLoaded',init);
 return Object.freeze({refreshBuilds:populateBuilds,loadIfNeeded,focusBuild,init});
})();
