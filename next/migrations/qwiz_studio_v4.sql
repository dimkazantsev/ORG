-- QWIZ-PARTY: content studio and public projection (non-destructive).
-- Does not modify legacy org_quiz_* or ГОС.ID tables.
begin;
create table if not exists public.qwiz_topics (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 name text not null check (char_length(name) between 2 and 90),
 category text not null default 'Общие знания',
 created_at timestamptz not null default now()
);
create index if not exists qwiz_topics_owner_idx on public.qwiz_topics(owner_id,category);
create table if not exists public.qwiz_bank (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 topic_id uuid references public.qwiz_topics(id),
 kind text not null check(kind in ('single','boolean','multi','match','order','text','number','image','audio','video','flag','portrait','map','date','estimate','sequence','hotspot','puzzle','riddle','auction','blitz','poll')),
 prompt text not null check(char_length(prompt) between 4 and 3000),
 options jsonb not null default '[]'::jsonb check(jsonb_typeof(options)='array'),
 solution jsonb not null default '{}'::jsonb check(jsonb_typeof(solution)='object'),
 explanation text not null default '',
 difficulty smallint not null default 2 check(difficulty between 1 and 5),
 tags text[] not null default '{}',
 created_at timestamptz not null default now()
);
create index if not exists qwiz_bank_owner_topic_idx on public.qwiz_bank(owner_id,topic_id,created_at desc);
create index if not exists qwiz_bank_kind_idx on public.qwiz_bank(owner_id,kind);
create table if not exists public.qwiz_builds (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 title text not null check(char_length(title) between 2 and 140),
 description text not null default '',
 updated_at timestamptz not null default now()
);
create table if not exists public.qwiz_build_cards (
 id uuid primary key default gen_random_uuid(),
 build_id uuid not null references public.qwiz_builds(id) on delete cascade,
 position integer not null check(position between 0 and 59),
 card_type text not null check(card_type in ('round','intro','break','team_stats','player_stats','bonus','duel','finale')),
 title text not null,
 icon text not null default 'layers',
 topic_id uuid references public.qwiz_topics(id),
 settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings)='object'),
 unique(build_id,position)
);
create table if not exists public.qwiz_room_builds (
 room_id uuid primary key references public.org_next_rooms(id) on delete cascade,
 build_id uuid references public.qwiz_builds(id) on delete set null,
 timeline jsonb not null default '[]'::jsonb check(jsonb_typeof(timeline)='array'),
 created_at timestamptz not null default now()
);
create table if not exists public.qwiz_student_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check(char_length(full_name) between 2 and 100),
 nickname text not null check(char_length(nickname) between 2 and 50),
 avatar text not null default 'fox' check(avatar in ('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear')),
 updated_at timestamptz not null default now()
);
alter table public.qwiz_topics enable row level security;
alter table public.qwiz_bank enable row level security;
alter table public.qwiz_builds enable row level security;
alter table public.qwiz_build_cards enable row level security;
alter table public.qwiz_room_builds enable row level security;
alter table public.qwiz_student_profiles enable row level security;
revoke all on public.qwiz_topics,public.qwiz_bank,public.qwiz_builds,public.qwiz_build_cards,public.qwiz_room_builds,public.qwiz_student_profiles from public,anon,authenticated;

