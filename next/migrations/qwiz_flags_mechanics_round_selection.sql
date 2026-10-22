-- QWIZ-PARTY: flags use one topic and two lightweight mode values inside solution JSON.
-- Card.settings.flag_modes filters live questions; manual edits revert to draft.
-- Existing game snapshots and GOС.ID tables are never touched.
begin;
create or replace function public.qwiz_flags_question_valid(p_kind text,p_options jsonb,p_solution jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare v_mode text; v_n integer; v_correct text;
begin
 if p_kind<>'flag' or jsonb_typeof(p_options)<>'array' or
    jsonb_typeof(p_solution)<>'object' then return false;end if;
 v_n:=jsonb_array_length(p_options);
 if v_n<>4 then return false;end if;
 v_correct:=p_solution->>'correct';
 if v_correct is null or v_correct !~ '^[0-3]$' then return false;end if;
 v_mode:=p_solution->>'flag_mode';
 if v_mode='country' then
  if coalesce(p_solution->>'media_url','') !~ '^https://[^ ]+\\.svg([?][^ ]*)?$' then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) v
     where jsonb_typeof(v.value)<>'string' or length(btrim(v.value#>>'{}'))<2) then return false;end if;
  if (select count(distinct lower(btrim(v.value))) from jsonb_array_elements_text(p_options) v)<>4 then return false;end if;
  return true;
 elsif v_mode='picker' then
  if jsonb_typeof(p_solution->'option_labels')<>'array' or
     jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct lower(btrim(v.value))) from jsonb_array_elements_text(p_solution->'option_labels') v)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) v
      where jsonb_typeof(v.value)<>'object' or
      coalesce(v.value->>'image_url','') !~ '^https://[^ ]+\\.svg([?][^ ]*)?$' or
      v.value ? 'label') then return false;end if;
  if (select count(distinct v.value->>'image_url') from jsonb_array_elements(p_options) v)<>4 then return false;end if;
  return true;
 end if;
 return false;
