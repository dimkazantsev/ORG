import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';

const markup=readFileSync(new URL('./presenter.html',import.meta.url),'utf8');
const script=readFileSync(new URL('./copy-codes.js',import.meta.url),'utf8');
const css=readFileSync(new URL('./copy-codes.css',import.meta.url),'utf8');

function mount({room='A1B2C3D4',state={}}={}){
 const handlers={};
 const button={addEventListener(event,fn){handlers[event]=fn;}};
 const dock={hidden:true},status={hidden:true,textContent:''};
 const elements={projectionCopyAllCodes:button,projectionCopyCodesDock:dock,projectionCopyCodesStatus:status};
 let copied='';
 const context={
  URL,URLSearchParams,
  location:{search:room?'?room='+room:'',href:'https://example.test/ORG/next/presenter.html'+(room?'?room='+room:'')},
  document:{getElementById(id){return elements[id];}},
  navigator:{clipboard:{async writeText(value){copied=value;}}},
  ctx:{last:state}
 };
 runInNewContext(script,context);
 return {dock,status,click:handlers.click,copied:()=>copied};
}
test('The copy-all-codes button is outside the hidden projection footer',()=>{
 assert.match(markup,/id="projectionCopyAllCodes"/);
 assert.match(markup,/copy-codes\.js\?v=/);
 assert.match(markup,/copy-codes\.css\?v=/);
 assert.ok(markup.indexOf('projectionCopyCodesDock')<markup.indexOf('<footer'));
 assert.match(css,/\.projection-copy-codes-dock\{position:fixed/);
 assert.match(css,/\.projection-copy-codes-dock\[hidden\]/);
});
test('Copy all public room and team codes without any answer or player data',async()=>{
 const t='123e4567-e89b-12d3-a456-426614174000';
 const view=mount({state:{
  code:'A1B2C3D4',
  lobby_teams:[{id:t,name:'Команда № 1'}],
  answer:{text:'Секретный ответ'},
  players:[{name:'Личные сведения'}]
 }});
 assert.equal(view.dock.hidden,false);
 await view.click();
 assert.match(view.copied(),/Код комнаты: A1B2C3D4/);
 assert.match(view.copied(),/Команда № 1/);
 assert.match(view.copied(),/team=123e4567-e89b-12d3-a456-426614174000/);
 assert.doesNotMatch(view.copied(),/Секретный ответ|Личные сведения/);
 assert.equal(view.status.hidden,false);
});
test('Copy button remains hidden until a valid room code exists',()=>{
 assert.equal(mount({room:''}).dock.hidden,true);
 assert.equal(mount({room:'NOT-A-CODE'}).dock.hidden,true);
});
test('When room data has not arrived, report it instead of copying stale data',async()=>{
 const view=mount({room:'A1B2C3D4',state:null});
 await view.click();
 assert.equal(view.copied(),'');
 assert.match(view.status.textContent,/ещё не загружены/);
});
