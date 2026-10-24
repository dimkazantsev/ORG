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
   renderCards(){renders++},
   msg(id,text){announced=text},
   motionPreference:{matches:true},
   $(id){assert.equal(id,'roundCards');return {querySelector(){return {scrollIntoView(){},focus(){}}}}}
 };
 runInNewContext(host.slice(start,end)+'duplicateCard(0);',context);
 assert.equal(cards.length,3);
 assert.equal(cards[1].title,'Флаги — копия');
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
 for(const mode of ['rocket','blitz','tug','captain']){
   assert.match(workspace,new RegExp("arcade_"+mode+":'<path|arcade_"+mode+":'<circle"));
   assert.match(palette,new RegExp('data-arcade="'+mode+'"'));
 }
 assert.match(workspace,/arcade-palette-icon/);
 assert.match(workspace,/cardIconSvg\(c\.type,c\.icon\)/);
 assert.match(styles,/#arcadePalette \.arcade-palette-icon svg/);
 assert.match(palette,/workspace\.js\?v=[a-zA-Z0-9_-]+/);
 assert.match(palette,/workspace\.css\?v=[a-zA-Z0-9_-]+/);
});
test('Public projector never includes options or answer keys and host previews three server-scoped slides',()=>{
 const presenter=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const host=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const layout=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const sql=readFileSync(new URL('./migrations/20261024_public_projector_hide_answers.sql',import.meta.url),'utf8');
 const deck=readFileSync(new URL('./migrations/20261024_host_three_slide_deck.sql',import.meta.url),'utf8');
 assert.match(layout,/id="moderatorSlides"/);
 assert.match(host,/qwiz_host_slide_deck/);
 assert.match(deck,/owner_id<>\(SELECT auth.uid\(\)\)/);
 assert.match(sql,/s:=s-''answer''/);
 assert.doesNotMatch(presenter.slice(presenter.indexOf('function questionScene('),presenter.indexOf('function render(state)')),/projection-options|projection-option\(/);
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
 assert.match(html,/presenter\.css\?v=round-sequence-20261025-5/);
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
 assert.match(shared,/function updateMemory\(root,s,offset=0\)\{return;/);
 assert.match(projection,/const frame=selectingFlag\?'':QwizStage\.illustration\(q,state\.phase==='result'\?state\.answer:null\)/);
 assert.doesNotMatch(projection.slice(projection.indexOf('function questionScene('),projection.indexOf('function applyProjectionSettings(')),/projection-options/);
 assert.match(app,/result-flag-image/);
 assert.match(app,/s\.answer\.image_url/);
 assert.match(workspace,/moderator-option-flag/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.qwiz_flag_memory_view/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.qwiz_answer_display/);
 assert.match(migration,/'image_url',image_url/);
});
test('Projector reveals correct flags and answer choices only in server result phase',()=>{
 const presenter=readFileSync(new URL('./presenter.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('./presenter.css',import.meta.url),'utf8');
 const migration=readFileSync(new URL('./migrations/20261024_public_projector_reveal_after_answer.sql',import.meta.url),'utf8');
 const start=presenter.indexOf('function questionScene(state){');
 const end=presenter.indexOf('function applyProjectionSettings(settings)',start);
 assert.ok(start>=0&&end>start);
 const scene=presenter.slice(start,end);
 assert.match(scene,/const finished=state\.phase==='result'&&!!state\.answer/);
 assert.match(scene,/const choices=finished&&Array\.isArray\(q\.options\)/);
 assert.match(scene,/correctIndices\.includes\(i\)/);
 assert.match(scene,/projectionOption\(option,i\)/);
 assert.match(scene,/projection-answer-heading/);
 assert.match(scene,/projection-answer-explanation/);
 assert.match(scene,/projection-reveal-option/);
 assert.match(css,/\.projection-reveal-options\.has-flag-options/);
 assert.match(css,/\.projection-reveal-option\.is-correct/);
 assert.match(migration,/IF s->>'phase' = 'result' THEN/);
 assert.match(migration,/s:=s-'answer'/);
 assert.match(migration,/'options'::text/);
 assert.match(migration,/'solution'::text/);
});
test('Moderator slide cards shrink to content and do not reserve blank height',()=>{
 const css=readFileSync(new URL('./workspace.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const compact=css.slice(css.lastIndexOf('/* Compact moderator timeline:'));
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
 assert.match(teams,/!replay&&/);
 assert.match(host,/QwizStage\.iconLabel\(\$\('liveStart'\)/);
 assert.match(host,/qwiz_repeat_finished_room/);
 assert.match(page,/id="liveControlsHint"/);
 assert.match(page,/workspace-teams\.js\?v=avatar-3d-20261024-16/);
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
   illustration:()=>'<div class="fixture-filler-art">Not a real flag</div>',
   clockMarkup:()=>'<div>12 sec</div>',
   correctFlagMarkup:()=>'<div class="fixture-correct-flag">Flag</div>'
  }
 };
 const prompt='Выберите флаг государства «Ангола».';
 const question={prompt,options:[{label:'A'},{label:'B'},{label:'C'},{label:'D'}]};
 const lobby=runInNewContext(scene+'questionScene({question,phase:"question",index:0,total:10,teams:[]})',{...context,question});
 assert.doesNotMatch(lobby,/fixture-filler-art/);
 assert.doesNotMatch(lobby,/fixture-flag/);
 const result=runInNewContext(scene+'questionScene({question,phase:"result",index:0,total:10,answer:{indices:[1],text:"Ангола"},teams:[]})',{...context,question});
 assert.match(result,/fixture-correct-flag/);
 assert.equal((result.match(/fixture-flag/g)||[]).length,4);
 assert.match(result,/is-correct/);
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
 for(const key of ['round','flag','map','arcade_rocket','arcade_blitz','arcade_tug','arcade_captain','intro','finale']){
  assert.match(stage,new RegExp(key+":'<"),'Missing round artwork for '+key);
 }
 assert.match(stage,/function roundIconSvg\(key\)/);
 assert.match(phone,/const drawing=QwizStage\.roundIconSvg\(icon/);
 assert.match(projector,/const art=QwizStage\.roundIconSvg\(icon\)/);
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
 for(const id of ['openGamesPalette','generalLeadSeconds','generalStatsSeconds','generalBonusPercent','generalBonusLead','hostProjectorMusic'])assert.match(studio,new RegExp('id="'+id+'"'));
 for(const type of ['Вступление','Вопросы','Игры','Финал'])assert.match(studio,new RegExp(type));
 for(const obsolete of ['data-card="team_stats"','data-card="player_stats"','data-card="bonus"'])assert.doesNotMatch(studio,obsolete);
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
 assert.match(html,/<option>15<\/option>/);
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
  'Похожие флаги','Сборка флага','Несколько правильных ответов','Задания на память',
  'География и карты','История и символика'])assert.ok(w.includes(name),name);
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

test('Flags subcategories are a metadata filter, not duplicated topic tables',()=>{
 const w=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 const h=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const migration=readFileSync(new URL('./migrations/qwiz_flags_mechanics_round_selection.sql',import.meta.url),'utf8');
 const seed=readFileSync(new URL('./migrations/qwiz_flags_seed_first_40_verified.sql',import.meta.url),'utf8');
 assert.match(h,/id="bankMode"/);
 assert.match(h,/id="cardModesDetails"/);
 assert.match(w,/data-card-mode/);
 assert.match(w,/flag_modes:selected.length===flagModes\.filter\(x=>x\[2\]\)\.length/);
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
