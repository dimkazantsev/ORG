-- Geography of Russia: factual registry, individual per-player sessions, server-side scoring.
-- Region metadata: factual reference of 89 subjects from two source datasets. Borders are NOT copied here.
-- Boundaries runtime asset is separately sourced; publish only with license/provenance review.
create table if not exists public.qwiz_geo_regions(
 id text primary key, name text not null, capital text not null,
 fd text not null, kind text not null, flag text, neighbors text[] not null default '{}');
create table if not exists public.qwiz_geo_runs(
 room_id uuid not null references public.org_next_rooms(id) on delete cascade,
 player_id uuid not null references public.org_next_players(id) on delete cascade,
 card_position integer not null,
 tasks jsonb not null default '[]'::jsonb,
 current_index integer not null default 0,
 score integer not null default 0,
 correct_count integer not null default 0,
 updated_at timestamptz not null default now(),
 primary key(room_id,player_id,card_position)
);
create index if not exists qwiz_geo_runs_room_index on public.qwiz_geo_runs(room_id,card_position);
alter table public.qwiz_geo_regions enable row level security;
alter table public.qwiz_geo_runs enable row level security;
revoke all on table public.qwiz_geo_regions,public.qwiz_geo_runs from public,anon,authenticated;
insert into public.qwiz_geo_regions(id,name,capital,fd,kind,flag,neighbors)
select r.id,r.name,r.capital,r.fd,r.kind,r.flag,r.neighbors
from jsonb_to_recordset($geo_reg$[{"id":"karachay-cherkessia","name":"Карачаево-Черкесская Республика","capital":"Черкесск","fd":"СКФО","kind":"Республика","flag":"kc","neighbors":["kabardino-balkaria","krasnodar","stavropol"]},{"id":"karelia","name":"Республика Карелия","capital":"Петрозаводск","fd":"СЗФО","kind":"Республика","flag":"kr","neighbors":["arkhangelsk","leningrad","murmansk","vologda"]},{"id":"kemerovo","name":"Кемеровская область — Кузбасс","capital":"Кемерово","fd":"СФО","kind":"Область","flag":"kem","neighbors":["khakassia","altai-kray","altai-rep","novosibirsk","tomsk","krasnoyarsk"]},{"id":"khabarovsk","name":"Хабаровский край","capital":"Хабаровск","fd":"ДФО","kind":"Край","flag":"kha","neighbors":["amur","magadan","primorsky","sakha","jewish-ao"]},{"id":"khakassia","name":"Республика Хакасия","capital":"Абакан","fd":"СФО","kind":"Республика","flag":"kk","neighbors":["kemerovo","altai-rep","tuva","krasnoyarsk"]},{"id":"khmao","name":"Ханты-Мансийский автономный округ — Югра","capital":"Ханты-Мансийск","fd":"УФО","kind":"Автономный округ","flag":"khm","neighbors":["komi","sverdlovsk","tomsk","tyumen","yamalo-nenets","krasnoyarsk"]},{"id":"adygea","name":"Республика Адыгея","capital":"Майкоп","fd":"ЮФО","kind":"Республика","flag":"ad","neighbors":["krasnodar"]},{"id":"altai-kray","name":"Алтайский край","capital":"Барнаул","fd":"СФО","kind":"Край","flag":"alt","neighbors":["kemerovo","altai-rep","novosibirsk"]},{"id":"amur","name":"Амурская область","capital":"Благовещенск","fd":"ДФО","kind":"Область","flag":"amu","neighbors":["khabarovsk","sakha","jewish-ao","zabaykalsky"]},{"id":"arkhangelsk","name":"Архангельская область","capital":"Архангельск","fd":"СЗФО","kind":"Область","flag":"ark","neighbors":["karelia","kirov","komi","nenets","vologda"]},{"id":"astrakhan","name":"Астраханская область","capital":"Астрахань","fd":"ЮФО","kind":"Область","flag":"ast","neighbors":["kalmykia","volgograd"]},{"id":"bashkortostan","name":"Республика Башкортостан","capital":"Уфа","fd":"ПФО","kind":"Республика","flag":"ba","neighbors":["chelyabinsk","orenburg","sverdlovsk","tatarstan","udmurtia","perm"]},{"id":"belgorod","name":"Белгородская область","capital":"Белгород","fd":"ЦФО","kind":"Область","flag":"bel","neighbors":["kursk","voronezh"]},{"id":"bryansk","name":"Брянская область","capital":"Брянск","fd":"ЦФО","kind":"Область","flag":"bry","neighbors":["kaluga","kursk","oryol","smolensk"]},{"id":"buryatia","name":"Республика Бурятия","capital":"Улан-Удэ","fd":"ДФО","kind":"Республика","flag":"bu","neighbors":["tuva","zabaykalsky","irkutsk"]},{"id":"chechnya","name":"Чеченская Республика","capital":"Грозный","fd":"СКФО","kind":"Республика","flag":"ce","neighbors":["dagestan","ingushetia","north-ossetia","stavropol"]},{"id":"chelyabinsk","name":"Челябинская область","capital":"Челябинск","fd":"УФО","kind":"Область","flag":"che","neighbors":["bashkortostan","kurgan","orenburg","sverdlovsk"]},{"id":"chuvashia","name":"Чувашская Республика","capital":"Чебоксары","fd":"ПФО","kind":"Республика","flag":"cu","neighbors":["mari-el","mordovia","nizhny-novgorod","tatarstan","ulyanovsk"]},{"id":"spb","name":"Санкт-Петербург","capital":"Санкт-Петербург","fd":"СЗФО","kind":"Город федерального значения","flag":"spe","neighbors":["leningrad"]},{"id":"dagestan","name":"Республика Дагестан","capital":"Махачкала","fd":"СКФО","kind":"Республика","flag":"da","neighbors":["chechnya","kalmykia","stavropol"]},{"id":"altai-rep","name":"Республика Алтай","capital":"Горно-Алтайск","fd":"СФО","kind":"Республика","flag":"al","neighbors":["kemerovo","khakassia","altai-kray","tuva"]},{"id":"ingushetia","name":"Республика Ингушетия","capital":"Магас","fd":"СКФО","kind":"Республика","flag":"in","neighbors":["chechnya","north-ossetia"]},{"id":"ivanovo","name":"Ивановская область","capital":"Иваново","fd":"ЦФО","kind":"Область","flag":"iva","neighbors":["kostroma","nizhny-novgorod","vladimir","yaroslavl"]},{"id":"kabardino-balkaria","name":"Кабардино-Балкарская Республика","capital":"Нальчик","fd":"СКФО","kind":"Республика","flag":"kb","neighbors":["karachay-cherkessia","north-ossetia","stavropol"]},{"id":"kaliningrad","name":"Калининградская область","capital":"Калининград","fd":"СЗФО","kind":"Область","flag":"kgd","neighbors":[]},{"id":"kalmykia","name":"Республика Калмыкия","capital":"Элиста","fd":"ЮФО","kind":"Республика","flag":"kl","neighbors":["astrakhan","dagestan","rostov","stavropol","volgograd"]},{"id":"kaluga","name":"Калужская область","capital":"Калуга","fd":"ЦФО","kind":"Область","flag":"klu","neighbors":["bryansk","moscow-oblast","oryol","smolensk","tula"]},{"id":"kirov","name":"Кировская область","capital":"Киров","fd":"ПФО","kind":"Область","flag":"kir","neighbors":["arkhangelsk","komi","kostroma","mari-el","nizhny-novgorod","tatarstan","udmurtia","vologda","perm"]},{"id":"komi","name":"Республика Коми","capital":"Сыктывкар","fd":"СЗФО","kind":"Республика","flag":"ko","neighbors":["khmao","arkhangelsk","kirov","nenets","sverdlovsk","yamalo-nenets","perm"]},{"id":"kostroma","name":"Костромская область","capital":"Кострома","fd":"ЦФО","kind":"Область","flag":"kos","neighbors":["ivanovo","kirov","nizhny-novgorod","vologda","yaroslavl"]},{"id":"krasnodar","name":"Краснодарский край","capital":"Краснодар","fd":"ЮФО","kind":"Край","flag":"kda","neighbors":["karachay-cherkessia","adygea","rostov","stavropol"]},{"id":"kurgan","name":"Курганская область","capital":"Курган","fd":"УФО","kind":"Область","flag":"kgn","neighbors":["chelyabinsk","sverdlovsk","tyumen"]},{"id":"kursk","name":"Курская область","capital":"Курск","fd":"ЦФО","kind":"Область","flag":"krs","neighbors":["belgorod","bryansk","lipetsk","oryol","voronezh"]},{"id":"leningrad","name":"Ленинградская область","capital":"Гатчина","fd":"СЗФО","kind":"Область","flag":"len","neighbors":["karelia","spb","novgorod","pskov","vologda"]},{"id":"lipetsk","name":"Липецкая область","capital":"Липецк","fd":"ЦФО","kind":"Область","flag":"lip","neighbors":["kursk","oryol","ryazan","tambov","tula","voronezh"]},{"id":"magadan","name":"Магаданская область","capital":"Магадан","fd":"ДФО","kind":"Область","flag":"mag","neighbors":["khabarovsk","sakha","kamchatka","chukotka"]},{"id":"mari-el","name":"Республика Марий Эл","capital":"Йошкар-Ола","fd":"ПФО","kind":"Республика","flag":"me","neighbors":["chuvashia","kirov","nizhny-novgorod","tatarstan"]},{"id":"mordovia","name":"Республика Мордовия","capital":"Саранск","fd":"ПФО","kind":"Республика","flag":"mo","neighbors":["chuvashia","nizhny-novgorod","penza","ryazan","ulyanovsk"]},{"id":"moscow-oblast","name":"Московская область","capital":"Красногорск","fd":"ЦФО","kind":"Область","flag":"mos","neighbors":["kaluga","ryazan","smolensk","tula","tver","vladimir","yaroslavl"]},{"id":"murmansk","name":"Мурманская область","capital":"Мурманск","fd":"СЗФО","kind":"Область","flag":"mur","neighbors":["karelia"]},{"id":"nenets","name":"Ненецкий автономный округ","capital":"Нарьян-Мар","fd":"СЗФО","kind":"Автономный округ","flag":"nen","neighbors":["arkhangelsk","komi","yamalo-nenets"]},{"id":"nizhny-novgorod","name":"Нижегородская область","capital":"Нижний Новгород","fd":"ПФО","kind":"Область","flag":"niz","neighbors":["chuvashia","ivanovo","kirov","kostroma","mari-el","mordovia","ryazan","vladimir"]},{"id":"north-ossetia","name":"Республика Северная Осетия — Алания","capital":"Владикавказ","fd":"СКФО","kind":"Республика","flag":"se","neighbors":["chechnya","ingushetia","kabardino-balkaria","stavropol"]},{"id":"novgorod","name":"Новгородская область","capital":"Великий Новгород","fd":"СЗФО","kind":"Область","flag":"ngr","neighbors":["leningrad","pskov","tver","vologda"]},{"id":"novosibirsk","name":"Новосибирская область","capital":"Новосибирск","fd":"СФО","kind":"Область","flag":"nvs","neighbors":["kemerovo","altai-kray","omsk","tomsk"]},{"id":"omsk","name":"Омская область","capital":"Омск","fd":"СФО","kind":"Область","flag":"oms","neighbors":["novosibirsk","tomsk","tyumen"]},{"id":"oryol","name":"Орловская область","capital":"Орёл","fd":"ЦФО","kind":"Область","flag":"orl","neighbors":["bryansk","kaluga","kursk","lipetsk","tula"]},{"id":"orenburg","name":"Оренбургская область","capital":"Оренбург","fd":"ПФО","kind":"Область","flag":"ore","neighbors":["bashkortostan","chelyabinsk","samara","saratov","tatarstan"]},{"id":"penza","name":"Пензенская область","capital":"Пенза","fd":"ПФО","kind":"Область","flag":"pnz","neighbors":["mordovia","ryazan","saratov","tambov","ulyanovsk"]},{"id":"primorsky","name":"Приморский край","capital":"Владивосток","fd":"ДФО","kind":"Край","flag":"pri","neighbors":["khabarovsk"]},{"id":"pskov","name":"Псковская область","capital":"Псков","fd":"СЗФО","kind":"Область","flag":"psk","neighbors":["leningrad","novgorod","smolensk","tver"]},{"id":"rostov","name":"Ростовская область","capital":"Ростов-на-Дону","fd":"ЮФО","kind":"Область","flag":"ros","neighbors":["kalmykia","krasnodar","stavropol","volgograd","voronezh"]},{"id":"ryazan","name":"Рязанская область","capital":"Рязань","fd":"ЦФО","kind":"Область","flag":"rya","neighbors":["lipetsk","mordovia","moscow-oblast","nizhny-novgorod","penza","tambov","tula","vladimir"]},{"id":"sakha","name":"Республика Саха (Якутия)","capital":"Якутск","fd":"ДФО","kind":"Республика","flag":"sa","neighbors":["khabarovsk","amur","magadan","krasnoyarsk","zabaykalsky","irkutsk","chukotka"]},{"id":"sakhalin","name":"Сахалинская область","capital":"Южно-Сахалинск","fd":"ДФО","kind":"Область","flag":"sak","neighbors":[]},{"id":"samara","name":"Самарская область","capital":"Самара","fd":"ПФО","kind":"Область","flag":"sam","neighbors":["orenburg","saratov","tatarstan","ulyanovsk"]},{"id":"saratov","name":"Саратовская область","capital":"Саратов","fd":"ПФО","kind":"Область","flag":"sar","neighbors":["orenburg","penza","samara","tambov","ulyanovsk","volgograd","voronezh"]},{"id":"smolensk","name":"Смоленская область","capital":"Смоленск","fd":"ЦФО","kind":"Область","flag":"smo","neighbors":["bryansk","kaluga","moscow-oblast","pskov","tver"]},{"id":"stavropol","name":"Ставропольский край","capital":"Ставрополь","fd":"СКФО","kind":"Край","flag":"sta","neighbors":["karachay-cherkessia","chechnya","dagestan","kabardino-balkaria","kalmykia","krasnodar","north-ossetia","rostov"]},{"id":"sverdlovsk","name":"Свердловская область","capital":"Екатеринбург","fd":"УФО","kind":"Область","flag":"sve","neighbors":["khmao","bashkortostan","chelyabinsk","komi","kurgan","tyumen","perm"]},{"id":"tambov","name":"Тамбовская область","capital":"Тамбов","fd":"ЦФО","kind":"Область","flag":"tam","neighbors":["lipetsk","penza","ryazan","saratov","voronezh"]},{"id":"tatarstan","name":"Республика Татарстан","capital":"Казань","fd":"ПФО","kind":"Республика","flag":"ta","neighbors":["bashkortostan","chuvashia","kirov","mari-el","orenburg","samara","udmurtia","ulyanovsk"]},{"id":"tomsk","name":"Томская область","capital":"Томск","fd":"СФО","kind":"Область","flag":"tom","neighbors":["kemerovo","khmao","novosibirsk","omsk","tyumen","krasnoyarsk"]},{"id":"tula","name":"Тульская область","capital":"Тула","fd":"ЦФО","kind":"Область","flag":"tul","neighbors":["kaluga","lipetsk","moscow-oblast","oryol","ryazan"]},{"id":"tuva","name":"Республика Тыва","capital":"Кызыл","fd":"СФО","kind":"Республика","flag":"ty","neighbors":["khakassia","buryatia","altai-rep","krasnoyarsk","irkutsk"]},{"id":"tver","name":"Тверская область","capital":"Тверь","fd":"ЦФО","kind":"Область","flag":"tve","neighbors":["moscow-oblast","novgorod","pskov","smolensk","vologda","yaroslavl"]},{"id":"tyumen","name":"Тюменская область","capital":"Тюмень","fd":"УФО","kind":"Область","flag":"tyu","neighbors":["khmao","kurgan","omsk","sverdlovsk","tomsk"]},{"id":"udmurtia","name":"Удмуртская Республика","capital":"Ижевск","fd":"ПФО","kind":"Республика","flag":"ud","neighbors":["bashkortostan","kirov","tatarstan","perm"]},{"id":"ulyanovsk","name":"Ульяновская область","capital":"Ульяновск","fd":"ПФО","kind":"Область","flag":"uly","neighbors":["chuvashia","mordovia","penza","samara","saratov","tatarstan"]},{"id":"vladimir","name":"Владимирская область","capital":"Владимир","fd":"ЦФО","kind":"Область","flag":"vla","neighbors":["ivanovo","moscow-oblast","nizhny-novgorod","ryazan","yaroslavl"]},{"id":"volgograd","name":"Волгоградская область","capital":"Волгоград","fd":"ЮФО","kind":"Область","flag":"vgg","neighbors":["astrakhan","kalmykia","rostov","saratov","voronezh"]},{"id":"vologda","name":"Вологодская область","capital":"Вологда","fd":"СЗФО","kind":"Область","flag":"vlg","neighbors":["karelia","arkhangelsk","kirov","kostroma","leningrad","novgorod","tver","yaroslavl"]},{"id":"voronezh","name":"Воронежская область","capital":"Воронеж","fd":"ЦФО","kind":"Область","flag":"vor","neighbors":["belgorod","kursk","lipetsk","rostov","saratov","tambov","volgograd"]},{"id":"yamalo-nenets","name":"Ямало-Ненецкий автономный округ","capital":"Салехард","fd":"УФО","kind":"Автономный округ","flag":"yan","neighbors":["khmao","komi","nenets","krasnoyarsk"]},{"id":"yaroslavl","name":"Ярославская область","capital":"Ярославль","fd":"ЦФО","kind":"Область","flag":"yar","neighbors":["ivanovo","kostroma","moscow-oblast","tver","vladimir","vologda"]},{"id":"jewish-ao","name":"Еврейская автономная область","capital":"Биробиджан","fd":"ДФО","kind":"Автономная область","flag":"yev","neighbors":["khabarovsk","amur"]},{"id":"crimea","name":"Республика Крым","capital":"Симферополь","fd":"ЮФО","kind":"Республика","flag":"cr","neighbors":["sevastopol"]},{"id":"sevastopol","name":"Севастополь","capital":"Севастополь","fd":"ЮФО","kind":"Город федерального значения","flag":"sev","neighbors":["crimea"]},{"id":"krasnoyarsk","name":"Красноярский край","capital":"Красноярск","fd":"СФО","kind":"Край","flag":"kya","neighbors":["kemerovo","khakassia","khmao","sakha","tomsk","tuva","yamalo-nenets","irkutsk"]},{"id":"zabaykalsky","name":"Забайкальский край","capital":"Чита","fd":"ДФО","kind":"Край","flag":"zab","neighbors":["amur","buryatia","sakha","irkutsk"]},{"id":"irkutsk","name":"Иркутская область","capital":"Иркутск","fd":"СФО","kind":"Область","flag":"irk","neighbors":["buryatia","sakha","tuva","krasnoyarsk","zabaykalsky"]},{"id":"perm","name":"Пермский край","capital":"Пермь","fd":"ПФО","kind":"Край","flag":"per","neighbors":["bashkortostan","kirov","komi","sverdlovsk","udmurtia"]},{"id":"kamchatka","name":"Камчатский край","capital":"Петропавловск-Камчатский","fd":"ДФО","kind":"Край","flag":"kam","neighbors":["magadan","chukotka"]},{"id":"moscow","name":"Москва","capital":"Москва","fd":"ЦФО","kind":"Город федерального значения","flag":"mow","neighbors":[]},{"id":"chukotka","name":"Чукотский автономный округ","capital":"Анадырь","fd":"ДФО","kind":"Автономный округ","flag":"chu","neighbors":["magadan","sakha","kamchatka"]},{"id":"kherson","name":"Херсонская область","capital":"Геническ","fd":"ЮФО","kind":"Область","flag":"khe","neighbors":["zaporozhye"]},{"id":"lnr","name":"Луганская Народная Республика","capital":"Луганск","fd":"ЮФО","kind":"Республика","flag":"lnr","neighbors":["dnr"]},{"id":"dnr","name":"Донецкая Народная Республика","capital":"Донецк","fd":"ЮФО","kind":"Республика","flag":"dnr","neighbors":["lnr","zaporozhye"]},{"id":"zaporozhye","name":"Запорожская область","capital":"Мелитополь","fd":"ЮФО","kind":"Область","flag":"zap","neighbors":["kherson","dnr"]}]$geo_reg$::jsonb)
as r(id text,name text,capital text,fd text,kind text,flag text,neighbors text[])
on conflict(id) do update set name=excluded.name,capital=excluded.capital,
fd=excluded.fd,kind=excluded.kind,flag=excluded.flag,neighbors=excluded.neighbors;

