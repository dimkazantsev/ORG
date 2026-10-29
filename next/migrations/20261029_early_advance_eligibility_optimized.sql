-- Performance followup to early-advance. Keep the same server-side behaviour,
-- avoid duplicate per-player eligibility function calls for 40 students.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.qwiz_stage_everyone_done(p_room uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE r public.org_next_rooms%rowtype;
 a public.qwiz_room_activity%rowtype;
 ar public.qwiz_arcade_runs%rowtype;
 eligible int; answered int;
BEGIN
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 IF NOT FOUND OR public.qwiz_party_paused(p_room) THEN RETURN false; END IF;
 IF r.phase='question' THEN
   -- The common case (nobody has answered yet) avoids 40 eligibility checks.
   IF NOT EXISTS(SELECT 1 FROM public.org_next_answers ans
      WHERE ans.room_id=p_room AND ans.question_index=r.question_index) THEN RETURN false; END IF;
   -- Evaluate eligibility once per player, not twice per polling viewer.
   WITH eligible_players AS MATERIALIZED (
     SELECT p.id FROM public.org_next_players p
      WHERE p.room_id=p_room AND p.team_id IS NOT NULL
       AND public.qwiz_answer_eligible(p_room,p.id,r.question_index))
   SELECT count(*)::int,count(ans.player_id)::int INTO eligible,answered
   FROM eligible_players ep
   LEFT JOIN public.org_next_answers ans ON ans.room_id=p_room
     AND ans.question_index=r.question_index AND ans.player_id=ep.id;
   RETURN eligible>0 AND eligible=answered;
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
END $function$

REVOKE EXECUTE ON FUNCTION public.qwiz_stage_everyone_done(uuid) FROM PUBLIC, anon, authenticated;
COMMIT;
