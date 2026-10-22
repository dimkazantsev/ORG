'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ready=false;
function stripesMarkup(option){
 const o=option||{},stripes=Array.isArray(o.stripes)?o.stripes:[];
 if(![2,3,4].includes(stripes.length)||!stripes.every(s=>/^#[0-9a-fA-F]{6}$/.test(s)))return '';
 const vertical=o.orientation==='vertical';
 return '<span class="preview-striped '+(vertical?'vertical':'horizontal')+'" role="img" aria-label="Цветные полосы, вариант ответа">'+stripes.map(color=>'<span style="background:'+esc(color)+'"></span>').join('')+'</span>';
}
function optionMarkup(option,index){
 const letter='<b class="preview-letter">'+String.fromCharCode(65+index)+'</b>';
 if(typeof option==='string')return letter+'<span>'+esc(option)+'</span>';
 if(option?.stripes)return letter+stripesMarkup(option);
 if(/^https:\/\//.test(option?.image_url||''))return letter+'<span class="flag-choice-with-label"><img class="preview-flag" src="'+esc(option.image_url)+'" alt="Флаг, вариант '+String.fromCharCode(65+index)+'" loading="lazy">'+(typeof option.label==='string'?'<span class="flag-choice-label">'+esc(option.label)+'</span>':'')+'</span>';
 return letter+'<span>Вариант '+String.fromCharCode(65+index)+'</span>';
}
window.addEventListener('message',e=>{
 if(e.origin!==location.origin||e.source!==window.opener||e.data?.type!=='qwiz-preview-data')return;
 const {question:q,index,total}=e.data;if(!q)return;
 $('previewMode').textContent=({country:'Страна по флагу',picker:'Флаг по названию',colors:'Цвета и полосы',symbols:'Символы и гербы',fragments:'Фрагменты и пиксели',errors:'Поиск ошибок на флагах'})[q.solution?.flag_mode]||'Флаги мира';
 $('previewPosition').textContent='Вопрос '+index+' из '+total;
 $('previewPrompt').textContent=q.prompt||'Без текста';
 const isVisual=['symbols','fragments'].includes(q.solution?.flag_mode);
 const media=['country','symbols','fragments'].includes(q.solution?.flag_mode)?q.solution?.media_url:q.solution?.illustration_url;
 $('previewMedia').innerHTML=typeof media==='string'&&/^https:\/\//.test(media)?
  (isVisual?QwizStage.flagVisualContent(media,q.solution.flag_visual,false):'<img src="'+esc(media)+'" alt="Изображение к вопросу" loading="lazy">'):'';
 QwizStage.hydrateFlagVisuals($('previewMedia'));
 $('previewMedia').hidden=!$('previewMedia').innerHTML;
 $('previewChoices').innerHTML=(q.options||[]).map((o,i)=>'<div class="preview-choice">'+optionMarkup(o,i)+'</div>').join('');
 $('previewPrev').disabled=index<=1;$('previewNext').disabled=index>=total;
 $('previewMessage').textContent='';
 ready=true;
});
function step(d){if(!ready)return;window.opener?.postMessage({type:'qwiz-preview-step',step:d},location.origin)}
$('previewPrev').onclick=()=>step(-1);$('previewNext').onclick=()=>step(1);
$('previewEdit').onclick=()=>window.opener?.postMessage({type:'qwiz-preview-edit'},location.origin);
$('previewClose').onclick=()=>window.close();
document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();step(-1)}else if(e.key==='ArrowRight'){e.preventDefault();step(1)}else if(e.key==='Escape')window.close()});
if(window.opener)window.opener.postMessage({type:'qwiz-preview-ready'},location.origin);
else $('previewMessage').textContent='Откройте предпросмотр из кабинета преподавателя.';
