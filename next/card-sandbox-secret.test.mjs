import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./card-sandbox.js',import.meta.url),'utf8');
const plan=JSON.parse(readFileSync(new URL('./memory-challenges.plan.json',import.meta.url),'utf8'));
const challenges=plan.levels.flatMap(level=>level.items);

function makeSandbox(challenge=1){
 const handlers=new Map(),nodes=new Map(),timers=new Map();
 let clock=1000,timerId=0,fetches=0;
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{
   id,open:false,innerHTML:'',textContent:'',disabled:false,
   parentElement:{scrollTop:0},classList:{toggle(){}},
   setAttribute(){},querySelector(){return {scrollIntoView(){}}},
   querySelectorAll(){return []},
   addEventListener(name,handler){const all=handlers.get(name)||[];all.push(handler);handlers.set(name,all)},
   showModal(){this.open=true},close(){this.open=false}
  });
  return nodes.get(id);
 };
 const document={
  getElementById:node,
  addEventListener(name,handler){if(name==='DOMContentLoaded')handler()}
 };
 const window={QwizStage:{uiIcon:()=>''}};
 const fakeFetch=async()=>{
  fetches++;
  return {ok:true,json:async()=>plan};
 };
 runInNewContext(source,{
  window,document,location:{href:'https://example.test/next/workspace.html'},
  URL,fetch:fakeFetch,
  Date:{now:()=>clock},
  setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id},
  clearTimeout(id){timers.delete(id)}
 });
 const click=(attribute,dataset={})=>{
  const button={
   id:'',dataset,
   matches:()=>false,
   hasAttribute(name){return name===attribute},
   closest(selector){return selector==='button'?this:null}
  };
  for(const handler of handlers.get('click')||[])handler({target:button});
 };
 return {
  open:()=>window.QwizCardSandbox.open({
   card:{type:'bonus',title:'Секретный код',
    settings:{arcade_mode:'sequence_memory',secret_challenge:challenge}},
   topic:'',loadQuestions(){throw Error('Must not read ordinary questions')},
   loadMap(){throw Error('Must not read map')},
   loadCatalog(){throw Error('Must not read server catalogue')}
  }),
  click,html:()=>node('cardPlayScreen').innerHTML,
  steps:()=>node('cardPlaySteps').innerHTML,
  advance(ms){
   clock+=ms;
   for(const [id,timer] of [...timers]){timers.delete(id);timer.fn()}
  },
  get fetches(){return fetches},
  get remainingTimers(){return timers.size},
  close:()=>window.QwizCardSandbox.close()
 };
}

test('All 30 Secret Code templates render as real sandbox challenges, not generic placeholder',async()=>{
 assert.equal(challenges.length,30);
 for(let i=1;i<=30;i++){
  const sandbox=makeSandbox(i);
  await sandbox.open();
  assert.match(sandbox.steps(),/Показ кода/);
  assert.match(sandbox.steps(),/Ввод кода/);
  sandbox.click('data-card-step',{cardStep:'2'});
  assert.match(sandbox.html(),new RegExp(challenges[i-1].name));
  assert.equal((sandbox.html().match(/class="arcade-secret-slot/g)||[]).length,challenges[i-1].symbols);
  assert.match(sandbox.html(),/data-card-secret-choice=/);
  assert.doesNotMatch(sandbox.html(),/не выбрана действующая мини-игра/);
  assert.equal(sandbox.fetches,1);
  sandbox.close();
 }
});

test('Secret Code sandbox shows symbols, accepts once, reveals only local points, and cleans timers',async()=>{
 const sandbox=makeSandbox(30);
 await sandbox.open();
 sandbox.click('data-card-step',{cardStep:'1'});
 assert.match(sandbox.html(),/ПРИГОТОВЬТЕСЬ/);
 sandbox.advance(1700);
 assert.match(sandbox.html(),/ЗАПОМНИТЕ СИМВОЛ/);
 sandbox.advance(9000);
 assert.match(sandbox.html(),/data-card-secret-choice=/);
 for(let i=0;i<8;i++)sandbox.click('data-card-secret-choice',{cardSecretChoice:'red'});
 assert.match(sandbox.html(),/data-card-secret-submit >/);
 sandbox.click('data-card-secret-submit');
 assert.match(sandbox.html(),/Правильный код:/);
 assert.match(sandbox.html(),/В тесте: [036]|В тесте: 10/);
 assert.equal(sandbox.fetches,1);
 sandbox.close();
 assert.equal(sandbox.remainingTimers,0);
});
