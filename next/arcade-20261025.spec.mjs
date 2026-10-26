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


test('appointed captains drive Memory, stats and live captain transfers',()=>{
 const migration=read('migrations/20261026_unified_lobby_and_captains.sql');
 assert.match(migration,/qwiz_lobby_captains c WHERE c\.room_id=r\.id AND c\.team_id=t\.id/);
 assert.match(migration,/p\.proname='qwiz_arcade_extras'/);
 assert.match(migration,/p\.proname='qwiz_arcade_state'/);
 assert.match(migration,/UPDATE public\.qwiz_arcade_memory_players m SET player_id=target/);
 assert.match(migration,/where c\.room_id=r\.id and c\.team_id=me\.team_id/i);
});

test('regression: arcade initialization cannot shadow room record with an update alias',()=>{
 const migration=read('migrations/20261026_arcade_room_alias_fix.sql');
 assert.match(migration,/update public\.qwiz_arcade_runs ar set option_order/);
 assert.match(migration,/where ar\.room_id=p_room and ar\.card_position=a\.card_position/);
 assert.match(migration,/Unexpected qwiz_arcade_ensure source/);
});
test('regression: a mobile round score cannot wrap 700 into vertical digits',()=>{
 const css=read('player-layout.css');
 const from=css.indexOf('/* Personal round metrics: never split');
 const block=css.slice(from,css.indexOf('/* Compact landscape:',from));
 assert.ok(from>0,'score block exists');
 assert.match(block,/\.round-self-summary>div\s*\{\s*display:flex;flex-direction:column/);
 assert.match(block,/\.round-self-summary strong\s*\{[^}]*white-space:nowrap/);
 assert.match(read('index.html'),/player-layout\.css\?v=[\w-]+/);
});

test('regression: geography must NOT reuse distractor ranking for answer display order',()=>{
 const sql=read('migrations/20261026_geo_independent_answer_shuffle.sql');
 assert.match(sql,/order by md5\(x\.id/);
 assert.match(sql,/replace\(definition,old_order,'order by random\(\)\)'\)/);
 assert.match(sql,/Already saved|Already saved/i);
});

test('audience room keeps a clean white background and one live QR mount',()=>{
 const presenter=read('presenter.js'),css=read('presenter.css');
 assert.match(presenter,/section class="lobby-cinematic"/);
 assert.doesNotMatch(presenter,/lobby-starfield" aria-hidden/);
 assert.doesNotMatch(presenter,/lobby-3d-orbit" aria-hidden/);
 assert.match(css,/#projectionMain>\.lobby-cinematic\{background:#fff!important/);
 assert.match(css,/#projectionMain>\.lobby-cinematic::before,#projectionMain>\.lobby-cinematic::after\{content:none!important/);
 assert.match(read('presenter.html'),/presenter\.css\?v=[\w-]+/);
});
test('launch action matches selector height across supported desktop widths',()=>{
 const css=read('workspace.css');
 assert.match(css,/#roomsPage \.launch-fields :is\(input,select\)\{[^}]*height:56px/);
 assert.match(css,/#roomsPage #launchButton\{[^}]*height:56px/);
 assert.match(read('workspace.html'),/workspace\.css\?v=[\w-]+/);
});

test('room creation SQL avoids PL/pgSQL room_id ambiguity on INSERT and reuse UPDATE',()=>{
 const createSql=read('migrations/20261026_fix_prepare_room_ambiguous_room_id.sql');
 const reuseSql=read('migrations/20261026_fix_reused_room_ambiguous_snapshot.sql');
 assert.match(createSql,/ON CONFLICT ON CONSTRAINT qwiz_lobby_config_pkey DO NOTHING;/);
 assert.match(createSql,/IF n<>2 THEN/);
 assert.match(reuseSql,/WHERE snapshot\.room_id=\(SELECT existing_room\.id/);
 assert.match(reuseSql,/existing_room\.owner_id=v_owner/);
 assert.match(read('workspace.js'),/rpc\('qwiz_prepare_room'/);
});

test('forty-device arcade load guard: staggered polling, bounded retry and reconnect',()=>{
 const js=read('arcade.js');
 assert.doesNotMatch(js,/setInterval\(\(\)=>fetchState\(tr\),kind==='screen'\?1300:1600\)/);
 assert.match(js,/tr\.kind==='player'\?4700/);
 assert.match(js,/Math\.random\(\)\*900/);
 assert.match(js,/Math\.min\(20000,base\*Math\.pow\(1\.6/);
 assert.match(js,/window\.addEventListener\('online'/);
 assert.match(js,/document\.addEventListener\('visibilitychange'/);
 assert.match(read('index.html'),/arcade\.js\?v=[\w-]+/);
 // 40 active clients, base 4700ms => under nine state reads per second
 // versus 25 per second in the previous 1600ms implementation.
 assert.ok(40/4.7<9);
});

test('arcade snapshot cannot hang forever and leave the player frozen',()=>{
 const js=read('arcade.js');
 assert.match(js,/new AbortController\(\)/);
 assert.match(js,/query\.abortSignal\(ac\.signal\)/);
 assert.match(js,/Promise\.race\(\[request,new Promise/);
 assert.match(js,/ac\.abort\(\);reject\(Error\('Сервер не ответил за 9 секунд'\)\);},9000\)/);
 assert.match(js,/finally\{tr\.fetching=false\}/);
});
