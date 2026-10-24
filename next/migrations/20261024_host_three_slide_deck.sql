-- Teacher-only three-slide storyboard, no answer keys or grading data.
CREATE OR REPLACE FUNCTION public.qwiz_host_slide_deck(p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $deck$
DECLARE v_room public.org_next_rooms%rowtype; v_questions jsonb; v_current integer; v_total integer;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.org_quiz_is_admin_check() THEN RAISE EXCEPTION 'Недостаточно прав';END IF;
 SELECT * INTO v_room FROM public.org_next_rooms WHERE code=upper(trim(p_code));
 IF NOT FOUND OR v_room.owner_id<>(SELECT auth.uid()) THEN RAISE EXCEPTION 'Комната недоступна';END IF;
 SELECT questions INTO v_questions FROM public.org_next_quizzes WHERE id=v_room.quiz_id;
 v_total:=coalesce(jsonb_array_length(v_questions),0);
 v_current:=case when v_room.phase='lobby' then 0
   when v_room.phase='finished' then greatest(0,v_total-1)
   when v_room.phase='intermission' then least(greatest(v_room.question_index+1,0),greatest(0,v_total-1))
   else greatest(v_room.question_index,0) end;
 RETURN jsonb_build_object('index',v_current,'total',v_total,'phase',v_room.phase,'slides',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('position',slot.n,
 'index',v_current+slot.n,
 'kind',case when v_total=0 then 'empty' when v_current+slot.n<0 then 'start'
  when v_current+slot.n>=v_total then 'final' else 'question' end,
 'title',case when v_total=0 then 'В сборке нет вопросов'
  when v_current+slot.n<0 then 'Начало игры'
  when v_current+slot.n>=v_total then 'Финал игры'
  else coalesce(v_questions->(v_current+slot.n)->>'round_title',v_questions->(v_current+slot.n)->>'topic','Вопрос') end,
 'prompt',case when v_current+slot.n between 0 and v_total-1 then v_questions->(v_current+slot.n)->>'prompt' else null end
 ) ORDER BY slot.n),'[]'::jsonb) FROM generate_series(-1,1) slot(n)));
END
$deck$;
REVOKE ALL ON FUNCTION public.qwiz_host_slide_deck(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qwiz_host_slide_deck(text) TO authenticated;
