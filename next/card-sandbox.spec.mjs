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

test('Each builder card, including finale, has its own beautiful accessible Play control',async({page})=>{
 const cards=page.locator('#roundCards .round-card');
 await expect(cards).toHaveCount(3);
 for(const card of await cards.all())await expect(card.locator('[data-play-card]')).toHaveCount(1);
 const previous=await page.evaluate(()=>state.selectedCard);
 await cards.first().locator('[data-play-card]').click();
 await expect(page.locator('#cardPlayDialog')).toBeVisible();
 await expect(page.locator('#cardPlayTitle')).toHaveText('Начало игры');
 await expect(page.locator('#cardPlaySafety')).toContainText('без комнаты');
 await expect.poll(()=>page.evaluate(()=>state.selectedCard===null)).toBe(true);
 await page.locator('[data-card-close]').click();
 await cards.last().locator('[data-play-card]').click();
 await expect(page.locator('#cardPlayTitle')).toHaveText('Финал игры');
 await expect(page.locator('#roundCards [data-duplicate-card]')).toHaveCount(2);
 await expect(page.locator('#roundCards [data-delete-card]')).toHaveCount(2);
 expect(previous).toBe(null);
});

test('Teacher manually skips and goes back through every introductory phase',async({page})=>{
 await page.locator('[data-play-card="0"]').click();
 await expect(page.locator('#cardPlaySteps button')).toHaveCount(3);
 await expect(page.locator('#cardPlayPrev')).toBeDisabled();
 await page.locator('#cardPlayNext').click();
 await expect(page.locator('#cardPlayMeta')).toContainText('Этап 2 из 3');
 await page.locator('[data-card-step="2"]').click();
 await expect(page.locator('#cardPlayNext')).toBeDisabled();
 await page.locator('[data-card-view="audience"]').click();
 await expect(page.locator('#cardPlayScreen')).toHaveClass(/is-audience/);
 await page.locator('[data-card-restart]').click();
 await expect(page.locator('#cardPlayMeta')).toContainText('Этап 1 из 3');
 await expect(page.locator('[data-card-view="audience"]')).toHaveAttribute('aria-pressed','true');
});

test('Real question test never submits answers; answers keep original identity after shuffle',async({page})=>{
 await page.evaluate(()=>{
  state.topics=[{id:'flags',name:'Флаги мира'}];
  state.cards[1].topic_id='flags';state.cards[1].settings.count=2;state.cards[1].settings.flag_modes=['country'];
  window.rpcCalls=0;
  state.db={rpc(){window.rpcCalls++;throw new Error('Unsafe write or read')}};
  loadSandboxQuestions=async()=>[{
   id:'q1',prompt:'Какой вариант правильный?',options:['Неверно 0','Неверно 1','Верно 2','Неверно 3'],
   solution:{correct:2,flag_mode:'country'},tags:['fw:published'],explanation:'Проверенный ответ'
  },{
   id:'q2',prompt:'Второй вопрос',options:['А','Б','В','Г'],solution:{correct:0,flag_mode:'country'},tags:['fw:published']
  }];
  renderCards();
 });
 await page.locator('[data-play-card="1"]').click();
 await expect(page.locator('#cardPlaySteps button')).toHaveCount(6);
 await page.locator('[data-card-step="1"]').click();
 const options=page.locator('.card-play-answer');
 await expect(options).toHaveCount(4);
 await options.filter({hasText:'Неверно 1'}).click();
 await expect(options.filter({hasText:'Неверно 1'})).toHaveClass(/is-picked/);
 await page.locator('#cardPlayNext').click();
 await expect(options.filter({hasText:'Верно 2'})).toHaveClass(/is-correct/);
 await expect(options.filter({hasText:'Неверно 1'})).toHaveClass(/is-wrong/);
 await page.locator('[data-card-step="3"]').click();
 await expect(page.locator('.card-play-question h3')).toHaveText('Второй вопрос');
 await expect.poll(()=>page.evaluate(()=>window.rpcCalls)).toBe(0);
});

test('Tug game is tappable offline and results are shown on the next manual phase',async({page})=>{
 await page.evaluate(()=>{const c=appendCard('bonus','tug');state.selectedCard=c});
 const i=await page.evaluate(()=>state.cards.findIndex(x=>x.settings?.arcade_mode==='tug'));
 await page.locator('[data-play-card="'+i+'"]').click();
 await page.locator('[data-card-step="1"]').click();
 const button=page.locator('[data-card-tap]');
 await expect(button).toBeEnabled();
 for(let j=0;j<7;j++)await button.click();
 await expect(page.locator('.card-play-tap-art strong')).toHaveText('7');
 await page.locator('#cardPlayNext').click();
 await expect(page.locator('#cardPlayScreen')).toContainText('7');
 await page.locator('[data-card-restart]').click();
 await page.locator('[data-card-step="1"]').click();
 await expect(page.locator('.card-play-tap-art strong')).toHaveText('0');
});

