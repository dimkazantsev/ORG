-- Finish early only when every eligible participant has completed a finite task.
-- Mode 'tug' is continuous tapping and remains timer-based.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.qwiz_stage_everyone_done(p_room uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $stage$
DECLARE r public.org_next_rooms%rowtype;
 a public.qwiz_room_activity%rowtype;
 ar public.qwiz_arcade_runs%rowtype;
 eligible int;
BEGIN
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 IF NOT FOUND OR public.qwiz_party_paused(p_room) THEN RETURN false; END IF;
 IF r.phase='question' THEN
   SELECT count(*) INTO eligible FROM public.org_next_players p
   WHERE p.room_id=p_room AND p.team_id IS NOT NULL
     AND public.qwiz_answer_eligible(p_room,p.id,r.question_index);
   IF eligible<1 THEN RETURN false; END IF;
   RETURN NOT EXISTS(
    SELECT 1 FROM public.org_next_players p
    WHERE p.room_id=p_room AND p.team_id IS NOT NULL
      AND public.qwiz_answer_eligible(p_room,p.id,r.question_index)
      AND NOT EXISTS(SELECT 1 FROM public.org_next_answers ans
       WHERE ans.room_id=p_room AND ans.question_index=r.question_index
        AND ans.player_id=p.id));
 END IF;
 IF r.phase<>'intermission' THEN RETURN false; END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room;
 IF NOT FOUND OR a.kind IN ('card_intro','round_stats') THEN RETURN false; END IF;
 IF a.settings->>'arcade_mode'='russia_map' THEN
   SELECT count(*) INTO eligible FROM public.org_next_players p
    WHERE p.room_id=p_room AND p.team_id IS NOT NULL AND p.joined_at<=a.entered_at;
   IF eligible<1 THEN RETURN false; END IF;
   RETURN NOT EXISTS(SELECT 1 FROM public.org_next_players p
    WHERE p.room_id=p_room AND p.team_id IS NOT NULL AND p.joined_at<=a.entered_at
      AND NOT EXISTS(SELECT 1 FROM public.qwiz_geo_runs g
       WHERE g.room_id=p_room AND g.card_position=a.card_position
        AND g.player_id=p.id AND jsonb_array_length(g.tasks)>0
        AND g.current_index>=jsonb_array_length(g.tasks)));
 END IF;
 SELECT * INTO ar FROM public.qwiz_arcade_runs x
 WHERE x.room_id=p_room AND x.card_position=a.card_position;
 IF NOT FOUND THEN RETURN false; END IF;
 IF ar.awarded_at IS NOT NULL THEN RETURN true; END IF;
 IF ar.mode='sequence_memory' THEN
   SELECT count(*) INTO eligible FROM public.org_next_players p
    WHERE p.room_id=p_room AND p.team_id IS NOT NULL AND p.joined_at<=ar.started_at;
   IF eligible<1 THEN RETURN false; END IF;
   RETURN NOT EXISTS(SELECT 1 FROM public.org_next_players p
    WHERE p.room_id=p_room AND p.team_id IS NOT NULL AND p.joined_at<=ar.started_at
      AND NOT EXISTS(SELECT 1 FROM public.qwiz_secret_code_answers ans
       WHERE ans.room_id=p_room AND ans.card_position=a.card_position AND ans.player_id=p.id));
 ELSIF ar.mode IN ('captain','blitz','rocket') THEN
   SELECT count(*) INTO eligible FROM public.org_next_teams tm
    WHERE tm.room_id=p_room AND EXISTS(SELECT 1 FROM public.org_next_players p
     WHERE p.room_id=p_room AND p.team_id=tm.id AND p.joined_at<=ar.started_at);
   IF eligible<1 THEN RETURN false; END IF;
   IF ar.mode='captain' THEN
     RETURN NOT EXISTS(SELECT 1 FROM public.org_next_teams tm
      WHERE tm.room_id=p_room AND EXISTS(SELECT 1 FROM public.org_next_players p
       WHERE p.room_id=p_room AND p.team_id=tm.id AND p.joined_at<=ar.started_at)
      AND NOT EXISTS(SELECT 1 FROM public.qwiz_arcade_memory_players m
       WHERE m.room_id=p_room AND m.card_position=a.card_position
        AND m.team_id=tm.id AND m.completed_at IS NOT NULL));
   ELSIF ar.mode='blitz' THEN
     RETURN NOT EXISTS(SELECT 1 FROM public.org_next_teams tm
      WHERE tm.room_id=p_room AND EXISTS(SELECT 1 FROM public.org_next_players p
       WHERE p.room_id=p_room AND p.team_id=tm.id AND p.joined_at<=ar.started_at)
      AND NOT EXISTS(SELECT 1 FROM public.qwiz_consensus_decisions d
       WHERE d.room_id=p_room AND d.card_position=a.card_position AND d.team_id=tm.id));
   ELSE
     RETURN NOT EXISTS(SELECT 1 FROM public.org_next_teams tm
      WHERE tm.room_id=p_room AND EXISTS(SELECT 1 FROM public.org_next_players p
       WHERE p.room_id=p_room AND p.team_id=tm.id AND p.joined_at<=ar.started_at)
      AND NOT EXISTS(SELECT 1 FROM public.qwiz_arcade_runner_players rp
       WHERE rp.room_id=p_room AND rp.card_position=a.card_position
         AND rp.team_id=tm.id AND rp.eliminated_at IS NOT NULL));
   END IF;
 END IF;
 RETURN false;
END $stage$;
REVOKE ALL ON FUNCTION public.qwiz_stage_everyone_done(uuid) FROM PUBLIC;

-- The bonus opens at actual finalization, not the original deadline.
-- Original arcade started_at is never modified (protects rank/timing).
CREATE OR REPLACE FUNCTION public.qwiz_arcade_vote_start(p_room uuid,p_card integer)
 RETURNS timestamptz LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $vote$
 SELECT least(ar.started_at+
  make_interval(secs=>public.qwiz_arcade_duration(a.settings,ar.mode)),
  coalesce(ar.awarded_at,'infinity'::timestamptz))
 FROM public.qwiz_arcade_runs ar
 JOIN public.qwiz_room_activity a
  ON a.room_id=ar.room_id AND a.card_position=ar.card_position
 WHERE ar.room_id=p_room AND ar.card_position=p_card
$vote$;
REVOKE ALL ON FUNCTION public.qwiz_arcade_vote_start(uuid,integer) FROM PUBLIC;

-- Make targeted edits to the deployed definitions and verify every anchor.
-- This avoids overwriting unrelated quiz fixes and preserves function grants.
DO $rewrite$
DECLARE f text; nam text; x text; y text; pattern_count int;
BEGIN
 FOR nam IN SELECT unnest(ARRAY['qwiz_tick','qwiz_boost_view','qwiz_vote_boost']) LOOP
   SELECT pg_get_functiondef(p.oid) INTO f FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=nam;
   IF f IS NULL THEN RAISE EXCEPTION 'Missing function %',nam; END IF;
   IF nam='qwiz_tick' THEN
     x := $old$     -- Never advance any arcade card before its full playable window expires.
     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
     if clock_timestamp()>=a.entered_at+make_interval(secs=>stage_seconds) then
       perform public.qwiz_arcade_finalize(r.id,a.card_position);
     end if;
     if public.qwiz_bonus_eligible(r.id,a.card_position) AND
      clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds+public.qwiz_bonus_window(r.id,a.card_position))
      AND NOT public.qwiz_bonus_vote_complete(r.id,a.card_position)
     then return false;end if;$old$;
     y := $new$     -- Skip the remaining time only after every eligible action is finished.
     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds)
       and not public.qwiz_stage_everyone_done(r.id) then return false;end if;
     -- Already awarded rounds can wait for bonus voting without room writes.
     if exists(select 1 from public.qwiz_arcade_runs ar
       where ar.room_id=r.id and ar.card_position=a.card_position
        and ar.awarded_at IS NOT NULL)
       and public.qwiz_bonus_eligible(r.id,a.card_position)
       and clock_timestamp()<public.qwiz_arcade_vote_start(r.id,a.card_position)
         +make_interval(secs=>public.qwiz_bonus_window(r.id,a.card_position))
       and not public.qwiz_bonus_vote_complete(r.id,a.card_position)
     then return false;end if;$new$;
     IF strpos(f,x)=0 THEN RAISE EXCEPTION 'Original tick arcade gate not found';END IF;
     f:=replace(f,x,y);
     x := $old$     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
     if public.qwiz_bonus_eligible(r.id,a.card_position) AND
       clock_timestamp()<a.entered_at+make_interval(secs=>public.qwiz_arcade_duration(a.settings,a.settings->>'arcade_mode')+public.qwiz_bonus_window(r.id,a.card_position))
       AND NOT public.qwiz_bonus_vote_complete(r.id,a.card_position)
      then return false;end if;
      perform public.qwiz_boost_lock(r.id);$old$;
     y := $new$     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds)
       and not public.qwiz_stage_everyone_done(r.id) then return false;end if;
     perform public.qwiz_arcade_finalize(r.id,a.card_position);
     if public.qwiz_bonus_eligible(r.id,a.card_position) AND
       clock_timestamp()<public.qwiz_arcade_vote_start(r.id,a.card_position)
         +make_interval(secs=>public.qwiz_bonus_window(r.id,a.card_position))
       AND NOT public.qwiz_bonus_vote_complete(r.id,a.card_position)
      then return false;end if;
     perform public.qwiz_boost_lock(r.id);$new$;
     IF strpos(f,x)=0 THEN RAISE EXCEPTION 'Original tick locked arcade gate not found';END IF;
     f:=replace(f,x,y);
     x:='if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;';
     y:='if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) and not public.qwiz_stage_everyone_done(r.id) then return false;end if;';
     IF strpos(f,x)=0 THEN RAISE EXCEPTION 'Original non-arcade stage gate not found';END IF;
     f:=replace(f,x,y);
     x:='if r.ends_at is null or r.ends_at>clock_timestamp() then return false;end if;';
     y:='if r.ends_at is null or (r.ends_at>clock_timestamp() and not (r.phase=''question'' and public.qwiz_stage_everyone_done(r.id))) then return false;end if;';
     IF strpos(f,x)=0 THEN RAISE EXCEPTION 'Original question gate not found';END IF;
     f:=replace(f,x,y);
     x:='if r.ends_at is null or r.ends_at>clock_timestamp() or r.phase not in (''countdown'',''question'',''result'') or public.qwiz_party_paused(r.id) then return false;end if;';
     y:='if r.ends_at is null or (r.ends_at>clock_timestamp() and not (r.phase=''question'' and public.qwiz_stage_everyone_done(r.id))) or r.phase not in (''countdown'',''question'',''result'') or public.qwiz_party_paused(r.id) then return false;end if;';
     IF strpos(f,x)=0 THEN RAISE EXCEPTION 'Original locked question gate not found';END IF;
     f:=replace(f,x,y);
   ELSIF nam='qwiz_boost_view' THEN
     x:='elapsed:=extract(epoch FROM clock_timestamp()-v.started_at)-seconds;';
     y:='elapsed:=extract(epoch FROM clock_timestamp()-public.qwiz_arcade_vote_start(r.id,a.card_position));';
     IF strpos(f,x)=0 THEN RAISE EXCEPTION 'Original boost-view elapsed missing';END IF;
     f:=replace(f,x,y);
     x:='phase_ends:=v.started_at+make_interval(secs=>seconds+CASE WHEN stage=''strategy'' THEN first_window ELSE vote_window END);';
     y:='phase_ends:=public.qwiz_arcade_vote_start(r.id,a.card_position)+make_interval(secs=>CASE WHEN stage=''strategy'' THEN first_window ELSE vote_window END);';
     IF strpos(f,x)=0 THEN RAISE EXCEPTION 'Original boost-view phase-end missing';END IF;
     f:=replace(f,x,y);
     x:='''full_vote_ends_at'',v.started_at+make_interval(secs=>seconds+vote_window)';
     y:='''full_vote_ends_at'',public.qwiz_arcade_vote_start(r.id,a.card_position)+make_interval(secs=>vote_window)';
     IF strpos(f,x)=0 THEN RAISE EXCEPTION 'Original boost-view full-end missing';END IF;
     f:=replace(f,x,y);
   ELSIF nam='qwiz_vote_boost' THEN
     x:='elapsed:=extract(epoch FROM clock_timestamp()-v.started_at)-seconds;';
     y:='elapsed:=extract(epoch FROM clock_timestamp()-public.qwiz_arcade_vote_start(p_room,a.card_position));';
     IF strpos(f,x)=0 THEN RAISE EXCEPTION 'Original vote elapsed missing';END IF;
     f:=replace(f,x,y);
   END IF;
   EXECUTE f;
 END LOOP;
END $rewrite$;
COMMIT;
