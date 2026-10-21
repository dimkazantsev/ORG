create or replace function public.org_next_advance(p_room uuid,p_action text)
returns text language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype; q jsonb; v_questions jsonb; timeline jsonb;
 v_duration integer;v_next integer;v_prev_card integer;v_next_card jsonb;v_kind text;
 v_card_pos integer;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 select * into r from public.org_next_rooms where id=p_room for update;
 if not found or r.owner_id<>(select auth.uid()) then raise exception 'Комната не найдена';end if;
 select quiz.questions into v_questions from public.org_next_quizzes quiz where quiz.id=r.quiz_id;
 select rb.timeline into timeline from public.qwiz_room_builds rb where rb.room_id=p_room;
 if p_action='finish' then
  update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
  delete from public.qwiz_room_activity where room_id=p_room;
 elsif p_action='start' and r.phase='lobby' then
  if timeline is not null and jsonb_array_length(timeline)>0 and timeline->0->>'type'<>'round' then
   v_next_card:=timeline->0;
   insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
    values(p_room,0,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
    on conflict(room_id) do update set card_position=0,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
   update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
  else
   q:=v_questions->0;
   if timeline is not null then
    update public.org_next_rooms set phase='countdown',question_index=0,ends_at=now()+interval '5 seconds' where id=p_room;
   else
    v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
    update public.org_next_rooms set phase='question',question_index=0,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
   end if;
  end if;
 elsif p_action='reveal' and r.phase='question' then
  update public.org_next_rooms set phase='result',ends_at=null where id=p_room;
 elsif p_action='next' and r.phase='intermission' then
  select a.card_position into v_card_pos from public.qwiz_room_activity a where a.room_id=p_room;
  if v_card_pos is null or timeline is null then raise exception 'Переход не найден';end if;
  v_next_card:=timeline->(v_card_pos+1);
  if v_next_card is null or v_next_card->>'type'='finale' then
    update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
    delete from public.qwiz_room_activity where room_id=p_room;
  elsif v_next_card->>'type'='round' then
    v_next:=coalesce((v_next_card->>'first_question')::int,r.question_index+1);
    update public.org_next_rooms set phase='countdown',question_index=v_next,ends_at=now()+interval '5 seconds' where id=p_room;
    delete from public.qwiz_room_activity where room_id=p_room;
  else
    insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
      values(p_room,v_card_pos+1,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
      on conflict(room_id) do update set card_position=excluded.card_position,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
    update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
  end if;
 elsif p_action='next' and r.phase='result' then
  v_next:=r.question_index+1;
  if timeline is null then
    if v_next>=jsonb_array_length(v_questions) then
      update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
    else
      q:=v_questions->v_next;
      v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
      update public.org_next_rooms set phase='question',question_index=v_next,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
    end if;
  else
    v_prev_card:=coalesce((v_questions->r.question_index->>'round_index')::int,0);
    if v_next<jsonb_array_length(v_questions) and
     coalesce((v_questions->v_next->>'round_index')::int,0)=v_prev_card then
      q:=v_questions->v_next;
      v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
      update public.org_next_rooms set phase='question',question_index=v_next,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
    else
      v_next_card:=timeline->(v_prev_card+1);
      if v_next_card is null or v_next_card->>'type'='finale' then
       update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
      elsif v_next_card->>'type'='round' then
       update public.org_next_rooms set phase='countdown',question_index=v_next,ends_at=now()+interval '5 seconds' where id=p_room;
      else
       insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
       values(p_room,v_prev_card+1,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
       on conflict(room_id) do update set card_position=excluded.card_position,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
       update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
      end if;
    end if;
  end if;
 else raise exception 'Недопустимое действие для текущего этапа';end if;
 return (select phase from public.org_next_rooms where id=p_room);
end $$;
