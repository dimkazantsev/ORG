-- ORG/PARTY v2, isolated non-destructive schema (five core tables).
-- Existing org_quiz_* and ГОС.ID objects are not changed.
create table if not exists public.org_next_quizzes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 title text not null check (char_length(title) between 2 and 140),
 questions jsonb not null default '[]'::jsonb check(jsonb_typeof(questions)='array'),
 created_at timestamptz not null default now()
);
create table if not exists public.org_next_rooms (
 id uuid primary key default gen_random_uuid(),
 quiz_id uuid not null references public.org_next_quizzes(id),
 owner_id uuid not null references auth.users(id),
 code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
 title text not null,
 phase text not null default 'lobby' check(phase in ('lobby','question','result','finished')),
 question_index integer not null default -1,
 ends_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.org_next_teams (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.org_next_rooms(id) on delete cascade,
 position integer not null check(position between 1 and 12),
 name text not null,
 score integer not null default 0 check(score >= 0),
 unique(room_id,position),
 unique(id,room_id)
);
create table if not exists public.org_next_players (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.org_next_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 name text not null check(char_length(name) between 2 and 100),
 group_name text not null default '',
 team_id uuid not null,
 joined_at timestamptz not null default now(),
 unique(room_id,user_id),
 foreign key(team_id,room_id) references public.org_next_teams(id,room_id),
 unique(id,room_id)
);
create table if not exists public.org_next_answers (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.org_next_rooms(id) on delete cascade,
 player_id uuid not null,
 question_index integer not null check(question_index >= 0),
 choice integer not null check(choice >= 0 and choice <= 5),
 correct boolean not null,
 points integer not null check(points between 0 and 100),
 created_at timestamptz not null default now(),
 unique(room_id,player_id,question_index),
 foreign key(player_id,room_id) references public.org_next_players(id,room_id)
);
create index if not exists org_next_players_room_team_idx on public.org_next_players(room_id,team_id);
create index if not exists org_next_answers_room_question_idx on public.org_next_answers(room_id,question_index);

alter table public.org_next_quizzes enable row level security;
alter table public.org_next_rooms enable row level security;
alter table public.org_next_teams enable row level security;
alter table public.org_next_players enable row level security;
alter table public.org_next_answers enable row level security;
revoke all on public.org_next_quizzes,public.org_next_rooms,public.org_next_teams,public.org_next_players,public.org_next_answers from public,anon,authenticated;

create or replace function public.org_next_catalog()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'count',jsonb_array_length(q.questions)) order by q.created_at desc),'[]'::jsonb)
 into v from public.org_next_quizzes q where q.owner_id=(select auth.uid());
 return v;
end $$;

