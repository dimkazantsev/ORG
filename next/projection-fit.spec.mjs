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
     teams:Array.from({length:14},(_,i)=>({name:'Команда '+(i+1)+' с названием',score:999999999999-i*7000})),
     players:Array.from({length:18},(_,i)=>({nickname:'Студент участник '+(i+1),score:555555555555-i*12000}))}}
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
   // Two animation frames at 8K can exceed a fixed delay on CI runners.
   // Require the fitter to finish instead of racing an arbitrary 180ms sleep.
   await expect.poll(()=>page.evaluate(()=>Number(document.querySelector('#projectionMain')?.firstElementChild?.dataset.fittedZoom)),{timeout:12000}).toBeGreaterThan(0);
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
   if(sample.id==='round-statistics'){
    await expect(page.locator('.projection-round-results')).toBeVisible();
    const exceeds=await page.locator('.projection-round-leaders li>b').evaluateAll(nodes=>nodes.some(el=>{
      const elBox=el.getBoundingClientRect(),rowBox=el.closest('li').getBoundingClientRect();
      return elBox.right>rowBox.right+2 || el.scrollWidth>el.clientWidth+2;
    }));
    expect(exceeds,'Huge result numbers must fit projection rows at '+width).toBe(false);
   }
  }
 });
}



test('All answer variants are readable on the public screen without exposing the solution',async({page})=>{
 for(const [width,height] of [[1280,720],[1920,1080],[3840,2160],[768,1024]]){
  await page.setViewportSize({width,height});
  for(const count of [2,3,4,5,6,8]){
   const options=Array.from({length:count},(_,i)=>'Вариант '+(i+1)+': название страны и краткое описание её государственного символа');
   await page.evaluate(options=>{
    ctx.renderKey='';
    render({code:'A1B2C3D4',phase:'question',index:0,total:10,
     question:{kind:'single',prompt:'Какой из вариантов соответствует описанию?',options},
     ends_at:new Date(Date.now()+60000).toISOString(),
     teams:[],players:[],screen_settings:{sound_enabled:false,volume:0}});
   },options);
   await page.waitForTimeout(150);
   await expect(page.locator('.projection-public-options .projection-option')).toHaveCount(count);
   await expect(page.locator('.projection-question-instruction')).toHaveCount(0);
   for(let i=0;i<count;i++)await expect(page.locator('.projection-public-options .projection-option').nth(i)).toContainText(options[i]);
   const rect=await page.evaluate(()=>{
    const main=document.querySelector('#projectionMain').getBoundingClientRect();
    const scene=document.querySelector('.projection-question-only').getBoundingClientRect();
    const cards=[...document.querySelectorAll('.projection-public-options .projection-option')].map(x=>{
     const r=x.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,scrollWidth:x.scrollWidth,clientWidth:x.clientWidth};
    });
    return {main,scene,cards};
   });
   expect(rect.scene.top).toBeGreaterThanOrEqual(rect.main.top-4);
   expect(rect.scene.bottom).toBeLessThanOrEqual(rect.main.bottom+4);
   for(const card of rect.cards){
    expect(card.left).toBeGreaterThanOrEqual(rect.main.left-4);
    expect(card.right).toBeLessThanOrEqual(rect.main.right+4);
    expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth+3);
   }
  }
 }
});

