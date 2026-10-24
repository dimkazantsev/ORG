-- Pause regular intermissions, including personal Geography of Russia. Competitive tap games remain unpausable.
-- Freeze and resume without losing individual progress; preserve existing owner/admin role guards.
CREATE OR REPLACE FUNCTION public.qwiz_party_control(p_room uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype; v public.qwiz_room_pauses%rowtype;
 a public.qwiz_room_activity%rowtype;v_stage_seconds integer;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 select * into r from public.org_next_rooms where id=p_room for update;
 if not found or r.owner_id<>(select auth.uid()) then raise exception 'Комната не найдена';end if;
 if p_action='pause' then
  if r.phase not in ('countdown','question','result','intermission') then raise exception 'Пауза доступна во время игры';end if;
  if r.phase='intermission' then
   select * into a from public.qwiz_room_activity where room_id=p_room;
   if not found or a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain') then
    raise exception 'Соревновательные мини-игры автоматически завершаются без паузы';end if;
   v_stage_seconds:=case when a.settings->>'arcade_mode'='russia_map'
     then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180)))
     else case a.kind when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
  end if;
  if exists(select 1 from public.qwiz_room_pauses where room_id=p_room) then return jsonb_build_object('phase',r.phase,'paused',true);end if;
  insert into public.qwiz_room_pauses(room_id,remaining_ms)
   values(p_room,case when r.phase='intermission' then greatest(0,floor(extract(epoch from(a.entered_at+make_interval(secs=>v_stage_seconds)-clock_timestamp()))*1000)::bigint)
      when r.ends_at is null then -1 else greatest(0,floor(extract(epoch from(r.ends_at-clock_timestamp()))*1000)::bigint) end);
  update public.org_next_rooms set ends_at=null where id=p_room;
  return jsonb_build_object('phase',r.phase,'paused',true);
 elsif p_action='resume' then
  delete from public.qwiz_room_pauses where room_id=p_room returning * into v;
  if not found then return jsonb_build_object('phase',r.phase,'paused',false);end if;
  if r.phase='intermission' and v.remaining_ms>=0 then
    select * into a from public.qwiz_room_activity where room_id=p_room;
    if found then
     v_stage_seconds:=case when a.settings->>'arcade_mode'='russia_map'
       then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180)))
       else case a.kind when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
     update public.qwiz_room_activity set entered_at=clock_timestamp()-make_interval(secs=>greatest(0.001,v_stage_seconds-v.remaining_ms/1000.0)) where room_id=p_room;
    end if;
  end if;
  if r.phase not in ('finished','lobby','intermission') and v.remaining_ms>=0 then
   update public.org_next_rooms set ends_at=clock_timestamp()+make_interval(secs=>greatest(0.001,v.remaining_ms/1000.0)) where id=p_room;
  end if;
  return jsonb_build_object('phase',r.phase,'paused',false);
 elsif p_action in ('start','next','reveal','finish') then
  if p_action='finish' then delete from public.qwiz_room_pauses where room_id=p_room;
  elsif exists(select 1 from public.qwiz_room_pauses where room_id=p_room) then raise exception 'Сначала продолжите игру';end if;
  if p_action='next' and r.phase='intermission' and exists(select 1 from public.qwiz_room_activity a where a.room_id=p_room and a.settings ? 'arcade_mode') then
    perform public.qwiz_boost_lock(p_room);
  end if;
  return jsonb_build_object('phase',public.org_next_advance(p_room,p_action),'paused',false);
 end if;
 raise exception 'Неизвестное действие';
