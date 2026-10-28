-- Preserve 10-point scale for the Secret Code and its teacher bonus editor.
CREATE OR REPLACE FUNCTION public.qwiz_arcade_finalize(p_room uuid, p_position integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.qwiz_arcade_runs%rowtype; best_team uuid; last_team uuid; t record; v_title text; target int; correct_answer int; entry record; is_correct boolean; v_rating_points integer;
begin
 select * into r from public.qwiz_arcade_runs where room_id=p_room and card_position=p_position for update;
 if not found or r.awarded_at is not null then return;end if;
 SELECT greatest(0,least(200,coalesce(
  (rb.timeline->p_position->'settings'->>'arcade_score_points')::integer,
  CASE WHEN r.mode='blitz' THEN 10 ELSE 0 END)))
 INTO v_rating_points FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room;
 v_rating_points:=coalesce(v_rating_points,CASE WHEN r.mode='blitz' THEN 10 ELSE 0 END);
 IF r.mode IN ('blitz','sequence_memory') THEN v_rating_points:=least(10,v_rating_points); END IF;
 if r.mode='blitz' then
   SELECT (q.solution->>'correct')::int INTO correct_answer
     FROM public.qwiz_bank q WHERE q.id=r.question_id;
   FOR entry IN SELECT tm.id,tm.position FROM public.org_next_teams tm
     WHERE tm.room_id=p_room ORDER BY tm.position LOOP
     target:=public.qwiz_consensus_choice(p_room,p_position,entry.id);
     is_correct:=target IS NOT NULL AND (r.option_order->>target)::int=correct_answer;
     IF is_correct THEN
       UPDATE public.org_next_teams SET score=score+v_rating_points WHERE id=entry.id AND room_id=p_room;
       PERFORM public.qwiz_arcade_award(p_room,p_position,entry.id,'blitz_answer',
         'Знатоки консенсуса',20);
     END IF;
   END LOOP;
   -- Equal correct answers earn 10 each; majority support breaks ties for bonus winner.
   SELECT tm.id INTO best_team FROM public.org_next_teams tm
     WHERE tm.room_id=p_room
       AND public.qwiz_consensus_choice(p_room,p_position,tm.id) IS NOT NULL
       AND (r.option_order->>public.qwiz_consensus_choice(p_room,p_position,tm.id))::int=correct_answer
     ORDER BY
       (SELECT count(*) FROM public.qwiz_consensus_votes vv WHERE vv.room_id=p_room
          AND vv.card_position=p_position AND vv.team_id=tm.id
          AND vv.choice=public.qwiz_consensus_choice(p_room,p_position,tm.id)) DESC,
       (SELECT min(vv.updated_at) FROM public.qwiz_consensus_votes vv WHERE vv.room_id=p_room
          AND vv.card_position=p_position AND vv.team_id=tm.id) ASC NULLS LAST,
       tm.position ASC LIMIT 1;
   IF best_team IS NOT NULL THEN
      PERFORM public.qwiz_arcade_award(p_room,p_position,best_team,
        'blitz_consensus','Командный консенсус',12);
   END IF;
 else
   SELECT team_id INTO best_team FROM public.qwiz_arcade_rank(p_room,p_position)
     WHERE points>0 ORDER BY place LIMIT 1;
   IF best_team IS NOT NULL THEN
     IF r.mode IN ('tug','captain','sequence_memory') AND v_rating_points>0 THEN
       UPDATE public.org_next_teams SET score=score+v_rating_points
       WHERE id=best_team AND room_id=p_room;
     END IF;
     v_title:=CASE r.mode WHEN 'rocket' THEN 'Покорители препятствий'
       WHEN 'tug' THEN 'Мастера тапов' WHEN 'sequence_memory' THEN 'Хранители кода' ELSE 'Мастера памяти' END;
     PERFORM public.qwiz_arcade_award(p_room,p_position,best_team,r.mode||'_win',v_title,15);
   END IF;
 end if;
 for t in select team_id,active from public.qwiz_arcade_rank(p_room,p_position) where active>0 loop
  perform public.qwiz_arcade_award(p_room,p_position,t.team_id,'participant','Команда в деле',5);
  if t.active>=3 then perform public.qwiz_arcade_award(p_room,p_position,t.team_id,'coordinated','Слаженная команда',8);end if;
 end loop;
 update public.qwiz_arcade_runs set awarded_at=clock_timestamp(),winner_team=best_team
 where room_id=p_room and card_position=p_position;
end $function$;

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
  v_reward := coalesce(v_reward,CASE WHEN v_mode IN ('blitz','sequence_memory') THEN 10 ELSE 15 END);
  IF v_reward NOT BETWEEN 0 AND 200 OR (v_mode IN ('blitz','sequence_memory') AND v_reward>10) OR v_percent NOT BETWEEN 50 AND 100 OR v_gap NOT BETWEEN 0 AND 200
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
   'arcade_score_points',greatest(0,least(CASE WHEN c.settings->>'arcade_mode' IN ('blitz','sequence_memory') THEN 10 ELSE 200 END,coalesce((c.settings->>'arcade_score_points')::integer,
      CASE WHEN c.settings->>'arcade_mode' IN ('blitz','sequence_memory') THEN 10 ELSE 15 END))),
   'bonus_percent',greatest(50,least(100,coalesce((c.settings->>'bonus_percent')::integer,70))),
   'bonus_lead',greatest(0,least(200,coalesce((c.settings->>'bonus_lead')::integer,15))),
   'bonus_min_points',greatest(1,least(200,coalesce((c.settings->>'bonus_min_points')::integer,1))),
   'bonus_vote_seconds',nullif(c.settings->>'bonus_vote_seconds','')::integer
  ) ORDER BY c.position)
  FROM public.qwiz_build_cards c WHERE c.build_id=p_build
   AND c.settings->>'arcade_mode' IN ('tug','blitz','captain','sequence_memory')
 ),'[]'::jsonb));
END $function$;