test('Open questions stay compact and results show only one revealed answer',async({page})=>{
 await page.evaluate(()=>{
  ctx.renderKey='';
  render({code:'A1B2C3D4',phase:'question',index:0,total:3,
   question:{kind:'text',prompt:'Назовите государственный символ.',options:[]},
   ends_at:new Date(Date.now()+60000).toISOString(),teams:[],players:[],
   screen_settings:{sound_enabled:false,volume:0}});
 });
 await expect(page.locator('.projection-public-options')).toHaveCount(0);
 await expect(page.locator('.projection-question-instruction')).toBeVisible();
 await page.evaluate(()=>{
  ctx.renderKey='';
  render({code:'A1B2C3D4',phase:'result',index:0,total:3,
   question:{kind:'single',prompt:'Столица России?',options:['Казань','Москва','Томск']},
   answer:{indices:[1],text:'Москва'},
   ends_at:new Date(Date.now()+60000).toISOString(),teams:[],players:[],
   screen_settings:{sound_enabled:false,volume:0}});
 });
 await expect(page.locator('.projection-public-options')).toHaveCount(0);
 await expect(page.locator('.projection-answer-single')).toContainText('Москва');
});

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
  await expect(page.locator('.projection-answer-single')).toHaveCount(1);
  await expect(page.locator('.projection-reveal-option')).toHaveCount(0);
  const layout=await page.locator('.projection-answer-reveal').evaluate(el=>{
   const main=document.querySelector('#projectionMain').getBoundingClientRect();
   const outer=el.getBoundingClientRect();
   const opts=[...el.querySelectorAll('.projection-answer-single')].map(card=>{
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


test('Final audience screen shows readable leaders instead of shrinking all 40 players',async({page})=>{
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[768,1024]]){
  await page.setViewportSize({width,height});
  const teams=Array.from({length:15},(_,i)=>({id:'t'+i,position:i+1,name:'Команда '+(i+1),score:1500-i*30}));
  const players=Array.from({length:40},(_,i)=>({id:'p'+i,position:i+1,nickname:'Игрок '+(i+1),score:800-i*7}));
  await page.evaluate(({teams,players})=>{
   ctx.renderKey='';
   render({code:'A1B2C3D4',title:'Большой квиз',phase:'finished',index:12,total:12,
    teams,players,question_stats:Array.from({length:12},()=>({answered:40,correct:20})),
    activity:{title:'Финал игры'},screen_settings:{sound_enabled:false,volume:0}});
  },{teams,players});
  await page.waitForTimeout(250);
  const limit=width<=800?3:height<900?4:6;
  await expect(page.locator('.projection-finale-compact')).toBeVisible();
  await expect(page.locator('.projection-finale-compact .projection-round-columns .stage-team-results li')).toHaveCount(limit);
  await expect(page.locator('.projection-finale-compact .projection-round-columns .stage-player-results li')).toHaveCount(limit);
  await expect(page.locator('.projection-finale-compact .projection-round-columns .stage-team-results li').first()).toContainText('Команда 1');
  await expect(page.locator('.projection-finale-compact .projection-round-columns .stage-player-results li').first()).toContainText('Игрок 1');
  await expect(page.locator('.projection-finale-compact .finale-summary')).toContainText('50%');
  await expect(page.locator('.projection-finale-compact .projection-rank-more')).toHaveCount(2);
  const box=await page.evaluate(()=>{
   const stage=document.getElementById('projectionMain').getBoundingClientRect();
   const scene=document.querySelector('.projection-finale-compact').getBoundingClientRect();
   return {stage:{top:stage.top,bottom:stage.bottom,left:stage.left,right:stage.right},
    scene:{top:scene.top,bottom:scene.bottom,left:scene.left,right:scene.right},
    zoom:Number(document.querySelector('.projection-finale-compact').dataset.fittedZoom)};
  });
  expect(box.scene.top,'top at '+width).toBeGreaterThanOrEqual(box.stage.top-4);
  expect(box.scene.bottom,'bottom at '+width).toBeLessThanOrEqual(box.stage.bottom+4);
  expect(box.scene.left,'left at '+width).toBeGreaterThanOrEqual(box.stage.left-4);
  expect(box.scene.right,'right at '+width).toBeLessThanOrEqual(box.stage.right+4);
  expect(box.zoom).toBeGreaterThan(0);
 }
});


test('Question, long variants and answer reveal keep the exact same fixed clock and title anchors',async({page})=>{
 const flag='https://dimkazantsev.github.io/ORG/next/assets/flags-world/dj.svg';
 for(const [width,height] of [[1280,720],[1920,1080],[768,1024]]){
  await page.setViewportSize({width,height});
  const layouts=[];
  for(const variant of [
   {phase:'question',prompt:'Какой стране принадлежит изображённый флаг?',options:['Джибути','Эритрея','Сомали','Кения'],media_url:flag},
   {phase:'result',prompt:'Какой стране принадлежит изображённый флаг?',options:['Джибути','Эритрея','Сомали','Кения'],media_url:flag,answer:{indices:[0],text:'Джибути',explanation:'Это государственный флаг страны «Джибути».'}},
   {phase:'question',prompt:'Какому из государств соответствует символ, изображённый на этой иллюстрации?',options:Array.from({length:8},(_,i)=>'Вариант ответа '+(i+1)+': достаточно продолжительное название государства, которое занимает несколько строк')},
   {phase:'result',prompt:'Какому из государств соответствует символ, изображённый на этой иллюстрации?',options:Array.from({length:8},(_,i)=>'Название '+i),answer:{indices:[2],text:'Достаточно длинное название государства',explanation:'Развёрнутое объяснение государственной символики, особенности истории и причины правильного ответа.'}}
  ]){
   await page.evaluate(v=>{
    ctx.renderKey='';
    render({code:'A1B2C3D4',phase:v.phase,index:2,total:15,
      question:{kind:v.media_url?'flag':'single',prompt:v.prompt,options:v.options,media_url:v.media_url},
      answer:v.answer,ends_at:new Date(Date.now()+17000).toISOString(),
      teams:[],players:[],screen_settings:{sound_enabled:false,volume:0}});
   },variant);
   await page.waitForTimeout(280);
   const pos=await page.evaluate(()=>{
    const main=document.querySelector('#projectionMain').getBoundingClientRect();
    const clock=document.querySelector('.projection-question-only .stage-clock').getBoundingClientRect();
    const header=document.querySelector('.projection-question-only .projection-topline').getBoundingClientRect();
    const title=document.querySelector('.projection-question-only h1').getBoundingClientRect();
    return {mainTop:main.top,clockTop:clock.top,clockRight:clock.right,headerTop:header.top,titleTop:title.top};
   });
   layouts.push(pos);
  }
  for(const p of layouts.slice(1)){
   expect(Math.abs(p.clockTop-layouts[0].clockTop),'clock top '+width).toBeLessThanOrEqual(2);
   expect(Math.abs(p.clockRight-layouts[0].clockRight),'clock right '+width).toBeLessThanOrEqual(2);
   expect(Math.abs(p.headerTop-layouts[0].headerTop),'round header top '+width).toBeLessThanOrEqual(2);
   expect(Math.abs(p.titleTop-layouts[0].titleTop),'prompt top '+width).toBeLessThanOrEqual(3);
  }
 }
});


test('Question and answer content enter gently after fit while clock remains stationary',async({page})=>{
 await page.setViewportSize({width:1280,height:720});
 for(const phase of ['question','result']){
  await page.evaluate(phase=>{
   ctx.renderKey='';
   render({code:'A1B2C3D4',phase,index:1,total:7,ends_at:new Date(Date.now()+20000).toISOString(),
    question:{kind:'single',prompt:'Определите страну по описанию',options:['Россия','Бразилия','Аргентина','Индия']},
    answer:phase==='result'?{indices:[0],text:'Россия'}:null,teams:[],
    screen_settings:{sound_enabled:false,volume:0}});
  },phase);
  const flow=page.locator('.projection-question-flow');
  await expect(flow).toBeVisible();
  await expect(flow).toHaveCSS('transition-property',/opacity/);
  await expect.poll(()=>page.evaluate(()=>document.querySelector('.projection-question-flow')?.dataset.motionReady)).toBe('true');
  await expect(page.locator('.stage-clock')).toBeVisible();
 }
});


test('Competitive mini-games fit screen and Blitz Consensus prioritizes readable team voting',async({page})=>{
 for(const mode of ['blitz','tug','captain']){
  await page.evaluate(mode=>{
   const area=document.getElementById('projectionMain');
   QwizArcade.stop('screen');
   const start=Date.now();
   const client={rpc:async()=>({data:{mode,running:true,started_at:new Date(start).toISOString(),ends_at:new Date(start+60000).toISOString(),
    server_now:new Date().toISOString(),teams:[{id:'a',name:'Альфа',points:10,place:1}],mine:null,awards:[]},error:null})};
   QwizArcade.mountProjector(area,{code:'A1B2C3D4',activity:{settings:{arcade_mode:mode}}},client);
  },mode);
  if(mode==='tug')await expect(page.locator('.arcade-projection-tap-button')).toBeVisible();
  else if(mode==='captain')await expect(page.locator('.arcade-memory-hero')).toBeVisible();
  else {await expect(page.locator('.arcade-projection[data-arcade-root="blitz"]')).toBeVisible();await expect(page.locator('.consensus-progress')).toBeVisible();await expect(page.locator('.consensus-hero')).toBeHidden();}
  await expect(page.locator('[data-arcade-clock]')).toContainText('с');
 }
 await page.evaluate(()=>QwizArcade.stop('screen'));
});


test('Flag artwork is fully visible without an illustration caption in question and reveal',async({page})=>{
 const imageUrl='https://assets.example.test/flag-pa.svg';
 await page.route(imageUrl,route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"><rect width="900" height="600" fill="#fff"/><rect width="450" height="300" x="450" fill="#b21e35"/><rect width="450" height="300" y="300" fill="#06366b"/><polygon points="225,60 255,162 155,102 295,102 195,162" fill="#06366b"/><polygon points="675,360 705,462 605,402 745,402 645,462" fill="#b21e35"/></svg>'}));
 for(const [width,height] of [[1280,720],[1562,880],[1920,1080],[768,1024]]){
  await page.setViewportSize({width,height});
  for(const phase of ['question','result']){
   await page.evaluate(({phase,imageUrl})=>{
    ctx.renderKey='';
    render({code:'A1B2C3D4',phase,index:2,total:15,ends_at:new Date(Date.now()+18000).toISOString(),
     question:{kind:'flag',prompt:'Какой стране принадлежит изображённый флаг?',media_url:imageUrl,
       options:['Джибути','Панама','Сомали','Кения']},
     answer:phase==='result'?{text:'Панама',indices:[1],explanation:'Это флаг Панамы.'}:null,
     teams:[],players:[],screen_settings:{sound_enabled:false,volume:0}});
   },{phase,imageUrl});
   const img=page.locator('.projection-question-flow .question-frame .question-picture img');
   await expect(img).toBeVisible();
   await img.evaluate(e=>e.decode());
   await expect.poll(()=>page.evaluate(()=>Number(document.querySelector('.projection-question-only')?.dataset.fittedZoom))).toBeGreaterThan(0);
   await expect(page.getByText('Иллюстрация к вопросу')).toHaveCount(0);
   const geometry=await page.evaluate(()=>{
    const image=document.querySelector('.projection-question-flow .question-frame .question-picture img');
    const picture=image.closest('.question-picture');
    const frame=image.closest('.question-frame');
    const viewport=document.querySelector('.projection-question-viewport');
    const rect=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};
    return {image:rect(image),picture:rect(picture),frame:rect(frame),viewport:rect(viewport),
      fit:getComputedStyle(image).objectFit,overflow:getComputedStyle(picture).overflow};
   });
   expect(geometry.fit).toBe('contain');
   expect(geometry.image.width).toBeGreaterThan(90);
   expect(geometry.image.height).toBeGreaterThan(50);
   for(const bounds of [geometry.picture,geometry.frame,geometry.viewport]){
    expect(geometry.image.top,phase+' image top '+width).toBeGreaterThanOrEqual(bounds.top-3);
    expect(geometry.image.bottom,phase+' image bottom '+width).toBeLessThanOrEqual(bounds.bottom+3);
    expect(geometry.image.left,phase+' image left '+width).toBeGreaterThanOrEqual(bounds.left-3);
    expect(geometry.image.right,phase+' image right '+width).toBeLessThanOrEqual(bounds.right+3);
   }
   expect(geometry.overflow).not.toBe('hidden');
  }
 }
});


test('Flag choices and the correct flag stay inside their cards without clipping',async({page})=>{
 const imageUrl='https://assets.example.test/flag-pa.svg';
 await page.route('https://assets.example.test/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',
  body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"><rect width="900" height="600" fill="#fff"/><rect width="450" height="300" x="450" fill="#b21e35"/><rect width="450" height="300" y="300" fill="#06366b"/><polygon points="225,60 255,162 155,102 295,102 195,162" fill="#06366b"/></svg>'}));
 for(const [width,height] of [[1280,720],[1920,1080],[768,1024]]){
  await page.setViewportSize({width,height});
  for(const phase of ['question','result']){
   await page.evaluate(({phase,imageUrl})=>{
    ctx.renderKey='';
    render({code:'A1B2C3D4',phase,index:1,total:10,ends_at:new Date(Date.now()+25000).toISOString(),
     question:{kind:'flag',prompt:'Выберите флаг государства Панама',options:[
       {image_url:imageUrl},{image_url:imageUrl},{image_url:imageUrl},{image_url:imageUrl}]},
     answer:phase==='result'?{indices:[0],text:'Панама'}:null,teams:[],
     screen_settings:{sound_enabled:false,volume:0}});
   },{phase,imageUrl});
   const selector=phase==='question'?'.projection-public-options .flag-choice-art':'.projection-answer-reveal .correct-flag-art img';
   await expect(page.locator(selector).first()).toBeVisible();
   await expect.poll(()=>page.locator(selector).first().evaluate(img=>img.naturalWidth),{timeout:12000}).toBeGreaterThan(0);
   await expect.poll(()=>page.evaluate(()=>Number(document.querySelector('.projection-question-only')?.dataset.fittedZoom))).toBeGreaterThan(0);
   const boxes=await page.locator(selector).evaluateAll((images,phase)=>images.map(img=>{
    const r=img.getBoundingClientRect();
    const parent=img.closest(phase==='question'?'.projection-option':'.correct-flag-art');
    const p=parent.getBoundingClientRect();
    return {image:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},
      parent:{left:p.left,right:p.right,top:p.top,bottom:p.bottom},fit:getComputedStyle(img).objectFit};
   }),phase);
   for(const b of boxes){
    expect(b.fit).toBe('contain');
    expect(b.image.width).toBeGreaterThan(35);
    expect(b.image.height).toBeGreaterThan(20);
    expect(b.image.left).toBeGreaterThanOrEqual(b.parent.left-3);
    expect(b.image.right).toBeLessThanOrEqual(b.parent.right+3);
    expect(b.image.top).toBeGreaterThanOrEqual(b.parent.top-3);
    expect(b.image.bottom).toBeLessThanOrEqual(b.parent.bottom+3);
   }
  }
 }
});


test('Audience countdown warning stays hidden and received-answer counter has breathing room',async({page})=>{
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[768,1024]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>{
   ctx.renderKey='';
   const now=Date.now();
   render({
    code:'A1B2C3D4',phase:'question',index:7,total:45,
    ends_at:new Date(now+7000).toISOString(),duration:40,paused:false,
    question:{
     kind:'flag',
     prompt:'Какой стране принадлежит изображённый государственный флаг, учитывая все особенности его официальной символики?',
     media_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/am.svg',
     options:['Доминика','Камбоджа','Армения','Науру']
    },
    teams:[{id:'one',name:'Команда',answered:0}],players:[],
    screen_settings:{sound_enabled:false,volume:0}
   });
  });
  await expect(page.locator('.projection-question-only .clock-value strong')).toBeVisible();
  const warning=page.locator('.projection-question-only .clock-warning');
  await expect(warning).toBeHidden();
  await expect(page.locator('#teamAnswerCount')).toContainText('ответов получено');
  await expect(page.locator('.projection-public-options .projection-option')).toHaveCount(4);
  await expect.poll(()=>page.evaluate(()=>Number(document.querySelector('.projection-question-only')?.dataset.fittedZoom)),{timeout:12000}).toBeGreaterThan(0);
  const geometry=await page.evaluate(()=>{
   const bounds=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}};
   const answerCards=[...document.querySelectorAll('.projection-public-options .projection-option')].map(bounds);
   const count=bounds(document.getElementById('teamAnswerCount'));
   const stage=bounds(document.getElementById('projectionMain'));
   return {answerBottom:Math.max(...answerCards.map(c=>c.bottom)),
    count,stage,visibleWarning:getComputedStyle(document.querySelector('.clock-warning')).display};
  });
  expect(geometry.visibleWarning).toBe('none');
  expect(geometry.count.top-geometry.answerBottom,'Spacing at '+width+'x'+height).toBeGreaterThanOrEqual(12);
  expect(geometry.count.bottom,'Bottom counter within stage at '+width+'x'+height).toBeLessThanOrEqual(geometry.stage.bottom+2);
  expect(geometry.count.top,'Counter above screen edge at '+width+'x'+height).toBeGreaterThan(geometry.stage.top);
 }
});


