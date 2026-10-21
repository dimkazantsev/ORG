-- Optional per-round team and player caps; NULL means unlimited.
begin;
create or replace function public.qwiz_answer_eligible(p_room uuid,p_player uuid,p_index integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare settings jsonb; c_teams int;c_players int;v_pos int;v_joined timestamptz;
begin
 if p_index<0 then return true;end if;
 select rb.timeline->coalesce((q.questions->p_index->>'round_index')::int,0)->'settings'
 into settings
 from public.org_next_rooms r join public.org_next_quizzes q on q.id=r.quiz_id
 left join public.qwiz_room_builds rb on rb.room_id=r.id where r.id=p_room;
 if settings is null then return true;end if;
 c_teams:=nullif(settings->>'team_cap','')::int;
 c_players:=nullif(settings->>'player_cap','')::int;
 if c_teams is not null then
  select t.position into v_pos from public.org_next_players p join public.org_next_teams t on t.id=p.team_id
   where p.id=p_player and p.room_id=p_room;
  if v_pos>c_teams then return false;end if;
 end if;
 if c_players is not null then
  select count(*) into v_pos from public.org_next_players a
  where a.room_id=p_room and
   (a.joined_at,a.id)<=(select p.joined_at,p.id from public.org_next_players p where p.id=p_player and p.room_id=p_room);
  if v_pos>c_players then return false;end if;
 end if;
 return true;
end $$;
revoke execute on function public.qwiz_answer_eligible(uuid,uuid,integer) from public,anon,authenticated;
create or replace function public.org_next_state(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room public.org_next_rooms%rowtype; v_host boolean; v_player public.org_next_players%rowtype;
 v_q jsonb; v_quiz public.org_next_quizzes%rowtype;
 v_teams jsonb; v_players jsonb; v_answers int;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход'; end if;
 select * into v_room from public.org_next_rooms where code=upper(trim(p_code));
 if not found then raise exception 'Комната не найдена'; end if;
 v_host:=v_room.owner_id=(select auth.uid()) and public.org_quiz_is_admin_check();
 select * into v_player from public.org_next_players p
 where p.room_id=v_room.id and (p.user_id=(select auth.uid())
 or exists(select 1 from public.qwiz_player_device_access d
    where d.room_id=v_room.id and d.player_id=p.id and d.user_id=(select auth.uid()))) limit 1;
 if not v_host and v_player.id is null then raise exception 'Нет доступа к комнате'; end if;
 select * into v_quiz from public.org_next_quizzes where id=v_room.quiz_id;
 if v_room.question_index>=0 then
  v_q:=v_quiz.questions->v_room.question_index;
  if v_room.phase in ('lobby','countdown','intermission') then v_q:=null;
  elsif not v_host and v_room.phase not in ('result','finished') then v_q:=v_q-'correct'-'explanation';end if;
 else v_q:=null; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'name',t.name,'score',t.score,
  'players',(select count(*) from public.org_next_players x where x.team_id=t.id)
  ) order by t.position),'[]'::jsonb)
 into v_teams from public.org_next_teams t where t.room_id=v_room.id;
 if v_host then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'group',p.group_name,'team_id',p.team_id) order by p.joined_at),'[]'::jsonb)
  into v_players from public.org_next_players p where p.room_id=v_room.id;
 else v_players:='[]'::jsonb; end if;
 select count(*) into v_answers from public.org_next_answers where room_id=v_room.id and question_index=v_room.question_index;
 return jsonb_build_object(
 'room_id',v_room.id,'code',v_room.code,'title',v_room.title,'phase',v_room.phase,
 'index',v_room.question_index,'total',jsonb_array_length(v_quiz.questions),
 'ends_at',v_room.ends_at,'question',v_q,'teams',v_teams,'players',v_players,
 'me',case when v_player.id is null then null else jsonb_build_object('id',v_player.id,'team_id',v_player.team_id) end,
 'host',v_host,'eligible',case when v_player.id is null then true else public.qwiz_answer_eligible(v_room.id,v_player.id,v_room.question_index) end,'activity',(select jsonb_build_object('type',a.kind,'title',a.title,'settings',a.settings) from public.qwiz_room_activity a where a.room_id=v_room.id),
 'answers_count',v_answers,
 'has_answer',case when v_player.id is null then false else exists(select 1 from public.org_next_answers where room_id=v_room.id and player_id=v_player.id and question_index=v_room.question_index) end);
end $$;


create or replace function public.org_next_answer(p_room uuid,p_choice integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room public.org_next_rooms%rowtype; v_player public.org_next_players%rowtype;
 v_question jsonb; v_correct boolean; v_points integer; v_ans uuid;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход'; end if;
 select * into v_room from public.org_next_rooms where id=p_room for share;
 if not found or v_room.phase!='question' or v_room.ends_at<=now()
 then raise exception 'Время ответа закончилось'; end if;
 select * into v_player from public.org_next_players p
 where p.room_id=p_room and (p.user_id=(select auth.uid())
 or exists(select 1 from public.qwiz_player_device_access d
    where d.room_id=p_room and d.player_id=p.id and d.user_id=(select auth.uid()))) limit 1;
 if not found then raise exception 'Игрок не найден'; end if;
 if not public.qwiz_answer_eligible(p_room,v_player.id,v_room.question_index) then raise exception 'Этот раунд не назначен вашей команде или участнику'; end if;
 select questions->v_room.question_index into v_question from public.org_next_quizzes where id=v_room.quiz_id;
 if p_choice is null or p_choice<0 or p_choice>=jsonb_array_length(v_question->'options') then raise exception 'Неверный вариант'; end if;
 v_correct:=p_choice=(v_question->>'correct')::integer;
 v_points:=case when v_correct then 100 else 0 end;
 insert into public.org_next_answers(room_id,player_id,question_index,choice,correct,points)
 values(p_room,v_player.id,v_room.question_index,p_choice,v_correct,v_points)
 on conflict(room_id,player_id,question_index) do nothing returning id into v_ans;
 if v_ans is null then raise exception 'Ответ уже принят'; end if;
 if v_points>0 then update public.org_next_teams set score=score+v_points where id=v_player.team_id and room_id=p_room; end if;
 return jsonb_build_object('accepted',true);
end $$;



revoke execute on function public.org_next_state(text) from public,anon;
grant execute on function public.org_next_state(text) to authenticated;
revoke execute on function public.org_next_answer(uuid,integer) from public,anon;
grant execute on function public.org_next_answer(uuid,integer) to authenticated;
commit;