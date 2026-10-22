-- QWIZ-PARTY next: mechanisms 4-5, do not change team setup or historical answer keys.
begin;
CREATE OR REPLACE FUNCTION public.qwiz_flags_question_valid(p_kind text, p_options jsonb, p_solution jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
  if coalesce(p_solution->>'media_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$' then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) v
     where jsonb_typeof(v.value)<>'string' or length(btrim(v.value#>>'{}'))<2) then return false;end if;
  if (select count(distinct lower(btrim(v.value))) from jsonb_array_elements_text(p_options) v)<>4 then return false;end if;
  return true;
 elsif v_mode in ('symbols','fragments') then
   if coalesce(p_solution->>'media_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?
  if jsonb_typeof(p_solution->'option_labels')<>'array'
     or jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct btrim(x.value)) from jsonb_array_elements_text(p_solution->'option_labels') x)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) o
     where jsonb_typeof(o.value)<>'object' or o.value ? 'label'
     or o.value->>'orientation' not in ('horizontal','vertical')
     or jsonb_typeof(o.value->'stripes')<>'array'
     or jsonb_array_length(o.value->'stripes') not between 2 and 4
     or exists(select 1 from jsonb_array_elements_text(o.value->'stripes') s
          where s.value !~ '^#[0-9a-fA-F]{6}')) then return false;end if;
  if (select count(distinct value) from jsonb_array_elements(p_options))<>4 then return false;end if;
  if (select count(distinct o.value->>'orientation') from jsonb_array_elements(p_options) o)<>1 then return false;end if;
  return true;
 elsif v_mode='picker' then
  if jsonb_typeof(p_solution->'option_labels')<>'array' or
     jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct lower(btrim(v.value))) from jsonb_array_elements_text(p_solution->'option_labels') v)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) v
      where jsonb_typeof(v.value)<>'object' or
      coalesce(v.value->>'image_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$' or
      v.value ? 'label') then return false;end if;
  if (select count(distinct v.value->>'image_url') from jsonb_array_elements(p_options) v)<>4 then return false;end if;
  return true;
 end if;
 return false;
end $function$
 then return false;end if;
   if exists(select 1 from jsonb_array_elements(p_options) o
     where jsonb_typeof(o.value)<>'string' or length(btrim(o.value#>>'{}'))<2) then return false;end if;
   if (select count(distinct lower(btrim(x.value))) from jsonb_array_elements_text(p_options) x)<>4 then return false;end if;
   if jsonb_typeof(p_solution->'flag_visual')<>'object' then return false;end if;
   if v_mode='symbols' and p_solution->'flag_visual'->>'type'<>'symbol' then return false;end if;
   if v_mode='fragments' and p_solution->'flag_visual'->>'type' not in ('crop','pixel') then return false;end if;
   if coalesce(p_solution->'flag_visual'->>'x','') !~ '^[0-9]{2}
  if jsonb_typeof(p_solution->'option_labels')<>'array'
     or jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct btrim(x.value)) from jsonb_array_elements_text(p_solution->'option_labels') x)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) o
     where jsonb_typeof(o.value)<>'object' or o.value ? 'label'
     or o.value->>'orientation' not in ('horizontal','vertical')
     or jsonb_typeof(o.value->'stripes')<>'array'
     or jsonb_array_length(o.value->'stripes') not between 2 and 4
     or exists(select 1 from jsonb_array_elements_text(o.value->'stripes') s
          where s.value !~ '^#[0-9a-fA-F]{6}')) then return false;end if;
  if (select count(distinct value) from jsonb_array_elements(p_options))<>4 then return false;end if;
  if (select count(distinct o.value->>'orientation') from jsonb_array_elements(p_options) o)<>1 then return false;end if;
  return true;
 elsif v_mode='picker' then
  if jsonb_typeof(p_solution->'option_labels')<>'array' or
     jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct lower(btrim(v.value))) from jsonb_array_elements_text(p_solution->'option_labels') v)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) v
      where jsonb_typeof(v.value)<>'object' or
      coalesce(v.value->>'image_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$' or
      v.value ? 'label') then return false;end if;
  if (select count(distinct v.value->>'image_url') from jsonb_array_elements(p_options) v)<>4 then return false;end if;
  return true;
 end if;
 return false;
