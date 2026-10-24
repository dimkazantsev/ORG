import {test,expect} from '@playwright/test';

// Reproducible geometry tests without joining, modifying, or advancing any real room.
test.beforeEach(async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({rpc:async()=>({data:null,error:{message:"QA fixture"}}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){}})};'
 }));
 await page.goto('http://127.0.0.1:8080/next/presenter.html?room=A1B2C3D4',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof render==='function'&&typeof QwizStage!=='undefined');
});
const examples=[
 {id:'pick-flag',phase:'question',question:{kind:'flag',prompt:'Выберите флаг государства «Ангола».',options:[
  {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/ao.svg'},
  {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/pt.svg'},
  {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/fr.svg'},
  {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/it.svg'}]}},
 {id:'long-question',phase:'question',question:{kind:'single',prompt:'Перед вами описание исторического символа. Определите, какое из следующих утверждений наиболее точно характеризует историческое происхождение, официальное значение, последовательность утверждения и особенности использования государственного флага в приведённой ситуации?',options:['Первое','Второе','Третье','Четвёртое'],media_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/cl.svg'}},
 {id:'four-flags',phase:'result',question:{kind:'flag',prompt:'Выберите флаг государства «Ангола».',options:[
  {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/ao.svg'},
  {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/fr.svg'},
  {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/it.svg'},
  {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/nl.svg'}]},
  answer:{indices:[0],text:'Ангола',explanation:'Флаг государства показан среди предложенных вариантов.'}},
 {id:'long-six-options',phase:'result',question:{kind:'single',prompt:'В каком историческом порядке принимались перечисленные решения относительно государственной символики, с учётом условий времени и отличий каждого из приведённых вариантов?',options:Array.from({length:6},(_,i)=>'Вариант '+(i+1)+': официальное описание символа и его историческая характеристика.')},answer:{indices:[3],text:'Четвёртый вариант',explanation:'Это пояснение намеренно содержит несколько предложений, чтобы проверить компоновку длинного текста и шести вариантов на внешнем дисплее без обрезания снизу.'}}

 ,{id:'map-card-intro',phase:'intermission',
   activity:{type:'card_intro',title:'География России',icon:'map',
    settings:{lead_seconds:5}}}
 ,{id:'question-card-intro',phase:'countdown',
   activity:{type:'round_intro',title:'Флаги мира',icon:'flag',settings:{lead_seconds:5}}}
 ,{id:'round-statistics',phase:'intermission',
   activity:{type:'round_stats',title:'Итоги раунда',settings:{stats_seconds:7}},
   round_results:{team_unit:'баллы',player_unit:'баллы',
     teams:Array.from({length:14},(_,i)=>({name:'Команда '+(i+1)+' с названием',score:280-i*7})),
     players:Array.from({length:18},(_,i)=>({nickname:'Студент участник '+(i+1),score:500-i*12}))}}
];
for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[3840,2160],[7680,4320]]){
 test('Audience content fits '+width+'x'+height,async({page})=>{
  await page.setViewportSize({width,height});
  for(const sample of examples){
   await page.evaluate(s=>{
     ctx.renderKey='';
     render({code:'A1B2C3D4',phase:s.phase,index:4,total:10,title:'Проверка экрана',
       question:s.question,answer:s.answer,activity:s.activity,round_results:s.round_results,
       ends_at:new Date(Date.now()+60000).toISOString(),
       teams:[{id:'a',name:'Фантастические',score:10}],players:[],paused:false,screen_settings:{sound_enabled:false,volume:0}});
   },sample);
   await page.waitForTimeout(180);
   const size=await page.evaluate(()=>{
    const main=document.querySelector('#projectionMain'),scene=main.firstElementChild;
    const stage=main.getBoundingClientRect(),content=scene.getBoundingClientRect();
    return {stage:{top:stage.top,bottom:stage.bottom,left:stage.left,right:stage.right},
     content:{top:content.top,bottom:content.bottom,left:content.left,right:content.right},
     zoom:scene.dataset.fittedZoom,overflowY:scene.scrollHeight-Math.ceil(scene.clientHeight)};
   });
   expect(size.content.top,'scene top at '+width+' '+sample.id).toBeGreaterThanOrEqual(size.stage.top-3);
   expect(size.content.bottom,'scene bottom at '+width+' '+sample.id).toBeLessThanOrEqual(size.stage.bottom+3);
   expect(size.content.left,'scene left at '+width+' '+sample.id).toBeGreaterThanOrEqual(size.stage.left-3);
   expect(size.content.right,'scene right at '+width+' '+sample.id).toBeLessThanOrEqual(size.stage.right+3);
   expect(Number(size.zoom),'valid scene zoom at '+width+' '+sample.id).toBeGreaterThan(0);
   if(sample.id==='pick-flag')await expect(page.locator('.question-frame')).toHaveCount(0);
   if(sample.phase==='result')await expect(page.locator('.projection-answer-reveal')).toBeVisible();
   if(sample.id==='map-card-intro'||sample.id==='question-card-intro')await expect(page.locator('.projection-intro-card')).toBeVisible();
   if(sample.id==='round-statistics')await expect(page.locator('.projection-round-results')).toBeVisible();
  }
 });
}


test('Moderator-controlled music loops across game phases until explicitly disabled',async({page})=>{
 await page.locator('#projectionSound').click();
 await page.locator('#projectionSound').click();
 await page.evaluate(()=>applyProjectionSettings({sound_enabled:true,music_enabled:true,volume:28}));
 await expect.poll(()=>page.evaluate(()=>!!QwizStage.audio.themeTimer)).toBe(true);
 const timer=await page.evaluate(()=>QwizStage.audio.themeTimer);
 await page.evaluate(()=>{
  ctx.renderKey='';
  render({code:'A1B2C3D4',phase:'countdown',index:0,total:10,
   ends_at:new Date(Date.now()+4000).toISOString(),
   activity:{type:'round_intro',title:'Флаги мира',icon:'flag'},
   screen_settings:{sound_enabled:true,music_enabled:true,volume:28}});
  ctx.renderKey='';
  render({code:'A1B2C3D4',phase:'result',index:0,total:10,
   question:{prompt:'Страна на флаге?',options:['Россия','Канада']},
   answer:{indices:[0],text:'Россия'},ends_at:new Date(Date.now()+7000).toISOString(),
   screen_settings:{sound_enabled:true,music_enabled:true,volume:28}});
 });
 await expect.poll(()=>page.evaluate(()=>!!QwizStage.audio.themeTimer)).toBe(true);
 expect(await page.evaluate(()=>QwizStage.audio.themeTimer)).toBe(timer);
 await page.evaluate(()=>applyProjectionSettings({sound_enabled:true,music_enabled:false,volume:28}));
 await expect.poll(()=>page.evaluate(()=>QwizStage.audio.themeTimer===null)).toBe(true);
});


test('Real flag frame stays attached to artwork and all four flag choices remain inside answer cells',async({page})=>{
 await page.route('https://dimkazantsev.github.io/ORG/next/assets/flags-world/**',route=>{
  const wide=route.request().url().endsWith('/uz.svg');
  return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="'+(wide?600:300)+'" height="'+(wide?300:200)+'"><rect width="100%" height="100%" fill="#7546d4"/></svg>'});
 });
 for(const [width,height] of [[1280,720],[1920,1080],[3840,2160]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>{
   ctx.renderKey='';
   render({code:'A1B2C3D4',phase:'question',index:1,total:12,
    ends_at:new Date(Date.now()+60000).toISOString(),
    question:{kind:'flag',prompt:'Какой стране принадлежит изображённый флаг?',
      media_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/uz.svg',
      options:['Узбекистан','Казахстан','Таджикистан','Киргизия']},
    teams:[],players:[],screen_settings:{sound_enabled:false,volume:0}});
  });
  await page.locator('.flag-media-frame img.question-art').waitFor({state:'visible'});
  await page.waitForTimeout(250);
  await expect(page.locator('.flag-media-frame .frame-orbit')).toHaveCount(0);
  const flag=await page.locator('.flag-media-frame').evaluate(el=>{
   const img=el.querySelector('img').getBoundingClientRect();
   const pic=el.querySelector('.question-picture').getBoundingClientRect();
   const main=document.querySelector('#projectionMain').getBoundingClientRect();
   return {img:{left:img.left,right:img.right,top:img.top,bottom:img.bottom},
     pic:{left:pic.left,right:pic.right,top:pic.top,bottom:pic.bottom},main:{left:main.left,right:main.right}};
  });
  expect(flag.img.left).toBeGreaterThanOrEqual(flag.pic.left-2);
  expect(flag.img.right).toBeLessThanOrEqual(flag.pic.right+2);
  expect(flag.img.left).toBeGreaterThanOrEqual(flag.main.left-2);
  expect(flag.img.right).toBeLessThanOrEqual(flag.main.right+2);
  await page.evaluate(()=>{
   ctx.renderKey='';
   render({code:'A1B2C3D4',phase:'result',index:2,total:12,
    ends_at:new Date(Date.now()+60000).toISOString(),
    question:{kind:'flag',prompt:'Выберите флаг государства «Гамбия».',
      options:[{image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/ye.svg'},
       {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/gm.svg'},
       {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/lv.svg'},
       {image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/rs.svg'}]},
    answer:{indices:[1],text:'Гамбия',explanation:'Верный вариант — флаг Гамбии.'},
    teams:[],players:[],screen_settings:{sound_enabled:false,volume:0}});
  });
  await page.waitForTimeout(280);
  await expect(page.locator('.projection-reveal-option')).toHaveCount(4);
  const layout=await page.locator('.projection-answer-reveal').evaluate(el=>{
   const main=document.querySelector('#projectionMain').getBoundingClientRect();
   const outer=el.getBoundingClientRect();
   const opts=[...el.querySelectorAll('.projection-reveal-option')].map(card=>{
    const box=card.getBoundingClientRect(),img=card.querySelector('img')?.getBoundingClientRect();
    return {box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},
      img:img?{left:img.left,right:img.right,top:img.top,bottom:img.bottom}:null};
   });
   return {main:{left:main.left,right:main.right,bottom:main.bottom},
     outer:{left:outer.left,right:outer.right,bottom:outer.bottom},opts};
  });
  expect(layout.outer.left).toBeGreaterThanOrEqual(layout.main.left-3);
  expect(layout.outer.right).toBeLessThanOrEqual(layout.main.right+3);
  expect(layout.outer.bottom).toBeLessThanOrEqual(layout.main.bottom+3);
  for(const item of layout.opts){
   expect(item.box.left).toBeGreaterThanOrEqual(layout.outer.left-3);
   expect(item.box.right).toBeLessThanOrEqual(layout.outer.right+3);
   expect(item.img?.left).toBeGreaterThanOrEqual(item.box.left-3);
   expect(item.img?.right).toBeLessThanOrEqual(item.box.right+3);
   expect(item.img?.bottom).toBeLessThanOrEqual(item.box.bottom+3);
  }
 }
});
