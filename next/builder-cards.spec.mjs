import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};'
 }));
 await page.goto('http://127.0.0.1:8080/next/workspace.html',{waitUntil:'load'});
 await expect(page.locator('#workspaceLoading')).toBeHidden();
 await page.evaluate(()=>{document.querySelector('#builderPage').hidden=false;newBuild()});
});

test('Selecting a card controls insertion order; controls do not accidentally select it',async({page})=>{
 const cards=page.locator('#roundCards .round-card');
 await expect(cards).toHaveCount(3);
 await cards.nth(0).click();
 await expect(cards.nth(0)).toHaveAttribute('aria-current','true');
 await page.locator('#cardPalette [data-card="round"]').click();
 await expect(cards).toHaveCount(4);
 await expect(cards.nth(1).locator('h3')).toHaveText('Раунд вопросов');
 await expect(cards.nth(1)).toHaveAttribute('aria-current','true');
 await expect(cards.nth(3).locator('h3')).toHaveText('Финал игры');
 await cards.nth(0).locator('[data-move]').last().click();
 await expect(cards.nth(0)).toHaveAttribute('aria-current','true');
 await cards.nth(0).dblclick();
 await expect(page.locator('#cardDialog')).toBeVisible();
 await page.locator('#cardDialog [data-close]').first().click();
 await cards.nth(1).locator('[data-edit-card]').click();
 await expect(page.locator('#cardDialog')).toBeVisible();
});

test('Two separate taps on a card open its settings',async({page})=>{
 const first=page.locator('#roundCards .round-card').first();
 await first.click();
 await expect(first).toHaveAttribute('aria-current','true');
 await first.click();
 await expect(page.locator('#cardDialog')).toBeVisible();
});

test('New geography and arcade cards insert after current card, retaining their settings',async({page})=>{
 const cards=page.locator('#roundCards .round-card');
 await cards.first().click();
 await page.locator('#openGamesPalette').click();
 await page.locator('#arcadePalette [data-geo="russia_map"]').click();
 await expect(cards.nth(1).locator('h3')).toContainText('География России');
 await expect(cards.nth(1)).toHaveAttribute('aria-current','true');
 await page.locator('#arcadePalette [data-arcade="captain"]').click();
 await expect(cards.nth(2).locator('h3')).toHaveText('Мэмори капитанов');
 await expect(cards.nth(2)).toHaveAttribute('aria-current','true');
 await expect(cards.last().locator('h3')).toHaveText('Финал игры');
});

for(const width of [390,768,1440]){
 test('Cards remain square, without clipping controls at width '+width,async({page})=>{
  await page.setViewportSize({width,height:940});
  const cards=page.locator('#roundCards .round-card');
  await expect(cards).toHaveCount(3);
  const measurements=await cards.evaluateAll(nodes=>nodes.map(n=>{
   const r=n.getBoundingClientRect();
   const controls=[...n.querySelectorAll('.round-actions button,.round-card-tools button')];
   return {width:r.width,height:r.height,controls:controls.map(b=>{
    const q=b.getBoundingClientRect();
    return {inside:q.left>=r.left-1&&q.right<=r.right+1&&q.top>=r.top-1&&q.bottom<=r.bottom+1,width:q.width,height:q.height};
   })};
  }));
  for(const c of measurements){
   expect(Math.abs(c.width-c.height)).toBeLessThanOrEqual(2);
   expect(c.controls.every(b=>b.inside)).toBe(true);
   expect(c.controls.every(b=>b.width>=28&&b.height>=28)).toBe(true);
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
 });
}


test('Mechanics expand by default with aligned SVG chevron and selected card has even borders',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const cards=page.locator('#roundCards .round-card');
 await cards.nth(1).click();
 await expect(cards.nth(1)).toHaveAttribute('aria-current','true');
 const bounds=await cards.nth(1).evaluate(el=>{
  const style=getComputedStyle(el);
  return {left:style.borderLeftWidth,right:style.borderRightWidth,decoration:getComputedStyle(el,'::before').content};
 });
 expect(bounds.left).toBe(bounds.right);
 expect(bounds.decoration).toBe('none');
 await cards.nth(1).locator('[data-edit-card]').click();
 const mechanics=page.locator('#cardModesDetails');
 await expect(mechanics).toHaveAttribute('open','');
 await expect(page.locator('#cardFlagModes [data-card-mode]')).toHaveCount(12);
 const svg=mechanics.locator('.card-modes-chevron');
 await expect(svg).toBeVisible();
 const box=await svg.evaluate(el=>{
  const a=el.getBoundingClientRect(),b=el.closest('summary').getBoundingClientRect();
  return {x:a.x,y:a.y,w:a.width,h:a.height,inside:a.x>=b.x&&a.right<=b.right&&a.y>=b.y&&a.bottom<=b.bottom};
 });
 expect(box.w).toBe(34);
 expect(box.h).toBe(34);
 expect(box.inside).toBe(true);
 await mechanics.locator('summary').click();
 await expect(mechanics).not.toHaveAttribute('open','');
 await mechanics.locator('summary').click();
 await expect(mechanics).toHaveAttribute('open','');
});