-- Security-definer RPCs only return curated data and authorize every mutation.
create or replace function public.qwiz_studio(p_action text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_id uuid; v_build uuid; v_obj jsonb; v_cards jsonb;
v_cards_arr jsonb; v_card jsonb; v_pos integer; v_topic uuid; v_kind text;
begin
 v_user := (select auth.uid());
 if v_user is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 if p_action='overview' then
  return jsonb_build_object(
   'topics',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'category',t.category) order by t.category,t.name),'[]'::jsonb) from public.qwiz_topics t where t.owner_id=v_user),
   'builds',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,'description',b.description,'updated_at',b.updated_at) order by b.updated_at desc),'[]'::jsonb) from public.qwiz_builds b where b.owner_id=v_user),
   'types',jsonb_build_array('single','boolean','multi','match','order','text','number','image','audio','video','flag','portrait','map','date','estimate','sequence','hotspot','puzzle','riddle','auction','blitz','poll')
  );
 elsif p_action='topic_save' then
  if char_length(trim(coalesce(p_input->>'name',''))) not between 2 and 90 then raise exception 'Укажите название темы'; end if;
  if coalesce(p_input->>'id','')<>'' then
   update public.qwiz_topics set name=trim(p_input->>'name'),category=left(coalesce(p_input->>'category','Общие знания'),80)
   where id=(p_input->>'id')::uuid and owner_id=v_user returning id into v_id;
  else
   insert into public.qwiz_topics(owner_id,name,category)
   values(v_user,trim(p_input->>'name'),left(coalesce(p_input->>'category','Общие знания'),80)) returning id into v_id;
  end if;
  if v_id is null then raise exception 'Тема не найдена'; end if;
  return jsonb_build_object('id',v_id);
 elsif p_action='questions' then
  return jsonb_build_object(
   'total',(select count(*) from public.qwiz_bank q where q.owner_id=v_user and (nullif(p_input->>'topic_id','') is null or q.topic_id=(p_input->>'topic_id')::uuid)
     and (nullif(p_input->>'kind','') is null or q.kind=p_input->>'kind')
     and (nullif(p_input->>'search','') is null or q.prompt ilike '%'||(p_input->>'search')||'%')),
   'items',(select coalesce(jsonb_agg(s.data order by s.ord),'[]'::jsonb) from
      (select jsonb_build_object('id',q.id,'prompt',q.prompt,'topic_id',q.topic_id,'kind',q.kind,'difficulty',q.difficulty,
       'options',q.options,'explanation',q.explanation,'tags',q.tags,
       'solution',q.solution) as data,
       row_number() over(order by
        case when p_input->>'sort'='oldest' then q.created_at end asc nulls last,
        case when p_input->>'sort'='difficulty' then q.difficulty end desc nulls last,
        q.created_at desc) ord
       from public.qwiz_bank q where q.owner_id=v_user
       and (nullif(p_input->>'topic_id','') is null or q.topic_id=(p_input->>'topic_id')::uuid)
       and (nullif(p_input->>'kind','') is null or q.kind=p_input->>'kind')
       and (nullif(p_input->>'search','') is null or q.prompt ilike '%'||(p_input->>'search')||'%')
       order by ord limit 100 offset greatest(0,least(100000,coalesce((p_input->>'offset')::int,0)))
      )s)
  );
 elsif p_action='question_save' then
  v_kind := coalesce(p_input->>'kind','single');
  if v_kind not in ('single','boolean','multi','match','order','text','number','image','audio','video','flag','portrait','map','date','estimate','sequence','hotspot','puzzle','riddle','auction','blitz','poll') then raise exception 'Неизвестный тип'; end if;
  if char_length(trim(coalesce(p_input->>'prompt',''))) not between 4 and 3000 then raise exception 'Текст вопроса слишком короткий или длинный'; end if;
  if jsonb_typeof(p_input->'options') is distinct from 'array' or jsonb_typeof(p_input->'solution') is distinct from 'object' then raise exception 'Некорректные данные ответа'; end if;
  if v_kind in ('single','boolean','flag','portrait','image') then
   if jsonb_array_length(p_input->'options') not between 2 and 6 or
   jsonb_typeof(p_input->'solution'->'correct') is distinct from 'number'
   or (p_input->'solution'->>'correct')::int not between 0 and jsonb_array_length(p_input->'options')-1 then
    raise exception 'Для этого типа нужны 2–6 вариантов и номер правильного'; end if;
  end if;
  if p_input ? 'topic_id' and nullif(p_input->>'topic_id','') is not null then
   v_topic:=(p_input->>'topic_id')::uuid;
   if not exists(select 1 from public.qwiz_topics where id=v_topic and owner_id=v_user) then raise exception 'Тема недоступна'; end if;
  else v_topic:=null;end if;
  if nullif(p_input->>'id','') is not null then
    update public.qwiz_bank set topic_id=v_topic,kind=v_kind,prompt=trim(p_input->>'prompt'),options=p_input->'options',
     solution=p_input->'solution',difficulty=greatest(1,least(5,coalesce((p_input->>'difficulty')::int,2))),
     explanation=left(coalesce(p_input->>'explanation',''),3000)
    where id=(p_input->>'id')::uuid and owner_id=v_user returning id into v_id;
  else
    insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,difficulty,explanation)
    values(v_user,v_topic,v_kind,trim(p_input->>'prompt'),p_input->'options',p_input->'solution',
       greatest(1,least(5,coalesce((p_input->>'difficulty')::int,2))),left(coalesce(p_input->>'explanation',''),3000))
    returning id into v_id;
  end if;
  if v_id is null then raise exception 'Вопрос не найден'; end if;
  return jsonb_build_object('id',v_id);
 elsif p_action='build_get' then
   v_id:=(p_input->>'id')::uuid;
   if not exists(select 1 from public.qwiz_builds where id=v_id and owner_id=v_user) then raise exception 'Сборка не найдена'; end if;
   return jsonb_build_object('build',(select jsonb_build_object('id',b.id,'title',b.title,'description',b.description) from public.qwiz_builds b where id=v_id),
    'cards',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'type',c.card_type,'title',c.title,'icon',c.icon,'topic_id',c.topic_id,'settings',c.settings) order by c.position),'[]'::jsonb) from public.qwiz_build_cards c where c.build_id=v_id));
 elsif p_action='build_save' then
   if char_length(trim(coalesce(p_input->>'title',''))) not between 2 and 140 or jsonb_typeof(p_input->'cards') is distinct from 'array' or jsonb_array_length(p_input->'cards') not between 1 and 60 then
    raise exception 'Укажите название и от 1 до 60 карточек'; end if;
   if nullif(p_input->>'id','') is not null then
    update public.qwiz_builds set title=trim(p_input->>'title'),description=left(coalesce(p_input->>'description',''),500),updated_at=now()
    where id=(p_input->>'id')::uuid and owner_id=v_user returning id into v_id;
    if v_id is null then raise exception 'Сборка не найдена'; end if;
    delete from public.qwiz_build_cards where build_id=v_id;
   else
    insert into public.qwiz_builds(owner_id,title,description) values(v_user,trim(p_input->>'title'),left(coalesce(p_input->>'description',''),500)) returning id into v_id;
   end if;
   v_pos:=0;
   for v_card in select value from jsonb_array_elements(p_input->'cards') loop
    if coalesce(v_card->>'type','') not in ('round','intro','break','team_stats','player_stats','bonus','duel','finale') then raise exception 'Неверный тип карточки'; end if;
    if jsonb_typeof(v_card->'settings') is distinct from 'object' then raise exception 'Неверные настройки карточки'; end if;
    v_topic:=nullif(v_card->>'topic_id','')::uuid;
    if v_topic is not null and not exists(select 1 from public.qwiz_topics where id=v_topic and owner_id=v_user) then raise exception 'Чужая тема';end if;
    insert into public.qwiz_build_cards(build_id,position,card_type,title,icon,topic_id,settings)
    values(v_id,v_pos,v_card->>'type',left(coalesce(nullif(v_card->>'title',''),'Раунд'),120),
      left(coalesce(v_card->>'icon','layers'),40),v_topic,v_card->'settings');
    v_pos:=v_pos+1;
   end loop;
   if (select card_type from public.qwiz_build_cards where build_id=v_id order by position desc limit 1)<>'finale' then
      raise exception 'Последней карточкой должен быть финал'; end if;
   return jsonb_build_object('id',v_id,'cards',v_pos);
 else raise exception 'Неизвестная команда студии'; end if;
