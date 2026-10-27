import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('PWA manifest is scoped to next/ and uses standalone mode',()=>{
 const m=JSON.parse(read('manifest.webmanifest'));
 assert.equal(m.display,'standalone');assert.equal(m.scope,'./');assert.equal(m.start_url,'./');
 assert.ok(m.icons.some(i=>i.type==='image/svg+xml'));
});
test('PWA is registered on every role and presentation route',()=>{
 for(const page of ['index.html','workspace.html','presenter.html','profile.html']){
  const html=read(page);assert.match(html,/rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html,/src="\.\/pwa\.js\?v=team-lab-recovery-20261028-3"/);
 }
 assert.match(read('pwa.js'),/navigator\.serviceWorker\.register\('\.\/sw\.js'/);
});
test('Offline shell caches public assets but never caches API/auth or submissions',()=>{
 const sw=read('sw.js');
 assert.doesNotThrow(()=>new Script(sw,{filename:'sw.js'}));
 assert.doesNotThrow(()=>new Script(read('pwa.js'),{filename:'pwa.js'}));
 assert.match(sw,/if\(req\.method!=='GET'\)return/);
 assert.match(sw,/if\(url\.origin!==self\.location\.origin\)return/);
 assert.match(sw,/if\(url\.pathname\.includes\('\/rest\/'\)/);
 assert.match(sw,/url\.pathname\.includes\('\/auth\/'\)/);
 assert.match(sw,/url\.pathname\.includes\('\/realtime\/'\)/);
 assert.match(sw,/if\(req\.mode==='navigate'\)/);
 assert.match(sw,/url\.pathname\+url\.search/);
 assert.match(sw,/No skipWaiting/);
 assert.doesNotMatch(sw,/clients\.claim\(/);
});
test('Connection recovery never locally accepts or submits answers',()=>{
 const pwa=read('pwa.js');
 assert.match(pwa,/отправка ответов временно невозможна/);
 assert.doesNotMatch(pwa,/rpc\(|fetch\(['"]https:\/\/bderfrcfuhnutuoyudje/);
});