test('QWIZ favicon loads on editor without external assets',async({page})=>{
 const href=await page.locator('link[rel="icon"]').getAttribute('href');
 expect(href).toContain('favicon.svg');
 const response=await page.request.get(new URL(href,'http://127.0.0.1:8080/next/workspace.html').toString());
 expect(response.ok()).toBe(true);
 expect(await response.text()).toContain('qwiz-violet');
});


test('Ordinary Russia geography only offers question-bank modes and requires an explicit choice',async({page})=>{
 await page.evaluate(()=>{
  state.topics=[{id:'geo-topic',name:'География России'},{id:'flags-topic',name:'Флаги мира'}];
  state.cards[1].topic_id='geo-topic';
  state.cards[1].settings={...state.cards[1].settings,flag_modes:['fragments','errors'],geo_modes:[]};
  fillSelect($('cardTopic'),[['geo-topic','География России'],['flags-topic','Флаги мира']],'Без темы','geo-topic');
  editCard(1);
 });
 await expect(page.locator('#cardGeoQuestionModes')).toBeVisible();
 await expect(page.locator('#cardGeoQuestionModes input')).toHaveCount(2);
 await expect(page.locator('#cardFlagModes')).toBeHidden();
 await expect(page.locator('#cardGeoQuestionModes [value="capital"]')).not.toBeChecked();
 await expect(page.locator('#cardGeoQuestionModes [value="district"]')).not.toBeChecked();
 await page.locator('#cardForm button[type="submit"]').click();
 await expect(page.locator('#cardDialog')).toBeVisible();
 await expect(page.locator('#cardGeoQuestionModes [value="capital"]')).toHaveJSProperty('validationMessage','Выберите административный центр и/или федеральный округ');
 await page.locator('#cardGeoQuestionModes [value="capital"]').check();
 await page.locator('#cardForm button[type="submit"]').click();
 await expect(page.locator('#cardDialog')).not.toBeVisible();
 const s=await page.evaluate(()=>state.cards[1].settings);
 expect(s.geo_modes).toEqual(['capital']);
 expect(s.flag_modes).toEqual([]);
 expect(await page.locator('#roundCards .round-card').nth(1).textContent()).toContain('Административный центр');
});

