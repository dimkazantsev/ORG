import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('./team-lab-bonuses.js',import.meta.url),'utf8');

function startFixture(){
 const nodes={};
 for(const id of ['teamLabBonusExplorer','teamLabBonusPositive','teamLabBonusNegative',
   'teamLabBonusDemo','teamLabBonusWinner','teamLabBonusFeedback']){
  nodes[id]={innerHTML:'',hidden:false,value:'0',events:{},
   addEventListener(event,cb){this.events[event]=cb}};
 }
 const document={getElementById:id=>nodes[id],addEventListener(){}};
 const window={QwizTeamLab:{snapshot:()=>({scores:[0,0]})}};
 new Function('window','document',source)(window,document);
 window.QwizBonusExplorer.init();
 const root=nodes.teamLabBonusExplorer;
 function click(name,value=''){
  const control={dataset:{},
   hasAttribute:key=>key===name};
  if(name==='data-demo-strategy')control.dataset.demoStrategy=value;
  if(name==='data-demo-option')control.dataset.demoOption=value;
  root.events.click({target:{closest:()=>control}});
 }
 return {nodes,click};
}

test('Support → headstart renders translated, aggregated results',()=>{
 const f=startFixture();
 f.click('data-bonus-start');
 f.click('data-demo-strategy','support');
 f.click('data-demo-option','headstart');
 const html=f.nodes.teamLabBonusDemo.innerHTML;
 assert.match(html,/Этап 1 · Стратегия:/);
 assert.match(html,/Усилить свою команду — 3 из 3/);
 assert.match(html,/Этап 2 · Эффект:/);
 assert.match(html,/Фора — 3 из 3/);
 assert.match(html,/\+12/);
 assert.doesNotMatch(html,/\bsupport\b|\bheadstart\b/);
});

test('Sabotage → fog renders Russian names, not raw technical identifiers',()=>{
 const f=startFixture();
 f.click('data-bonus-start');
 f.click('data-demo-strategy','sabotage');
 f.click('data-demo-option','fog');
 const html=f.nodes.teamLabBonusDemo.innerHTML;
 assert.match(html,/Ослабить соперника — 3 из 3/);
 assert.match(html,/Туман соперника — 3 из 3/);
 assert.doesNotMatch(html,/\bsabotage\b|\bfog\b/);
});

test('Result summary labels do not contain raw joined votes',()=>{
 assert.doesNotMatch(source,/strategyVotes\.join\(' · '\)/);
 assert.doesNotMatch(source,/optionVotes\.join\(' · '\)/);
 assert.match(source,/function votesSummary\(/);
 assert.match(source,/html\(votesSummary\(trial\.strategyVotes\)\)/);
 assert.match(source,/html\(votesSummary\(trial\.optionVotes\)\)/);
});
