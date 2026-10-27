import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};'}));
 await page.goto('http://127.0.0.1:8080/next/workspace.html',{waitUntil:'load'});
 await expect(page.locator('#workspaceLoading')).toBeHidden();
 await page.evaluate(()=>{
  document.querySelector('#roomsPage').hidden=false;
  document.querySelector('#liveConsole').hidden=false;
  state.topics=[{id:'topic-a',name:'Тестовая тема'}];
  state.builds=[{id:'build-1',title:'Проверочная сборка'}];
  state.buildsReady=true;
  studio=async (action,input)=>{
   if(action==='build_get')return{build:{id:input.id,title:'Проверочная сборка'},cards:[
    {type:'round',title:'Первый раунд',topic_id:'topic-a',settings:{count:1}},
    {type:'bonus',title:'Тап-баттл',settings:{arcade_mode:'tug',bonus_lead:15}},
    {type:'round',title:'Второй раунд',topic_id:'topic-a',settings:{count:1}}
   ]};
   throw Error('Unexpected network call: '+action);
  };
  loadSandboxQuestions=async card=>[{id:'q-'+card.title,prompt:card.title+' — тестовый вопрос',
   options:['Неверный A','Правильный B','Неверный C','Неверный D'],
   kind:'single',solution:{correct:1},explanation:'Ответ подтвержден'}];
  QwizTeamLab.refreshBuilds();
 });
});


test('Loading state cannot be mistaken for an empty catalog and requires readiness',async({page})=>{
 await page.evaluate(()=>{
  state.buildsReady=false;
  state.builds=[];
  QwizTeamLab.loadError('Соединение прервано');
 });
 await expect(page.locator('#teamLabBuild option')).toHaveText('Не удалось загрузить сборки');
 await expect(page.locator('#teamLabStart')).toBeDisabled();
 await expect(page.locator('#teamLabRetry')).toBeVisible();
 await expect(page.locator('#teamLabMessage')).toContainText('Соединение прервано');
});

test('Retry reads saved builds from overview RPC, without creating a room or question request',async({page})=>{
 await page.evaluate(()=>{
  state.buildsReady=false;state.builds=[];
  QwizTeamLab.loadError('Сервер временно не отвечает');
  studio=async(action)=>{
   if(action==='overview')return{topics:[{id:'topic-a',name:'Тестовая тема'}],builds:[{id:'build-remote',title:'Сборка из базы'}]};
   throw Error('Unexpected server write or request: '+action);
  };
  state.db={}; // Simulates existing authenticated Supabase client
 });
 await page.locator('#teamLabRetry').click();
 await expect(page.locator('#teamLabBuild')).toHaveValue('build-remote');
 await expect(page.locator('#teamLabBuild option')).toHaveCount(2);
 await expect(page.locator('#teamLabMessage')).toContainText('Сборка доступна');
 await expect(page.locator('#teamLabRetry')).toBeHidden();
 await expect(page.locator('#teamLabStart')).toBeEnabled();
});

test('Missing sandbox JS shows a recoverable error, never an endless loading option',async({page})=>{
 await page.route('**/team-lab.js*',route=>route.abort('failed'));
 await page.goto('http://127.0.0.1:8080/next/workspace.html',{waitUntil:'load'});
 await expect(page.locator('#workspaceLoading')).toBeHidden();
 await expect(page.locator('#teamLabBuild option')).toHaveText('Модуль теста недоступен');
 await expect(page.locator('#teamLabStart')).toBeDisabled();
 await expect(page.locator('#teamLabRetry')).toBeVisible();
});

test('PWA app shell includes simulator assets and offline worker version has rotated',async({page})=>{
 const response=await page.request.get('http://127.0.0.1:8080/next/sw.js');
 expect(response.ok()).toBe(true);
 const sw=await response.text();
 expect(sw).toContain("'./team-lab.js'");
 expect(sw).toContain("'./team-lab.css'");
 expect(sw).toContain('qwiz-pwa-shell-20261028-v33');
});

