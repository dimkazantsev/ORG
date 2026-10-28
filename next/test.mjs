import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('./app.css',import.meta.url),'utf8');
const js=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('./migration.sql',import.meta.url),'utf8');
test('The public home opens the current quiz and preserves QR room invitations',()=>{
 const root=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const redirect=root.split('<script data-org-canonical-entry>')[1]?.split('</script>')[0];
 assert.ok(redirect,'The legacy home must forward to the current quiz');
 function destination(initial){
  let redirected=null;
  const location={href:initial,replace(url){redirected=url}};
  runInNewContext(redirect,{window:{location},URL});
  return redirected;
 }
 assert.equal(
  destination('https://dimkazantsev.github.io/ORG/?room=A1B2C3D4#player'),
  'https://dimkazantsev.github.io/ORG/next/?room=A1B2C3D4#player'
 );
 assert.equal(destination('https://dimkazantsev.github.io/ORG/?legacy=1'),null);
});
test('Backend state avoids roster queries whose JSON keys are always overridden',()=>{
 const migration=readFileSync(new URL('./migrations/20261025_skip_overridden_roster_reads.sql',import.meta.url),'utf8');
 assert.match(migration,/public\.org_next_state\(text\)/);
 assert.match(migration,/public\.qwiz_team_state\(uuid,boolean,uuid\)/);
 assert.match(migration,/State\/team contract changed/);
 assert.match(migration,/into v_teams from public\.org_next_teams/);
 assert.match(migration,/into v_players from public\.org_next_players/);
 assert.match(migration,/PERF-STATE-ROSTER-READS-20261025/);
 assert.doesNotMatch(migration,/DROP (TABLE|FUNCTION)|DELETE FROM public\.org_next_players/i);
});
test('Only explicitly selected mechanics compile and empty rooms cannot auto-play',()=>{
 const migration=readFileSync(new URL('./migrations/20261025_strict_selected_mechanics_and_no_empty_replays.sql',import.meta.url),'utf8');
 const studio=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const layout=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 assert.match(migration,/qwiz_compile_build\(uuid,text,boolean\)/);
 assert.match(migration,/v_geo_round boolean:=false/);
 assert.match(migration,/solution->>''geo_mode''/);
 assert.match(migration,/qwiz_compile_build\(p_build,p_title,false\)/);
 assert.match(migration,/Для начала игры нужен хотя бы один подключённый участник/);
 assert.match(migration,/previous_build/);
 assert.match(migration,/NOT EXISTS\(SELECT 1 FROM public\.org_next_answers/);
 assert.match(studio,/cardGeoQuestionModes/);
 assert.match(studio,/geo_modes:mapMode\?mapModes:\(ordinaryGeo\?geoSelected:\[\]\)/);
 assert.match(studio,/if\(launchRequestBusy\)return/);
 assert.match(layout,/data-geo-question-mode value="capital"/);
 assert.match(layout,/data-geo-question-mode value="district"/);
});
test('Room preparation is serialized per build and never duplicates an empty lobby',()=>{
 const migration=readFileSync(new URL('./migrations/20261025_idempotent_room_preparation_and_hide_empty_history.sql',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 assert.match(migration,/public\.qwiz_prepare_room\(/);
 assert.match(migration,/WHERE id=p_build AND owner_id=v_owner FOR UPDATE/);
 assert.match(migration,/rb\.timeline=compiled->'timeline'/);
 assert.match(migration,/r\.phase='lobby'/);
 assert.match(migration,/NOT EXISTS\(SELECT 1 FROM public\.org_next_players/);
 assert.match(migration,/NOT EXISTS\(SELECT 1 FROM public\.org_next_answers/);
 assert.match(migration,/jsonb_array_length\(q\.questions\)=jsonb_array_length\(compiled->'questions'\)/);
 assert.match(migration,/'reused',true/);
 assert.match(migration,/'reused',false/);
 assert.match(migration,/public\.qwiz_host_rooms\(\)/);
 assert.match(migration,/rooms\.phase='finished'/);
 assert.doesNotMatch(migration,/DELETE FROM public\.org_next_rooms|DROP TABLE/i);
 assert.match(host,/created\.reused\?/);
});
test('Replay of a finished game reuses an empty lobby without corrupting real sessions',()=>{
 const migration=readFileSync(new URL('./migrations/20261025_replay_idempotent_empty_lobby.sql',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 assert.match(migration,/FOR UPDATE/);
 assert.match(migration,/reused_lobby_is_valid/);
 assert.match(migration,/candidate\.quiz_id=old_room\.quiz_id/);
 assert.match(migration,/cb\.timeline IS NOT DISTINCT FROM sb\.timeline/);
 assert.match(migration,/NOT EXISTS\(SELECT 1 FROM public\.org_next_players/);
 assert.match(migration,/NOT EXISTS\(SELECT 1 FROM public\.org_next_answers/);
 assert.match(migration,/'reused',true/);
 assert.match(migration,/'reused'',false/);
 assert.doesNotMatch(migration,/DELETE FROM public\.org_next_rooms|DROP TABLE/i);
 assert.match(host,/created\.reused\?/);
});
test('Hidden unset bonus cards and maps without selected mechanics cannot compile',()=>{
 const migration=readFileSync(new URL('./migrations/20261025_reject_unconfigured_legacy_mini_game_cards.sql',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 assert.match(migration,/Unconfigured arcade card must not be scheduled/);
 assert.match(migration,/v_card\.card_type IN \('bonus','duel'\)/);
 assert.match(migration,/v_card\.card_type IN \('team_stats','player_stats'\)/);
 assert.match(migration,/geo_modes/);
 assert.match(migration,/CONTINUE/);
 assert.match(host,/function previewLaunchBuild\(/);
 assert.match(host,/const cards=snapshot\.cards\|\|\[\]/);
 assert.match(html,/id="launchPlanCards"/);
});
test('Paused rooms preserve frozen memory and reject both answer RPCs',()=>{
 const migration=readFileSync(new URL('./migrations/20261025_pause_resume_memory_and_answer_guard.sql',import.meta.url),'utf8');
 const client=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 assert.match(migration,/org_next_answer\(uuid,integer\)/);
 assert.match(migration,/qwiz_submit_answer\(uuid,jsonb\)/);
 assert.match(migration,/v_room\.ends_at IS NULL OR v_room\.ends_at<=now\(\) OR public\.qwiz_party_paused\(p_room\)/);
 assert.match(migration,/qwiz_party_projection\(text\)/);
 assert.match(migration,/qwiz_party_state\(text\)/);
 assert.match(migration,/qwiz_flag_memory_view\(/);
 assert.match(migration,/coalesce\(\(s->>'host'\)::boolean,false\)=false/);
 assert.match(client,/s\.question\?\.prompt,s\.paused,me\?\.team_id/);
 assert.match(client,/\|\|!!s\.paused/);
 assert.match(client,/s\.phase!=='question'\|\|s\.paused\|\|s\.has_answer/);
});
test('Two moderator devices use an owner-checked atomic stage revision',()=>{
 const migration=readFileSync(new URL('./migrations/20261025_atomic_moderator_control_revision.sql',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 assert.match(migration,/qwiz_party_control_checked/);
 assert.match(migration,/FOR UPDATE/);
 assert.match(migration,/public\.qwiz_control_revision\(p_room\)/);
 assert.match(migration,/public\.qwiz_party_control\(p_room,p_action\)/);
 assert.match(migration,/FROM PUBLIC, anon/);
 assert.match(migration,/TO authenticated/);
 assert.match(host,/p_revision:revision/);
 assert.match(host,/if\(!revision\)/);
 assert.match(host,/Состояние игры изменилось/);
});
test('Legacy question snapshots with unselected modes cannot start again',()=>{
 const sql=readFileSync(new URL('./migrations/20261025_reject_legacy_unselected_question_modes.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.qwiz_room_snapshot_issue/);
 assert.match(sql,/v_question->'solution'->>'geo_mode'/);
 assert.match(sql,/v_question->'solution'->>'flag_mode'/);
 assert.match(sql,/v_card->'settings'->'geo_modes'/);
 assert.match(sql,/v_card->'settings'->'flag_modes'/);
 assert.match(sql,/IF public\.qwiz_room_snapshot_issue\(p_room\) IS NOT NULL THEN/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.qwiz_room_snapshot_issue/);
});
test('Moderator can finish rooms without a PL/pgSQL activity alias conflict',()=>{
 const migration=readFileSync(new URL('./migrations/20261024_qwiz_party_control_alias_fix.sql',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 assert.match(migration,/activity_lookup\.room_id=p_room/);
 assert.match(migration,/activity_lookup\.settings/);
 assert.match(migration,/has_function_privilege\('anon'/);
 assert.match(host,/\$\('liveFinish'\)\.onclick=\(\)=>control\('finish'\)/);
 assert.match(host,/qwiz_party_control/);
});
test('Geography of Russia is a real question bank, not a list of regions',()=>{
 const workspace=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const layout=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const seed=readFileSync(new URL('./migrations/20261024_geo_verified_question_bank.sql',import.meta.url),'utf8');
 assert.match(layout,/id="bankHeading"/);
 assert.match(layout,/id="bankDescription"/);
 assert.doesNotMatch(layout,/<h1>Флаги мира<\/h1>/);
 assert.match(workspace,/qwiz_geo_questions/);
 assert.match(workspace,/geoModeNames/);
 assert.match(workspace,/isGeoTopic\(topic\)/);
 assert.match(workspace,/state\.bankRequest/);
 assert.doesNotMatch(workspace,/89 регионов\. Индивидуальное задание создаётся случайно/);
 assert.match(seed,/CROSS JOIN \(VALUES\('capital'\),\('district'\)\)/);
 assert.match(seed,/INSERT INTO public\.qwiz_bank/);
 assert.match(seed,/geo:verified:v1/);
 assert.match(seed,/REVOKE ALL ON FUNCTION public\.qwiz_geo_questions/);
 assert.match(seed,/GRANT EXECUTE ON FUNCTION public\.qwiz_geo_questions/);
});
test('Every non-final card can be duplicated with isolated settings and stable finale order',()=>{
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('./workspace.css',import.meta.url),'utf8');
 assert.match(host,/data-duplicate-card/);
 assert.match(host,/data-delete-card/);
 assert.match(host,/const copySvg=/);
 assert.match(styles,/\.round-card-tools \.round-copy/);
 const start=host.indexOf('function duplicateCard(index){');
 const end=host.indexOf('function moveCard(i,j){',start);
 assert.ok(start>0&&end>start,'The duplicate function must exist');
 const original={id:'old-card-id',type:'round',title:'Флаги',topic_id:'sample-topic',
   settings:{flag_modes:['country'],geo_modes:['locate'],nested:{levels:[1,2]}}};
 const cards=[original,{type:'finale',title:'Финал',settings:{}}];
 let renders=0,announced='';
 const context={state:{cards},titles:{round:'Раунд вопросов'},
   gameTitle(c){return String(c.title||'').replace(/(?:\\s*[—–-]\\s*копия)+\\s*$/giu,'').trim()},
   renderCards(){renders++},
   msg(id,text){announced=text},
   motionPreference:{matches:true},
   $(id){assert.equal(id,'roundCards');return {querySelector(){return {scrollIntoView(){},focus(){}}}}}
 };
 runInNewContext(host.slice(start,end)+'duplicateCard(0);',context);
 assert.equal(cards.length,3);
 assert.equal(cards[1].title,'Флаги');
 assert.equal(cards[2].type,'finale');
 assert.equal(cards[1].id,undefined);
 assert.equal(cards[1].topic_id,original.topic_id);
 assert.deepEqual(JSON.parse(JSON.stringify(cards[1].settings)),original.settings);
 cards[1].settings.geo_modes.push('flag');
 assert.deepEqual(original.settings.geo_modes,['locate']);
 assert.equal(renders,1);
 assert.match(announced,/Сохраните сборку/);
 // The singleton final card cannot be cloned.
 runInNewContext(host.slice(start,end)+'duplicateCard(2);',context);
 assert.equal(cards.length,3);
 // Respect server-side limit of sixty cards.
 context.state.cards=Array.from({length:59},()=>({type:'round',title:'Вопросы',settings:{}}));
 context.state.cards.push({type:'finale',settings:{}});
 runInNewContext(host.slice(start,end)+'duplicateCard(0);',context);
 assert.equal(context.state.cards.length,60);
 assert.match(announced,/лимит 60 карточек/);
});
test('Mini-game palette and saved cards use distinct polished vector icons',()=>{
 const workspace=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const palette=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const styles=readFileSync(new URL('./workspace.css',import.meta.url),'utf8');
 assert.doesNotMatch(palette,/data-arcade="rocket"/);
 for(const [mode,icon] of [['blitz','blitz'],['tug','tug'],['captain','captain'],['sequence_memory','secret']]){
   assert.match(workspace,new RegExp("arcade_"+icon+":'<(?:path|circle|rect)"));
   assert.match(palette,new RegExp('data-arcade="'+mode+'"'));
 }
 assert.match(workspace,/arcade-palette-icon/);
 assert.match(workspace,/cardIconSvg\(c\.type,arcadeGames\[c\.settings\?\.arcade_mode\]\?\.icon/);
 assert.match(styles,/#arcadePalette \.arcade-palette-icon svg/);
 assert.match(palette,/workspace\.js\?v=[a-zA-Z0-9_-]+/);
 assert.match(palette,/workspace\.css\?v=[a-zA-Z0-9_-]+/);
});
test('Public projector includes choices but not answer keys and host slides are server-scoped',()=>{
 const presenter=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const layout=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const sql=readFileSync(new URL('./migrations/20261024_public_projector_hide_answers.sql',import.meta.url),'utf8');
 const deck=readFileSync(new URL('./migrations/20261024_host_three_slide_deck.sql',import.meta.url),'utf8');
 assert.match(layout,/id="moderatorSlides"/);
 assert.match(host,/qwiz_host_slide_deck/);
 assert.match(deck,/owner_id<>\(SELECT auth.uid\(\)\)/);
 assert.match(sql,/s:=s-''answer''/);
 assert.match(presenter.slice(presenter.indexOf('function questionScene('),presenter.indexOf('function render(state)')),/projection-public-options/);
});
test('Geography feedback is provided after a submitted answer and map zoom is persistent',()=>{
 const client=readFileSync(new URL('./russia-geo.js',import.meta.url),'utf8');
 const sql=readFileSync(new URL('./migrations/20261024_geo_answer_feedback.sql',import.meta.url),'utf8');
 assert.match(client,/t\.zoomBox/);
 assert.match(client,/last_answer/);
 assert.match(client,/showMap/);
 assert.match(sql,/p_answer is not null and v_task is not null/);
});
test('Instructor slide deck is visual, public projection stays question-only, and portraits use atlas',()=>{
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const hostHtml=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const projector=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const projectorCss=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 const profile=readFileSync(new URL('./profile.js',import.meta.url),'utf8');
 const sprite=readFileSync(new URL('./assets/animal-portraits.webp',import.meta.url));
 assert.ok(sprite.length>3000);
 assert.match(hostHtml,/id="moderatorSlides"/);
 assert.match(hostHtml,/id="hostProjectorSound"/);
 assert.match(hostHtml,/id="hostProjectorVolume"/);
 assert.match(host,/qwiz_host_slide_deck/);
 assert.match(host,/moderator-slide-image/);
 assert.match(host,/qwiz_projector_settings/);
 assert.match(profile,/QwizTeams\.avatar/);
 assert.match(projector,/applyProjectionSettings/);
 assert.match(projectorCss,/\.projection-screen-ready \.projection-footer/);
 const map=readFileSync(new URL('./russia-geo.js',import.meta.url),'utf8');
 assert.doesNotMatch(map,/const targets=interactive\?geometry/);
 assert.match(map,/gestureMoved=true/);
 assert.match(map,/t\.renderKey===key/);
 assert.match(map,/geo-correct-answer/);
});
test('Audience screen retains the approved light lavender palette',()=>{
 const css=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('./presenter.html',import.meta.url),'utf8');
 assert.doesNotMatch(css,/body\.projection-screen-ready\{background:\s*#160e41/);
 assert.doesNotMatch(css,/linear-gradient\(135deg,#190e46/);
 assert.match(css,/\.projection-screen-ready \.projection-footer/);
 assert.match(html,/presenter\.css\?v=[a-zA-Z0-9_-]+/);
});
test('The classroom and live mini-games retain purple and lavender, never blue UI accents',()=>{
 const audience=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 const arcade=readFileSync(new URL('./arcade.css',import.meta.url),'utf8');
 const gameplay=readFileSync(new URL('./arcade.js',import.meta.url),'utf8');
 const studio=readFileSync(new URL('./workspace.css',import.meta.url),'utf8');
 const gameHtml=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const screenHtml=readFileSync(new URL('./presenter.html',import.meta.url),'utf8');
 assert.doesNotMatch(audience,/background:\s*(?:#160e41|linear-gradient\(135deg,#190e46)/);
 assert.doesNotMatch(arcade,/#6cbee4/i);
 assert.doesNotMatch(gameplay,/#54a3d8|#8291db/i);
 assert.doesNotMatch(studio,/#497d91|#e9f3fa/i);
 assert.match(gameHtml,/arcade\.css\?v=[a-zA-Z0-9_-]+/);
 assert.match(screenHtml,/arcade\.css\?v=[a-zA-Z0-9_-]+/);
});
test('Flag imagery remains visible and visual answers show the flag instead of placeholder labels',()=>{
 const shared=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const projection=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const workspace=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const migration=readFileSync(new URL('./migrations/20261024_flags_visible_and_correct_picture.sql',import.meta.url),'utf8');
 assert.doesNotMatch(shared,/Флаг скрыт\. Вспомните страну/);
 assert.match(shared,/function updateMemory\(root,s,offset=0\)\{/);
 assert.match(shared,/\[data-memory-study\]/);
 assert.match(shared,/\[data-memory-answer\]/);
 assert.match(projection,/const frame=selectingFlag\|\|hideFiller\|\|!hasVisual\?'':QwizStage\.illustration\(q,state\.phase==='result'\?state\.answer:null\)/);
 assert.match(projection.slice(projection.indexOf('function questionScene('),projection.indexOf('function applyProjectionSettings(')),/projection-public-options/);
 assert.match(app,/result-flag-image/);
 assert.match(app,/s\.answer\.image_url/);
 assert.match(workspace,/moderator-option-flag/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.qwiz_flag_memory_view/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.qwiz_answer_display/);
 assert.match(migration,/'image_url',image_url/);
});
test('Projector reveals one authoritative answer only after server result phase',()=>{
 const presenter=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 const migration=readFileSync(new URL('./migrations/20261024_public_projector_reveal_after_answer.sql',import.meta.url),'utf8');
 const start=presenter.indexOf('function questionScene(state){');
 const end=presenter.indexOf('function applyProjectionSettings(settings)',start);
 assert.ok(start>=0&&end>start);
 const scene=presenter.slice(start,end);
 assert.match(scene,/const finished=state\.phase==='result'&&!!state\.answer/);
 assert.doesNotMatch(scene,/const choices=finished/);
 assert.doesNotMatch(scene,/projection-reveal-options/);
 assert.match(scene,/correctIndices\.length===1/);
 assert.match(scene,/projection-answer-single/);
 assert.match(scene,/projection-answer-text/);
 assert.match(scene,/projection-answer-explanation/);
 assert.match(css,/\.projection-answer-single\{/);
 assert.match(css,/#projectionMain \.projection-question-only\.is-result \.projection-answer-text/);
 assert.match(migration,/IF s->>'phase' = 'result' THEN/);
 assert.match(migration,/s:=s-'answer'/);
 assert.match(migration,/'options'::text/);
 assert.match(migration,/'solution'::text/);
});
test('Moderator slide cards shrink to content and do not reserve blank height',()=>{
 const css=readFileSync(new URL('./workspace.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const compact=css.split('/* Compact moderator timeline:')[1]?.split('/* Teacher sees each configured timeline card')[0]||'';
 assert.match(compact,/\.moderator-slides\s*\{[^}]*align-items:start/);
 assert.match(compact,/grid-auto-rows:min-content/);
 assert.match(compact,/\.moderator-slide\s*\{[^}]*min-height:0;height:auto/);
 assert.match(compact,/\.moderator-slide-choices\s*\{[^}]*margin:2px 0 0/);
 assert.doesNotMatch(compact,/min-height:290px|margin-top:auto/);
 assert.match(html,/workspace\.css\?v=[a-zA-Z0-9_-]+/);
});
test('Result lifecycle has automatic expiry with full timeline preview',()=>{
 const timer=readFileSync(new URL('./migrations/20261024_auto_result_transition.sql',import.meta.url),'utf8');
 const deck=readFileSync(new URL('./migrations/20261024_host_full_card_storyboard.sql',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 assert.match(timer,/ends_at=clock_timestamp\(\)\+interval ''8 seconds''/);
 assert.match(deck,/public\.qwiz_room_builds/);
 assert.match(deck,/public\.qwiz_room_activity/);
 assert.match(deck,/'russia_map'/);
 assert.match(deck,/FOR slot IN -1\.\.1 LOOP/);
 assert.match(host,/qwiz_geo_projection/);
 assert.match(host,/qwiz_party_arcade/);
 assert.match(host,/moderator-slide-live/);
 assert.match(host,/moderator-mini-map/);
});
test('Projection fits TV sizes and phones show actual round standings',()=>{
 const projector=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 assert.match(projector,/fitProjectionScene/);
 assert.match(projector,/scheduleFitProjection/);
 assert.match(css,/height:100dvh;min-height:0/);
 assert.match(app,/game-statistics-panel/);
 assert.match(app,/personalResults\(s,true\)/);
});
test('Animal avatars have visible fallback and animated arcade receives tap reactions',()=>{
 const teams=readFileSync(new URL('./teams.js',import.meta.url),'utf8');
 const profile=readFileSync(new URL('./profile.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('./teams.css',import.meta.url),'utf8');
 const arcade=readFileSync(new URL('./arcade.js',import.meta.url),'utf8');
 const motion=readFileSync(new URL('./arcade.css',import.meta.url),'utf8');
 assert.match(teams,/animal-fallback-svg/);
 assert.match(profile,/portrait\(me.avatar/);
 assert.match(css,/not\(\.portrait-atlas-verified\)/);
 assert.match(arcade,/animateTap\(tr\)/);
 assert.match(motion,/@keyframes arcade-burst/);
 assert.match(motion,/prefers-reduced-motion/);
});
test('Repeating a finished room creates new room and preserves historical scores and build',()=>{
 const sql=readFileSync(new URL('./migrations/20261024_repeat_finished_room.sql',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 assert.match(sql,/public\.qwiz_repeat_finished_room\(p_room uuid\)/);
 assert.match(sql,/r\.phase='finished'/);
 assert.match(sql,/public\.org_next_create_room/);
 assert.match(sql,/INSERT INTO public\.qwiz_room_builds/);
 assert.doesNotMatch(sql,/DELETE FROM public\.org_next_answers/);
 assert.match(host,/repeatFinishedRoom\(\)/);
 assert.match(host,/qwiz_repeat_finished_room/);
 assert.match(host,/s\.phase==='finished'\?'Повторить игру'/);
 assert.match(host,/phase==='finished'/);
});
test('Question about Romanian stripe order reveals the flag picture on projector and phone',()=>{
 const stage=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const player=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const publicScreen=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('./stage.css',import.meta.url),'utf8');
 const roomFlag=readFileSync(new URL('./assets/flags-world/ro.svg',import.meta.url),'utf8');
 assert.match(stage,/function correctFlagMarkup\(question,answer\)/);
 assert.match(stage,/stripeOption\(item\)/);
 assert.match(player,/QwizStage\.correctFlagMarkup\(question,s\.answer\)/);
 assert.match(publicScreen,/QwizStage\.correctFlagMarkup\(q,answer\)/);
 assert.match(css,/\.correct-flag-art \.flag-stripe-art/);
 assert.match(roomFlag,/#002B7F/i);
 assert.match(roomFlag,/#FCD116/i);
 assert.match(roomFlag,/#CE1126/i);
});
test('Replay remains enabled in finished state after the team readiness check',()=>{
 const teams=readFileSync(new URL('./workspace-teams.js',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 assert.match(teams,/const replay=s\.phase==='finished'/);
 assert.match(teams,/\$\('liveStart'\)\.disabled=!\(replay\|\|canStart\)/);
 assert.match(host,/QwizStage\.iconLabel\(\$\('liveStart'\)/);
 assert.match(host,/qwiz_repeat_finished_room/);
 assert.match(page,/id="liveControlsHint"/);
 assert.match(page,/workspace-teams\.js\?v=team-lab-recovery-20261028-3/);
});
test('3D avatars render in team roster, profile and new optional gallery',()=>{
 const src=readFileSync(new URL('./teams.js',import.meta.url),'utf8');
 const profile=readFileSync(new URL('./profile.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('./teams.css',import.meta.url),'utf8');
 const imageSources=readFileSync(new URL('./avatar-art.js',import.meta.url),'utf8');
 const pages=['index.html','workspace.html','profile.html','presenter.html'];
 assert.match(src,/naturalWidth>=240/);
 assert.match(src,/animal-photo/);
 assert.match(src,/avatar-photo-failed/);
 assert.match(profile,/Ещё 13 объёмных персонажей/);
 assert.match(profile,/QwizTeams\.avatar/);
 assert.match(styles,/\.animal-portrait \.animal-photo/);
 assert.match(imageSources,/smnandre\/animoon/);
 assert.match(imageSources,/data:image\/webp;base64,/);
 for(const filename of pages){
   const html=readFileSync(new URL('./'+filename,import.meta.url),'utf8');
   assert.match(html,/avatar-art\.js\?v=avatar-3d-20261024-16/);
 }
});
test('Projector hides flag-picker filler art, reveals actual answers and fits the viewport',()=>{
 const projector=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 const sceneStart=projector.indexOf('function questionScene(state){');
 const sceneEnd=projector.indexOf('// Keep the visible scene',sceneStart);
 assert.ok(sceneStart>=0&&sceneEnd>sceneStart);
 const scene=projector.slice(sceneStart,sceneEnd);
 const context={
  escapeText:String,
  projectionOption:(option)=>'<div class="fixture-flag">'+String(option.label||option)+'</div>',
  QwizStage:{
   countLabel:(n,forms)=>String(n)+' '+forms[new Intl.PluralRules('ru').select(Number(n))],
   illustration:()=>'<div class="fixture-filler-art">Not a real flag</div>',
   clockMarkup:()=>'<div>12 sec</div>',
   correctFlagMarkup:()=>'<div class="fixture-correct-flag">Flag</div>'
  }
 };
 const prompt='Выберите флаг государства «Ангола».';
 const question={prompt,options:[{label:'A'},{label:'B'},{label:'C'},{label:'D'}]};
 const lobby=runInNewContext(scene+'questionScene({question,phase:"question",index:0,total:10,teams:[]})',{...context,question});
 assert.doesNotMatch(lobby,/fixture-filler-art/);
 assert.equal((lobby.match(/fixture-flag/g)||[]).length,4);
 assert.doesNotMatch(lobby,/fixture-correct-flag/);
 const result=runInNewContext(scene+'questionScene({question,phase:"result",index:0,total:10,answer:{indices:[1],text:"Ангола"},teams:[]})',{...context,question});
 assert.match(result,/fixture-correct-flag/);
 assert.equal((result.match(/fixture-flag/g)||[]).length,0);
 assert.equal((result.match(/projection-answer-single/g)||[]).length,1);
 assert.match(result,/projection-answer-text/);
 assert.match(result,/Ангола/);
 assert.match(projector,/scene\.dataset\.fittedZoom/);
 assert.match(projector,/availH\/Math\.max\(1,m\.h\)/);
 assert.doesNotMatch(projector,/Math\.max\(\.36/);
 assert.match(styles,/#projectionMain\{flex:1 1 auto;min-height:0/);
 assert.match(styles,/\.projection-question-only \.projection-topline\{min-height:0!important/);
});
test('Round intro icon follows the actual gameplay mechanic on phone and projector',()=>{
 const stage=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const phone=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const projector=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 for(const key of ['round','flag','map','arcade_rocket','arcade_blitz','arcade_tug','arcade_captain','arcade_secret','intro','finale']){
  assert.match(stage,new RegExp(key+":'<"),'Missing round artwork for '+key);
 }
 assert.match(stage,/function roundIconSvg\(key\)/);
 assert.match(phone,/const drawing=QwizStage\.roundIconSvg\(icon/);
 assert.match(phone,/QwizStage\.roundIconSvg\(icon/);
 assert.match(projector,/const art=QwizStage\.roundIconSvg\(icon\)/);
});
test('Lobby symbol and flag artwork have stable, centered visual bounds',()=>{
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const mobile=readFileSync(new URL('./player-layout.css',import.meta.url),'utf8');
 const stage=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const stageCss=readFileSync(new URL('./stage.css',import.meta.url),'utf8');
 const presenter=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 assert.match(app,/lobby-signal-center/);
 assert.doesNotMatch(app,/lobby-play-mark/);
 assert.doesNotMatch(app,/<span>✳<\/span>/);
 assert.match(app,/role="status">Ожидайте сигнала преподавателя/);
 assert.match(mobile,/\.game-lobby-wait \.lobby-people\{position:relative;z-index:2/);
 assert.match(mobile,/\.game-lobby-wait>\.lobby-ambient\{display:none!important/);
 assert.match(stage,/flag-media-frame/);
 assert.match(stage,/url\?'':'<div class="frame-orbit"/);
 assert.match(stageCss,/\.question-frame\.flag-media-frame \.question-picture>/);
 assert.match(presenter,/#projectionMain \.projection-question-only \.projection-reveal-option-body \.flag-choice-art/);
 assert.match(presenter,/#projectionMain \.projection-question-only \.projection-answer-reveal\{/);
});
test('Phone lobby animates and completed tap-game ballot fills the viewport',()=>{
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const playerCss=readFileSync(new URL('./player-layout.css',import.meta.url),'utf8');
 const arcade=readFileSync(new URL('./arcade.js',import.meta.url),'utf8');
 const playerHtml=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.match(app,/game-lobby-wait/);
 assert.match(app,/lobby-signal-ring/);
 assert.match(playerCss,/@keyframes lobby-bob/);
 assert.match(playerCss,/@keyframes lobby-pulse/);
 assert.match(playerCss,/prefers-reduced-motion:reduce/);
 assert.match(arcade,/classList\.toggle\('is-boost-voting'/);
 assert.match(playerCss,/\.arcade-player\.is-boost-voting/);
 assert.match(playerCss,/grid-auto-rows:minmax\(0,1fr\)/);
 assert.match(playerCss,/\.arcade-player\.is-boost-voting .arcade-boost-grid button\.selected/);
 assert.match(playerHtml,/arcade\.js\?v=[a-zA-Z0-9_-]+/);
 assert.match(playerHtml,/player-layout\.css\?v=[a-zA-Z0-9_-]+/);
});
test('2026 quiz round flow: editor, countdown, score displays and two-stage vote stay connected',()=>{
 const studio=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const source=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const player=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const screen=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const arcade=readFileSync(new URL('./arcade.js',import.meta.url),'utf8');
 const stage=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const map=readFileSync(new URL('./russia-geo.js',import.meta.url),'utf8');
 const dbGate=readFileSync(new URL('./migrations/20261025_bonus_gate_host_next.sql',import.meta.url),'utf8');
 for(const id of ['openGamesPalette','generalLeadSeconds','generalStatsSeconds','generalOpenBonusRules','hostProjectorMusic',
   'bonusRulesBuild','bonusRulesCard','bonusRulesActivity','bonusRulesGap','bonusRulesMin'])assert.match(studio,new RegExp('id="'+id+'"'));
 // Bonus thresholds must have exactly one editor: General Settings no longer owns them.
 for(const obsolete of ['generalBonusPercent','generalBonusLead'])assert.doesNotMatch(studio,new RegExp('id="'+obsolete+'"'));
 assert.doesNotMatch(studio,/Порог 70% участия; дополнительно нужны не менее 25 игровых очков/);
 assert.match(source,/function openGeneralBonusRules\(\)/);
 assert.match(source,/QwizBonusSettings\?\.focusBuild\?\.\(state\.buildId\)/);
 for(const type of ['Вступление','Вопросы','Игры','Финал'])assert.match(studio,new RegExp(type));
 const topPalette=studio.slice(studio.indexOf('id="cardPalette"'),studio.indexOf('id="gamesPalette"'));
 for(const obsolete of ['data-card="team_stats"','data-card="player_stats"','data-card="bonus"'])assert.ok(!topPalette.includes(obsolete),'Removed top-level card must not be in the palette: '+obsolete);
 assert.match(source,/bonus_percent/);
 assert.match(source,/stats_seconds/);
 assert.match(player,/roundScorePanel\(s.round_results/);
 assert.match(player,/roundIntroMarkup\(s\)/);
 assert.match(player,/player-finale-screen/);
 assert.match(screen,/automaticRoundStandings\(state\)/);
 assert.match(screen,/roundIntroScene\(state\)/);
 assert.match(arcade,/const STRATEGIES=/);
 assert.match(arcade,/const HINDRANCES=/);
 assert.match(arcade,/arcade-vote-strategy/);
 assert.match(arcade,/vote\.stage==='strategy'/);
 assert.match(stage,/async startTheme\(\)/);
 assert.match(stage,/stopTheme\(\)/);
 assert.match(map,/data-geo-confirm/);
 assert.match(map,/geo-map-toolbar/);
 assert.match(dbGate,/public\.qwiz_bonus_vote_complete/);
 assert.match(dbGate,/public\.qwiz_bonus_window/);
 assert.match(dbGate,/clock_timestamp\(\)/);
});
test('New JavaScript parses independently of legacy app.js',()=>{assert.doesNotThrow(()=>new Function(js));assert.doesNotMatch(html,/\.\/\.\.\/(app\.js|styles\.css)/)});
test('All direct DOM IDs referenced by client exist in HTML',()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 const refs=new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(x=>x[1]));
 for(const ref of refs)assert.ok(ids.has(ref)||js.includes('id="'+ref+'"'),'Missing static or dynamically rendered #'+ref);
});
test('Client never directly reads answer keys or core tables',()=>{
 assert.doesNotMatch(js,/\.from\(['"]org_next_/);
 assert.doesNotMatch(js,/\bquiz_private\b/);
 assert.match(js,/org_next_answer/);
 assert.match(js,/qwiz_party_state/);
 assert.match(js,/qwiz_party_control/);
 const overlay=readFileSync(new URL('./migrations/20261023_live_round_boost_votes.sql',import.meta.url),'utf8');
 assert.match(overlay,/public\.org_next_state\(p_code\)/);
 assert.match(overlay,/public\.org_next_advance\(p_room,p_action\)/);
});
test('Quiz has independently accessible mobile and host routes',()=>{
 for(const name of ['homeView','gameView','studioView','joinForm','loginForm','createRoomForm','quizForm','gameContent','hostControls'])
 assert.match(html,new RegExp('id="'+name+'"'));
 assert.match(css,/@media\s*\(max-width:540px\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion/);
});
test('Database is isolated and uses RLS + explicit RPC grants',()=>{
 const tables=['quizzes','rooms','teams','players','answers'];
 for(const item of tables){
 assert.match(sql,new RegExp('create table if not exists public\\.org_next_'+item));
 assert.match(sql,new RegExp('alter table public\\.org_next_'+item+' enable row level security'));
 }
 for(const method of ['catalog','save_quiz','import_legacy','create_room','join','state','advance','assign','answer'])
 assert.match(sql,new RegExp('public\\.org_next_'+method+'\\('));
 assert.match(sql,/set search_path=''/);
 assert.match(sql,/revoke all on public\.org_next_quizzes/);
});
test('No client-side fabricated correct answers or scores',()=>{
 assert.doesNotMatch(js,/KEY_SUPABASE\s*=\s*['"]service_role/);
 assert.match(js,/ctx\.client\.rpc\(name,params\)/);
 assert.match(js,/org_next_answer/);
 assert.match(js,/qwiz_submit_answer/);
});

test('QWIZ-PARTY brand, QR library, presenter-only route and 15 teams',()=>{
 assert.match(html,/QWIZ-PARTY/);
 assert.match(html,/vendor\/qrcode\.min\.js/);
 assert.match(html,/id="homeQr"/);
 assert.match(html,/id="qrDialog"/);
 assert.match(html,/id="openPresenter"/);
 assert.doesNotMatch(html,/id="roomTeamCount"/);assert.match(readFileSync(new URL('./workspace.html',import.meta.url),'utf8'),/id="teamCount" type="number" min="1" max="15"/);
 const presenterHtml=readFileSync(new URL('./presenter.html',import.meta.url),'utf8');
 const presenterJs=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const presenterCss=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 assert.doesNotThrow(()=>new Function(presenterJs));
 assert.match(presenterJs,/qwiz_party_projection/);
 const pauseOverlay=readFileSync(new URL('./migrations/20261023_paused_projection_clock.sql',import.meta.url),'utf8');
 assert.match(pauseOverlay,/public\.qwiz_public_screen\(p_code\)/);
 assert.doesNotMatch(presenterHtml,/teacher|hostStart|hostReveal|hostFinish/);
 assert.match(presenterCss,/projection-option/);
 const upgrade=readFileSync(new URL('./migrations/20261022_qwiz_party_projection.sql',import.meta.url),'utf8');
 assert.match(upgrade,/p_teams not between 1 and 15/);
 assert.match(upgrade,/check\(position between 1 and 15\)/);
 assert.match(upgrade,/v_question := v_question - 'correct' - 'explanation'/);
 assert.match(upgrade,/for update/);
});

test('Entry refactor is a single CSS design system without duplicate selectors or remote font',()=>{
 assert.doesNotMatch(html,/fonts\.googleapis\.com/);
 assert.doesNotMatch(html,/homeNavTop|entry-visual|entry-landing/);
 assert.match(html,/id="homeQr"/);
 assert.match(html,/id="rolePlayer"/);
 assert.match(html,/id="joinForm"/);
 assert.match(css,/\.welcome-layout/);
 assert.ok(Buffer.byteLength(css,'utf8')<26000,'CSS exceeds single sheet budget');
 assert.match(js,/qrCache/);
});


test('Teacher studio, profile, and public screen parse as independent applications',()=>{
 for(const name of ['workspace','profile','presenter']){
  const html=readFileSync(new URL('./'+name+'.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('./'+name+'.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('./'+name+'.css',import.meta.url),'utf8');
  assert.doesNotThrow(()=>new Function(js),'Invalid '+name+'.js');
  assert.ok(html.length>800&&css.length>1000,'Missing application shell or stylesheet');
  assert.match(html,/QWIZ-PARTY/);
  assert.match(css,/@media\(/);
 }
});
test('Library separates bank from round builds and charts',()=>{
 const h=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const j=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 for(const id of ['bankPage','builderPage','roomsPage','insightsPage','roundCards','questionDialog','cardDialog','studentChart','hostRoomList','liveConsole'])
  assert.match(h,new RegExp('id="'+id+'"'));
 for(const api of ['qwiz_studio','qwiz_prepare_room','qwiz_host_rooms','qwiz_teacher_stats'])
  assert.match(j,new RegExp(api));
 assert.match(j,/draggable|dragstart/);
});
test('Security of password hashes, one-time profile QR and room isolation',()=>{
 const p=readFileSync(new URL('./migrations/qwiz_student_identity.sql',import.meta.url),'utf8');
 const m=readFileSync(new URL('./migrations/qwiz_student_multidevice_room.sql',import.meta.url),'utf8');
 const publicScreen=readFileSync(new URL('./migrations/qwiz_executable_round_cards.sql',import.meta.url),'utf8');
 assert.match(p,/extensions\.crypt/);
 assert.match(p,/locked_until/);
 assert.match(p,/extensions\.digest\(v_token,'sha256'\)/);
 assert.match(p,/interval '5 minutes'/);
 assert.match(m,/unique index if not exists qwiz_player_room_account_unique/i);
 assert.match(m,/qwiz_player_device_access/);
 assert.match(publicScreen,/the room|v_room|r\.phase/i);
 assert.match(publicScreen,/-'correct'-'explanation'/);
 assert.doesNotMatch(readFileSync(new URL('./presenter.js',import.meta.url),'utf8'),/service_role|secret_key/);
});
test('Round controls have server countdown and separate intermission states',()=>{
 const c=readFileSync(new URL('./migrations/qwiz_round_countdown.sql',import.meta.url),'utf8');
 const a=readFileSync(new URL('./migrations/qwiz_executable_round_cards.sql',import.meta.url),'utf8');
 assert.match(c,/qwiz_release_countdown/);
 assert.match(c,/interval '5 seconds'/);
 assert.match(a,/v_card_pos\+1/);
 assert.match(a,/v_next_card->>'type'='finale'/);
 assert.match(a,/qwiz_room_activity/);
});

test('Rich answer engine never exposes solution to students or projector',()=>{
 const sql=readFileSync(new URL('./migrations/qwiz_never_leak_rich_solutions.sql',import.meta.url),'utf8');
 const grader=readFileSync(new URL('./migrations/qwiz_rich_scoring.sql',import.meta.url),'utf8');
 const compiler=readFileSync(new URL('./migrations/qwiz_rich_compiler.sql',import.meta.url),'utf8');
 assert.match(sql,/v_q:=v_q-'correct'-'solution'-'explanation'/);
 assert.match(sql,/\)-'correct'-'solution'-'explanation'/);
 assert.match(sql,/Используйте обработчик сложного вопроса/);
 assert.match(grader,/qwiz_submit_answer/);
 assert.match(grader,/on conflict\(room_id,player_id,question_index\) do nothing/);
 assert.match(grader,/qwiz_answer_eligible/);
 assert.match(compiler,/match_choices/);
 assert.match(compiler,/v_sol/);
});

test('Flags of the World starts without legacy question formats or auto-seeding',()=>{
 const h=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const w=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const presenter=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const flagSql=readFileSync(new URL('./migrations/qwiz_flags_world_visual_answers.sql',import.meta.url),'utf8');
 const resetSql=readFileSync(new URL('./migrations/MANUAL_flags_world_catalog_reset.sql',import.meta.url),'utf8');
 for(const name of ['Угадать страну по флагу','Выбрать флаг по названию','Цвета и полосы',
  'Символы и гербы','Скрытые фрагменты и пиксели','Поиск ошибок',
  'Похожие флаги','Сборка флага','Несколько правильных ответов',
  'География и карты','История и символика'])assert.ok(w.includes(name),name);
 assert.doesNotMatch(w,/\['memory','Задания на память',true\]/);
 assert.doesNotMatch(w,/qwiz_seed_topics/);
 assert.doesNotMatch(h,/id="bankKind"/);
 assert.match(w,/kind:'flag'/);
 assert.match(w,/flag_mode:mode/);
 assert.match(w,/data-flag-image/);
 assert.match(js,/flagOptionHtml/);
 assert.match(presenter,/projectionOption/);
 assert.match(flagSql,/->>'label'/);
 assert.match(resetSql,/qwiz_flags_reset_archive_20261022/);
 assert.match(resetSql,/count\(\*\) from public\.org_next_rooms/);
});

test('Standalone memory blueprint uses existing project design and contains exactly 30 templates',()=>{
 const plan=JSON.parse(readFileSync(new URL('./memory-challenges.plan.json',import.meta.url),'utf8'));
 assert.equal(plan.name,'Секретный код');
 assert.equal(plan.gameType,'standalone_arcade');
 assert.equal(plan.mode,'sequence_memory');
 assert.match(plan.visualStyle,/Reuse existing QWIZ-PARTY/);
 assert.equal(plan.levels.length,5);
 const all=plan.levels.flatMap(level=>level.items);
 assert.equal(all.length,30);
 assert.equal(new Set(all.map(c=>c.id)).size,30);
 for(const [i,level] of plan.levels.entries()){
  assert.equal(level.level,i+1);
  assert.equal(level.items.length,6);
  assert.equal(level.symbolCount,4+i);
  assert.ok(level.items.every(item=>item.symbols===level.symbolCount&&item.level===level.level));
 }
});

test('Flags subcategories are a metadata filter, not duplicated topic tables',()=>{
 const w=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const h=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const migration=readFileSync(new URL('./migrations/qwiz_flags_mechanics_round_selection.sql',import.meta.url),'utf8');
 const seed=readFileSync(new URL('./migrations/qwiz_flags_seed_first_40_verified.sql',import.meta.url),'utf8');
 assert.match(h,/id="bankMode"/);
 assert.match(h,/id="cardModesDetails"/);
 assert.match(w,/data-card-mode/);
 assert.match(w,/flag_modes:flagQuestion\?selected:\[\]/);
 assert.match(w,/studio\('flag_publish'/);
 assert.match(migration,/q\.solution->>'flag_mode'=p_input->>'mode'/);
 assert.match(migration,/b\.solution->>'flag_mode' in \(select jsonb_array_elements_text\(v_modes\)\)/);
 assert.match(migration,/b\.tags @> array\['fw:published'\]/);
 assert.match(migration,/not \(b\.id=any\(v_used\)\)/);
 assert.match(migration,/array_remove\(tags,'fw:published'\)/);
 assert.match(migration,/public\.qwiz_flags_question_valid/);
 assert.match(seed,/40 UN-member flags x 2 approved mechanics = 80 questions/);
 assert.match(seed,/raise exception 'Проверка качества пилотной партии/);
});

test('World flags manifest contains 193 UN members and two observers with local assets',()=>{
 const manifest=JSON.parse(readFileSync(new URL('./assets/flags-world/catalog.json',import.meta.url),'utf8'));
 assert.equal(manifest.target_countries,195);
 assert.equal(manifest.pilot_countries,40);
 assert.equal(manifest.countries.length,195);
 assert.equal(manifest.countries.filter(x=>x.un_status==='member').length,193);
 assert.equal(manifest.countries.filter(x=>x.un_status==='observer').length,2);
 assert.equal(manifest.countries.filter(x=>x.flag_status!=='source_verified').length,1);
 const codes=new Set();
 for(const country of manifest.countries){
  assert.match(country.iso2,/^[A-Z]{2}$/);
  assert.ok(!codes.has(country.iso2),'Duplicate ISO '+country.iso2);
  codes.add(country.iso2);
  assert.match(country.name_ru,/[^\s]/);
  assert.ok(['member','observer'].includes(country.un_status));
  const svg=readFileSync(new URL('./assets/flags-world/'+country.iso2.toLowerCase()+'.svg',import.meta.url),'utf8');
  assert.match(svg,/<svg\b/i);
  assert.doesNotMatch(svg,/<script\b|<foreignobject\b|javascript:/i);
 }
 assert.ok(codes.has('PS')&&codes.has('VA'));
 for(const forbidden of ['XK','TW','EH','CK','NU','HK'])assert.ok(!codes.has(forbidden));
});

test('Question preview opens dedicated keyboard-navigable popup',()=>{
 const html=readFileSync(new URL('./question-preview.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('./question-preview.js',import.meta.url),'utf8');
 const workspace=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 assert.match(html,/id="previewPrev"/);
 assert.match(html,/id="previewNext"/);
 assert.match(js,/ArrowLeft/);assert.match(js,/ArrowRight/);
 assert.match(js,/e.origin!==location.origin/);
 assert.match(workspace,/data-preview-question/);
 assert.match(workspace,/qwiz-preview-ready/);
});
test('Colors are ready as a third server-checked flag mechanic',()=>{
 const w=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const presenter=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const stage=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const sql=readFileSync(new URL('./migrations/qwiz_flags_colors_preview_removal.sql',import.meta.url),'utf8');
 const seed=readFileSync(new URL('./migrations/qwiz_flags_colors_first_20.sql',import.meta.url),'utf8');
 assert.match(w,/\['colors','Цвета и полосы',true\]/);
 assert.match(w,/data-stripe/);assert.match(w,/colorOrientation/);
 assert.match(app,/QwizStage.stripeOption/);assert.match(presenter,/QwizStage.stripeOption/);
 assert.match(stage,/function stripeOption/);
 assert.match(sql,/qwiz_flags_question_valid/);
 assert.match(sql,/qwiz_remove_room/);
 assert.match(sql,/qwiz_archived_rooms/);
 assert.match(sql,/build_delete/);
 assert.match(sql,/'country','picker','colors'/);
 assert.match(seed,/Expected 20 color questions/);
});

test('Two additional country flag mechanics remain validated server-side',()=>{
 const workspace=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const stage=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const p=readFileSync(new URL('./question-preview.js',import.meta.url),'utf8');
 const sql=readFileSync(new URL('./migrations/qwiz_flags_symbols_fragments.sql',import.meta.url),'utf8');
 const seed=readFileSync(new URL('./migrations/qwiz_flags_symbols_fragments_first_set.sql',import.meta.url),'utf8');
 assert.match(workspace,/\['symbols','Символы и гербы',true\]/);
 assert.match(workspace,/\['fragments','Скрытые фрагменты и пиксели',true\]/);
 assert.match(workspace,/id="visualZoom"/);
 assert.match(workspace,/restorePosition/);assert.match(workspace,/data-delete-build/);
 assert.match(workspace,/data-delete-room/);assert.match(workspace,/data-delete-card/);
 assert.match(stage,/hydrateFlagVisuals/);assert.match(stage,/flagVisualContent/);
 assert.match(p,/isVisual\?QwizStage\.flagVisualContent/);
 assert.match(sql,/flag_visual/);assert.match(sql,/'country','picker','colors','symbols','fragments'/);
 assert.match(seed,/Expected 36 curated questions/);
});

test('Sound and sixth flag mechanism preserve secure flag scoring',()=>{
 const w=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const stage=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const sql=readFileSync(new URL('./migrations/qwiz_flags_find_errors.sql',import.meta.url),'utf8');
 const seed=readFileSync(new URL('./migrations/qwiz_flags_find_errors_seed24.sql',import.meta.url),'utf8');
 const audit=readFileSync(new URL('./migrations/qwiz_flags_find_errors_audit.sql',import.meta.url),'utf8');
 assert.match(w,/\['errors','Поиск ошибок на флагах',true\]/);
 assert.match(w,/savedBeforeBoot=readPosition/);
 assert.match(w,/data-error-image/);
 assert.match(w,/solution\.error_kind='mislabeled'/);
 assert.match(stage,/qwiz-audio-preference-v1/);
 assert.match(stage,/victory:/);assert.match(stage,/jazz:/);assert.match(stage,/suspense:/);
 assert.match(stage,/uiIcon\(name\)/);
 assert.match(sql,/flag_mode/);assert.match(sql,/\'country\',\'picker\',\'colors\',\'symbols\',\'fragments\',\'errors\'/);
 assert.match(seed,/Expected 24 stage-6 questions/);assert.match(audit,/intentional_errors/);
});

test('Majority boost votes, host controls, and auto-advance are server-owned',()=>{
 const migration=readFileSync(new URL('./migrations/20261023_live_round_boost_votes.sql',import.meta.url),'utf8');
 const arcade=readFileSync(new URL('./arcade.js',import.meta.url),'utf8');
 const layout=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 for(const name of ['liveStart','livePause','liveNext','liveFinish','showRoomProjection','liveRoundStats'])
  assert.match(layout,new RegExp('id="'+name+'"'));
 assert.doesNotMatch(layout,/id="liveScreenMirror"/); // A duplicated projector iframe obstructed the host controls.
  assert.match(migration,/winner_votes<=total_members\/2/);
 assert.match(migration,/create or replace function public\.qwiz_tick/);
 assert.match(migration,/create or replace function public\.qwiz_vote_boost/);
 assert.match(migration,/qwiz_round_boost_apply/);
 assert.match(migration,/if r\.phase='intermission'/);
 assert.match(arcade,/data-boost-choice/);
 assert.match(arcade,/qwiz_vote_boost/);
 assert.match(host,/qwiz_party_control/);
 assert.doesNotMatch(arcade,/\.from\(['"]qwiz_boost_votes/);
});

test('Shared stage initializes in a browser-like environment without undefined references',()=>{
 const source=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const window={addEventListener(){}};const document={addEventListener(){}};
 assert.doesNotThrow(()=>runInNewContext(source,{window,document,Intl,Date,localStorage:{getItem:()=>null}}));
 const stage=window.QwizStage;
 assert.ok(stage,'QwizStage exported');
 assert.equal(stage.habitats.length,15);
 assert.ok(stage.icon({position:1,players:5,answered:2}).includes('habitats.svg#forest'));
 assert.ok(stage.icon({position:15,players:5,answered:2}).includes('habitats.svg#mangrove'));
 assert.ok(!stage.icon({position:1,players:5,answered:2}).includes('animals.svg'));
 const teamModule=readFileSync(new URL('./teams.js',import.meta.url),'utf8');
 assert.doesNotThrow(()=>runInNewContext(teamModule,{window,document,Intl,Date,localStorage:{getItem:()=>null}}));
 assert.ok(window.QwizTeams.avatar('fox').includes('data-animal="fox"'));
 assert.ok(window.QwizTeams.avatar('owl').includes('data-animal="owl"'));
 assert.equal(typeof stage.audio.stopMusic,'function');
});

test('Audience quick-join QR requires a verified active room and links to the student app',()=>{
 const html=readFileSync(new URL('./presenter.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 assert.match(js,/function setup\(\)/);
 assert.match(js,/qwiz_party_projection/);
 assert.match(js,/qwiz_audience_active_room/);
 assert.match(js,/paintQr\(\)/);
 assert.match(js,/qr\(\$\('projectionSetupQrImage'\)/);
 const discovery=readFileSync(new URL('./migrations/20261023_qwiz_audience_active_room.sql',import.meta.url),'utf8');
 assert.match(discovery,/r\.phase in \('lobby','countdown','question','result','intermission'\)/);
 assert.match(discovery,/revoke all on function public\.qwiz_audience_active_room/);
 assert.match(js,/function openJoinQr/);
 assert.match(js,/function link\(code\)/);
 assert.match(js,/new URL\('\.\/',location\.href\)/);
 assert.match(js,/sessionStorage\.setItem/);
 for(const id of ['projectionQrDialog','projectionQrZoom','projectionQrLink','projectionQrRoom','projectionQrCopy'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/projectionSetupQrOpen/);
 assert.match(css,/projection-setup-grid/);
 assert.doesNotMatch(js,/\.from\(['"]org_next_rooms/);
});

test('Studio game selector keeps full names, uses consistent icons and an accessible chevron',()=>{
 const layout=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const styles=readFileSync(new URL('./workspace.css',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const names=[
  ['data-geo="russia_map"','Карта регионов России'],
  ['data-arcade="blitz"','Блиц-консенсус'],
  ['data-arcade="tug"','Тап-баттл'],
  ['data-arcade="captain"','Дуэль капитанов'],
  ['data-arcade="sequence_memory"','Секретный код']
 ];
 for(const [attribute,title] of names){
  const button=layout.match(new RegExp('<button[^>]*'+attribute+'[^>]*>([^<]+)<\\/button>'));
  assert.ok(button,'The palette must contain '+title);
  assert.equal(button[1].trim(),title);
 }
 const labelExpression=host.match(/const label=(b\.textContent\.replace\(\/\\s\+\/g,' '\)\.trim\(\));/);
 assert.ok(labelExpression,'The button label must normalize whitespace without stripping words');
 for(const [,name] of names){
  assert.equal(runInNewContext(labelExpression[1],{b:{textContent:name}}),name);
 }
 assert.match(host,/const game=b\.closest\('#arcadePalette'\)/);
 assert.match(layout,/id="openGamesPalette"[^>]*aria-expanded="false"[^>]*>[^]*?<svg class="games-chevron"/);
 assert.match(styles,/#openGamesPalette\[aria-expanded=true\] \.games-chevron\{transform:rotate\(180deg\)\}/);
 assert.match(styles,/#arcadePalette \[data-arcade\],#arcadePalette \[data-geo\]\{/);
 assert.match(styles,/\.game-palette #arcadePalette button>span:last-child\{[^}]*overflow-wrap:break-word/);
 assert.match(styles,/@media\(max-width:520px\)\{\.game-palette #arcadePalette\{grid-template-columns:minmax\(0,1fr\)\}\}/);
});

test('Mini-game buttons keep complete labels and the disclosure uses a separate vector badge',()=>{
 const html=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const styles=readFileSync(new URL('./workspace.css',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const games=['Карта регионов России','Блиц-консенсус','Тап-баттл','Дуэль капитанов','Секретный код'];
 for(const label of games)assert.ok(html.includes('>'+label+'</button>'),'Missing game '+label);
 assert.match(host,/const label=b\.textContent\.replace\(\/\\s\+\/g,' '\)\.trim\(\)/);
 assert.match(html,/class="games-chevron-box" aria-hidden="true"/);
 assert.match(styles,/#openGamesPalette\[aria-expanded="true"\] \.games-chevron-box \.games-chevron/);
 assert.match(styles,/\.game-palette #arcadePalette\.arcade-palette button>span:last-child\{/);
 assert.match(styles,/white-space:normal;overflow:visible;text-overflow:clip/);
 assert.match(html,/workspace\.css\?v=[a-z0-9-]+/);
});

test('Participant entry omits public projector links and old copy-all-codes actions',()=>{
 const entry=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const projector=readFileSync(new URL('./presenter.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('./player-layout.css',import.meta.url),'utf8');
 assert.doesNotMatch(entry,/href="\.\/presenter\.html"/);
 assert.match(entry,/id="openPresenter"/);
 assert.match(entry,/id="openPresenterSide"/);
 assert.doesNotMatch(projector,/projectionCopyAllCodes|projectionCopyCodesDock|copy-codes\.js|copy-codes\.css/);
 assert.match(app,/lobby-signal-center/);
 assert.doesNotMatch(app,/lobby-play-mark/);
 assert.match(css,/\.game-lobby-wait \.lobby-signal-center\{/);
 assert.match(css,/@keyframes lobby-signal-illuminate/);
});

test('Correct flag is an actual flag image, not a textual stripe order',()=>{
 const source=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const start=source.indexOf(' function stripeOption(value){');
 const end=source.indexOf(' // The client does not choose the deadline',start);
 assert.ok(start>0&&end>start);
 const block=source.slice(start,end);
 const run=(question,answer)=>runInNewContext(block+'correctFlagMarkup(question,answer)',{
  question,answer,esc:String
 });
 const colours={kind:'flag',prompt:'В каком порядке расположены горизонтальные полосы на флаге государства «Венгрия»?',
   options:['белый — красный — зелёный','красный — зелёный — белый','красный — белый — зелёный']};
 const art=run(colours,{indices:[2],text:'красный — белый — зелёный'});
 assert.match(art,/flags-world\/hu\.svg/);
 assert.doesNotMatch(art,/красный — белый — зелёный/);
 const visual=run({kind:'flag',prompt:'Порядок полос',options:[
  {orientation:'horizontal',stripes:['#000000','#ffffff','#00ff00']}
 ]},{indices:[0],text:'строки'});
 assert.match(visual,/flag-stripe-art/);
 assert.match(visual,/#ffffff/);
 assert.equal(run({kind:'single',prompt:'Какой порядок?',options:['красный — белый — зелёный']},
   {indices:[0],text:'красный — белый — зелёный'}),'');
 const screen=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 assert.match(screen,/answerArt&&q\.kind==='flag'/);
 assert.match(screen,/const hideFiller=state\.phase==='result'&&q\.kind==='flag'/);
 assert.match(readFileSync(new URL('./index.html',import.meta.url),'utf8'),/stage\.js\?v=[a-z0-9-]+/);
 assert.match(readFileSync(new URL('./presenter.html',import.meta.url),'utf8'),/stage\.js\?v=[a-z0-9-]+/);
});

test('Projector keeps generic decoration out of text-only questions and preserves real media',()=>{
 const src=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 assert.match(src,/const hasVisual=Boolean\(q\.media_url\|\|q\.illustration_url/);
 assert.match(src,/\|\|!hasVisual\?'':QwizStage\.illustration/);
 assert.match(css,/figure\.question-frame figcaption\{/);
 assert.match(css,/max-height:none!important;overflow:visible!important/);
});

test('Round results expose large personal and team summaries before detailed lists',()=>{
 const player=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('./player-layout.css',import.meta.url),'utf8');
 assert.match(player,/round-self-summary/);
 assert.match(player,/myIndex=players\.findIndex/);
 assert.match(player,/teamIndex=rows\.findIndex/);
 assert.match(styles,/\.round-self-summary strong\{/);
 assert.match(readFileSync(new URL('./index.html',import.meta.url),'utf8'),/<script defer src="\.\/app\.js\?v=[a-z0-9-]+"><\/script>/);
});

test('QWIZ favicon is provided on all entry and moderator pages',()=>{
 const root=readFileSync(new URL('../favicon.svg',import.meta.url),'utf8');
 assert.match(root,/<svg /);
 assert.match(root,/qwiz-violet/);
 assert.match(root,/<circle/);
 for(const page of ['index.html','presenter.html','workspace.html','profile.html','question-preview.html']){
  const markup=readFileSync(new URL('./'+page,import.meta.url),'utf8');
  assert.match(markup,/rel="icon" type="image\/svg\+xml" href="\.\.\/favicon\.svg\?v=qwiz-2"/);
 }
 const legacy=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(legacy,/rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg\?v=qwiz-2"/);
});
test('Round editor opens mechanics by default with vector arrow and even selection outline',()=>{
 const markup=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('./workspace.css',import.meta.url),'utf8');
 assert.match(markup,/id="cardModesDetails" class="card-mode-details" open/);
 assert.match(markup,/class="card-modes-chevron"/);
 assert.doesNotMatch(markup,/<summary>Механики внутри темы <span/);
 assert.equal((script.match(/\$\('cardModesDetails'\)\.open=c\.type==='round'/g)||[]).length,2);
 assert.match(styles,/#roundCards \.round-card\.is-selected::before\{content:none\}/);
 assert.match(styles,/#cardModesDetails\[open\] \.card-modes-chevron/);
 assert.match(markup,/class="small-help card-order-explainer"/);
});


test('All builder mechanism cards share readable complete styling and semantic vector controls',()=>{
 const source=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('./workspace.css',import.meta.url),'utf8');
 const markup=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 for(const mode of ['russia_map','rocket','blitz','tug','captain']){
  assert.match(styles,new RegExp('data-mechanic="'+mode+'"'));
  assert.match(source,new RegExp(mode));
 }
 assert.match(source,/data-mechanic/);
 assert.match(source,/moveIconLeft/);
 assert.match(source,/moveIconRight/);
 assert.match(source,/arcadeGames\[c\.settings\?\.arcade_mode\]\?\.icon/);
 assert.match(source,/Анимированная заставка перед первым раундом/);
 assert.match(source,/Устаревшая карточка статистики/);
 assert.match(styles,/#roundCards \.round-card h3,/);
 assert.match(styles,/-webkit-line-clamp:unset;line-clamp:unset/);
 assert.match(styles,/min-height:max-content/);
 assert.match(styles,/#roundCards \.round-actions \.move-svg/);
 assert.match(markup,/workspace\.css\?v=[a-z0-9-]+/);
 assert.match(markup,/workspace\.js\?v=[a-z0-9-]+/);
});

test('Each card topic follows explicitly selected mechanics and never guesses a conflicting topic',()=>{
 const src=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 assert.match(src,/function synchronizeCardTopic\(card,\{defaultFlag=false\}=\{\}\)/);
 assert.match(src,/synchronizeCardTopic\(created,\{defaultFlag:true\}\)/);
 assert.match(src,/state\.cards\.filter\(c=>synchronizeCardTopic\(c\)\)/);
 assert.match(src,/flag_modes:flagQuestion\?selected:\[\]/);
 assert.match(src,/geo_modes:mapMode\?mapModes:\(ordinaryGeo\?geoSelected:\[\]\)/);
 assert.match(src,/if\(\(flags\|\|geo\)&&!topic\)throw Error/);
 assert.match(src,/select\.disabled=mapMode/);
 assert.match(src,/select\.required=card\.type==='round'&&!mapMode/);
 assert.match(html,/id="cardOtherTopicNote"/);
 const first=src.indexOf('function topicIdByName(name)');
 const last=src.indexOf('function ensureFinale()',first);
 assert.ok(first>0&&last>first);
 const state={topics:[{id:'flags',name:'Флаги мира'},{id:'russia',name:'География России'}]};
 const code=src.slice(first,last);
 const cases=[
  {type:'round',topic_id:null,settings:{flag_modes:['fragments','errors'],geo_modes:[]}},
  {type:'round',topic_id:null,settings:{flag_modes:[],geo_modes:['capital']}},
  {type:'round',topic_id:'flags',settings:{arcade_mode:'russia_map',geo_modes:['locate']}},
  {type:'round',topic_id:null,settings:{flag_modes:['country'],geo_modes:['district']}},
  {type:'round',topic_id:null,settings:{flag_modes:[],geo_modes:[]}},
  {type:'round',topic_id:'custom',settings:{flag_modes:['country']}}
 ];
 const result=runInNewContext(code+';({changes:cases.map(c=>synchronizeCardTopic(c)),ids:cases.map(c=>c.topic_id),newCard:card("round")})',
  {state,cases,buildDefaults:{count:5},titles:{round:'Раунд'},icons:{round:'▦'}});
 assert.deepEqual(Array.from(result.changes),[true,true,true,false,false,false]);
 assert.deepEqual(Array.from(result.ids),['flags','russia','russia',null,null,'custom']);
 assert.equal(result.newCard.topic_id,'flags');
 assert.equal(result.newCard.settings.flag_modes.length,0);
 assert.equal(result.newCard.settings.geo_modes.length,0);
});


test('Arcade timeline is enforced on both server tick passes and manual Next',()=>{
 const sql=readFileSync(new URL('./migrations/20261025_arcade_deadline_guards.sql',import.meta.url),'utf8');
 const tick=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.qwiz_tick'),sql.indexOf('CREATE OR REPLACE FUNCTION public.qwiz_advance_room'));
 const next=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.qwiz_advance_room'));
 const guard=/if clock_timestamp\(\)<a\.entered_at\+make_interval\(secs=>stage_seconds\) then return false;end if;/g;
 assert.equal((tick.match(guard)||[]).length>=2,true,'Two arcade deadline checks required');
 assert.match(tick,/public\.qwiz_arcade_duration\(a\.settings,a\.settings->>'arcade_mode'\)/);
 assert.match(next,/if v_active\.settings->>'arcade_mode' in \('rocket','blitz','tug','captain'\)/);
 assert.match(next,/Мини-игра ещё идёт/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/SET search_path TO ''/);
});
test('Geography mobile taps confirm immediately and correct region is enlarged',()=>{
 const src=readFileSync(new URL('./russia-geo.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('./russia-geo.css',import.meta.url),'utf8');
 const arcade=readFileSync(new URL('./arcade.js',import.meta.url),'utf8');
 assert.match(src,/function regionViewBox\(regionId\)/);
 assert.match(src,/function revealTarget\(t,selector\)/);
 assert.match(src,/const focusId=correctId\|\|/);
 assert.match(src,/t\.focusKey=focusKey;t\.zoomBox=focusBox/);
 assert.match(src,/e\.type==='pointercancel'\|\|!pointer/);
 assert.match(src,/confirm\.textContent='Проверяем…'/);
 assert.match(src,/b\.classList\.add\('geo-option-pending'\)/);
 assert.match(src,/t\.feedbackUntil=Date\.now\(\)\+Math\.min/);
 assert.match(styles,/\.geo-option-pending/);
 assert.match(styles,/\.geo-region\.geo-correct-answer/);
 assert.match(arcade,/setTimeout\(\(\)=>flush\(tr\),160\)/);
 assert.match(arcade,/data-arcade-tap disabled/);
 const begin=src.indexOf(' function regionViewBox(regionId)');
 const end=src.indexOf(' function revealTarget(t,selector)',begin);
 assert.ok(begin>0&&end>begin);
 const fn=src.slice(begin,end);
 const geo=[{id:'small',box:[220,120,12,9]},{id:'large',box:[100,50,430,250]}];
 const first=runInNewContext(fn+"regionViewBox('small')",{geometry:geo}).split(' ').map(Number);
 const second=runInNewContext(fn+"regionViewBox('large')",{geometry:geo}).split(' ').map(Number);
 assert.equal(first.length,4);
 assert.ok(first[2]>=135&&first[2]<300,'Small region must be magnified');
 assert.ok(second[2]<=960&&second[2]>first[2]);
 for(const rect of [first,second]){
  assert.ok(rect[0]>=0&&rect[1]>=0&&rect[2]>0&&rect[3]>0);
  assert.ok(rect[0]+rect[2]<=1120.01&&rect[1]+rect[3]<=480.01);
 }
 for(const name of ['index.html','presenter.html','workspace.html']){
  const page=readFileSync(new URL('./'+name,import.meta.url),'utf8');
  assert.match(page,/russia-geo\.js\?v=[a-zA-Z0-9_-]+/);
  assert.match(page,/russia-geo\.css\?v=[a-zA-Z0-9_-]+/);
  assert.match(page,/arcade\.js\?v=[a-zA-Z0-9_-]+/);
 }
});

test('Room preparation reuses a safe empty lobby and never enables unselected map modes',()=>{
 const sql=readFileSync(new URL('./migrations/20261025_mechanics_and_reused_lobby_fail_closed.sql',import.meta.url),'utf8');
 assert.match(sql,/Map modes must be selected explicitly/);
 assert.match(sql,/raise exception ''Для карты России выберите механики/);
 assert.match(sql,/jsonb_array_elements\(run\.tasks\) as old_task\(value\)/);
 assert.match(sql,/modes \? \(old_task\.value->>''mode''\)/);
 assert.match(sql,/Некорректная механика карты России/);
 assert.match(sql,/cardinality\(candidate\.neighbors\)>0/);
 assert.match(sql,/candidate\.flag is not null/);
 assert.match(sql,/Reuse the current unoccupied lobby regardless of build timestamp/);
 assert.match(sql,/UPDATE public\.org_next_quizzes quiz/);
 assert.match(sql,/UPDATE public\.qwiz_room_builds snapshot/);
 assert.match(sql,/Refresh only an/);
 assert.match(sql,/Reject stale compiled room timelines/);
 assert.match(sql,/v_stored_timeline is distinct from v_current->''timeline''/);
 assert.match(sql,/EXECUTE body/);
});

test('A room that never started cannot be finished by the host controls',()=>{
 const sql=readFileSync(new URL('./migrations/20261025_block_finish_in_lobby.sql',import.meta.url),'utf8');
 const client=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 assert.match(sql,/Prevent finishing a lobby that has never started/);
 assert.match(sql,/p_action='finish' and r.phase='lobby'/);
 assert.match(sql,/refusing unsafe patch/);
 assert.match(client,/\$\('liveFinish'\)\.disabled=\['lobby','finished'\]\.includes\(s\.phase\)/);
});


test('October 27 release: real flag assembly, source-scored questions, and no fake token shop',()=>{
 const stage=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const arcade=readFileSync(new URL('./arcade.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const scorer=readFileSync(new URL('./migrations/20261027_ten_point_question_scoring_and_flag_verdict.sql',import.meta.url),'utf8');
 const geo=readFileSync(new URL('./migrations/20261027_geo_ten_points_per_answer.sql',import.meta.url),'utf8');
 assert.match(stage,/function assemblyItems\(/);
 assert.match(stage,/data-assembly-slot/);
 assert.match(stage,/addEventListener\('pointerup'/);
 assert.match(stage,/function correctFlagMarkup\(/);
 assert.match(app,/QwizStage\.assemblyItems\(/);
 assert.match(app,/data-submit-rich disabled>ОК/);
 assert.match(app,/qwiz_my_question_result/);
 assert.match(app,/const drawing=QwizStage\.roundIconSvg\(icon/);
 assert.match(arcade,/classList\.add\('is-open','is-pending'\)/);
 assert.match(arcade,/Командные бонусы/);
 assert.doesNotMatch(arcade,/Командная мастерская|жетонов/);
 assert.match(scorer,/v_points:=case when v_correct then 10 else 0 end;/);
 assert.match(scorer,/set score=score\+10 where id=p\.team_id/);
 assert.match(geo,/v_award:=case when v_hit then 10 else 0 end;/);
});


test('October 27: Dino is unavailable and geography timer is per question',()=>{
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const studio=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const geo=readFileSync(new URL('./russia-geo.js',import.meta.url),'utf8');
 const sql=readFileSync(new URL('./migrations/20261027_geo_per_question_timing.sql',import.meta.url),'utf8');
 const dino=readFileSync(new URL('./migrations/20261027_remove_dino_builder.sql',import.meta.url),'utf8');
 const scoring=readFileSync(new URL('./migrations/20261027_fix_ambiguous_activity_and_integer_memory_scores.sql',import.meta.url),'utf8');
 assert.doesNotMatch(studio,/data-arcade="rocket"/);
 assert.match(host,/if\(arcadeMode==='rocket'\)return null/);
 assert.match(dino,/Дино-забег удалён из доступных игровых механик/);
 assert.match(sql,/qwiz_geo_question_seconds/);
 assert.match(sql,/v_per_question/);
 assert.match(sql,/p_answer:=NULL/);
 assert.match(geo,/document\.elementFromPoint\(e\.clientX,e\.clientY\)/);
 assert.match(scoring,/activity_vote\.room_id=v\.room_id/);
 assert.doesNotMatch(scoring,/100000::numeric/);
});


test('Arcade-only builds save and compile without a standard question round',()=>{
 const editor=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const migration=readFileSync(new URL('./migrations/20261027_arcade_only_build_compile_and_launch.sql',import.meta.url),'utf8');
 const helper=editor.match(/function validBuildActivity\(card\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(helper,'Arcade build validation helper exists');
 const canPlay=runInNewContext(helper+';validBuildActivity',Object.create(null));
 const card=(type,arcade_mode)=>({type,settings:{arcade_mode}});
 assert.equal([card('intro'),card('bonus','captain'),card('bonus','blitz'),card('finale')].some(canPlay),true);
 assert.equal([card('intro'),card('finale')].some(canPlay),false);
 assert.equal([card('intro'),card('bonus','rocket'),card('finale')].some(canPlay),false);
 assert.equal([card('round'),card('finale')].some(canPlay),true);
 assert.match(editor,/if\(!state\.cards\.some\(validBuildActivity\)\)/);
 assert.doesNotMatch(editor,/if\(!state\.cards\.some\(c=>c\.type==='round'\)\)/);
 assert.match(editor,/buildSaveNotice\('Сборка сохранена/);
 assert.match(html,/id="buildSaveNotice"/);
 assert.match(migration,/jsonb_array_elements\(v_timeline\)/);
 assert.match(migration,/('blitz','captain','tug','russia_map')/);
 assert.match(migration,/public\.qwiz_check_room_start/);
 assert.match(migration,/public\.qwiz_compile_build/);
});


test('Arcade-only room readiness aligns with server authorization and does not require bank questions',()=>{
 const js=readFileSync(new URL('./workspace-teams.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const sql=readFileSync(new URL('./migrations/20261027_room_state_arcade_only_launch_readiness.sql',import.meta.url),'utf8');
 assert.match(sql,/'has_arcade_round',exists\(/);
 assert.match(sql,/card->>'type' in \('round','bonus','duel'\)/);
 assert.match(sql,/card->'settings'->>'arcade_mode' in \('blitz','captain','tug'\)/);
 assert.match(js,/hasArcade=s\.has_arcade_round===true/);
 assert.match(js,/const ready=issues\.length===0&&\(hasQuestions\|\|hasGeography\|\|hasArcade\)/);
 assert.match(js,/const canStart=s\.phase==='lobby'&&ready&&hasPlayers&&waiting===0&&formed&&!teamUI\.busy/);
 assert.match(js,/Mini-игры|Мини-игры готовы/);
 assert.match(html,/id="liveStart"/);
});



test('Consensus regression: SQL alias never collides with arcade-run record',()=>{
 const sql=readFileSync(new URL('./migrations/20261027_fix_consensus_vote_alias_collision.sql',import.meta.url),'utf8');
 assert.match(sql,/SELECT cv\.choice INTO mine_choice FROM public\.qwiz_consensus_votes cv/);
 assert.doesNotMatch(sql,/SELECT v\.choice INTO mine_choice/);
 assert.match(sql,/SELECT count\(\*\) INTO votes_count FROM public\.qwiz_consensus_votes cv/);
 assert.match(sql,/v\.started_at/);
});

test('Legacy blitz intros are canonical and stats never reuse previous round card state',()=>{
 const intro=readFileSync(new URL('./migrations/20261027_fix_consensus_saved_intro_name.sql',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const stage=readFileSync(new URL('./stage.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('./player-layout.css',import.meta.url),'utf8');
 assert.match(intro,/game='blitz' THEN RETURN 'Блиц-консенсус'/);
 assert.match(app,/queued_settings\?\.arcade_mode/);
 assert.match(app,/const title=ARCADE_VISIBLE_NAMES\[mode\]/);
 assert.match(app,/const icon=mode==='blitz'\?'arcade_consensus'/);
 assert.match(stage,/key==='arcade_consensus'/);
 assert.match(app,/s\.activity\?\.settings\?\.round_card/);
 assert.match(app,/s\.round_results\?\.mode/);
 assert.match(app,/view\?\.mode==='blitz'\?/);
 assert.match(app,/view\?\.mode==='captain'\?/);
 assert.match(css,/\.round-results-next\{[\s\S]*?position:relative!important/);
 assert.match(css,/overflow-y:auto!important/);
});
