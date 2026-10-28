import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};'
 }));
 await page.goto('http://127.0.0.1:8080/next/workspace.html',{waitUntil:'load'});
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
      textAlign:getComputedStyle(node).textAlign,display:getComputedStyle(node).display};
   });
   return {left:outer.left,right:outer.right,cards};
  });
  expect(state.cards).toHaveLength(4);
  expect(state.cards.every(card=>card.left>=state.left-1&&card.right<=state.right+1)).toBe(true);
  expect(state.cards.every(card=>card.textAlign==='left'&&card.display==='block')).toBe(true);
  expect(new Set(state.cards.map(card=>card.paddingLeft)).size).toBe(1);
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
