-- QWIZ-PARTY: server-authoritative round countdown + realtime notifications.
begin;
alter table public.org_next_rooms drop constraint if exists org_next_rooms_phase_check;
alter table public.org_next_rooms add constraint org_next_rooms_phase_check
  check (phase in ('lobby','countdown','question','result','intermission','finished'));
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
  if v_room.phase in ('lobby','countdown','intermission') then v_q:=null;
  elsif not v_host and v_room.phase<>'result' and v_room.phase<>'finished' then v_q:=v_q-'correct'-'explanation';
  end if;
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
declare v_room public.org_next_rooms%rowtype; v_q jsonb; v_questions jsonb; v_duration integer; v_built boolean; v_prev_round text;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 select * into v_room from public.org_next_rooms where id=p_room for update;
 if not found or v_room.owner_id<>(select auth.uid()) then raise exception 'Комната не найдена'; end if;
 select questions into v_questions from public.org_next_quizzes where id=v_room.quiz_id;
 v_built:=exists(select 1 from public.qwiz_room_builds where room_id=p_room);
 if p_action='finish' then
  update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
 elsif p_action='start' and v_room.phase='lobby' then
  v_q:=v_questions->0;
  v_duration:=greatest(10,least(120,coalesce(nullif(v_q->>'duration','')::integer,30)));
  if v_built then
   update public.org_next_rooms set phase='countdown',question_index=0,ends_at=now()+interval '5 seconds' where id=p_room;
  else
   update public.org_next_rooms set phase='question',question_index=0,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
  end if;
 elsif p_action='reveal' and v_room.phase='question' then
  update public.org_next_rooms set phase='result',ends_at=null where id=p_room;
 elsif p_action='next' and v_room.phase='result' then
  if v_room.question_index+1>=jsonb_array_length(v_questions) then
   update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
  else
   v_q:=v_questions->(v_room.question_index+1);
   v_prev_round:=v_questions->v_room.question_index->>'round_index';
   v_duration:=greatest(10,least(120,coalesce(nullif(v_q->>'duration','')::integer,30)));
   if v_built and v_prev_round is distinct from v_q->>'round_index' then
    update public.org_next_rooms set phase='countdown',question_index=question_index+1,ends_at=now()+interval '5 seconds' where id=p_room;
   else
    update public.org_next_rooms set phase='question',question_index=question_index+1,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
   end if;
  end if;
 else raise exception 'Недопустимое действие для текущего этапа'; end if;
 return (select phase from public.org_next_rooms where id=p_room);
end $$;


create or replace function public.qwiz_release_countdown(p_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype; q jsonb; secs integer;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then return false; end if;
 select * into r from public.org_next_rooms where code=p_code for update;
 if not found or r.phase<>'countdown' or r.ends_at>now() then return false; end if;
 select x.questions->r.question_index into q from public.org_next_quizzes x where x.id=r.quiz_id;
 secs:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
 update public.org_next_rooms set phase='question',ends_at=now()+make_interval(secs=>secs)
 where id=r.id and phase='countdown';
 return true;
end $$;
revoke execute on function public.qwiz_release_countdown(text) from public;
grant execute on function public.qwiz_release_countdown(text) to anon,authenticated;

create or replace function public.qwiz_broadcast_room_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 begin
 perform realtime.send(jsonb_build_object('changed',true),'phase','org-next-'||new.code,false);
 exception when others then null;
 end;
 return new;
end $$;
drop trigger if exists qwiz_room_change_broadcast on public.org_next_rooms;
create trigger qwiz_room_change_broadcast after update of phase,question_index,ends_at on public.org_next_rooms
for each row when(old.phase is distinct from new.phase or old.question_index is distinct from new.question_index or old.ends_at is distinct from new.ends_at)
execute function public.qwiz_broadcast_room_change();

create or replace function public.qwiz_broadcast_player_join()
returns trigger language plpgsql security definer set search_path='' as $$
declare code text;
begin
 select r.code into code from public.org_next_rooms r where r.id=new.room_id;
 if code is null then return new;end if;
 begin
 perform realtime.send(jsonb_build_object('changed',true),'team','org-next-'||code,false);
 exception when others then null;
 end;
 return new;
end $$;
drop trigger if exists qwiz_player_join_broadcast on public.org_next_players;
create trigger qwiz_player_join_broadcast after insert on public.org_next_players
for each row execute function public.qwiz_broadcast_player_join();
commit;