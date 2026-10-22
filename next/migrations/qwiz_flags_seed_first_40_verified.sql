-- Flags of the World: first curated pilot only, 40 UN-member flags x 2 approved mechanics = 80 questions.
-- Source: hampusborgos/country-flags, pinned immutable commit c09927e63705529bbf59ca6684cd9b23225dddad.
-- ISO codes checked against source repository SVG tree; country labels reviewed as Russian common names.
-- Idempotent with per-mode country tags. Later phases will add the rest of the 195.
begin;
do $seed$
declare
 v_countries text[]:=array[
    'RU|Россия',
    'FR|Франция',
    'DE|Германия',
    'IT|Италия',
    'JP|Япония',
    'CA|Канада',
    'BR|Бразилия',
    'IN|Индия',
    'CN|Китай',
    'US|США',
    'GB|Великобритания',
    'ES|Испания',
    'PT|Португалия',
    'AU|Австралия',
    'NZ|Новая Зеландия',
    'ZA|ЮАР',
    'KR|Южная Корея',
    'AR|Аргентина',
    'MX|Мексика',
    'EG|Египет',
    'TR|Турция',
    'SE|Швеция',
    'NO|Норвегия',
    'FI|Финляндия',
    'DK|Дания',
    'IS|Исландия',
    'CH|Швейцария',
    'AT|Австрия',
    'BE|Бельгия',
    'NL|Нидерланды',
    'PL|Польша',
    'UA|Украина',
    'GR|Греция',
    'IE|Ирландия',
    'CZ|Чехия',
    'HU|Венгрия',
    'RO|Румыния',
    'IL|Израиль',
    'SA|Саудовская Аравия',
    'TH|Таиланд'
  ];
 v_topic uuid; v_owner uuid; v_code text; v_name text; v_target text;
 v_opts jsonb; v_images jsonb; v_labels jsonb; v_solution jsonb; v_url text;
 v_indices integer[]; v_idx integer; v_pos integer; v_source integer;
 v_i integer; v_k integer; v_n integer:=40; v_tags text[];
 v_prompts text[]:=array[
  'Какой стране принадлежит изображённый флаг?',
  'Узнайте государство по национальному флагу.',
  'Назовите страну, флаг которой показан на экране.',
  'Флаг какого государства изображён?',
  'Определите страну по цветам и элементам флага.'
 ];
begin
 select id,owner_id into v_topic,v_owner from public.qwiz_topics
  where name='Флаги мира' order by created_at limit 1;
 if v_topic is null or (select count(*) from public.qwiz_topics where name='Флаги мира')<>1 then
   raise exception 'Единственная тема «Флаги мира» не найдена';end if;
 if (select count(*) from public.qwiz_bank where owner_id=v_owner and topic_id=v_topic
     and not ('fw:pilot'=any(tags)))<>0 then
   raise exception 'Каталог уже содержит другие вопросы: сначала сверить данные';end if;
 for v_i in 1..v_n loop
  v_code:=split_part(v_countries[v_i],'|',1);
  v_name:=split_part(v_countries[v_i],'|',2);
  v_tags:=array['fw:published','fw:pilot','iso:'||v_code,'source:hampusborgos'];
  v_url:='https://raw.githubusercontent.com/hampusborgos/country-flags/c09927e63705529bbf59ca6684cd9b23225dddad/svg/'||lower(v_code)||'.svg';
  v_indices:=array[v_i,(v_i+5-1)%v_n+1,(v_i+17-1)%v_n+1,(v_i+29-1)%v_n+1];
  -- Country by visible SVG.
  v_pos:=(v_i-1)%4; v_opts:='[]'::jsonb;
  for v_k in 0..3 loop
   v_source:=v_indices[(v_k-v_pos+4)%4+1];
   v_opts:=v_opts||jsonb_build_array(split_part(v_countries[v_source],'|',2));
  end loop;
  v_solution:=jsonb_build_object('flag_mode','country','correct',v_pos,'media_url',v_url);
  if not public.qwiz_flags_question_valid('flag',v_opts,v_solution) then
    raise exception 'Страна %, ошибка подготовки вопроса',v_code;end if;
  if not exists(select 1 from public.qwiz_bank q where q.owner_id=v_owner and q.topic_id=v_topic
    and q.solution->>'flag_mode'='country' and 'iso:'||v_code=any(q.tags)) then
   insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,explanation,difficulty,tags)
   values(v_owner,v_topic,'flag',v_prompts[(v_i-1)%5+1],v_opts,v_solution,
     'На изображении государственный флаг страны «'||v_name||'».',case when v_i%6=0 then 3 else 2 end,v_tags);
  end if;
  -- Flag picker: names remain in secret solution.option_labels, never the participant-facing options.
  v_pos:=(v_i+1)%4; v_images:='[]'::jsonb;v_labels:='[]'::jsonb;
  for v_k in 0..3 loop
   v_source:=v_indices[(v_k-v_pos+4)%4+1];
   v_target:=split_part(v_countries[v_source],'|',1);
   v_images:=v_images||jsonb_build_array(jsonb_build_object('image_url',
    'https://raw.githubusercontent.com/hampusborgos/country-flags/c09927e63705529bbf59ca6684cd9b23225dddad/svg/'||lower(v_target)||'.svg'));
   v_labels:=v_labels||jsonb_build_array(split_part(v_countries[v_source],'|',2));
  end loop;
  v_solution:=jsonb_build_object('flag_mode','picker','correct',v_pos,'option_labels',v_labels);
  if not public.qwiz_flags_question_valid('flag',v_images,v_solution) then
     raise exception 'Страна %, ошибка подготовки графического выбора',v_code;end if;
  if not exists(select 1 from public.qwiz_bank q where q.owner_id=v_owner and q.topic_id=v_topic
    and q.solution->>'flag_mode'='picker' and 'iso:'||v_code=any(q.tags)) then
   insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,explanation,difficulty,tags)
   values(v_owner,v_topic,'flag','Найдите государственный флаг страны «'||v_name||'».',
      v_images,v_solution,'Правильный вариант — государственный флаг страны «'||v_name||'».',
      case when v_i%6=0 then 3 else 2 end,v_tags);
  end if;
 end loop;
 if (select count(*) from public.qwiz_bank where owner_id=v_owner and topic_id=v_topic and 'fw:pilot'=any(tags))<>80
 or (select count(distinct substring(t from 5)) from public.qwiz_bank q
     cross join lateral unnest(q.tags) as t where q.owner_id=v_owner and q.topic_id=v_topic and t like 'iso:%')<>40
 or exists(select 1 from public.qwiz_bank q where q.owner_id=v_owner and q.topic_id=v_topic and 'fw:pilot'=any(tags)
     and not public.qwiz_flags_question_valid(q.kind,q.options,q.solution))
 then raise exception 'Проверка качества пилотной партии не пройдена';end if;
end $seed$;
commit;