test('Changing to Russia geography never imports stale flag selectors and changing back preserves explicit flags',async({page})=>{
 await page.evaluate(()=>{
  state.topics=[{id:'geo-topic',name:'География России'},{id:'flags-topic',name:'Флаги мира'}];
  state.cards[1].topic_id='flags-topic';
  state.cards[1].settings.flag_modes=['country','picker'];
  editCard(1);
  fillSelect($('cardTopic'),[['geo-topic','География России'],['flags-topic','Флаги мира']],'Без темы','flags-topic');
  syncCardModePanels();
 });
 await expect(page.locator('#cardFlagModes')).toBeVisible();
 await page.locator('#cardTopic').selectOption('geo-topic');
 await expect(page.locator('#cardFlagModes')).toBeHidden();
 await expect(page.locator('#cardGeoQuestionModes')).toBeVisible();
 await page.locator('#cardGeoQuestionModes [value="district"]').check();
 await page.locator('#cardForm button[type="submit"]').click();
 expect(await page.evaluate(()=>state.cards[1].settings.geo_modes)).toEqual(['district']);
 await page.evaluate(()=>{editCard(1);fillSelect($('cardTopic'),[['geo-topic','География России'],['flags-topic','Флаги мира']],'Без темы','geo-topic');});
 await page.locator('#cardTopic').selectOption('flags-topic');
 await expect(page.locator('#cardFlagModes')).toBeVisible();
 await expect(page.locator('#cardGeoQuestionModes')).toBeHidden();
 await page.locator('#cardFlagModes [data-card-mode="country"]').check();
 await page.locator('#cardFlagModes [data-card-mode="picker"]').check();
 await page.locator('#cardForm button[type="submit"]').click();
 expect(await page.evaluate(()=>state.cards[1].settings.flag_modes)).toEqual(['country','picker']);
 expect(await page.evaluate(()=>state.cards[1].settings.geo_modes)).toEqual([]);
});


