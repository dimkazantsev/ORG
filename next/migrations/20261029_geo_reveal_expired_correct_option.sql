-- Expose only the expired question's correct option AFTER server timer expiry.
-- Stable result feedback for the same options; no answers leaked during active time.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.qwiz_geo_play(p_room uuid, p_answer text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype;a public.qwiz_room_activity%rowtype;
p public.org_next_players%rowtype; run public.qwiz_geo_runs%rowtype;
ids text[]; all_ids text[]; opts text[]; n int;i int;
modes jsonb;v_mode text;v_id text;v_answer text;v_neighbor text;v_options jsonb;v_tasks jsonb:='[]'::jsonb;
v_region public.qwiz_geo_regions%rowtype;v_task jsonb;v_hit boolean;v_award int:=0;
v_count int;v_sec int;v_per_question int;v_expired int;v_open boolean;v_remaining int;v_paused boolean;v_timed_out boolean:=false;
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
 v_sec:=public.qwiz_geo_total_seconds(a.settings);
 v_paused:=public.qwiz_party_paused(p_room);
 v_remaining:=greatest(0,coalesce((select ceil(x.remaining_ms/1000.0)::int from public.qwiz_room_pauses x where x.room_id=p_room),ceil(extract(epoch from a.entered_at+make_interval(secs=>v_sec)-clock_timestamp()))::int));
 v_open:=v_remaining>0;
 select * into run from public.qwiz_geo_runs x
 where x.room_id=p_room and x.player_id=p.id and x.card_position=a.card_position for update;
 if not found then
   n:=greatest(1,least(89,coalesce((a.settings->>'geo_count')::int,15)));
   -- Map modes must be selected explicitly; never run all modes by default.
   modes:=a.settings->'geo_modes';
   if jsonb_typeof(modes) is distinct from 'array' or jsonb_array_length(modes)=0 then
    raise exception 'Для карты России выберите механики и пересоздайте игровую комнату.';
   end if;
   if exists(select 1 from jsonb_array_elements_text(modes) selected(mode)
     where selected.mode not in ('locate','identify','capital','flag','silhouette','neighbour','detective','district')) then
    raise exception 'Недопустимая механика карты России. Пересохраните сборку.';
   end if;
   select array_agg(id order by md5(id||':'||p.id::text||':'||p_room::text||':'||a.card_position::text))
     into ids from public.qwiz_geo_regions;
   for i in 1..n loop
    v_id:=ids[i];select * into v_region from public.qwiz_geo_regions where id=v_id;
    v_mode:=modes->>((i-1)%jsonb_array_length(modes));
    if v_mode not in ('locate','identify','capital','flag','silhouette','neighbour','detective','district') then
      raise exception 'Некорректная механика карты России';
    end if;
    if v_mode='neighbour' and cardinality(v_region.neighbors)=0 then
      select * into v_region from public.qwiz_geo_regions candidate
       where cardinality(candidate.neighbors)>0
       order by md5(candidate.id||':'||p.id::text||':'||i::text) limit 1;
      if not found then raise exception 'Недостаточно регионов с соседними субъектами';end if;
      v_id:=v_region.id;
    end if;
    if v_mode='flag' and v_region.flag is null then
      select * into v_region from public.qwiz_geo_regions candidate
       where candidate.flag is not null
       order by md5(candidate.id||':'||p.id::text||':'||i::text) limit 1;
      if not found then raise exception 'Нет подходящих изображений флагов';end if;
      v_id:=v_region.id;
    end if;
    v_answer:=case when v_mode='neighbour'
       then v_region.neighbors[1+mod(i+length(p.id::text),cardinality(v_region.neighbors))]
       else v_id end;
    if v_mode='district' then
     select array_agg(z.id order by md5(z.id||':'||p.id::text||':'||i::text)) into all_ids
     from (select distinct on (fd) id,fd from public.qwiz_geo_regions
      where fd<>v_region.fd order by fd,id) z;
    elsif v_mode='capital' then
     select array_agg(z.id order by md5(z.id||':'||p.id::text||':'||i::text)) into all_ids
     from (select distinct on (capital) id,capital from public.qwiz_geo_regions
      where capital<>v_region.capital order by capital,id) z;
    elsif v_mode='neighbour' then
     select array_agg(z.id order by md5(z.id||':'||p.id::text||':'||i::text)) into all_ids
       from public.qwiz_geo_regions z where z.id<>v_answer and not(z.id=any(v_region.neighbors));
    else
     select array_agg(z.id order by md5(z.id||':'||p.id::text||':'||i::text)) into all_ids
       from public.qwiz_geo_regions z where z.id<>v_answer;
    end if;
    opts:=array[v_answer,all_ids[1],all_ids[2],all_ids[3]];
    select jsonb_agg(jsonb_build_object('id',x.id,'text',
      case when v_mode='capital' then z.capital when v_mode='district' then z.fd else z.name end)
      order by random())
      into v_options from unnest(opts) x(id) join public.qwiz_geo_regions z on z.id=x.id;
    -- Options for textual answers use opaque one-time tokens. SVG map answers retain region IDs.
    if v_mode<>'locate' then
      with tokens as (
       select x.v->>'id' original,md5(random()::text||clock_timestamp()::text||x.ordinality::text) token,
       x.v->>'text' label,x.ordinality ord
       from jsonb_array_elements(v_options) with ordinality x(v,ordinality)
      )
      select jsonb_agg(jsonb_build_object('id',token,'text',label) order by ord),
       max(token) filter(where original=v_answer) into v_options,v_answer from tokens;
    end if;
    v_tasks:=v_tasks||jsonb_build_array(jsonb_build_object(
      'mode',v_mode,'region',v_id,'answer',v_answer,
      'name',v_region.name,'capital',v_region.capital,
      'district',v_region.fd,'region_type',v_region.kind,
      'flag',v_region.flag,'options',v_options));
   end loop;
   insert into public.qwiz_geo_runs(room_id,player_id,card_position,tasks)
     values(p_room,p.id,a.card_position,v_tasks) returning * into run;
 end if;
 -- Check configured selections for existing runs, too.
 modes:=a.settings->'geo_modes';
 if jsonb_typeof(modes) is distinct from 'array' or jsonb_array_length(modes)=0 then
   raise exception 'Для карты России выберите механики и пересоздайте комнату.';
 end if;
 if exists(select 1 from jsonb_array_elements(run.tasks) as old_task(value)
   where not (modes ? (old_task.value->>'mode'))) then
   raise exception 'В комнате сохранены задания невыбранных механик. Создайте новую комнату из исправленной сборки.';
 end if;
 v_count:=jsonb_array_length(run.tasks);
 -- Each question expires independently, including unanswered map selections.
 -- updated_at marks the start of the current question and is moved after each accepted answer.
 v_per_question:=public.qwiz_geo_question_seconds(a.settings);
 IF NOT v_paused AND v_open AND run.current_index<v_count THEN
   v_expired:=least(v_count-run.current_index, greatest(0,floor(
     extract(epoch FROM (clock_timestamp()-run.updated_at)) / v_per_question
   )::int));
   IF v_expired>0 THEN
      v_task:=run.tasks->run.current_index;
      v_timed_out:=true;
      UPDATE public.qwiz_geo_runs x
       SET current_index=x.current_index+v_expired,updated_at=clock_timestamp()
       WHERE x.room_id=p_room AND x.player_id=p.id AND x.card_position=a.card_position
       RETURNING * INTO run;
      -- A submission from an expired displayed question cannot answer the next question.
      p_answer:=NULL;
   END IF;
 END IF;
 v_remaining:=greatest(0,least(v_remaining,
    v_per_question-greatest(0,ceil(extract(epoch FROM (clock_timestamp()-run.updated_at)))::int)));
 v_open:=v_open AND run.current_index<v_count;
 if p_answer is not null and v_open and not v_paused and run.current_index<v_count then
   v_task:=run.tasks->run.current_index;v_hit:=p_answer=v_task->>'answer';
   v_award:=case when v_hit then 10 else 0 end;
   update public.qwiz_geo_runs x set current_index=x.current_index+1,
    score=x.score+v_award,correct_count=x.correct_count+case when v_hit then 1 else 0 end,
    updated_at=clock_timestamp()
    where x.room_id=p_room and x.player_id=p.id and x.card_position=a.card_position returning * into run;
   if v_award>0 then
     update public.org_next_teams t set score=t.score+v_award where t.id=p.team_id and t.room_id=p_room;
   end if;
 end if;
 return jsonb_build_object(
 'active',true,'open',v_open,'paused',v_paused,'remaining',v_remaining,'index',run.current_index,
 'total',v_count,'question_seconds',v_per_question,'answer_seconds',greatest(1,least(30,coalesce((a.settings->>'answer_seconds')::int,8))),'score',run.score,'correct',run.correct_count,'finished',run.current_index>=v_count,
 'last_correct',case when p_answer is not null then v_hit when v_timed_out then false else null end,
 'timed_out',v_timed_out,
 'last_award',v_award,
 'last_answer',case when (p_answer is not null or v_timed_out) and v_task is not null then
 jsonb_build_object(
  'correct',v_hit,
  'correct_text',case when v_task->>'mode'='locate' then
     (select name from public.qwiz_geo_regions where id=v_task->>'answer')
    else (select choice->>'text' from jsonb_array_elements(v_task->'options') choice
          where choice->>'id'=v_task->>'answer' limit 1) end,
  'correct_region_id',case when v_task->>'mode'='locate' then v_task->>'answer' else null end,
  'selected_region_id',case when v_task->>'mode'='locate' then p_answer else null end
 ) else null end,
 'question',case when v_open and run.current_index<v_count
 then case run.tasks->run.current_index->>'mode'
 when 'locate' then (run.tasks->run.current_index)-'answer'-'region'-'capital'-'district'-'region_type'-'flag'-'options'
 when 'identify' then (run.tasks->run.current_index)-'answer'-'name'-'capital'-'district'-'region_type'-'flag'
 when 'silhouette' then (run.tasks->run.current_index)-'answer'-'name'-'capital'-'district'-'region_type'-'flag'
 when 'flag' then (run.tasks->run.current_index)-'answer'-'name'-'region'-'capital'-'district'-'region_type'
 when 'detective' then (run.tasks->run.current_index)-'answer'-'name'-'region'-'flag'
 else (run.tasks->run.current_index)-'answer'-'region'-'capital'-'district'-'region_type'-'flag'
 end else null end);
end $function$;

COMMIT;
