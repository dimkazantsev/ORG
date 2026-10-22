-- Real RPC checks. Every test account, room and answer is rolled back.
begin;
do $$
declare admin_uid uuid;ids uuid[]:='{}';uid uuid;topic uuid;build uuid;created jsonb;room uuid;code text;team_ids uuid[];
 i integer;joined jsonb;pid uuid;target uuid;state jsonb;pub jsonb;counts integer[];result text;other_room uuid;other_team uuid;
begin
 select user_id into admin_uid from public.platform_admins limit 1;
 if admin_uid is null then raise exception 'QA needs an administrator';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_uid,'role','authenticated')::text,true);
 insert into public.qwiz_topics(owner_id,name) values(admin_uid,'QA teams rollback') returning id into topic;
 insert into public.qwiz_builds(owner_id,title) values(admin_uid,'QA teams rollback') returning id into build;
 insert into public.qwiz_build_cards(build_id,position,card_type,title,icon,topic_id,settings) values
 (build,0,'round','QA empty round','▦',topic,'{"count":2,"seconds":30,"answer_seconds":10,"lead_seconds":0}'),
 (build,1,'finale','QA finale','★',null,'{}');
 created:=public.qwiz_prepare_room(build,'QA teams rollback',5);room:=(created->>'room_id')::uuid;code:=created->>'code';
 if (created->>'total_questions')::int<>0 or jsonb_array_length(created->'issues')<>1 then raise exception 'Empty build must create a clearly pending room';end if;
 state:=public.org_next_state(code);
 if state->>'host'<>'true' or state->>'team_mode'<>'random' or jsonb_array_length(state->'teams')<>5 or state->'teams'->0->>'position'<>'1' then raise exception 'Host team state missing';end if;
 begin perform public.org_next_advance(room,'start');raise exception 'QA expected pending start rejection';exception when others then if sqlerrm='QA expected pending start rejection' then raise;end if;end;
 select array_agg(t.id order by t.position) into team_ids from public.org_next_teams t where t.room_id=room;
 for i in 1..34 loop
  uid:=gen_random_uuid();insert into auth.users(id,aud,role,email) values(uid,'authenticated','authenticated','qa-team-'||uid||'@example.invalid');ids:=array_append(ids,uid);
  if i<=30 then
   perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
   joined:=public.qwiz_join_team(code,'QA private student '||i,'QA',null,null);
   perform public.org_next_join(code,'QA private student '||i,'QA');
  end if;
 end loop;
 if (select count(*) from public.org_next_players p where p.room_id=room)<>30 then raise exception 'Rejoining duplicated a participant';end if;
 select array_agg(n order by n) into counts from(select count(p.id)::int as n from public.org_next_teams t left join public.org_next_players p on p.team_id=t.id where t.room_id=room group by t.id) x;
 if counts<>array[6,6,6,6,6] then raise exception '30 participants did not balance 6x5: %',counts;end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_uid,'role','authenticated')::text,true);
 perform public.qwiz_team_admin(room,'shuffle','{}');
 select array_agg(n order by n) into counts from(select count(p.id)::int as n from public.org_next_teams t left join public.org_next_players p on p.team_id=t.id where t.room_id=room group by t.id) x;
 if counts<>array[6,6,6,6,6] then raise exception 'Shuffle lost balance';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids[31],'role','authenticated')::text,true);
 joined:=public.qwiz_join_team(code,'QA late 31','QA',null,null);
 select p.team_id into target from public.org_next_players p where p.id=(joined->>'player_id')::uuid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids[32],'role','authenticated')::text,true);
 joined:=public.qwiz_join_team(code,'QA late 32','QA',null,null);
 if joined->>'team_id'=target::text then raise exception 'New participant was assigned to the larger team';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_uid,'role','authenticated')::text,true);
 perform public.qwiz_team_admin(room,'settings','{"mode":"manual","count":5}');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids[33],'role','authenticated')::text,true);
 joined:=public.qwiz_join_team(code,'QA pending 33','QA',null,null);pid:=(joined->>'player_id')::uuid;
 if joined->'team_id'<>'null'::jsonb then raise exception 'Manual mode must keep a pending list';end if;
 if public.qwiz_answer_eligible(room,pid,0) then raise exception 'Unassigned player may not answer';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_uid,'role','authenticated')::text,true);
 perform public.qwiz_team_admin(room,'move',jsonb_build_object('player_id',pid,'team_id',team_ids[3]));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids[34],'role','authenticated')::text,true);
 joined:=public.qwiz_join_team(code,'QA invited 34','QA',team_ids[3],pid);
 if joined->>'team_id'<>team_ids[3]::text then raise exception 'Personal invitation lost target team';end if;
 begin perform public.qwiz_team_admin(room,'shuffle','{}');raise exception 'QA expected student admin rejection';exception when others then if sqlerrm='QA expected student admin rejection' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_uid,'role','authenticated')::text,true);
 state:=public.org_next_state(code);pub:=public.qwiz_public_screen(code);
 if jsonb_array_length(state->'players')<>34 or not (state->'players'->0 ? 'avatar') then raise exception 'Teacher roster lacks names or avatars';end if;
 if pub::text like '%QA private student%' or jsonb_array_length(pub->'lobby_teams')<>5 then raise exception 'Public QR board leaks names or is missing teams';end if;
 perform public.qwiz_team_admin(room,'settings','{"mode":"random","count":3}');
 select array_agg(n order by n) into counts from(select count(p.id)::int as n from public.org_next_teams t left join public.org_next_players p on p.team_id=t.id where t.room_id=room group by t.id) x;
 if counts<>array[11,11,12] then raise exception 'Reducing teams lost participants or balance';end if;
 perform public.qwiz_team_admin(room,'settings','{"mode":"random","count":15}');
 if (select count(distinct t.name) from public.org_next_teams t where t.room_id=room)<>15 or exists(select 1 from public.org_next_teams t where t.room_id=room and t.name~' ') then raise exception 'Team expansion needs distinct adjective names';end if;
 if (select count(*) from public.org_next_players p where p.room_id=room and p.team_id is not null)<>34 then raise exception 'Expansion lost players';end if;
 insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution) values
 (admin_uid,topic,'single','QA first question','["А","Б"]','{"correct":0}'),
 (admin_uid,topic,'single','QA second question','["А","Б"]','{"correct":0}');
 perform public.qwiz_team_admin(room,'refresh_content','{}');
 state:=public.org_next_state(code);
 if (state->>'total')::int<>2 or state->'setup_issues'<>'[]'::jsonb then raise exception 'Pending room did not refresh its content';end if;
 perform public.qwiz_team_admin(room,'settings','{"mode":"random","count":5}');
 result:=public.org_next_advance(room,'start');
 if result='countdown' then update public.org_next_rooms r set ends_at=now()-interval '1 second' where r.id=room;perform public.qwiz_public_screen(code);end if;
 if (select phase from public.org_next_rooms r where r.id=room)<>'question' then raise exception 'Ready room did not start';end if;
 uid:=gen_random_uuid();insert into auth.users(id,aud,role,email) values(uid,'authenticated','authenticated','qa-team-'||uid||'@example.invalid');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 joined:=public.qwiz_join_team(code,'QA during question','QA',null,null);pid:=(joined->>'player_id')::uuid;
 if public.qwiz_answer_eligible(room,pid,0) or not public.qwiz_answer_eligible(room,pid,1) then raise exception 'Late join must enter from the next question';end if;
 begin perform public.qwiz_join_team(code,'QA during question','QA',gen_random_uuid(),null);raise exception 'QA expected foreign team rejection';exception when others then if sqlerrm='QA expected foreign team rejection' then raise;end if;end;
 if has_function_privilege('anon','public.qwiz_team_admin(uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.qwiz_team_state(uuid,boolean,uuid)','EXECUTE') or has_function_privilege('authenticated','public.qwiz_compile_build(uuid,text,boolean)','EXECUTE') then raise exception 'Internal team operations exposed';end if;
end $$;
rollback;
select 'PASS: empty-room preparation, start gating, 30/5 balance, shuffle, late balance, personal QR targets, manual queue/moves, 34-member roster, privacy, next-question admission and grants. All fixtures rolled back.' as team_setup_check;
