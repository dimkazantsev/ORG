-- Requires the 80-question pilot; every QA account, room and answer rolls back.
begin;
do $qa$
declare owner_uid uuid:=gen_random_uuid();student_uid uuid:=gen_random_uuid();topic uuid;build uuid;
 compiled jsonb;created jsonb;q jsonb;view_state jsonb;shown jsonb;answer jsonb;item record;
 v_room uuid;code text;mode text;idx int;expected boolean;payload jsonb;cnt int;
begin
 if (select count(*) from public.qwiz_bank where 'fw:stages7-12'=any(tags))<>80 then raise exception 'Expected 80 new questions';end if;
 if exists(select 1 from public.qwiz_bank where 'fw:stages7-12'=any(tags) and not public.qwiz_flags_question_valid(kind,options,solution)) then raise exception 'Invalid new question';end if;
 for item in select * from public.qwiz_bank where 'fw:stages7-12'=any(tags) loop
  mode:=item.solution->>'flag_mode';
  if public.qwiz_flags_question_valid(item.kind,item.options,item.solution||'{"source_urls":{}}'::jsonb) then raise exception 'Invalid optional source list accepted';end if;
  if mode='assemble' and public.qwiz_flags_question_valid(item.kind,item.options,jsonb_set(item.solution,'{flag_assembly,colors}','{}')) then raise exception 'Missing stripe colours accepted';end if;
  if mode='multiple' and public.qwiz_flags_question_valid(item.kind,item.options,jsonb_set(item.solution,'{correct_indices}','[0,0]')) then raise exception 'Repeated correct indices accepted';end if;
  if mode='memory' and public.qwiz_flags_question_valid(item.kind,item.options,jsonb_set(item.solution,'{flag_memory}','{}')) then raise exception 'Missing memory duration accepted';end if;
  if mode='history' and public.qwiz_flags_question_valid(item.kind,item.options,item.solution-'source_urls') then raise exception 'Uncited history question accepted';end if;
  if mode in ('similar','geo') and public.qwiz_flags_question_valid(item.kind,jsonb_set(item.options,'{0,label}','"answer leak"'),item.solution) then raise exception 'Visible country label accepted';end if;
 end loop;
 insert into auth.users(id,aud,role,email) values
 (owner_uid,'authenticated','authenticated','qa-six-host-'||owner_uid||'@example.invalid'),
 (student_uid,'authenticated','authenticated','qa-six-player-'||student_uid||'@example.invalid');
 insert into public.platform_admins(user_id) values(owner_uid);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);
 insert into public.qwiz_topics(owner_id,name) values(owner_uid,'Флаги мира') returning id into topic;
 insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,explanation,tags)
 select owner_uid,topic,kind,prompt,options,solution,explanation,tags from public.qwiz_bank where 'fw:stages7-12'=any(tags);
 insert into public.qwiz_builds(owner_id,title) values(owner_uid,'QA six flag mechanics') returning id into build;
 idx:=0;
 foreach mode in array array['similar','assemble','multiple','memory','geo','history'] loop
  shown:=public.qwiz_studio('questions',jsonb_build_object('kind','flag','mode',mode,'limit',100));
  if (shown->>'total')::int<>(case when mode='assemble' then 20 else 12 end) then raise exception 'Library filter lost %',mode;end if;
  insert into public.qwiz_build_cards(build_id,position,card_type,title,topic_id,settings)
  values(build,idx,'round',mode,topic,jsonb_build_object('count',2,'seconds',30,'flag_modes',jsonb_build_array(mode),'lead_seconds',0));idx:=idx+1;
 end loop;
 compiled:=public.qwiz_compile_build(build,null,false);
 if jsonb_array_length(compiled->'questions')<>12 then raise exception 'Six rounds did not compile 12 questions';end if;
 for idx in 0..11 loop
  q:=compiled->'questions'->idx;
  if q->'solution'->>'flag_mode'<>(array['similar','assemble','multiple','memory','geo','history'])[idx/2+1] then raise exception 'Question entered wrong round';end if;
 end loop;
 created:=public.qwiz_launch_build(build,'QA six flag mechanics',2);v_room:=(created->>'room_id')::uuid;code:=created->>'code';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student_uid,'role','authenticated')::text,true);
 perform public.qwiz_join_team(code,'QA player','QA',null,null);
 for idx in 0..11 loop
  update public.org_next_rooms r set phase='question',question_index=idx,ends_at=now()+interval '30 seconds' where r.id=v_room;
  select questions->idx into q from public.org_next_quizzes where id=(select quiz_id from public.org_next_rooms where id=v_room);
  view_state:=public.org_next_state(code);shown:=public.qwiz_public_screen(code);
  if view_state->'question' ?| array['correct','solution','explanation'] or shown->'question' ?| array['correct','solution','explanation'] then raise exception 'Answer key leaked before reveal';end if;
  if q->'solution'->>'flag_mode'='memory' then
   begin perform public.org_next_answer(v_room,(q->>'correct')::int);raise exception 'QA expected early answer rejection';exception when others then if sqlerrm not like 'Сначала запомните%' then raise;end if;end;
   begin perform public.qwiz_submit_answer(v_room,jsonb_build_object('index',(q->>'correct')::int));raise exception 'QA expected alternate early rejection';exception when others then if sqlerrm not like 'Сначала запомните%' then raise;end if;end;
   update public.org_next_rooms r set ends_at=now()+interval '10 seconds' where r.id=v_room;
   view_state:=public.org_next_state(code);shown:=public.qwiz_public_screen(code);
   if view_state->'question' ? 'media_url' or shown->'question' ? 'media_url' then raise exception 'Memory flag image retained after expiry';end if;
  end if;
  expected:=idx%2=0;
  if q->>'kind'='multi' then
   payload:=jsonb_build_object('indices',case when expected then q->'solution'->'correct_indices' else jsonb_build_array(q->'solution'->'correct_indices'->0) end);
  elsif q->>'kind'='order' then
   if expected then payload:=jsonb_build_object('items',q->'solution'->'order');else
    select jsonb_build_object('items',jsonb_agg(value order by ordinality desc)) into payload from jsonb_array_elements(q->'solution'->'order') with ordinality;end if;
  else payload:=jsonb_build_object('index',case when expected then (q->>'correct')::int else ((q->>'correct')::int+1)%4 end);end if;
  perform public.qwiz_submit_answer(v_room,payload);
  select count(*) into cnt from public.org_next_answers a where a.room_id=v_room and a.question_index=idx and a.correct=expected and a.points=case when expected then 100 else 0 end;
  if cnt<>1 then raise exception 'Incorrect scoring of % / %',q->>'kind',expected;end if;
  answer:=public.qwiz_answer_display(q);
  if answer->>'text' like '%image_url%' or answer->>'text'='Ответ не указан' then raise exception 'Unusable answer display';end if;
  if q->'solution'->>'flag_mode'='history' and jsonb_array_length(answer->'sources')=0 then raise exception 'Missing source on reveal';end if;
 end loop;
 if has_function_privilege('anon','public.qwiz_flag_memory_view(jsonb,text,timestamptz)','EXECUTE') or has_function_privilege('authenticated','public.qwiz_flag_memory_view(jsonb,text,timestamptz)','EXECUTE') then raise exception 'Internal helper exposed';end if;
end $qa$;
rollback;
select 'PASS: 80 validated questions, six mode filters, both compilers, twelve scored responses, private answer keys, memory deadlines and source reveal. Fixtures rolled back.' as flags_six_check;
