const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {rows,geography}=require('./scripts/build-flags-six.cjs');
const d3=require('../lib/d3.v7.min.js');
test('Active flag pilots exclude retired memory questions and have verified assets',()=>{
 assert.equal(rows.length,68);assert.equal(new Set(rows.map(x=>x.id)).size,68);
 assert.ok(rows.every(q=>q.mode!=='memory'),'Flag memory was retired into a standalone arcade concept');
 for(const q of rows){
  if(q.kind==='flag')assert.ok(Number.isInteger(q.solution.correct)&&q.solution.correct>=0&&q.solution.correct<q.options.length,q.id);
  if(q.kind==='multi'){assert.equal(new Set(q.solution.correct_indices).size,2);assert.ok(q.options.every(x=>Object.keys(x).join()==='image_url'))}
  if(q.kind==='order'){assert.equal(q.options.length,3);assert.equal(new Set(q.options).size,3);assert.deepEqual(Object.keys(q.solution.flag_assembly.colors).sort(),q.options.slice().sort())}
  for(const url of [...q.options.map(x=>x.image_url).filter(Boolean),q.solution.media_url].filter(Boolean)){
   assert.ok(url.startsWith('https://dimkazantsev.github.io/ORG/next/'));
   assert.ok(fs.existsSync(__dirname+'/'+url.split('/next/')[1]),q.id+' missing '+url);
  }
  assert.ok(q.solution.source_urls.every(url=>url.startsWith('https://')));
 }
});
test('Map outlines retain real source geometries and occupy less than one hemisphere',()=>{
 assert.equal(geography.features.length,12);assert.match(geography.source_commit,/^[a-f0-9]{40}$/);
 for(const feature of geography.features){const area=d3.geoArea(feature);assert.ok(area>0&&area<2*Math.PI,feature.properties.iso2+' winding');}
});
