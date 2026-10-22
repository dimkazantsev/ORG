-- QWIZ-PARTY flags: second batch, 155 sovereign-state entries x 2 approved mechanics.
-- Full source roster: stefangabos/world_countries 193 UN members + PS and VA.
-- Russian names: source roster, with original 40 reviewed pilot labels retained.
-- Flag SVGs: hampusborgos/country-flags at c09927e63705529bbf59ca6684cd9b23225dddad.
-- AF (Afghanistan): stored only as draft pending expert confirmation of flag variant.
-- Other entries are source-verified and mechanically validated, not human fact-checked.
-- Idempotent: skips (country code,mechanic) pairs already in the bank.
begin;
do $seed$
declare
 v_all text[]:=array[
    'AD|Андорра',
    'AE|ОАЭ',
    'AF|Афганистан',
    'AG|Антигуа и Барбуда',
    'AL|Албания',
    'AM|Армения',
    'AO|Ангола',
    'AR|Аргентина',
    'AT|Австрия',
    'AU|Австралия',
    'AZ|Азербайджан',
    'BA|Босния и Герцеговина',
    'BB|Барбадос',
    'BD|Бангладеш',
    'BE|Бельгия',
    'BF|Буркина-Фасо',
    'BG|Болгария',
    'BH|Бахрейн',
    'BI|Бурунди',
    'BJ|Бенин',
    'BN|Бруней',
    'BO|Боливия',
    'BR|Бразилия',
    'BS|Багамские Острова',
    'BT|Бутан',
    'BW|Ботсвана',
    'BY|Беларусь',
    'BZ|Белиз',
    'CA|Канада',
    'CD|ДР Конго',
    'CF|ЦАР',
    'CG|Республика Конго',
    'CH|Швейцария',
    'CI|Кот-д’Ивуар',
    'CL|Чили',
    'CM|Камерун',
    'CN|Китай',
    'CO|Колумбия',
    'CR|Коста-Рика',
    'CU|Куба',
    'CV|Кабо-Верде',
    'CY|Кипр',
    'CZ|Чехия',
    'DE|Германия',
    'DJ|Джибути',
    'DK|Дания',
    'DM|Доминика',
    'DO|Доминиканская Республика',
    'DZ|Алжир',
    'EC|Эквадор',
    'EE|Эстония',
    'EG|Египет',
    'ER|Эритрея',
    'ES|Испания',
    'ET|Эфиопия',
    'FI|Финляндия',
    'FJ|Фиджи',
    'FM|Микронезия',
    'FR|Франция',
    'GA|Габон',
    'GB|Великобритания',
    'GD|Гренада',
    'GE|Грузия',
    'GH|Гана',
    'GM|Гамбия',
    'GN|Гвинея',
    'GQ|Экваториальная Гвинея',
    'GR|Греция',
    'GT|Гватемала',
    'GW|Гвинея-Бисау',
    'GY|Гайана',
    'HN|Гондурас',
    'HR|Хорватия',
    'HT|Гаити',
    'HU|Венгрия',
    'ID|Индонезия',
    'IE|Ирландия',
    'IL|Израиль',
    'IN|Индия',
    'IQ|Ирак',
    'IR|Иран',
    'IS|Исландия',
    'IT|Италия',
    'JM|Ямайка',
    'JO|Иордания',
    'JP|Япония',
    'KE|Кения',
    'KG|Кыргызстан',
    'KH|Камбоджа',
    'KI|Кирибати',
    'KM|Коморы',
    'KN|Сент-Китс и Невис',
    'KP|КНДР (Корейская Народно-Демократическая Республика)',
    'KR|Южная Корея',
    'KW|Кувейт',
    'KZ|Казахстан',
    'LA|Лаос',
    'LB|Ливан',
    'LC|Сент-Люсия',
    'LI|Лихтенштейн',
    'LK|Шри-Ланка',
    'LR|Либерия',
    'LS|Лесото',
    'LT|Литва',
    'LU|Люксембург',
    'LV|Латвия',
    'LY|Ливия',
    'MA|Марокко',
    'MC|Монако',
    'MD|Молдова',
    'ME|Черногория',
    'MG|Мадагаскар',
    'MH|Маршалловы Острова',
    'MK|Северная Македония',
    'ML|Мали',
    'MM|Мьянма',
    'MN|Монголия',
    'MR|Мавритания',
    'MT|Мальта',
    'MU|Маврикий',
    'MV|Мальдивы',
    'MW|Малави',
    'MX|Мексика',
    'MY|Малайзия',
    'MZ|Мозамбик',
    'NA|Намибия',
    'NE|Нигер',
    'NG|Нигерия',
    'NI|Никарагуа',
    'NL|Нидерланды',
    'NO|Норвегия',
    'NP|Непал',
    'NR|Науру',
    'NZ|Новая Зеландия',
    'OM|Оман',
    'PA|Панама',
    'PE|Перу',
    'PG|Папуа — Новая Гвинея',
    'PH|Филиппины',
    'PK|Пакистан',
    'PL|Польша',
    'PS|Палестина',
    'PT|Португалия',
    'PW|Палау',
    'PY|Парагвай',
    'QA|Катар',
    'RO|Румыния',
    'RS|Сербия',
    'RU|Россия',
    'RW|Руанда',
    'SA|Саудовская Аравия',
    'SB|Соломоновы Острова',
    'SC|Сейшельские Острова',
    'SD|Судан',
    'SE|Швеция',
    'SG|Сингапур',
    'SI|Словения',
    'SK|Словакия',
    'SL|Сьерра-Леоне',
    'SM|Сан-Марино',
    'SN|Сенегал',
    'SO|Сомали',
    'SR|Суринам',
    'SS|Южный Судан',
    'ST|Сан-Томе и Принсипи',
    'SV|Сальвадор',
    'SY|Сирия',
    'SZ|Эсватини',
    'TD|Чад',
    'TG|Того',
    'TH|Таиланд',
    'TJ|Таджикистан',
    'TL|Восточный Тимор',
    'TM|Туркменистан',
    'TN|Тунис',
    'TO|Тонга',
    'TR|Турция',
    'TT|Тринидад и Тобаго',
    'TV|Тувалу',
    'TZ|Танзания',
    'UA|Украина',
    'UG|Уганда',
    'US|США',
    'UY|Уругвай',
    'UZ|Узбекистан',
    'VA|Ватикан (Святой Престол)',
    'VC|Сент-Винсент и Гренадины',
    'VE|Венесуэла',
    'VN|Вьетнам',
    'VU|Вануату',
    'WS|Самоа',
    'YE|Йемен',
    'ZA|ЮАР',
    'ZM|Замбия',
    'ZW|Зимбабве'
  ];
 v_topic uuid;v_owner uuid;v_code text;v_name text;v_url text;v_source text;
 v_i integer;v_k integer;v_idx integer;v_pos integer;v_base integer;v_count integer;
 v_opts jsonb;v_images jsonb;v_labels jsonb;v_solution jsonb;
 v_codes integer[];v_tags text[];v_published boolean;