end $function$

     or (p_solution->'flag_visual'->>'x')::int not between 10 and 90 then return false;end if;
   if coalesce(p_solution->'flag_visual'->>'y','') !~ '^[0-9]{2}
  if jsonb_typeof(p_solution->'option_labels')<>'array'
     or jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct btrim(x.value)) from jsonb_array_elements_text(p_solution->'option_labels') x)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) o
     where jsonb_typeof(o.value)<>'object' or o.value ? 'label'
     or o.value->>'orientation' not in ('horizontal','vertical')
     or jsonb_typeof(o.value->'stripes')<>'array'
     or jsonb_array_length(o.value->'stripes') not between 2 and 4
     or exists(select 1 from jsonb_array_elements_text(o.value->'stripes') s
          where s.value !~ '^#[0-9a-fA-F]{6}')) then return false;end if;
  if (select count(distinct value) from jsonb_array_elements(p_options))<>4 then return false;end if;
  if (select count(distinct o.value->>'orientation') from jsonb_array_elements(p_options) o)<>1 then return false;end if;
  return true;
 elsif v_mode='picker' then
  if jsonb_typeof(p_solution->'option_labels')<>'array' or
     jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct lower(btrim(v.value))) from jsonb_array_elements_text(p_solution->'option_labels') v)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) v
      where jsonb_typeof(v.value)<>'object' or
      coalesce(v.value->>'image_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$' or
      v.value ? 'label') then return false;end if;
  if (select count(distinct v.value->>'image_url') from jsonb_array_elements(p_options) v)<>4 then return false;end if;
  return true;
 end if;
 return false;
end $function$

     or (p_solution->'flag_visual'->>'y')::int not between 10 and 90 then return false;end if;
   if coalesce(p_solution->'flag_visual'->>'zoom','') !~ '^[1-4]([.][0-9]+)?
  if jsonb_typeof(p_solution->'option_labels')<>'array'
     or jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct btrim(x.value)) from jsonb_array_elements_text(p_solution->'option_labels') x)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) o
     where jsonb_typeof(o.value)<>'object' or o.value ? 'label'
     or o.value->>'orientation' not in ('horizontal','vertical')
     or jsonb_typeof(o.value->'stripes')<>'array'
     or jsonb_array_length(o.value->'stripes') not between 2 and 4
     or exists(select 1 from jsonb_array_elements_text(o.value->'stripes') s
          where s.value !~ '^#[0-9a-fA-F]{6}')) then return false;end if;
  if (select count(distinct value) from jsonb_array_elements(p_options))<>4 then return false;end if;
  if (select count(distinct o.value->>'orientation') from jsonb_array_elements(p_options) o)<>1 then return false;end if;
  return true;
 elsif v_mode='picker' then
  if jsonb_typeof(p_solution->'option_labels')<>'array' or
     jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct lower(btrim(v.value))) from jsonb_array_elements_text(p_solution->'option_labels') v)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) v
      where jsonb_typeof(v.value)<>'object' or
      coalesce(v.value->>'image_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$' or
      v.value ? 'label') then return false;end if;
  if (select count(distinct v.value->>'image_url') from jsonb_array_elements(p_options) v)<>4 then return false;end if;
  return true;
 end if;
 return false;
end $function$
 then return false;end if;
   if (p_solution->'flag_visual'->>'zoom')::numeric not between 1.5 and 4 then return false;end if;
   if v_mode='fragments' and
      (coalesce(p_solution->'flag_visual'->>'pixels','') !~ '^[0-9]{2}
  if jsonb_typeof(p_solution->'option_labels')<>'array'
     or jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct btrim(x.value)) from jsonb_array_elements_text(p_solution->'option_labels') x)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) o
     where jsonb_typeof(o.value)<>'object' or o.value ? 'label'
     or o.value->>'orientation' not in ('horizontal','vertical')
     or jsonb_typeof(o.value->'stripes')<>'array'
     or jsonb_array_length(o.value->'stripes') not between 2 and 4
     or exists(select 1 from jsonb_array_elements_text(o.value->'stripes') s
          where s.value !~ '^#[0-9a-fA-F]{6}')) then return false;end if;
  if (select count(distinct value) from jsonb_array_elements(p_options))<>4 then return false;end if;
  if (select count(distinct o.value->>'orientation') from jsonb_array_elements(p_options) o)<>1 then return false;end if;
  return true;
 elsif v_mode='picker' then
  if jsonb_typeof(p_solution->'option_labels')<>'array' or
     jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct lower(btrim(v.value))) from jsonb_array_elements_text(p_solution->'option_labels') v)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) v
      where jsonb_typeof(v.value)<>'object' or
      coalesce(v.value->>'image_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$' or
      v.value ? 'label') then return false;end if;
  if (select count(distinct v.value->>'image_url') from jsonb_array_elements(p_options) v)<>4 then return false;end if;
  return true;
 end if;
 return false;