async function start(page){
 await page.locator('#teamLabStart').click();
 await expect(page.locator('#teamLabStage')).toBeVisible();
 await expect(page.locator('#teamLabStatus')).toContainText('Этап 1 / 3');
}
async function answer(page){
 await page.locator('[data-lab-answer="1"]').click();
 await page.locator('[data-lab-submit]').click();
 await expect(page.locator('#teamLabTeacherScore')).toHaveText('30');
}
for(const width of [320,390,768,1440]){
 test('Bonus override checkbox stays inline with caption at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:780});
  await expect(page.locator('#teamLabForceBonus')).toBeHidden();
  await start(page);
  const label=page.locator('#teamLab .team-lab-sandbox-toggle');
  await expect(label).toBeVisible();
  const geometry=await label.evaluate(node=>{
   const input=node.querySelector('input[type="checkbox"]'),text=node.querySelector('span');
   const a=input.getBoundingClientRect(),b=text.getBoundingClientRect(),outer=node.getBoundingClientRect();
   return {inputWidth:a.width,textWidth:b.width,sideBySide:a.right+6<=b.left,
    aligned:Math.abs(a.top-b.top)<10,
    fits:a.left>=outer.left&&b.right<=outer.right,
    boxHeight:outer.height};
  });
  expect(geometry.inputWidth).toBeGreaterThanOrEqual(17);
  expect(geometry.inputWidth).toBeLessThanOrEqual(21);
  expect(geometry.sideBySide).toBe(true);
  expect(geometry.aligned).toBe(true);
  expect(geometry.fits).toBe(true);
  await page.locator('#teamLabForceBonus').check();
  await expect(page.locator('#teamLabForceBonus')).toBeChecked();
  await page.screenshot({path:'visual-artifacts/team-lab-checkbox-'+width+'.png',fullPage:true});
 });
}
test('Simulator appears below team cards and loads chosen saved build without a room join',async({page})=>{
 await expect(page.locator('#teamLab')).toBeVisible();
 const below=await page.evaluate(()=>document.querySelector('#teamLab').compareDocumentPosition(document.querySelector('#teamManager'))&Node.DOCUMENT_POSITION_PRECEDING);
 expect(below).toBeTruthy();
 await expect(page.locator('#teamLabBuild option')).toHaveCount(2);
 await start(page);
 await expect(page.locator('#teamLabTeacherMembers')).toContainText('3 игрока');
 await expect(page.locator('#teamLabBotMembers')).toContainText('3 виртуальных');
 await expect(page.locator('#teamLabTeacherScore')).toHaveText('0');
});
test('Instructor controls all 3 votes, bot randomly answers for 3, and Next/Back restores results',async({page})=>{
 await start(page);await answer(page);
 const bot=Number(await page.locator('#teamLabBotScore').textContent());
 expect(bot).toBeGreaterThanOrEqual(0);expect(bot).toBeLessThanOrEqual(30);
 await page.locator('#teamLabNext').click();
 await expect(page.locator('#teamLabStatus')).toContainText('Этап 2 / 3');
 await page.locator('#teamLabPrev').click();
 await expect(page.locator('#teamLabStatus')).toContainText('Этап 1 / 3');
 await expect(page.locator('#teamLabTeacherScore')).toHaveText('30');
 await page.locator('#teamLabNext').click();
 await expect(page.locator('#teamLabTeacherScore')).toHaveText('30');
});
test('Tap battle: 40 rapid actions keep the same mounted button and do not reach server',async({page})=>{
 await start(page);await answer(page);await page.locator('#teamLabNext').click();
 const tap=page.locator('[data-lab-tap]');
 await tap.evaluate(n=>n.dataset.sameElement='yes');
 for(let i=0;i<40;i++)await tap.click();
 await expect(tap).toHaveAttribute('data-same-element','yes');
 await expect(page.locator('.team-lab-arcade-scores b').first()).toHaveText('120');
});
test('Moderator can skip unanswered questions and unfinished arcade stages then go back safely',async({page})=>{
 await start(page);
 await expect(page.locator('#teamLabNext')).toBeEnabled();
 await page.locator('#teamLabNext').click();
 await expect(page.locator('#teamLabStatus')).toContainText('Этап 2 / 3');
 await expect(page.locator('#teamLabTeacherScore')).toHaveText('0');
 await page.locator('#teamLabNext').click();
 await expect(page.locator('#teamLabStatus')).toContainText('Этап 3 / 3');
 await expect(page.locator('#teamLabHistory')).toContainText('Мини-игра пропущена');
 await page.locator('#teamLabPrev').click();
 await page.locator('#teamLabPrev').click();
 await expect(page.locator('#teamLabStatus')).toContainText('Этап 1 / 3');
 await expect(page.locator('[data-lab-submit]')).toBeDisabled();
 await expect(page.locator('#teamLabTeacherScore')).toHaveText('0');
 await answer(page);
 await expect(page.locator('#teamLabTeacherScore')).toHaveText('30');
});
test('Simulator reveals and applies support bonus at following real question',async({page})=>{
 await start(page);await answer(page);await page.locator('#teamLabNext').click();
 await page.locator('#teamLabForceBonus').check();
 await page.locator('#teamLabWinner').selectOption('0');
 await page.locator('[data-lab-resolve]').click();
 await page.locator('#teamLabNext').click();
 await expect(page.locator('[data-lab-strategy="support"]')).toBeVisible();
 await page.locator('[data-lab-strategy="support"]').click();
 await page.locator('[data-lab-boost="headstart"]').click();
 await expect(page.locator('#teamLabStatus')).toContainText('Этап 3 / 3');
 await expect(page.locator('#teamLabTeacherScore')).toHaveText('57'); // 30 correct +15 game +12 headstart
 await expect(page.locator('#teamLabHistory')).toContainText('Фора +12');
});
test('Penalty is capped by target score and reversible using Back',async({page})=>{
 await start(page);await answer(page);await page.locator('#teamLabNext').click();
 await page.locator('#teamLabForceBonus').check();
 await page.locator('#teamLabWinner').selectOption('0');
 await page.locator('[data-lab-resolve]').click();
 await page.locator('#teamLabNext').click();
 await page.locator('[data-lab-strategy="sabotage"]').click();
 await page.locator('[data-lab-boost="drain"]').click();
 const scores=Q=>page.locator(Q).textContent().then(Number);
 const bot=await scores('#teamLabBotScore');
 expect(bot).toBeGreaterThanOrEqual(0);
 await page.locator('#teamLabPrev').click();
 await expect(page.locator('[data-lab-boost="drain"]')).toBeVisible();
 await page.locator('[data-lab-boost="fog"]').click();
 await expect(page.locator('#teamLabHistory')).toContainText('Туман −5');
});
test('Without a future ordinary question no fake bonus stage is offered',async({page})=>{
 await page.evaluate(()=>{
  studio=async()=>({build:{id:'build-1'},cards:[{type:'bonus',title:'Тап-баттл',settings:{arcade_mode:'tug'}}]});
 });
 await page.locator('#teamLabStart').click();
 await expect(page.locator('#teamLabStatus')).toContainText('Этап 1 / 1');
 await page.locator('#teamLabForceBonus').check();
 await page.locator('#teamLabWinner').selectOption('0');
 await page.locator('[data-lab-resolve]').click();
 await expect(page.locator('.team-lab-feedback')).toContainText('требуется следующий вопрос');
 await page.locator('#teamLabNext').click();
 await expect(page.locator('#teamLabStatus')).toHaveText('Финиш');
});
for(const width of [320,390,768,1440]){
 test('Simulation keeps both team panels in viewport at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:780});
  await start(page);
  const fit=await page.locator('#teamLab').evaluate(node=>{
   const parent=node.getBoundingClientRect(),cards=[...node.querySelectorAll('.team-lab-team')].map(x=>x.getBoundingClientRect());
   return {viewport:document.documentElement.clientWidth,cardFits:cards.every(x=>x.left>=parent.left-2&&x.right<=parent.right+2),
    teamsSideBySide:cards.length===2&&cards[0].right<=cards[1].left};
  });
  expect(fit.viewport).toBe(width);expect(fit.cardFits).toBe(true);expect(fit.teamsSideBySide).toBe(true);
  await page.screenshot({path:'visual-artifacts/team-lab-'+width+'.png',fullPage:true});
 });
}
