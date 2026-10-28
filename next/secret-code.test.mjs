import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const plan=JSON.parse(read('./memory-challenges.plan.json'));
const html=read('./workspace.html'),workspace=read('./workspace.js');
const ui=read('./secret-code.js'),arcade=read('./arcade.js');
const engine=read('./migrations/20261028_secret_code_engine.sql');
const lifecycle=read('./migrations/20261028_secret_code_integration.sql');
const stats=read('./migrations/20261028_secret_code_bonus_statistics.sql');
const cap=read('./migrations/20261028_secret_code_reward_cap.sql');

test('All 30 Secret Code challenges are selectable and independent of flag question modes',()=>{
 assert.equal(plan.name,'Секретный код');
 assert.equal(plan.levels.length,5);
 assert.equal(plan.levels.flatMap(l=>l.items).length,30);
 assert.match(html,/data-arcade="sequence_memory">Секретный код/);
 assert.match(html,/id="cardSecretChallenge"/);
 for(let i=1;i<=30;i++)assert.match(html,new RegExp('<option value="'+i+'">'));
 assert.match(workspace,/sequence_memory:\{title:'Секретный код'/);
 assert.doesNotMatch(workspace,/\['memory','Задания на память',true\]/);
});

test('Real room integration enables initialization, active timer, completion and statistics',()=>{
 for(const name of ['qwiz_arcade_ensure','qwiz_arcade_rank','qwiz_arcade_finalize',
   'qwiz_arcade_state','qwiz_tick','qwiz_party_control','qwiz_compile_build',
   'qwiz_advance_room','qwiz_check_room_start'])assert.match(lifecycle,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\('));
 assert.match(lifecycle,/sequence_memory/);
 assert.match(stats,/qwiz_round_results/);
 assert.match(cap,/IF r.mode IN \('blitz','sequence_memory'\)/);
});
test('Sequence and answer are held on server; no full solution is sent while playing',()=>{
 assert.match(engine,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(engine,/REVOKE ALL ON public\.qwiz_secret_code_sessions,public\.qwiz_secret_code_answers/);
 assert.match(engine,/CREATE OR REPLACE FUNCTION public\.qwiz_secret_code_submit/);
 assert.match(engine,/jsonb_array_length\(p_answer\)<>jsonb_array_length\(c.code\)/);
 assert.match(engine,/IF elapsed<1500\+jsonb_array_length\(c.code\)\*1100/);
 assert.match(engine,/CASE WHEN was_awarded THEN challenge.code ELSE NULL END/);
 assert.match(engine,/ON CONFLICT DO NOTHING/);
 assert.match(ui,/qwiz_secret_code_submit/);
 assert.match(ui,/qwiz_secret_code_state/);
 assert.doesNotMatch(ui,/secretAnswer\.join\(/);
});
test('All three screens load the same Secret Code UI, with existing design tokens',()=>{
 for(const f of ['index.html','presenter.html','workspace.html']){
  assert.match(read('./'+f),/secret-code\.js\?v=secret-code-live-20261028-1/);
  assert.match(read('./'+f),/arcade\.css\?v=secret-code-live-20261028-1/);
 }
 assert.match(arcade,/sequence_memory:\{title:'Секретный код'/);
 assert.match(read('./arcade.css'),/arcade-secret-scene/);
});

test('Geography answer does not pause between questions and shows immediate brief feedback',()=>{
 const geo=read('./russia-geo.js');
 const sql=read('./migrations/20261028_geo_immediate_answer.sql');
 assert.match(sql,/updated_at=clock_timestamp\(\)/);
 assert.doesNotMatch(sql,/updated_at=clock_timestamp\(\)\+make_interval/);
 assert.match(geo,/t\.feedbackUntil=Date\.now\(\)\+480/);
 assert.match(geo,/t\.feedbackTimer=setTimeout/);
 assert.match(geo,/t\.feedbackScrollKey=null/);
});
test('Secret Code is unpredictable even if a player knows the room ID',()=>{
 const sql=read('./migrations/20261028_secret_code_private_rng.sql');
 assert.match(sql,/gen_random_uuid\(\)::text/);
 assert.doesNotMatch(sql,/md5\(p_room::text/);
});

test('Secret Code-only room passes the live readiness gate',()=>{
 const sql=read('./migrations/20261028_secret_code_lobby_readiness.sql');
 assert.match(sql,/has_arcade_round/);
 assert.match(sql,/\('blitz','captain','tug','sequence_memory'\)/);
 assert.match(lifecycle,/\('blitz','captain','tug','sequence_memory','russia_map'\)/);
});
