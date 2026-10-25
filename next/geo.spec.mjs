import {test,expect} from '@playwright/test';
const HOME='http://127.0.0.1:8080/next/';
function topology(){
 const geometries=Array.from({length:89},(_,i)=>({type:'Polygon',arcs:[[i]],properties:{id:'region-'+i,name_full:'Субъект '+i,clon:50+i*.3,clat:60}}));
 return {type:'Topology',transform:{scale:[.02,.02],translate:[45,50]},objects:{ru89:{type:'GeometryCollection',geometries}},
  arcs:Array.from({length:89},(_,i)=>[[(i%15)*150,Math.floor(i/15)*150],[100,0],[0,100],[-100,0]])};
}
test('Russia personal round loads 89 clickable geometries, accepts answer and resumes progress',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),signInAnonymously:async()=>({data:{session:{}},error:null})},rpc:async()=>({data:{registered:false},error:null})})};'}));
 await page.route('**/data/regions.topojson',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(topology())}));
 await page.setViewportSize({width:390,height:844});
 await page.goto(HOME);
 await expect.poll(()=>page.evaluate(()=>!!window.QwizGeo)).toBe(true);
 await page.evaluate(()=>{
  const host=document.createElement('div');host.id='geoBrowserTest';document.body.appendChild(host);
  window.geoFixture={index:0};
  const client={rpc:async(name,args)=>{
   if(name!=='qwiz_geo_play')throw Error('Wrong RPC');
   if(args.p_answer!==null){window.geoFixture.index++;}
   const index=window.geoFixture.index;
   return {data:{active:true,open:true,remaining:120-index*10,index,total:3,score:index*100,correct:index,
    last_correct:args.p_answer!==null?true:null,
    question:{mode:'locate',name:'Субъект 1',region:'region-1',options:[]}},error:null};
  }};
  window.QwizGeo.mountPlayer(host,{code:'A1B2C3D4',room_id:'00000000-0000-4000-8000-000000000123',
    phase:'intermission',activity:{settings:{arcade_mode:'russia_map'}}},{client});
 });
 await expect(page.locator('#geoBrowserTest .geo-map-svg .geo-region')).toHaveCount(89);
 await expect(page.locator('#geoBrowserTest .geo-game h2')).toContainText('Найдите на карте');
 await page.locator('#geoBrowserTest [data-region="region-1"]').first().click();
 await expect(page.locator('#geoBrowserTest .geo-region.geo-selected')).toHaveCount(1);
 await expect(page.locator('#geoBrowserTest .geo-header strong')).toContainText('0 / 3');
 await expect(page.locator('#geoBrowserTest [data-geo-confirm]')).toBeEnabled();
 await page.locator('#geoBrowserTest [data-geo-confirm]').click();
 await expect(page.locator('#geoBrowserTest .geo-header strong')).toContainText('1 / 3');
 await page.locator('#geoBrowserTest [data-geo-zoom="in"]').click();
 const zoom=await page.locator('#geoBrowserTest .geo-map-svg').getAttribute('viewBox');
 expect(zoom).not.toBe('0 0 1120 480');
 // Touch drag changes the visible map area; two touches also alter zoom level.
 const gestures=await page.evaluate(()=>{
  const svg=document.querySelector('#geoBrowserTest .geo-map-frame .geo-map-svg');
  const before=svg.getAttribute('viewBox');
  const p=(type,id,x,y)=>svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'touch',clientX:x,clientY:y}));
  p('pointerdown',1,110,220);p('pointermove',1,155,220);p('pointerup',1,155,220);
  const afterPan=svg.getAttribute('viewBox');
  p('pointerdown',1,110,220);p('pointerdown',2,200,220);p('pointermove',2,260,220);
  const afterPinch=svg.getAttribute('viewBox');p('pointerup',1,110,220);p('pointerup',2,260,220);
  return {before,afterPan,afterPinch};
 });
 expect(gestures.afterPan).not.toBe(gestures.before);
 expect(gestures.afterPinch).not.toBe(gestures.afterPan);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 expect(overflow).toBeLessThanOrEqual(2);
});
test('Projector displays geography theme and group metrics but not student answers',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({rpc:async()=>({data:null,error:null})})};'}));
 await page.goto(HOME+'presenter.html');
 await page.evaluate(()=>{
  const el=document.createElement('div');el.id='geoPublicTest';document.body.append(el);
  const client={rpc:async()=>({data:{active:true,count:15,players:30,answered:120,remaining:87},error:null})};
  window.QwizGeo.mountProjector(el,{phase:'intermission',code:'ABCDEF12',activity:{title:'Карта России',
    settings:{arcade_mode:'russia_map'}}},client);
 });
 await expect(page.locator('#geoPublicTest h1')).toHaveText('Карта России');
 await expect(page.locator('#geoProjCount')).toHaveText('15');
 await expect(page.locator('#geoProjPlayers')).toHaveText('30');
 await expect(page.locator('#geoPublicTest [data-geo-answer]')).toHaveCount(0);
});
test('Geography Russia question round has eight mechanics and teacher-owned topic',async({page})=>{
 await page.goto(HOME+'workspace.html');
 await page.locator('[data-section="builder"]').click();
 await page.evaluate(()=>{state.topics.push({id:'00000000-0000-4000-8000-000000001234',name:'География России',category:'География'});updateSelectors()});
 await page.locator('#newBuild').click();
 await page.locator('#openGamesPalette').click();
 await expect(page.locator('#gamesPalette')).toBeVisible();
 await page.locator('#arcadePalette [data-geo="russia_map"]').click();
 await expect(page.locator('#roundCards .round-card[data-type="round"]')).toHaveCount(2);
 await page.locator('#roundCards [data-index="2"] [data-edit-card]').click();
 await expect(page.locator('#cardGeoSettings')).toBeVisible();
 await expect(page.locator('#cardGeoModes input:not(:disabled)')).toHaveCount(8);
 await expect(page.locator('#cardGeoModes [value="coat"]')).toBeDisabled();
 await expect(page.locator('#cardGeoCount')).toHaveValue('15');
 await expect(page.locator('#cardGeoModes input:checked')).toHaveCount(0);
 await page.locator('#cardGeoModes [value="locate"]').check();
 await page.locator('#cardGeoCount').fill('27');
 await page.locator('#cardForm button[type="submit"]').click();
 await expect(page.locator('#roundCards [data-index="2"]')).toContainText('27 случайных субъектов');
 await expect(page.locator('#cardGeoSettings')).toBeHidden();
});


