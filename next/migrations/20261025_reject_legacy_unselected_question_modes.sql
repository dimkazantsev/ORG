-- Never start an old room whose frozen question payload disagrees with its
-- explicitly selected build mechanics. Only validates; changes no sessions.
CREATE OR REPLACE FUNCTION public.qwiz_room_snapshot_issue(p_room uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $guard$
DECLARE v_questions jsonb;v_timeline jsonb;v_question jsonb;
 v_card jsonb;v_position int;v_mode text;v_selected jsonb;v_topic text;
BEGIN
 SELECT q.questions,rb.timeline INTO v_questions,v_timeline
 FROM public.org_next_rooms r
 JOIN public.org_next_quizzes q ON q.id=r.quiz_id
 LEFT JOIN public.qwiz_room_builds rb ON rb.room_id=r.id
 WHERE r.id=p_room;
 IF v_questions IS NULL THEN RETURN 'У комнаты отсутствует набор вопросов';END IF;
 IF v_timeline IS NULL THEN RETURN NULL;END IF;
 IF jsonb_typeof(v_timeline)<>'array' THEN RETURN 'Повреждён план сборки';END IF;
 FOR v_question IN SELECT x.value FROM jsonb_array_elements(v_questions) x LOOP
   v_position:=CASE WHEN (v_question->>'round_index')~'^[0-9]+$'
      THEN (v_question->>'round_index')::int ELSE -1 END;
   IF v_position<0 OR v_position>=jsonb_array_length(v_timeline) THEN
     RETURN 'Вопрос ссылается на отсутствующий раунд';
   END IF;
   v_card:=v_timeline->v_position;
   IF v_card->>'type'<>'round'
      OR COALESCE(v_card->'settings'->>'arcade_mode','')<>'' THEN
     RETURN 'Вопрос привязан к неверной механике';
   END IF;
   v_topic:=v_question->>'topic';
   IF v_topic='География России' THEN
     v_mode:=v_question->'solution'->>'geo_mode';
     v_selected:=v_card->'settings'->'geo_modes';
     IF v_mode IS NULL OR v_mode NOT IN ('capital','district')
       OR COALESCE(jsonb_typeof(v_selected),'')<>'array'
       OR NOT (v_selected ? v_mode) THEN
       RETURN 'В старой комнате обнаружены географические вопросы, не выбранные в сборке';
     END IF;
   ELSIF v_topic='Флаги мира' THEN
     v_mode:=v_question->'solution'->>'flag_mode';
     v_selected:=v_card->'settings'->'flag_modes';
     IF v_mode IS NULL OR COALESCE(jsonb_typeof(v_selected),'')<>'array'
       OR NOT (v_selected ? v_mode) THEN
       RETURN 'В старой комнате обнаружены вопросы о флагах вне выбранных механик';
     END IF;
   END IF;
 END LOOP;
 RETURN NULL;
END $guard$;
REVOKE ALL ON FUNCTION public.qwiz_room_snapshot_issue(uuid) FROM PUBLIC, anon,authenticated;

DO $patch$
DECLARE body text; old text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_advance_room(uuid,text)'::regprocedure) INTO body;
 IF strpos(body,'public.qwiz_room_snapshot_issue(p_room)')>0 THEN RETURN;END IF;
 old:='elsif p_action=''start'' and r.phase=''lobby'' then';
 replacement:=$new$elsif p_action='start' and r.phase='lobby' then
  IF public.qwiz_room_snapshot_issue(p_room) IS NOT NULL THEN
    RAISE EXCEPTION 'Невозможно начать старую комнату: %. Откройте исправленную сборку и создайте новую комнату.',
      public.qwiz_room_snapshot_issue(p_room);
  END IF;$new$;
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_advance_room code, aborting safe patch';END IF;
 EXECUTE replace(body,old,replacement);
END $patch$;
