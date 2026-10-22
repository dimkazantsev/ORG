import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:8080/next/';
async function studio(page,{delay=0}={}){
 await page.route('https://cdn.jsdelivr.net/**',async route=>{
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  await route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:"host"}}}})},rpc:async(name,args)=>{if(name==="org_quiz_is_admin_check")return {data:true};if(name==="qwiz_host_rooms")return {data:[{id:"room",code:"ABCDEF12",title:"Демо",phase:"lobby",players:0,teams:1}]};if(name==="qwiz_studio"&&args.p_action==="overview")return {data:{topics:[],builds:[{id:"build",title:"Демо"}]}};if(name==="qwiz_studio"&&args.p_action==="questions")return {data:{total:0,items:[]}};return {data:[]}},channel:()=>({on(){return this},subscribe(){return this}})})};'});
 });
}
test('Saved section never flashes Questions before the application finishes loading',async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('qwiz-studio-position-v3',JSON.stringify({section:'builder',scrollY:0}));
  window.paintedSections=[];
  const inspect=()=>{for(const id of ['bank','builder','rooms','insights']){const el=document.getElementById(id+'Page');if(el&&el.getClientRects().length&&getComputedStyle(el).visibility==='visible'&&Number(getComputedStyle(el).opacity)>.01)window.paintedSections.push(id)}requestAnimationFrame(inspect)};requestAnimationFrame(inspect);
 });
 await studio(page,{delay:700});await page.goto(base+'workspace.html');await expect(page.locator('#builderPage')).toBeVisible();
 expect(await page.evaluate(()=>window.paintedSections)).not.toContain('bank');
 await page.reload();await expect(page.locator('#builderPage')).toBeVisible();expect(await page.evaluate(()=>window.paintedSections)).not.toContain('bank');
});
test('Room status is Russian and its trash button aligns with Manage',async({page})=>{
 await studio(page);await page.goto(base+'workspace.html');await page.locator('[data-section="rooms"]').click();
 const row=page.locator('.room-row').first();await expect(row.locator('.chip').first()).toHaveText('Ожидание участников');
 await expect(row.locator('p')).toHaveText('0 участников · 1 команда');
 for(const width of [1280,320]){await page.setViewportSize({width,height:900});expect(await row.evaluate(el=>{const a=el.querySelector('[data-room]').getBoundingClientRect(),b=el.querySelector('[data-delete-room]').getBoundingClientRect();return Math.abs(a.y+a.height/2-b.y-b.height/2)})).toBeLessThanOrEqual(1)}
 await page.screenshot({path:'visual-artifacts/ui-mobile-room.png',fullPage:true});
});
test('Real SVG flags and generated stripe choices retain a visible area on a phone',async({page})=>{
 await page.setViewportSize({width:320,height:900});
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{registered:false}})})};'}));
 await page.route('https://dimkazantsev.github.io/ORG/next/assets/**',route=>route.fulfill({body:readFileSync(fileURLToPath(new URL('./assets/'+new URL(route.request().url()).pathname.split('/assets/')[1],import.meta.url))),contentType:'image/svg+xml'}));
 await page.goto(base);
 for(const question of [
  {kind:'flag',prompt:'Выберите правильный порядок полос',options:[0,1,2,3].map(()=>({orientation:'horizontal',stripes:['#ffffff','#0000ff','#ff0000']}))},
  ...['flag','multi'].map(kind=>({kind,prompt:'Выберите флаг Франции',options:['fr','it','gr','ca'].map(code=>({image_url:'https://dimkazantsev.github.io/ORG/next/assets/flags-world/'+code+'.svg'}))}))
 ]){
  await page.evaluate(question=>{ctx.room={code:'ABCDEF12',room_id:'room',phase:'question',index:0,total:1,duration:30,ends_at:new Date(Date.now()+30000).toISOString(),question,teams:[],public_stats:{teams:[]},me:{id:'p',team_id:'t'}};ctx.gameRenderKey='';showScreen('game');renderGame()},question);
  const visuals=page.locator('#gameContent .flag-stripe-art,#gameContent .flag-choice-art');await expect(visuals).toHaveCount(4);
  for(const visual of await visuals.all()){
   await visual.scrollIntoViewIfNeeded();await expect(visual).toBeVisible();const box=await visual.boundingBox();expect(box.width).toBeGreaterThanOrEqual(60);expect(box.height).toBeGreaterThanOrEqual(40);
   if(await visual.evaluate(el=>el.tagName==='IMG'))await expect.poll(()=>visual.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
  }
 }
 await page.screenshot({path:'visual-artifacts/ui-mobile-flags.png',fullPage:true});
});
for(const fallback of [false,true])test('The player can answer and leave '+(fallback?'the mobile focus mode':'native fullscreen'),async({page})=>{
 if(fallback){await page.setViewportSize({width:320,height:900});await page.addInitScript(()=>Object.defineProperty(document,'fullscreenEnabled',{value:false}))}
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:'window.answers=[];window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async(name,args)=>{if(name==="org_next_answer")window.answers.push(args);return {data:{registered:false}}}})};'}));
 await page.goto(base);
 await page.evaluate(()=>{ctx.room={code:'ABCDEF12',room_id:'room',phase:'question',index:0,total:1,duration:30,ends_at:new Date(Date.now()+30000).toISOString(),question:{kind:'flag',prompt:'Выберите страну',options:['Франция','Италия','Греция','Канада']},teams:[],public_stats:{teams:[]},me:{id:'p',team_id:'t'}};ctx.gameRenderKey='';showScreen('game');renderGame()});
 if(fallback)await page.locator('#playerMore').click();await page.locator('#gameFullscreen').click();await expect(page.locator('#gameFullscreen')).toHaveAttribute('aria-pressed','true');await page.locator('[data-answer="0"]').click();
 expect(await page.evaluate(()=>window.answers.length)).toBe(1);if(fallback)await page.locator('#playerMore').click();await page.locator('#gameFullscreen').click();await expect(page.locator('#gameFullscreen')).toHaveAttribute('aria-pressed','false');
 if(fallback){await page.locator('#playerMore').click();await page.locator('#gameFullscreen').click();await page.locator('#playerMore').click();await page.locator('#leaveGame').click();await expect(page.locator('html')).not.toHaveClass(/quiz-focus/);await expect(page.locator('#gameFullscreen')).toHaveAttribute('aria-pressed','false')}
});
test('The audience screen explains where to answer and links to the same room',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({rpc:async()=>({data:{code:"ABCDEF12",phase:"lobby",teams:[],lobby_teams:[]}}),channel:()=>({on(){return this},subscribe(){return this}})})};'}));
 await page.goto(base+'presenter.html?room=ABCDEF12');await expect(page.locator('#projectionPlay')).toBeVisible();await expect(page.locator('#projectionPlay')).toHaveAttribute('href',base+'?room=ABCDEF12');
 for(const width of [1280,320]){await page.setViewportSize({width,height:900});await expect(page.locator('#projectionPlay')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)}
 await expect(page.locator('.projection-footer')).toContainText('Отвечайте на своём устройстве');
});
test('Russian labels keep capitalization and count forms without changing assembly answer values',async({page})=>{
 await studio(page);await page.goto(base+'workspace.html');await expect(page.locator('#bankPage')).toBeVisible();
 await expect(page.locator('#launchTeams option[value="4"]')).toHaveText('4 команды');
 expect(await page.evaluate(()=>[0,1,2,5,11,21,24].map(n=>QwizStage.countLabel(n,{one:'команда',few:'команды',many:'команд',other:'команды'})))).toEqual(['0 команд','1 команда','2 команды','5 команд','11 команд','21 команда','24 команды']);
 expect(await page.evaluate(()=>['lobby','question','result','finished','countdown','intermission','unknown'].map(QwizStage.phaseLabel))).toEqual(['Ожидание участников','Вопрос','Разбор ответа','Игра завершена','Подготовка','Перерыв','Ожидание данных']);
 expect(await page.evaluate(()=>{const q={options:['белый','синий','красный'],flag_assembly:{orientation:'horizontal',colors:{белый:'#ffffff',синий:'#0000ff',красный:'#ff0000'}}};const root=document.createElement('div');root.innerHTML=QwizStage.assemblyMarkup(q);return {text:Array.from(root.querySelectorAll('select:first-of-type option')).slice(1).map(o=>o.textContent).slice(0,3),options:q.options}})).toEqual({text:['Белый','Синий','Красный'],options:['белый','синий','красный']});
});
