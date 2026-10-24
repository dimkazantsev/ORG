-- Correct sources for quiz, Russian geography, and tap-based games; no score mutation.
CREATE OR REPLACE FUNCTION public.qwiz_round_results(p_room uuid,p_card integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $round$
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
 'player_unit',case when info.mode in ('rocket','blitz','tug','captain') then 'нажатия' else 'баллы раунда' end,
 'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode in ('rocket','blitz','tug','captain') then arcade_points
    else question_points end,'total_score',total_score,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points::numeric
 when info.mode in ('rocket','blitz','tug','captain') then arcade_points else question_points::numeric end) DESC,name)
 FROM team_scores),'[]'::jsonb),
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nickname',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode in ('rocket','blitz','tug','captain') then taps
    else question_points end,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points
 when info.mode in ('rocket','blitz','tug','captain') then taps else question_points end) DESC,name)
 FROM player_scores),'[]'::jsonb))
FROM info;
$round$;
REVOKE ALL ON FUNCTION public.qwiz_round_results(uuid,integer) FROM PUBLIC,anon,authenticated;