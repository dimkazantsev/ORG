create or replace function public.qwiz_teacher_stats()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 v_user:=(select auth.uid());
 if v_user is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 return jsonb_build_object(
  'overview',(select jsonb_build_object('rooms',count(*),'completed',count(*)filter(where phase='finished'))
              from public.org_next_rooms where owner_id=v_user),
  'students',(select coalesce(jsonb_agg(row_to_json(z) order by z.score desc),'[]'::jsonb) from
    (select p.name,p.group_name as "group",count(distinct p.room_id) games,count(a.id) answers,
      count(a.id) filter(where a.correct) correct,coalesce(sum(a.points),0) score
     from public.org_next_players p join public.org_next_rooms r on r.id=p.room_id
     left join public.org_next_answers a on a.player_id=p.id where r.owner_id=v_user
     group by p.name,p.group_name order by score desc limit 150)z),
  'by_topic',(select coalesce(jsonb_agg(row_to_json(t) order by t.answers desc),'[]'::jsonb) from
   (select coalesce(nullif(x.questions->a.question_index->>'topic',''),'Без темы') topic,
     count(*) answers,count(*)filter(where a.correct) correct
    from public.org_next_answers a
    join public.org_next_rooms r on r.id=a.room_id
    join public.org_next_quizzes x on x.id=r.quiz_id
    where r.owner_id=v_user
    group by 1 order by answers desc limit 30)t),
  'by_question',(select coalesce(jsonb_agg(row_to_json(t) order by t.answers desc),'[]'::jsonb) from
   (select left(coalesce(x.questions->a.question_index->>'prompt','Вопрос'),140) prompt,
     count(*) answers,count(*)filter(where a.correct) correct
    from public.org_next_answers a
    join public.org_next_rooms r on r.id=a.room_id
    join public.org_next_quizzes x on x.id=r.quiz_id
    where r.owner_id=v_user
    group by 1 order by answers desc limit 30)t)
 );
end $$;
revoke execute on function public.qwiz_teacher_stats() from public,anon;
grant execute on function public.qwiz_teacher_stats() to authenticated;