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
];
for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[3840,2160],[7680,4320]]){
 test('Audience content fits '+width+'x'+height,async({page})=>{
  await page.setViewportSize({width,height});
  for(const sample of examples){
   await page.evaluate(s=>{
     ctx.renderKey='';
     render({code:'A1B2C3D4',phase:s.phase,index:4,total:10,title:'Проверка экрана',
       question:s.question,answer:s.answer,ends_at:new Date(Date.now()+60000).toISOString(),
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
  }
 });
}
