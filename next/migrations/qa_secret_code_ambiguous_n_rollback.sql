-- Transactional integration check for the live Secret Code catalogue.
-- Produces no persistent rooms or sessions.
BEGIN;
DO $qa$
DECLARE v_quiz uuid;v_owner uuid;v_room uuid;v_code text;
        started timestamptz:=clock_timestamp()-interval '3 seconds';
        v_session public.qwiz_secret_code_sessions%rowtype;
BEGIN
 SELECT q.id,q.owner_id INTO v_quiz,v_owner FROM public.org_next_quizzes q LIMIT 1;
 IF v_quiz IS NULL THEN RAISE EXCEPTION 'Test quiz unavailable'; END IF;
 v_code:='AA'||upper(substr(md5(gen_random_uuid()::text),1,6));
 INSERT INTO public.org_next_rooms(quiz_id,owner_id,code,title,phase,question_index)
 VALUES(v_quiz,v_owner,v_code,'QA transient Secret Code','intermission',0) RETURNING id INTO v_room;
 INSERT INTO public.qwiz_room_activity(room_id,card_position,title,kind,settings,entered_at)
 VALUES(v_room,0,'Secret Code QA','bonus','{"arcade_mode":"sequence_memory","secret_challenge":1}'::jsonb,started);
 INSERT INTO public.qwiz_arcade_runs(room_id,card_position,mode,started_at)
 VALUES(v_room,0,'sequence_memory',started);
 PERFORM public.qwiz_secret_code_ensure(v_room,0);
 SELECT * INTO v_session FROM public.qwiz_secret_code_sessions s WHERE s.room_id=v_room AND s.card_position=0;
 IF v_session.room_id IS NULL THEN RAISE EXCEPTION 'Session was not created';END IF;
 IF v_session.template_no<>1 OR jsonb_array_length(v_session.code)<2
 THEN RAISE EXCEPTION 'Secret template/sequence corrupt';END IF;
 PERFORM public.qwiz_secret_code_ensure(v_room,0);
 IF (SELECT count(*) FROM public.qwiz_secret_code_sessions s WHERE s.room_id=v_room AND s.card_position=0)<>1
 THEN RAISE EXCEPTION 'Session duplication'; END IF;
 -- Challenge 30 must also resolve without ambiguous columns.
 UPDATE public.qwiz_room_activity SET card_position=1,
   settings='{"arcade_mode":"sequence_memory","secret_challenge":30}'::jsonb
 WHERE room_id=v_room;
 INSERT INTO public.qwiz_arcade_runs(room_id,card_position,mode,started_at)
 VALUES(v_room,1,'sequence_memory',started);
 PERFORM public.qwiz_secret_code_ensure(v_room,1);
 SELECT * INTO v_session FROM public.qwiz_secret_code_sessions s
  WHERE s.room_id=v_room AND s.card_position=1;
 IF v_session.template_no<>30 OR jsonb_array_length(v_session.code)<2
 THEN RAISE EXCEPTION 'Final challenge 30 did not initialize';END IF;
 RAISE NOTICE 'Secret Code: catalogue lookup, code creation and repeat ensure PASSED';
END $qa$;
ROLLBACK;