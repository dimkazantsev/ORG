set local lock_timeout='5s';set local statement_timeout='20s';
create or replace function public.qwiz_refresh_room_content(p_room uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype;build_id uuid;compiled jsonb;
begin
 select * into r from public.org_next_rooms x where x.id=p_room for update;
 if r.id is null or r.owner_id is distinct from (select auth.uid()) or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 if r.phase<>'lobby' then raise exception 'Вопросы можно обновлять до начала игры';end if;
 select rb.build_id into build_id from public.qwiz_room_builds rb where rb.room_id=p_room;
 if build_id is null then return '{}'::jsonb;end if;
 compiled:=public.qwiz_compile_build(build_id,r.title,true);
 update public.org_next_quizzes q set questions=compiled->'questions' where q.id=r.quiz_id;
 update public.qwiz_room_builds rb set timeline=compiled->'timeline' where rb.room_id=p_room;
 update public.org_next_rooms x set setup_issues=compiled->'issues' where x.id=p_room;
 return jsonb_build_object('issues',compiled->'issues','total_questions',jsonb_array_length(compiled->'questions'));
end $$;


revoke all on function public.qwiz_refresh_room_content(uuid) from public,anon,authenticated;

create or replace function public.qwiz_check_room_start(p_room uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype;q_count integer;
begin
 select * into r from public.org_next_rooms x where x.id=p_room for update;
 if r.id is null or r.owner_id is distinct from (select auth.uid()) or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 if r.phase<>'lobby' then return;end if;
 if r.setup_issues<>'[]'::jsonb then perform public.qwiz_refresh_room_content(p_room);select * into r from public.org_next_rooms x where x.id=p_room;end if;
 select jsonb_array_length(q.questions) into q_count from public.org_next_quizzes q where q.id=r.quiz_id;
 if coalesce(q_count,0)=0 or r.setup_issues<>'[]'::jsonb then raise exception 'Добавьте вопросы в раунды сборки, затем обновите вопросы комнаты';end if;
 if exists(select 1 from public.org_next_players p where p.room_id=p_room and p.team_id is null) then raise exception 'Сначала распределите всех участников по командам';end if;
end $$;



revoke all on function public.qwiz_check_room_start(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.org_next_advance(p_room uuid, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check()
 or not exists(select 1 from public.org_next_rooms where id=p_room and owner_id=(select auth.uid()))
 then raise exception 'Недостаточно прав';end if;
 if p_action='start' then perform public.qwiz_check_room_start(p_room);end if;
 return public.qwiz_advance_room(p_room,p_action);
end $function$
;


CREATE OR REPLACE FUNCTION public.qwiz_answer_eligible(p_room uuid, p_player uuid, p_index integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare settings jsonb; c_teams int;c_players int;v_pos int;v_joined timestamptz;
begin
 if not exists(select 1 from public.org_next_players p where p.id=p_player and p.room_id=p_room and p.team_id is not null and p.entry_question<=greatest(p_index,0)) then return false;end if;
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
end $function$
;


create or replace function public.qwiz_join_team(p_code text,p_name text,p_group text default '',p_team uuid default null,p_inviter uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype;v_team uuid;v_player uuid;v_account uuid;player_team uuid;entry_idx integer;player_name text;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход';end if;
 if char_length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Укажите имя и фамилию';end if;
 select * into r from public.org_next_rooms x where x.code=upper(trim(p_code)) for update;
 if r.id is null or r.phase='finished' then raise exception 'Комната не найдена или закрыта';end if;
 if p_team is not null and not exists(select 1 from public.org_next_teams t where t.id=p_team and t.room_id=r.id) then raise exception 'Команда не найдена в этой комнате';end if;
 if p_inviter is not null and (p_team is null or not exists(select 1 from public.org_next_players p where p.id=p_inviter and p.room_id=r.id and p.team_id=p_team)) then raise exception 'Приглашение устарело: попросите новый QR-код';end if;
 select l.account_id into v_account from public.qwiz_student_links l where l.user_id=(select auth.uid());
 select p.id,p.team_id into v_player,player_team from public.org_next_players p where p.room_id=r.id and
  (p.user_id=(select auth.uid()) or exists(select 1 from public.qwiz_player_device_access d where d.player_id=p.id and d.room_id=r.id and d.user_id=(select auth.uid()))
  or (v_account is not null and (p.student_account_id=v_account or exists(select 1 from public.qwiz_student_links l where l.user_id=p.user_id and l.account_id=v_account)))) limit 1;
 if v_player is not null then
  if p_team is not null and p_team is distinct from player_team then
   if r.phase<>'lobby' and player_team is not null then raise exception 'После начала игры команду меняет преподаватель до следующей игры';end if;
   update public.org_next_players p set team_id=p_team where p.id=v_player;
  end if;
  update public.org_next_players p set student_account_id=v_account where p.id=v_player and p.student_account_id is null and v_account is not null;
 else
  if (select count(*) from public.org_next_players p where p.room_id=r.id)>=80 then raise exception 'Комната заполнена: не больше 80 участников';end if;
  v_team:=p_team;
  if v_team is null and r.team_mode='random' then
   select t.id into v_team from public.org_next_teams t where t.room_id=r.id
   order by (select count(*) from public.org_next_players p where p.team_id=t.id),random() limit 1;
  end if;
  entry_idx:=case when r.phase='countdown' then greatest(0,r.question_index) when r.phase='lobby' then 0 else greatest(0,r.question_index+1) end;
  select a.full_name into player_name from public.qwiz_student_accounts a where a.id=v_account;
  insert into public.org_next_players(room_id,user_id,name,group_name,team_id,student_account_id,entry_question)
   values(r.id,(select auth.uid()),coalesce(player_name,trim(p_name)),left(trim(coalesce(p_group,'')),50),v_team,v_account,entry_idx) returning id into v_player;
 end if;
 insert into public.qwiz_player_device_access(room_id,player_id,user_id) values(r.id,v_player,(select auth.uid()))
 on conflict(room_id,user_id) do update set player_id=excluded.player_id;
 return jsonb_build_object('code',r.code,'player_id',v_player,'team_id',(select p.team_id from public.org_next_players p where p.id=v_player));
end $$;


revoke all on function public.qwiz_join_team(text,text,text,uuid,uuid) from public,anon,authenticated;

create or replace function public.org_next_join(p_code text,p_name text,p_group text default '')
returns jsonb language sql security definer set search_path='' as $$select public.qwiz_join_team(p_code,p_name,p_group,null,null)$$;



