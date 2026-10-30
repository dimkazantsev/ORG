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
 const overflow=await page.locator('#gameContent').evaluate(el=>{const box=el.getBoundingClientRect();return Array.from(el.querySelectorAll('h1,.question-picture,.option,.rich-choice,.rich-row,.rich-send,.assembly-preview,.player-answer')).filter(x=>x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden').map(x=>{const r=x.getBoundingClientRect();return {tag:x.className||x.tagName,bottom:r.bottom-box.bottom,right:r.right-box.right,left:box.left-r.left,overflow:x.scrollHeight-x.clientHeight}}).filter(x=>x.bottom>2||x.right>2||x.left>2||x.overflow>2)});
 const where=await page.evaluate(()=>({width:innerWidth,height:innerHeight,
  kind:ctx.room?.question?.kind,prompt:ctx.room?.question?.prompt?.slice(0,70),
  phase:ctx.room?.phase,answer:ctx.room?.has_answer,
  layout:document.querySelector('#gameContent .option-list')?.className}));
 expect(overflow,JSON.stringify(where)).toEqual([]);
}
for(const [width,height] of [[320,480],[320,568],[390,844],[768,1024],[667,375],[568,320]])test('All flag answers fit one screen at '+width+'×'+height,async({page})=>{
 await page.setViewportSize({width,height});await setup(page);
 for(const mode of ['similar','assemble','multiple','memory','geo','history']){
  const row=rows.find(x=>x.mode===mode),q={kind:row.kind,prompt:row.prompt,options:row.options,media_url:row.solution.media_url,flag_memory:row.solution.flag_memory,flag_assembly:row.solution.flag_assembly,memory_until:new Date(Date.now()-1).toISOString()};
  await question(page,q);await fits(page);
  await page.evaluate(()=>{ctx.room.has_answer=true;ctx.gameRenderKey='';renderGame();notice('gameNotice','Ответ сохранён.','success')});await fits(page);await expect(page.locator('.player-responses .player-answer-confirmation')).toContainText('Ответ принят.');await expect(page.locator('#playerAccepted')).toHaveCount(0);
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
test('Team tapping controls stay on screen while fifteen live ranks remain in the panel',async({page})=>{
 await page.setViewportSize({width:320,height:480});await setup(page);await question(page,{});
 await page.evaluate(()=>{window.arcadeFixture={mode:'tug',running:true,server_now:new Date().toISOString(),ends_at:new Date(Date.now()+30000).toISOString(),teams:Array.from({length:15},(_,i)=>({id:'t'+i,name:'Команда '+(i+1),points:i,taps:i,place:i+1})),mine:{team_id:'t0',credits:0},awards:[]};ctx.room.phase='intermission';ctx.room.activity={title:'Командная тапалка',settings:{arcade_mode:'tug'}};ctx.gameRenderKey='';renderGame()});
 await expect(page.locator('[data-arcade-tap]')).toBeInViewport();await page.locator('#playerMore').click();await expect(page.locator('#playerArcadeDetails .arcade-rank')).toHaveCount(15);
 await page.evaluate(()=>{window.arcadeFixture.teams[0].taps=250});await expect(page.locator('#playerArcadeDetails .arcade-rank-score').first()).toHaveText('250 тапов');await page.locator('#playerDetailsClose').click();await page.locator('[data-arcade-tap]').click();
 await expect.poll(()=>page.evaluate(()=>window.sent.some(x=>x.name==='qwiz_arcade_action'&&x.args.p_action==='tap'))).toBe(true);expect(await page.evaluate(()=>scrollY)).toBe(0);
});
test('Rotation and desktop restore preserve controls and result details',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await question(page,{prompt:'Выберите страну',options:['Франция','Италия','Канада','Греция']},'result');await fits(page);
 await page.locator('#playerMore').click();await expect(page.locator('#playerDetails .personal-results')).toBeVisible();await page.locator('#playerDetailsClose').click();await page.setViewportSize({width:844,height:390});await fits(page);
 await page.setViewportSize({width:1440,height:1000});await expect(page.locator('html')).not.toHaveClass(/player-compact/);await expect(page.locator('#playerMore')).not.toBeVisible();await expect(page.locator('#gameView .game-top #gameFullscreen')).toBeVisible();await expect(page.locator('#gameContent .personal-results')).toBeVisible();
 await page.setViewportSize({width:390,height:700});await fits(page);await page.locator('#playerMore').click();await page.locator('#leaveGame').click();await expect(page.locator('html')).not.toHaveClass(/player-compact/);await expect(page.locator('#playerDetails')).not.toBeVisible();
});


test('Finished arcade boost ballot stays entirely visible and accepts a vote at 390x650 and 320x480',async({page})=>{
 for(const [width,height] of [[390,650],[320,480]]){
  await page.setViewportSize({width,height});
  await setup(page);
  await page.evaluate(()=>{
   showScreen('game');
   const now=Date.now();
   const view={code:'ABCDEF12',mode:'tug',running:false,
    server_now:new Date(now).toISOString(),
    started_at:new Date(now-13000).toISOString(),
    ends_at:new Date(now-1000).toISOString(),
    mine:{team_id:'team-a',captain:false},
    teams:[{id:'team-a',name:'Несгибаемые',points:8,place:1}],
    awards:[],vote:{winner_team:'team-a',can_vote:true,open:true,stage:'strategy',strategy:null,target_name:'Соперники',
      vote_ends_at:new Date(now+30000).toISOString(),counts:{},my_choice:null}};
   window.boostVoteFixture=view;
   const client={rpc:async(name,args)=>{if(name==='qwiz_vote_boost')window.voteChoiceFixture=args.p_choice;
    if(name==='qwiz_vote_boost'){
     if(window.voteChoiceFixture==='support'){view.vote.stage='option';view.vote.strategy='support';view.vote.my_choice=null;view.vote.counts={};}
     else {view.vote.my_choice='headstart';view.vote.counts.headstart=1;}
     return {data:{ok:true},error:null}
    }
    return {data:view,error:null};
   }};
   QwizArcade.mountPlayer(document.querySelector('#gameContent'),{
     code:'ABCDEF12',room_id:'00000000-0000-4000-8000-000000000091',
     activity:{settings:{arcade_mode:'tug'}}}, {client});
  });
  await expect(page.locator('.arcade-player.is-boost-voting')).toBeVisible();
  await expect(page.locator('[data-boost-choice]')).toHaveCount(2);
  await expect(page.locator('[data-boost-choice="support"]')).toBeEnabled();
  await page.locator('[data-boost-choice="support"]').click();
  await expect(page.locator('[data-boost-choice]')).toHaveCount(3);
  const bounds=await page.evaluate(()=>{
   const container=document.querySelector('dialog.arcade-boost-dialog[open]').getBoundingClientRect();
   return [...document.querySelectorAll('[data-boost-choice]')].map(b=>{
    const r=b.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,hostTop:container.top,hostBottom:container.bottom,
      hostLeft:container.left,hostRight:container.right};
   });
  });
  for(const r of bounds){
   expect(r.top).toBeGreaterThanOrEqual(r.hostTop-2);
   expect(r.bottom).toBeLessThanOrEqual(r.hostBottom+2);
   expect(r.left).toBeGreaterThanOrEqual(r.hostLeft-2);
   expect(r.right).toBeLessThanOrEqual(r.hostRight+2);
  }
  await expect(page.locator('[data-boost-choice="headstart"]')).toBeEnabled();
  await page.locator('[data-boost-choice="headstart"]').click();
  await expect(page.locator('dialog.arcade-boost-dialog')).not.toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.voteChoiceFixture)).toBe('headstart');
 }
});


test('Phone displays synchronized card introductions, round rankings and full finale with thumb-zone statistics',async({page})=>{
 for(const [width,height] of [[320,480],[390,700]]){
  await page.setViewportSize({width,height});await setup(page);
  await page.evaluate(()=>{
   const teams=Array.from({length:5},(_,i)=>({id:'t'+i,name:'Команда '+(i+1),score:400-i*50,members:2,rank:i+1}));
   const players=Array.from({length:10},(_,i)=>({nickname:'Участник '+(i+1),score:160-i*8,position:i+1}));
   const room={code:'A1B2C3D4',room_id:'00000000-0000-4000-8000-000000001321',title:'Тест раундов',
     phase:'intermission',index:2,total:10,me:{id:'me',team_id:'t0'},teams,public_stats:{teams,players},
     activity:{type:'card_intro',title:'География России',icon:'map',settings:{queued_icon:'map'}},
     ends_at:new Date(Date.now()+4500).toISOString()};
   ctx.room=room;window.roundFixture=room;ctx.gameRenderKey='';
   showScreen('game');renderGame();
  });
  await expect(page.locator('#gameContent .round-intro')).toBeVisible();
  await expect(page.locator('#gameContent .round-intro h1')).toContainText('География России');
  const low=await page.locator('#playerMore').boundingBox();
  expect(low).not.toBeNull();expect(low.y+low.height).toBeLessThanOrEqual(height+2);
  expect(low.y).toBeGreaterThan(height*0.67);
  await expect(page.locator('#playerMore .player-more-label')).toHaveText('Статистика');
  await page.evaluate(()=>{
   const r=window.roundFixture;r.activity={type:'round_stats',title:'Итоги раунда'};
   r.round_results={teams:r.teams.map(t=>({...t,score:9999999999+t.rank})),
     players:r.public_stats.players.map(p=>({...p,score:5555555555-p.score}))};
   ctx.gameRenderKey='';renderGame();
  });
  await expect(page.locator('.round-results-grid .round-score-list')).toHaveCount(2);
  await expect(page.locator('.round-results-grid .round-score-list li')).toHaveCount(6);
  await expect(page.locator('.round-results-grid .round-more-count')).toHaveCount(2);
  await page.evaluate(()=>{window.roundFixture.phase='finished';ctx.gameRenderKey='';renderGame()});
  await expect(page.locator('#gameContent .player-final-results')).toBeVisible();
  await expect(page.locator('#gameContent .player-final-results .habitat-team')).toHaveCount(5);
 }
});


test('Two-stage penalty vote opens a red majority choice then lets players choose a specific hindrance',async({page})=>{
 for(const [width,height] of [[320,480],[390,700]]){
  await page.setViewportSize({width,height});
  await setup(page);
  await page.evaluate(()=>{
   showScreen('game');
   const now=Date.now();
   const vote={winner_team:'team-a',can_vote:true,open:true,
    stage:'strategy',strategy:null,counts:{},my_choice:null,
    target_name:'Команда-соперник',vote_ends_at:new Date(now+14000).toISOString()};
   window.penaltyFixture={code:'ABCDEF12',mode:'tug',running:false,
    server_now:new Date(now).toISOString(),started_at:new Date(now-12000).toISOString(),
    ends_at:new Date(now-1000).toISOString(),mine:{team_id:'team-a'},
    teams:[{id:'team-a',name:'Лидеры',points:90,place:1},
           {id:'team-b',name:'Соперники',points:12,place:2}],
    awards:[],vote};
   window.penaltyCalls=[];
   const client={rpc:async(name,args)=>{
    if(name==='qwiz_vote_boost'){
     window.penaltyCalls.push(args.p_choice);
     if(args.p_choice==='sabotage'){vote.strategy='sabotage';vote.stage='option';
      vote.my_choice=null;vote.counts={};}
     else {vote.my_choice=args.p_choice;vote.counts[args.p_choice]=1;}
     return {data:{ok:true},error:null};
    }
    return {data:window.penaltyFixture,error:null};
   }};
   QwizArcade.mountPlayer(document.querySelector('#gameContent'),{
    code:'ABCDEF12',room_id:'00000000-0000-4000-8000-000000000091',
    activity:{settings:{arcade_mode:'tug'}}},{client});
  });
  await expect(page.locator('[data-boost-choice]')).toHaveCount(2);
  await expect(page.locator('[data-boost-choice="sabotage"]')).toBeVisible();
  await page.locator('[data-boost-choice="sabotage"]').click();
  await expect(page.locator('[data-boost-choice]')).toHaveCount(3);
  await expect(page.locator('[data-boost-choice="fog"]')).toBeVisible();
  await expect(page.locator('[data-boost-choice="storm"]')).toBeVisible();
  await expect(page.locator('[data-boost-choice="drain"]')).toBeVisible();
  await page.locator('[data-boost-choice="storm"]').click();
  await expect(page.locator('dialog.arcade-boost-dialog')).not.toBeVisible();
  const calls=await page.evaluate(()=>window.penaltyCalls);
  expect(calls).toEqual(['sabotage','storm']);
  // The completed choice closes the modal; it must not remain stuck over the game.
  await expect(page.locator('dialog.arcade-boost-dialog[open]')).toHaveCount(0);
 }
});


test('Centered lobby constellation is visible without Play and the signal caption never overlaps decoration',async({page})=>{
 for(const [width,height] of [[320,480],[360,640],[390,844]]){
  await page.setViewportSize({width,height});
  await setup(page);
  await page.evaluate(()=>{
   window.fixture={code:'ABCDEF12',title:'Тест игры',phase:'lobby',index:0,total:5,me:{id:'p1',team_id:'t1'},
    teams:[{id:'t1',name:'Несгибаемые',score:0,players:1}],public_stats:{teams:[],players:[]},
    ends_at:null,activity:null,has_answer:false,eligible:true};
   ctx.room=window.fixture;
   ctx.gameRenderKey='';
   showScreen('game');
   renderGame();
  });
  const lobby=page.locator('.game-lobby-wait');
  await expect(lobby).toBeVisible();
  await expect(lobby.locator('.lobby-play-mark')).toHaveCount(0);
  await expect(lobby.locator('.lobby-signal-center')).toBeVisible();
  await expect(lobby.locator('.lobby-signal-node')).toHaveCount(4);
  await expect(lobby.locator('.lobby-ambient span')).toHaveCount(0);
  await expect(lobby.locator('.lobby-people')).toContainText('Ожидайте сигнала преподавателя');
  const coords=await page.evaluate(()=>{
   const find=q=>{const r=document.querySelector(q).getBoundingClientRect();
     return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}};
   return {caption:find('.lobby-people'),progress:find('.lobby-progress'),
      icon:find('.lobby-signal'),game:find('#gameContent'),height:innerHeight};
  });
  expect(coords.caption.top).toBeGreaterThanOrEqual(coords.progress.bottom-1);
  expect(coords.caption.bottom).toBeLessThanOrEqual(coords.game.bottom+2);
  expect(coords.caption.left).toBeGreaterThanOrEqual(coords.game.left-2);
  expect(coords.caption.right).toBeLessThanOrEqual(coords.game.right+2);
  expect(coords.icon.bottom).toBeLessThan(coords.caption.top);
 }
});


