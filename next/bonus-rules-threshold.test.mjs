import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const src=readFileSync(new URL('./bonus-rules.js',import.meta.url),'utf8');
const html=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');

function fixture(){
 const ids=['bonusRulesEditor','bonusRulesStatus','bonusRulesBuild','bonusRulesCard',
  'bonusRulesForm','bonusRulesMin','bonusRulesMinLabel','bonusRulesMinHelp',
  'bonusRulesActivity','bonusRulesGap','bonusRulesVote','bonusRulesReward',
  'bonusRulesRewardHelp','bonusRulesActivityWrap','bonusRulesGapWrap',
  'bonusRulesModeHint','bonusRulesPreview','bonusRulesValidation','bonusRulesSave',
  'bonusRulesJump','bonusRulesReset','bonusesPage'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{
  value:'',hidden:false,disabled:false,readOnly:false,options:[],textContent:'',
  listeners:{},classList:{toggle(){}},
  addEventListener(type,listener){this.listeners[type]=listener},
  replaceChildren(...children){this.options=children;this.value=children[0]?.value??''},
  add(option){this.options.push(option)},
  scrollIntoView(){},reportValidity(){return true}
 }]));
 const document={getElementById:id=>nodes[id],addEventListener(type,fn){this[type]=fn}};
 const sample=[
  {id:'blitz',title:'Блиц-консенсус',mode:'blitz',position:0,arcade_score_points:10,bonus_min_points:1,bonus_percent:70,bonus_lead:15,bonus_vote_seconds:null},
  {id:'tap',title:'Тап-баттл',mode:'tug',position:1,arcade_score_points:15,bonus_min_points:30,bonus_percent:70,bonus_lead:15,bonus_vote_seconds:null},
  {id:'captain',title:'Мэмори капитанов',mode:'captain',position:2,arcade_score_points:15,bonus_min_points:50,bonus_percent:70,bonus_lead:15,bonus_vote_seconds:null}
 ];
 const saves=[];
 const window={QwizBonusRulesApi:{
  list:async()=>({cards:sample}),
  save:async(_build,card,settings)=>{
   saves.push({card,settings});
   return {cards:sample.map(item=>item.id===card?{...item,...settings}:item)};
  }
 }};
 function Option(label,value){this.label=label;this.value=value}
 new Function('window','document','state','Option',src)(
  window,document,{builds:[{id:'build',title:'Сборка'}]},Option);
 window.QwizBonusSettings.init();
 return {nodes,window,saves};
}
async function ready(f){
 f.nodes.bonusRulesBuild.value='build';
 f.nodes.bonusRulesBuild.listeners.change();
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(f.nodes.bonusRulesForm.hidden,false);
}
test('Binary Blitz threshold is correctly explained and cannot be changed above 10',async()=>{
 const f=fixture();await ready(f);const n=f.nodes;
 assert.equal(n.bonusRulesMin.value,10);
 assert.equal(n.bonusRulesMin.readOnly,true);
 assert.equal(n.bonusRulesMin.max,'10');
 assert.match(n.bonusRulesMinHelp.textContent,/15 и выше невозможен/);
 assert.match(n.bonusRulesPreview.textContent,/правильный ответ \(10 игровых очков\)/);
 assert.doesNotMatch(n.bonusRulesPreview.textContent,/\?/);
 assert.equal(n.bonusRulesSave.disabled,false);
 await n.bonusRulesForm.listeners.submit({preventDefault(){}});
 assert.equal(f.saves.length,1);
 assert.equal(f.saves[0].settings.bonus_min_points,10);
});
test('Other mini-games retain editable score thresholds; invalid values get a precise message',async()=>{
 const f=fixture();await ready(f);const n=f.nodes;
 n.bonusRulesCard.value='tap';n.bonusRulesCard.listeners.change();
 assert.equal(n.bonusRulesMin.readOnly,false);
 assert.equal(n.bonusRulesMin.max,'200');
 n.bonusRulesMin.value=45;n.bonusRulesForm.listeners.input();
 assert.equal(n.bonusRulesSave.disabled,false);
 assert.match(n.bonusRulesPreview.textContent,/не менее 45 очков/);
 n.bonusRulesMin.value=250;n.bonusRulesForm.listeners.input();
 assert.equal(n.bonusRulesSave.disabled,true);
 assert.equal(n.bonusRulesValidation.hidden,false);
 assert.match(n.bonusRulesValidation.textContent,/от 1 до 200/);
 assert.doesNotMatch(n.bonusRulesPreview.textContent,/\? очков/);
 n.bonusRulesCard.value='captain';n.bonusRulesCard.listeners.change();
 assert.equal(n.bonusRulesMin.readOnly,false);
 assert.equal(n.bonusRulesMin.value,50);
});
test('Invalid Blitz ranking reward reports its own 10-point cap without replacing the preview with question marks',async()=>{
 const f=fixture();await ready(f);const n=f.nodes;
 n.bonusRulesReward.value=15;n.bonusRulesForm.listeners.input();
 assert.equal(n.bonusRulesSave.disabled,true);
 assert.match(n.bonusRulesValidation.textContent,/от 0 до 10 баллов рейтинга/);
 assert.match(n.bonusRulesPreview.textContent,/\+15 баллов/);
 assert.match(n.bonusRulesPreview.textContent,/правильный ответ \(10 игровых очков\)/);
 n.bonusRulesReward.value=7;n.bonusRulesForm.listeners.input();
 assert.equal(n.bonusRulesValidation.hidden,true);
 assert.equal(n.bonusRulesSave.disabled,false);
});
test('The editor provides accessible field guidance and visible error feedback',()=>{
 assert.match(html,/id="bonusRulesMinHelp"/);
 assert.match(html,/id="bonusRulesValidation"[^>]*role="status"/);
 assert.match(html,/aria-describedby="bonusRulesMinHelp bonusRulesValidation"/);
});
