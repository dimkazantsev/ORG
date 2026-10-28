import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};'
 }));
 await page.goto('http://127.0.0.1:8080/next/workspace.html',{waitUntil:'load'});
 await expect(page.locator('#workspaceLoading')).toBeHidden();
 await page.evaluate(()=>{document.getElementById('bonusesPage').hidden=false});
});

for(const width of [320,390,768,1440]){
 test('Bonus steps fit and align at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:900});
  const state=await page.locator('.team-lab-rules').evaluate(root=>{
   const outer=root.getBoundingClientRect();
   const cards=[...root.children].map(node=>{
    const rect=node.getBoundingClientRect();
    return {left:rect.left,right:rect.right,top:rect.top,height:rect.height,
      paddingLeft:getComputedStyle(node).paddingLeft,
      textAlign:getComputedStyle(node).textAlign,display:getComputedStyle(node).display,
      number:node.querySelector('.bonus-rule-number')?.getBoundingClientRect().toJSON(),
      label:node.querySelector('.bonus-rule-text')?.getBoundingClientRect().toJSON()};
   });
   return {left:outer.left,right:outer.right,cards};
  });
  expect(state.cards).toHaveLength(4);
  expect(state.cards.every(card=>card.left>=state.left-1&&card.right<=state.right+1)).toBe(true);
  expect(state.cards.every(card=>card.textAlign==='left'&&card.display==='grid')).toBe(true);
  expect(new Set(state.cards.map(card=>card.paddingLeft)).size).toBe(1);
  expect(state.cards.every(card=>card.number&&card.label)).toBe(true);
  expect(state.cards.every(card=>Math.abs(card.number.y-card.label.y)<2)).toBe(true);
  for(const card of state.cards){
   expect(card.label.x).toBeGreaterThan(card.number.x);
   expect(card.label.y).toBeGreaterThanOrEqual(card.top+9);
   expect(card.label.y).toBeLessThanOrEqual(card.top+16);
  }

  for(const card of state.cards){
   const row=state.cards.filter(other=>Math.abs(other.top-card.top)<1);
   expect(row.every(other=>Math.abs(other.height-card.height)<1)).toBe(true);
  }
 });
}

test('Second step is a real button, other steps are informational and explained',async({page})=>{
 const root=page.locator('.team-lab-rules');
 await expect(root.locator(':scope > button')).toHaveCount(1);
 await expect(root.locator(':scope > span')).toHaveCount(3);
 await page.locator('.bonus-rules-explainer > summary').first().click();
 await expect(page.locator('.bonus-rules-explainer ol > li')).toHaveCount(4);
 await page.locator('#bonusRulesJump').click();
 await expect(page.locator('#bonusRulesEditor')).toBeVisible();
});

test('Editor actions share width and height on desktop, stack on mobile',async({page})=>{
 await page.evaluate(()=>{document.getElementById('bonusRulesForm').hidden=false});
 const buttons=page.locator('.bonus-rules-editor-actions > button');
 await expect(buttons).toHaveCount(2);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const boxes=await buttons.evaluateAll(items=>items.map(item=>{
   const r=item.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
  }));
  expect(Math.abs(boxes[0].width-boxes[1].width)).toBeLessThan(2);
  expect(Math.abs(boxes[0].height-boxes[1].height)).toBeLessThan(2);
  if(width===1440)expect(Math.abs(boxes[0].y-boxes[1].y)).toBeLessThan(2);
  else expect(boxes[1].y).toBeGreaterThan(boxes[0].y+boxes[0].height-1);
 }
});

test('Editor avoids duplicate mode names and uses correct singular score label',async({page})=>{
 await page.evaluate(()=>{
  window.QwizBonusRulesApi={
   list:async()=>({cards:[{id:'card-captain',title:'Мэмори капитанов',mode:'captain',position:3,
    bonus_min_points:1,bonus_percent:70,bonus_lead:15,bonus_vote_seconds:null}]}),
   save:async()=>{throw Error('Should not call a write for a display test')}
  };
  window.QwizBonusSettings.refreshBuilds([{id:'build-test',title:'Проверочная сборка'}]);
 });
 await page.locator('#bonusRulesBuild').selectOption('build-test');
 await expect(page.locator('#bonusRulesCard option').nth(1)).toHaveText('4. Мэмори капитанов');
 await expect(page.locator('#bonusRulesPreview')).toContainText('не менее 1 очка');
 await expect(page.locator('#bonusRulesPreview')).not.toContainText('1 очков');
});