test('Tug mini-game gets a playable portrait-height viewport, without hiding the tap control',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await question(page,{prompt:'Тест мини-игры',options:['1','2']});
 await page.evaluate(()=>{
  window.arcadeFixture={mode:'tug',running:true,server_now:new Date().toISOString(),
   ends_at:new Date(Date.now()+45000).toISOString(),teams:[{id:'t',name:'Исследователи',points:5,place:1}],
   mine:{team_id:'t',credits:0},awards:[]};
  ctx.room.phase='intermission';ctx.room.activity={title:'Тап-баттл',
   settings:{arcade_mode:'tug'}};ctx.gameRenderKey='';renderGame();
 });
 const scene=page.locator('.arcade-player .arcade-scene:has(.arcade-tap-stage)');
 await expect(scene).toBeVisible();
 await expect.poll(()=>scene.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(118);
 await expect(page.locator('[data-arcade-tap]')).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('Personal round totals stay horizontal on narrow phones',async({page})=>{
 for(const width of [320,360,390,465]){
  await page.setViewportSize({width,height:790});
  await setup(page);
  await page.evaluate(()=>{
   window.fixture={
    code:'ABCDEF12',room_id:'fixture-room',phase:'intermission',title:'ОРГ',index:0,total:2,
    ends_at:new Date(Date.now()+15000).toISOString(),
    activity:{type:'round_stats',title:'Итоги раунда',settings:{stats_seconds:7}},
    round_results:{
     teams:[{id:'fixture-team',name:'Пружинистые',score:700}],
     players:[{id:'fixture-player',name:'Дима',score:700}],
     team_unit:'баллы раунда',player_unit:'баллы раунда'
    },
    teams:[{id:'fixture-team',name:'Пружинистые',score:700}],
    me:{id:'fixture-player',team_id:'fixture-team'},public_stats:{teams:[],players:[]},
    server_now:new Date().toISOString()
   };
   ctx.room=window.fixture;ctx.gameRenderKey='';
   showScreen('game');renderGame();
  });
  const numbers=page.locator('#gameContent .round-self-summary strong');
  await expect(numbers).toHaveCount(2);
  for(const number of await numbers.all()){
   await expect(number).toHaveText('700');
   const geometry=await number.evaluate(el=>{
    const parent=el.closest('.round-self-summary>div');
    const range=document.createRange();range.selectNodeContents(el);
    const textRect=range.getBoundingClientRect();
    const parentRect=parent.getBoundingClientRect();
    return {top:textRect.top,bottom:textRect.bottom,width:textRect.width,available:parentRect.width};
   });
   expect(geometry.bottom-geometry.top,JSON.stringify({width,geometry})).toBeLessThan(75);
   expect(geometry.width,JSON.stringify({width,geometry})).toBeLessThan(geometry.available+1);
  }
 }
});

test('Answer confirmation remains at bottom without resizing choice buttons or header',async({page})=>{
 for(const [width,height] of [[320,480],[390,844],[667,375]]){
  await page.setViewportSize({width,height});
  await setup(page);
  await question(page,{kind:'single',prompt:'Выберите государство на карте',options:['Россия','Канада','Италия','Франция']});
  await expect(page.locator('html')).toHaveClass(/player-compact/);
  const before=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};
   return {
    cards:[...document.querySelectorAll('#gameContent [data-answer]')].map(rect),
    card:rect(document.querySelector('#gameContent')),
    team:rect(document.querySelector('#playerTeamName')),
    footer:rect(document.querySelector('#gameContent .player-answer-confirmation'))
   };
  });
  await page.evaluate(()=>{
   ctx.room.has_answer=true;ctx.gameRenderKey='';renderGame();
   notice('gameNotice','Ответ сохранён.','success');
  });
  await expect(page.locator('.player-responses>.player-answer-confirmation')).toBeVisible();
  await expect(page.locator('.player-responses>.player-answer-confirmation')).toContainText('Ответ принят.');
  await expect(page.locator('#playerAccepted')).toHaveCount(0);
  await expect(page.locator('#playerTeamName')).toBeVisible();
  await expect(page.locator('#gameNotice')).toBeHidden();
  const after=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};
   return {
    cards:[...document.querySelectorAll('#gameContent [data-answer]')].map(rect),
    card:rect(document.querySelector('#gameContent')),
    team:rect(document.querySelector('#playerTeamName')),
    footer:rect(document.querySelector('#gameContent .player-answer-confirmation'))
   };
  });
  expect(after.cards).toHaveLength(4);
  for(let i=0;i<4;i++){
   expect(Math.abs(after.cards[i].top-before.cards[i].top)).toBeLessThanOrEqual(1);
   expect(Math.abs(after.cards[i].height-before.cards[i].height)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(after.card.height-before.card.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.team.height-before.team.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.footer.height-before.footer.height)).toBeLessThanOrEqual(1);
  await fits(page);
 }
});

