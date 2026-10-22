-- QWIZ-PARTY 2026-10-23: authoritative pause, timed card progression, winning-team choice.
create table if not exists public.qwiz_room_pauses (
 room_id uuid primary key references public.org_next_rooms(id) on delete cascade,
 paused_at timestamptz not null default clock_timestamp(),
 remaining_ms bigint not null default -1
);
alter table public.qwiz_room_pauses enable row level security;
revoke all on public.qwiz_room_pauses from public,anon,authenticated;

create table if not exists public.qwiz_boost_votes (
 room_id uuid not null references public.org_next_rooms(id) on delete cascade,
 card_position integer not null,
 team_id uuid not null references public.org_next_teams(id) on delete cascade,
 player_id uuid not null references public.org_next_players(id) on delete cascade,
 choice text not null check(choice in ('headstart','teamwork','momentum')),
 voted_at timestamptz not null default clock_timestamp(),
 primary key(room_id,card_position,player_id)
);
alter table public.qwiz_boost_votes enable row level security;
revoke all on public.qwiz_boost_votes from public,anon,authenticated;
create index if not exists qwiz_boost_votes_team on public.qwiz_boost_votes(room_id,card_position,team_id,choice);

create table if not exists public.qwiz_round_boosts (
 room_id uuid not null references public.org_next_rooms(id) on delete cascade,
 card_position integer not null,
 team_id uuid not null references public.org_next_teams(id) on delete cascade,
 choice text not null check(choice in ('headstart','teamwork','momentum')),
 round_index integer not null,
 applied_at timestamptz,
 points_awarded integer not null default 0,
 primary key(room_id,card_position,team_id)
);
alter table public.qwiz_round_boosts enable row level security;
revoke all on public.qwiz_round_boosts from public,anon,authenticated;
create index if not exists qwiz_round_boosts_active on public.qwiz_round_boosts(room_id,round_index);

create or replace function public.qwiz_party_paused(p_room uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.qwiz_room_pauses where room_id=p_room);
$$;
revoke execute on function public.qwiz_party_paused(uuid) from public;
grant execute on function public.qwiz_party_paused(uuid) to authenticated,anon;

create or replace function public.qwiz_party_control(p_room uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype; v public.qwiz_room_pauses%rowtype;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 select * into r from public.org_next_rooms where id=p_room for update;
 if not found or r.owner_id<>(select auth.uid()) then raise exception 'Комната не найдена';end if;
 if p_action='pause' then
  if r.phase not in ('countdown','question','result') then raise exception 'Пауза доступна во время вопросов и обратного отсчёта';end if;
  if exists(select 1 from public.qwiz_room_pauses where room_id=p_room) then return jsonb_build_object('phase',r.phase,'paused',true);end if;
  insert into public.qwiz_room_pauses(room_id,remaining_ms)
   values(p_room,case when r.ends_at is null then -1 else greatest(0,floor(extract(epoch from(r.ends_at-clock_timestamp()))*1000)::bigint) end);
  update public.org_next_rooms set ends_at=null where id=p_room;
  return jsonb_build_object('phase',r.phase,'paused',true);
 elsif p_action='resume' then
  delete from public.qwiz_room_pauses where room_id=p_room returning * into v;
  if not found then return jsonb_build_object('phase',r.phase,'paused',false);end if;
  if r.phase not in ('finished','lobby') and v.remaining_ms>=0 then
   update public.org_next_rooms set ends_at=clock_timestamp()+make_interval(secs=>greatest(0.001,v.remaining_ms/1000.0)) where id=p_room;
  end if;
  return jsonb_build_object('phase',r.phase,'paused',false);
 elsif p_action in ('start','next','reveal','finish') then
  if p_action='finish' then delete from public.qwiz_room_pauses where room_id=p_room;
  elsif exists(select 1 from public.qwiz_room_pauses where room_id=p_room) then raise exception 'Сначала продолжите игру';end if;
  if p_action='next' and r.phase='intermission' and exists(select 1 from public.qwiz_room_activity a where a.room_id=p_room and a.settings ? 'arcade_mode') then
    perform public.qwiz_boost_lock(p_room);
  end if;
  return jsonb_build_object('phase',public.org_next_advance(p_room,p_action),'paused',false);
 end if;
 raise exception 'Неизвестное действие';
end $$;
revoke execute on function public.qwiz_party_control(uuid,text) from public;
grant execute on function public.qwiz_party_control(uuid,text) to authenticated;

create or replace function public.qwiz_boost_lock(p_room uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.qwiz_room_activity%rowtype; v public.qwiz_arcade_runs%rowtype;
 r public.org_next_rooms%rowtype; tl jsonb; qs jsonb; target int; idx int;
 leader uuid; opt text; amount int; total_members int; winner_votes int;
begin
 select * into a from public.qwiz_room_activity where room_id=p_room;
 if not found or a.settings->>'arcade_mode' not in ('rocket','blitz','tug','captain') then return;end if;
 select * into v from public.qwiz_arcade_runs where room_id=p_room and card_position=a.card_position for update;
 if not found then return;end if;
 if clock_timestamp()<v.started_at+make_interval(secs=>greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)))) then return;end if;
 perform public.qwiz_arcade_finalize(p_room,a.card_position);
 select winner_team into leader from public.qwiz_arcade_runs where room_id=p_room and card_position=a.card_position;
 if leader is null or exists(select 1 from public.qwiz_round_boosts where room_id=p_room and card_position=a.card_position) then return;end if;
 select count(*) into total_members from public.org_next_players where team_id=leader;
 select choice,count(*) into opt,winner_votes from public.qwiz_boost_votes
 where room_id=p_room and card_position=a.card_position and team_id=leader
 group by choice order by count(*) desc,choice limit 1;
 if winner_votes is null or winner_votes<=total_members/2 then return;end if;
 select * into r from public.org_next_rooms where id=p_room;
 select b.timeline,q.questions into tl,qs from public.qwiz_room_builds b
 join public.org_next_quizzes q on q.id=r.quiz_id where b.room_id=p_room;
 if tl is null then return;end if;
 for idx in a.card_position+1..jsonb_array_length(tl)-1 loop
   if tl->idx->>'type'='round' then
     target:=coalesce((tl->idx->>'first_question')::integer,r.question_index+1);
     exit;
   end if;
 end loop;
 if target is null or qs->target is null then return;end if;
 insert into public.qwiz_round_boosts(room_id,card_position,team_id,choice,round_index)
 values(p_room,a.card_position,leader,opt,coalesce((qs->target->>'round_index')::int,0))
 on conflict do nothing;
