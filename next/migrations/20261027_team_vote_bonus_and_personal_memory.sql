-- Two-stage majority team vote, visible earned effects, and correct captain personal score.
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
 RETURN r.team_id IS NOT NULL
   AND r.points>=25 AND (other_points IS NULL OR r.points-other_points>=gap)
   AND (v.mode IN ('blitz','captain') AND r.active>=1
        OR v.mode IN ('rocket','tug') AND r.active*100>=pct*greatest(r.members,1));
END $function$
;

CREATE OR REPLACE FUNCTION public.qwiz_round_results(p_room uuid, p_card integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH card AS (
 SELECT coalesce(rb.timeline->p_card->'settings'->>'arcade_mode','') mode
 FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room
), room_questions AS (
 SELECT q.questions FROM public.org_next_rooms rm JOIN public.org_next_quizzes q ON q.id=rm.quiz_id WHERE rm.id=p_room
), answers AS (
 SELECT a.player_id,p.team_id,a.points,a.correct FROM public.org_next_answers a
 JOIN public.org_next_players p ON p.id=a.player_id AND p.room_id=a.room_id CROSS JOIN room_questions rq
 WHERE a.room_id=p_room AND coalesce((rq.questions->a.question_index->>'round_index')::int,0)=p_card
), player_scores AS (
 SELECT p.id,p.name,p.team_id,coalesce(sum(a.points),0)::int question_points,
 coalesce((SELECT g.score FROM public.qwiz_geo_runs g WHERE g.room_id=p_room AND g.player_id=p.id AND g.card_position=p_card),0)::int map_points,
 coalesce((SELECT c.clicks FROM public.qwiz_arcade_clicks c WHERE c.room_id=p_room AND c.player_id=p.id AND c.card_position=p_card),0)::int taps,
 coalesce((SELECT round(rank.points)::int
    FROM public.qwiz_arcade_memory_players mp JOIN public.qwiz_arcade_rank(p_room,p_card) rank
     ON rank.team_id=mp.team_id
    WHERE mp.room_id=p_room AND mp.card_position=p_card AND mp.player_id=p.id
    LIMIT 1),0)::int memory_points,
 count(a.player_id)::int answers,count(*) FILTER(WHERE a.correct)::int correct
 FROM public.org_next_players p LEFT JOIN answers a ON a.player_id=p.id WHERE p.room_id=p_room
 GROUP BY p.id,p.name,p.team_id
), team_scores AS (
 SELECT t.id,t.name,t.score AS total_score,
 coalesce(sum(p.question_points),0)::int question_points,coalesce(sum(p.map_points),0)::int map_points,
 coalesce((SELECT ar.points FROM public.qwiz_arcade_rank(p_room,p_card) ar WHERE ar.team_id=t.id),0)::numeric arcade_points,
 coalesce(sum(p.taps),0)::int taps,coalesce(sum(p.answers),0)::int answers,coalesce(sum(p.correct),0)::int correct
 FROM public.org_next_teams t LEFT JOIN player_scores p ON p.team_id=t.id WHERE t.room_id=p_room GROUP BY t.id,t.name,t.score
), info AS (SELECT coalesce((SELECT mode FROM card),'') mode)
SELECT jsonb_build_object('mode',info.mode,
 'team_unit',case when info.mode in ('rocket','blitz','tug','captain') then 'очки игры' else 'баллы раунда' end,
 'player_unit',case when info.mode='captain' then 'очки игры' when info.mode in ('rocket','blitz','tug') then 'нажатия' else 'баллы раунда' end,
 'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode in ('rocket','blitz','tug','captain') then arcade_points
    else question_points end,'total_score',total_score,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points::numeric
 when info.mode in ('rocket','blitz','tug','captain') then arcade_points else question_points::numeric end) DESC,name)
 FROM team_scores),'[]'::jsonb),
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nickname',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode='captain' then memory_points
    when info.mode in ('rocket','blitz','tug') then taps
    else question_points end,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points
 when info.mode='captain' then memory_points
 when info.mode in ('rocket','blitz','tug') then taps else question_points end) DESC,name)
 FROM player_scores),'[]'::jsonb),
 'reward',(SELECT jsonb_build_object('choice',b.choice,'target',t.name,
 'tone',case when b.choice in ('fog','storm','drain') then 'harm' else 'boost' end,
 'title',case b.choice when 'headstart' then 'Фора +12'
  when 'teamwork' then 'Командный рывок'
  when 'momentum' then 'Импульс'
  when 'fog' then 'Туман соперника'
  when 'storm' then 'Штормовой заслон'
  when 'drain' then 'Энергетический отток'
  else 'Командное преимущество' end,
 'pending',b.applied_at is null)
 FROM public.qwiz_round_boosts b JOIN public.org_next_teams t ON t.id=b.team_id
 WHERE b.room_id=p_room AND b.card_position=p_card ORDER BY b.team_id LIMIT 1))