test('No sending or acceptance popup appears above mobile answer cards',async({page})=>{
 for(const [width,height] of [[320,480],[390,844],[667,375]]){
  await page.setViewportSize({width,height});
  await setup(page);
  await question(page,{kind:'single',prompt:'Кому принадлежит этот государственный флаг?',options:['Армения','Доминика','Камбоджа','Науру']});
  await page.evaluate(()=>{
   const original=ctx.client.rpc.bind(ctx.client);
   window.__releaseAnswer=null;
   ctx.client.rpc=(name,args)=>name==='org_next_answer'
    ?new Promise(resolve=>{window.__releaseAnswer=()=>resolve({data:{accepted:true},error:null})})
    :original(name,args);
  });
  const before=await page.locator('#gameContent [data-answer]').evaluateAll(nodes=>nodes.map(el=>{
   const r=el.getBoundingClientRect();return {top:r.top,height:r.height};
  }));
  await page.locator('#gameContent [data-answer]').first().click();
  await expect.poll(()=>page.evaluate(()=>ctx.answerPending)).toBe(true);
  await expect(page.locator('#gameNotice')).toBeHidden();
  expect(await page.locator('#gameNotice').textContent()).not.toMatch(/Отправляем|Ответ сохран|Ответ принят сервером/);
  const whileSending=await page.locator('#gameContent [data-answer]').evaluateAll(nodes=>nodes.map(el=>{
   const r=el.getBoundingClientRect();return {top:r.top,height:r.height};
  }));
  expect(whileSending).toEqual(before);
  await page.evaluate(()=>window.__releaseAnswer());
  await expect.poll(()=>page.evaluate(()=>ctx.answerPending)).toBe(false);
  await page.evaluate(()=>{ctx.room.has_answer=true;ctx.gameRenderKey='';renderGame()});
  await expect(page.locator('.player-answer-confirmation')).toContainText('Ответ принят.');
  await expect(page.locator('#gameNotice')).toBeHidden();
  const after=await page.locator('#gameContent [data-answer]').evaluateAll(nodes=>nodes.map(el=>{
   const r=el.getBoundingClientRect();return {top:r.top,height:r.height};
  }));
  for(let i=0;i<before.length;i++){
   expect(Math.abs(after[i].top-before[i].top)).toBeLessThanOrEqual(1);
   expect(Math.abs(after[i].height-before[i].height)).toBeLessThanOrEqual(1);
  }
  // Real validation errors remain visible, but are anchored below (never above).
  await page.evaluate(()=>notice('gameNotice','Проверьте соединение.','error'));
  const placement=await page.locator('#gameNotice').evaluate(el=>{
   const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,screen:innerHeight};
  });
  expect(placement.bottom).toBeLessThanOrEqual(placement.screen+1);
  expect(placement.top).toBeGreaterThan(height*.60);
 }
});

