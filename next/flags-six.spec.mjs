import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const {rows}=createRequire(import.meta.url)('./scripts/build-flags-six.cjs');
const base='http://127.0.0.1:8080/next/';
const sample=mode=>rows.find(x=>x.mode===mode);
const snapshot=q=>({kind:q.kind,prompt:q.prompt,options:q.kind==='order'?q.options.slice().reverse():q.options,media_url:q.solution.media_url,flag_memory:q.solution.flag_memory,flag_assembly:q.solution.flag_assembly,memory_until:new Date(Date.now()+5000).toISOString()});
async function stub(page){
 await page.route('https://dimkazantsev.github.io/ORG/next/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#c4b0e6"/></svg>'}));
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:'window.sent=[];window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:"teacher"}}}}),signInAnonymously:async()=>({data:{session:{}}})},rpc:async(name,args)=>{window.sent.push({name,args});if(name==="org_quiz_is_admin_check")return {data:true};if(name==="qwiz_studio"&&args.p_action==="overview")return {data:{topics:[{id:"flags",name:"Флаги мира"}],builds:[]}};if(name==="qwiz_host_rooms")return {data:[]};if(name==="qwiz_studio")return {data:{items:[],total:0}};if(name==="qwiz_public_screen"||name==="org_next_state")return {data:window.fixture};return {data:{registered:false}}},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}})};'}));
}
async function player(page,q){
 await stub(page);await page.goto(base);
 await page.evaluate(question=>{ctx.room={code:'ABCDEF12',room_id:'room',title:'Флаги мира',phase:'question',index:0,total:1,duration:30,ends_at:new Date(Date.now()+30000).toISOString(),question,teams:[],public_stats:{teams:[]},me:{id:'player',team_id:'team'},eligible:true};ctx.gameRenderKey='';showScreen('game');renderGame()},snapshot(q));
}
test('All six new editors preserve their answer formats when saved',async({page})=>{
 await stub(page);await page.goto(base+'workspace.html');await expect(page.locator('#connText')).toHaveAttribute('data-state','ready');
 await expect(page.locator('#editKind option')).toHaveCount(12);await expect(page.locator('#editKind option:disabled')).toHaveCount(0);
 for(const mode of ['similar','assemble','multiple','memory','geo','history']){
  const q=sample(mode);await page.evaluate(question=>{state.questions=[{...question,topic_id:'flags',difficulty:3}];editQuestion(question.id)},q);
  await page.locator('#questionSubmit').click();await expect(page.locator('#questionDialog')).not.toBeVisible();
  const saved=await page.evaluate(()=>window.sent.filter(x=>x.args?.p_action==='question_save').at(-1)?.args.p_input);
  expect(saved.kind).toBe(q.kind);expect(saved.solution.flag_mode).toBe(mode);expect(saved.options).toEqual(q.options);
  if(mode==='multiple')expect(saved.solution.correct_indices).toEqual(q.solution.correct_indices);
  if(mode==='assemble')expect(JSON.stringify(saved.solution.flag_assembly).toLowerCase()).toBe(JSON.stringify(q.solution.flag_assembly).toLowerCase());
  if(mode==='history')expect(saved.solution.source_urls).toEqual(q.solution.source_urls);
 }
});
for(const mode of ['similar','assemble','multiple','memory','geo','history'])test('Student and projector render '+mode+' on a 320px screen',async({page})=>{
 await page.setViewportSize({width:320,height:900});await player(page,sample(mode));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 if(mode==='multiple'){await expect(page.locator('[data-multi]')).toHaveCount(4);await expect(page.locator('.rich-choice img')).toHaveCount(4)}
 if(mode==='assemble')await expect(page.locator('.assembly-preview')).toBeVisible();
 const data=await page.evaluate(()=>ctx.room);await page.evaluate(s=>window.fixture=s,data);
 await page.addInitScript(s=>{window.fixture=s},data);await page.goto(base+'presenter.html?room=ABCDEF12');await page.evaluate(s=>{ctx.last=s;ctx.renderKey='';render(s)},data);
 await expect(page.locator('.projection-question')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
test('Memory conceals the image and unlocks choices at the absolute deadline, including after refresh',async({page})=>{
 await page.clock.install();await player(page,sample('memory'));
 await expect(page.locator('[data-memory-study]')).toBeVisible();await expect(page.locator('[data-memory-answer]')).toBeHidden();
 await page.clock.fastForward(5500);await expect(page.locator('[data-memory-study]')).toBeHidden();await expect(page.locator('[data-memory-answer]')).toBeVisible();
 await page.evaluate(()=>{delete ctx.room.question.media_url;ctx.gameRenderKey='';renderGame()});
 await expect(page.locator('[data-memory-study]')).toBeHidden();await expect(page.locator('[data-memory-answer]')).toBeVisible();
});
test('Public projector hides memory choices while the flag is studied, then reveals them at the shared deadline',async({page})=>{
 await page.clock.install();
 await page.setViewportSize({width:1280,height:720});
 await stub(page);
 await page.goto(base+'presenter.html?room=ABCDEF12');
 const memory=snapshot(sample('memory'));
 // Stress the adaptive projector fit when a short study image becomes eight long choices.
 memory.options=Array.from({length:8},(_,i)=>'Вариант '+(i+1)+': расширенное описание страны, её государственных символов и особенностей флага.');
 await page.evaluate(question=>{
  const data={code:'ABCDEF12',title:'Флаги мира',phase:'question',index:0,total:1,duration:30,
   ends_at:new Date(Date.now()+30000).toISOString(),question,teams:[],
   screen_settings:{sound_enabled:false,volume:0}};
  window.fixture=data;ctx.client.rpc=async()=>({data:window.fixture,error:null});
  ctx.last=data;ctx.renderKey='';render(data);
 },memory);
 const study=page.locator('#projectionMain [data-memory-study]');
 const choices=page.locator('#projectionMain .projection-public-options');
 await expect(study).toBeVisible();
 await expect(choices).toHaveAttribute('data-memory-answer','');
 await expect(choices).toBeHidden();
 await expect(choices).toHaveAttribute('aria-hidden','true');
 await page.clock.fastForward(5500);
 await page.evaluate(()=>QwizStage.updateClock(ctx.last,ctx.offset));
 await expect(study).toBeHidden();
 await expect(choices).toBeVisible();
 await expect(choices).toHaveAttribute('aria-hidden','false');
 await expect(choices.locator('.projection-option')).toHaveCount(memory.options.length);
 await expect.poll(()=>page.evaluate(()=>{
  const main=document.getElementById('projectionMain').getBoundingClientRect();
  const scene=document.querySelector('#projectionMain>.projection-question-only').getBoundingClientRect();
  const options=[...document.querySelectorAll('.projection-public-options .projection-option')].map(el=>el.getBoundingClientRect());
  return options.length===8&&scene.top>=main.top-4&&scene.bottom<=main.bottom+4&&
   options.every(r=>r.top>=main.top-4&&r.bottom<=main.bottom+4&&r.left>=main.left-4&&r.right<=main.right+4);
 })).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 // A new ordinary question is not subject to the preceding memory gate.
 await page.evaluate(question=>{
  const next={...ctx.last,index:1,total:2,question,
   ends_at:new Date(Date.now()+30000).toISOString()};
  window.fixture=next;ctx.last=next;ctx.renderKey='';render(next);
 },snapshot(sample('similar')));
 await expect(page.locator('#projectionMain .projection-public-options')).toBeVisible();
 await expect(page.locator('#projectionMain [data-memory-answer]')).toHaveCount(0);
});

test('Assembly paints the selected stripes and submits their actual order',async({page})=>{
 const q=sample('assemble');await player(page,q);
 for(let i=0;i<3;i++)await page.locator('select.rich-order').nth(i).selectOption(String(2-i));
 await expect(page.locator('.assembly-preview')).toHaveAttribute('aria-label','Полосы: '+q.options.join(', '));
 await page.locator('[data-submit-rich]').click();
 const sent=await page.evaluate(()=>window.sent.find(x=>x.name==='qwiz_submit_answer'));
 expect(sent.args.p_payload.items).toEqual(q.options);
});
test('Multiple image answers submit only the checked indices',async({page})=>{
 await player(page,sample('multiple'));await page.locator('[data-multi="1"]').check();await page.locator('[data-multi="3"]').check();await page.locator('[data-submit-rich]').click();
 const sent=await page.evaluate(()=>window.sent.find(x=>x.name==='qwiz_submit_answer'));expect(sent.args.p_payload).toEqual({indices:[1,3]});
});
test('Standalone preview supports assembly and the timed memory scene at phone width',async({page})=>{
 await page.setViewportSize({width:320,height:900});await page.clock.install();await page.goto(base+'question-preview.html');
 const send=async q=>page.evaluate(question=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window.opener,data:{type:'qwiz-preview-data',question,index:1,total:2}})),q);
 await send(sample('assemble'));await expect(page.locator('.assembly-preview')).toBeVisible();
 await page.locator('select.rich-order').first().selectOption('0');expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await send(sample('memory'));await expect(page.locator('#previewChoices')).toBeHidden();await page.clock.fastForward(5500);await expect(page.locator('#previewChoices')).toBeVisible();await expect(page.locator('[data-memory-study]')).toBeHidden();
});
test('All twelve sourced country outlines load at their native proportions',async({page})=>{
 await page.goto(base+'question-preview.html');
 await page.setContent('<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">'+Array.from({length:12},(_,i)=>'<figure style="margin:0"><img style="width:100%" src="'+base+'assets/flag-maps/outline-'+String(i+1).padStart(2,'0')+'.svg" alt="Контур '+(i+1)+'"><figcaption>Контур '+(i+1)+'</figcaption></figure>').join('')+'</div>');
 await expect.poll(()=>page.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth===640))).toBe(true);
 await page.screenshot({path:'visual-artifacts/flags-twelve-outlines.png',fullPage:true});
});