end $$;
revoke all on function public.qwiz_flags_question_valid(text,jsonb,jsonb) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.qwiz_studio(p_action text, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_id uuid; v_build uuid; v_obj jsonb; v_cards jsonb;
v_cards_arr jsonb; v_card jsonb; v_pos integer; v_topic uuid; v_kind text;
begin
 v_user := (select auth.uid());
 if v_user is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 if p_action='overview' then
  return jsonb_build_object(
   'topics',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'category',t.category) order by t.category,t.name),'[]'::jsonb) from public.qwiz_topics t where t.owner_id=v_user),
   'builds',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,'description',b.description,'updated_at',b.updated_at) order by b.updated_at desc),'[]'::jsonb) from public.qwiz_builds b where b.owner_id=v_user),
   'types',jsonb_build_array('single','boolean','multi','match','order','text','number','image','audio','video','flag','portrait','map','date','estimate','sequence','hotspot','puzzle','riddle','auction','blitz','poll')
  );
 elsif p_action='topic_save' then
  if char_length(trim(coalesce(p_input->>'name',''))) not between 2 and 90 then raise exception 'Укажите название темы'; end if;
  if coalesce(p_input->>'id','')<>'' then
   update public.qwiz_topics set name=trim(p_input->>'name'),category=left(coalesce(p_input->>'category','Общие знания'),80)
   where id=(p_input->>'id')::uuid and owner_id=v_user returning id into v_id;
  else
   insert into public.qwiz_topics(owner_id,name,category)
   values(v_user,trim(p_input->>'name'),left(coalesce(p_input->>'category','Общие знания'),80)) returning id into v_id;
  end if;
  if v_id is null then raise exception 'Тема не найдена'; end if;
  return jsonb_build_object('id',v_id);
 elsif p_action='questions' then
  return jsonb_build_object(
   'total',(select count(*) from public.qwiz_bank q where q.owner_id=v_user and (nullif(p_input->>'topic_id','') is null or q.topic_id=(p_input->>'topic_id')::uuid)
     and (nullif(p_input->>'kind','') is null or q.kind=p_input->>'kind')
       and (nullif(p_input->>'mode','') is null or q.solution->>'flag_mode'=p_input->>'mode')
     and (nullif(p_input->>'mode','') is null or q.solution->>'flag_mode'=p_input->>'mode')
     and (nullif(p_input->>'search','') is null or q.prompt ilike '%'||(p_input->>'search')||'%')),
   'items',(select coalesce(jsonb_agg(s.data order by s.ord),'[]'::jsonb) from
      (select jsonb_build_object('id',q.id,'prompt',q.prompt,'topic_id',q.topic_id,'kind',q.kind,'difficulty',q.difficulty,
       'options',q.options,'explanation',q.explanation,'tags',q.tags,
       'solution',q.solution) as data,
       row_number() over(order by
        case when p_input->>'sort'='oldest' then q.created_at end asc nulls last,
        case when p_input->>'sort'='difficulty' then q.difficulty end desc nulls last,
        q.created_at desc) ord
       from public.qwiz_bank q where q.owner_id=v_user
       and (nullif(p_input->>'topic_id','') is null or q.topic_id=(p_input->>'topic_id')::uuid)
       and (nullif(p_input->>'kind','') is null or q.kind=p_input->>'kind')
       and (nullif(p_input->>'search','') is null or q.prompt ilike '%'||(p_input->>'search')||'%')
       order by ord limit greatest(1,least(100,coalesce((p_input->>'limit')::int,25))) offset greatest(0,least(100000,coalesce((p_input->>'offset')::int,0)))
      )s)
  );
 elsif p_action='question_save' then
  v_kind := coalesce(p_input->>'kind','single');
  if v_kind not in ('single','boolean','multi','match','order','text','number','image','audio','video','flag','portrait','map','date','estimate','sequence','hotspot','puzzle','riddle','auction','blitz','poll') then raise exception 'Неизвестный тип'; end if;
  if char_length(trim(coalesce(p_input->>'prompt',''))) not between 4 and 3000 then raise exception 'Текст вопроса слишком короткий или длинный'; end if;
  if jsonb_typeof(p_input->'options') is distinct from 'array' or jsonb_typeof(p_input->'solution') is distinct from 'object' then raise exception 'Некорректные данные ответа'; end if;
  if v_kind in ('single','boolean','flag','portrait','image') then
   if jsonb_array_length(p_input->'options') not between 2 and 6 or
   jsonb_typeof(p_input->'solution'->'correct') is distinct from 'number'
   or (p_input->'solution'->>'correct')::int not between 0 and jsonb_array_length(p_input->'options')-1 then
    raise exception 'Для этого типа нужны 2–6 вариантов и номер правильного'; end if;
  end if;
  if p_input ? 'topic_id' and nullif(p_input->>'topic_id','') is not null then
   v_topic:=(p_input->>'topic_id')::uuid;
   if not exists(select 1 from public.qwiz_topics where id=v_topic and owner_id=v_user) then raise exception 'Тема недоступна'; end if;
  else v_topic:=null;end if;
  if nullif(p_input->>'id','') is not null then
    update public.qwiz_bank set topic_id=v_topic,kind=v_kind,prompt=trim(p_input->>'prompt'),options=p_input->'options',
     solution=p_input->'solution',difficulty=greatest(1,least(5,coalesce((p_input->>'difficulty')::int,2))),
     explanation=left(coalesce(p_input->>'explanation',''),3000),tags=array_remove(tags,'fw:published')
    where id=(p_input->>'id')::uuid and owner_id=v_user returning id into v_id;
  else
    insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,difficulty,explanation)
    values(v_user,v_topic,v_kind,trim(p_input->>'prompt'),p_input->'options',p_input->'solution',
       greatest(1,least(5,coalesce((p_input->>'difficulty')::int,2))),left(coalesce(p_input->>'explanation',''),3000))
    returning id into v_id;
  end if;
  if v_id is null then raise exception 'Вопрос не найден'; end if;
  return jsonb_build_object('id',v_id);
 elsif p_action='flag_publish' then
   v_id:=nullif(p_input->>'id','')::uuid;
   if v_id is null then raise exception 'Укажите вопрос';end if;
   if not exists(select 1 from public.qwiz_bank q
       join public.qwiz_topics t on t.id=q.topic_id
       where q.id=v_id and q.owner_id=v_user and t.owner_id=v_user
       and t.name='Флаги мира' and public.qwiz_flags_question_valid(q.kind,q.options,q.solution)) then
       raise exception 'Вопрос не прошёл проверку формы и правильного ответа';end if;
   update public.qwiz_bank set tags=case when 'fw:published'=any(tags)
      then tags else tags || array['fw:published']::text[] end
   where id=v_id and owner_id=v_user;
   return jsonb_build_object('id',v_id,'published',true);
 elsif p_action='build_get' then
   v_id:=(p_input->>'id')::uuid;
   if not exists(select 1 from public.qwiz_builds where id=v_id and owner_id=v_user) then raise exception 'Сборка не найдена'; end if;
   return jsonb_build_object('build',(select jsonb_build_object('id',b.id,'title',b.title,'description',b.description) from public.qwiz_builds b where id=v_id),
    'cards',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'type',c.card_type,'title',c.title,'icon',c.icon,'topic_id',c.topic_id,'settings',c.settings) order by c.position),'[]'::jsonb) from public.qwiz_build_cards c where c.build_id=v_id));
 elsif p_action='build_save' then
   if char_length(trim(coalesce(p_input->>'title',''))) not between 2 and 140 or jsonb_typeof(p_input->'cards') is distinct from 'array' or jsonb_array_length(p_input->'cards') not between 1 and 60 then
    raise exception 'Укажите название и от 1 до 60 карточек'; end if;
   if nullif(p_input->>'id','') is not null then
    update public.qwiz_builds set title=trim(p_input->>'title'),description=left(coalesce(p_input->>'description',''),500),updated_at=now()
    where id=(p_input->>'id')::uuid and owner_id=v_user returning id into v_id;
    if v_id is null then raise exception 'Сборка не найдена'; end if;
    delete from public.qwiz_build_cards where build_id=v_id;
   else
    insert into public.qwiz_builds(owner_id,title,description) values(v_user,trim(p_input->>'title'),left(coalesce(p_input->>'description',''),500)) returning id into v_id;
   end if;
   v_pos:=0;
   for v_card in select value from jsonb_array_elements(p_input->'cards') loop
    if coalesce(v_card->>'type','') not in ('round','intro','break','team_stats','player_stats','bonus','duel','finale') then raise exception 'Неверный тип карточки'; end if;
    if jsonb_typeof(v_card->'settings') is distinct from 'object' then raise exception 'Неверные настройки карточки'; end if;
    v_topic:=nullif(v_card->>'topic_id','')::uuid;
    if v_topic is not null and not exists(select 1 from public.qwiz_topics where id=v_topic and owner_id=v_user) then raise exception 'Чужая тема';end if;
    insert into public.qwiz_build_cards(build_id,position,card_type,title,icon,topic_id,settings)
    values(v_id,v_pos,v_card->>'type',left(coalesce(nullif(v_card->>'title',''),'Раунд'),120),
      left(coalesce(v_card->>'icon','layers'),40),v_topic,v_card->'settings');
    v_pos:=v_pos+1;
   end loop;
   if (select card_type from public.qwiz_build_cards where build_id=v_id order by position desc limit 1)<>'finale' then
      raise exception 'Последней карточкой должен быть финал'; end if;
   return jsonb_build_object('id',v_id,'cards',v_pos);
 else raise exception 'Неизвестная команда студии'; end if;