test('captain Memory flips instantly and buffers the next two touches during mismatch',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  const holder=document.createElement('section');holder.id='memoryFastFixture';
  holder.style.cssText='width:390px;max-width:100%;';
  document.body.appendChild(holder);
  window.__memoryFlipRequests=[];
  const start=Date.now();
  const client={rpc:async(name,args)=>{
   if(name==='qwiz_party_arcade')return {error:null,data:{
    code:'A1B2C3D4',mode:'captain',card_position:0,room_id:'00000000-0000-4000-8000-000000000001',
    running:true,server_now:new Date().toISOString(),
    started_at:new Date(start).toISOString(),ends_at:new Date(start+70000).toISOString(),
    teams:[{id:'team',name:'Неукротимые',points:0,place:1}],mine:{team_id:'team'},
    awards:[],extra:{captain:true,moves:0,pairs:0,completed_ms:null,
     tiles:Array.from({length:12},(_,index)=>({index,icon:null,matched:false,open:false}))}
   }};
   if(name==='qwiz_arcade_play'){
    window.__memoryFlipRequests.push(args.p_tile);
    await new Promise(resolve=>setTimeout(resolve,145));
    const n=window.__memoryFlipRequests.length;
    return {error:null,data:n%2===1?{ok:true,first:args.p_tile,icon:'🌈'}:
     {ok:true,match:n===4,icon:'🌈',first_icon:'🌈',hide_ms:640,completed:false}};
   }
   return {data:null,error:null};
  }};
  QwizArcade.mountPlayer(holder,{
   code:'A1B2C3D4',room_id:'00000000-0000-4000-8000-000000000001',
   activity:{settings:{arcade_mode:'captain'}}
  },{client});
 });
 await expect(page.locator('#memoryFastFixture [data-arcade-tile]')).toHaveCount(12);
 const flags=await page.evaluate(()=>{
  const nodes=[...document.querySelectorAll('#memoryFastFixture [data-arcade-tile]')];
  for(const i of [0,1,2,3])
   nodes[i].dispatchEvent(new PointerEvent('pointerdown',{
    bubbles:true,cancelable:true,pointerId:i+1,isPrimary:true,pointerType:'touch'}));
  return nodes.slice(0,4).map(el=>({open:el.classList.contains('is-open'),
   queued:el.classList.contains('is-queued')}));
 });
 expect(flags[0].open).toBe(true);expect(flags[1].open).toBe(true);
 expect(flags[2].queued).toBe(true);expect(flags[3].queued).toBe(true);
 await expect.poll(()=>page.evaluate(()=>window.__memoryFlipRequests.length),{timeout:5000}).toBe(4);
 expect(await page.locator('#memoryFastFixture .arcade-memory-board [data-arcade-tile]').count()).toBe(12);
 expect(await page.locator('#memoryFastFixture .arcade-alert').textContent()).not.toContain('Все капитаны одновременно');
 await page.evaluate(()=>{QwizArcade.stop('player');document.getElementById('memoryFastFixture').remove()});
});


