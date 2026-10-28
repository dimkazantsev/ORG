// Rebuild the curated pilot and 12 Natural Earth outlines without network access.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const d3=require('../../lib/d3.v7.min.js');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const catalog=JSON.parse(read('assets/flags-world/catalog.json'));
const names=Object.fromEntries(catalog.countries.map(x=>[x.iso2,x.name_ru]));
const source='https://github.com/hampusborgos/country-flags/tree/'+catalog.source_commit;
const base='https://dimkazantsev.github.io/ORG/next/';
const image=iso=>base+'assets/flags-world/'+iso.toLowerCase()+'.svg';
const rows=[];
function add(id,mode,kind,prompt,options,solution,explanation,urls=[source]){
 assert.ok(!rows.some(x=>x.id===id));
 rows.push({id,mode,kind,prompt,options,solution:{...solution,flag_mode:mode,source_urls:urls},explanation});
}
function rotate(array,n){return array.slice(n).concat(array.slice(0,n))}
function pictured(id,mode,prompt,codes,target,explanation,extra={},urls){
 assert.equal(new Set(codes).size,4);codes.forEach(code=>assert.ok(names[code]&&code!=='AF'));
 const order=rotate(codes,rows.length%4);
 add(id,mode,'flag',prompt,order.map(code=>({image_url:image(code)})),{correct:order.indexOf(target),option_labels:order.map(code=>names[code]),...extra},explanation,urls);
}
const similar=[['FR','NL','RU','LU'],['IT','IE','CI','MX'],['DE','BE','UG','ES'],['AU','NZ','GB','FJ'],['NO','IS','SE','DK'],['PL','ID','SG','AT'],['HU','BG','RU','IT'],['IE','CI','IT','FR'],['NZ','AU','FJ','TV'],['FI','SE','NO','DK'],['LV','AT','PL','ID'],['ML','GN','SN','CM']];
similar.forEach((codes,i)=>pictured('similar-'+(i+1),'similar','Выберите флаг государства «'+names[codes[0]]+'» среди похожих.',codes,codes[0],'Верный флаг: '+names[codes[0]]+'. Сравните расположение полос, крестов и других деталей.'));
const colors=[...read('migrations/qwiz_flags_colors_first_20.sql').matchAll(/\('([A-Z]{2})','([^']+)','(horizontal|vertical)',array\[([^\]]+)\],array\[([^\]]+)\]\)/g)];
assert.equal(colors.length,20);
colors.forEach(([,iso,name,orientation,hex,namesText])=>{
 const values=text=>[...text.matchAll(/'([^']+)'/g)].map(x=>x[1]);
 const labels=values(namesText),hexes=values(hex);assert.equal(labels.length,3);assert.equal(hexes.length,3);
 add('assemble-'+iso,'assemble','order','Соберите флаг государства «'+name+'»: расположите полосы '+(orientation==='vertical'?'слева направо.':'сверху вниз.'),labels,{flag_assembly:{orientation,colors:Object.fromEntries(labels.map((label,i)=>[label,hexes[i]]))}},'Порядок полос: '+labels.join(' → ')+'.');
});
const predicates=[
 ['с тремя равными вертикальными полосами без герба',new Set(['FR','IT','IE','BE','RO','TD','ML','GN']),[['FR','IT','RU','DE'],['IE','BE','HU','BG']]],
 ['с тремя равными горизонтальными полосами без герба',new Set(['DE','RU','HU','BG','NL','LT','EE','AM']),[['DE','RU','FR','IT'],['HU','BG','IE','BE']]],
 ['со скандинавским крестом',new Set(['SE','DK','NO','FI','IS']),[['SE','FI','CH','JP'],['DK','NO','GR','IT']]],
 ['с одним цветным кругом на одноцветном фоне',new Set(['JP','BD','PW']),[['JP','BD','CA','CH'],['JP','PW','FR','DE']]],
 ['с полумесяцем',new Set(['TR','PK','TN','DZ','AZ','MY']),[['TR','PK','BR','JP'],['TN','DZ','CA','FR']]],
 ['с зелёными элементами',new Set(['BR','IT','IE','MX','PT','PK','BD','NG']),[['BR','IT','CA','JP'],['IE','MX','FR','DE']]]
];
predicates.forEach(([label,truth,sets],i)=>sets.forEach((codes,j)=>{
 const ordered=rotate(codes,(i+j)%4),indices=ordered.map((code,k)=>truth.has(code)?k:-1).filter(k=>k>=0);assert.equal(indices.length,2);
 add('multiple-'+(i+1)+'-'+j,'multiple','multi','Выберите все флаги '+label+'.',ordered.map(code=>({image_url:image(code)})),{correct_indices:indices,option_labels:ordered.map(code=>names[code])},'Правильный набор: '+indices.map(k=>names[ordered[k]]).join(', ')+'.');
}));
const geography=JSON.parse(read('assets/flag-maps/countries.geojson'));
assert.equal(geography.features.length,12);
geography.features.forEach((feature,i)=>{
 const code=feature.properties.iso2,choices=[code,...rotate(['FR','BR','IN','ES','AR','CH'],i%6).slice(0,3)];assert.equal(new Set(choices).size,4);
 pictured('geo-'+code,'geo','Выберите флаг страны, контур которой показан на карте.',choices,code,'На карте показан обобщённый контур государства «'+names[code]+'».',{media_url:base+'assets/flag-maps/outline-'+String(i+1).padStart(2,'0')+'.svg'},[geography.source]);
});
const ca='https://www.canada.ca/en/canadian-heritage/services/flag-canada-history.html';
const cad='https://www.canada.ca/en/canadian-heritage/services/flag-canada-description.html';
const fr='https://www.elysee.fr/la-presidence/le-drapeau-francais';
const de='https://www.bundestag.de/en/parliament/symbols/flag';
const za='https://www.dsac.gov.za/index.php/the-national-flag';
const history=[
 ['Когда состоялось торжественное первое поднятие современного флага Канады?',['15 февраля 1965','1 июля 1867','28 января 1965','1 января 1901'],'15 февраля 1965 года.',ca],
 ['Сколько концов у стилизованного кленового листа на современном флаге Канады?',['11','7','10','13'],'У современного листа 11 концов.',cad],
 ['Каково отношение длины современного флага Канады к его высоте?',['2:1','3:2','1:1','5:3'],'Длина вдвое больше высоты: 2:1.',cad],
 ['Зачем первоначальный 13-конечный лист канадского флага заменили 11-конечным?',['Чтобы его было легче узнавать издалека и на ветру','Чтобы обозначить число провинций','Чтобы убрать красный цвет','Чтобы сделать флаг квадратным'],'Изменение улучшило узнаваемость рисунка.',cad],
 ['В каком году во Франции закрепили порядок вертикальных полос: синий у древка, белый, красный?',['1794','1789','1815','1848'],'Порядок закреплён 15 февраля 1794 года.',fr],
 ['Какой город дал французскому триколору синий и красный цвета согласно описанию Елисейского дворца?',['Париж','Лион','Марсель','Бордо'],'Синий и красный — цвета Парижа.',fr],
 ['Какой цвет, по описанию Елисейского дворца, представлял монархию в истории французского триколора?',['Белый','Синий','Красный','Зелёный'],'Белый связывался с монархией.',fr],
 ['В каком году Парламентский совет выбрал чёрный, красный и золотой для флага ФРГ?',['1949','1914','1933','1990'],'Решение принято в 1949 году.',de],
 ['Какую дату Бундестаг связывает с распространением чёрно-красно-золотого флага на объединённую Германию?',['3 октября 1990','9 ноября 1989','23 мая 1949','1 января 1991'],'3 октября 1990 года.',de],
 ['Когда современный флаг ЮАР впервые начали использовать?',['27 апреля 1994','10 мая 1994','31 мая 1961','27 апреля 2000'],'Впервые использован 27 апреля 1994 года.',za],
 ['Кто создал современный национальный флаг ЮАР?',['Фред Браунелл','Нельсон Мандела','Десмонд Туту','Ян ван Рибек'],'Автор — бывший государственный герольд Фред Браунелл.',za],
 ['Как ведомство культуры ЮАР объясняет схождение линий рисунка флага в одну полосу?',['Сближение разных элементов общества и движение к единству','Точное число провинций','Карту крупнейших рек','Единственную религию государства'],'Это интерпретируется как сближение общества и единство.',za]
];
history.forEach(([prompt,options,explanation,url],i)=>{const order=rotate(options,i%4);add('history-'+(i+1),'history','flag',prompt,order,{correct:order.indexOf(options[0])},explanation,[url])});
assert.equal(rows.length,68);
assert.deepEqual(Object.fromEntries(['similar','assemble','multiple','geo','history'].map(mode=>[mode,rows.filter(x=>x.mode===mode).length])),{similar:12,assemble:20,multiple:12,geo:12,history:12});
function build(){
 geography.features.forEach((feature,i)=>{
  const projection=d3.geoMercator().fitExtent([[24,20],[616,340]],feature),d=d3.geoPath(projection)(feature);assert.ok(d&&!/NaN|Infinity/.test(d));
  fs.writeFileSync(path.join(root,'assets/flag-maps/outline-'+String(i+1).padStart(2,'0')+'.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><title>Контур страны без названия</title><path d="'+d+'" fill="#b7a1e0" stroke="#674491" stroke-width="1.2" stroke-linejoin="round"/></svg>\n');
 });
 const sql=`-- Curated pilot: 68 active questions; idempotent, no edits to previous questions.\nbegin;\ndo $seed$\ndeclare t uuid;o uuid;r jsonb;\nbegin\n if (select count(*) from public.qwiz_topics where name='Флаги мира')<>1 then raise exception 'Expected exactly one Flags topic; specify owner before importing';end if;\n select id,owner_id into t,o from public.qwiz_topics where name='Флаги мира';\n for r in select value from jsonb_array_elements($data$${JSON.stringify(rows)}$data$::jsonb) loop\n  if not public.qwiz_flags_question_valid(r->>'kind',r->'options',r->'solution') then raise exception 'Invalid curated question: %',r->>'id';end if;\n  if not exists(select 1 from public.qwiz_bank b where b.topic_id=t and ('fw:six:'||(r->>'id'))=any(b.tags)) then\n   insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,explanation,difficulty,tags)\n   values(o,t,r->>'kind',r->>'prompt',r->'options',r->'solution',r->>'explanation',3,array['fw:published','fw:stages7-12','fw:six:'||(r->>'id')]);\n  end if;\n end loop;\n if (select count(*) from public.qwiz_bank where topic_id=t and 'fw:stages7-12'=any(tags))<>68 then raise exception 'Expected 68 active curated questions';end if;\nend $seed$;\ncommit;\n`;
 fs.writeFileSync(path.join(root,'migrations/qwiz_flags_remaining_five_seed.sql'),sql);
 console.log('Generated 68 active questions (without retired flag-memory mode) and 12 outlines.');
}
if(require.main===module)build();
module.exports={rows,geography,build};