for(const width of [320,390,768,1440]){
 test('Every mechanic selector is a readable aligned tile at viewport '+width,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{
   state.topics=[{id:'flags-topic',name:'Флаги мира'},{id:'geo-topic',name:'География России'}];
   fillSelect($('cardTopic'),[['flags-topic','Флаги мира'],['geo-topic','География России']],'Без темы','flags-topic');
   state.cards[1].topic_id='flags-topic';
   state.cards[1].settings.flag_modes=['country'];
   editCard(1);
  });
  for(const kind of ['flags','geography','russia-map']){
   if(kind==='geography')await page.locator('#cardTopic').selectOption('geo-topic');
   if(kind==='russia-map'){
    await page.evaluate(()=>{
     $('cardDialog').close();
     state.cards[1].settings.arcade_mode='russia_map';
     state.cards[1].topic_id='geo-topic';
     editCard(1);
    });
   }
   await expect(page.locator('#cardModesDetails .card-modes-title')).toHaveText(kind==='flags'?'Механики внутри темы':kind==='geography'?'Механики географии':'Механики карты России');
   const selector=kind==='flags'?'#cardFlagModes>.flag-mode-item':
    kind==='geography'?'#cardGeoQuestionModes>label.check-row':'#cardGeoModes>label';
   const tiles=page.locator(selector);
   await expect(tiles.first()).toBeVisible();
   await expect(tiles).toHaveCount(kind==='flags'?12:kind==='geography'?2:9);
   const metrics=await tiles.evaluateAll(elements=>elements.map(element=>{
    const label=element.getBoundingClientRect(),input=element.querySelector('input');
    const mark=input.getBoundingClientRect();
    const labelText=element.querySelector('span');
    const text=labelText?labelText.getBoundingClientRect():null;
    const style=getComputedStyle(element);
    const b=getComputedStyle(input);
    return {display:style.display,border:parseFloat(style.borderTopWidth),
      radius:parseFloat(style.borderTopLeftRadius),width:label.width,height:label.height,
      checkbox:{width:mark.width,height:mark.height,left:mark.left,right:mark.right,top:mark.top,bottom:mark.bottom},
      text:text?{left:text.left,top:text.top,bottom:text.bottom,right:text.right}:null,
      element:{left:label.left,right:label.right,top:label.top,bottom:label.bottom},
      inputStyle:b.width
    };
   }));
   for(const item of metrics){
    expect(item.display,kind+' tiles use flexible row').toBe('flex');
    expect(item.border,kind+' tiles have borders').toBeGreaterThanOrEqual(1);
    expect(item.radius,kind+' tiles have rounded corners').toBeGreaterThanOrEqual(8);
    expect(item.height,kind+' large touch targets').toBeGreaterThanOrEqual(45);
    expect(item.checkbox.width,kind+' checkbox width').toBeGreaterThanOrEqual(18);
    expect(item.checkbox.width,kind+' checkbox width').toBeLessThanOrEqual(25);
    expect(item.checkbox.height,kind+' checkbox height').toBeGreaterThanOrEqual(18);
    expect(item.checkbox.height,kind+' checkbox height').toBeLessThanOrEqual(25);
    expect(item.checkbox.left).toBeGreaterThanOrEqual(item.element.left-1);
    expect(item.checkbox.right).toBeLessThanOrEqual(item.element.right+1);
    if(item.text){
     expect(item.text.left).toBeGreaterThanOrEqual(item.checkbox.right+6);
     expect(item.text.right).toBeLessThanOrEqual(item.element.right+1);
     expect(item.text.top).toBeGreaterThanOrEqual(item.element.top-2);
     expect(item.text.bottom).toBeLessThanOrEqual(item.element.bottom+2);
    }
   }
   if(kind==='geography'){
    const info=await page.locator('#cardGeoQuestionModes>p.small-help').evaluate(el=>{
     const r=el.getBoundingClientRect(),grid=el.parentElement.getBoundingClientRect();
     return {left:r.left,right:r.right,top:r.top,width:r.width,gridLeft:grid.left,gridRight:grid.right,
      lastTileBottom:el.previousElementSibling.getBoundingClientRect().bottom};
    });
    expect(info.left).toBeGreaterThanOrEqual(info.gridLeft+10);
    expect(info.right).toBeLessThanOrEqual(info.gridRight-10);
    expect(info.width).toBeGreaterThan((info.gridRight-info.gridLeft)*.88);
    expect(info.top).toBeGreaterThanOrEqual(info.lastTileBottom+3);
   }
   if(kind==='russia-map'){
    await expect(page.locator('#cardGeoModes>label.disabled input')).toBeDisabled();
    const choice=page.locator('#cardGeoModes>label').first().locator('input');
    await choice.uncheck();await expect(choice).not.toBeChecked();
    await choice.check();await expect(choice).toBeChecked();
   }
   const overflow=await page.locator('#cardDialog').evaluate(el=>el.scrollWidth-el.clientWidth);
   expect(overflow,kind+' scroll clipping at '+width).toBeLessThanOrEqual(2);
  }
 });
}

test('All builder card types keep their settings, form fields, and dialog controls inside bounds',async({page})=>{
 await page.setViewportSize({width:390,height:840});
 await page.evaluate(()=>{
  state.topics=[{id:'flags-topic',name:'Флаги мира'},{id:'geo-topic',name:'География России'}];
  fillSelect($('cardTopic'),[['flags-topic','Флаги мира'],['geo-topic','География России']],'Без темы','flags-topic');
  state.cards=['intro','round','break','team_stats','player_stats','bonus','duel','finale'].map(type=>card(type));
  state.cards[1].topic_id='flags-topic';
  renderCards();
 });
 for(const index of [0,1,2,3,4,5,6,7]){
  await page.evaluate(index=>editCard(index),index);
  await expect(page.locator('#cardDialog')).toBeVisible();
  const geometry=await page.locator('#cardDialog').evaluate(dialog=>{
   const r=dialog.getBoundingClientRect(),form=dialog.querySelector('form').getBoundingClientRect();
   const actions=[...dialog.querySelectorAll('.dialog-footer button')].map(el=>{
    const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};
   });
   return {viewport:innerWidth,dialog:{left:r.left,right:r.right},form:{left:form.left,right:form.right},
    overflow:dialog.scrollWidth-dialog.clientWidth,actions};
  });
  expect(geometry.dialog.left).toBeGreaterThanOrEqual(-2);
  expect(geometry.dialog.right).toBeLessThanOrEqual(geometry.viewport+2);
  expect(geometry.overflow).toBeLessThanOrEqual(2);
  for(const a of geometry.actions){
   expect(a.left).toBeGreaterThanOrEqual(geometry.dialog.left-2);
   expect(a.right).toBeLessThanOrEqual(geometry.dialog.right+2);
  }
  await page.locator('#cardDialog [data-close]').first().click();
 }
 await page.evaluate(()=>{
  state.cards[1].settings.arcade_mode='rocket';
  editCard(1);
 });
 await expect(page.locator('#cardArcadeSettings')).toBeVisible();
 const fields=await page.locator('#cardArcadeSettings').evaluate(el=>({
  parentWidth:el.getBoundingClientRect().width,
  childWidth:el.querySelector('input').getBoundingClientRect().width
 }));
 expect(fields.childWidth).toBeLessThanOrEqual(fields.parentWidth+1);
});

