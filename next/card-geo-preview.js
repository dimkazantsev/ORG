'use strict';
// Teacher-only Geography of Russia sandbox dataset. Facts are taken from the
// read-only qwiz_geo_catalog RPC, never invented from map coordinates.
window.QwizCardGeoPreview=(()=>{
 const modes=new Set(['locate','identify','capital','flag','silhouette','neighbour','detective','district']);
 const text=v=>String(v??'').trim();
 const choose=(arr)=>arr[Math.floor(Math.random()*arr.length)];
 function shuffle(arr){
  const items=arr.slice();
  for(let i=items.length-1;i>0;i--){
   const j=Math.floor(Math.random()*(i+1));[items[j],items[i]]=[items[i],items[j]];
  }
  return items;
 }
 function build({card,catalog,geometry}){
  if(!Array.isArray(catalog)||!Array.isArray(geometry))throw Error('Справочник регионов и карта не загружены');
  const geoById=new Map(geometry.map(r=>[text(r.id),r]));
  const regions=catalog.map(r=>({
   id:text(r.id),name:text(r.name),capital:text(r.capital),district:text(r.district),
   region_type:text(r.region_type),flag:text(r.flag),
   neighbors:Array.isArray(r.neighbors)?r.neighbors.map(text).filter(Boolean):[]
  })).filter(r=>r.id&&r.name&&geoById.has(r.id));
  if(regions.length!==89)throw Error('Для проверки карты нужны все 89 субъектов из подтверждённого справочника');
  const settings=card?.settings||{};
  const configured=Array.isArray(settings.geo_modes)?settings.geo_modes.filter(m=>modes.has(m)):[];
  if(!configured.length)throw Error('Сначала выберите географические механики в настройках карточки');
  const count=Math.min(89,Math.max(1,Number(settings.geo_count)||15));
  const targets=shuffle(regions);
  const byId=new Map(regions.map(r=>[r.id,r]));
  const used=new Set();
  const result=[];
  for(let i=0;i<count;i++){
   const desired=configured[i%configured.length];
   const eligible=targets.filter(r=>{
    if(used.has(r.id))return false;
    if(desired==='flag')return !!r.flag;
    if(desired==='neighbour')return r.neighbors.some(id=>byId.has(id)&&id!==r.id);
    if(desired==='capital')return !!r.capital;
    if(desired==='district')return !!r.district;
    if(desired==='detective')return !!r.capital&&!!r.district&&!!r.region_type;
    return true;
   });
   if(!eligible.length)throw Error('Недостаточно подтверждённых данных для механики «'+desired+'»');
   const region=eligible[0];used.add(region.id);
   let correct=region,prompt='',choices=[],showMap=false,focus=null,silhouette=false,clues=[];
   switch(desired){
    case 'locate':
     prompt='Найдите на карте: '+region.name;showMap=true;break;
    case 'identify':
     prompt='Как называется выделенный субъект России?';showMap=true;focus=region.id;break;
    case 'capital':
     prompt='Какой административный центр у субъекта «'+region.name+'»?';break;
    case 'flag':
     prompt='Какому субъекту принадлежит этот флаг?';break;
    case 'silhouette':
     prompt='Какой субъект изображён по контуру?';showMap=true;silhouette=true;break;
    case 'neighbour':{
     const available=region.neighbors.map(id=>byId.get(id)).filter(r=>r&&r.id!==region.id);
     correct=choose(available);
     prompt='Какой субъект граничит с «'+region.name+'»?';break;
    }
    case 'detective':
     prompt='Найдите субъект по подсказкам';
     clues=['Тип субъекта: '+region.region_type,'Федеральный округ: '+region.district,'Административный центр: '+region.capital];break;
    case 'district':
     prompt='К какому федеральному округу относится «'+region.name+'»?';break;
   }
   if(desired!=='locate'){
    const optionValue=r=>desired==='capital'?r.capital:desired==='district'?r.district:r.name;
    const answerText=optionValue(correct);
    const forbidden=desired==='neighbour'?new Set([region.id,...region.neighbors]):new Set([correct.id]);
    const seenText=new Set([answerText]);
    const wrong=shuffle(regions).filter(r=>{
     const value=optionValue(r);
     if(forbidden.has(r.id)||!value||seenText.has(value))return false;
     seenText.add(value);return true;
    }).slice(0,3);
    if(wrong.length!==3)throw Error('Не удалось составить четыре достоверных варианта для «'+desired+'»');
    choices=shuffle([correct,...wrong].map(r=>({id:r.id,text:optionValue(r)})));
   }
   result.push({
    mode:desired,region:region.id,regionName:region.name,regionBox:geoById.get(region.id).box,
    prompt,options:choices,correctId:correct.id,correctText:desired==='locate'?region.name:
      choices.find(o=>o.id===correct.id)?.text||correct.name,
    showMap,focus,silhouette,clues,flag:desired==='flag'?region.flag:null,
    explanation:desired==='neighbour'
      ?'Соседство подтверждено справочником субъектов России.'
      :'Ответ проверяется по справочнику 89 субъектов России.'
   });
  }
  return result;
 }
 return Object.freeze({build});
})();