test('Geography textual choice reveals the correct answer in green and a wrong selection in red',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};'}));
 await page.setViewportSize({width:390,height:720});
 await page.goto(HOME);
 await page.evaluate(()=>{
  const host=document.createElement('div');host.id='geoAnswerColors';document.body.appendChild(host);
  const q={mode:'capital',name:'Тестовая область',options:[{id:'correct',text:'Барнаул'},{id:'wrong',text:'Новосибирск'}]};
  const client={rpc:async(name,args)=>{
   if(name!=='qwiz_geo_play')throw Error('Unexpected method');
   const answered=args.p_answer!==null;
   return {data:{active:true,open:true,remaining:90,index:answered?1:0,total:5,score:0,correct:0,
    last_correct:answered?false:null,last_answer:answered?{correct:false,correct_text:'Барнаул'}:null,
    question:q},error:null};
  }};
  QwizGeo.mountPlayer(host,{code:'AAAABBBB',room_id:'00000000-0000-4000-8000-000000000333',
   phase:'intermission',activity:{settings:{arcade_mode:'russia_map'}}},{client});
 });
 await expect(page.locator('#geoAnswerColors [data-geo-answer]')).toHaveCount(2);
 await page.locator('#geoAnswerColors [data-geo-answer="wrong"]').click();
 await expect(page.locator('#geoAnswerColors [data-geo-answer="correct"]')).toHaveClass(/geo-option-correct/);
 await expect(page.locator('#geoAnswerColors [data-geo-answer="wrong"]')).toHaveClass(/geo-option-wrong/);
 await expect(page.locator('#geoAnswerColors [data-geo-answer="correct"]')).toBeDisabled();
 await expect(page.locator('#geoAnswerColors [data-geo-answer="correct"]')).toContainText('✓');
 const paint=await page.locator('#geoAnswerColors [data-geo-answer="correct"]').evaluate(el=>getComputedStyle(el).backgroundColor);
 expect(paint).toBe('rgb(229, 247, 237)');
});


