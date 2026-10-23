-- Map exercise remains live for configured 45-600 seconds, without changing arcade round handling.
CREATE OR REPLACE FUNCTION public.qwiz_tick(p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype; q jsonb; secs int;
 a public.qwiz_room_activity%rowtype; stage_seconds int;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then return false;end if;
 -- Most of the 40 simultaneous viewers only READ; do not acquire a write lock on every poll.
 select * into r from public.org_next_rooms where code=p_code;
 if not found or r.phase in ('lobby','finished') or public.qwiz_party_paused(r.id) then return false;end if;
 if r.phase='intermission' then
   select * into a from public.qwiz_room_activity where room_id=r.id;
   if not found then return false;end if;
   if a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain') then
     stage_seconds:=greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)));
     if clock_timestamp()>=a.entered_at+make_interval(secs=>stage_seconds) then
       perform public.qwiz_arcade_finalize(r.id,a.card_position);
     end if;
     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds+15) then return false;end if;
   else
     stage_seconds:=case when a.settings->>'arcade_mode'='russia_map' then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180))) else case a.kind when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
   end if;
   select * into r from public.org_next_rooms where id=r.id for update;
   if r.phase<>'intermission' or public.qwiz_party_paused(r.id) then return false;end if;
   select * into a from public.qwiz_room_activity where room_id=r.id;
   if not found then return false;end if;
   if a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain') then
      if clock_timestamp()<a.entered_at+make_interval(secs=>greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)))+15) then return false;end if;
      perform public.qwiz_boost_lock(r.id);
   else
      stage_seconds:=case when a.settings->>'arcade_mode'='russia_map' then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180))) else case a.kind when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
      if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
   end if;
   perform public.qwiz_advance_room(r.id,'next');
   return true;
 end if;
 if r.ends_at is null or r.ends_at>clock_timestamp() then return false;end if;
 select * into r from public.org_next_rooms where id=r.id for update;
 if r.ends_at is null or r.ends_at>clock_timestamp() or r.phase not in ('countdown','question','result') or public.qwiz_party_paused(r.id) then return false;end if;
 if r.phase='countdown' then
  select x.questions->r.question_index into q from public.org_next_quizzes x where x.id=r.quiz_id;
  secs:=greatest(10,least(120,coalesce((q->>'duration')::int,30)));
  update public.org_next_rooms set phase='question',ends_at=clock_timestamp()+make_interval(secs=>secs) where id=r.id;
 elsif r.phase='question' then perform public.qwiz_advance_room(r.id,'reveal');
 elsif r.phase='result' then perform public.qwiz_advance_room(r.id,'next');
 end if;
 return true;
end $function$
;
