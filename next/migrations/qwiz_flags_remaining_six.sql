-- Six additional flag mechanics; preserve existing rooms, teams and games.
begin;
CREATE OR REPLACE FUNCTION public.qwiz_flags_question_valid(p_kind text, p_options jsonb, p_solution jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_mode text; v_n integer; v_correct text;
begin
 if jsonb_typeof(p_options) is distinct from 'array' or jsonb_typeof(p_solution) is distinct from 'object' then return false;end if;
 v_mode:=p_solution->>'flag_mode';v_n:=jsonb_array_length(p_options);
 if p_solution ? 'flag_memory' and v_mode is distinct from 'memory' then return false;end if;
 if p_solution ? 'flag_assembly' and v_mode is distinct from 'assemble' then return false;end if;
 if v_mode in ('similar','assemble','multiple','memory','geo','history') then
  if p_solution ? 'correct' and (jsonb_typeof(p_solution->'correct')<>'number' or coalesce(p_solution->>'correct','') !~ '^[0-3]$') then return false;end if;
  if v_mode='assemble' then
   if p_kind<>'order' or v_n<>3 or p_solution ? 'correct' then return false;end if;
   if exists(select 1 from jsonb_array_elements(p_options) x where jsonb_typeof(x.value)<>'string' or length(btrim(x.value#>>'{}')) not between 1 and 40) then return false;end if;
   if (select count(distinct lower(btrim(x.value))) from jsonb_array_elements_text(p_options)x)<>3 then return false;end if;
   if jsonb_typeof(p_solution->'flag_assembly') is distinct from 'object' or coalesce(p_solution->'flag_assembly'->>'orientation','') not in ('horizontal','vertical') then return false;end if;
   if jsonb_typeof(p_solution->'flag_assembly'->'colors') is distinct from 'object' then return false;end if;
   if (select count(*) from jsonb_object_keys(p_solution->'flag_assembly'->'colors'))<>3 then return false;end if;
   if exists(select 1 from jsonb_array_elements_text(p_options)x where coalesce(p_solution->'flag_assembly'->'colors'->>x.value,'') !~ '^#[0-9a-fA-F]{6}$') then return false;end if;
   return (select count(distinct lower(value)) from jsonb_each_text(p_solution->'flag_assembly'->'colors'))=3;
  end if;
  if v_n<>4 then return false;end if;
  if v_mode='multiple' then
   if p_kind<>'multi' or p_solution ? 'correct' or jsonb_typeof(p_solution->'correct_indices') is distinct from 'array' then return false;end if;
   if jsonb_array_length(p_solution->'correct_indices') not between 2 and 3 then return false;end if;
   if exists(select 1 from jsonb_array_elements(p_solution->'correct_indices') x where jsonb_typeof(x.value)<>'number' or (x.value#>>'{}') !~ '^[0-3]$') then return false;end if;
   if (select count(distinct value) from jsonb_array_elements(p_solution->'correct_indices'))<>jsonb_array_length(p_solution->'correct_indices') then return false;end if;
  elsif p_kind<>'flag' or not(p_solution ? 'correct') then return false;end if;
  if v_mode in ('similar','multiple','geo') then
   if jsonb_typeof(p_solution->'option_labels') is distinct from 'array' or jsonb_array_length(p_solution->'option_labels')<>4 then return false;end if;
   if exists(select 1 from jsonb_array_elements(p_solution->'option_labels') x where jsonb_typeof(x.value)<>'string' or length(btrim(x.value#>>'{}')) not between 2 and 110) then return false;end if;
   if (select count(distinct lower(btrim(value))) from jsonb_array_elements_text(p_solution->'option_labels'))<>4 then return false;end if;
   if exists(select 1 from jsonb_array_elements(p_options)x where jsonb_typeof(x.value)<>'object' or coalesce(x.value->>'image_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$' or (x.value-'image_url')<>'{}'::jsonb) then return false;end if;
   if (select count(distinct value->>'image_url') from jsonb_array_elements(p_options))<>4 then return false;end if;
  else
   if exists(select 1 from jsonb_array_elements(p_options)x where jsonb_typeof(x.value)<>'string' or length(btrim(x.value#>>'{}')) not between 1 and 120) then return false;end if;
   if (select count(distinct lower(btrim(value))) from jsonb_array_elements_text(p_options))<>4 then return false;end if;
  end if;
  if v_mode in ('memory','geo') and coalesce(p_solution->>'media_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$' then return false;end if;
  if v_mode='memory' then
   if jsonb_typeof(p_solution->'flag_memory') is distinct from 'object' or jsonb_typeof(p_solution->'flag_memory'->'seconds') is distinct from 'number' or coalesce(p_solution->'flag_memory'->>'seconds','') !~ '^([3-9]|10)$' then return false;end if;
   if nullif(p_solution->>'illustration_url','') is not null then return false;end if;
  elsif v_mode='history' then
   if jsonb_typeof(p_solution->'source_urls') is distinct from 'array' then return false;end if;
   if jsonb_array_length(p_solution->'source_urls') not between 1 and 3 then return false;end if;
   if exists(select 1 from jsonb_array_elements(p_solution->'source_urls') x where jsonb_typeof(x.value)<>'string' or (x.value#>>'{}') !~ '^https://[^ /]+/[^ ]+$') then return false;end if;
  end if;
  return true;
 end if;
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
  if coalesce(p_solution->>'media_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$' then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_options) o
     where jsonb_typeof(o.value)<>'string' or length(btrim(o.value#>>'{}'))<2) then return false;end if;
  if (select count(distinct lower(btrim(x.value))) from jsonb_array_elements_text(p_options) x)<>4 then return false;end if;
  if jsonb_typeof(p_solution->'flag_visual')<>'object' then return false;end if;
  if v_mode='symbols' and p_solution->'flag_visual'->>'type'<>'symbol' then return false;end if;
  if v_mode='fragments' and p_solution->'flag_visual'->>'type' not in ('crop','pixel') then return false;end if;
  if coalesce(p_solution->'flag_visual'->>'x','') !~ '^[0-9]{2}$'
    or (p_solution->'flag_visual'->>'x')::int not between 10 and 90 then return false;end if;
  if coalesce(p_solution->'flag_visual'->>'y','') !~ '^[0-9]{2}$'
    or (p_solution->'flag_visual'->>'y')::int not between 10 and 90 then return false;end if;
  if coalesce(p_solution->'flag_visual'->>'zoom','') !~ '^[1-4]([.][0-9]+)?$' then return false;end if;
  if (p_solution->'flag_visual'->>'zoom')::numeric not between 1.5 and 4 then return false;end if;
  if v_mode='fragments' and
    (coalesce(p_solution->'flag_visual'->>'pixels','') !~ '^[0-9]{2}$'
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
 elsif v_mode='errors' then
   if p_solution->>'error_kind'<>'mislabeled' then return false;end if;
   if jsonb_typeof(p_solution->'option_labels') is not null then return false;end if;
   if exists(select 1 from jsonb_array_elements(p_options) o where
     jsonb_typeof(o.value)<>'object'
     or coalesce(o.value->>'image_url','') !~ '^https://[^ ]+[.]svg([?][^ ]*)?$'
     or length(btrim(coalesce(o.value->>'label',''))) not between 2 and 110
     or o.value ? 'correct' or o.value ? 'is_error') then return false;end if;
   if (select count(distinct o.value->>'image_url') from jsonb_array_elements(p_options) o)<>4 then return false;end if;
   if (select count(distinct lower(btrim(o.value->>'label'))) from jsonb_array_elements(p_options) o)<>4 then return false;end if;
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
      if v_modes is null or v_modes='[]'::jsonb then v_modes:='["country","picker","colors","symbols","fragments","errors","similar","assemble","multiple","memory","geo","history"]'::jsonb;end if;
      if jsonb_typeof(v_modes)<>'array' then raise exception 'Раунд «%»: неверный список механик',v_card.title;end if;
      if jsonb_array_length(v_modes)>12 or exists(select 1 from jsonb_array_elements_text(v_modes) x where x.value not in ('country','picker','colors','symbols','fragments','errors','similar','assemble','multiple','memory','geo','history')) then
       raise exception 'Раунд «%»: неверный список механик',v_card.title;
      end if;
     end if;
     v_count:=0;
     for v_question in
      select * from public.qwiz_bank b where b.owner_id=v_owner and b.topic_id=v_card.topic_id
       and not (b.id=any(v_used))
       and (not v_flags or (b.kind in ('flag','order','multi') and b.tags @> array['fw:published']::text[]
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
         select coalesce(jsonb_agg(x.val order by case when v_question.solution->>'flag_mode'='assemble' then random() else x.ordinality end desc),'[]'::jsonb)
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
         'flag_assembly',v_question.solution->'flag_assembly','flag_memory',v_question.solution->'flag_memory',
         'media_url',coalesce(v_question.solution->>'media_url',''),'illustration_url',coalesce(v_question.solution->>'illustration_url',''),
         'answer_duration',greatest(5,least(30,coalesce((v_card.settings->>'answer_seconds')::int,10))),'duration',greatest(v_secs,coalesce((v_question.solution->'flag_memory'->>'seconds')::int,0)+10),'topic',(select t.name from public.qwiz_topics t where t.id=v_card.topic_id),'round_title',v_card.title,'round_sound',coalesce(v_card.settings->>'sound','fanfare'),'card_type',v_card.card_type,
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
     if v_modes is null or v_modes='[]'::jsonb then v_modes:='["country","picker","colors","symbols","fragments","errors","similar","assemble","multiple","memory","geo","history"]'::jsonb;end if;
     if jsonb_typeof(v_modes)<>'array' or jsonb_array_length(v_modes)>12 or
        exists(select 1 from jsonb_array_elements_text(v_modes) x where x.value not in ('country','picker','colors','symbols','fragments','errors','similar','assemble','multiple','memory','geo','history')) then
       raise exception 'Раунд «%»: неверный список механик',v_card.title;
     end if;
     v_count:=0;
     for v_question in
      select * from public.qwiz_bank b where b.owner_id=v_owner and b.topic_id=v_card.topic_id
       and b.kind in ('flag','order','multi') and b.tags @> array['fw:published']::text[]
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
         select coalesce(jsonb_agg(x.val order by case when v_question.solution->>'flag_mode'='assemble' then random() else x.ordinality end desc),'[]'::jsonb)
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
         'flag_assembly',v_question.solution->'flag_assembly','flag_memory',v_question.solution->'flag_memory',
         'media_url',coalesce(v_question.solution->>'media_url',''),'illustration_url',coalesce(v_question.solution->>'illustration_url',''),
         'answer_duration',greatest(5,least(30,coalesce((v_card.settings->>'answer_seconds')::int,10))),'duration',greatest(v_secs,coalesce((v_question.solution->'flag_memory'->>'seconds')::int,0)+10),'topic',(select t.name from public.qwiz_topics t where t.id=v_card.topic_id),'round_title',v_card.title,'round_sound',coalesce(v_card.settings->>'sound','fanfare'),'card_type',v_card.card_type,
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
     and (nullif(p_input->>'kind','') is null or (q.kind=p_input->>'kind' or (p_input->>'kind'='flag' and q.solution->>'flag_mode' in ('assemble','multiple'))))
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
       and (nullif(p_input->>'kind','') is null or (q.kind=p_input->>'kind' or (p_input->>'kind'='flag' and q.solution->>'flag_mode' in ('assemble','multiple'))))
       and (nullif(p_input->>'mode','') is null or q.solution->>'flag_mode'=p_input->>'mode')
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
 elsif p_action='build_delete' then
   if nullif(p_input->>'id','') is null then raise exception 'Укажите сборку';end if;
   v_id:=(p_input->>'id')::uuid;
   delete from public.qwiz_builds where id=v_id and owner_id=v_user returning id into v_build;
   if v_build is null then raise exception 'Сборка не найдена или нет прав';end if;
   -- Existing room snapshots and scores are retained (room_builds.build_id ON DELETE SET NULL).
   return jsonb_build_object('deleted',true,'id',v_id);
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
end $function$;
create or replace function public.qwiz_flag_memory_view(q jsonb,p_phase text,p_ends timestamptz)
returns jsonb language plpgsql stable set search_path='' as $memory$
declare until_at timestamptz;
begin
 if q->'flag_memory'->>'seconds' is null or p_phase<>'question' then return q;end if;
 until_at:=p_ends-make_interval(secs=>(q->>'duration')::int-(q->'flag_memory'->>'seconds')::int);
 q:=q||jsonb_build_object('memory_until',until_at);
 if clock_timestamp()>=until_at then q:=q-'media_url'-'illustration_url';end if;
 return q;
end $memory$;
revoke all on function public.qwiz_flag_memory_view(jsonb,text,timestamptz) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.qwiz_public_screen(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype;q jsonb;total int;activity jsonb;metrics jsonb;reveal boolean;final_card jsonb;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then raise exception 'Неверный код';end if;
 perform public.qwiz_tick(p_code);
 select * into r from public.org_next_rooms where code=p_code;
 if not found then raise exception 'Комната не найдена';end if;
 select jsonb_array_length(x.questions),case when r.question_index>=0 then x.questions->r.question_index else null end into total,q from public.org_next_quizzes x where x.id=r.quiz_id;
 if r.phase='intermission' then
  select jsonb_build_object('type',a.kind,'title',a.title,'icon','◉','sound',coalesce(a.settings->>'sound','none'),'settings',jsonb_build_object('arcade_mode',a.settings->>'arcade_mode','arcade_seconds',a.settings->>'arcade_seconds')) into activity from public.qwiz_room_activity a where a.room_id=r.id;
 elsif r.phase='finished' then
  select rb.timeline->(jsonb_array_length(rb.timeline)-1) into final_card from public.qwiz_room_builds rb where rb.room_id=r.id;
  activity:=jsonb_build_object('type','finale','title',coalesce(final_card->>'title','Финал игры'),'sound',coalesce(final_card->'settings'->>'sound','fanfare'));
 end if;
 reveal:=r.phase in ('result','finished') or coalesce(activity->>'type','') in ('team_stats','player_stats');
 metrics:=public.qwiz_screen_metrics(r.id,r.question_index,reveal,r.phase='finished');
 return jsonb_build_object('code',r.code,'title',r.title,'phase',r.phase,'index',r.question_index,'total',total,
 'server_now',clock_timestamp(),'ends_at',r.ends_at,'duration',case when r.phase='result' then greatest(5,least(30,coalesce((q->>'answer_duration')::int,10))) else coalesce((q->>'duration')::int,30) end,
 'question',case when r.phase in ('question','result') then public.qwiz_flag_memory_view(q-'correct'-'solution'-'explanation',r.phase,r.ends_at) else null end,
 'answer',case when r.phase='result' then public.qwiz_answer_display(q) else null end,
 'activity',activity,'round_sound',q->>'round_sound',
 'lobby_teams',case when r.phase='lobby' then (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'position',t.position,'name',t.name,'members',(select count(*) from public.org_next_players p where p.team_id=t.id)) order by t.position),'[]'::jsonb) from public.org_next_teams t where t.room_id=r.id) else '[]'::jsonb end)||metrics;
end $function$;
CREATE OR REPLACE FUNCTION public.org_next_state(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room public.org_next_rooms%rowtype; v_host boolean; v_player public.org_next_players%rowtype;
 v_q jsonb; v_quiz public.org_next_quizzes%rowtype;
 v_teams jsonb; v_players jsonb; v_answers int;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход'; end if;
 select * into v_room from public.org_next_rooms where code=upper(trim(p_code));
 if not found then raise exception 'Комната не найдена'; end if;
 v_host:=v_room.owner_id=(select auth.uid()) and public.org_quiz_is_admin_check();
 select * into v_player from public.org_next_players p
 where p.room_id=v_room.id and (p.user_id=(select auth.uid())
 or exists(select 1 from public.qwiz_player_device_access d
    where d.room_id=v_room.id and d.player_id=p.id and d.user_id=(select auth.uid()))) limit 1;
 if not v_host and v_player.id is null then raise exception 'Нет доступа к комнате'; end if;
 perform public.qwiz_tick(v_room.code);
 select * into v_room from public.org_next_rooms where id=v_room.id;
 select * into v_quiz from public.org_next_quizzes where id=v_room.quiz_id;
 if v_room.question_index>=0 then
  v_q:=v_quiz.questions->v_room.question_index;
  if v_room.phase in ('lobby','countdown','intermission') then v_q:=null;
  elsif not v_host and v_room.phase not in ('result','finished') then v_q:=v_q-'correct'-'solution'-'explanation';end if;
 else v_q:=null; end if;
 if not v_host then v_q:=public.qwiz_flag_memory_view(v_q,v_room.phase,v_room.ends_at);end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'name',t.name,'score',t.score,
  'players',(select count(*) from public.org_next_players x where x.team_id=t.id)
  ) order by t.position),'[]'::jsonb)
 into v_teams from public.org_next_teams t where t.room_id=v_room.id;
 if v_host then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'group',p.group_name,'team_id',p.team_id) order by p.joined_at),'[]'::jsonb)
  into v_players from public.org_next_players p where p.room_id=v_room.id;
 else v_players:='[]'::jsonb; end if;
 select count(*) into v_answers from public.org_next_answers where room_id=v_room.id and question_index=v_room.question_index;
 return jsonb_build_object(
 'room_id',v_room.id,'code',v_room.code,'title',v_room.title,'phase',v_room.phase,
 'index',v_room.question_index,'total',jsonb_array_length(v_quiz.questions),
 'server_now',clock_timestamp(),'duration',case when v_room.phase='result' then greatest(5,least(30,coalesce((v_q->>'answer_duration')::int,10))) else coalesce((v_q->>'duration')::int,30) end,
 'public_stats',public.qwiz_screen_metrics(v_room.id,v_room.question_index,v_room.phase in ('result','finished'),v_room.phase='finished'),
 'answer',case when v_room.phase='result' then public.qwiz_answer_display(v_quiz.questions->v_room.question_index) else null end,
 'ends_at',v_room.ends_at,'question',v_q,'teams',v_teams,'players',v_players,
 'me',case when v_player.id is null then null else jsonb_build_object('id',v_player.id,'team_id',v_player.team_id) end,
 'host',v_host,'eligible',case when v_player.id is null then true else public.qwiz_answer_eligible(v_room.id,v_player.id,v_room.question_index) end,'activity',case when v_room.phase='finished' then
 (select jsonb_build_object('type','finale','title',rb.timeline->(jsonb_array_length(rb.timeline)-1)->>'title','sound',coalesce(rb.timeline->(jsonb_array_length(rb.timeline)-1)->'settings'->>'sound','fanfare')) from public.qwiz_room_builds rb where rb.room_id=v_room.id)
 else (select jsonb_build_object('type',a.kind,'title',a.title,'settings',a.settings) from public.qwiz_room_activity a where a.room_id=v_room.id) end,
 'answers_count',v_answers,
 'has_answer',case when v_player.id is null then false else exists(select 1 from public.org_next_answers where room_id=v_room.id and player_id=v_player.id and question_index=v_room.question_index) end)||public.qwiz_team_state(v_room.id,v_host,v_player.id);
end $function$;
CREATE OR REPLACE FUNCTION public.org_next_answer(p_room uuid, p_choice integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room public.org_next_rooms%rowtype; v_player public.org_next_players%rowtype;
 v_question jsonb; v_correct boolean; v_points integer; v_ans uuid;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход'; end if;
 select * into v_room from public.org_next_rooms where id=p_room for share;
 if not found or v_room.phase!='question' or v_room.ends_at<=now()
 then raise exception 'Время ответа закончилось'; end if;
 select * into v_player from public.org_next_players p
 where p.room_id=p_room and (p.user_id=(select auth.uid())
 or exists(select 1 from public.qwiz_player_device_access d
    where d.room_id=p_room and d.player_id=p.id and d.user_id=(select auth.uid()))) limit 1;
 if not found then raise exception 'Игрок не найден'; end if;
 if not public.qwiz_answer_eligible(p_room,v_player.id,v_room.question_index) then raise exception 'Этот раунд не назначен вашей команде или участнику'; end if;
 select questions->v_room.question_index into v_question from public.org_next_quizzes where id=v_room.quiz_id;
 if v_question->'flag_memory'->>'seconds' is not null and clock_timestamp()<v_room.ends_at-make_interval(secs=>(v_question->>'duration')::int-(v_question->'flag_memory'->>'seconds')::int) then raise exception 'Сначала запомните флаг. Ответ откроется после скрытия';end if;
 if coalesce(v_question->>'kind','single') not in ('single','boolean','flag','portrait','image')
 then raise exception 'Используйте обработчик сложного вопроса';end if;
 if p_choice is null or p_choice<0 or p_choice>=jsonb_array_length(v_question->'options') then raise exception 'Неверный вариант'; end if;
 v_correct:=p_choice=(v_question->>'correct')::integer;
 v_points:=case when v_correct then 100 else 0 end;
 insert into public.org_next_answers(room_id,player_id,question_index,choice,correct,points)
 values(p_room,v_player.id,v_room.question_index,p_choice,v_correct,v_points)
 on conflict(room_id,player_id,question_index) do nothing returning id into v_ans;
 if v_ans is null then raise exception 'Ответ уже принят'; end if;
 if v_points>0 then update public.org_next_teams set score=score+v_points where id=v_player.team_id and room_id=p_room; end if;
 return jsonb_build_object('accepted',true);
end $function$;
CREATE OR REPLACE FUNCTION public.qwiz_submit_answer(p_room uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room public.org_next_rooms%rowtype;v_player public.org_next_players%rowtype;
 q jsonb; sol jsonb; kind text; v_correct boolean:=false; v_points integer:=0; a_id uuid;
 v_index integer; v_idx jsonb; expected text[]; supplied text[]; v_ans text; target numeric; actual numeric;
 xp numeric; yp numeric;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>4096
 then raise exception 'Некорректный формат ответа';end if;
 select * into v_room from public.org_next_rooms where id=p_room for share;
 if not found or v_room.phase<>'question' or v_room.ends_at<=now() then raise exception 'Время ответа завершено';end if;
 select * into v_player from public.org_next_players p
  where p.room_id=p_room and (p.user_id=(select auth.uid()) or exists(
   select 1 from public.qwiz_player_device_access d where d.room_id=p_room and d.player_id=p.id and d.user_id=(select auth.uid())))
 limit 1;
 if not found then raise exception 'Участник не найден';end if;
 if not public.qwiz_answer_eligible(p_room,v_player.id,v_room.question_index) then
  raise exception 'Этот раунд вам недоступен';end if;
 select questions->v_room.question_index into q from public.org_next_quizzes where id=v_room.quiz_id;
 if q->'flag_memory'->>'seconds' is not null and clock_timestamp()<v_room.ends_at-make_interval(secs=>(q->>'duration')::int-(q->'flag_memory'->>'seconds')::int) then raise exception 'Сначала запомните флаг. Ответ откроется после скрытия';end if;
 if q is null then raise exception 'Вопрос отсутствует';end if;
 kind:=coalesce(q->>'kind','single');
 sol:=coalesce(q->'solution',jsonb_build_object('correct',q->'correct'));
 if kind in ('single','boolean','flag','portrait','image','audio','video','map','poll') then
  if jsonb_typeof(p_payload->'index')<>'number' then raise exception 'Выберите вариант ответа';end if;
  v_index:=(p_payload->>'index')::int;
  if v_index not between 0 and jsonb_array_length(q->'options')-1 then raise exception 'Неверный вариант';end if;
  if kind<>'poll' then v_correct:=v_index=(q->>'correct')::int;end if;
 elsif kind='multi' then
  if jsonb_typeof(p_payload->'indices')<>'array' or jsonb_array_length(p_payload->'indices')>6
    or jsonb_array_length(p_payload->'indices')<1 then raise exception 'Выберите правильные варианты';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'indices') x
      where jsonb_typeof(x.value)<>'number' or (x.value#>>'{}')::integer not between 0 and jsonb_array_length(q->'options')-1)
   then raise exception 'Некорректные варианты';end if;
  select array_agg((x.value#>>'{}')::text order by (x.value#>>'{}')::int) into supplied from
   (select distinct value from jsonb_array_elements(p_payload->'indices'))x;
  select array_agg((x.value#>>'{}')::text order by (x.value#>>'{}')::int) into expected from
   (select distinct value from jsonb_array_elements(sol->'correct_indices'))x;
  v_correct:=supplied=expected;
 elsif kind in ('order','sequence','match') then
  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')<>jsonb_array_length(q->'options')
  then raise exception 'Заполните все позиции';end if;
  if kind='match' then
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into supplied from jsonb_array_elements(p_payload->'items') with ordinality x(value,ordinality);
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into expected from jsonb_array_elements(sol->'matches') with ordinality x(value,ordinality);
  else
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into supplied from jsonb_array_elements(p_payload->'items') with ordinality x(value,ordinality);
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into expected from jsonb_array_elements(sol->'order') with ordinality x(value,ordinality);
  end if;
  v_correct:=supplied=expected;
 elsif kind in ('text','riddle','puzzle','blitz','date') then
  v_ans:=public.qwiz_normalize_answer(left(p_payload->>'text',200));
  if v_ans='' then raise exception 'Введите ответ';end if;
  v_correct:=v_ans=public.qwiz_normalize_answer(sol->>'answer');
  if not v_correct and jsonb_typeof(sol->'alternatives')='array' then
   v_correct:=exists(select 1 from jsonb_array_elements_text(sol->'alternatives') x
    where public.qwiz_normalize_answer(x.value)=v_ans);
  end if;
 elsif kind in ('number','estimate') then
  if coalesce(p_payload->>'text','') !~ '^-?[0-9]+([.,][0-9]+)?$' then raise exception 'Введите число';end if;
  actual:=replace(p_payload->>'text',',','.')::numeric;
  target:=replace(sol->>'answer',',','.')::numeric;
  v_correct:=abs(actual-target)<=greatest(0,least(1000000,coalesce(nullif(sol->>'tolerance','')::numeric,0)));
 elsif kind='hotspot' then
  if jsonb_typeof(p_payload->'x')<>'number' or jsonb_typeof(p_payload->'y')<>'number' then raise exception 'Нажмите на изображение';end if;
  xp:=(p_payload->>'x')::numeric;yp:=(p_payload->>'y')::numeric;
  if xp not between 0 and 100 or yp not between 0 and 100 then raise exception 'Неверные координаты';end if;
  v_correct:=(xp-(sol->>'x')::numeric)^2+(yp-(sol->>'y')::numeric)^2 <= ((sol->>'radius')::numeric)^2;
 else raise exception 'Тип пока не поддерживает игровые ответы';end if;
 v_points:=case when v_correct then 100 else 0 end;
 insert into public.org_next_answers(room_id,player_id,question_index,choice,correct,points)
 values(p_room,v_player.id,v_room.question_index,
   case when kind in ('single','boolean','flag','portrait','image','audio','video','map','poll') then v_index else 0 end,
   v_correct,v_points)
 on conflict(room_id,player_id,question_index) do nothing returning id into a_id;
 if a_id is null then raise exception 'Ответ уже принят';end if;
 insert into public.qwiz_answer_details(answer_id,response) values(a_id,p_payload);
 if v_points>0 then update public.org_next_teams set score=score+v_points where id=v_player.team_id and room_id=p_room;end if;
 return jsonb_build_object('accepted',true);
end $function$;
CREATE OR REPLACE FUNCTION public.qwiz_answer_display(q jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare kind text:=coalesce(q->>'kind','single'); sol jsonb:=q->'solution'; label text; indices jsonb:='[]'::jsonb;
begin
 if kind='poll' then label:='Голосование завершено';
 elsif kind='multi' then
  indices:=coalesce(sol->'correct_indices','[]'::jsonb);
  select string_agg(coalesce(sol->'option_labels'->>((x.value#>>'{}')::int),q->'options'->>((x.value#>>'{}')::int)),' · ' order by x.ordinality) into label
   from jsonb_array_elements(indices) with ordinality x(value,ordinality);
 elsif kind='match' then
  select string_agg((x.value#>>'{}')||' → '||(sol->'matches'->>(x.ordinality::int-1)),'; ' order by x.ordinality) into label
   from jsonb_array_elements(q->'options') with ordinality x(value,ordinality);
 elsif kind in ('order','sequence') then
  select string_agg(x.value,' → ' order by x.ordinality) into label from jsonb_array_elements_text(sol->'order') with ordinality x(value,ordinality);
 elsif kind in ('text','number','estimate','date','riddle','puzzle','blitz') then label:=sol->>'answer';
 elsif kind='hotspot' then label:='Правильная область отмечена на иллюстрации';
 else
  -- Flag-picker answer options may be image records rather than strings.
  -- Reveal only the human-reviewed country label, never serialized JSON.
  if jsonb_typeof(q->'options'->coalesce((q->>'correct')::int,(sol->>'correct')::int))='object' then
    label:=coalesce(
      sol->'option_labels'->>coalesce((q->>'correct')::int,(sol->>'correct')::int),
      q->'options'->coalesce((q->>'correct')::int,(sol->>'correct')::int)->>'label'
    );
  else
    label:=q->'options'->>coalesce((q->>'correct')::int,(sol->>'correct')::int);
  end if;
  if coalesce(q->'correct',sol->'correct') is not null then indices:=jsonb_build_array(coalesce(q->'correct',sol->'correct'));end if;
 end if;
 return jsonb_build_object('text',coalesce(nullif(label,''),'Ответ не указан'),'explanation',coalesce(q->>'explanation',''),
 'sources',coalesce(sol->'source_urls','[]'::jsonb),'indices',indices,'hotspot',case when kind='hotspot' then jsonb_build_object('x',sol->'x','y',sol->'y','radius',sol->'radius') else null end);
end $function$;
commit;
