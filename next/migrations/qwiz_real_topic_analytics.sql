-- Compile a saved build into a room-specific immutable quiz snapshot.
-- Rich question definitions remain in the bank; only supported answer
-- mechanics (single/boolean/flag/portrait/image) run through the v2 scoring engine.
create or replace function public.qwiz_launch_build(p_build uuid,p_title text default null,p_teams integer default 4)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_build public.qwiz_builds%rowtype; v_card public.qwiz_build_cards%rowtype;
 v_question public.qwiz_bank%rowtype; v_questions jsonb:='[]'::jsonb; v_timeline jsonb:='[]'::jsonb;
 v_n integer; v_skip integer; v_secs integer; v_order text; v_limit integer;
 v_quiz uuid; v_code text; v_room uuid; v_count integer; v_opts jsonb; v_sol jsonb; v_match_choices jsonb;
begin
 v_owner:=(select auth.uid());
 if v_owner is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 if p_teams not between 1 and 15 then raise exception 'Количество команд от 1 до 15'; end if;
 select * into v_build from public.qwiz_builds where id=p_build and owner_id=v_owner;
 if not found then raise exception 'Сборка не найдена'; end if;
 for v_card in select * from public.qwiz_build_cards where build_id=p_build order by position loop
   v_timeline:=v_timeline||jsonb_build_array(jsonb_build_object(
    'type',v_card.card_type,'title',v_card.title,'icon',v_card.icon,
    'settings',v_card.settings,'first_question',jsonb_array_length(v_questions)));
   if v_card.card_type='round' then
     if v_card.topic_id is null then raise exception 'У раунда «%» не выбрана тема',v_card.title; end if;
     v_limit:=greatest(1,least(100,coalesce((v_card.settings->>'count')::integer,5)));
     v_skip:=greatest(0,coalesce((v_card.settings->>'offset')::integer,0));
     v_secs:=greatest(10,least(120,coalesce((v_card.settings->>'seconds')::integer,30)));
     v_order:=coalesce(v_card.settings->>'order','random');
     v_count:=0;
     for v_question in
      select * from public.qwiz_bank b where b.owner_id=v_owner and b.topic_id=v_card.topic_id
       and b.kind in ('single','boolean','multi','match','order','sequence','text','number','date','estimate','riddle','puzzle','blitz','flag','portrait','image','audio','video','map','poll','hotspot')
      order by case when v_order='random' then random() end,
        case when v_order='reverse' then b.created_at end desc,
        case when v_order='sequential' then b.created_at end asc,
        b.id
      limit v_limit offset v_skip
     loop
       
       v_opts:=v_question.options;v_sol:=v_question.solution;v_match_choices:='[]'::jsonb;
       if v_question.kind in ('order','sequence') then
         select coalesce(jsonb_agg(x.val order by x.ordinality desc),'[]'::jsonb)
         into v_opts from jsonb_array_elements(v_question.options) with ordinality as x(val,ordinality);
         v_sol:=v_question.solution||jsonb_build_object('order',v_question.options);
       elsif v_question.kind='match' then
         select coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',1))) order by x.ordinality),'[]'::jsonb),
          coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',2))) order by x.ordinality desc),'[]'::jsonb),
          coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',2))) order by x.ordinality),'[]'::jsonb)
         into v_opts,v_match_choices,v_sol from jsonb_array_elements_text(v_question.options) with ordinality as x(value,ordinality);
         v_sol:=jsonb_build_object('matches',v_sol);
       end if;
       v_questions:=v_questions||jsonb_build_array(jsonb_build_object(
         'prompt',v_question.prompt,'options',v_opts,'match_choices',v_match_choices, 'solution',v_sol,
         'correct',case when v_sol ? 'correct' then (v_sol->>'correct')::integer else null end,
         'explanation',v_question.explanation,
         'media_url',coalesce(v_question.solution->>'media_url',''),
         'duration',v_secs,'topic',(select t.name from public.qwiz_topics t where t.id=v_card.topic_id),'round_title',v_card.title,'round_sound',coalesce(v_card.settings->>'sound','fanfare'),'card_type',v_card.card_type,
         'round_index',v_card.position,'kind',v_question.kind));
       v_count:=v_count+1;
     end loop;
     if v_count=0 then raise exception 'Раунд «%»: нет игровых вопросов в выбранной теме',v_card.title;end if;
   end if;
 end loop;
 if jsonb_array_length(v_questions)<1 or jsonb_array_length(v_questions)>100 then raise exception 'Сборка должна содержать 1–100 игровых вопросов'; end if;
 insert into public.org_next_quizzes(owner_id,title,questions)
 values(v_owner,coalesce(nullif(trim(p_title),''),v_build.title),v_questions)
 returning id into v_quiz;
 v_code:=public.org_next_create_room(v_quiz,coalesce(nullif(trim(p_title),''),v_build.title),p_teams);
 select id into v_room from public.org_next_rooms where code=v_code and owner_id=v_owner;
 insert into public.qwiz_room_builds(room_id,build_id,timeline) values(v_room,p_build,v_timeline);
 return jsonb_build_object('code',v_code,'room_id',v_room,'total_questions',jsonb_array_length(v_questions),
   'total_cards',jsonb_array_length(v_timeline));
end $$;
revoke execute on function public.qwiz_launch_build(uuid,text,integer) from public,anon;
grant execute on function public.qwiz_launch_build(uuid,text,integer) to authenticated;