test('Captain memory simulator lets the teacher flip a tile without network calls',async({page})=>{
 await page.evaluate(()=>appendCard('duel','captain'));
 const i=await page.evaluate(()=>state.cards.findIndex(x=>x.settings?.arcade_mode==='captain'));
 await page.locator('[data-play-card="'+i+'"]').click();
 await page.locator('#cardPlayNext').click();
 await expect(page.locator('.card-play-memory button')).toHaveCount(12);
 await page.locator('[data-card-flip="0"]').click();
 await expect(page.locator('[data-card-flip="0"]')).toHaveClass(/is-open/);
 await page.locator('[data-card-flip="1"]').click();
 await expect(page.locator('#cardPlayScreen')).toContainText('1 попыток');
});

test('Map sandbox renders real region SVG and allows confirm/answer without backend writes',async({page})=>{
 await page.evaluate(()=>{
  const dialogCard={type:'round',title:'Карта России',settings:{arcade_mode:'russia_map',geo_count:2,geo_modes:['locate','identify']}};
  window.QwizCardSandbox.open({card:dialogCard,topic:'География России',
   loadQuestions:async()=>[],
   loadMap:async()=>Array.from({length:20},(_,i)=>({id:String(i),name:'Регион '+i,
    path:'M'+(i*35)+' 10h30v30h-30Z',box:[i*35,10,30,30]}))});
 });
 await expect(page.locator('#cardPlaySteps button')).toHaveCount(6);
 await page.locator('[data-card-step="1"]').click();
 await expect(page.locator('[data-card-region]')).toHaveCount(20);
 await page.locator('[data-card-region="4"]').click({force:true});
 await expect(page.locator('.card-play-map-choice')).toContainText('Регион 4');
 await page.locator('[data-card-confirm]').click();
 await expect(page.locator('#cardPlayMeta')).toContainText('Этап 3 из 6');
 await expect(page.locator('.card-play-map path.is-right')).toHaveCount(1);
});

test('Closing during a slow data read cannot revive the old card or overwrite a new session',async({page})=>{
 await page.evaluate(()=>{
  state.topics=[{id:'flags',name:'Флаги мира'}];
  state.cards[1].topic_id='flags';
  window.finishPreview=null;
  loadSandboxQuestions=()=>new Promise(resolve=>window.finishPreview=resolve);
  renderCards();
 });
 await page.locator('[data-play-card="1"]').click();
 await expect(page.locator('#cardPlaySafety')).toContainText('Загружаем');
 await page.locator('[data-card-close]').click();
 await page.locator('[data-play-card="2"]').click();
 await page.evaluate(()=>window.finishPreview([{id:'old',prompt:'Устаревший вопрос',options:[]}]));
 await expect(page.locator('#cardPlayTitle')).toHaveText('Финал игры');
 await expect(page.locator('#cardPlayDialog')).toBeVisible();
 await expect(page.locator('#cardPlayScreen')).not.toContainText('Устаревший вопрос');
});

for(const width of [320,390,768,1440]){
 test('Card tools and the sandbox fit inside viewport at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:740});
  const cards=page.locator('#roundCards .round-card');
  const bounds=await cards.evaluateAll(nodes=>nodes.map(n=>{
   const r=n.getBoundingClientRect();
   return [...n.querySelectorAll('.round-card-tools button')].map(b=>{
    const q=b.getBoundingClientRect();
    return {fits:q.left>=r.left-2&&q.right<=r.right+2&&q.top>=r.top-2&&q.bottom<=r.bottom+2,size:q.width};
   });
  }));
  expect(bounds.every(x=>x.every(b=>b.fits&&b.size>=34))).toBe(true);
  await cards.first().locator('[data-play-card]').click();
  const geometry=await page.locator('#cardPlayDialog').evaluate(n=>{
   const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,
    width:document.documentElement.clientWidth,height:innerHeight};
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-2);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width+2);
  expect(geometry.top).toBeGreaterThanOrEqual(-2);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height+2);
  await page.screenshot({path:'visual-artifacts/card-play-'+width+'.png',fullPage:true});
 });
}