test('Launch preview distinguishes map mechanics from geography questions and exposes legacy bonus cards',async({page})=>{
 await page.evaluate(()=>{
  section('rooms');
  state.topics=[{id:'geo',name:'География России'},{id:'flags',name:'Флаги мира'}];
  const input=$('launchBuild');
  input.add(new Option('ОРГ','build-one'));input.value='build-one';
  studio=async(action,args)=>{
   if(action!=='build_get')throw Error('Unexpected mock action');
   return {build:{id:'build-one',title:'ОРГ'},cards:[
    {type:'intro',title:'Старт',settings:{}},
    {type:'round',title:'Карта России',topic_id:'geo',settings:{arcade_mode:'russia_map',geo_modes:['locate','identify','flag']}},
    {type:'round',title:'Вопросы по географии',topic_id:'geo',settings:{geo_modes:['capital'],count:5}},
    {type:'bonus',title:'Ненастроенная мини-игра',settings:{}},
    {type:'team_stats',title:'Старый отдельный рейтинг команд',settings:{}},
    {type:'finale',title:'Финал',settings:{}}
   ]};
  };
  input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await expect(page.locator('#launchPlan')).toBeVisible();
 await expect(page.locator('#launchPlanCards .launch-plan-item')).toHaveCount(6);
 await expect(page.locator('#launchPlanCards .launch-plan-item').nth(1)).toContainText('Найти субъект');
 await expect(page.locator('#launchPlanCards .launch-plan-item').nth(1)).not.toContainText('Административный центр');
 await expect(page.locator('#launchPlanCards .launch-plan-item').nth(2)).toContainText('Административный центр');
 await expect(page.locator('#launchPlanCards .launch-plan-item').nth(2)).not.toContainText('Найти субъект');
 await expect(page.locator('#launchPlanCards .launch-plan-item').nth(3)).toHaveClass(/is-unconfigured/);
 await expect(page.locator('#launchPlanCards .launch-plan-item').nth(4)).toHaveClass(/is-unconfigured/);
 await expect(page.locator('#launchPlanCards .launch-plan-item').nth(4)).toContainText('Устаревшая карточка');
 await expect(page.locator('#launchPlanNotice')).toContainText('есть карточки без темы или механик');
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  await expect.poll(()=>page.locator('#launchPlan').evaluate(el=>{
   const r=el.getBoundingClientRect();return r.right<=innerWidth+2&&r.left>=-2;
  })).toBe(true);
 }
});

test('Changing saved build ignores a delayed preview of the previous selection',async({page})=>{
 await page.evaluate(()=>{
  const input=$('launchBuild');input.add(new Option('Старая','one'));input.add(new Option('Новая','two'));
  window.finishOldPreview=null;
  studio=async(action,{id})=>{
   if(id==='one')return new Promise(resolve=>window.finishOldPreview=resolve);
   return {build:{id:'two'},cards:[{type:'round',title:'Новый раунд',topic_id:'x',settings:{count:3,flag_modes:[]}}]};
  };
  input.value='one';input.dispatchEvent(new Event('change'));
  input.value='two';input.dispatchEvent(new Event('change'));
 });
 await expect(page.locator('#launchPlanCards')).toContainText('Новый раунд');
 await page.evaluate(()=>window.finishOldPreview({cards:[{type:'intro',title:'Старый раунд',settings:{}}]}));
 await expect(page.locator('#launchPlanCards')).not.toContainText('Старый раунд');
});


test('Finished rooms are stored only in a collapsed history, while active rooms remain visible',async({page})=>{
 const rooms=[
  {id:'active-1',title:'ОРГ',code:'A1B2C3D4',phase:'lobby',players:0,teams:4},
  {id:'old-1',title:'ОРГ',code:'D9F77416',phase:'finished',players:0,teams:4},
  {id:'old-2',title:'ОРГ',code:'F086A033',phase:'finished',players:0,teams:4}
 ];
 await page.evaluate(rooms=>{
  const root=document.getElementById('hostRoomList');
  root.innerHTML=roomsListMarkup(rooms);
 },rooms);
 await expect(page.locator('#hostRoomList .active-rooms .room-row')).toHaveCount(1);
 await expect(page.locator('#hostRoomList .rooms-history')).toHaveCount(1);
 await expect(page.locator('#hostRoomList .rooms-history')).not.toHaveAttribute('open','');
 await expect(page.locator('#hostRoomList .rooms-history-count')).toHaveText('2');
 await page.evaluate(()=>section('rooms'));
 await page.locator('#hostRoomList .rooms-history summary').click();
 await expect(page.locator('#hostRoomList .rooms-history .room-row')).toHaveCount(2);
 await expect(page.locator('#hostRoomList .rooms-history [data-room="D9F77416"]')).toContainText('Результаты');
 await expect(page.locator('#hostRoomList .rooms-history [data-delete-room="old-1"]')).toHaveCount(1);
});

test('New Russia map mechanic never silently selects all eight geography modes',async({page})=>{
 await page.evaluate(()=>{
  state.topics=[{id:'geography',name:'География России'},{id:'flags',name:'Флаги мира'}];
  fillSelect($('cardTopic'),[['geography','География России'],['flags','Флаги мира']],'Без темы','geography');
 });
 await page.locator('#openGamesPalette').click();
 await page.locator('#arcadePalette [data-geo="russia_map"]').click();
 const mode=await page.evaluate(()=>state.selectedCard?.settings?.geo_modes);
 expect(mode).toEqual([]);
 const ix=await page.evaluate(()=>state.cards.indexOf(state.selectedCard));
 await page.evaluate(index=>editCard(index),ix);
 await expect(page.locator('#cardGeoModes input:checked')).toHaveCount(0);
 await page.locator('#cardForm button[type="submit"]').click();
 await expect(page.locator('#cardDialog')).toBeVisible();
 await page.locator('#cardGeoModes input[value="locate"]').check();
 await page.locator('#cardForm button[type="submit"]').click();
 await expect(page.locator('#cardDialog')).not.toBeVisible();
 expect(await page.evaluate(()=>state.selectedCard.settings.geo_modes)).toEqual(['locate']);
});

test('Duplicated cards keep the original title without copy or repeated-copy suffixes',async({page})=>{
 const cards=page.locator('#roundCards .round-card');
 await page.evaluate(()=>{
  state.cards[1].title='Раунд вопросов — копия — копия';
  renderCards();
 });
 await expect(cards.nth(1).locator('h3')).toHaveText('Раунд вопросов');
 await cards.nth(1).locator('[data-duplicate-card]').click();
 await expect(cards).toHaveCount(4);
 await expect(cards.nth(1).locator('h3')).toHaveText('Раунд вопросов');
 await expect(cards.nth(2).locator('h3')).toHaveText('Раунд вопросов');
 const snapshot=await page.evaluate(()=>({
  names:state.cards.slice(1,3).map(x=>gameTitle(x)),
  persistedTitle:state.cards[2].title,
  noInheritedId:state.cards[2].id===undefined,
  distinctSettings:state.cards[1].settings!==state.cards[2].settings,
  displayedLaunch:describeLaunchCard({...state.cards[1],title:'Раунд вопросов — копия'}).title
 }));
 expect(snapshot.names).toEqual(['Раунд вопросов','Раунд вопросов']);
 expect(snapshot.persistedTitle).toBe('Раунд вопросов');
 expect(snapshot.noInheritedId).toBe(true);
 expect(snapshot.distinctSettings).toBe(true);
 expect(snapshot.displayedLaunch).toBe('Раунд вопросов');
 await page.evaluate(()=>duplicateCard(2));
 await expect(cards).toHaveCount(5);
 await expect(cards.nth(3).locator('h3')).toHaveText('Раунд вопросов');
 await expect(page.locator('#roundCards')).not.toContainText('— копия');
});


test('Projector, sound and music buttons retain crisp SVG icons through toggles',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{
  $('roomsPage').hidden=false;
  $('liveConsole').hidden=false;
  projectorPrefs={sound_enabled:true,music_enabled:false,volume:45};
  state.room={room_id:'00000000-0000-4000-8000-000000000999',code:'TESTROOM'};
  state.db={rpc:async(name,args)=>({data:{
   sound_enabled:name==='qwiz_projector_settings'&&'p_enabled' in args?args.p_enabled:projectorPrefs.sound_enabled,
   music_enabled:name==='qwiz_projector_music'?args.p_enable:projectorPrefs.music_enabled,
   volume:projectorPrefs.volume
  },error:null})};
  renderProjectorPreferences();
 });
 const buttons=page.locator('#showRoomProjection,#hostProjectorSound,#hostProjectorMusic,#openScreen');
 await expect(buttons).toHaveCount(4);
 for(const id of ['showRoomProjection','hostProjectorSound','hostProjectorMusic','openScreen']){
  const button=page.locator('#'+id);
  await expect(button.locator('.projector-pref-icon svg.ui-icon')).toHaveCount(1);
  const size=await button.locator('.projector-pref-icon svg').evaluate(node=>({
   width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height
  }));
  expect(size).toEqual({width:18,height:18});
 }
 const sound=page.locator('#hostProjectorSound'),music=page.locator('#hostProjectorMusic');
 await expect(sound).toHaveAttribute('aria-pressed','true');
 await expect(music).toHaveAttribute('aria-pressed','false');
 await expect(sound).toContainText('Звук проектора: вкл.');
 await expect(music).toContainText('Музыка на всю игру: выкл.');
 await sound.click();
 await expect(sound).toHaveAttribute('aria-pressed','false');
 await expect(sound).toContainText('Звук проектора: выкл.');
 await expect(sound.locator('.projector-pref-icon svg')).toHaveCount(1);
 const slash=await sound.locator('.pref-sound-slash').evaluate(el=>getComputedStyle(el).display);
 expect(slash).not.toBe('none');
 await music.click();
 await expect(music).toHaveAttribute('aria-pressed','true');
 await expect(music).toContainText('Музыка на всю игру: вкл.');
 await expect(music.locator('.projector-pref-icon svg')).toHaveCount(1);
 expect(await music.locator('.pref-music-slash').evaluate(el=>getComputedStyle(el).display)).toBe('none');
 await page.setViewportSize({width:390,height:844});
 const viewportOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 expect(viewportOverflow).toBeLessThanOrEqual(2);
});


