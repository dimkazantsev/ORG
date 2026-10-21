-- Multi-device student account shares a single gameplay identity per room.
begin;
alter table public.org_next_players add column if not exists student_account_id uuid
 references public.qwiz_student_accounts(id);
create unique index if not exists qwiz_player_room_account_unique
 on public.org_next_players(room_id,student_account_id) where student_account_id is not null;
create table if not exists public.qwiz_player_device_access(
 room_id uuid not null references public.org_next_rooms(id) on delete cascade,
 player_id uuid not null references public.org_next_players(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(room_id,user_id)
);
create index if not exists qwiz_player_device_player_idx on public.qwiz_player_device_access(player_id);
alter table public.qwiz_player_device_access enable row level security;
revoke all on public.qwiz_player_device_access from public,anon,authenticated;
create or replace function public.org_next_join(p_code text,p_name text,p_group text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room public.org_next_rooms%rowtype; v_team uuid; v_player uuid; v_account uuid;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход'; end if;
 if char_length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Укажите имя и фамилию'; end if;
 select * into v_room from public.org_next_rooms where code=upper(trim(p_code)) for update;
 if not found or v_room.phase='finished' then raise exception 'Комната не найдена или закрыта'; end if;
 select account_id into v_account from public.qwiz_student_links where user_id=(select auth.uid());
 select p.id into v_player from public.org_next_players p
 where p.room_id=v_room.id and (p.user_id=(select auth.uid())
  or exists(select 1 from public.qwiz_player_device_access d where d.player_id=p.id and d.user_id=(select auth.uid())))
 limit 1;
 if v_player is not null then return jsonb_build_object('code',v_room.code,'player_id',v_player); end if;
 if v_account is not null then
  select p.id into v_player from public.org_next_players p
    left join public.qwiz_student_links l on l.user_id=p.user_id
    where p.room_id=v_room.id and (p.student_account_id=v_account or l.account_id=v_account)
    limit 1;
  if v_player is not null then
   update public.org_next_players set student_account_id=v_account where id=v_player and student_account_id is null;
   insert into public.qwiz_player_device_access(room_id,player_id,user_id)
   values(v_room.id,v_player,(select auth.uid()))
   on conflict(room_id,user_id) do update set player_id=excluded.player_id;
   return jsonb_build_object('code',v_room.code,'player_id',v_player,'rejoined',true);
  end if;
 end if;
 if v_room.phase!='lobby' then raise exception 'Игра уже началась'; end if;
 if (select count(*) from public.org_next_players where room_id=v_room.id)>=80 then raise exception 'Комната заполнена'; end if;
 select t.id into v_team from public.org_next_teams t
 where t.room_id=v_room.id
 order by (select count(*) from public.org_next_players p where p.team_id=t.id),t.position
 limit 1;
 insert into public.org_next_players(room_id,user_id,name,group_name,team_id,student_account_id)
 values(v_room.id,(select auth.uid()),trim(p_name),left(trim(coalesce(p_group,'')),50),v_team,v_account)
 on conflict(room_id,user_id) do update set name=excluded.name,group_name=excluded.group_name
 returning id into v_player;
 insert into public.qwiz_player_device_access(room_id,player_id,user_id)
 values(v_room.id,v_player,(select auth.uid()))
 on conflict(room_id,user_id) do update set player_id=excluded.player_id;
 return jsonb_build_object('code',v_room.code,'player_id',v_player);
end $$;

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
 'host',v_host,'answers_count',v_answers,
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


revoke execute on function public.org_next_join(text,text,text) from public,anon;
revoke execute on function public.org_next_state(text) from public,anon;
revoke execute on function public.org_next_answer(uuid,integer) from public,anon;
grant execute on function public.org_next_join(text,text,text) to authenticated;
grant execute on function public.org_next_state(text) to authenticated;
grant execute on function public.org_next_answer(uuid,integer) to authenticated;
commit;