test('Chosen answer has pale grey selected state during send, after acceptance and after a read refresh',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page);
 await question(page,{kind:'flag',prompt:'Какой это флаг?',options:['Армения','Италия','Франция','Науру']});
 await expect(page.locator('#gameContent .option.is-picked')).toHaveCount(0);
 await page.evaluate(()=>{
  window.releaseChoice=null;
  const previous=ctx.client.rpc.bind(ctx.client);
  ctx.client.rpc=(name,args)=>name==='org_next_answer'
   ?new Promise(resolve=>{window.releaseChoice=()=>resolve({data:{accepted:true},error:null})})
   :previous(name,args);
 });
 const before=await page.locator('#gameContent [data-answer]').evaluateAll(items=>items.map(el=>el.getBoundingClientRect().height));
 await page.locator('#gameContent [data-answer="2"]').click();
 const selected=page.locator('#gameContent [data-answer="2"]');
 await expect(selected).toHaveClass(/is-picked/);
 await expect(selected).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>selected.evaluate(el=>getComputedStyle(el).backgroundColor),{timeout:1600}).toBe('rgb(238, 240, 243)');
 await expect(page.locator('#gameContent .option.is-picked')).toHaveCount(1);
 await expect(page.locator('#gameNotice')).toBeHidden();
 const during=await page.locator('#gameContent [data-answer]').evaluateAll(items=>items.map(el=>el.getBoundingClientRect().height));
 expect(during).toEqual(before);
 await page.evaluate(()=>window.releaseChoice());
 await expect.poll(()=>page.evaluate(()=>ctx.answerPending)).toBe(false);
 await expect(page.locator('#gameContent [data-answer="2"]')).toHaveClass(/is-picked/);
 await expect(page.locator('.player-answer-confirmation')).toContainText('Ответ принят');
 await page.evaluate(()=>{ctx.gameRenderKey='';renderGame()});
 await expect(page.locator('#gameContent [data-answer="2"]')).toHaveClass(/is-picked/);
 await expect(page.locator('#gameNotice')).toBeHidden();
 const after=await page.locator('#gameContent [data-answer]').evaluateAll(items=>items.map(el=>el.getBoundingClientRect().height));
 expect(after).toEqual(before);
 await page.evaluate(()=>{ctx.room.index=1;ctx.room.has_answer=false;ctx.room.ends_at=new Date(Date.now()+60000).toISOString();ctx.gameRenderKey='';renderGame()});
 await expect(page.locator('#gameContent .option.is-picked')).toHaveCount(0);
});