end $function$

      or (p_solution->'flag_visual'->>'pixels')::int not between 14 and 48) then return false;end if;
   return true;
 elsif v_mode='colors' then
  if jsonb_typeof(p_solution->'option_labels')<>'array'
     or jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct btrim(x.value)) from jsonb_array_elements_text(p_solution->'option_labels') x)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) o
     where jsonb_typeof(o.value)<>'object' or o.value ? 'label'
     or o.value->>'orientation' not in ('horizontal','vertical')
     or jsonb_typeof(o.value->'stripes')<>'array'
     or jsonb_array_length(o.value->'stripes') not between 2 and 4
     or exists(select 1 from jsonb_array_elements_text(o.value->'stripes') s
          where s.value !~ '^#[0-9a-fA-F]{6}')) then return false;end if;
  if (select count(distinct value) from jsonb_array_elements(p_options))<>4 then return false;end if;
  if (select count(distinct o.value->>'orientation') from jsonb_array_elements(p_options) o)<>1 then return false;end if;
  return true;
 elsif v_mode='picker' then
  if jsonb_typeof(p_solution->'option_labels')<>'array' or
     jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
  if (select count(distinct lower(btrim(v.value))) from jsonb_array_elements_text(p_solution->'option_labels') v)<>4 then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) v
      where jsonb_typeof(v.value)<>'object' or
      coalesce(v.value->>'image_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$' or
      v.value ? 'label') then return false;end if;
  if (select count(distinct v.value->>'image_url') from jsonb_array_elements(p_options) v)<>4 then return false;end if;
  return true;
 end if;
 return false;
