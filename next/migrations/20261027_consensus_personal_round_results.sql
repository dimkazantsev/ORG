-- Show each participant's own 0–10 point vote separately from team 0–10 consensus verdict.
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
    THEN 10 ELSE 0 END
    FROM public.qwiz_consensus_votes cv
    JOIN public.qwiz_arcade_runs ar ON ar.room_id=cv.room_id AND ar.card_position=cv.card_position
    JOIN public.qwiz_bank q ON q.id=ar.question_id
    WHERE cv.room_id=p_room AND cv.card_position=p_card AND cv.player_id=p.id),0)::int consensus_points,
 count(a.player_id)::int answers,count(*) FILTER(WHERE a.correct)::int correct
 FROM public.org_next_players p LEFT JOIN answers a ON a.player_id=p.id WHERE p.room_id=p_room
 GROUP BY p.id,p.name,p.team_id
), team_scores AS (
 SELECT t.id,t.name,t.score AS total_score,
 coalesce(sum(p.question_points),0)::int question_points,coalesce(sum(p.map_points),0)::int map_points,
 coalesce((SELECT ar.points FROM public.qwiz_arcade_rank(p_room,p_card) ar WHERE ar.team_id=t.id),0)::numeric arcade_points,
 coalesce((SELECT CASE WHEN
  public.qwiz_consensus_choice(p_room,p_card,t.id) IS NOT NULL
  AND (ar.option_order->>public.qwiz_consensus_choice(p_room,p_card,t.id))::int=(q.solution->>'correct')::int
  THEN 10 ELSE 0 END FROM public.qwiz_arcade_runs ar
  JOIN public.qwiz_bank q ON q.id=ar.question_id
  WHERE ar.room_id=p_room AND ar.card_position=p_card AND ar.mode='blitz'),0)::int blitz_points,
 coalesce((SELECT count(*) FROM public.qwiz_consensus_votes cv WHERE cv.room_id=p_room AND cv.card_position=p_card AND cv.team_id=t.id),0)::int consensus_votes_count,
 coalesce(sum(p.taps),0)::int taps,coalesce(sum(p.answers),0)::int answers,coalesce(sum(p.correct),0)::int correct
 FROM public.org_next_teams t LEFT JOIN player_scores p ON p.team_id=t.id WHERE t.room_id=p_room GROUP BY t.id,t.name,t.score
), info AS (SELECT coalesce((SELECT mode FROM card),'') mode)
SELECT jsonb_build_object('mode',info.mode,
 'team_unit','баллы за вопросы',
 'player_unit','баллы за вопросы',
 'metric_unit',case info.mode when 'tug' then 'нажатия' when 'rocket' then 'препятствия' when 'captain' then 'результат мэмори' when 'blitz' then 'голосов' else null end,
 'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode='blitz' then blitz_points
    when info.mode in ('rocket','tug','captain') then 0
    else question_points end,'metric',case when info.mode='blitz' then consensus_votes_count when info.mode in ('rocket','tug','captain') then arcade_points else null end,'total_score',total_score,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points::numeric
 when info.mode='blitz' then blitz_points::numeric when info.mode in ('rocket','tug','captain') then arcade_points else question_points::numeric end) DESC,name)
 FROM team_scores),'[]'::jsonb),
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nickname',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode='blitz' then consensus_points
    when info.mode in ('rocket','tug','captain') then 0
    else question_points end,'metric',case when info.mode='captain' then memory_points when info.mode in ('rocket','tug') then taps else null end,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points
 when info.mode='captain' then memory_points
 when info.mode='blitz' then consensus_points when info.mode in ('rocket','tug') then taps else question_points end) DESC,name)
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
