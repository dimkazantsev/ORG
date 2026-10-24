-- Teacher-only visual slide preview: send media and choices only to room owner.
-- Public projector remains separate and answer-free.
DO $patch$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_host_slide_deck(text)'::regprocedure) INTO definition;
 IF position('''media_url'',case when' IN definition)>0 THEN RETURN;END IF;
 IF position('''prompt'',case when v_current+slot.n between 0 and v_total-1 then v_questions->(v_current+slot.n)->>''prompt'' else null end' IN definition)=0 THEN
  RAISE EXCEPTION 'Unexpected teacher slide preview definition';
 END IF;
 EXECUTE replace(definition,
 '''prompt'',case when v_current+slot.n between 0 and v_total-1 then v_questions->(v_current+slot.n)->>''prompt'' else null end',
 '''prompt'',case when v_current+slot.n between 0 and v_total-1 then v_questions->(v_current+slot.n)->>''prompt'' else null end,
  ''media_url'',case when v_current+slot.n between 0 and v_total-1 then v_questions->(v_current+slot.n)->>''media_url'' else null end,
  ''options'',case when v_current+slot.n between 0 and v_total-1 then coalesce(v_questions->(v_current+slot.n)->''options'',''[]''::jsonb) else ''[]''::jsonb end,
  ''correct'',case when v_current+slot.n between 0 and v_total-1 then v_questions->(v_current+slot.n)->>''correct'' else null end'
 );
END $patch$;