end $$;
revoke execute on function public.qwiz_boost_lock(uuid) from public,anon,authenticated;

create or replace function public.qwiz_vote_boost(p_room uuid,p_choice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype; a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype; p public.org_next_players%rowtype; secs int;
begin
 if p_choice not in ('headstart','teamwork','momentum') then raise exception 'Неизвестное усиление';end if;
 if (select auth.uid()) is null then raise exception 'Войдите в игру';end if;
 select * into r from public.org_next_rooms where id=p_room;
 if not found or r.phase<>'intermission' then raise exception 'Голосование завершено';end if;
 select * into a from public.qwiz_room_activity where room_id=p_room;
 select * into v from public.qwiz_arcade_runs where room_id=p_room and card_position=a.card_position;
 if v.room_id is null then raise exception 'Нет командного соревнования';end if;
 secs:=greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)));
 if clock_timestamp()<v.started_at+make_interval(secs=>secs) then raise exception 'Дождитесь окончания соревнования';end if;
 if clock_timestamp()>v.started_at+make_interval(secs=>secs+15) then raise exception 'Время голосования истекло';end if;
 perform public.qwiz_arcade_finalize(p_room,a.card_position);
 select * into v from public.qwiz_arcade_runs where room_id=p_room and card_position=a.card_position;
 select * into p from public.org_next_players x where x.room_id=p_room and
 (x.user_id=(select auth.uid()) or exists(select 1 from public.qwiz_player_device_access d where d.room_id=p_room and d.player_id=x.id and d.user_id=(select auth.uid()))) limit 1;
 if p.id is null or p.team_id is distinct from v.winner_team then raise exception 'Голосует только команда-победитель';end if;
 insert into public.qwiz_boost_votes(room_id,card_position,team_id,player_id,choice)
 values(p_room,a.card_position,p.team_id,p.id,p_choice)
 on conflict(room_id,card_position,player_id) do update set choice=excluded.choice,voted_at=clock_timestamp();
 begin
   perform realtime.send(jsonb_build_object('changed',true),'phase','org-next-'||r.code,false);
 exception when others then null;end;
 return jsonb_build_object('ok',true,'choice',p_choice);
