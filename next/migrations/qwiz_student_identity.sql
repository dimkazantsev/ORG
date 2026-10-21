-- QWIZ-PARTY student credentials and one-time device pairing.
-- Passwords are salted bcrypt hashes, never stored in browser-readable tables.
begin;
create table if not exists public.qwiz_student_accounts(
 id uuid primary key default gen_random_uuid(),
 login text not null unique check(login ~ '^[a-z0-9._-]{3,25}$'),
 full_name text not null check(char_length(full_name) between 2 and 100),
 nickname text not null check(char_length(nickname) between 2 and 50),
 avatar text not null default 'fox' check(avatar in ('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear')),
 pass_hash text not null,
 failures int not null default 0,
 locked_until timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.qwiz_student_links(
 user_id uuid primary key references auth.users(id) on delete cascade,
 account_id uuid not null references public.qwiz_student_accounts(id) on delete cascade,
 connected_at timestamptz not null default now()
);
create index if not exists qwiz_student_links_account_idx on public.qwiz_student_links(account_id);
create table if not exists public.qwiz_student_pairings(
 token_hash bytea primary key,
 account_id uuid not null references public.qwiz_student_accounts(id) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index if not exists qwiz_pairings_expiry_idx on public.qwiz_student_pairings(expires_at);
alter table public.qwiz_student_accounts enable row level security;
alter table public.qwiz_student_links enable row level security;
alter table public.qwiz_student_pairings enable row level security;
revoke all on public.qwiz_student_accounts,public.qwiz_student_links,public.qwiz_student_pairings from public,anon,authenticated;

create or replace function public.qwiz_student_identity(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid;v_acct public.qwiz_student_accounts%rowtype;v_id uuid;
v_login text;v_pass text;v_name text;v_nick text;v_avatar text;v_token text;
v_stats jsonb;v_success boolean;
begin
 v_user:=(select auth.uid());
 if v_user is null then raise exception 'Сначала откройте вход участника'; end if;
 if p_action='register' then
  if exists(select 1 from public.qwiz_student_links where user_id=v_user) then raise exception 'Профиль уже привязан'; end if;
  v_login:=lower(trim(coalesce(p_data->>'login','')));
  v_pass:=coalesce(p_data->>'password','');
  v_name:=trim(coalesce(p_data->>'full_name',''));
  v_nick:=trim(coalesce(p_data->>'nickname',''));
  v_avatar:=coalesce(p_data->>'avatar','fox');
  if v_login !~ '^[a-z0-9._-]{3,25}$' then raise exception 'Логин: 3–25 латинских букв, цифр или ._-';end if;
  if octet_length(v_pass) not between 8 and 72 then raise exception 'Пароль: от 8 до 72 байт';end if;
  if char_length(v_name) not between 2 and 100 or char_length(v_nick) not between 2 and 50 then raise exception 'Заполните имя и ник';end if;
  if v_avatar not in ('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear') then raise exception 'Неизвестный аватар';end if;
  insert into public.qwiz_student_accounts(login,full_name,nickname,avatar,pass_hash)
  values(v_login,v_name,v_nick,v_avatar,extensions.crypt(v_pass,extensions.gen_salt('bf',11)))
  returning id into v_id;
  insert into public.qwiz_student_links(user_id,account_id) values(v_user,v_id);
  insert into public.qwiz_student_profiles(user_id,full_name,nickname,avatar)
   values(v_user,v_name,v_nick,v_avatar)
   on conflict(user_id) do update set full_name=excluded.full_name,nickname=excluded.nickname,avatar=excluded.avatar;
  return jsonb_build_object('ok',true,'registered',true);
 elsif p_action='login' then
  v_login:=lower(trim(coalesce(p_data->>'login','')));
  v_pass:=coalesce(p_data->>'password','');
  select * into v_acct from public.qwiz_student_accounts where login=v_login for update;
  if not found then return jsonb_build_object('ok',false,'message','Проверьте логин и пароль');end if;
  if v_acct.locked_until>now() then return jsonb_build_object('ok',false,'message','Слишком много попыток. Повторите позже');end if;
  v_success:=v_acct.pass_hash=extensions.crypt(v_pass,v_acct.pass_hash);
  if not v_success then
   update public.qwiz_student_accounts set failures=case when failures>=4 then 0 else failures+1 end,
    locked_until=case when failures>=4 then now()+interval '10 minutes' else null end where id=v_acct.id;
   return jsonb_build_object('ok',false,'message','Проверьте логин и пароль');
  end if;
  update public.qwiz_student_accounts set failures=0,locked_until=null where id=v_acct.id;
  insert into public.qwiz_student_links(user_id,account_id) values(v_user,v_acct.id)
   on conflict(user_id) do update set account_id=excluded.account_id,connected_at=now();
  insert into public.qwiz_student_profiles(user_id,full_name,nickname,avatar)
  values(v_user,v_acct.full_name,v_acct.nickname,v_acct.avatar)
   on conflict(user_id) do update set full_name=excluded.full_name,nickname=excluded.nickname,avatar=excluded.avatar;
  return jsonb_build_object('ok',true);
 elsif p_action='pair_create' then
   select a.* into v_acct from public.qwiz_student_accounts a
   join public.qwiz_student_links l on l.account_id=a.id where l.user_id=v_user;
   if not found then raise exception 'Сначала войдите в профиль';end if;
   v_token:=encode(extensions.gen_random_bytes(24),'hex');
   delete from public.qwiz_student_pairings where account_id=v_acct.id or expires_at<now();
   insert into public.qwiz_student_pairings(token_hash,account_id,expires_at)
     values(extensions.digest(v_token,'sha256'),v_acct.id,now()+interval '5 minutes');
   return jsonb_build_object('ok',true,'token',v_token,'expires_seconds',300);
 elsif p_action='pair_claim' then
   v_token:=lower(trim(coalesce(p_data->>'token','')));
   if v_token !~ '^[a-f0-9]{48}$' then return jsonb_build_object('ok',false,'message','Код недействителен');end if;
   with consumed as (delete from public.qwiz_student_pairings where token_hash=extensions.digest(v_token,'sha256')
     and expires_at>now() returning account_id)
   select account_id into v_id from consumed;
   if v_id is null then return jsonb_build_object('ok',false,'message','QR-код истёк или использован');end if;
   select * into v_acct from public.qwiz_student_accounts where id=v_id;
   insert into public.qwiz_student_links(user_id,account_id) values(v_user,v_id)
     on conflict(user_id) do update set account_id=excluded.account_id,connected_at=now();
   insert into public.qwiz_student_profiles(user_id,full_name,nickname,avatar)
   values(v_user,v_acct.full_name,v_acct.nickname,v_acct.avatar)
   on conflict(user_id) do update set full_name=excluded.full_name,nickname=excluded.nickname,avatar=excluded.avatar;
   return jsonb_build_object('ok',true);
 elsif p_action='update' then
  select a.* into v_acct from public.qwiz_student_accounts a
   join public.qwiz_student_links l on l.account_id=a.id where l.user_id=v_user;
  if not found then raise exception 'Профиль не создан';end if;
  v_name:=trim(coalesce(p_data->>'full_name',''));
  v_nick:=trim(coalesce(p_data->>'nickname',''));
  v_avatar:=coalesce(p_data->>'avatar','fox');
  if char_length(v_name) not between 2 and 100 or char_length(v_nick) not between 2 and 50
   or v_avatar not in ('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear')
   then raise exception 'Проверьте данные профиля';end if;
  update public.qwiz_student_accounts set full_name=v_name,nickname=v_nick,avatar=v_avatar where id=v_acct.id;
  update public.qwiz_student_profiles set full_name=v_name,nickname=v_nick,avatar=v_avatar
    where user_id in (select user_id from public.qwiz_student_links where account_id=v_acct.id);
  return jsonb_build_object('ok',true);
 elsif p_action='change_password' then
  select a.* into v_acct from public.qwiz_student_accounts a
   join public.qwiz_student_links l on l.account_id=a.id where l.user_id=v_user for update of a;
  if not found then raise exception 'Не найден профиль';end if;
  if coalesce(p_data->>'old_password','')='' or v_acct.pass_hash<>extensions.crypt(coalesce(p_data->>'old_password',''),v_acct.pass_hash) then
   return jsonb_build_object('ok',false,'message','Старый пароль неверный');end if;
  v_pass:=coalesce(p_data->>'new_password','');
  if octet_length(v_pass) not between 8 and 72 then raise exception 'Новый пароль должен содержать 8–72 байта';end if;
  update public.qwiz_student_accounts set pass_hash=extensions.crypt(v_pass,extensions.gen_salt('bf',11)) where id=v_acct.id;
  return jsonb_build_object('ok',true);
 elsif p_action='me' then
  select a.* into v_acct from public.qwiz_student_accounts a join public.qwiz_student_links l on l.account_id=a.id where l.user_id=v_user;
  if not found then return jsonb_build_object('registered',false);end if;
  select jsonb_build_object('games',count(distinct s.room_id),'answers',count(*),
    'correct',count(*) filter(where s.correct),'points',coalesce(sum(s.points),0))
   into v_stats from (
     select distinct on (p.room_id,a.question_index) p.room_id,a.question_index,a.correct,a.points
     from public.qwiz_student_links l join public.org_next_players p on p.user_id=l.user_id
     join public.org_next_answers a on a.player_id=p.id
     where l.account_id=v_acct.id order by p.room_id,a.question_index,a.created_at
   )s;
  return jsonb_build_object('registered',true,'login',v_acct.login,'full_name',v_acct.full_name,
    'nickname',v_acct.nickname,'avatar',v_acct.avatar,'stats',v_stats);
 else raise exception 'Неизвестное действие';end if;
end $$;
revoke execute on function public.qwiz_student_identity(text,jsonb) from public,anon;
grant execute on function public.qwiz_student_identity(text,jsonb) to authenticated;
commit;