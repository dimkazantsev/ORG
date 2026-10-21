import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('./app.css',import.meta.url),'utf8');
const js=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('./migration.sql',import.meta.url),'utf8');
test('New JavaScript parses independently of legacy app.js',()=>{assert.doesNotThrow(()=>new Function(js));assert.doesNotMatch(html,/\.\/\.\.\/(app\.js|styles\.css)/)});
test('All direct DOM IDs referenced by client exist in HTML',()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 const refs=new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(x=>x[1]));
 for(const ref of refs)assert.ok(ids.has(ref),'Missing #'+ref);
});
test('Client never directly reads answer keys or core tables',()=>{
 assert.doesNotMatch(js,/\.from\(['"]org_next_/);
 assert.doesNotMatch(js,/\bquiz_private\b/);
 assert.match(js,/org_next_answer/);
 assert.match(js,/org_next_state/);
 assert.match(js,/org_next_advance/);
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
 assert.match(js,/await rpc\('org_next_answer'/);
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
 assert.match(presenterJs,/qwiz_public_screen/);
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
 assert.ok(Buffer.byteLength(css,'utf8')<23000,'CSS exceeds single sheet budget');
 assert.match(js,/qrCache/);
});


test('Teacher studio, profile, and public screen parse as independent applications',()=>{
 for(const name of ['workspace','profile','presenter']){
  const html=readFileSync(new URL('./'+name+'.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('./'+name+'.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('./'+name+'.css',import.meta.url),'utf8');
  assert.doesNotThrow(()=>new Function(js),'Invalid '+name+'.js');
  assert.ok(html.length>2000&&css.length>1000);
  assert.match(html,/QWIZ-PARTY/);
  assert.match(css,/@media\(/);
 }
});
test('Library separates bank from round builds and charts',()=>{
 const h=readFileSync(new URL('./workspace.html',import.meta.url),'utf8');
 const j=readFileSync(new URL('./workspace.js',import.meta.url),'utf8');
 for(const id of ['bankPage','builderPage','roomsPage','insightsPage','roundCards','questionDialog','cardDialog','studentChart','hostRoomList','liveConsole'])
  assert.match(h,new RegExp('id="'+id+'"'));
 for(const api of ['qwiz_studio','qwiz_launch_build','qwiz_host_rooms','qwiz_teacher_stats'])
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
