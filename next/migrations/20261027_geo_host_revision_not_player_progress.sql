-- Player answers never invalidate the moderator's Next button. Only a host step changes revision.
CREATE TABLE IF NOT EXISTS public.qwiz_geo_control_steps(
 room_id uuid PRIMARY KEY REFERENCES public.org_next_rooms(id) ON DELETE CASCADE,
 step integer NOT NULL DEFAULT 0 CHECK(step>=0)
);
ALTER TABLE public.qwiz_geo_control_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qwiz_geo_control_steps FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.qwiz_control_revision(p_room uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT md5(concat_ws('|',
  r.id::text,r.phase,coalesce(r.question_index::text,'-'),
  coalesce(extract(epoch from r.ends_at)::text,'-'),
  coalesce((SELECT a.card_position::text||':'||extract(epoch from a.entered_at)::text
             FROM public.qwiz_room_activity a WHERE a.room_id=r.id),'-'),
  coalesce((SELECT s.step::text FROM public.qwiz_geo_control_steps s WHERE s.room_id=r.id),'0'),
  CASE WHEN EXISTS(SELECT 1 FROM public.qwiz_room_pauses p WHERE p.room_id=r.id)
    THEN 'paused' ELSE 'running' END
 )) FROM public.org_next_rooms r WHERE r.id=p_room
$function$
;

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
     then public.qwiz_geo_total_seconds(a.settings)
     else case a.kind when 'card_intro' then greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))) when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
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
       then public.qwiz_geo_total_seconds(a.settings)
       else case a.kind when 'card_intro' then greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))) when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
     update public.qwiz_room_activity set entered_at=clock_timestamp()-make_interval(secs=>greatest(0.001,v_stage_seconds-v.remaining_ms/1000.0)) where room_id=p_room;
    end if;
  end if;
  if r.phase not in ('finished','lobby','intermission') and v.remaining_ms>=0 then
   update public.org_next_rooms set ends_at=clock_timestamp()+make_interval(secs=>greatest(0.001,v.remaining_ms/1000.0)) where id=p_room;
  end if;
  return jsonb_build_object('phase',r.phase,'paused',false);
 elsif p_action in ('start','next','reveal','finish') then
 if p_action='start' and r.phase='lobby' and EXISTS(select 1 from public.qwiz_lobby_config where room_id=p_room) and (r.team_mode='random' AND NOT EXISTS(select 1 from public.qwiz_lobby_config where room_id=p_room and confirmed_at is not null) OR r.team_mode='captain' AND ((SELECT count(*) from public.qwiz_lobby_captains where room_id=p_room)<>(SELECT count(*) from public.org_next_teams where room_id=p_room)) OR r.team_mode='captain' AND EXISTS(select 1 from public.org_next_players WHERE room_id=p_room and team_id is null) OR r.team_mode='manual' OR NOT EXISTS(select 1 from public.org_next_players WHERE room_id=p_room)) then raise exception 'Сначала завершите формирование команд';end if;
  -- Prevent finishing a lobby that has never started.
  if p_action='finish' and r.phase='lobby' then
   raise exception 'Игра ещё не началась. Ненужную комнату можно удалить из списка.';
  end if;
  if p_action='finish' or p_action='next' then
    delete from public.qwiz_room_pauses where room_id=p_room;
  elsif exists(select 1 from public.qwiz_room_pauses where room_id=p_room) then
    raise exception 'Сначала продолжите игру';
  end if;
  if p_action='next' and r.phase='countdown' then
    update public.org_next_rooms set ends_at=clock_timestamp()-interval '1 second'
      where id=p_room;
    perform public.qwiz_tick(r.code);
    return jsonb_build_object('phase',(select phase from public.org_next_rooms where id=p_room),'paused',false);
  end if;

  -- In Geography of Russia, Next advances one internal question across all
  -- participating devices, not the entire round. No advancement without host permission.
  if p_action='next' and r.phase='intermission' then
    select * into a from public.qwiz_room_activity where room_id=p_room;
    if found and a.settings->>'arcade_mode'='russia_map' and a.kind<>'card_intro' then
      if exists(select 1 from public.qwiz_geo_runs g where g.room_id=p_room
        and g.card_position=a.card_position and g.current_index<jsonb_array_length(g.tasks))
      then
        update public.qwiz_geo_runs g set
          current_index=least(jsonb_array_length(g.tasks),g.current_index+1),
          updated_at=clock_timestamp()
        where g.room_id=p_room and g.card_position=a.card_position
          and g.current_index<jsonb_array_length(g.tasks);
        insert into public.qwiz_geo_control_steps(room_id,step) values(p_room,1)
          on conflict(room_id) do update set step=public.qwiz_geo_control_steps.step+1;
        return jsonb_build_object('phase','intermission','geo_advanced',true);
      end if;
    end if;
    if found and a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain') then
      perform public.qwiz_arcade_finalize(p_room,a.card_position);
      perform public.qwiz_boost_lock(p_room);
    end if;
  end if;
  return jsonb_build_object('phase',public.org_next_advance(p_room,p_action),'paused',false);
 end if;
 raise exception 'Неизвестное действие';
end $function$
;