end $function$
;

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
v_count int;v_sec int;v_open boolean;v_remaining int;v_paused boolean;
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
 v_paused:=public.qwiz_party_paused(p_room);
 v_remaining:=greatest(0,coalesce((select ceil(x.remaining_ms/1000.0)::int from public.qwiz_room_pauses x where x.room_id=p_room),ceil(extract(epoch from a.entered_at+make_interval(secs=>v_sec)-clock_timestamp()))::int));
 v_open:=v_remaining>0;
 select * into run from public.qwiz_geo_runs x
 where x.room_id=p_room and x.player_id=p.id and x.card_position=a.card_position for update;
 if not found then
   n:=greatest(1,least(89,coalesce((a.settings->>'geo_count')::int,15)));
   modes:=a.settings->'geo_modes';
   if jsonb_typeof(modes) is distinct from 'array' or jsonb_array_length(modes)=0 then
    modes:='["locate","identify","capital","flag","silhouette","neighbour","detective","district"]'::jsonb;
   end if;
   select array_agg(id order by md5(id||':'||p.id::text||':'||p_room::text||':'||a.card_position::text))
     into ids from public.qwiz_geo_regions;
   for i in 1..n loop
    v_id:=ids[i];select * into v_region from public.qwiz_geo_regions where id=v_id;
    v_mode:=modes->>((i-1)%jsonb_array_length(modes));
    if v_mode not in ('locate','identify','capital','flag','silhouette','neighbour','detective','district') then v_mode:='locate';end if;
    if v_mode='neighbour' and cardinality(v_region.neighbors)=0 then v_mode:='locate';end if;
    if v_mode='flag' and v_region.flag is null then v_mode:='identify';end if;
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
      order by md5(x.id||':'||p.id::text||':'||i::text))
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
 v_count:=jsonb_array_length(run.tasks);
 if p_answer is not null and v_open and not v_paused and run.current_index<v_count then
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
 'active',true,'open',v_open,'paused',v_paused,'remaining',v_remaining,'index',run.current_index,
 'total',v_count,'score',run.score,'correct',run.correct_count,'finished',run.current_index>=v_count,
 'last_correct',case when p_answer is not null then v_hit else null end,
 'last_award',v_award,'question',case when v_open and run.current_index<v_count
 then case run.tasks->run.current_index->>'mode'
 when 'locate' then (run.tasks->run.current_index)-'answer'-'region'-'capital'-'district'-'region_type'-'flag'-'options'
 when 'identify' then (run.tasks->run.current_index)-'answer'-'name'-'capital'-'district'-'region_type'-'flag'
 when 'silhouette' then (run.tasks->run.current_index)-'answer'-'name'-'capital'-'district'-'region_type'-'flag'
 when 'flag' then (run.tasks->run.current_index)-'answer'-'name'-'region'-'capital'-'district'-'region_type'
 when 'detective' then (run.tasks->run.current_index)-'answer'-'name'-'region'-'flag'
 else (run.tasks->run.current_index)-'answer'-'region'-'capital'-'district'-'region_type'-'flag'
 end else null end);
end $function$
;

CREATE OR REPLACE FUNCTION public.qwiz_geo_projection(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype;a public.qwiz_room_activity%rowtype;
begin
 if p_code !~ '^[A-F0-9]{8}$' then return jsonb_build_object('active',false);end if;
 select * into r from public.org_next_rooms where code=p_code;
 if not found or r.phase<>'intermission' then return jsonb_build_object('active',false);end if;
 select * into a from public.qwiz_room_activity where room_id=r.id;
 if not found or a.settings->>'arcade_mode'<>'russia_map' then return jsonb_build_object('active',false);end if;
 return jsonb_build_object('active',true,'title',a.title,
 'count',greatest(1,least(89,coalesce((a.settings->>'geo_count')::int,15))),
 'paused',public.qwiz_party_paused(r.id),
 'remaining',greatest(0,coalesce((select ceil(x.remaining_ms/1000.0)::int from public.qwiz_room_pauses x where x.room_id=r.id),ceil(extract(epoch from a.entered_at+
   make_interval(secs=>greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180))))-clock_timestamp()))::int)),
 'players',(select count(*) from public.qwiz_geo_runs x where x.room_id=r.id and x.card_position=a.card_position),
 'answered',(select coalesce(sum(x.current_index),0) from public.qwiz_geo_runs x where x.room_id=r.id and x.card_position=a.card_position),
 'correct',(select coalesce(sum(x.correct_count),0) from public.qwiz_geo_runs x where x.room_id=r.id and x.card_position=a.card_position)
 );
end $function$
;
