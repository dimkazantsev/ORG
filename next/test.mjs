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
 assert.match(css,/@media\s*\(max-width:570px\)/);
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
 assert.match(presenterJs,/org_next_presenter_state/);
 assert.doesNotMatch(presenterHtml,/teacher|hostStart|hostReveal|hostFinish/);
 assert.match(presenterCss,/projection-option/);
 const upgrade=readFileSync(new URL('./migrations/20261022_qwiz_party_projection.sql',import.meta.url),'utf8');
 assert.match(upgrade,/p_teams not between 1 and 15/);
 assert.match(upgrade,/check\(position between 1 and 15\)/);
 assert.match(upgrade,/v_question := v_question - 'correct' - 'explanation'/);
 assert.match(upgrade,/for update/);
});