end $$;
revoke execute on function public.qwiz_vote_boost(uuid,text) from public;
grant execute on function public.qwiz_vote_boost(uuid,text) to authenticated;

create or replace function public.qwiz_boost_view(p_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype; a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype; p public.org_next_players%rowtype;
 t uuid; total int; choices jsonb; picked text; seconds int;
begin
 select * into r from public.org_next_rooms where code=p_code;
 if not found then return null;end if;
 if r.phase<>'intermission' then return null;end if;
 select * into a from public.qwiz_room_activity where room_id=r.id;
 if not found or a.settings->>'arcade_mode' not in ('rocket','blitz','tug','captain') then return null;end if;
 select * into v from public.qwiz_arcade_runs where room_id=r.id and card_position=a.card_position;
 if not found then return null;end if;
 seconds:=greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)));
 if clock_timestamp()<v.started_at+make_interval(secs=>seconds) then return null;end if;
 t:=v.winner_team;
 select count(*) into total from public.org_next_players where team_id=t;
 if (select auth.uid()) is not null then
   select * into p from public.org_next_players x where x.room_id=r.id and (x.user_id=(select auth.uid())
   or exists(select 1 from public.qwiz_player_device_access d where d.room_id=r.id and d.player_id=x.id and d.user_id=(select auth.uid()))) limit 1;
 end if;
 select coalesce(jsonb_object_agg(choice,n),'{}'::jsonb) into choices from
   (select choice,count(*) n from public.qwiz_boost_votes where room_id=r.id and card_position=a.card_position and team_id=t group by choice) z;
 select choice into picked from public.qwiz_boost_votes where room_id=r.id and card_position=a.card_position and player_id=p.id;
 return jsonb_build_object('winner_team',t,'team_members',total,'counts',choices,'my_choice',picked,
 'can_vote',p.team_id=t and p.id is not null,'open',clock_timestamp()<=v.started_at+make_interval(secs=>seconds+15),
 'vote_ends_at',v.started_at+make_interval(secs=>seconds+15));
end $$;
revoke execute on function public.qwiz_boost_view(text) from public;
grant execute on function public.qwiz_boost_view(text) to authenticated,anon;

create or replace function public.qwiz_apply_round_boost()
returns trigger language plpgsql security definer set search_path='' as $$
declare current_round int; b public.qwiz_round_boosts%rowtype; members int; points int; prior int;
begin
 if new.phase<>'question' or (old.phase='question' and old.question_index=new.question_index) then return new;end if;
 select coalesce((q.questions->new.question_index->>'round_index')::int,0)
 into current_round from public.org_next_quizzes q where q.id=new.quiz_id;
 for b in select * from public.qwiz_round_boosts
 where room_id=new.id and round_index=current_round and applied_at is null for update loop
   select count(*) into members from public.org_next_players where team_id=b.team_id;
   select score into prior from public.org_next_teams where id=b.team_id for update;
   points:=case b.choice when 'headstart' then 12
      when 'teamwork' then least(24,3*members)
      else least(30,greatest(5,round(coalesce(prior,0)*0.15)::int)) end;
   update public.org_next_teams set score=score+points where id=b.team_id and room_id=new.id;
   update public.qwiz_round_boosts set applied_at=clock_timestamp(),points_awarded=points
   where room_id=b.room_id and card_position=b.card_position and team_id=b.team_id;
 end loop;
 return new;
end $$;
drop trigger if exists qwiz_round_boost_apply on public.org_next_rooms;
create trigger qwiz_round_boost_apply after update of phase,question_index on public.org_next_rooms
for each row execute function public.qwiz_apply_round_boost();

create or replace function public.qwiz_boost_teams(p_teams jsonb,p_room uuid,p_index integer)
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(t.row || case when b.choice is null then '{}'::jsonb
 else jsonb_build_object('boost',jsonb_build_object('title',
 case b.choice when 'headstart' then 'Фора +12' when 'teamwork' then 'Командный рывок'
 else 'Импульс +15%' end,'points',b.points_awarded)) end order by t.n),'[]'::jsonb)
from jsonb_array_elements(coalesce(p_teams,'[]'::jsonb)) with ordinality t(row,n)
left join lateral (select choice,points_awarded from public.qwiz_round_boosts x
join public.org_next_rooms rr on rr.id=x.room_id
join public.org_next_quizzes q on q.id=rr.quiz_id
where x.room_id=p_room and x.team_id=(t.row->>'id')::uuid
and x.round_index=coalesce((q.questions->greatest(p_index,0)->>'round_index')::int,0)
order by x.card_position desc limit 1) b on true;
$$;
revoke execute on function public.qwiz_boost_teams(jsonb,uuid,integer) from public;
grant execute on function public.qwiz_boost_teams(jsonb,uuid,integer) to authenticated,anon;

