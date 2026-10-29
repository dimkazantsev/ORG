-- Confirm a timed-out Geography question reveals the correct answer only after expiration.
-- Test is rolled back; does not alter any real game or result.
BEGIN;
DO $qa$
DECLARE v_quiz uuid;v_owner uuid;v_room uuid;v_code text;
        v_user uuid;v_team uuid;v_player uuid;v_region text;v_result jsonb;
        v_started timestamptz:=clock_timestamp()-interval '2 seconds';
BEGIN
 SELECT q.id,q.owner_id INTO v_quiz,v_owner FROM public.org_next_quizzes q LIMIT 1;
 SELECT p.user_id INTO v_user FROM public.org_next_players p LIMIT 1;
 SELECT g.id INTO v_region FROM public.qwiz_geo_regions g LIMIT 1;
 IF v_quiz IS NULL OR v_user IS NULL OR v_region IS NULL THEN RAISE EXCEPTION 'No fixture data'; END IF;
 v_code:='AA'||upper(substr(md5(gen_random_uuid()::text),1,6));
 INSERT INTO public.org_next_rooms(quiz_id,owner_id,code,title,phase,question_index)
 VALUES(v_quiz,v_owner,v_code,'QA transient Geo timeout','intermission',0) RETURNING id INTO v_room;
 INSERT INTO public.org_next_teams(room_id,position,name) VALUES(v_room,1,'QA Geo Team') RETURNING id INTO v_team;
 INSERT INTO public.org_next_players(room_id,user_id,name,team_id,joined_at)
 VALUES(v_room,v_user,'QA Geo Student',v_team,v_started-interval '1 second') RETURNING id INTO v_player;
 INSERT INTO public.qwiz_room_activity(room_id,card_position,title,kind,settings,entered_at)
 VALUES(v_room,0,'Geo QA','bonus','{"arcade_mode":"russia_map","geo_count":1,"geo_modes":["flag"],"geo_question_seconds":8}'::jsonb,v_started);
 INSERT INTO public.qwiz_geo_runs(room_id,player_id,card_position,tasks,current_index,updated_at)
 VALUES(v_room,v_player,0,
  jsonb_build_array(jsonb_build_object('mode','flag','answer','opaque-choice',
   'options',jsonb_build_array(
     jsonb_build_object('id','opaque-choice','text','Тестовый субъект'),
     jsonb_build_object('id','other','text','Другой субъект')))),
  0,clock_timestamp()-interval '30 seconds');
 PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
 SELECT public.qwiz_geo_play(v_room,NULL) INTO v_result;
 IF (v_result->>'timed_out')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Timeout not recognized %',v_result;END IF;
 IF v_result#>>'{last_answer,correct_text}' IS DISTINCT FROM 'Тестовый субъект'
 THEN RAISE EXCEPTION 'Correct option not revealed after expiry';END IF;
 IF (v_result->>'index')::int<>1 THEN RAISE EXCEPTION 'Question not advanced';END IF;
 RAISE NOTICE 'PASS: timed out answer returns correct_text after expiry';
END $qa$;
ROLLBACK;