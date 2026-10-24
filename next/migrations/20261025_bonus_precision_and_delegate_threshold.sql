-- Non-destructive bonus eligibility and SQL variable disambiguation.
-- Only affects future awards; no history mutated.
CREATE OR REPLACE FUNCTION public.qwiz_bonus_eligible(p_room uuid, p_position integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v public.qwiz_arcade_runs%rowtype; r record; other_points numeric;
 pct integer; gap integer; card jsonb;
BEGIN
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=p_position;
 IF NOT FOUND OR v.winner_team IS NULL OR v.awarded_at IS NULL THEN RETURN false;END IF;
 SELECT rb.timeline->p_position INTO card FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room;
 pct:=greatest(50,least(100,coalesce((card->'settings'->>'bonus_percent')::int,70)));
 gap:=greatest(0,least(200,coalesce((card->'settings'->>'bonus_lead')::int,15)));
 SELECT * INTO r FROM public.qwiz_arcade_rank(p_room,p_position) a WHERE a.team_id=v.winner_team;
 SELECT max(a.points) INTO other_points FROM public.qwiz_arcade_rank(p_room,p_position) a WHERE a.team_id<>v.winner_team;
 -- Team-wide participation applies to tap games; blitz and captain games are played by one delegate.
 -- No award when there is no competing team with a measurable score.
 RETURN r.team_id IS NOT NULL AND other_points IS NOT NULL
   AND r.points>=25 AND r.points-other_points>=gap
   AND (v.mode IN ('blitz','captain') AND r.active>=1
        OR v.mode IN ('rocket','tug') AND r.active*100>=pct*greatest(r.members,1));
END $function$;

CREATE OR REPLACE FUNCTION public.qwiz_boost_lock(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.qwiz_room_activity%rowtype;v public.qwiz_arcade_runs%rowtype;
 r public.org_next_rooms%rowtype;tl jsonb;qs jsonb;target int;idx int;
 leader uuid;recipient uuid;chosen_effect text;strategy text;members int;votes int;
BEGIN
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room;
 IF NOT FOUND OR a.settings->>'arcade_mode' NOT IN ('rocket','blitz','tug','captain') THEN RETURN;END IF;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=a.card_position FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF;
 PERFORM public.qwiz_arcade_finalize(p_room,a.card_position);
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=a.card_position;
 IF v.winner_team IS NULL OR NOT public.qwiz_bonus_eligible(p_room,a.card_position)
 OR EXISTS(SELECT 1 FROM public.qwiz_round_boosts WHERE room_id=p_room AND card_position=a.card_position) THEN RETURN;END IF;
 SELECT count(*) INTO members FROM public.org_next_players WHERE room_id=p_room AND team_id=v.winner_team;
 strategy:=public.qwiz_bonus_strategy(p_room,a.card_position);
 IF strategy IS NULL THEN RETURN;END IF;
 SELECT ballot.choice,count(*) INTO chosen_effect,votes FROM public.qwiz_bonus_ballots AS ballot
 WHERE ballot.room_id=p_room AND ballot.card_position=a.card_position AND ballot.team_id=v.winner_team AND ballot.vote_phase='option'
 AND ((strategy='support' AND ballot.choice IN ('headstart','teamwork','momentum'))
 OR (strategy='sabotage' AND ballot.choice IN ('fog','storm','drain')))
 GROUP BY ballot.choice ORDER BY count(*) DESC,ballot.choice LIMIT 1;
 IF votes IS NULL OR votes<=members/2 THEN RETURN;END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 SELECT b.timeline,q.questions INTO tl,qs FROM public.qwiz_room_builds b
 JOIN public.org_next_quizzes q ON q.id=r.quiz_id WHERE b.room_id=p_room;
 IF tl IS NULL THEN RETURN;END IF;
 FOR idx IN a.card_position+1..jsonb_array_length(tl)-1 LOOP
 IF tl->idx->>'type'='round' AND coalesce(tl->idx->'settings'->>'arcade_mode','')<>'russia_map' THEN
 target:=coalesce((tl->idx->>'first_question')::int,r.question_index+1);EXIT;END IF; END LOOP;
 IF target IS NULL OR qs->target IS NULL THEN RETURN;END IF;
 recipient:=v.winner_team;
 IF strategy='sabotage' THEN
  SELECT team_id INTO recipient FROM public.qwiz_arcade_rank(p_room,a.card_position)
   WHERE team_id<>v.winner_team ORDER BY place LIMIT 1;
 END IF;
 IF recipient IS NULL THEN RETURN;END IF;
 INSERT INTO public.qwiz_round_boosts(room_id,card_position,team_id,choice,round_index)
 VALUES(p_room,a.card_position,recipient,chosen_effect,coalesce((qs->target->>'round_index')::int,0))
 ON CONFLICT DO NOTHING;
END $function$;