create or replace function public.qwiz_geo_play(p_room uuid,p_answer text default null)
returns jsonb language plpgsql security definer set search_path='' as $geo$
declare r public.org_next_rooms%rowtype;a public.qwiz_room_activity%rowtype;
p public.org_next_players%rowtype; run public.qwiz_geo_runs%rowtype;
ids text[]; all_ids text[]; opts text[]; n int;i int;
modes jsonb;v_mode text;v_id text;v_answer text;v_neighbor text;v_options jsonb;v_tasks jsonb:='[]'::jsonb;
v_region public.qwiz_geo_regions%rowtype;v_task jsonb;v_hit boolean;v_award int:=0;
v_count int;v_sec int;v_open boolean;v_remaining int;
begin
 if (select auth.uid()) is null then raise exception 'Требуется вход';end if;
 select * into r from public.org_next_rooms where id=p_room;
 if not found then raise exception 'Комната не найдена';end if;
 select * into p from public.org_next_players x where x.room_id=p_room and x.team_id is not null
  and (x.user_id=(select auth.uid()) or exists(
   select 1 from public.qwiz_player_device_access d where d.room_id=p_room
    and d.player_id=x.id and d.user_id=(select auth.uid()))) limit 1;
 if not found then raise exception 'Сначала вступите в команду';end if;
 select * into a from public.qwiz_room_activity where room_id=p_room;
 if r.phase<>'intermission' or not found or a.settings->>'arcade_mode'<>'russia_map' then
   return jsonb_build_object('active',false);end if;
 v_sec:=greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180)));
 v_remaining:=greatest(0,ceil(extract(epoch from a.entered_at+make_interval(secs=>v_sec)-clock_timestamp()))::int);
 v_open:=v_remaining>0;
 select * into run from public.qwiz_geo_runs x
 where x.room_id=p_room and x.player_id=p.id and x.card_position=a.card_position for update;
 if not found then
   n:=greatest(1,least(89,coalesce((a.settings->>'geo_count')::int,15)));
   modes:=a.settings->'geo_modes';
   if jsonb_typeof(modes) is distinct from 'array' or jsonb_array_length(modes)=0 then
    modes:='["locate","identify","capital","flag","silhouette","neighbour","detective"]'::jsonb;
   end if;
   select array_agg(id order by md5(id||':'||p.id::text||':'||p_room::text||':'||a.card_position::text))
     into ids from public.qwiz_geo_regions;
   for i in 1..n loop
    v_id:=ids[i];select * into v_region from public.qwiz_geo_regions where id=v_id;
    v_mode:=modes->>((i-1)%jsonb_array_length(modes));
    if v_mode not in ('locate','identify','capital','flag','silhouette','neighbour','detective') then v_mode:='locate';end if;
    if v_mode='neighbour' and cardinality(v_region.neighbors)=0 then v_mode:='locate';end if;
    if v_mode='flag' and v_region.flag is null then v_mode:='identify';end if;
    v_answer:=case when v_mode='neighbour'
       then v_region.neighbors[1+mod(i+length(p.id::text),cardinality(v_region.neighbors))]
       else v_id end;
    select array_agg(z.id order by md5(z.id||':'||p.id::text||':'||i::text)) into all_ids
       from public.qwiz_geo_regions z where z.id<>v_answer;
    opts:=array[v_answer,all_ids[1],all_ids[2],all_ids[3]];
    select jsonb_agg(jsonb_build_object('id',x.id,'text',
      case when v_mode='capital' then z.capital else z.name end)
      order by md5(x.id||':'||p.id::text||':'||i::text))
      into v_options from unnest(opts) x(id) join public.qwiz_geo_regions z on z.id=x.id;
    v_tasks:=v_tasks||jsonb_build_array(jsonb_build_object(
      'mode',v_mode,'region',v_id,'answer',v_answer,
      'name',v_region.name,'capital',v_region.capital,
      'district',v_region.fd,'region_type',v_region.kind,
      'flag',v_region.flag,'options',v_options));
   end loop;
   insert into public.qwiz_geo_runs(room_id,player_id,card_position,tasks)
     values(p_room,p.id,a.card_position,v_tasks) returning * into run;
 end if;
 v_count:=jsonb_array_length(run.tasks);
 if p_answer is not null and v_open and run.current_index<v_count then
   v_task:=run.tasks->run.current_index;v_hit:=p_answer=v_task->>'answer';
   v_award:=case when v_hit then 100 else 0 end;
   update public.qwiz_geo_runs x set current_index=x.current_index+1,
    score=x.score+v_award,correct_count=x.correct_count+case when v_hit then 1 else 0 end,
    updated_at=clock_timestamp()
    where x.room_id=p_room and x.player_id=p.id and x.card_position=a.card_position returning * into run;
   if v_award>0 then
     update public.org_next_teams t set score=t.score+v_award where t.id=p.team_id and t.room_id=p_room;
   end if;
 end if;
 return jsonb_build_object(
 'active',true,'open',v_open,'remaining',v_remaining,'index',run.current_index,
 'total',v_count,'score',run.score,'correct',run.correct_count,'finished',run.current_index>=v_count,
 'last_correct',case when p_answer is not null then v_hit else null end,
 'last_award',v_award,'question',case when v_open and run.current_index<v_count
 then (run.tasks->run.current_index)-'answer' else null end);
