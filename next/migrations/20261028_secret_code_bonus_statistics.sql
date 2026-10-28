-- Bonus editor and per-player/per-team statistics for Secret Code
-- qwiz_bonus_eligible
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
   AND r.points>=greatest(1,least(200,coalesce((card->'settings'->>'bonus_min_points')::integer,1))) AND (other_points IS NULL OR (v.mode='blitz' AND r.points>=other_points OR v.mode<>'blitz' AND r.points-other_points>=gap))
   AND (v.mode IN ('blitz','captain') AND r.active>=1
        OR v.mode IN ('rocket','tug','sequence_memory') AND r.active*100>=pct*greatest(r.members,1));
END $function$;

-- qwiz_teacher_bonus_rules
CREATE OR REPLACE FUNCTION public.qwiz_teacher_bonus_rules(p_action text, p_build uuid, p_card uuid DEFAULT NULL::uuid, p_settings jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_user uuid := (SELECT auth.uid());
 v_mode text;
 v_percent integer;
 v_gap integer;
 v_min integer;
 v_vote integer;
 v_reward integer;
BEGIN
 IF v_user IS NULL OR NOT public.org_quiz_is_admin_check() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.qwiz_builds b WHERE b.id=p_build AND b.owner_id=v_user)
 THEN RAISE EXCEPTION 'Сборка недоступна'; END IF;
 IF p_action='save' THEN
  SELECT c.settings->>'arcade_mode' INTO v_mode
  FROM public.qwiz_build_cards c WHERE c.build_id=p_build AND c.id=p_card FOR UPDATE;
  IF NOT FOUND OR v_mode NOT IN ('tug','blitz','captain','sequence_memory')
  THEN RAISE EXCEPTION 'Действующая мини-игра не найдена'; END IF;
  IF jsonb_typeof(p_settings) <> 'object'
   OR jsonb_typeof(p_settings->'bonus_percent') <> 'number'
   OR jsonb_typeof(p_settings->'bonus_lead') <> 'number'
   OR (p_settings ? 'arcade_score_points' AND jsonb_typeof(p_settings->'arcade_score_points') <> 'number')
   OR jsonb_typeof(p_settings->'bonus_min_points') <> 'number'
   OR NOT (p_settings ? 'bonus_vote_seconds')
   OR jsonb_typeof(p_settings->'bonus_vote_seconds') NOT IN ('number','null')
  THEN RAISE EXCEPTION 'Некорректные настройки бонуса'; END IF;
  v_percent := (p_settings->>'bonus_percent')::integer;
  v_gap := (p_settings->>'bonus_lead')::integer;
  v_min := (p_settings->>'bonus_min_points')::integer;
  v_vote := (p_settings->>'bonus_vote_seconds')::integer;
  v_reward := CASE WHEN p_settings ? 'arcade_score_points'
   THEN (p_settings->>'arcade_score_points')::integer
   ELSE (SELECT (c.settings->>'arcade_score_points')::integer
         FROM public.qwiz_build_cards c WHERE c.id=p_card AND c.build_id=p_build)
   END;
  v_reward := coalesce(v_reward,CASE WHEN v_mode='blitz' THEN 10 ELSE 15 END);
  IF v_reward NOT BETWEEN 0 AND 200 OR (v_mode='blitz' AND v_reward>10) OR v_percent NOT BETWEEN 50 AND 100 OR v_gap NOT BETWEEN 0 AND 200
   OR v_min NOT BETWEEN 1 AND 200
   OR (v_mode IN ('blitz','sequence_memory') AND v_min>10)
   OR (v_vote IS NOT NULL AND v_vote NOT BETWEEN 18 AND 24)
  THEN RAISE EXCEPTION 'Значения вне допустимых границ'; END IF;
  UPDATE public.qwiz_build_cards c
  SET settings=(coalesce(c.settings,'{}'::jsonb)-'bonus_vote_seconds')
    || jsonb_build_object('arcade_score_points',v_reward,'bonus_percent',v_percent,'bonus_lead',v_gap,'bonus_min_points',v_min)
    || CASE WHEN v_vote IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('bonus_vote_seconds',v_vote) END
  WHERE c.id=p_card AND c.build_id=p_build;
  UPDATE public.qwiz_builds SET updated_at=clock_timestamp() WHERE id=p_build AND owner_id=v_user;
 ELSIF p_action<>'list' THEN
  RAISE EXCEPTION 'Неизвестное действие';
 END IF;
 RETURN jsonb_build_object('cards',coalesce((
  SELECT jsonb_agg(jsonb_build_object(
   'id',c.id,'title',c.title,'position',c.position,
   'mode',c.settings->>'arcade_mode',
   'arcade_score_points',greatest(0,least(CASE WHEN c.settings->>'arcade_mode'='blitz' THEN 10 ELSE 200 END,coalesce((c.settings->>'arcade_score_points')::integer,
      CASE WHEN c.settings->>'arcade_mode'='blitz' THEN 10 ELSE 15 END))),
   'bonus_percent',greatest(50,least(100,coalesce((c.settings->>'bonus_percent')::integer,70))),
   'bonus_lead',greatest(0,least(200,coalesce((c.settings->>'bonus_lead')::integer,15))),
   'bonus_min_points',greatest(1,least(200,coalesce((c.settings->>'bonus_min_points')::integer,1))),
   'bonus_vote_seconds',nullif(c.settings->>'bonus_vote_seconds','')::integer
  ) ORDER BY c.position)
  FROM public.qwiz_build_cards c WHERE c.build_id=p_build
   AND c.settings->>'arcade_mode' IN ('tug','blitz','captain','sequence_memory')
 ),'[]'::jsonb));