test('Teacher edits ranking points separately for tap victory and blitz correct answer',async({page})=>{
 const writes=[];
 await page.evaluate(()=>{
  window.__bonusWrites=[];
  window.QwizBonusRulesApi={
   list:async()=>({cards:[
    {id:'tap',title:'Тап-баттл',mode:'tug',position:1,arcade_score_points:15,
      bonus_min_points:1,bonus_percent:70,bonus_lead:15,bonus_vote_seconds:null},
    {id:'blitz',title:'Блиц-консенсус',mode:'blitz',position:2,arcade_score_points:10,
      bonus_min_points:1,bonus_percent:70,bonus_lead:15,bonus_vote_seconds:null}
   ]}),
   save:async(id,card,settings)=>{
    window.__bonusWrites.push({id,card,settings});
    return {cards:[
     {id:'tap',title:'Тап-баттл',mode:'tug',position:1,arcade_score_points:15,
      bonus_min_points:1,bonus_percent:70,bonus_lead:15,bonus_vote_seconds:null},
     {id:'blitz',title:'Блиц-консенсус',mode:'blitz',position:2,arcade_score_points:10,
      bonus_min_points:1,bonus_percent:70,bonus_lead:15,bonus_vote_seconds:null}
    ].map(x=>x.id===card?{...x,...settings}:x)};
   }
  };
  window.QwizBonusSettings.refreshBuilds([{id:'fixture-build',title:'Тестовая сборка'}]);
 });
 await page.locator('#bonusRulesBuild').selectOption('fixture-build');
 await expect(page.locator('#bonusRulesReward')).toHaveValue('15');
 await expect(page.locator('#bonusRulesRewardHelp')).toContainText('команде-победителю');
 await page.locator('#bonusRulesReward').fill('25');
 await expect(page.locator('#bonusRulesPreview')).toContainText('+25 баллов');
 await page.locator('#bonusRulesSave').click();
 await expect.poll(async()=>page.evaluate(()=>window.__bonusWrites.length)).toBe(1);
 const first=await page.evaluate(()=>window.__bonusWrites[0]);
 expect(first.settings.arcade_score_points).toBe(25);
 expect(first.settings.bonus_min_points).toBe(1);
 await page.locator('#bonusRulesCard').selectOption('blitz');
 await expect(page.locator('#bonusRulesReward')).toHaveValue('10');
 await expect(page.locator('#bonusRulesRewardHelp')).toContainText('каждой команде');
 await expect(page.locator('#bonusRulesReward')).toHaveAttribute('max','10');
 await page.locator('#bonusRulesReward').fill('11');
 await expect(page.locator('#bonusRulesSave')).toBeDisabled();
 await page.locator('#bonusRulesReward').fill('7');
 await expect(page.locator('#bonusRulesPreview')).toContainText('+7 баллов');
 await page.locator('#bonusRulesSave').click();
 await expect.poll(async()=>page.evaluate(()=>window.__bonusWrites.length)).toBe(2);
 const second=await page.evaluate(()=>window.__bonusWrites[1]);
 expect(second.card).toBe('blitz');
 expect(second.settings.arcade_score_points).toBe(7);
 await page.locator('#bonusRulesReset').click();
 await expect(page.locator('#bonusRulesReward')).toHaveValue('10');
});

test('General settings delegate bonus thresholds to one editor and select the current saved build',async({page})=>{
 await page.evaluate(()=>{
  state.builds=[{id:'fixture-build',title:'Сборка с мини-игрой'}];
  state.buildId='fixture-build';
  state.cards=[{id:'round',type:'round',title:'Вопросы',settings:{count:5,seconds:30,answer_seconds:10,lead_seconds:5,stats_seconds:7}}];
  window.QwizBonusRulesApi={
   list:async()=>({cards:[{id:'tug-card',title:'Тап-баттл',mode:'tug',position:1,
    bonus_percent:83,bonus_lead:29,bonus_min_points:3,arcade_score_points:17,bonus_vote_seconds:null}]})
  };
  window.QwizBonusSettings.refreshBuilds(state.builds);
  generalSettings();
 });
 await expect(page.locator('#generalDialog')).toBeVisible();
 await expect(page.locator('#generalBonusPercent')).toHaveCount(0);
 await expect(page.locator('#generalBonusLead')).toHaveCount(0);
 await expect(page.locator('#generalOpenBonusRules')).toBeVisible();
 await page.locator('#generalOpenBonusRules').click();
 await expect(page.locator('#generalDialog')).not.toBeVisible();
 await expect(page.locator('#bonusesPage')).toBeVisible();
 await expect(page.locator('#bonusRulesBuild')).toHaveValue('fixture-build');
 await expect(page.locator('#bonusRulesActivity')).toHaveValue('83');
 await expect(page.locator('#bonusRulesGap')).toHaveValue('29');
});

test('General timing apply keeps individual bonus eligibility and reward settings unchanged',async({page})=>{
 const actual=await page.evaluate(()=>{
  state.cards=[
   {id:'round-1',type:'round',title:'Раунд',settings:{count:5,seconds:30,answer_seconds:10,
     lead_seconds:5,stats_seconds:7,bonus_percent:81,bonus_lead:46}},
   {id:'game-1',type:'bonus',title:'Тап-баттл',settings:{arcade_mode:'tug',
     bonus_percent:93,bonus_lead:24,bonus_min_points:4,arcade_score_points:32,
     lead_seconds:5,stats_seconds:7}},
   {id:'game-2',type:'bonus',title:'Мэмори',settings:{arcade_mode:'captain',
     bonus_percent:66,bonus_lead:38,bonus_min_points:2,arcade_score_points:21,
     lead_seconds:5,stats_seconds:7}}
  ];
  generalSettings();
  document.querySelector('#generalStatsSeconds').value='9';
  saveGeneralSettings({preventDefault(){}});
  return state.cards.filter(c=>c.settings?.bonus_percent!==undefined)
   .map(c=>({id:c.id,percent:c.settings.bonus_percent,lead:c.settings.bonus_lead,
     min:c.settings.bonus_min_points,points:c.settings.arcade_score_points,
     stats:c.settings.stats_seconds}));
 });
 expect(actual).toEqual([
  {id:'round-1',percent:81,lead:46,stats:9},
  {id:'game-1',percent:93,lead:24,min:4,points:32,stats:9},
  {id:'game-2',percent:66,lead:38,min:2,points:21,stats:9}
 ]);
});
