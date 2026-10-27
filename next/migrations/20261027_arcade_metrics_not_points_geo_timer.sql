-- Prevent tap totals and memory ratings from appearing as question points.
-- Arcade rewards become achievements and ballots, not direct game score.
-- Geography question duration uses the common seconds setting.
CREATE OR REPLACE FUNCTION public.qwiz_arcade_finalize(p_room uuid, p_position integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.qwiz_arcade_runs%rowtype; best_team uuid; last_team uuid; t record; v_title text;
begin
 select * into r from public.qwiz_arcade_runs where room_id=p_room and card_position=p_position for update;
 if not found or r.awarded_at is not null then return;end if;
 select team_id into best_team from public.qwiz_arcade_rank(p_room,p_position) where points>0 order by place limit 1;
 if r.mode='blitz' then
   if best_team is not null then perform public.qwiz_arcade_award(p_room,p_position,best_team,'blitz_capture','Первый на вопросе',12);end if;
 else
  if best_team is not null then
   -- Arcade performance awards achievements and the right to vote; never raw score.
   v_title:=case r.mode when 'rocket' then 'Покорители препятствий' when 'tug' then 'Мастера тапов' else 'Мастера памяти' end;
   perform public.qwiz_arcade_award(p_room,p_position,best_team,r.mode||'_win',v_title,15);
  end if;
 end if;
 for t in select team_id,active from public.qwiz_arcade_rank(p_room,p_position) where active>0 loop
  perform public.qwiz_arcade_award(p_room,p_position,t.team_id,'participant','Команда в деле',5);
  if t.active>=3 then perform public.qwiz_arcade_award(p_room,p_position,t.team_id,'coordinated','Слаженная команда',8);end if;
 end loop;
 update public.qwiz_arcade_runs set awarded_at=clock_timestamp(),winner_team=best_team
 where room_id=p_room and card_position=p_position;
end $function$
;

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
   AND r.points>=1 AND (other_points IS NULL OR r.points-other_points>=gap)
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
 'team_unit','баллы за вопросы',
 'player_unit','баллы за вопросы',
 'metric_unit',case info.mode when 'tug' then 'нажатия' when 'rocket' then 'препятствия' when 'captain' then 'результат мэмори' when 'blitz' then 'захваты' else null end,
 'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode in ('rocket','blitz','tug','captain') then 0
    else question_points end,'metric',case when info.mode in ('rocket','blitz','tug','captain') then arcade_points else null end,'total_score',total_score,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points::numeric
 when info.mode in ('rocket','blitz','tug','captain') then arcade_points else question_points::numeric end) DESC,name)
 FROM team_scores),'[]'::jsonb),
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nickname',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode in ('rocket','blitz','tug','captain') then 0
    else question_points end,'metric',case when info.mode='captain' then memory_points when info.mode in ('rocket','blitz','tug') then taps else null end,'answers',answers,'correct',correct)
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

CREATE OR REPLACE FUNCTION public.qwiz_geo_question_seconds(p_settings jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ SELECT greatest(1,least(120,coalesce(
 nullif(p_settings->>'seconds','')::integer,30))) $function$
;