end $function$

CREATE OR REPLACE FUNCTION public.qwiz_launch_build(p_build uuid, p_title text DEFAULT NULL::text, p_teams integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_build public.qwiz_builds%rowtype; v_card public.qwiz_build_cards%rowtype;
 v_question public.qwiz_bank%rowtype; v_questions jsonb:='[]'::jsonb; v_timeline jsonb:='[]'::jsonb;
 v_n integer; v_skip integer; v_secs integer; v_order text; v_limit integer;
 v_quiz uuid; v_code text; v_room uuid; v_count integer; v_opts jsonb; v_sol jsonb; v_match_choices jsonb; v_used uuid[]:='{}'::uuid[]; v_modes jsonb;
begin
 v_owner:=(select auth.uid());
 if v_owner is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 if p_teams not between 1 and 15 then raise exception 'Количество команд от 1 до 15'; end if;
 select * into v_build from public.qwiz_builds where id=p_build and owner_id=v_owner;
 if not found then raise exception 'Сборка не найдена'; end if;
 for v_card in select * from public.qwiz_build_cards where build_id=p_build order by position loop
   v_timeline:=v_timeline||jsonb_build_array(jsonb_build_object(
    'type',v_card.card_type,'title',v_card.title,'icon',v_card.icon,
    'settings',v_card.settings,'first_question',jsonb_array_length(v_questions)));
   if v_card.card_type='round' then
     if v_card.topic_id is null then raise exception 'У раунда «%» не выбрана тема',v_card.title; end if;
     v_limit:=greatest(1,least(100,coalesce((v_card.settings->>'count')::integer,5)));
     v_skip:=greatest(0,coalesce((v_card.settings->>'offset')::integer,0));
     v_secs:=greatest(10,least(120,coalesce((v_card.settings->>'seconds')::integer,30)));
     v_order:=coalesce(v_card.settings->>'order','random');
     v_modes:=v_card.settings->'flag_modes';
     if v_modes is null or v_modes='[]'::jsonb then v_modes:='["country","picker"]'::jsonb;end if;
     if jsonb_typeof(v_modes)<>'array' or jsonb_array_length(v_modes)>2 or
        exists(select 1 from jsonb_array_elements_text(v_modes) x where x.value not in ('country','picker')) then
       raise exception 'Раунд «%»: неверный список механик',v_card.title;
     end if;
     v_count:=0;
     for v_question in
      select * from public.qwiz_bank b where b.owner_id=v_owner and b.topic_id=v_card.topic_id
       and b.kind='flag' and b.tags @> array['fw:published']::text[]
       and b.solution->>'flag_mode' in (select jsonb_array_elements_text(v_modes))
       and not (b.id=any(v_used))
       and public.qwiz_flags_question_valid(b.kind,b.options,b.solution)
      order by case when v_order='random' then random() end,
        case when v_order='reverse' then b.created_at end desc,
        case when v_order='sequential' then b.created_at end asc,
        b.id
      limit v_limit offset v_skip
     loop
       
       v_opts:=v_question.options;v_sol:=v_question.solution;v_match_choices:='[]'::jsonb;
       if v_question.kind in ('order','sequence') then
         select coalesce(jsonb_agg(x.val order by x.ordinality desc),'[]'::jsonb)
         into v_opts from jsonb_array_elements(v_question.options) with ordinality as x(val,ordinality);
         v_sol:=v_question.solution||jsonb_build_object('order',v_question.options);
       elsif v_question.kind='match' then
         select coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',1))) order by x.ordinality),'[]'::jsonb),
          coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',2))) order by x.ordinality desc),'[]'::jsonb),
          coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',2))) order by x.ordinality),'[]'::jsonb)
         into v_opts,v_match_choices,v_sol from jsonb_array_elements_text(v_question.options) with ordinality as x(value,ordinality);
         v_sol:=jsonb_build_object('matches',v_sol);
       end if;
       v_questions:=v_questions||jsonb_build_array(jsonb_build_object(
         'prompt',v_question.prompt,'options',v_opts,'match_choices',v_match_choices, 'solution',v_sol,
         'correct',case when v_sol ? 'correct' then (v_sol->>'correct')::integer else null end,
         'explanation',v_question.explanation,
         'media_url',coalesce(v_question.solution->>'media_url',''),'illustration_url',coalesce(v_question.solution->>'illustration_url',''),
         'answer_duration',greatest(5,least(30,coalesce((v_card.settings->>'answer_seconds')::int,10))),'duration',v_secs,'topic',(select t.name from public.qwiz_topics t where t.id=v_card.topic_id),'round_title',v_card.title,'round_sound',coalesce(v_card.settings->>'sound','fanfare'),'card_type',v_card.card_type,
         'round_index',v_card.position,'kind',v_question.kind));
       v_used:=array_append(v_used,v_question.id);
       v_count:=v_count+1;
     end loop;
     if v_count=0 then raise exception 'Раунд «%»: нет игровых вопросов в выбранной теме',v_card.title;end if;
   end if;
 end loop;
 if jsonb_array_length(v_questions)<1 or jsonb_array_length(v_questions)>100 then raise exception 'Сборка должна содержать 1–100 игровых вопросов'; end if;
 insert into public.org_next_quizzes(owner_id,title,questions)
 values(v_owner,coalesce(nullif(trim(p_title),''),v_build.title),v_questions)
 returning id into v_quiz;
 v_code:=public.org_next_create_room(v_quiz,coalesce(nullif(trim(p_title),''),v_build.title),p_teams);
 select id into v_room from public.org_next_rooms where code=v_code and owner_id=v_owner;
 insert into public.qwiz_room_builds(room_id,build_id,timeline) values(v_room,p_build,v_timeline);
 return jsonb_build_object('code',v_code,'room_id',v_room,'total_questions',jsonb_array_length(v_questions),
   'total_cards',jsonb_array_length(v_timeline));
end $function$

-- Validate internal mechanical examples before committing.
do $verify$ begin
 if not public.qwiz_flags_question_valid('flag','["Россия","Канада","Франция","Япония"]'::jsonb,
 '{"flag_mode":"country","correct":0,"media_url":"https://example.com/ru.svg"}'::jsonb)
 or not public.qwiz_flags_question_valid('flag','[{"image_url":"https://example.com/ru.svg"},{"image_url":"https://example.com/ca.svg"},{"image_url":"https://example.com/fr.svg"},{"image_url":"https://example.com/jp.svg"}]'::jsonb,
 '{"flag_mode":"picker","correct":2,"option_labels":["Россия","Канада","Франция","Япония"]}'::jsonb)
 or public.qwiz_flags_question_valid('flag','[{"image_url":"https://example.com/ru.svg","label":"Россия"},{"image_url":"https://example.com/ca.svg"},{"image_url":"https://example.com/fr.svg"},{"image_url":"https://example.com/jp.svg"}]'::jsonb,
 '{"flag_mode":"picker","correct":2,"option_labels":["Россия","Канада","Франция","Япония"]}'::jsonb)
 then raise exception 'Flags validation failed';end if;
end $verify$;
commit;