end $$;
revoke execute on function public.qwiz_studio(text,jsonb) from public,anon;
grant execute on function public.qwiz_studio(text,jsonb) to authenticated;

create or replace function public.qwiz_host_rooms()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 v_user:=(select auth.uid());
 if v_user is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'title',r.title,'phase',r.phase,
  'players',(select count(*) from public.org_next_players p where p.room_id=r.id),
  'teams',(select count(*) from public.org_next_teams t where t.room_id=r.id),
  'created_at',r.created_at) order by r.created_at desc),'[]'::jsonb)
 from (select * from public.org_next_rooms where owner_id=v_user order by created_at desc limit 30) r);
end $$;
revoke execute on function public.qwiz_host_rooms() from public,anon;
grant execute on function public.qwiz_host_rooms() to authenticated;

-- Read-only screen: no auth required, no keys, no host controls, no group identifiers.
-- Code acts as a public viewing invitation; do not include personal names here.
create or replace function public.qwiz_public_screen(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype; q jsonb; total integer; teams jsonb; players jsonb;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then raise exception 'Неверный код'; end if;
 select * into r from public.org_next_rooms where code=p_code;
 if not found then raise exception 'Комната не найдена'; end if;
 select jsonb_array_length(x.questions), case when r.question_index>=0 then (x.questions->r.question_index)-'correct'-'explanation' else null end
 into total,q from public.org_next_quizzes x where x.id=r.quiz_id;
 if r.phase not in ('question','result') then q:=null;end if;
 if r.phase='finished' then
  select coalesce(jsonb_agg(jsonb_build_object('name',t.name,'score',t.score,'position',t.rnk) order by t.rnk),'[]'::jsonb)
  into teams from (select name,score,rank() over(order by score desc) rnk from public.org_next_teams where room_id=r.id)t;
  select coalesce(jsonb_agg(jsonb_build_object('nickname','Игрок '||lpad(p.rnk::text,2,'0'),'score',p.points,'position',p.rnk) order by p.rnk),'[]'::jsonb)
  into players from (select a.player_id,sum(a.points) points,rank() over(order by sum(a.points) desc) rnk
   from public.org_next_answers a where a.room_id=r.id group by a.player_id) p;
 end if;
 return jsonb_build_object('code',r.code,'title',r.title,'phase',r.phase,'index',r.question_index,'total',total,'question',q,
 'ends_at',r.ends_at,'teams',coalesce(teams,'[]'::jsonb),'players',coalesce(players,'[]'::jsonb));
end $$;
revoke execute on function public.qwiz_public_screen(text) from public;
grant execute on function public.qwiz_public_screen(text) to anon,authenticated;

create or replace function public.qwiz_my_profile(p_change jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_name text; v_nick text; v_avatar text;
begin
 v_user:=(select auth.uid());
 if v_user is null then raise exception 'Необходим вход'; end if;
 if p_change is not null then
  v_name:=trim(coalesce(p_change->>'full_name',''));
  v_nick:=trim(coalesce(p_change->>'nickname',''));
  v_avatar:=coalesce(p_change->>'avatar','fox');
  if char_length(v_name) not between 2 and 100 or char_length(v_nick) not between 2 and 50 or
   v_avatar not in ('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear')
   then raise exception 'Проверьте ФИО, ник и аватар'; end if;
  insert into public.qwiz_student_profiles(user_id,full_name,nickname,avatar)
  values(v_user,v_name,v_nick,v_avatar)
  on conflict(user_id) do update set full_name=excluded.full_name,nickname=excluded.nickname,avatar=excluded.avatar,updated_at=now();
 end if;
 return jsonb_build_object(
  'profile',(select jsonb_build_object('full_name',p.full_name,'nickname',p.nickname,'avatar',p.avatar)
      from public.qwiz_student_profiles p where p.user_id=v_user),
  'stats',(select jsonb_build_object('games',count(distinct a.room_id),'answers',count(*),
   'correct',count(*)filter(where a.correct),'points',coalesce(sum(a.points),0))
   from public.org_next_answers a join public.org_next_players p on p.id=a.player_id
   where p.user_id=v_user)
 );
end $$;
revoke execute on function public.qwiz_my_profile(jsonb) from public,anon;
grant execute on function public.qwiz_my_profile(jsonb) to authenticated;

create or replace function public.qwiz_teacher_stats()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 v_user:=(select auth.uid());
 if v_user is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 return jsonb_build_object(
 'overview',(select jsonb_build_object('rooms',count(*),'completed',count(*)filter(where phase='finished')) from public.org_next_rooms where owner_id=v_user),
 'students',(select coalesce(jsonb_agg(row_to_json(z) order by z.score desc),'[]'::jsonb) from
  (select p.name,p.group_name as "group",count(distinct p.room_id) games, count(a.id) answers,
   count(a.id) filter(where a.correct) correct,coalesce(sum(a.points),0) score
   from public.org_next_players p join public.org_next_rooms r on r.id=p.room_id
   left join public.org_next_answers a on a.player_id=p.id where r.owner_id=v_user
   group by p.name,p.group_name order by score desc limit 150)z)
 );
end $$;
revoke execute on function public.qwiz_teacher_stats() from public,anon;
grant execute on function public.qwiz_teacher_stats() to authenticated;
commit;