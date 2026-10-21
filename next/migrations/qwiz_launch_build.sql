-- Compile a saved build into a room-specific immutable quiz snapshot.
-- Rich question definitions remain in the bank; only supported answer
-- mechanics (single/boolean/flag/portrait/image) run through the v2 scoring engine.
create or replace function public.qwiz_launch_build(p_build uuid,p_title text default null,p_teams integer default 4)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_build public.qwiz_builds%rowtype; v_card public.qwiz_build_cards%rowtype;
 v_question public.qwiz_bank%rowtype; v_questions jsonb:='[]'::jsonb; v_timeline jsonb:='[]'::jsonb;
 v_n integer; v_skip integer; v_secs integer; v_order text; v_limit integer;
 v_quiz uuid; v_code text; v_room uuid; v_count integer;
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
       and b.kind in ('single','boolean','flag','portrait','image')
      order by case when v_order='random' then random() end,
        case when v_order='reverse' then b.created_at end desc,
        case when v_order='sequential' then b.created_at end asc,
        b.id
      limit v_limit offset v_skip
     loop
       v_questions:=v_questions||jsonb_build_array(jsonb_build_object(
         'prompt',v_question.prompt,'options',v_question.options,
         'correct',(v_question.solution->>'correct')::integer,
         'explanation',v_question.explanation,
         'duration',v_secs,'topic',v_card.title,'card_type',v_card.card_type,
         'round_index',v_card.position,'kind',v_question.kind));
       v_count:=v_count+1;
     end loop;
     if v_count=0 then raise exception 'Раунд «%»: нет совместимых вопросов в выбранной теме',v_card.title;end if;
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