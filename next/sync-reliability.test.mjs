import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('all resilience code parses and new builds are referenced',()=>{
 for(const name of ['app.js','arcade.js','presenter.js','workspace.js','card-sandbox.js','card-geo-preview.js']){
  assert.doesNotThrow(()=>new Script(read(name),{filename:name}));
 }
 const pages=[['index.html','app.js?v=consensus-fix-20261027-1'],
  ['index.html','arcade.js?v=mobile-40-20261028-1'],
  ['workspace.html','workspace.js?v=geo-full-question-20261028-1'],
  ['presenter.html','presenter.js?v=mobile-40-20261028-1'],
  ['workspace.html','card-sandbox.js?v=geo-full-question-20261028-1'],
  ['workspace.html','card-geo-preview.js?v=geo-full-question-20261028-1']];
 for(const [page,asset] of pages) assert.ok(read(page).includes(asset),page+' missing '+asset);
});
test('teacher card sandbox uses read-only question retrieval without writing gameplay state',()=>{
 const sandbox=read('card-sandbox.js');
 assert.doesNotMatch(sandbox,/\.rpc\s*\(/);
 assert.doesNotMatch(sandbox,/qwiz_party_control|qwiz_prepare_room|qwiz_arcade_action|qwiz_vote_boost/);
 assert.match(sandbox,/data-card-step/);
});
test('geography test mode never reads player state or writes server-side answers',()=>{
 const js=read('card-geo-preview.js');
 assert.doesNotMatch(js,/\.rpc\s*\(|qwiz_geo_play|qwiz_prepare_room|qwiz_arcade_action/);
 assert.ok(js.includes('regions.length!==89'));
 assert.ok(js.includes('correctId:correct.id'));
});
test('40 students never broadcast every answer or join through Realtime',()=>{
 const app=read('app.js');
 assert.doesNotMatch(app,/signal\('answer'\)/);
 assert.doesNotMatch(app,/showScreen\('game'\);await refreshRoom\((false)?\);signal\('team'\)/);
 assert.match(app,/function scheduleDeadlineRefresh/);
 assert.doesNotMatch(app,/rpc\('qwiz_release_countdown'/);
 assert.match(app,/ctx\.deadlineRefreshKey===key/);
 assert.match(app,/const periodicPoll=/);
});
test('ambiguous answer acknowledgements are reconciled from server before UI success',()=>{
 const app=read('app.js');
 assert.match(app,/async function sendAnswerOnce/);
 assert.ok(app.includes("ctx.answerAck={room_id:sentRoom,index:sentIndex}"));
 assert.ok(app.includes("ctx.answerAck={room_id:s.room_id,index:s.index}"));
 assert.match(app,/room=\{\.\.\.room,has_answer:true\}/);

 assert.match(app,/controller\.abort\(\);reject\(Error\('Подтверждение ответа задерживается/);
 assert.ok(app.includes("if(ctx.room?.has_answer)notice('gameNotice','')"));
 assert.ok(app.includes("done?'Ответ принят.'"));
 assert.ok(!app.includes("notice('gameNotice','Отправляем ответ"));
 assert.match(app,/function updateConnectionHealth\(connected\)/);
 assert.ok(app.includes('if(offline)ctx.reconnectRequiresState=true'));
 assert.ok(app.includes('else if(connected)ctx.reconnectRequiresState=false'));
 assert.ok(app.includes('if(ctx.reconnectRequiresState)return'));

});
test('tap batches are server-idempotent and client reuses stable UUID',()=>{
 const sql=read('migrations/20261026_idempotent_arcade_tap_batches.sql');
 const js=read('arcade.js');
 assert.match(sql,/PRIMARY KEY\(room_id,user_id,batch_id\)/);
 assert.match(sql,/p_batch uuid/);
 assert.match(sql,/ON CONFLICT ON CONSTRAINT qwiz_arcade_tap_batches_pkey DO NOTHING/);
 assert.match(sql,/v_stored\.tap_count<>p_count/);
 assert.match(sql,/public\.qwiz_arcade_action\(p_room,'tap',p_count/);
 assert.match(sql,/REVOKE ALL ON public\.qwiz_arcade_tap_batches FROM PUBLIC,anon,authenticated/);
 assert.match(js,/tr\.batch=\{id:crypto\.randomUUID\(\),count/);
 assert.match(js,/p_batch:batch\.id,p_count:batch\.count/);
 assert.match(js,/tr\.batch=null/);
 assert.match(js,/Math\.min\(5000,500\*Math\.pow\(2/);
 assert.doesNotMatch(js,/p_action:'tap',p_count:count/);
});
test('host and projector RPCs cannot block recovery indefinitely',()=>{
 for(const file of ['presenter.js','workspace.js']){
  const js=read(file);
  assert.match(js,/AbortController\(\)/);
  assert.match(js,/Promise\.race/);
  assert.match(js,/CHANNEL_ERROR/);
 }
});
