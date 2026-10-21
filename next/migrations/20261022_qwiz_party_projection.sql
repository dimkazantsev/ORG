-- QWIZ-PARTY / non-destructive v2 upgrade, 2026-10-22.
-- Separate game schema objects; none of the ГОС.ID or old org_quiz_* tables are changed.
begin;
alter table public.org_next_teams
  drop constraint if exists org_next_teams_position_check;
alter table public.org_next_teams
  add constraint org_next_teams_position_check check(position between 1 and 15);
create or replace function public.org_next_create_room(p_quiz uuid,p_title text,p_teams integer default 4)
returns text language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_code text; v_n integer; i integer;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 if not exists(select 1 from public.org_next_quizzes where id=p_quiz and owner_id=(select auth.uid())) then raise exception 'Набор не найден'; end if;
 if p_teams not between 1 and 15 then raise exception 'Число команд: от 1 до 15'; end if;
 if (select count(*) from public.org_next_rooms where owner_id=(select auth.uid()) and phase!='finished')>=10 then raise exception 'Сначала завершите старые комнаты'; end if;
 for i in 1..15 loop
  v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  exit when not exists(select 1 from public.org_next_rooms where code=v_code);
 end loop;
 if exists(select 1 from public.org_next_rooms where code=v_code) then raise exception 'Не удалось создать код'; end if;
 insert into public.org_next_rooms(quiz_id,owner_id,code,title)
 values(p_quiz,(select auth.uid()),v_code,left(trim(coalesce(nullif(p_title,''),'Новая игра')),140)) returning id into v_id;
 for v_n in 1..p_teams loop
  insert into public.org_next_teams(room_id,position,name) values(v_id,v_n,'Команда '||v_n);
 end loop;
 return v_code;
end $$;


create or replace function public.org_next_join(p_code text,p_name text,p_group text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room public.org_next_rooms%rowtype; v_team uuid; v_player uuid;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход'; end if;
 if char_length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Укажите имя и фамилию'; end if;
 select * into v_room from public.org_next_rooms where code=upper(trim(p_code)) for update;
 if not found or v_room.phase='finished' then raise exception 'Комната не найдена или закрыта'; end if;
 select id into v_player from public.org_next_players where room_id=v_room.id and user_id=(select auth.uid());
 if v_player is not null then return jsonb_build_object('code',v_room.code,'player_id',v_player); end if;
 if v_room.phase!='lobby' then raise exception 'Игра уже началась'; end if;
 if (select count(*) from public.org_next_players where room_id=v_room.id)>=80 then raise exception 'Комната заполнена'; end if;
 select t.id into v_team from public.org_next_teams t
 where t.room_id=v_room.id
 order by (select count(*) from public.org_next_players p where p.team_id=t.id),t.position
 limit 1;
 insert into public.org_next_players(room_id,user_id,name,group_name,team_id)
 values(v_room.id,(select auth.uid()),trim(p_name),left(trim(coalesce(p_group,'')),50),v_team)
 on conflict(room_id,user_id) do update set name=excluded.name,group_name=excluded.group_name
 returning id into v_player;
 return jsonb_build_object('code',v_room.code,'player_id',v_player);
end $$;


create or replace function public.org_next_presenter_state(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room public.org_next_rooms%rowtype; v_question jsonb; v_questions jsonb; v_user uuid;
begin
 v_user := (select auth.uid());
 if v_user is null then raise exception 'Необходим вход'; end if;
 select * into v_room from public.org_next_rooms where code=upper(trim(p_code));
 if not found then raise exception 'Комната не найдена'; end if;
 if v_room.owner_id <> v_user and
    not exists (select 1 from public.org_next_players p where p.room_id=v_room.id and p.user_id=v_user)
 then raise exception 'Нет доступа к экрану'; end if;
 select questions into v_questions from public.org_next_quizzes where id=v_room.quiz_id;
 if v_room.question_index >= 0 and v_room.phase in ('question','result') then
   v_question := v_questions -> v_room.question_index;
   -- The projector never receives server answer keys, including after reveal.
   v_question := v_question - 'correct' - 'explanation';
 else
   v_question := null;
 end if;
 return jsonb_build_object(
   'code',v_room.code,'title',v_room.title,'phase',v_room.phase,
   'index',v_room.question_index,
   'total',jsonb_array_length(v_questions),
   'question',v_question,'ends_at',v_room.ends_at
 );
end $$;
revoke execute on function public.org_next_presenter_state(text) from public,anon;
grant execute on function public.org_next_presenter_state(text) to authenticated;

commit;