create or replace function public.qwiz_party_state(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;r uuid;
begin
 s:=public.org_next_state(p_code);
 r:=(s->>'room_id')::uuid;
 s:=jsonb_set(s,'{public_stats,teams}',public.qwiz_boost_teams(s#>'{public_stats,teams}',r,coalesce((s->>'index')::int,-1)),true);
 return s||jsonb_build_object('paused',public.qwiz_party_paused(r));
end $$;
revoke execute on function public.qwiz_party_state(text) from public;
grant execute on function public.qwiz_party_state(text) to authenticated;

create or replace function public.qwiz_party_projection(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;r public.org_next_rooms%rowtype;
begin
 s:=public.qwiz_public_screen(p_code);
 select * into r from public.org_next_rooms where code=p_code;
 if not found then return s;end if;
 return jsonb_set(s,'{teams}',public.qwiz_boost_teams(s->'teams',r.id,coalesce((s->>'index')::int,-1)),true)
 ||jsonb_build_object('paused',public.qwiz_party_paused(r.id));
end $$;
revoke execute on function public.qwiz_party_projection(text) from public;
grant execute on function public.qwiz_party_projection(text) to authenticated,anon;

create or replace function public.qwiz_party_arcade(p_code text)
returns jsonb language sql security definer set search_path='' as $$
select public.qwiz_arcade_state(p_code)||jsonb_build_object('vote',public.qwiz_boost_view(p_code));
$$;
revoke execute on function public.qwiz_party_arcade(text) from public;
grant execute on function public.qwiz_party_arcade(text) to authenticated,anon;

create or replace function public.qwiz_result_deadline()
returns trigger language plpgsql security definer set search_path='' as $$
declare secs int;
begin
 if new.phase='result' and old.phase is distinct from new.phase and new.ends_at is null then
   select greatest(5,least(30,coalesce((q.questions->new.question_index->>'answer_duration')::int,10)))
   into secs from public.org_next_quizzes q where q.id=new.quiz_id;
   update public.org_next_rooms set ends_at=clock_timestamp()+make_interval(secs=>coalesce(secs,10)) where id=new.id;
 end if;
 return new;
end $$;
drop trigger if exists qwiz_result_deadline_auto on public.org_next_rooms;
create trigger qwiz_result_deadline_auto after update of phase on public.org_next_rooms
for each row execute function public.qwiz_result_deadline();

create or replace function public.qwiz_tick(p_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype; q jsonb; secs int;
 a public.qwiz_room_activity%rowtype; stage_seconds int;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then return false;end if;
 select * into r from public.org_next_rooms where code=p_code for update;
 if not found or r.phase in ('lobby','finished') or public.qwiz_party_paused(r.id) then return false;end if;
 if r.phase='intermission' then
   select * into a from public.qwiz_room_activity where room_id=r.id;
   if not found then return false;end if;
   if a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain') then
     stage_seconds:=greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)));
     if clock_timestamp()>=a.entered_at+make_interval(secs=>stage_seconds) then
       perform public.qwiz_arcade_finalize(r.id,a.card_position);
     end if;
     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds+15) then return false;end if;
     perform public.qwiz_boost_lock(r.id);
   else
     stage_seconds:=case a.kind when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end;
     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
   end if;
   perform public.qwiz_advance_room(r.id,'next');
   return true;
 end if;
 if r.ends_at is null or r.ends_at>clock_timestamp() then return false;end if;
 if r.phase='countdown' then
  select x.questions->r.question_index into q from public.org_next_quizzes x where x.id=r.quiz_id;
  secs:=greatest(10,least(120,coalesce((q->>'duration')::int,30)));
  update public.org_next_rooms set phase='question',ends_at=clock_timestamp()+make_interval(secs=>secs) where id=r.id;
 elsif r.phase='question' then perform public.qwiz_advance_room(r.id,'reveal');
 elsif r.phase='result' then perform public.qwiz_advance_room(r.id,'next');
 else return false;end if;
 return true;
end $$;
revoke execute on function public.qwiz_tick(text) from public;
grant execute on function public.qwiz_tick(text) to authenticated,anon;