FROM info;
$function$
;

CREATE OR REPLACE FUNCTION public.qwiz_team_effect_history(p_room uuid,p_host boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'team_id',b.team_id,'choice',b.choice,'points_awarded',b.points_awarded,
  'applied_at',b.applied_at,'round_index',b.round_index,'card_position',b.card_position
 ) ORDER BY b.card_position),'[]'::jsonb)
 FROM public.qwiz_round_boosts b
 WHERE b.room_id=p_room AND (
   p_host OR b.team_id IN (
    SELECT pl.team_id FROM public.org_next_players pl
    WHERE pl.room_id=p_room AND (
      pl.user_id=(SELECT auth.uid()) OR EXISTS (
       SELECT 1 FROM public.qwiz_player_device_access d
       WHERE d.room_id=p_room AND d.player_id=pl.id AND d.user_id=(SELECT auth.uid())
      )
    )
   )
 );
$$;

CREATE OR REPLACE FUNCTION public.qwiz_vote_boost(p_room uuid, p_choice text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.org_next_rooms%rowtype;a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype;p public.org_next_players%rowtype;
 seconds integer;elapsed numeric;stage text;strategy text;vote_window integer;first_window integer;members integer;strategy_votes integer;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Войдите в игру';END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 IF NOT FOUND OR r.phase<>'intermission' THEN RAISE EXCEPTION 'Голосование завершено';END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=a.card_position;
 IF NOT FOUND THEN RAISE EXCEPTION 'Нет соревнования';END IF;
 seconds:=public.qwiz_arcade_duration(a.settings,a.settings->>'arcade_mode');
 elapsed:=extract(epoch FROM clock_timestamp()-v.started_at)-seconds;
 vote_window:=public.qwiz_bonus_window(p_room,a.card_position);
 first_window:=ceil(vote_window*0.46)::integer;
 IF elapsed<0 OR elapsed>=vote_window OR NOT public.qwiz_bonus_eligible(p_room,a.card_position) THEN
   RAISE EXCEPTION 'Сейчас нельзя голосовать';END IF;
 strategy:=public.qwiz_bonus_strategy(p_room,a.card_position);
 SELECT count(*) INTO members FROM public.org_next_players WHERE room_id=p_room AND team_id=v.winner_team;
 SELECT count(*) INTO strategy_votes FROM public.qwiz_bonus_ballots WHERE room_id=p_room
   AND card_position=a.card_position AND team_id=v.winner_team AND vote_phase='strategy';
 stage:=CASE WHEN elapsed>=first_window OR
  (strategy IS NOT NULL AND strategy_votes>=members AND members>0) THEN 'option' ELSE 'strategy' END;
 IF stage='strategy' AND p_choice NOT IN ('support','sabotage') THEN RAISE EXCEPTION 'Сначала выберите стратегию';END IF;
 IF stage='option' AND (strategy IS NULL OR
  (strategy='support' AND p_choice NOT IN ('headstart','teamwork','momentum')) OR
  (strategy='sabotage' AND p_choice NOT IN ('fog','storm','drain')))
 THEN RAISE EXCEPTION 'Нужно выбрать вариант одобренной стратегии';END IF;
 IF stage='strategy' AND p_choice='sabotage' AND NOT EXISTS(
   SELECT 1 FROM public.org_next_teams other_team
   WHERE other_team.room_id=p_room AND other_team.id<>v.winner_team
 ) THEN RAISE EXCEPTION 'Нет команды-соперника: выберите усиление своей команды'; END IF;
 SELECT * INTO p FROM public.org_next_players x WHERE x.room_id=p_room AND
 (x.user_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.qwiz_player_device_access d
 WHERE d.room_id=p_room AND d.player_id=x.id AND d.user_id=(SELECT auth.uid()))) LIMIT 1;
 IF p.id IS NULL OR p.team_id IS DISTINCT FROM v.winner_team THEN RAISE EXCEPTION 'Голосует команда-победитель';END IF;
 INSERT INTO public.qwiz_bonus_ballots(room_id,card_position,team_id,player_id,vote_phase,choice)
 VALUES(p_room,a.card_position,p.team_id,p.id,stage,p_choice)
 ON CONFLICT(room_id,card_position,player_id,vote_phase) DO UPDATE SET choice=excluded.choice,voted_at=clock_timestamp();
 BEGIN PERFORM realtime.send(jsonb_build_object('changed',true),'phase','org-next-'||r.code,false); EXCEPTION WHEN OTHERS THEN NULL; END;
 RETURN jsonb_build_object('ok',true,'stage',stage,'choice',p_choice);
END $function$
;
