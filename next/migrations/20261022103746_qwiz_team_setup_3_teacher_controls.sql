set local lock_timeout='5s';set local statement_timeout='20s';
create or replace function public.qwiz_team_admin(p_room uuid,p_action text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype;team_count integer;old_count integer;mode text;v_player uuid;target_team uuid;player public.org_next_players%rowtype;pos integer;
begin
 select * into r from public.org_next_rooms x where x.id=p_room for update;
 if r.id is null or r.owner_id is distinct from (select auth.uid()) or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 if p_action='move' then
  v_player:=(p_input->>'player_id')::uuid;target_team:=nullif(p_input->>'team_id','')::uuid;
  select * into player from public.org_next_players p where p.id=v_player and p.room_id=p_room;
  if player.id is null then raise exception 'Участник не найден';end if;
  if r.phase<>'lobby' and (r.phase='finished' or player.team_id is not null or exists(select 1 from public.org_next_answers a where a.player_id=v_player)) then raise exception 'Составы играющих команд зафиксированы';end if;
  if target_team is not null and not exists(select 1 from public.org_next_teams t where t.id=target_team and t.room_id=p_room) then raise exception 'Команда не найдена';end if;
  update public.org_next_players p set team_id=target_team where p.id=v_player;
 elsif p_action in ('settings','shuffle') then
  if r.phase<>'lobby' then raise exception 'Составы команд меняются до начала игры';end if;
  select count(*) into old_count from public.org_next_teams t where t.room_id=p_room;
  team_count:=coalesce((p_input->>'count')::integer,old_count);mode:=coalesce(p_input->>'mode',r.team_mode);
  if team_count not between 1 and 15 or mode not in ('random','manual') then raise exception 'Выберите от 1 до 15 команд и способ распределения';end if;
  if team_count<old_count then
   update public.org_next_players p set team_id=null where p.room_id=p_room and p.team_id in(select t.id from public.org_next_teams t where t.room_id=p_room and t.position>team_count);
   delete from public.org_next_teams t where t.room_id=p_room and t.position>team_count;
  elsif team_count>old_count then
   for pos in old_count+1..team_count loop
    insert into public.org_next_teams(room_id,position,name) values(p_room,pos,public.qwiz_new_team_name(p_room));
   end loop;
  end if;
  update public.org_next_rooms x set team_mode=mode where x.id=p_room;
  if p_action='shuffle' or (mode='random' and (team_count<>old_count or r.team_mode<>'random')) then
   with people as(select p.id,row_number() over(order by random())-1 as idx from public.org_next_players p where p.room_id=p_room),
   teams as(select t.id,row_number() over(order by random())-1 as idx from public.org_next_teams t where t.room_id=p_room)
   update public.org_next_players p set team_id=t.id from people v join teams t on t.idx=mod(v.idx,team_count) where p.id=v.id;
  end if;
 elsif p_action='refresh_content' then return public.qwiz_refresh_room_content(p_room);
 else raise exception 'Неизвестное действие';end if;
 return jsonb_build_object('ok',true);
end $$;


revoke all on function public.qwiz_team_admin(uuid,text,jsonb) from public,anon,authenticated;

create or replace function public.org_next_assign(p_room uuid,p_player uuid,p_team uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin perform public.qwiz_team_admin(p_room,'move',jsonb_build_object('player_id',p_player,'team_id',p_team));return true;end $$;


create or replace function public.qwiz_team_state(p_room uuid,p_host boolean,p_player uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('team_mode',r.team_mode,'setup_issues',case when p_host then r.setup_issues else '[]'::jsonb end,
 'unassigned_count',(select count(*) from public.org_next_players p where p.room_id=r.id and p.team_id is null),
 'teams',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'position',t.position,'name',t.name,'score',t.score,'players',(select count(*) from public.org_next_players p where p.team_id=t.id)) order by t.position),'[]'::jsonb) from public.org_next_teams t where t.room_id=r.id),
 'me',(select jsonb_build_object('id',p.id,'team_id',p.team_id,'entry_question',p.entry_question) from public.org_next_players p where p.id=p_player and p.room_id=r.id),
 'players',case when p_host then (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(a.full_name,p.name),'nickname',coalesce(a.nickname,p.name),'avatar',coalesce(a.avatar,'fox'),'group',p.group_name,'team_id',p.team_id,'entry_question',p.entry_question) order by p.joined_at,p.id),'[]'::jsonb)
  from public.org_next_players p left join public.qwiz_student_links l on l.user_id=p.user_id left join public.qwiz_student_accounts a on a.id=coalesce(p.student_account_id,l.account_id) where p.room_id=r.id) else '[]'::jsonb end)
from public.org_next_rooms r where r.id=p_room
$$;



revoke all on function public.qwiz_team_state(uuid,boolean,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.org_next_state(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 perform public.qwiz_tick(v_room.code);
 select * into v_room from public.org_next_rooms where id=v_room.id;
 select * into v_quiz from public.org_next_quizzes where id=v_room.quiz_id;
 if v_room.question_index>=0 then
  v_q:=v_quiz.questions->v_room.question_index;
  if v_room.phase in ('lobby','countdown','intermission') then v_q:=null;
  elsif not v_host and v_room.phase not in ('result','finished') then v_q:=v_q-'correct'-'solution'-'explanation';end if;
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
 'server_now',clock_timestamp(),'duration',case when v_room.phase='result' then greatest(5,least(30,coalesce((v_q->>'answer_duration')::int,10))) else coalesce((v_q->>'duration')::int,30) end,
 'public_stats',public.qwiz_screen_metrics(v_room.id,v_room.question_index,v_room.phase in ('result','finished'),v_room.phase='finished'),
 'answer',case when v_room.phase='result' then public.qwiz_answer_display(v_q) else null end,
 'ends_at',v_room.ends_at,'question',v_q,'teams',v_teams,'players',v_players,
 'me',case when v_player.id is null then null else jsonb_build_object('id',v_player.id,'team_id',v_player.team_id) end,
 'host',v_host,'eligible',case when v_player.id is null then true else public.qwiz_answer_eligible(v_room.id,v_player.id,v_room.question_index) end,'activity',case when v_room.phase='finished' then
 (select jsonb_build_object('type','finale','title',rb.timeline->(jsonb_array_length(rb.timeline)-1)->>'title','sound',coalesce(rb.timeline->(jsonb_array_length(rb.timeline)-1)->'settings'->>'sound','fanfare')) from public.qwiz_room_builds rb where rb.room_id=v_room.id)
 else (select jsonb_build_object('type',a.kind,'title',a.title,'settings',a.settings) from public.qwiz_room_activity a where a.room_id=v_room.id) end,
 'answers_count',v_answers,
 'has_answer',case when v_player.id is null then false else exists(select 1 from public.org_next_answers where room_id=v_room.id and player_id=v_player.id and question_index=v_room.question_index) end)||public.qwiz_team_state(v_room.id,v_host,v_player.id);
end $function$
;