test('Blitz Consensus: all players vote, captain decides with team tally, projector sees progress',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>typeof QwizArcade==='object'&&typeof QwizArcade.mountPlayer==='function');
 await page.evaluate(()=>{
  const el=document.createElement('section');el.id='consensusQaFixture';document.body.appendChild(el);
  const end=new Date(Date.now()+60000).toISOString();
  window.__consensusQa={stage:'voting',votes:[],end,choice:null,final:null};
  const client={rpc:async(name,args)=>{
   if(name==='qwiz_consensus_vote'){
    window.__consensusQa.votes.push({...args});
    if(args.p_phase==='vote')window.__consensusQa.choice=args.p_choice;
    else window.__consensusQa.final=args.p_choice;
    return {error:null,data:{ok:true}};
   }
   if(name==='qwiz_party_arcade'){
    const state=window.__consensusQa;
    return {error:null,data:{
      mode:'blitz',running:true,card_position:0,server_now:new Date().toISOString(),
      started_at:new Date(Date.now()-8000).toISOString(),ends_at:state.end,
      teams:[{id:'T1',name:'Неукротимые',points:0,place:1}],mine:{team_id:'T1'},
      question:{prompt:'Какой стране принадлежит флаг?',options:['Япония','Судан','Кипр','Зимбабве'],correct:null},
      consensus:{stage:state.stage,vote_ends_at:state.end,ends_at:state.end,team_progress:[{team_id:'T1',name:'Неукротимые',votes:2,members:3,submitted:!!state.final}],
       my_team_id:'T1',my_choice:state.choice,final_choice:state.final,
       captain:state.stage==='captain',my_team_count:2,
       my_team_votes:[{choice:1,votes:2},{choice:2,votes:0}]},
      awards:[]
    }};
   }
   return {error:null,data:null};
  }};
  window.__consensusQa.client=client;
  QwizArcade.mountPlayer(el,{
    code:'A1B2C3D4',room_id:'00000000-0000-4000-8000-000000000001',
    activity:{settings:{arcade_mode:'blitz'}}},{client});
 });
 await expect(page.locator('#consensusQaFixture .consensus-option')).toHaveCount(4);
 await expect(page.locator('#consensusQaFixture .consensus-question')).toContainText('ГОЛОСОВАНИЕ КОМАНДЫ');
 await page.locator('#consensusQaFixture [data-consensus-choice="1"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__consensusQa.votes.length)).toBe(1);
 expect(await page.evaluate(()=>window.__consensusQa.votes[0].p_phase)).toBe('vote');
 await page.evaluate(()=>{
  QwizArcade.stop('player');
  window.__consensusQa.stage='captain';
  const el=document.getElementById('consensusQaFixture');
  QwizArcade.mountPlayer(el,{code:'A1B2C3D4',
   room_id:'00000000-0000-4000-8000-000000000001',
   activity:{settings:{arcade_mode:'blitz'}}},{client:window.__consensusQa.client});
 });
 await expect(page.locator('#consensusQaFixture .consensus-question')).toContainText('РЕШЕНИЕ КАПИТАНА');
 await expect(page.locator('#consensusQaFixture .consensus-votes').first()).toBeVisible();
 await page.locator('#consensusQaFixture [data-consensus-choice="1"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__consensusQa.votes.length)).toBe(2);
 expect(await page.evaluate(()=>window.__consensusQa.votes[1].p_phase)).toBe('final');
 await page.evaluate(()=>{QwizArcade.stop('player');document.getElementById('consensusQaFixture').remove()});
});
