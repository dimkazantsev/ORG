-- Fix moderator next transitions and bound memory scores to integer values.
CREATE OR REPLACE FUNCTION public.qwiz_arcade_rank(p_room uuid, p_position integer)
 RETURNS TABLE(team_id uuid, name text, points numeric, taps integer, active integer, members integer, place integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH stage AS (SELECT ar.mode,ar.started_at FROM public.qwiz_arcade_runs ar
   WHERE ar.room_id=p_room AND ar.card_position=p_position),
 totals AS (
 SELECT t.id team_id,t.name,t.position,
  (SELECT count(*)::int FROM public.org_next_players p WHERE p.team_id=t.id) members,
  coalesce(sum(c.clicks),0)::int taps,
  count(c.player_id) FILTER(WHERE c.clicks>0 OR c.reacted_at IS NOT NULL)::int tapped_members,
  coalesce(max(w.turbo),0) turbo,coalesce(max(w.grip),0) grip,coalesce(max(w.navigator),0) navigator,
  max(s.mode) mode,max(s.started_at) started_at
 FROM public.org_next_teams t CROSS JOIN stage s
 LEFT JOIN public.org_next_players p ON p.team_id=t.id
 LEFT JOIN public.qwiz_arcade_clicks c ON c.player_id=p.id AND c.room_id=p_room AND c.card_position=p_position
 LEFT JOIN public.qwiz_arcade_wallets w ON w.room_id=p_room AND w.team_id=t.id
 WHERE t.room_id=p_room GROUP BY t.id,t.name,t.position
 ), scores AS (
 SELECT x.*,
  (CASE WHEN mode='captain' THEN
     CASE WHEN mp.completed_at IS NOT NULL THEN
      (60 + greatest(0,40-least(40,ceil(extract(epoch from (mp.completed_at-x.started_at)))::int)))::numeric
     ELSE (coalesce(jsonb_array_length(mp.matched)/2,0)*10)::numeric END
   WHEN mode='rocket' THEN CASE WHEN coalesce(rp.cleared,0)=0 THEN 0::numeric ELSE coalesce(rp.cleared,0)::numeric
     +coalesce(least(0.99::numeric,greatest(0::numeric,
       extract(epoch from (coalesce(rp.eliminated_at,clock_timestamp())-x.started_at))::numeric/200)),0) END
   WHEN mode='tug' THEN x.taps::numeric -- Real total, not an average per participant.
   ELSE round((x.taps::numeric/greatest(x.members,1))*
    (1+0.10*x.navigator),0)
   END) AS pts,
   CASE WHEN mode='captain' THEN CASE WHEN mp.moves>0 THEN 1 ELSE 0 END
    WHEN mode='rocket' THEN CASE WHEN rp.cleared>0 THEN 1 ELSE 0 END
    ELSE x.tapped_members END AS players_active,
   coalesce(mp.moves,0) AS moves
 FROM totals x
 LEFT JOIN public.qwiz_arcade_memory_players mp ON mp.room_id=p_room AND mp.card_position=p_position AND mp.team_id=x.team_id
 LEFT JOIN public.qwiz_arcade_runner_players rp ON rp.room_id=p_room AND rp.card_position=p_position AND rp.team_id=x.team_id
 )
 SELECT x.team_id,x.name,round(x.pts)::numeric,x.taps,x.players_active,x.members,
 row_number() OVER (ORDER BY x.pts DESC,CASE WHEN x.mode='captain' THEN x.moves ELSE 0 END ASC,x.position)::int
 FROM scores x ORDER BY x.pts DESC,CASE WHEN x.mode='captain' THEN x.moves ELSE 0 END ASC,x.position;
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
     then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180)))
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
       then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180)))
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
  if p_action='finish' then delete from public.qwiz_room_pauses where room_id=p_room;
  elsif exists(select 1 from public.qwiz_room_pauses where room_id=p_room) then raise exception 'Сначала продолжите игру';end if;
  if p_action='next' and r.phase='intermission' and exists(select 1 from public.qwiz_room_activity activity_lookup where activity_lookup.room_id=p_room and activity_lookup.settings ? 'arcade_mode') then
    IF public.qwiz_bonus_eligible(p_room,(SELECT card_position FROM public.qwiz_room_activity WHERE room_id=p_room))
      AND clock_timestamp()<(
       SELECT v.started_at+make_interval(secs=>public.qwiz_arcade_duration(activity_vote.settings,activity_vote.settings->>'arcade_mode')+public.qwiz_bonus_window(p_room,activity_vote.card_position))
       FROM public.qwiz_arcade_runs v JOIN public.qwiz_room_activity activity_vote
        ON activity_vote.room_id=v.room_id AND activity_vote.card_position=v.card_position WHERE v.room_id=p_room)
      AND NOT public.qwiz_bonus_vote_complete(p_room,(SELECT card_position FROM public.qwiz_room_activity WHERE room_id=p_room))
    THEN RAISE EXCEPTION 'Подождите: идёт командное голосование (не более 15 секунд)';END IF;
    perform public.qwiz_boost_lock(p_room);
  end if;
  return jsonb_build_object('phase',public.org_next_advance(p_room,p_action),'paused',false);
 end if;
 raise exception 'Неизвестное действие';
end $function$
;