end $function$;
CREATE OR REPLACE FUNCTION public.qwiz_compile_build(p_build uuid, p_title text DEFAULT NULL::text, p_allow_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_build public.qwiz_builds%rowtype; v_card public.qwiz_build_cards%rowtype;
 v_question public.qwiz_bank%rowtype; v_questions jsonb:='[]'::jsonb; v_timeline jsonb:='[]'::jsonb;
 v_n integer; v_skip integer; v_secs integer; v_order text; v_limit integer;
 v_quiz uuid; v_code text; v_room uuid; v_count integer; v_opts jsonb; v_sol jsonb; v_match_choices jsonb; v_missing jsonb:='[]'::jsonb; v_used uuid[]:='{}'::uuid[]; v_modes jsonb; v_flags boolean;
begin
 v_owner:=(select auth.uid());
 if v_owner is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 
 select * into v_build from public.qwiz_builds where id=p_build and owner_id=v_owner;
 if not found then raise exception 'Сборка не найдена'; end if;
 for v_card in select * from public.qwiz_build_cards where build_id=p_build order by position loop
   v_timeline:=v_timeline||jsonb_build_array(jsonb_build_object(
    'type',v_card.card_type,'title',v_card.title,'icon',v_card.icon,
    'settings',v_card.settings,'first_question',jsonb_array_length(v_questions)));
   if v_card.card_type='round' then
     if v_card.topic_id is null then
      v_missing:=v_missing||jsonb_build_array(jsonb_build_object('title',v_card.title,'topic_id',null,'reason','Не выбрана тема'));continue;
     end if;
     v_limit:=greatest(1,least(100,coalesce((v_card.settings->>'count')::integer,5)));
     v_skip:=greatest(0,coalesce((v_card.settings->>'offset')::integer,0));
     v_secs:=greatest(10,least(120,coalesce((v_card.settings->>'seconds')::integer,30)));
     v_order:=coalesce(v_card.settings->>'order','random');
     v_flags:=exists(select 1 from public.qwiz_topics t where t.id=v_card.topic_id and t.name='Флаги мира');
     v_modes:='[]'::jsonb;
     if v_flags then
      v_modes:=v_card.settings->'flag_modes';
      if v_modes is null or v_modes='[]'::jsonb then v_modes:='["country","picker","colors","symbols","fragments"]'::jsonb;end if;
      if jsonb_typeof(v_modes)<>'array' then raise exception 'Раунд «%»: неверный список механик',v_card.title;end if;
      if jsonb_array_length(v_modes)>5 or exists(select 1 from jsonb_array_elements_text(v_modes) x where x.value not in ('country','picker','colors','symbols','fragments')) then
       raise exception 'Раунд «%»: неверный список механик',v_card.title;
      end if;
     end if;
     v_count:=0;
     for v_question in
      select * from public.qwiz_bank b where b.owner_id=v_owner and b.topic_id=v_card.topic_id
       and not (b.id=any(v_used))
       and (not v_flags or (b.kind='flag' and b.tags @> array['fw:published']::text[]
        and b.solution->>'flag_mode' in (select jsonb_array_elements_text(v_modes))
        and public.qwiz_flags_question_valid(b.kind,b.options,b.solution)))
       and b.kind in ('single','boolean','multi','match','order','sequence','text','number','date','estimate','riddle','puzzle','blitz','flag','portrait','image','audio','video','map','poll','hotspot')
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
         'flag_visual',coalesce(v_question.solution->'flag_visual','null'::jsonb),
         'media_url',coalesce(v_question.solution->>'media_url',''),'illustration_url',coalesce(v_question.solution->>'illustration_url',''),
         'answer_duration',greatest(5,least(30,coalesce((v_card.settings->>'answer_seconds')::int,10))),'duration',v_secs,'topic',(select t.name from public.qwiz_topics t where t.id=v_card.topic_id),'round_title',v_card.title,'round_sound',coalesce(v_card.settings->>'sound','fanfare'),'card_type',v_card.card_type,
         'round_index',v_card.position,'kind',v_question.kind));
       v_used:=array_append(v_used,v_question.id);
       v_count:=v_count+1;
     end loop;
     if v_count=0 then v_missing:=v_missing||jsonb_build_array(jsonb_build_object('title',v_card.title,'topic_id',v_card.topic_id,'reason',case when v_flags then 'Нет опубликованных вопросов выбранных механик с выбранного номера' else 'Нет игровых вопросов с выбранного номера' end));end if;
   end if;
 end loop;
 if jsonb_array_length(v_questions)>100 then raise exception 'В сборке не больше 100 игровых вопросов';end if;
 if jsonb_array_length(v_questions)=0 and v_missing='[]'::jsonb then
  v_missing:=jsonb_build_array(jsonb_build_object('title','Сборка','reason','Добавьте раунд с вопросами'));end if;
 if not p_allow_empty and v_missing<>'[]'::jsonb then raise exception 'Сборка ещё не готова: % — %',v_missing->0->>'title',v_missing->0->>'reason';end if;
 return jsonb_build_object('title',coalesce(nullif(trim(p_title),''),v_build.title),'questions',v_questions,'timeline',v_timeline,'issues',v_missing);
end $function$;
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
     if v_modes is null or v_modes='[]'::jsonb then v_modes:='["country","picker","colors","symbols","fragments"]'::jsonb;end if;
     if jsonb_typeof(v_modes)<>'array' or jsonb_array_length(v_modes)>5 or
        exists(select 1 from jsonb_array_elements_text(v_modes) x where x.value not in ('country','picker','colors','symbols','fragments')) then
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
         'flag_visual',coalesce(v_question.solution->'flag_visual','null'::jsonb),
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
end $function$;
do $validate$
begin
 if not public.qwiz_flags_question_valid('flag',
    '["Мексика","Италия","Индия","Португалия"]'::jsonb,
    '{"correct":0,"flag_mode":"symbols","media_url":"https://dimkazantsev.github.io/ORG/next/assets/flags-world/mx.svg","flag_visual":{"type":"symbol","x":50,"y":50,"zoom":2.5}}'::jsonb)
 then raise exception 'Symbol validation failed';end if;
 if not public.qwiz_flags_question_valid('flag',
    '["Япония","Бангладеш","Индия","Пакистан"]'::jsonb,
    '{"correct":0,"flag_mode":"fragments","media_url":"https://dimkazantsev.github.io/ORG/next/assets/flags-world/jp.svg","flag_visual":{"type":"pixel","x":50,"y":50,"zoom":2.5,"pixels":20}}'::jsonb)
 then raise exception 'Pixelated fragment validation failed';end if;
end $validate$;
commit;