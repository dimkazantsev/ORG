-- Carefully limited mechanisms 4/5 pilot: central national symbols (16) and masked/pixelated flags (20).
-- Sources are local verified SVG files from next/assets/flags-world/catalog.json.
-- Strictly idempotent, append-only: no existing questions/rooms/teams modified.
begin;
do $pilot$
declare v_topic uuid;v_owner uuid;r record;url text;v_opt jsonb;v_visual jsonb;v_solution jsonb;v_prompt text;
begin
 select id,owner_id into v_topic,v_owner from public.qwiz_topics where name='Флаги мира';
 if v_topic is null then raise exception 'Expected world flags topic';end if;
 for r in select * from (values
 ('MX','Мексика','symbols','symbol',50,50,2.6,24,'Государственный герб с орлом и змеёй','["Мексика","Южный Судан","Австралия","Эстония"]'::jsonb,0),
 ('AL','Албания','symbols','symbol',50,50,2.5,24,'Двуглавый орёл','["Дания","Албания","Кения","Нигерия"]'::jsonb,1),
 ('CA','Канада','symbols','symbol',50,50,2.4,24,'Кленовый лист','["Гвинея-Бисау","Черногория","Канада","Соломоновы Острова"]'::jsonb,2),
 ('IN','Индия','symbols','symbol',50,50,3,24,'Колесо Ашоки','["Маврикий","Сенегал","Ангола","Индия"]'::jsonb,3),
 ('LB','Ливан','symbols','symbol',50,50,2.5,24,'Ливанский кедр','["Ливан","Филиппины","Танзания","Ботсвана"]'::jsonb,0),
 ('KZ','Казахстан','symbols','symbol',52,46,2.4,24,'Солнце и степной орёл','["Перу","Казахстан","Тринидад и Тобаго","Багамские Острова"]'::jsonb,1),
 ('BT','Бутан','symbols','symbol',50,50,2.6,24,'Белый дракон','["Гвинея","Ливия","Бутан","Сербия"]'::jsonb,2),
 ('BR','Бразилия','symbols','symbol',50,50,2.6,24,'Звёздный глобус','["Гана","Люксембург","Катар","Бразилия"]'::jsonb,3),
 ('KR','Южная Корея','symbols','symbol',50,50,2.7,24,'Тхэгык','["Южная Корея","Оман","Тонга","Боливия"]'::jsonb,0),
 ('AR','Аргентина','symbols','symbol',50,50,3,24,'Майское солнце','["Алжир","Аргентина","Кирибати","Норвегия"]'::jsonb,1),
 ('MN','Монголия','symbols','symbol',18,50,2.6,24,'Символ Соёмбо','["Словакия","Антигуа и Барбуда","Монголия","Джибути"]'::jsonb,2),
 ('LK','Шри-Ланка','symbols','symbol',61,50,2.4,24,'Золотой лев с мечом','["Палестина","США","Канада","Шри-Ланка"]'::jsonb,3),
 ('PT','Португалия','symbols','symbol',42,50,2.5,24,'Армиллярная сфера и герб','["Португалия","Уругвай","ДР Конго","Гайана"]'::jsonb,0),
 ('PK','Пакистан','symbols','symbol',57,50,2.5,24,'Полумесяц со звездой','["Украина","Пакистан","Беларусь","Греция"]'::jsonb,1),
 ('CY','Кипр','symbols','symbol',50,48,2.5,24,'Силуэт острова Кипр','["Италия","Малайзия","Кипр","Сан-Томе и Принсипи"]'::jsonb,2),
 ('KH','Камбоджа','symbols','symbol',50,50,2.7,24,'Ангкор-Ват','["Нидерланды","Таиланд","Болгария","Камбоджа"]'::jsonb,3),
 ('JP','Япония','fragments','pixel',50,50,2.5,24,'','["Япония","Нигер","Эсватини","Бангладеш"]'::jsonb,0),
 ('RU','Россия','fragments','crop',50,50,2.5,24,'','["Вануату","Россия","Камерун","Ирландия"]'::jsonb,1),
 ('FR','Франция','fragments','pixel',50,50,2.5,24,'','["Лихтенштейн","Польша","Франция","Уганда"]'::jsonb,2),
 ('IT','Италия','fragments','crop',50,50,2.5,24,'','["Малайзия","Сан-Томе и Принсипи","Азербайджан","Италия"]'::jsonb,3),
 ('DE','Германия','fragments','pixel',50,50,2.5,24,'','["Германия","Иордания","Намибия","Сирия"]'::jsonb,0),
 ('ZA','ЮАР','fragments','crop',50,50,2.5,24,'','["Коста-Рика","ЮАР","Ирак","Мальдивы"]'::jsonb,1),
 ('AU','Австралия','fragments','pixel',50,50,2.5,24,'','["Эстония","Сент-Китс и Невис","Австралия","Науру"]'::jsonb,2),
 ('SE','Швеция','fragments','crop',50,50,2.5,24,'','["Андорра","Кипр","Италия","Швеция"]'::jsonb,3),
 ('NO','Норвегия','fragments','pixel',50,50,2.5,24,'','["Норвегия","Таджикистан","Бахрейн","Франция"]'::jsonb,0),
 ('CH','Швейцария','fragments','crop',50,50,2.5,24,'','["Гаити","Швейцария","Мали","Сингапур"]'::jsonb,1),
 ('BR','Бразилия','fragments','pixel',50,50,2.5,24,'','["Гана","Люксембург","Бразилия","Катар"]'::jsonb,2),
 ('MX','Мексика','fragments','crop',50,50,2.5,24,'','["Южный Судан","Австралия","Эстония","Мексика"]'::jsonb,3),
 ('IN','Индия','fragments','pixel',50,50,2.5,24,'','["Индия","Маврикий","Сенегал","Ангола"]'::jsonb,0),
 ('CA','Канада','fragments','crop',50,50,2.5,24,'','["Гвинея-Бисау","Канада","Черногория","Соломоновы Острова"]'::jsonb,1),
 ('TR','Турция','fragments','pixel',50,50,2.5,24,'','["Бразилия","Гана","Турция","Люксембург"]'::jsonb,2),
 ('MA','Марокко','fragments','crop',50,50,2.5,24,'','["Россия","Вануату","Камерун","Марокко"]'::jsonb,3),
 ('US','США','fragments','pixel',50,50,2.5,24,'','["США","Канада","Гвинея-Бисау","Черногория"]'::jsonb,0),
 ('GB','Великобритания','fragments','crop',50,50,2.5,24,'','["Либерия","Великобритания","Португалия","Уругвай"]'::jsonb,1),
 ('GR','Греция','fragments','pixel',50,50,2.5,24,'','["Монако","Руанда","Греция","Самоа"]'::jsonb,2),
 ('FI','Финляндия','fragments','crop',50,50,2.5,24,'','["Лаос","Папуа — Новая Гвинея","Тувалу","Финляндия"]'::jsonb,3)
 ) as seed(iso,country,mode,effect,x,y,zoom,pixels,feature,options,answer) loop
  url:='https://dimkazantsev.github.io/ORG/next/assets/flags-world/'||lower(r.iso)||'.svg';
  v_visual:=jsonb_build_object('type',r.effect,'x',r.x,'y',r.y,'zoom',r.zoom,'pixels',r.pixels);
  v_solution:=jsonb_build_object('flag_mode',r.mode,'correct',r.answer,'media_url',url,'flag_visual',v_visual);
  v_opt:=r.options;
  v_prompt:=case when r.mode='symbols' then 'Какому государству принадлежит этот символ на национальном флаге?'
     when r.effect='pixel' then 'Какой стране принадлежит этот пикселизированный флаг?'
     else 'Какой стране принадлежит показанный фрагмент флага?' end;
  if not public.qwiz_flags_question_valid('flag',v_opt,v_solution) then
    raise exception 'Invalid % question for %',r.mode,r.iso;
  end if;
  if not exists(select 1 from public.qwiz_bank q where q.topic_id=v_topic
       and q.solution->>'flag_mode'=r.mode and ('iso:'||r.iso)=any(q.tags)) then
   insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,explanation,difficulty,tags)
    values(v_owner,v_topic,'flag',v_prompt,v_opt,v_solution,
      case when r.mode='symbols' then 'На флаге государства «'||r.country||'» изображён: '||r.feature||'.'
       else 'Это флаг государства «'||r.country||'». После ответа открывается полный флаг.' end,
      case when r.mode='symbols' then 3 else 4 end,
      array['fw:published','fw:pilot-4-5','iso:'||r.iso,'source:local-svg']);
  end if;
 end loop;
 if (select count(*) from public.qwiz_bank where 'fw:pilot-4-5'=any(tags))<>36 then
   raise exception 'Expected 36 curated questions';end if;
end $pilot$;
commit;