test('One archive-clear button previews all completed games, cancels safely and deletes only after confirmation',async({page})=>{
 const rooms=[
  {id:'active1',title:'Открытая игра',code:'A1B2C3D4',phase:'question',players:7,teams:2},
  {id:'finished1',title:'Архив',code:'B2C3D4E5',phase:'finished',players:10,teams:2},
  {id:'finished2',title:'Архив 2',code:'C3D4E5F6',phase:'finished',players:5,teams:2}
 ];
 await page.evaluate(rooms=>{
  state.hostRooms=rooms;
  window.archiveCalls=[];
  window.archiveWasCleared=false;
  state.db={rpc:async(method,params)=>{
   window.archiveCalls.push({method,params});
   if(method==='qwiz_clear_finished_rooms'){
    if(params.p_confirm===false)return {data:{count:30,deleted:false},error:null};
    window.archiveWasCleared=true;
    return {data:{count:30,deleted:true},error:null};
   }
   if(method==='qwiz_host_rooms')return {data:window.archiveWasCleared?rooms.filter(x=>x.phase!=='finished'):rooms,error:null};
   return {data:null,error:{message:'Unexpected RPC: '+method}};
  }};
  document.querySelector('#hostRoomList').innerHTML=roomsListMarkup(rooms);
  section('rooms');
 },rooms);
 const button=page.locator('#clearFinishedArchive');
 await expect(button).toBeVisible();
 await expect(button).toHaveText('Очистить архив');
 await expect(button.locator('svg.trash-svg')).toHaveCount(1);
 await expect(page.locator('#hostRoomList .rooms-history-count')).toHaveText('2');
 let dismissed=false;
 page.once('dialog',async dialog=>{
  expect(dialog.message()).toContain('30');
  dismissed=true;
  await dialog.dismiss();
 });
 await button.click();
 await expect.poll(()=>dismissed).toBe(true);
 await expect.poll(()=>page.evaluate(()=>window.archiveCalls.filter(x=>x.method==='qwiz_clear_finished_rooms').length)).toBe(1);
 expect(await page.evaluate(()=>window.archiveCalls.find(x=>x.method==='qwiz_clear_finished_rooms').params.p_confirm)).toBe(false);
 await expect(page.locator('#hostRoomList .rooms-history')).toHaveCount(1);
 await expect(button).toBeEnabled();
 let accepted=false;
 page.once('dialog',async dialog=>{
  expect(dialog.message()).toContain('безвозвратно');
  accepted=true;
  await dialog.accept();
 });
 await button.click();
 await expect.poll(()=>accepted).toBe(true);
 await expect.poll(()=>page.evaluate(()=>window.archiveCalls.some(x=>x.params?.p_confirm===true))).toBe(true);
 await expect(page.locator('#hostRoomList .rooms-history')).toHaveCount(0);
 await expect(page.locator('#hostRoomList .active-rooms .room-row')).toHaveCount(1);
 await expect(page.locator('#hostRoomList .active-rooms')).toContainText('Открытая игра');
 await expect(page.locator('#launchMessage')).toContainText('30');
 const requests=await page.evaluate(()=>window.archiveCalls.map(c=>c.method));
 expect(requests.filter(x=>x==='qwiz_clear_finished_rooms')).toEqual(['qwiz_clear_finished_rooms','qwiz_clear_finished_rooms','qwiz_clear_finished_rooms']);
});

test('Archive-clear button fits at mobile width and does not toggle the history header',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  state.hostRooms=[{id:'finished',title:'Завершённая игра',code:'AABBCCDD',phase:'finished',players:4,teams:1}];
  document.querySelector('#hostRoomList').innerHTML=roomsListMarkup(state.hostRooms);
  section('rooms');
 });
 const archive=page.locator('#hostRoomList .rooms-history');
 const button=archive.locator('#clearFinishedArchive');
 await expect(button).toBeVisible();
 await expect(archive).not.toHaveAttribute('open','');
 const b=await button.boundingBox(),panel=await archive.boundingBox();
 expect(b.x).toBeGreaterThanOrEqual(panel.x-1);
 expect(b.x+b.width).toBeLessThanOrEqual(panel.x+panel.width+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});