test('Legacy sending or saved status cannot create a top answer notification',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page);
 await question(page,{kind:'single',prompt:'Выберите ответ',options:['А','Б','В','Г']});
 for(const phrase of ['Отправляем ответ…','Отправка ответа','Ответ записан','Ответ сохранён','Ответ принят сервером']){
  await page.evaluate(value=>notice('gameNotice',value,'error'),phrase);
  await expect(page.locator('#gameNotice')).toBeEmpty();
  await expect(page.locator('#gameNotice')).toBeHidden();
 }
 await page.evaluate(()=>notice('gameNotice','Неверный формат ответа.','error'));
 await expect(page.locator('#gameNotice')).toContainText('Неверный формат ответа.');
 await expect(page.locator('#gameNotice')).toBeVisible();
});

test('Captain selection uses one responsive scene, with the claim action inside it',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page);
 await page.evaluate(()=>{
  ctx.room={code:'ABCDEF12',room_id:'00000000-0000-4000-8000-000000000091',
   title:'Квиз',phase:'lobby',index:0,teams:[],me:{id:'player-a',team_id:null},
   team_lobby:{mode:'captain',captains_ready:false,can_claim:true,captain_count:0,team_count:1,
    captain_started_at:new Date(Date.now()-1500).toISOString()}};
  ctx.gameRenderKey='';showScreen('game');renderGame();
 });
 await expect(page.locator('#gameContent .player-team-building')).toBeVisible();
 await expect(page.locator('#gameContent .team-captain-hero-action')).toHaveCount(1);
 await expect(page.locator('#playerTeamPanel')).toBeHidden();
 await expect(page.locator('#gameContent .team-building-center')).toContainText('Выбираем капитанов');
});

test('Invalid multi-choice warning disappears instead of blocking the next card',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page);
 await question(page,{kind:'multi',prompt:'Выберите несколько вариантов',options:['Раз','Два','Три']});
 await page.locator('[data-submit-rich]').click();
 await expect(page.locator('#gameNotice')).toContainText('Отметьте хотя бы один вариант');
 await page.waitForTimeout(3950);
 await expect(page.locator('#gameNotice')).toBeEmpty();
 await expect(page.locator('#gameNotice')).not.toHaveClass(/error/);
});
