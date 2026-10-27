import {test,expect} from '@playwright/test';

const previewJsErrors=new WeakMap();
test.beforeEach(async({page})=>{
 const errors=[];
 previewJsErrors.set(page,errors);
 page.on('pageerror',e=>{errors.push(e.message);console.error('QWIZ CARD PREVIEW JS ERROR:',e.stack||e.message)});

 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};'
 }));
 await page.goto('http://127.0.0.1:8080/next/workspace.html',{waitUntil:'load'});
 await expect(page.locator('#workspaceLoading')).toBeHidden();
 await page.evaluate(()=>{document.querySelector('#builderPage').hidden=false;newBuild()});
});

test.afterEach(async({page})=>{
 expect(previewJsErrors.get(page)||[], 'Card preview must not throw browser runtime errors').toEqual([]);
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
 await expect(page.locator('#cardPlayScreen .arcade-tap-stage')).toHaveCount(1);
 await button.evaluate(n=>{n.dataset.sandboxTapIdentity='retained';});
 for(let j=0;j<7;j++)await button.click();
 await expect(button).toHaveAttribute('data-sandbox-tap-identity','retained');
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
 await expect(page.locator('#cardPlayScreen .arcade-memory-hero')).toHaveCount(1);
 await page.locator('[data-card-flip="0"]').click();
 await expect(page.locator('[data-card-flip="0"]')).toHaveClass(/is-open/);
 await page.locator('[data-card-flip="1"]').click();
 await expect(page.locator('#cardPlayScreen')).toContainText('1 попыток');
});


test('Blitz card renders the actual 3D consensus graphic and allows both local voting phases',async({page})=>{
 await page.evaluate(()=>appendCard('bonus','blitz'));
 const i=await page.evaluate(()=>state.cards.findIndex(x=>x.settings?.arcade_mode==='blitz'));
 await page.locator('[data-play-card="'+i+'"]').click();
 await page.locator('#cardPlayNext').click();
 await expect(page.locator('#cardPlayScreen .consensus-hero')).toHaveCount(1);
 await page.locator('[data-card-vote="player:2"]').click();
 await expect(page.locator('[data-card-vote="player:2"]')).toHaveClass(/is-picked/);
 await page.locator('#cardPlayNext').click();
 await page.locator('[data-card-vote="captain:1"]').click();
 await expect(page.locator('[data-card-vote="captain:1"]')).toHaveClass(/is-picked/);
 await page.locator('#cardPlayNext').click();
 await expect(page.locator('#cardPlayScreen')).toContainText('Голос участника: C. Капитан: B.');
});

test('All eight geography mechanics display actual catalog-sourced interactive questions with answer reveal',async({page})=>{
 await page.evaluate(()=>{
  window.geoCatalogFixture=Array.from({length:89},(_,i)=>({
   id:String(i),name:'Регион '+i,capital:'Центр '+i,
   district:'Округ '+(i%8),region_type:'Область',
   flag:'test-'+i,neighbors:[String((i+1)%89),String((i+88)%89)]
  }));
  window.geoGeometryFixture=Array.from({length:89},(_,i)=>({
   id:String(i),name:'Регион '+i,
   path:'M'+((i%18)*57)+' '+(Math.floor(i/18)*82)+'h50v70h-50Z',
   box:[(i%18)*57,Math.floor(i/18)*82,50,70]
  }));
  window.geoPreviewReadCount=0;
  window.QwizCardSandbox.open({
   card:{type:'round',title:'География России',settings:{
    arcade_mode:'russia_map',geo_count:8,
    geo_modes:['locate','identify','capital','flag','silhouette','neighbour','detective','district']
   }},
   topic:'География России',
   loadQuestions:async()=>{throw Error('Unexpected normal-bank load')},
   loadMap:async()=>{window.geoPreviewReadCount++;return window.geoGeometryFixture},
   loadCatalog:async()=>{window.geoPreviewReadCount++;return window.geoCatalogFixture}
  });
 });
 await expect(page.locator('#cardPlaySteps button')).toHaveCount(18);
 await expect.poll(()=>page.evaluate(()=>window.geoPreviewReadCount)).toBe(2);
 for(let idx=0;idx<8;idx++){
  const step=1+idx*2;
  await page.locator('[data-card-step="'+step+'"]').click();
  await expect(page.locator('.card-play-geography h3')).not.toBeEmpty();
  if(idx===0){
   await expect(page.locator('.card-play-map path[data-card-region]')).toHaveCount(89);
   const first=page.locator('.card-play-map path[data-card-region]').first();
   await first.focus();
   const outline=await first.evaluate(e=>getComputedStyle(e).outlineStyle);
   expect(outline).toBe('none');
   await first.click({force:true});
   await expect(page.locator('[data-card-confirm]')).toBeEnabled();
   await page.locator('[data-card-confirm]').click();
  }else{
   await expect(page.locator('.card-play-answer')).toHaveCount(4);
   await page.locator('.card-play-answer').first().click();
   await page.locator('#cardPlayNext').click();
  }
  await expect(page.locator('.card-play-reveal')).toBeVisible();
  if(idx>0){
   await expect(page.locator('.card-play-answer.is-correct')).toHaveCount(1);
   const options=await page.locator('.card-play-answer .card-play-choice').allTextContents();
   expect(new Set(options).size).toBe(4);
  }else await expect(page.locator('.card-play-map path.is-right')).toHaveCount(1);
 }
 await expect.poll(()=>page.evaluate(()=>window.geoPreviewReadCount)).toBe(2);
 await expect(page.locator('#cardPlaySafety')).toContainText('без комнаты');
});

test('Geography preview does not fabricate a question when catalog is inaccessible',async({page})=>{
 await page.evaluate(()=>QwizCardSandbox.open({
  card:{type:'round',title:'Субъекты',settings:{arcade_mode:'russia_map',geo_count:1,geo_modes:['capital']}},
  topic:'География России',loadMap:async()=>[],
  loadCatalog:async()=>{throw Error('Справочник недоступен')},
  loadQuestions:async()=>[]
 }));
 await expect(page.locator('#cardPlaySafety')).toContainText('Справочник недоступен');
 await expect(page.locator('#cardPlaySteps button')).toHaveCount(2);
 await expect(page.locator('[data-card-geo-choice]')).toHaveCount(0);
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
