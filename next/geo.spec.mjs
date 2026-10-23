import {test,expect} from '@playwright/test';
const HOME='http://127.0.0.1:8080/next/';
function topology(){
 const geometries=Array.from({length:89},(_,i)=>({type:'Polygon',arcs:[[i]],properties:{id:'region-'+i,name_full:'Субъект '+i,clon:50+i*.3,clat:60}}));
 return {type:'Topology',transform:{scale:[.02,.02],translate:[45,50]},objects:{ru89:{type:'GeometryCollection',geometries}},
  arcs:Array.from({length:89},(_,i)=>[[i*5,0],[100,0],[0,100],[-100,0]])};
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
 await expect(page.locator('#geoBrowserTest .geo-header strong')).toContainText('1 / 3');
 await page.locator('#geoBrowserTest [data-geo-zoom="in"]').click();
 const zoom=await page.locator('#geoBrowserTest .geo-map-svg').getAttribute('viewBox');
 expect(zoom).not.toBe('0 0 1120 480');
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
test('Geo round is an extra configurable card with eight active modes and reserved heraldry',async({page})=>{
 await page.goto(HOME+'workspace.html');
 await page.locator('[data-section="builder"]').click();
 await page.locator('#newBuild').click();
 await page.locator('#cardPalette [data-geo="russia_map"]').click();
 await expect(page.locator('#roundCards .round-card[data-type="bonus"]')).toHaveCount(1);
 await page.locator('#roundCards .round-card[data-type="bonus"] [data-edit-card]').click();
 await expect(page.locator('#cardGeoSettings')).toBeVisible();
 await expect(page.locator('#cardGeoModes input:not(:disabled)')).toHaveCount(8);
 await expect(page.locator('#cardGeoModes [value="coat"]')).toBeDisabled();
 await expect(page.locator('#cardGeoCount')).toHaveValue('15');
 await page.locator('#cardGeoCount').fill('27');
 await page.locator('#cardForm button[type="submit"]').click();
 await expect(page.locator('#roundCards .round-card[data-type="bonus"]')).toContainText('27 случайных субъектов');
});