begin
 if cardinality(v_all)<>195 then raise exception 'Full country roster must have 195 states';end if;
 if (select count(distinct split_part(x,'|',1)) from unnest(v_all) x)<>195 then raise exception 'Duplicate ISO country code';end if;
 select id,owner_id into v_topic,v_owner from public.qwiz_topics where name='Флаги мира' order by created_at limit 1;
 if v_topic is null or (select count(*) from public.qwiz_topics where name='Флаги мира')<>1 then
  raise exception 'Missing or ambiguous flags topic';end if;
 -- Refuse to seed in a contaminated bank.
 if exists(select 1 from public.qwiz_bank q where q.owner_id=v_owner and q.topic_id=v_topic
   and not ('fw:pilot'=any(q.tags) or 'fw:catalog195'=any(q.tags))) then
   raise exception 'Unrelated questions found in the catalog';end if;
 for v_i in 1..195 loop
   v_code:=split_part(v_all[v_i],'|',1);
   v_name:=split_part(v_all[v_i],'|',2);
   if v_code !~ '^[A-Z]{2}$' or length(v_name)<2 then raise exception 'Malformed country %',v_i;end if;
   if (select count(*) from public.qwiz_bank q where q.topic_id=v_topic and 'fw:pilot'=any(q.tags)
     and 'iso:'||v_code=any(q.tags))<>0 then continue;end if;
   v_published:=v_code<>'AF';
   v_tags:=array['fw:catalog195','iso:'||v_code,'source:hampusborgos'];
   if v_published then v_tags:=v_tags||array['fw:published'];else v_tags:=v_tags||array['fw:needs_review'];end if;
   v_url:='https://raw.githubusercontent.com/hampusborgos/country-flags/c09927e63705529bbf59ca6684cd9b23225dddad/svg/'||lower(v_code)||'.svg';
   -- Fixed four choices, shuffled correct position and distinct offset distractors.
   v_codes:=array[v_i, ((v_i+41-1)%195)+1,((v_i+83-1)%195)+1,((v_i+127-1)%195)+1];
   v_pos:=(v_i*3+1)%4;
   v_opts:='[]'::jsonb;
   for v_k in 0..3 loop
     v_idx:=v_codes[((v_k-v_pos+4)%4)+1];
     v_opts:=v_opts||jsonb_build_array(split_part(v_all[v_idx],'|',2));
   end loop;
   v_solution:=jsonb_build_object('flag_mode','country','correct',v_pos,'media_url',v_url);
   if not public.qwiz_flags_question_valid('flag',v_opts,v_solution) then
     raise exception 'Invalid country answer for ISO %',v_code;end if;
   if not exists(select 1 from public.qwiz_bank q where q.topic_id=v_topic
     and q.solution->>'flag_mode'='country' and 'iso:'||v_code=any(q.tags)) then
     insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,explanation,difficulty,tags)
     values(v_owner,v_topic,'flag','Какой стране принадлежит изображённый флаг?',
       v_opts,v_solution,'Это государственный флаг страны «'||v_name||'».',2,v_tags);
   end if;
   v_pos:=(v_i*7+2)%4;
   v_images:='[]'::jsonb;v_labels:='[]'::jsonb;
   for v_k in 0..3 loop
     v_idx:=v_codes[((v_k-v_pos+4)%4)+1];
     v_source:=split_part(v_all[v_idx],'|',1);
     v_images:=v_images||jsonb_build_array(jsonb_build_object('image_url',
       'https://raw.githubusercontent.com/hampusborgos/country-flags/c09927e63705529bbf59ca6684cd9b23225dddad/svg/'||lower(v_source)||'.svg'));
     v_labels:=v_labels||jsonb_build_array(split_part(v_all[v_idx],'|',2));
   end loop;
   v_solution:=jsonb_build_object('flag_mode','picker','correct',v_pos,'option_labels',v_labels);
   if not public.qwiz_flags_question_valid('flag',v_images,v_solution) then
     raise exception 'Invalid flag-image answer for ISO %',v_code;end if;
   if not exists(select 1 from public.qwiz_bank q where q.topic_id=v_topic
     and q.solution->>'flag_mode'='picker' and 'iso:'||v_code=any(q.tags)) then
      insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,explanation,difficulty,tags)
      values(v_owner,v_topic,'flag','Выберите флаг государства «'||v_name||'».',v_images,v_solution,
       'Правильный ответ — государственный флаг страны «'||v_name||'».',2,v_tags);
   end if;
 end loop;
 if (select count(*) from public.qwiz_bank q where q.topic_id=v_topic)<>390 then raise exception 'Expected 390 questions';end if;
 if (select count(distinct t) from public.qwiz_bank q cross join lateral unnest(q.tags) t
    where q.topic_id=v_topic and t like 'iso:%')<>195 then raise exception 'Expected 195 ISO codes';end if;
 if exists(select 1 from public.qwiz_bank q where q.topic_id=v_topic
    and not public.qwiz_flags_question_valid(q.kind,q.options,q.solution)) then raise exception 'Question fails mechanical validation';end if;
 if (select count(*) from public.qwiz_bank q where q.topic_id=v_topic and 'fw:needs_review'=any(q.tags))<>2
 then raise exception 'Expected exactly two AF draft questions';end if;
end $seed$;
commit;
