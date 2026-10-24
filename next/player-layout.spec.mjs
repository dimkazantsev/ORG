import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const {rows}=createRequire(import.meta.url)('./scripts/build-flags-six.cjs');
const base='http://127.0.0.1:8080/next/';
async function setup(page){
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.sent=[];window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async(name,args)=>{window.sent.push({name,args});return {data:name==="qwiz_party_arcade"&&window.arcadeFixture?window.arcadeFixture:window.fixture||{registered:false}}}})};'}));
 await page.route('https://dimkazantsev.github.io/ORG/next/assets/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#7040db"/></svg>'}));
 await page.goto(base);
}
async function question(page,q,phase='question'){
 await page.evaluate(({q,phase})=>{window.fixture={code:'ABCDEF12',room_id:'room',title:'Флаги мира',phase,index:0,total:12,duration:60,ends_at:new Date(Date.now()+60000).toISOString(),question:q,teams:[{id:'t',name:'Исследователи',score:125,members:2}],public_stats:{teams:[{id:'t',name:'Исследователи',score:125,members:2}],players:[]},me:{id:'p',team_id:'t'},answer:phase==='result'?{text:'Франция'}:undefined};ctx.room=window.fixture;ctx.gameRenderKey='';showScreen('game');renderGame()},{q,phase});
}
async function fits(page){
 await expect(page.locator('html')).toHaveClass(/player-compact/);
 await expect.poll(()=>page.evaluate(()=>Math.max(document.documentElement.scrollHeight-innerHeight,document.documentElement.scrollWidth-innerWidth))).toBeLessThanOrEqual(1);
 const overflow=await page.locator('#gameContent').evaluate(el=>{const box=el.getBoundingClientRect();return Array.from(el.querySelectorAll('h1,.question-picture,.option,.rich-choice,.rich-row,.rich-send,.assembly-preview,.player-answer')).filter(x=>x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden').map(x=>{const r=x.getBoundingClientRect();return {tag:x.className||x.tagName,bottom:r.bottom-box.bottom,right:r.right-box.right,left:box.left-r.left,overflow:x.scrollHeight-x.clientHeight}}).filter(x=>Math.max(x.bottom,x.right,x.left,x.overflow)>2)});
 expect(overflow).toEqual([]);
}
for(const [width,height] of [[320,480],[320,568],[390,844],[768,1024],[667,375],[568,320]])test('All flag answers fit one screen at '+width+'×'+height,async({page})=>{
 await page.setViewportSize({width,height});await setup(page);
 for(const mode of ['similar','assemble','multiple','memory','geo','history']){
  const row=rows.find(x=>x.mode===mode),q={kind:row.kind,prompt:row.prompt,options:row.options,media_url:row.solution.media_url,flag_memory:row.solution.flag_memory,flag_assembly:row.solution.flag_assembly,memory_until:new Date(Date.now()-1).toISOString()};
  await question(page,q);await fits(page);
  await page.evaluate(()=>{ctx.room.has_answer=true;ctx.gameRenderKey='';renderGame();notice('gameNotice','Ответ сохранён.','success')});await fits(page);await expect(page.locator('#playerAccepted')).toHaveText('Ответ принят.');
 }
 await page.mouse.wheel(0,600);expect(await page.evaluate(()=>scrollY)).toBe(0);
 await page.screenshot({path:'visual-artifacts/player-compact-'+width+'x'+height+'.png'});
});
test('Bottom panel traps focus, shows live details and restores the selected answer',async({page})=>{
 await page.setViewportSize({width:390,height:700});await setup(page);const row=rows.find(x=>x.mode==='multiple');await question(page,{kind:'multi',prompt:row.prompt,options:row.options});
 await page.locator('[data-multi="1"]').check();await page.locator('#playerMore').click();await expect(page.locator('#playerDetails')).toBeVisible();await expect(page.locator('#playerDetails #playerScoreboard')).toContainText('Исследователи');
 await page.screenshot({path:'visual-artifacts/player-bottom-sheet.png'});
 await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.getElementById('playerDetails').contains(document.activeElement))).toBe(true);
 await page.evaluate(()=>{ctx.room.teams[0].score=200;renderGame()});await expect(page.locator('#playerDetails #playerScoreboard')).toContainText('200');
 await page.keyboard.press('Escape');await expect(page.locator('#playerDetails')).not.toBeVisible();await expect(page.locator('#playerMore')).toBeFocused();await expect(page.locator('[data-multi="1"]')).toBeChecked();
 await page.locator('[data-submit-rich]').click();expect(await page.evaluate(()=>window.sent.find(x=>x.name==='qwiz_submit_answer')?.args.p_payload.indices)).toEqual([1]);
});
test('Older flag formats and long answer labels remain entirely visible',async({page})=>{
 await setup(page);const image='https://dimkazantsev.github.io/ORG/next/assets/flags-world/fr.svg',labels=['Французская Республика','Итальянская Республика','Соединённое Королевство Великобритании и Северной Ирландии','Федеративная Республика Германия'];
 const variants=[{kind:'flag',prompt:'Какому государству принадлежит этот флаг?',media_url:image,options:labels},{kind:'flag',prompt:'Выберите флаг Франции',options:[0,1,2,3].map(()=>({image_url:image}))},{kind:'flag',prompt:'Выберите порядок полос',options:[0,1,2,3].map(()=>({orientation:'vertical',stripes:['#0000ff','#ffffff','#ff0000']}))},...['symbol','crop','pixel'].map(type=>({kind:'flag',prompt:'Определите государство по показанной детали флага',media_url:image,flag_visual:{type},options:labels}))];
 for(const [width,height] of [[320,480],[667,375]]){await page.setViewportSize({width,height});for(const q of variants){await question(page,q);await fits(page);await expect(page.locator('#gameContent [data-answer]')).toHaveCount(4)}}
 await page.screenshot({path:'visual-artifacts/player-flag-landscape.png'});
});
test('Keyboard-sized viewport, waiting phases and timer changes keep the page fixed',async({page})=>{
 await page.setViewportSize({width:390,height:650});await setup(page);
 await question(page,{kind:'text',prompt:'Назовите государство, флаг которого изображён на экране'});await page.locator('#richTextAnswer').fill('Франция');await page.setViewportSize({width:390,height:350});await fits(page);await expect(page.locator('#richTextAnswer')).toHaveValue('Франция');
 await page.setViewportSize({width:390,height:650});for(const phase of ['lobby','countdown','finished']){await question(page,{},phase);await fits(page)}
 await question(page,{prompt:'Выберите страну',options:['Франция','Италия','Канада','Греция']});const initial=await page.locator('#playerTimer').textContent();await expect.poll(()=>page.locator('#playerTimer').textContent()).not.toBe(initial);await fits(page);
});
test('Panel closes by its button, background tap and downward swipe',async({page})=>{
 await page.setViewportSize({width:390,height:700});await setup(page);await question(page,{prompt:'Выберите страну',options:['Франция','Италия','Канада','Греция']});
 for(const mode of ['button','backdrop','swipe']){await page.locator('#playerMore').click();if(mode==='button')await page.locator('#playerDetailsClose').click();else if(mode==='backdrop')await page.mouse.click(4,4);else await page.locator('.player-sheet-head').evaluate(el=>{el.dispatchEvent(new TouchEvent('touchstart',{touches:[new Touch({identifier:1,target:el,clientY:100})]}));el.dispatchEvent(new TouchEvent('touchend',{changedTouches:[new Touch({identifier:1,target:el,clientY:190})]}))});await expect(page.locator('#playerDetails')).not.toBeVisible()}
});
test('Arcade controls stay on screen while fifteen live ranks remain in the panel',async({page})=>{
 await page.setViewportSize({width:320,height:480});await setup(page);await question(page,{});
 await page.evaluate(()=>{window.arcadeFixture={mode:'rocket',running:true,server_now:new Date().toISOString(),ends_at:new Date(Date.now()+30000).toISOString(),teams:Array.from({length:15},(_,i)=>({id:'t'+i,name:'Команда '+(i+1),points:i,place:i+1})),mine:{team_id:'t0',credits:0},awards:[]};ctx.room.phase='intermission';ctx.room.activity={title:'Ракетная гонка',settings:{arcade_mode:'rocket'}};ctx.gameRenderKey='';renderGame()});
 await expect(page.locator('[data-arcade-tap]')).toBeInViewport();await page.locator('#playerMore').click();await expect(page.locator('#playerArcadeDetails .arcade-rank')).toHaveCount(15);
 await page.evaluate(()=>{window.arcadeFixture.teams[0].points=250});await expect(page.locator('#playerArcadeDetails .arcade-rank-score').first()).toHaveText('250.0');await page.locator('#playerDetailsClose').click();await page.locator('[data-arcade-tap]').click();
 await expect.poll(()=>page.evaluate(()=>window.sent.some(x=>x.name==='qwiz_arcade_action'&&x.args.p_action==='tap'))).toBe(true);expect(await page.evaluate(()=>scrollY)).toBe(0);
});
test('Rotation and desktop restore preserve controls and result details',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await question(page,{prompt:'Выберите страну',options:['Франция','Италия','Канада','Греция']},'result');await fits(page);
 await page.locator('#playerMore').click();await expect(page.locator('#playerDetails .personal-results')).toBeVisible();await page.locator('#playerDetailsClose').click();await page.setViewportSize({width:844,height:390});await fits(page);
 await page.setViewportSize({width:1440,height:1000});await expect(page.locator('html')).not.toHaveClass(/player-compact/);await expect(page.locator('#playerMore')).not.toBeVisible();await expect(page.locator('#gameView .game-top #gameFullscreen')).toBeVisible();await expect(page.locator('#gameContent .personal-results')).toBeVisible();
 await page.setViewportSize({width:390,height:700});await fits(page);await page.locator('#playerMore').click();await page.locator('#leaveGame').click();await expect(page.locator('html')).not.toHaveClass(/player-compact/);await expect(page.locator('#playerDetails')).not.toBeVisible();
});
