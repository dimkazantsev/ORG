import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Secret Code is permitted by the persisted arcade run mode constraint',()=>{
 const migration=read('./migrations/20261029_allow_secret_code_arcade_mode.sql');
 assert.match(migration,/DROP CONSTRAINT qwiz_arcade_runs_mode_check/);
 assert.match(migration,/ADD CONSTRAINT qwiz_arcade_runs_mode_check/);
 for(const mode of ['rocket','blitz','tug','captain','sequence_memory'])
  assert.match(migration,new RegExp("'"+mode+"'"));
});

test('Bonus voting uses a separate top layer instead of a clipped arcade scene',()=>{
 const script=read('./arcade.js');
 new Script(script);
 assert.match(script,/document\.createElement\('dialog'\)/);
 assert.match(script,/document\.body\.append\(voteDialog\)/);
 assert.match(script,/tr\.voteDialog\.showModal\(\)/);
 assert.match(script,/tr\.voteDialog\.close\(\)/);
 assert.match(script,/tr\.voteDialog\.remove\(\)/);
 assert.match(script,/voteDialog\.addEventListener\('click'/);
 assert.match(script,/voteBoost\(tr,choice\.dataset\.boostChoice\)/);
 const css=read('./player-layout.css');
 assert.match(css,/\.arcade-boost-dialog\[open\]\{display:flex/);
 assert.match(css,/height:min\(455px,calc\(100dvh - 24px\)\)/);
 assert.match(css,/\.arcade-boost-dialog \.arcade-boost-grid\{/);
 assert.match(css,/grid-auto-rows:minmax\(0,1fr\)/);
});

test('Geography puts zoom buttons and confirmation inside the mobile viewport',()=>{
 const css=read('./player-layout.css');
 const geo=read('./russia-geo.js');
 new Script(geo);
 assert.match(css,/game-card:has\(\.geo-game\)\{[\s\S]*?overflow:hidden!important/);
 assert.match(css,/\.geo-map-frame\{[\s\S]*?flex:1 1 auto/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) minmax\(0,1\.5fr\)/);
 assert.match(css,/\.geo-confirm\{[\s\S]*?visibility:visible!important/);
 assert.match(geo,/!t\.selectedRegion\|\|feedbackActive\|\|t\.busy\?'disabled':''/);
 assert.doesNotMatch(geo,/button\.hidden=false/);
 assert.doesNotMatch(geo,/confirmRevealed/);
 assert.match(geo,/Коснитесь региона и подтвердите выбор/);
 assert.match(geo,/document\.documentElement\.classList\.contains\('player-compact'\)\)return/);
});

test('All game screens receive the new arcade and geography scripts; PWA is bumped',()=>{
 for(const file of ['index.html','presenter.html','workspace.html']){
  const html=read('./'+file);
  assert.match(html,/arcade\.js\?v=bonus-modal-20261029-1/);
  assert.match(html,/russia-geo\.js\?v=geo-confirm-stable-20261029-1/);
 }
 assert.match(read('./index.html'),/player-layout\.css\?v=viewport-confirm-20261029-1/);
 assert.match(read('./sw.js'),/qwiz-pwa-shell-20261029-v49/);
 assert.match(read('./PROJECT_RULES.md'),/Обязательное размещение игрового интерфейса в границах мобильного экрана/);
});
