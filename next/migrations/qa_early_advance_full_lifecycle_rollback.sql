-- End-to-end early Memory -> round statistics -> finale; ROLLBACK keeps DB clean.
BEGIN;
DO $qa$
DECLARE v_room uuid; v_quiz uuid; v_owner uuid; u1 uuid;u2 uuid; t1 uuid;t2 uuid;p1 uuid;p2 uuid;
 v_code text:='AA'||upper(substring(md5(gen_random_uuid()::text),1,6));
 started timestamptz:=clock_timestamp()-interval '10 seconds';
 v_kind text; v_phase text; progressed boolean;
BEGIN
 SELECT q.id,q.owner_id INTO v_quiz,v_owner FROM public.org_next_quizzes q LIMIT 1;
 SELECT p.user_id INTO u1 FROM public.org_next_players p ORDER BY p.user_id LIMIT 1;
 SELECT p.user_id INTO u2 FROM public.org_next_players p WHERE p.user_id<>u1 ORDER BY p.user_id LIMIT 1;
 IF v_quiz IS NULL OR u1 IS NULL OR u2 IS NULL THEN RAISE EXCEPTION 'No test users/quiz';END IF;
 INSERT INTO public.org_next_rooms(quiz_id,owner_id,code,title,phase,question_index)
 VALUES(v_quiz,v_owner,v_code,'QA transient tick test','lobby',0) RETURNING id INTO v_room;
 INSERT INTO public.org_next_teams(room_id,position,name) VALUES(v_room,1,'QA A') RETURNING id INTO t1;
 INSERT INTO public.org_next_teams(room_id,position,name) VALUES(v_room,2,'QA B') RETURNING id INTO t2;
 INSERT INTO public.org_next_players(room_id,user_id,name,team_id,joined_at) VALUES(v_room,u1,'QA A',t1,started-interval '1 second') RETURNING id INTO p1;
 INSERT INTO public.org_next_players(room_id,user_id,name,team_id,joined_at) VALUES(v_room,u2,'QA B',t2,started-interval '1 second') RETURNING id INTO p2;
 INSERT INTO public.qwiz_room_builds(room_id,timeline) VALUES(v_room,'[{"type":"bonus","title":"Memory","settings":{"arcade_mode":"captain","arcade_seconds":110,"arcade_score_points":10,"stats_seconds":5}},{"type":"finale"}]'::jsonb);
 UPDATE public.org_next_rooms SET phase='intermission' WHERE id=v_room;
 INSERT INTO public.qwiz_room_activity(room_id,card_position,title,kind,settings,entered_at)
 VALUES(v_room,0,'QA memory','bonus','{"arcade_mode":"captain","arcade_seconds":110,"stats_seconds":5}'::jsonb,started);
 INSERT INTO public.qwiz_arcade_runs(room_id,card_position,mode,started_at) VALUES(v_room,0,'captain',started);
 INSERT INTO public.qwiz_arcade_memory_players(room_id,card_position,team_id,player_id,deck,matched,moves,completed_at)
 VALUES(v_room,0,t1,p1,'[]'::jsonb,'[0,1,2,3,4,5,6,7,8,9,10,11]'::jsonb,6,clock_timestamp()),
       (v_room,0,t2,p2,'[]'::jsonb,'[0,1,2,3,4,5,6,7,8,9,10,11]'::jsonb,6,clock_timestamp());
 IF NOT public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Expected completed memory';END IF;
 progressed:=public.qwiz_tick(v_code);
 IF NOT progressed THEN RAISE EXCEPTION 'Tick failed to advance completed memory';END IF;
 SELECT kind INTO v_kind FROM public.qwiz_room_activity WHERE room_id=v_room;
 IF v_kind<>'round_stats' THEN RAISE EXCEPTION 'Expected statistics after game, got %',v_kind;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.qwiz_arcade_runs WHERE room_id=v_room AND awarded_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Awards not finalized';END IF;
 -- Running tick twice cannot award again and cannot skip the stats window.
 progressed:=public.qwiz_tick(v_code);
 IF progressed THEN RAISE EXCEPTION 'Tick skipped mandatory statistics';END IF;
 UPDATE public.qwiz_room_activity SET entered_at=started WHERE room_id=v_room;
 progressed:=public.qwiz_tick(v_code);
 SELECT phase INTO v_phase FROM public.org_next_rooms WHERE id=v_room;
 IF NOT progressed OR v_phase<>'finished' THEN RAISE EXCEPTION 'Stats did not lead to finale, phase %',v_phase;END IF;
 RAISE NOTICE 'PASS: Memory finishes early, awards once, statistics shown, finale reached';
END $qa$;
ROLLBACK;