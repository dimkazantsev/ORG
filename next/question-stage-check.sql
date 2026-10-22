-- Real PostgreSQL integration checks; fixtures never persist.
begin;
do $$
declare owner_uid uuid; uid uuid; quiz uuid; rid uuid; v_code text; teams uuid[]; players uuid[]:='{}'; pid uuid;i int:=0;
 screen jsonb;metric jsonb;started timestamptz;result text;topic uuid;build uuid;launched jsonb;other_room uuid;other_code text;
begin
 select user_id into owner_uid from public.platform_admins limit 1;
 if owner_uid is null then raise exception 'QA needs an existing administrator';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);
 insert into public.org_next_quizzes(owner_id,title,questions) values(owner_uid,'QA question-stage rollback',
 '[{"prompt":"QA first","kind":"single","options":["Альфа","Бета"],"correct":0,"solution":{"correct":0},"duration":30,"answer_duration":5},
 {"prompt":"QA second","kind":"single","options":["Альфа","Бета"],"correct":0,"solution":{"correct":0},"duration":60,"answer_duration":30},
 {"prompt":"QA text","kind":"text","options":[],"solution":{"answer":"Парадокс"},"duration":30}]') returning id into quiz;
 v_code:=public.org_next_create_room(quiz,'QA question-stage rollback',15);
 select id into rid from public.org_next_rooms where org_next_rooms.code=v_code;
 select array_agg(id order by position) into teams from public.org_next_teams where room_id=rid;
 if (select count(distinct name) from public.org_next_teams where room_id=rid)<>15 or exists(select 1 from public.org_next_teams where room_id=rid and name~' ') then raise exception 'Default names must be fifteen unique single adjectives';end if;
 for uid in select id from auth.users order by id limit 9 loop
  i:=i+1;insert into public.org_next_players(room_id,user_id,name,team_id,joined_at) values(rid,uid,'QA private name '||i,teams[case when i<=3 then 1 else 2 end],now()+make_interval(secs=>i)) returning id into pid;
  players:=array_append(players,pid);
 end loop;
 if i<>9 then raise exception 'QA needs nine existing users';end if;
 result:=public.org_next_advance(rid,'start');screen:=public.qwiz_public_screen(v_code);
 if result<>'question' or screen->'answer'<>'null'::jsonb or screen->'question'?'correct' or screen->'question'?'solution' then raise exception 'Question start/answer privacy failed';end if;
 if public.qwiz_tick(v_code) then raise exception 'Public caller released an unexpired stage';end if;
 if (select count(*) from public.qwiz_run_members where room_id=rid and question_index=0)<>9 then raise exception 'Eligible roster not captured';end if;
 update public.qwiz_question_runs set started_at=now()-interval '31 seconds',deadline=now()-interval '1 second' where room_id=rid and question_index=0 returning started_at into started;
 for i in 1..9 loop
  insert into public.org_next_answers(room_id,player_id,question_index,choice,correct,points,created_at) values(rid,players[i],0,0,true,100,started+interval '6 seconds');
 end loop;
 update public.org_next_rooms set ends_at=now()-interval '1 second' where id=rid;
 screen:=public.qwiz_public_screen(v_code);
 if screen->>'phase'<>'result' or screen->'answer'->>'text'<>'Альфа' or (screen->>'duration')::int<>5 then raise exception 'Question expiry or five-second answer failed';end if;
 if (screen->>'ends_at')::timestamptz-clock_timestamp() not between interval '4 seconds' and interval '6 seconds' then raise exception 'Answer deadline is wrong';end if;
 if exists(select 1 from jsonb_array_elements(screen->'teams') t where (t->>'members')::int in (3,6) and (t->>'mean_seconds')::numeric<>6) then raise exception 'Unequal teams did not receive equal per-person times';end if;
 if public.qwiz_tick(v_code) then raise exception 'Duplicate public read skipped answer';end if;
 result:=public.org_next_advance(rid,'next');
 update public.qwiz_question_runs set started_at=now()-interval '61 seconds',deadline=now()-interval '1 second' where room_id=rid and question_index=1 returning started_at into started;
 for i in 1..6 loop
  insert into public.org_next_answers(room_id,player_id,question_index,choice,correct,points,created_at) values(rid,players[i],1,0,true,100,started+make_interval(secs=>case when i=4 then 10 when i=6 then 14 else 12 end));
 end loop;
 update public.org_next_rooms set ends_at=now()-interval '1 second' where id=rid;
 screen:=public.qwiz_public_screen(v_code);
 select value into metric from jsonb_array_elements(screen->'teams') where value->>'id'=teams[1]::text;
 if (metric->>'mean_seconds')::numeric<>12 or (metric->>'speed_delta')::numeric<>0 then raise exception 'Different question lengths were not normalized';end if;
 select value into metric from jsonb_array_elements(screen->'teams') where value->>'id'=teams[2]::text;
 if (metric->>'mean_seconds')::numeric<>36 or (metric->>'speed_delta')::numeric<>-66.7 then raise exception 'Unanswered penalty or relative speed ratio failed';end if;
 if (screen->>'duration')::int<>30 or (screen->'players'->0->>'latest_seconds')::numeric<>10 then raise exception 'Thirty-second answer or equal-point speed tie-break failed';end if;
 if screen::text like '%QA private name%' then raise exception 'Public ranking leaked private names';end if;
 update public.org_next_rooms set ends_at=now()-interval '1 second' where id=rid;
 screen:=public.qwiz_public_screen(v_code);
 if screen->>'phase'<>'question' or (screen->>'index')::int<>2 or public.qwiz_tick(v_code) then raise exception 'Answer expiry did not start exactly one next question';end if;
 select user_id into uid from public.org_next_players where id=players[2];
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 screen:=public.org_next_state(v_code);
 if screen->'question'?'solution' or screen->'question'?'correct' then raise exception 'Participant received an answer key';end if;
 metric:=public.qwiz_submit_answer(rid,'{"text":"Парадокс"}');
 if metric->>'accepted'<>'true' or metric?'correct' then raise exception 'Real answer submission failed/leaked correctness';end if;
 screen:=public.org_next_state(v_code);
 if screen->>'has_answer'<>'true' or (screen->>'answers_count')::int<>1 then raise exception 'Accepted answer did not update progress';end if;
 begin
  perform public.qwiz_submit_answer(rid,'{"text":"Парадокс"}');raise exception 'QA expected duplicate rejection';
 exception when others then if sqlerrm='QA expected duplicate rejection' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);
 result:=public.org_next_advance(rid,'next');screen:=public.qwiz_public_screen(v_code);
 if result<>'result' or screen->'answer'->>'text'<>'Парадокс' or (screen->>'duration')::int<>10 then raise exception 'Moderator question Next/default ten seconds failed';end if;
 result:=public.org_next_advance(rid,'next');screen:=public.qwiz_public_screen(v_code);
 if result<>'finished' or jsonb_array_length(screen->'teams')<>15 or jsonb_array_length(screen->'players')<>9 or jsonb_array_length(screen->'question_stats')<>3 or (screen->'question_stats'->2->>'unanswered')::int<>8 then raise exception 'Final statistics failed';end if;
 if public.qwiz_answer_display('{"kind":"multi","options":["А","Б","В"],"solution":{"correct_indices":[0,2]}}')->>'text'<>'А · В' then raise exception 'Multi reveal failed';end if;
 if public.qwiz_answer_display('{"kind":"match","options":["А","Б"],"solution":{"matches":["1","2"]}}')->>'text'<>'А → 1; Б → 2' then raise exception 'Matching reveal failed';end if;
 insert into public.qwiz_topics(owner_id,name,category) values(owner_uid,'QA rollback','Общие знания') returning id into topic;
 insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution) values(owner_uid,topic,'single','QA compiled','["А","Б"]','{"correct":0,"illustration_url":"https://example.org/qa.svg"}');
 insert into public.qwiz_builds(owner_id,title) values(owner_uid,'QA rollback') returning id into build;
 insert into public.qwiz_build_cards(build_id,position,card_type,title,icon,topic_id,settings) values
 (build,0,'intro','QA intro','◉',null,'{}'),
 (build,1,'round','QA round','▦',topic,'{"count":1,"seconds":40,"answer_seconds":30,"sound":"none"}'),
 (build,2,'finale','QA finale','★',null,'{"sound":"synth"}');
 launched:=public.qwiz_prepare_room(build,'QA compiled rollback',2);other_code:=launched->>'code';other_room:=(launched->>'room_id')::uuid;
 result:=public.org_next_advance(other_room,'start');if result<>'intermission' then raise exception 'Intro regression';end if;
 result:=public.org_next_advance(other_room,'next');if result<>'countdown' then raise exception 'Round countdown regression';end if;
 update public.org_next_rooms set ends_at=now()-interval '1 second' where id=other_room;
 screen:=public.qwiz_public_screen(other_code);
 if screen->>'phase'<>'question' or (screen->>'duration')::int<>40 or screen->'question'->>'illustration_url'<>'https://example.org/qa.svg' then raise exception 'Compiler dropped time/illustration';end if;
 result:=public.org_next_advance(other_room,'next');screen:=public.qwiz_public_screen(other_code);
 if (screen->>'duration')::int<>30 then raise exception 'Compiler dropped answer time';end if;
 result:=public.org_next_advance(other_room,'next');screen:=public.qwiz_public_screen(other_code);
 if result<>'finished' or screen->'activity'->>'title'<>'QA finale' or screen->'activity'->>'sound'<>'synth' then raise exception 'Finale settings regression';end if;
 if has_function_privilege('anon','public.qwiz_advance_room(uuid,text)','EXECUTE') or has_function_privilege('authenticated','public.qwiz_tick(text)','EXECUTE') or has_table_privilege('anon','public.qwiz_run_members','SELECT') or has_table_privilege('authenticated','public.qwiz_question_runs','SELECT') then raise exception 'Private clock/timing objects exposed';end if;
 perform set_config('request.jwt.claims','{}',true);
 begin
  perform public.org_next_advance(other_room,'finish');raise exception 'QA expected unauthorized rejection';
 exception when others then if sqlerrm='QA expected unauthorized rejection' then raise;end if;end;
end $$;
rollback;
select 'PASS: timers, real answers, normalized 3-vs-6 speed, missing answers, tie-breaks, privacy, compiled cards, finale settings and least privilege. All fixtures rolled back.' as question_stage_check;