test('One region touch exposes confirm; server correct region appears highlighted before next question',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{registered:false},error:null})})};'}));
 await page.route('**/data/regions.topojson',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(topology())}));
 await page.setViewportSize({width:390,height:844});
 await page.goto(HOME);
 await page.evaluate(()=>{
  const el=document.createElement('div');el.id='geoTapConfirm';document.body.append(el);
  let answerCount=0;
  const client={rpc:async(name,args)=>{
   if(name!=='qwiz_geo_play')throw Error('Unexpected RPC');
   if(args.p_answer!==null)answerCount++;
   return {error:null,data:{active:true,open:true,remaining:95,index:answerCount,total:3,score:0,correct:0,
    question:{mode:'locate',name:answerCount?'Субъект 2':'Субъект 1',region:answerCount?'region-2':'region-1',options:[]},
    last_answer:answerCount?{correct:false,correct_text:'Субъект 1',correct_region_id:'region-1',selected_region_id:args.p_answer}:null}};
  }};
  window.QwizGeo.mountPlayer(el,{code:'A1B2C3D4',room_id:'00000000-0000-4000-8000-000000000123',
   phase:'intermission',activity:{settings:{arcade_mode:'russia_map'}}},{client});
 });
 const button=page.locator('#geoTapConfirm [data-geo-confirm]');
 await expect(page.locator('#geoTapConfirm .geo-region')).toHaveCount(89);
 await expect(button).toBeHidden();
 await page.locator('#geoTapConfirm [data-region="region-3"]').click();
 await expect(button).toBeVisible();
 await expect(button).toBeEnabled();
 await expect(button).toHaveText('Подтвердить выбор');
 await button.click();
 await expect(page.locator('#geoTapConfirm .geo-answer-feedback')).toContainText('Субъект 1');
 await expect(page.locator('#geoTapConfirm [data-region="region-1"]')).toHaveClass(/geo-correct-answer/);
 await expect(page.locator('#geoTapConfirm [data-region="region-3"]')).toHaveClass(/geo-wrong-answer/);
});

test('Four Russia geography choices are compact colorful tiles, not huge empty panels',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};'
 }));
 await page.setViewportSize({width:390,height:760});
 await page.goto(HOME);
 await page.evaluate(()=>{
  const host=document.createElement('div');host.id='geoIndieTiles';document.body.append(host);
  const q={mode:'capital',name:'Республика Марий Эл',
   options:[{id:'a',text:'Махачкала'},{id:'b',text:'Йошкар-Ола'},
    {id:'c',text:'Донецк'},{id:'d',text:'Тверь'}]};
  const client={rpc:async()=>({data:{active:true,open:true,remaining:90,index:10,total:15,
   score:0,correct:0,question:q},error:null})};
  QwizGeo.mountPlayer(host,{code:'AAAABBBB',
   room_id:'00000000-0000-4000-8000-000000000333',phase:'intermission',
   activity:{settings:{arcade_mode:'russia_map'}}},{client});
 });
 const tiles=page.locator('#geoIndieTiles .geo-options button');
 await expect(tiles).toHaveCount(4);
 await expect(tiles.locator('.geo-choice-number')).toHaveText(['A','B','C','D']);
 for(const tile of await tiles.all()){
  const bounds=await tile.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(68);
  expect(bounds.height).toBeLessThanOrEqual(152);
  await expect(tile.locator('.geo-choice-label')).toBeVisible();
  const style=await tile.evaluate(el=>({background:getComputedStyle(el).backgroundImage,shadow:getComputedStyle(el).boxShadow}));
  expect(style.background).toContain('linear-gradient');
  expect(style.shadow).not.toBe('none');
 }
 const heights=await page.locator('#geoIndieTiles .geo-options').evaluate(el=>({
  height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width
 }));
 expect(heights.height).toBeLessThan(330);
 expect(heights.width).toBeLessThanOrEqual(390);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
 await page.screenshot({path:'visual-artifacts/geography-indie-choices-390.png',fullPage:true});
});