create or replace function public.org_next_save_quiz(p_title text,p_questions jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_q jsonb; v_n integer;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 2 and 140
  or jsonb_typeof(p_questions) is distinct from 'array'
  or jsonb_array_length(p_questions) not between 1 and 100 then raise exception 'Проверьте название и вопросы (от 1 до 100)'; end if;
 for v_q in select value from jsonb_array_elements(p_questions)
 loop
  if jsonb_typeof(v_q->'options') is distinct from 'array'
     or char_length(trim(coalesce(v_q->>'prompt',''))) < 5 then raise exception 'Некорректный вопрос'; end if;
  v_n:=jsonb_array_length(v_q->'options');
  if v_n not between 2 and 6 or jsonb_typeof(v_q->'correct') is distinct from 'number'
     or (v_q->>'correct')::int not between 0 and (v_n-1) then raise exception 'Некорректные варианты ответов'; end if;
 end loop;
 insert into public.org_next_quizzes(owner_id,title,questions)
 values ((select auth.uid()),trim(p_title),p_questions) returning id into v_id;
 return v_id;
end $$;

create or replace function public.org_next_import_legacy(p_quiz uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_title text; v_questions jsonb;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 select title into v_title from public.org_quiz_sets where id=p_quiz and archived_at is null;
 if v_title is null then raise exception 'Набор не найден'; end if;
 select jsonb_agg(jsonb_build_object(
  'prompt',q.prompt,'options',q.options,'correct',k.correct_option,
  'duration',greatest(10,least(120,coalesce(q.time_limit_sec,30))),
  'explanation',coalesce(q.explanation,'')) order by q.order_index,q.id)
 into v_questions
 from public.org_quiz_questions q
 join quiz_private.org_quiz_keys k on k.question_id=q.id
 where q.quiz_id=p_quiz and q.question_type='single'
 and jsonb_typeof(q.options)='array'
 and jsonb_array_length(q.options) between 2 and 6
 and k.correct_option between 0 and (jsonb_array_length(q.options)-1);
 if coalesce(jsonb_array_length(v_questions),0)=0 then raise exception 'Нет совместимых тестовых вопросов'; end if;
 if jsonb_array_length(v_questions)>100 then
  select jsonb_agg(value) into v_questions from (
   select value from jsonb_array_elements(v_questions) with ordinality as e(value,n) where n<=100 order by n
  ) s;
 end if;
 v_id:=public.org_next_save_quiz(v_title,v_questions);
 return jsonb_build_object('quiz_id',v_id,'imported',jsonb_array_length(v_questions));
end $$;

create or replace function public.org_next_create_room(p_quiz uuid,p_title text,p_teams integer default 4)
returns text language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_code text; v_n integer; i integer;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 if not exists(select 1 from public.org_next_quizzes where id=p_quiz and owner_id=(select auth.uid())) then raise exception 'Набор не найден'; end if;
 if p_teams not between 1 and 12 then raise exception 'Число команд: от 1 до 12'; end if;
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
 select * into v_room from public.org_next_rooms where code=upper(trim(p_code));
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
 select * into v_player from public.org_next_players where room_id=v_room.id and user_id=(select auth.uid());
 if not v_host and v_player.id is null then raise exception 'Нет доступа к комнате'; end if;
 select * into v_quiz from public.org_next_quizzes where id=v_room.quiz_id;
 if v_room.question_index>=0 then
  v_q:=v_quiz.questions->v_room.question_index;
  if not v_host and v_room.phase='question' then v_q:=v_q-'correct'-'explanation'; end if;
  if v_room.phase='lobby' then v_q:=null; end if;
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

create or replace function public.org_next_advance(p_room uuid,p_action text)
returns text language plpgsql security definer set search_path='' as $$
declare v_room public.org_next_rooms%rowtype; v_q jsonb; v_questions jsonb; v_duration integer;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 select * into v_room from public.org_next_rooms where id=p_room for update;
 if not found or v_room.owner_id<>(select auth.uid()) then raise exception 'Комната не найдена'; end if;
 select questions into v_questions from public.org_next_quizzes where id=v_room.quiz_id;
 if p_action='finish' then
  update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
 elsif p_action='start' and v_room.phase='lobby' then
  v_q:=v_questions->0;
  v_duration:=greatest(10,least(120,coalesce(nullif(v_q->>'duration','')::integer,30)));
  update public.org_next_rooms set phase='question',question_index=0,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
 elsif p_action='reveal' and v_room.phase='question' then
  update public.org_next_rooms set phase='result',ends_at=null where id=p_room;
 elsif p_action='next' and v_room.phase='result' then
  if v_room.question_index+1>=jsonb_array_length(v_questions) then
   update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
  else
   v_q:=v_questions->(v_room.question_index+1);
   v_duration:=greatest(10,least(120,coalesce(nullif(v_q->>'duration','')::integer,30)));
   update public.org_next_rooms set phase='question',question_index=question_index+1,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
  end if;
 else raise exception 'Недопустимое действие для текущего этапа'; end if;
 return (select phase from public.org_next_rooms where id=p_room);
end $$;

create or replace function public.org_next_assign(p_room uuid,p_player uuid,p_team uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check()
 or not exists(select 1 from public.org_next_rooms where id=p_room and owner_id=(select auth.uid()) and phase='lobby')
 or not exists(select 1 from public.org_next_teams where room_id=p_room and id=p_team)
 then raise exception 'Переназначение недоступно'; end if;
 update public.org_next_players set team_id=p_team where room_id=p_room and id=p_player;
 return found;
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
 select * into v_player from public.org_next_players where room_id=p_room and user_id=(select auth.uid());
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

revoke execute on function public.org_next_catalog() from public,anon;
revoke execute on function public.org_next_save_quiz(text,jsonb) from public,anon;
revoke execute on function public.org_next_import_legacy(uuid) from public,anon;
revoke execute on function public.org_next_create_room(uuid,text,integer) from public,anon;
revoke execute on function public.org_next_join(text,text,text) from public,anon;
revoke execute on function public.org_next_state(text) from public,anon;
revoke execute on function public.org_next_advance(uuid,text) from public,anon;
revoke execute on function public.org_next_assign(uuid,uuid,uuid) from public,anon;
revoke execute on function public.org_next_answer(uuid,integer) from public,anon;
grant execute on function public.org_next_catalog() to authenticated;
grant execute on function public.org_next_save_quiz(text,jsonb) to authenticated;
grant execute on function public.org_next_import_legacy(uuid) to authenticated;
grant execute on function public.org_next_create_room(uuid,text,integer) to authenticated;
grant execute on function public.org_next_join(text,text,text) to authenticated;
grant execute on function public.org_next_state(text) to authenticated;
grant execute on function public.org_next_advance(uuid,text) to authenticated;
grant execute on function public.org_next_assign(uuid,uuid,uuid) to authenticated;
grant execute on function public.org_next_answer(uuid,integer) to authenticated;
