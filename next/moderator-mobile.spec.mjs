import {test,expect} from '@playwright/test';

// Recreate the host preview without needing a teacher account or production room.
// Structural checks run against the real stylesheet at narrow phone widths.
const svg='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22240%22 height=%22160%22 viewBox=%220 0 240 160%22%3E%3Crect width=%22240%22 height=%2253%22 fill=%22%23fff%22/%3E%3Crect y=%2253%22 width=%22240%22 height=%2254%22 fill=%22%232572ce%22/%3E%3Crect y=%22107%22 width=%22240%22 height=%2253%22 fill=%22%23de3030%22/%3E%3C/svg%3E';
const prompt='Выберите флаг государства, которое является участником международной организации. Длинная формулировка должна полностью переноситься внутри карточки и не перекрывать варианты ответа.';
const choices=Array.from({length:4},(_,i)=>'<span class="moderator-choice has-flag"><b class="moderator-option-letter">'+String.fromCharCode(65+i)+'</b><img class="moderator-option-flag" src="'+svg+'" alt="Флаг '+(i+1)+'"></span>').join('');
const card=(kind,label)=>'<article class="moderator-slide '+kind+'"><span class="moderator-slide-overline">'+label+'</span><h4>Вопрос о флагах</h4><p>'+prompt+'</p><div class="moderator-slide-choices">'+choices+'</div></article>';
const markup='<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="http://127.0.0.1:8080/next/workspace.css"></head><body><section id="liveConsole"><section class="moderator-storyboard"><div class="moderator-slides">'+card('','Предыдущий')+card('is-current','Текущий')+card('','Следующий')+'</div></section></section></body></html>';

for(const width of [320,375,390,430,700]){
 test('Host preview: flags and prompt never overlap at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:820});
  await page.setContent(markup,{waitUntil:'load'});
  const result=await page.evaluate(()=>{
   const rect=e=>{const {left,right,top,bottom,width}=e.getBoundingClientRect();return{left,right,top,bottom,width}};
   const current=document.querySelector('.moderator-slide.is-current');
   const previous=document.querySelector('.moderator-slide:first-child');
   const following=document.querySelector('.moderator-slide:last-child');
   const prompt=current.querySelector('p');
   const options=current.querySelector('.moderator-slide-choices');
   const flags=[...current.querySelectorAll('.moderator-option-flag')];
   const contained=(child,parent)=>child.left>=parent.left-1&&child.right<=parent.right+1&&child.top>=parent.top-1&&child.bottom<=parent.bottom+1;
   const cr=rect(current),pr=rect(prompt),or=rect(options);
   return{
    viewport:document.documentElement.clientWidth,
    current:cr,previous:rect(previous),following:rect(following),
    prompt:pr,options:or,
    promptVisible:prompt.scrollHeight<=prompt.clientHeight+1,
    flagContained:flags.every(flag=>contained(rect(flag),rect(flag.closest('.moderator-choice'))))
   };
  });
  expect(result.viewport).toBe(width);
  expect(result.current.width).toBeGreaterThan(width*0.7);
  expect(result.current.bottom).toBeLessThanOrEqual(result.previous.top+1);
  expect(result.current.bottom).toBeLessThanOrEqual(result.following.top+1);
  expect(result.prompt.bottom).toBeLessThanOrEqual(result.options.top+1);
  expect(result.promptVisible).toBe(true);
  expect(result.flagContained).toBe(true);
  await page.screenshot({path:'visual-artifacts/moderator-mobile-'+width+'.png',fullPage:true});
 });
}
