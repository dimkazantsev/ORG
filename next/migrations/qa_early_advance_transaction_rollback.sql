-- Synthetic completion checks; all inserted rows are rolled back, never stored.
BEGIN;
DO $qa$
DECLARE v_room uuid; v_quiz uuid; v_owner uuid; u1 uuid; u2 uuid;
t1 uuid; t2 uuid; p1 uuid; p2 uuid;
started timestamptz:=clock_timestamp()-interval '10 seconds';
v_code text:='QA'||upper(substring(md5(gen_random_uuid()::text),1,6));
BEGIN
SELECT q.id,q.owner_id INTO v_quiz,v_owner FROM public.org_next_quizzes q LIMIT 1;
SELECT p.user_id INTO u1 FROM public.org_next_players p ORDER BY p.user_id LIMIT 1;
SELECT p.user_id INTO u2 FROM public.org_next_players p WHERE p.user_id<>u1 ORDER BY p.user_id LIMIT 1;
IF v_quiz IS NULL OR u1 IS NULL OR u2 IS NULL THEN RAISE EXCEPTION 'No fixture references';END IF;
INSERT INTO public.org_next_rooms(quiz_id,owner_id,code,title,phase,question_index)
VALUES(v_quiz,v_owner,v_code,'QA transient completion test','lobby',0) RETURNING id INTO v_room;
INSERT INTO public.org_next_teams(room_id,position,name) VALUES(v_room,1,'QA Team One') RETURNING id INTO t1;
INSERT INTO public.org_next_teams(room_id,position,name) VALUES(v_room,2,'QA Team Two') RETURNING id INTO t2;
INSERT INTO public.org_next_players(room_id,user_id,name,team_id,joined_at) VALUES(v_room,u1,'QA Player One',t1,started-interval '1 second') RETURNING id INTO p1;
INSERT INTO public.org_next_players(room_id,user_id,name,team_id,joined_at) VALUES(v_room,u2,'QA Player Two',t2,started-interval '1 second') RETURNING id INTO p2;
UPDATE public.org_next_rooms SET phase='intermission' WHERE id=v_room;
INSERT INTO public.qwiz_room_activity(room_id,card_position,title,kind,settings,entered_at)
VALUES(v_room,0,'QA Memory','bonus','{"arcade_mode":"captain","arcade_seconds":110}'::jsonb,started);
INSERT INTO public.qwiz_arcade_runs(room_id,card_position,mode,started_at) VALUES(v_room,0,'captain',started);
INSERT INTO public.qwiz_arcade_memory_players(room_id,card_position,team_id,player_id,deck)
VALUES(v_room,0,t1,p1,'[]'::jsonb),(v_room,0,t2,p2,'[]'::jsonb);
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Memory ended too early';END IF;
UPDATE public.qwiz_arcade_memory_players SET completed_at=clock_timestamp() WHERE room_id=v_room AND player_id=p1;
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Memory ended after first captain';END IF;
UPDATE public.qwiz_arcade_memory_players SET completed_at=clock_timestamp() WHERE room_id=v_room AND player_id=p2;
IF NOT public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Memory did not end';END IF;
UPDATE public.qwiz_room_activity SET settings='{"arcade_mode":"sequence_memory","arcade_seconds":110}'::jsonb WHERE room_id=v_room;
UPDATE public.qwiz_arcade_runs SET mode='sequence_memory' WHERE room_id=v_room;
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Secret ended with zero';END IF;
INSERT INTO public.qwiz_secret_code_answers(room_id,card_position,player_id,team_id,answer,exact,points) VALUES(v_room,0,p1,t1,'["red"]'::jsonb,1,10);
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Secret ended with one missing';END IF;
INSERT INTO public.qwiz_secret_code_answers(room_id,card_position,player_id,team_id,answer,exact,points) VALUES(v_room,0,p2,t2,'["red"]'::jsonb,1,10);
IF NOT public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Secret did not end';END IF;
UPDATE public.qwiz_arcade_runs SET awarded_at=clock_timestamp() WHERE room_id=v_room;
IF public.qwiz_arcade_vote_start(v_room,0)>clock_timestamp() THEN RAISE EXCEPTION 'Bonus not immediate';END IF;
UPDATE public.qwiz_room_activity SET settings='{"arcade_mode":"russia_map","geo_count":1}'::jsonb WHERE room_id=v_room;
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Geo ended with no runs';END IF;
INSERT INTO public.qwiz_geo_runs(room_id,card_position,player_id,tasks,current_index)
VALUES(v_room,0,p1,'[{"mode":"locate"}]'::jsonb,1),(v_room,0,p2,'[{"mode":"locate"}]'::jsonb,0);
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Geo ended with one unfinished';END IF;
UPDATE public.qwiz_geo_runs SET current_index=1 WHERE room_id=v_room AND player_id=p2;
IF NOT public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Geo did not end';END IF;
UPDATE public.qwiz_room_activity SET settings='{"arcade_mode":"blitz","arcade_seconds":110}'::jsonb WHERE room_id=v_room;
UPDATE public.qwiz_arcade_runs SET mode='blitz',awarded_at=NULL WHERE room_id=v_room;
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Blitz ended without captain choices';END IF;
INSERT INTO public.qwiz_consensus_decisions(room_id,card_position,team_id,choice,captain_id)
VALUES(v_room,0,t1,1,p1);
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Blitz ended with one missing team';END IF;
INSERT INTO public.qwiz_consensus_decisions(room_id,card_position,team_id,choice,captain_id)
VALUES(v_room,0,t2,2,p2);
IF NOT public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Blitz did not end after captains';END IF;
UPDATE public.qwiz_room_activity SET settings='{"arcade_mode":"rocket","arcade_seconds":110}'::jsonb WHERE room_id=v_room;
UPDATE public.qwiz_arcade_runs SET mode='rocket' WHERE room_id=v_room;
INSERT INTO public.qwiz_arcade_runner_players(room_id,card_position,team_id,player_id,eliminated_at)
VALUES(v_room,0,t1,p1,clock_timestamp()),(v_room,0,t2,p2,NULL);
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Runner ended while one still active';END IF;
UPDATE public.qwiz_arcade_runner_players SET eliminated_at=clock_timestamp() WHERE room_id=v_room AND player_id=p2;
IF NOT public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Runner did not end after all eliminated';END IF;
UPDATE public.qwiz_room_activity SET settings='{"arcade_mode":"tug","arcade_seconds":110}'::jsonb WHERE room_id=v_room;
UPDATE public.qwiz_arcade_runs SET mode='tug' WHERE room_id=v_room;
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Continuous Tap Battle must use timer';END IF;
UPDATE public.org_next_rooms SET phase='question',question_index=0,ends_at=clock_timestamp()+interval '90 seconds' WHERE id=v_room;
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Question ended with no answers';END IF;
INSERT INTO public.org_next_answers(room_id,player_id,question_index,choice,correct,points) VALUES(v_room,p1,0,0,false,0);
IF public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Question ended with one missing';END IF;
INSERT INTO public.org_next_answers(room_id,player_id,question_index,choice,correct,points) VALUES(v_room,p2,0,0,false,0);
IF NOT public.qwiz_stage_everyone_done(v_room) THEN RAISE EXCEPTION 'Question did not end';END IF;
RAISE NOTICE 'QA PASS: all participants, missing participant, Memory, Secret, Geography, Blitz, Runner, Tap Battle, Question, Bonus';
END $qa$;
ROLLBACK;