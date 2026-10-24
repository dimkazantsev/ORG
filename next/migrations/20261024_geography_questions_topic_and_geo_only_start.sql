-- QWIZ-PARTY: Geography of Russia lives in the Questions topic library.
-- Executable geographic rounds keep their safe server-side individual tasks.
insert into public.qwiz_topics(owner_id,name,category)
select distinct t.owner_id,'География России','География' from public.qwiz_topics t
where not exists(select 1 from public.qwiz_topics x where x.owner_id=t.owner_id and x.name='География России');
create or replace function public.qwiz_geo_catalog(p_search text default '',p_offset int default 0,p_limit int default 25)
returns jsonb language sql stable security definer set search_path='' as $catalog$
 select jsonb_build_object(
 'total',(select count(*) from public.qwiz_geo_regions r where r.name ilike '%'||left(coalesce(p_search,''),90)||'%'
 or r.capital ilike '%'||left(coalesce(p_search,''),90)||'%'),
 'items',(select coalesce(jsonb_agg(to_jsonb(s) order by s.name),'[]'::jsonb) from
 (select r.id,r.name,r.capital,r.fd,r.kind,r.flag,cardinality(r.neighbors) as neighbor_count
 from public.qwiz_geo_regions r where r.name ilike '%'||left(coalesce(p_search,''),90)||'%'
 or r.capital ilike '%'||left(coalesce(p_search,''),90)||'%'
 order by r.name offset greatest(0,least(coalesce(p_offset,0),100))
 limit greatest(1,least(coalesce(p_limit,25),89))) s));
$catalog$;
revoke all on function public.qwiz_geo_catalog(text,int,int) from public,anon,authenticated;
grant execute on function public.qwiz_geo_catalog(text,int,int) to authenticated;
-- Geo-only games must not be blocked merely because their questions are generated
-- individually in the geography RPC rather than stored in org_next_quizzes.
CREATE OR REPLACE FUNCTION public.qwiz_compile_build(p_build uuid, p_title text DEFAULT NULL::text, p_allow_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_build public.qwiz_builds%rowtype; v_card public.qwiz_build_cards%rowtype;
 v_question public.qwiz_bank%rowtype; v_questions jsonb:='[]'::jsonb; v_timeline jsonb:='[]'::jsonb;
 v_n integer; v_skip integer; v_secs integer; v_order text; v_limit integer;
 v_quiz uuid; v_code text; v_room uuid; v_count integer; v_opts jsonb; v_sol jsonb; v_match_choices jsonb; v_missing jsonb:='[]'::jsonb; v_used uuid[]:='{}'::uuid[]; v_modes jsonb; v_flags boolean;v_geography boolean:=false;
begin
 v_owner:=(select auth.uid());
 if v_owner is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 
 select * into v_build from public.qwiz_builds where id=p_build and owner_id=v_owner;
 if not found then raise exception 'Сборка не найдена'; end if;
 for v_card in select * from public.qwiz_build_cards where build_id=p_build order by position loop
   if v_card.card_type='bonus' and v_card.settings->>'arcade_mode'='russia_map' then v_geography:=true;end if;
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
 if jsonb_array_length(v_questions)=0 and not v_geography and v_missing='[]'::jsonb then
  v_missing:=jsonb_build_array(jsonb_build_object('title','Сборка','reason','Добавьте раунд с вопросами'));end if;
 if not p_allow_empty and v_missing<>'[]'::jsonb then raise exception 'Сборка ещё не готова: % — %',v_missing->0->>'title',v_missing->0->>'reason';end if;
 return jsonb_build_object('title',coalesce(nullif(trim(p_title),''),v_build.title),'questions',v_questions,'timeline',v_timeline,'issues',v_missing);
end $function$
;
CREATE OR REPLACE FUNCTION public.qwiz_check_room_start(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype;q_count integer;
begin
 select * into r from public.org_next_rooms x where x.id=p_room for update;
 if r.id is null or r.owner_id is distinct from (select auth.uid()) or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 if r.phase<>'lobby' then return;end if;
 if r.setup_issues<>'[]'::jsonb then perform public.qwiz_refresh_room_content(p_room);select * into r from public.org_next_rooms x where x.id=p_room;end if;
 select jsonb_array_length(q.questions) into q_count from public.org_next_quizzes q where q.id=r.quiz_id;
 if (coalesce(q_count,0)=0 and not exists(select 1 from public.qwiz_room_builds b, jsonb_array_elements(b.timeline) card where b.room_id=p_room and card->>'type'='bonus' and card->'settings'->>'arcade_mode'='russia_map')) or r.setup_issues<>'[]'::jsonb then raise exception 'Добавьте вопросы в раунды сборки, затем обновите вопросы комнаты';end if;
 if exists(select 1 from public.org_next_players p where p.room_id=p_room and p.team_id is null) then raise exception 'Сначала распределите всех участников по командам';end if;
end $function$
;
