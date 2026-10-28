import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
function take(from,to){
 const a=source.indexOf(from),b=source.indexOf(to,a);
 assert.ok(a>=0&&b>a,'Expected workspace functions: '+from);
 return source.slice(a,b);
}

test('Teacher-scoped remembered game, first valid fallback, and no duplicate restore',async()=>{
 const helpers=take("const lastBuildKeyBase=","let restoringView=true");
 const entries=new Map();
 const localStorage={
  getItem:key=>entries.get(key)||null,
  setItem:(key,value)=>entries.set(key,value),
  removeItem:key=>entries.delete(key)
 };
 const state={accountId:'teacher-A',buildsReady:true,builds:[{id:'A'},{id:'B'}],buildId:null,activePage:'bank'};
 const composer={hidden:true},opened=[];
 const api=new Function('state','localStorage','readPosition','$','loadBuild',
  helpers+';return {rememberLastBuild,storedLastBuild,forgetLastBuild,lastAvailableBuild,ensureLastBuildOpen}')(state,localStorage,()=>null,id=>id==='composer'?composer:null,async id=>opened.push(id));
 api.rememberLastBuild('B');
 assert.equal(api.lastAvailableBuild(),'B');
 state.activePage='builder';
 await api.ensureLastBuildOpen();
 assert.deepEqual(opened,['B']);
 composer.hidden=false;
 await api.ensureLastBuildOpen();
 assert.deepEqual(opened,['B'],'Do not reopen over an already visible editor');
 state.accountId='teacher-B';
 assert.equal(api.storedLastBuild(),null,'Do not show another teacher’s game');
 state.accountId='teacher-A';
 api.forgetLastBuild('B');
 assert.equal(api.lastAvailableBuild(),'A','Deleted game falls back to available saved build');
});

test('Restored cards retain their settings; an outdated response cannot replace a newer choice or draft',async()=>{
 const loader=take('async function loadBuild(id){','function validBuildActivity(');
 const newBuild=take('function newBuild(){','function cardInsertIndex(');
 const state={buildId:null,cards:[],selectedCard:null};
 const elements={composer:{hidden:true},buildTitle:{value:'',focus(){}},buildMessage:{}};
 const pending=new Map(),remembered=[];
 const api=new Function('state','$','studio','gameTitle','synchronizeCardTopic',
  'ensureFinale','rememberLastBuild','renderCards','renderBuilds','section',
  'savePosition','msg','card',
  'let requestedBuildSerial=0;'+loader+newBuild+';return {loadBuild,newBuild}')(
   state,id=>elements[id],(_action,input)=>new Promise(resolve=>pending.set(input.id,resolve)),
   c=>c.title,()=>false,()=>{},id=>remembered.push(id),()=>{},()=>{},()=>{},()=>{},()=>{},
   type=>({type,title:type,settings:{}})
  );
 const slow=api.loadBuild('A');
 const fast=api.loadBuild('B');
 pending.get('B')({build:{id:'B',title:'Игра Б'},cards:[{type:'round',title:'Раунд Б',settings:{seconds:45,bonus_lead:25}}]});
 assert.equal(await fast,true);
 pending.get('A')({build:{id:'A',title:'Игра А'},cards:[{type:'round',title:'Раунд А',settings:{seconds:15}}]});
 assert.equal(await slow,false);
 assert.equal(state.buildId,'B');
 assert.equal(state.cards[0].settings.seconds,45);
 assert.equal(state.cards[0].settings.bonus_lead,25);
 assert.deepEqual(remembered,['B']);
 const old=api.loadBuild('A');
 api.newBuild();
 pending.get('A')({build:{id:'A',title:'Игра А'},cards:[{type:'round',title:'Чужой раунд',settings:{}}]});
 assert.equal(await old,false);
 assert.equal(state.buildId,null);
 assert.deepEqual(state.cards.map(c=>c.type),['intro','round','finale']);
});

test('Builder entry and boot reuse last game without creating a new one',()=>{
 assert.match(source,/if\(section==='builder'\)void ensureLastBuildOpen\(\)/);
 assert.match(source,/if\(last.section==='builder'\)/);
 assert.match(source,/rememberLastBuild\(state.buildId\)/);
 assert.match(source,/rememberLastBuild\(result.id\)/);
 assert.match(source,/forgetLastBuild\(id\)/);
 assert.match(source,/state.accountId=session.user\?\.id\|\|null/);
});
