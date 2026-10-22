-- Real compile checks on isolated, rolled-back flag fixtures.
begin;
do $qa$
declare owner_uid uuid:=gen_random_uuid();topic uuid;build uuid;compiled jsonb;room_data jsonb;
begin
 insert into auth.users(id,aud,role,email) values(owner_uid,'authenticated','authenticated','qa-flags-'||owner_uid||'@example.invalid');
 insert into public.platform_admins(user_id) values(owner_uid);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);
 if not public.org_quiz_is_admin_check() then raise exception 'QA fixture administrator rejected';end if;
 insert into public.qwiz_topics(owner_id,name) values(owner_uid,'Флаги мира') returning id into topic;
 insert into public.qwiz_builds(owner_id,title) values(owner_uid,'QA teams and flag selection') returning id into build;
 insert into public.qwiz_build_cards(build_id,position,card_type,title,icon,topic_id,settings) values
 (build,0,'round','QA country round','▦',topic,'{"count":2,"order":"sequential","flag_modes":["country"]}'),
 (build,1,'round','QA repeat country','▦',topic,'{"count":2,"order":"sequential","flag_modes":["country"]}'),
 (build,2,'round','QA picker round','▦',topic,'{"count":2,"order":"sequential","flag_modes":["picker"]}');
 insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,tags) values
 (owner_uid,topic,'flag','QA published country','["Россия","Канада","Франция","Япония"]','{"flag_mode":"country","correct":0,"media_url":"https://example.com/ru.svg"}',array['fw:published']),
 (owner_uid,topic,'flag','QA draft country','["Россия","Канада","Франция","Япония"]','{"flag_mode":"country","correct":0,"media_url":"https://example.com/ru.svg"}','{}'),
 (owner_uid,topic,'flag','QA invalid country','["А","Б"]','{"flag_mode":"country","correct":0,"media_url":"https://example.com/ru.svg"}',array['fw:published']),
 (owner_uid,topic,'single','QA legacy format','["А","Б"]','{"correct":0}',array['fw:published']),
 (owner_uid,topic,'flag','QA published picker','[{"image_url":"https://example.com/ru.svg"},{"image_url":"https://example.com/ca.svg"},{"image_url":"https://example.com/fr.svg"},{"image_url":"https://example.com/jp.svg"}]','{"flag_mode":"picker","correct":2,"option_labels":["Россия","Канада","Франция","Япония"]}',array['fw:published']);
 compiled:=public.qwiz_compile_build(build,null,true);
 if jsonb_array_length(compiled->'questions')<>2 or compiled->'questions'->0->>'prompt'<>'QA published country' or compiled->'questions'->1->>'prompt'<>'QA published picker' then raise exception 'Flag compiler ignored modes, publication, validity or duplicate exclusion';end if;
 if jsonb_array_length(compiled->'issues')<>1 or compiled->'issues'->0->>'title'<>'QA repeat country' then raise exception 'Exhausted filtered round must retain readiness reason';end if;
 room_data:=public.qwiz_prepare_room(build,null,5);
 if (room_data->>'total_questions')::integer<>2 or jsonb_array_length(room_data->'issues')<>1 then raise exception 'Prepared room snapshot differs from validated flags';end if;
 delete from public.qwiz_build_cards c where c.build_id=build and c.position=1;
 compiled:=public.qwiz_compile_build(build,null,false);
 if compiled->'issues'<>'[]'::jsonb then raise exception 'Complete filtered build not ready';end if;
 update public.qwiz_build_cards c set settings='{"count":1,"flag_modes":["invalid"]}' where c.build_id=build and c.position=0;
 begin
  perform public.qwiz_compile_build(build,null,true);
  raise exception 'QA expected invalid mechanic rejection';
 exception when others then
  if sqlerrm='QA expected invalid mechanic rejection' then raise;end if;
 end;
end $qa$;
rollback;
select 'PASS: prepared flag rooms preserve selected modes, publication status, option validation and no repeated questions. Fixtures rolled back.' as flag_room_check;