end $geo$;
revoke all on function public.qwiz_geo_play(uuid,text) from public,anon,authenticated;
grant execute on function public.qwiz_geo_play(uuid,text) to authenticated;

create or replace function public.qwiz_geo_projection(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $geo$
declare r public.org_next_rooms%rowtype;a public.qwiz_room_activity%rowtype;
begin
 if p_code !~ '^[A-F0-9]{8}$' then return jsonb_build_object('active',false);end if;
 select * into r from public.org_next_rooms where code=p_code;
 if not found or r.phase<>'intermission' then return jsonb_build_object('active',false);end if;
 select * into a from public.qwiz_room_activity where room_id=r.id;
 if not found or a.settings->>'arcade_mode'<>'russia_map' then return jsonb_build_object('active',false);end if;
 return jsonb_build_object('active',true,'title',a.title,
 'count',greatest(1,least(89,coalesce((a.settings->>'geo_count')::int,15))),
 'remaining',greatest(0,ceil(extract(epoch from a.entered_at+
   make_interval(secs=>greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180))))-clock_timestamp()))::int),
 'players',(select count(*) from public.qwiz_geo_runs x where x.room_id=r.id and x.card_position=a.card_position),
 'answered',(select coalesce(sum(x.current_index),0) from public.qwiz_geo_runs x where x.room_id=r.id and x.card_position=a.card_position),
 'correct',(select coalesce(sum(x.correct_count),0) from public.qwiz_geo_runs x where x.room_id=r.id and x.card_position=a.card_position)
 );
end $geo$;
revoke all on function public.qwiz_geo_projection(text) from public,anon,authenticated;
grant execute on function public.qwiz_geo_projection(text) to anon,authenticated;