END $function$;

-- qwiz_round_results
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
 coalesce((SELECT CASE WHEN (ar.option_order->>cv.choice)::int=(q.solution->>'correct')::int
    THEN coalesce((SELECT greatest(0,least(10,(rb.timeline->p_card->'settings'->>'arcade_score_points')::integer))
           FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room),10) ELSE 0 END
    FROM public.qwiz_consensus_votes cv
    JOIN public.qwiz_arcade_runs ar ON ar.room_id=cv.room_id AND ar.card_position=cv.card_position
    JOIN public.qwiz_bank q ON q.id=ar.question_id
    WHERE cv.room_id=p_room AND cv.card_position=p_card AND cv.player_id=p.id),0)::int consensus_points,
 coalesce((SELECT sc.points FROM public.qwiz_secret_code_answers sc WHERE sc.room_id=p_room AND sc.card_position=p_card AND sc.player_id=p.id),0)::int secret_points,
 coalesce((SELECT sc.exact FROM public.qwiz_secret_code_answers sc WHERE sc.room_id=p_room AND sc.card_position=p_card AND sc.player_id=p.id),0)::int secret_exact,
 count(a.player_id)::int answers,count(*) FILTER(WHERE a.correct)::int correct
 FROM public.org_next_players p LEFT JOIN answers a ON a.player_id=p.id WHERE p.room_id=p_room
 GROUP BY p.id,p.name,p.team_id
), team_scores AS (
 SELECT t.id,t.name,t.score AS total_score,
 coalesce(sum(p.question_points),0)::int question_points,coalesce(sum(p.map_points),0)::int map_points,
 coalesce((SELECT ar.points FROM public.qwiz_arcade_rank(p_room,p_card) ar WHERE ar.team_id=t.id),0)::numeric arcade_points,
 coalesce((SELECT CASE WHEN ar.winner_team=t.id THEN greatest(0,least(200,coalesce(
    (rb.timeline->p_card->'settings'->>'arcade_score_points')::integer,0))) ELSE 0 END
    FROM public.qwiz_arcade_runs ar JOIN public.qwiz_room_builds rb ON rb.room_id=ar.room_id
    WHERE ar.room_id=p_room AND ar.card_position=p_card),0)::int win_points,
 coalesce((SELECT CASE WHEN
  public.qwiz_consensus_choice(p_room,p_card,t.id) IS NOT NULL
  AND (ar.option_order->>public.qwiz_consensus_choice(p_room,p_card,t.id))::int=(q.solution->>'correct')::int
  THEN coalesce((SELECT greatest(0,least(10,(rb.timeline->p_card->'settings'->>'arcade_score_points')::integer))
      FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room),10) ELSE 0 END FROM public.qwiz_arcade_runs ar
  JOIN public.qwiz_bank q ON q.id=ar.question_id
  WHERE ar.room_id=p_room AND ar.card_position=p_card AND ar.mode='blitz'),0)::int blitz_points,
 coalesce((SELECT count(*) FROM public.qwiz_consensus_votes cv WHERE cv.room_id=p_room AND cv.card_position=p_card AND cv.team_id=t.id),0)::int consensus_votes_count,
 coalesce(sum(p.taps),0)::int taps,coalesce(sum(p.answers),0)::int answers,coalesce(sum(p.correct),0)::int correct
 FROM public.org_next_teams t LEFT JOIN player_scores p ON p.team_id=t.id WHERE t.room_id=p_room GROUP BY t.id,t.name,t.score
), info AS (SELECT coalesce((SELECT mode FROM card),'') mode)
SELECT jsonb_build_object('mode',info.mode,
 'team_unit',case when info.mode in ('tug','captain','blitz','sequence_memory') then 'баллы рейтинга' else 'баллы за вопросы' end,
 'player_unit','баллы за вопросы',
 'metric_unit',case info.mode when 'tug' then 'нажатия' when 'rocket' then 'препятствия' when 'captain' then 'результат мэмори' when 'blitz' then 'голосов' when 'sequence_memory' then 'средний балл' else null end,
 'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode='blitz' then blitz_points
    when info.mode in ('tug','captain','sequence_memory') then win_points
    when info.mode='rocket' then 0
    else question_points end,'metric',case when info.mode='blitz' then consensus_votes_count when info.mode in ('rocket','tug','captain','sequence_memory') then arcade_points else null end,'total_score',total_score,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points::numeric
 when info.mode='blitz' then blitz_points::numeric when info.mode in ('rocket','tug','captain','sequence_memory') then arcade_points else question_points::numeric end) DESC,name)
 FROM team_scores),'[]'::jsonb),
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nickname',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode='blitz' then consensus_points
    when info.mode='sequence_memory' then secret_points
    when info.mode in ('rocket','tug','captain') then 0
    else question_points end,'metric',case when info.mode='sequence_memory' then secret_exact
    when info.mode='captain' then memory_points when info.mode in ('rocket','tug') then taps else null end,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points
 when info.mode='sequence_memory' then secret_exact
    when info.mode='captain' then memory_points
 when info.mode='blitz' then consensus_points when info.mode in ('rocket','tug') then taps when info.mode='sequence_memory' then secret_points else question_points end) DESC,name)
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
$function$;
