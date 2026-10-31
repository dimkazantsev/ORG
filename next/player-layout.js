'use strict';
(()=>{
 const root=document.documentElement,game=document.getElementById('gameView'),content=document.getElementById('gameContent');
 const sheet=document.getElementById('playerDetails'),more=document.getElementById('playerMore'),body=document.getElementById('playerDetailsContent');
 const media=matchMedia('(max-width:800px), (max-width:1100px) and (max-height:540px)');
 const blocks=[game.querySelector('.game-top .control-row'),document.getElementById('playerTeamPanel'),document.getElementById('arcadeWalletPanel'),document.getElementById('playerTeamProgress'),game.querySelector('.game-side')].map(node=>{
  const anchor=document.createComment('Player details position');node.before(anchor);return {node,anchor};
 });
 function close(){if(sheet.open)sheet.close()}
 function viewport(){
  if(!root.classList.contains('player-compact'))return;
  root.style.setProperty('--player-height',(window.visualViewport?.height||innerHeight)+'px');
  root.style.setProperty('--player-top',(window.visualViewport?.offsetTop||0)+'px');
 }
 function roundDetails(){
  const box=document.getElementById('playerArcadeDetails');
  box.replaceChildren(...Array.from(content.querySelectorAll('.arcade-ranks,.arcade-badges'),el=>el.cloneNode(true)));
  // The phone's main area owns the results. The details sheet may display
  // COPIES, but must never remove the original answer or scoreboard.
  const results=document.getElementById('playerResultDetails');
  results.replaceChildren(...Array.from(content.querySelectorAll('.personal-results:not(.player-final-results)'),el=>el.cloneNode(true)));
  const review=document.getElementById('playerReviewContent');
  review.replaceChildren(...Array.from(content.querySelectorAll('.player-answer>p'),el=>el.cloneNode(true)));
  document.getElementById('playerReview').hidden=!review.childElementCount;
 }
 function sync(){
  const compact=media.matches&&!game.hidden;root.classList.toggle('player-compact',compact);
  // Keep the single answer confirmation in its reserved slot below the options.
  // Never copy it into the session header or hide it on compact screens.
  if(!compact)close();
  for(const {node,anchor} of blocks){const keepLobbyTeam=compact&&node.id==='playerTeamPanel'&&!!content.querySelector('.player-team-building');const toSheet=compact&&!keepLobbyTeam;const target=toSheet?(node.classList.contains('control-row')?document.getElementById('playerSheetControls'):body):anchor.parentNode;if(node.parentNode!==target){if(toSheet)target.append(node);else anchor.after(node)}}
  if(compact){viewport();roundDetails()}
 }
 more.onclick=()=>{roundDetails();sheet.showModal();more.setAttribute('aria-expanded','true')};
 document.getElementById('playerDetailsClose').onclick=close;
 sheet.addEventListener('close',()=>more.setAttribute('aria-expanded','false'));
 sheet.addEventListener('click',event=>{if(event.composedPath().some(node=>node.id==='gameFullscreen'))close();if(event.target!==sheet)return;const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close()});
 const head=sheet.querySelector('.player-sheet-head');let touchY=0;
 head.addEventListener('touchstart',event=>{touchY=event.touches[0].clientY},{passive:true});
 head.addEventListener('touchend',event=>{if(event.changedTouches[0].clientY-touchY>65)close()},{passive:true});
 new MutationObserver(sync).observe(game,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(records=>{if(records.some(r=>r.target===content))sync();else if(sheet.open&&records.some(r=>r.target.closest?.('.arcade-ranks,.arcade-badges')))roundDetails()}).observe(content,{childList:true,subtree:true});
 media.addEventListener('change',sync);window.addEventListener('resize',viewport);
 window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
 sync();
})();
