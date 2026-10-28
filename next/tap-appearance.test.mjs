import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const css=readFileSync(new URL('./arcade.css',import.meta.url),'utf8');
const arcade=readFileSync(new URL('./arcade.js',import.meta.url),'utf8');
const challenge=JSON.parse(readFileSync(new URL('./memory-challenges.plan.json',import.meta.url),'utf8'));

test('Official standalone memory game is Секретный код with thirty approved challenges',()=>{
 assert.equal(challenge.name,'Секретный код');
 assert.equal(challenge.displayName,'Секретный код');
 assert.equal(challenge.gameType,'standalone_arcade');
 assert.equal(challenge.levels.length,5);
 assert.equal(challenge.levels.reduce((n,level)=>n+level.items.length,0),30);
});
test('Enhanced Tap stage and tactile button use only existing CSS; game RPC and tap name stay intact',()=>{
 assert.match(css,/premium tactile Tap-battle/);
 assert.match(css,/\.arcade-player\[data-arcade-root="tug"\] \.arcade-tap-center::before\{/);
 assert.match(css,/\.arcade-player\[data-arcade-root="tug"\] \.arcade-tap-center::after\{/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/touch-action:none/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(arcade,/tug:\{title:'Тап-баттл'[^\n]*cta:'ТАП!'/);
 assert.match(arcade,/function tap\(tr\)/);
 assert.match(arcade,/function flush\(tr\)/);
 assert.match(arcade,/qwiz_arcade_tap_once/);
});
for(const page of ['index.html','presenter.html','workspace.html','arcade-qa-fixture.html']){
 test('Tap stylesheet cache updated on '+page,()=>{
  const html=readFileSync(new URL('./'+page,import.meta.url),'utf8');
  assert.match(html,/arcade\.css\?v=secret-code-live-20261028-1/);
 });
}
