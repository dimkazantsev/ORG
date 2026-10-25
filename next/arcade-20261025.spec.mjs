import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
const here=new URL('.',import.meta.url);
const read=name=>readFileSync(new URL(name,here),'utf8');
test('all modified application scripts parse',()=>{
 for(const file of ['arcade.js','app.js','presenter.js','russia-geo.js','workspace.js','workspace-teams.js','teams.js','player-layout.js'])
  assert.doesNotThrow(()=>new Script(read(file),{filename:file}),file);
});
test('region names cannot be probed before selecting and confirming',()=>{
 const geo=read('russia-geo.js');
 assert.match(geo,/interactive\?'Выбрать субъект на карте'/);
 assert.doesNotMatch(geo,/button\.textContent='Подтвердить: '/);
 assert.match(geo,/button\.textContent='Подтвердить выбор'/);
 assert.match(geo,/geo-correct-answer/);
 assert.match(geo,/geo-wrong-answer/);
});
test('question answer positions randomize with complete index and metadata remapping',()=>{
 const sql=read('migrations/20261025_shuffle_all_presented_answers.sql');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.qwiz_shuffle_question_options/);
 assert.match(sql,/ORDER BY shuffled/);
 assert.match(sql,/jsonb_build_object\('correct',v_correct\)/);
 assert.match(sql,/correct_indices/);
 assert.match(sql,/option_labels/);
 assert.match(sql,/v_opts:=v_question\.options;v_sol:=v_question\.solution/);
 assert.match(sql,/option_order jsonb/);
 assert.match(sql,/v\.option_order->>p_choice/);
});
test('mini-games are real multiplayer server-controlled modes',()=>{
 const arcade=read('arcade.js');
 const sql=read('migrations/20261025_memory_runner_teamtap.sql');
 const studio=read('workspace.js');
 assert.match(arcade,/data-arcade-memory/);
 assert.match(arcade,/data-arcade-tile/);
 assert.match(arcade,/qwiz_arcade_play/);
 assert.match(arcade,/data-runner-obstacle/);
 assert.match(arcade,/arcade-tap-center/);
 assert.match(arcade,/Победившая команда выбирает/);
 assert.match(studio,/Мэмори капитанов/);
 assert.match(studio,/Тап-баттл/);
 assert.match(sql,/qwiz_arcade_memory_players/);
 assert.match(sql,/qwiz_arcade_runner_players/);
 assert.match(sql,/ORDER BY random\(\) LIMIT 1/);
 assert.match(sql,/p_action='flip'/);
 assert.match(sql,/p_action='jump'/);
 assert.match(sql,/WHEN mode='tug' THEN x\.taps::numeric/);
 assert.match(sql,/public\.qwiz_party_arcade/);
 assert.doesNotMatch(arcade,/НАЖАТЬ ПО СИГНАЛУ|data-reflex-signal/);
});
test('all entry points use fresh asset versions after fix',()=>{
 for(const name of ['index.html','workspace.html','presenter.html']){
  const html=read(name);
  assert.match(html,/arcade\.js\?v=[a-zA-Z0-9_-]+/);
  assert.match(html,/arcade\.css\?v=[a-zA-Z0-9_-]+/);
 }
});
test('screens use constrained result panels and correct Russian count labels',()=>{
 const player=read('stage.css'),screen=read('presenter.css'),app=read('app.js'),presenter=read('presenter.js');
 assert.match(player,/round-score-list li>b/);
 assert.match(screen,/projection-round-leaders li>b/);
 assert.match(app,/QwizStage\.countLabel\(Number\(s\.total/);
 assert.match(presenter,/QwizStage\.countLabel\(players\.length/);
});
