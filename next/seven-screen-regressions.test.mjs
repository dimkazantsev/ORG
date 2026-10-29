import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('Projector flag assembly exposes colour key but never the solution order',()=>{
 const js=read('./presenter.js'),css=read('./presenter.css');
 new Script(js);
 assert.match(js,/function projectionAssemblyPalette\(/);
 assert.match(js,/localeCompare\(b,'ru'\)/);
 assert.match(js,/белый:'#55515f'/);
 assert.match(js,/q\.flag_assembly\?projectionAssemblyPalette\(q\)/);
 assert.match(js,/explanation&&!q\.flag_assembly/);
 assert.match(js,/answerArt&&\(q\.kind==='flag'\|\|q\.flag_assembly\)/);
 assert.match(css,/\.projection-assembly-colors\{/);
 assert.match(css,/\.projection-assembly-color strong\{/);
});
test('Projector Blitz prioritizes voting and hides decorative poster',()=>{
 const css=read('./arcade.css');
 assert.match(css,/arcade-projection\[data-arcade-root="blitz"\] \.arcade-scene\{\s*display:none!important/);
 assert.match(css,/arcade-projection\[data-arcade-root="blitz"\] \.consensus-question/);
 assert.match(css,/arcade-projection\[data-arcade-root="blitz"\] \.consensus-progress/);
});
test('Phone results show leaders and own position without full-length lists',()=>{
 const app=read('./app.js'),css=read('./player-layout.css');
 new Script(app);
 assert.match(app,/\['tug','rocket','captain','blitz','sequence_memory'\]/);
 assert.match(app,/mobile\?a\.map\(\(_,i\)=>i\)\.slice\(0,3\)/);
 assert.match(app,/if\(mobile&&ownIndex>=3\)indices\.push\(ownIndex\)/);
 assert.match(css,/\.round-results-grid\{[\s\S]*?grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.round-score-list li\.is-mine/);
});
test('Geography reserves media slot and highlights only correct answer on submission or timeout',()=>{
 const geo=read('./russia-geo.js'),css=read('./russia-geo.css');
 new Script(geo);
 assert.match(geo,/geo-visual-slot is-/);
 assert.match(geo,/geo-options'\+\(feedbackActive\?' is-revealed'/);
 assert.match(geo,/const css=right\?'geo-option-correct':''/);
 assert.doesNotMatch(geo,/const css=right\?'geo-option-correct':wrong\?/);
 assert.match(geo,/data\.timed_out===true/);
 assert.match(css,/\.geo-options\.is-revealed \.geo-option-correct/);
 assert.match(css,/\.geo-visual-slot \.geo-silhouette/);
 assert.match(css,/\.geo-visual-slot \.geo-flag/);
});
test('Backend migrations are checked by rollback-only integration tests',()=>{
 const secret=read('./migrations/20261029_secret_code_ambiguous_n.sql');
 const geo=read('./migrations/20261029_geo_reveal_expired_correct_option.sql');
 assert.match(secret,/WHERE sc\.n=selected/);
 assert.match(geo,/v_timed_out boolean:=false/);
 assert.match(geo,/'timed_out',v_timed_out/);
 for(const path of ['./migrations/qa_secret_code_ambiguous_n_rollback.sql',
                    './migrations/qa_geo_expired_correct_rollback.sql']){
  const sql=read(path);
  assert.match(sql,/(?:^|\\n)BEGIN;/);
  assert.match(sql,/ROLLBACK;\s*$/);
 }
});
test('UI asset cache revisions and permanent rules are published together',()=>{
 const index=read('./index.html'),presenter=read('./presenter.html'),
  workspace=read('./workspace.html'),sw=read('./sw.js');
 for(const page of [index,presenter,workspace]){
  assert.match(page,/russia-geo\.js\?v=seven-fixes-20261029-1/);
  assert.match(page,/arcade\.css\?v=seven-fixes-20261029-1/);
 }
 assert.match(index,/app\.js\?v=seven-fixes-20261029-1/);
 assert.match(index,/player-layout\.css\?v=seven-fixes-20261029-1/);
 assert.match(presenter,/presenter\.css\?v=seven-fixes-20261029-1/);
 assert.match(sw,/qwiz-pwa-shell-20261029-v50/);
 assert.match(read('./PROJECT_RULES.md'),/Подтверждённые правила визуализации ответов/);
});
