-- QWIZ-PARTY automatic question-round standings, controlled transitions and same-phase screen data.
-- Preserves past room score data and existing historical card types.
-- Read-only, scoped per room and timeline card; no scoring writes or guesses.
CREATE OR REPLACE FUNCTION public.qwiz_round_results(p_room uuid,p_card integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $round$
WITH r AS (SELECT q.questions FROM public.org_next_rooms rm JOIN public.org_next_quizzes q ON q.id=rm.quiz_id WHERE rm.id=p_room),
 answers AS (
 SELECT a.player_id,p.team_id,a.points,a.correct FROM public.org_next_answers a
 JOIN public.org_next_players p ON p.id=a.player_id AND p.room_id=a.room_id
 CROSS JOIN r
 WHERE a.room_id=p_room AND coalesce((r.questions->a.question_index->>'round_index')::int,0)=p_card
 ),
 teams AS (
 SELECT t.id,t.name,t.score AS total_score,coalesce(sum(a.points),0)::int AS round_score,
 count(a.player_id)::int AS answers,count(*) FILTER(WHERE a.correct)::int AS correct
 FROM public.org_next_teams t LEFT JOIN answers a ON a.team_id=t.id WHERE t.room_id=p_room
 GROUP BY t.id,t.name,t.score
 ),
 players AS (
 SELECT p.id,p.name,coalesce(sum(a.points),0)::int AS round_score,count(a.player_id)::int AS answers,
 count(*) FILTER(WHERE a.correct)::int AS correct
 FROM public.org_next_players p LEFT JOIN answers a ON a.player_id=p.id WHERE p.room_id=p_room
 GROUP BY p.id,p.name
 )
SELECT jsonb_build_object('teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'score',round_score,'total_score',total_score,'answers',answers,'correct',correct) ORDER BY round_score DESC,total_score DESC,name) FROM teams),'[]'::jsonb),
'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nickname',name,'score',round_score,'answers',answers,'correct',correct) ORDER BY round_score DESC,name) FROM players),'[]'::jsonb));
$round$;

CREATE OR REPLACE FUNCTION public.qwiz_advance_room(p_room uuid, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype; q jsonb; v_questions jsonb; timeline jsonb;
 v_duration integer;v_next integer;v_prev_card integer;v_next_card jsonb;v_kind text;
 v_card_pos integer; v_stats_seconds integer; v_card jsonb;
begin
 select * into r from public.org_next_rooms where id=p_room for update;
 if not found then raise exception 'Комната не найдена';end if;
 if p_action='next' and r.phase='question' then p_action:='reveal';end if;
 select quiz.questions into v_questions from public.org_next_quizzes quiz where quiz.id=r.quiz_id;
 select rb.timeline into timeline from public.qwiz_room_builds rb where rb.room_id=p_room;
 if p_action='finish' then
  update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
  delete from public.qwiz_room_activity where room_id=p_room;
 elsif p_action='start' and r.phase='lobby' then
  if timeline is not null and jsonb_array_length(timeline)>0 and (timeline->0->>'type'<>'round' or timeline->0->'settings'->>'arcade_mode'='russia_map') then
   v_next_card:=timeline->0;
   insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
    values(p_room,0,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
    on conflict(room_id) do update set card_position=0,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
   update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
  else
   q:=v_questions->0;
   if timeline is not null then
    update public.org_next_rooms set phase='countdown',question_index=0,ends_at=now()+make_interval(secs=>greatest(1,least(5,coalesce((timeline->0->'settings'->>'lead_seconds')::int,5)))) where id=p_room;
   else
    v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
    update public.org_next_rooms set phase='question',question_index=0,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
   end if;
  end if;
 elsif p_action='reveal' and r.phase='question' then
  update public.org_next_rooms set phase='result',ends_at=clock_timestamp()+interval '8 seconds' where id=p_room;
 elsif p_action='next' and r.phase='intermission' then
  select a.card_position into v_card_pos from public.qwiz_room_activity a where a.room_id=p_room;
  if v_card_pos is null or timeline is null then raise exception 'Переход не найден';end if;
  v_card:=timeline->v_card_pos;
  if exists(select 1 from public.qwiz_room_activity x where x.room_id=p_room and x.kind<>'round_stats'
   and x.settings->>'arcade_mode' in ('rocket','blitz','tug','captain','russia_map')) then
     v_stats_seconds:=greatest(5,least(10,coalesce((v_card->'settings'->>'stats_seconds')::int,7)));
     update public.qwiz_room_activity set kind='round_stats',title='Итоги раунда',
       settings=jsonb_build_object('stats_seconds',v_stats_seconds,'round_card',v_card_pos),
       entered_at=clock_timestamp() where room_id=p_room;
     return 'intermission';
  end if;
  v_next_card:=timeline->(v_card_pos+1);
  if v_next_card is null or v_next_card->>'type'='finale' then
    update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
    delete from public.qwiz_room_activity where room_id=p_room;
  elsif (v_next_card->>'type'='round' and coalesce(v_next_card->'settings'->>'arcade_mode','')<>'russia_map') then
    v_next:=coalesce((v_next_card->>'first_question')::int,r.question_index+1);
    update public.org_next_rooms set phase='countdown',question_index=v_next,ends_at=now()+make_interval(secs=>greatest(1,least(5,coalesce((v_next_card->'settings'->>'lead_seconds')::int,5)))) where id=p_room;
    delete from public.qwiz_room_activity where room_id=p_room;
  else
    insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
      values(p_room,v_card_pos+1,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
      on conflict(room_id) do update set card_position=excluded.card_position,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
    update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
  end if;
 elsif p_action='next' and r.phase='result' then
  v_next:=r.question_index+1;
  if timeline is null then
    if v_next>=jsonb_array_length(v_questions) then
      update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
    else
      q:=v_questions->v_next;
      v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
      update public.org_next_rooms set phase='question',question_index=v_next,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
    end if;
  else
    v_prev_card:=coalesce((v_questions->r.question_index->>'round_index')::int,0);
    if v_next<jsonb_array_length(v_questions) and
     coalesce((v_questions->v_next->>'round_index')::int,0)=v_prev_card then
      q:=v_questions->v_next;
      v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
      update public.org_next_rooms set phase='question',question_index=v_next,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
    else
      v_card:=timeline->v_prev_card;
      v_stats_seconds:=greatest(5,least(10,coalesce((v_card->'settings'->>'stats_seconds')::int,7)));
      insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
       values(p_room,v_prev_card,'Итоги раунда','round_stats',
         jsonb_build_object('round_card',v_prev_card,'stats_seconds',v_stats_seconds))
      on conflict(room_id) do update set card_position=excluded.card_position,title=excluded.title,
       kind=excluded.kind,settings=excluded.settings,entered_at=clock_timestamp();
      update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
      return 'intermission';
    end if;
  end if;
 else raise exception 'Недопустимое действие для текущего этапа';end if;
 return (select phase from public.org_next_rooms where id=p_room);
end $function$


CREATE OR REPLACE FUNCTION public.qwiz_tick(p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype; q jsonb; secs int;
 a public.qwiz_room_activity%rowtype; stage_seconds int;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then return false;end if;
 -- Most of the 40 simultaneous viewers only READ; do not acquire a write lock on every poll.
 select * into r from public.org_next_rooms where code=p_code;
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
   else
     stage_seconds:=case when a.settings->>'arcade_mode'='russia_map' then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180))) else case a.kind when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
   end if;
   select * into r from public.org_next_rooms where id=r.id for update;
   if r.phase<>'intermission' or public.qwiz_party_paused(r.id) then return false;end if;
   select * into a from public.qwiz_room_activity where room_id=r.id;
   if not found then return false;end if;
   if a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain') then
      if clock_timestamp()<a.entered_at+make_interval(secs=>greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)))+15) then return false;end if;
      perform public.qwiz_boost_lock(r.id);
   else
      stage_seconds:=case when a.settings->>'arcade_mode'='russia_map' then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180))) else case a.kind when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
      if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
   end if;
   perform public.qwiz_advance_room(r.id,'next');
   return true;
 end if;
 if r.ends_at is null or r.ends_at>clock_timestamp() then return false;end if;
 select * into r from public.org_next_rooms where id=r.id for update;
 if r.ends_at is null or r.ends_at>clock_timestamp() or r.phase not in ('countdown','question','result') or public.qwiz_party_paused(r.id) then return false;end if;
 if r.phase='countdown' then
  select x.questions->r.question_index into q from public.org_next_quizzes x where x.id=r.quiz_id;
  secs:=greatest(10,least(120,coalesce((q->>'duration')::int,30)));
  update public.org_next_rooms set phase='question',ends_at=clock_timestamp()+make_interval(secs=>secs) where id=r.id;
 elsif r.phase='question' then perform public.qwiz_advance_room(r.id,'reveal');
 elsif r.phase='result' then perform public.qwiz_advance_room(r.id,'next');
 end if;
 return true;
end $function$


CREATE OR REPLACE FUNCTION public.qwiz_party_control(p_room uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype; v public.qwiz_room_pauses%rowtype;
 a public.qwiz_room_activity%rowtype;v_stage_seconds integer;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 select * into r from public.org_next_rooms where id=p_room for update;
 if not found or r.owner_id<>(select auth.uid()) then raise exception 'Комната не найдена';end if;
 if p_action='pause' then
  if r.phase not in ('countdown','question','result','intermission') then raise exception 'Пауза доступна во время игры';end if;
  if r.phase='intermission' then
   select * into a from public.qwiz_room_activity where room_id=p_room;
   if not found or a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain') then
    raise exception 'Соревновательные мини-игры автоматически завершаются без паузы';end if;
   v_stage_seconds:=case when a.settings->>'arcade_mode'='russia_map'
     then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180)))
     else case a.kind when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
  end if;
  if exists(select 1 from public.qwiz_room_pauses where room_id=p_room) then return jsonb_build_object('phase',r.phase,'paused',true);end if;
  insert into public.qwiz_room_pauses(room_id,remaining_ms)
   values(p_room,case when r.phase='intermission' then greatest(0,floor(extract(epoch from(a.entered_at+make_interval(secs=>v_stage_seconds)-clock_timestamp()))*1000)::bigint)
      when r.ends_at is null then -1 else greatest(0,floor(extract(epoch from(r.ends_at-clock_timestamp()))*1000)::bigint) end);
  update public.org_next_rooms set ends_at=null where id=p_room;
  return jsonb_build_object('phase',r.phase,'paused',true);
 elsif p_action='resume' then
  delete from public.qwiz_room_pauses where room_id=p_room returning * into v;
  if not found then return jsonb_build_object('phase',r.phase,'paused',false);end if;
  if r.phase='intermission' and v.remaining_ms>=0 then
    select * into a from public.qwiz_room_activity where room_id=p_room;
    if found then
     v_stage_seconds:=case when a.settings->>'arcade_mode'='russia_map'
       then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180)))
       else case a.kind when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
     update public.qwiz_room_activity set entered_at=clock_timestamp()-make_interval(secs=>greatest(0.001,v_stage_seconds-v.remaining_ms/1000.0)) where room_id=p_room;
    end if;
  end if;
  if r.phase not in ('finished','lobby','intermission') and v.remaining_ms>=0 then
   update public.org_next_rooms set ends_at=clock_timestamp()+make_interval(secs=>greatest(0.001,v.remaining_ms/1000.0)) where id=p_room;
  end if;
  return jsonb_build_object('phase',r.phase,'paused',false);
 elsif p_action in ('start','next','reveal','finish') then
  if p_action='finish' then delete from public.qwiz_room_pauses where room_id=p_room;
  elsif exists(select 1 from public.qwiz_room_pauses where room_id=p_room) then raise exception 'Сначала продолжите игру';end if;
  if p_action='next' and r.phase='intermission' and exists(select 1 from public.qwiz_room_activity activity_lookup where activity_lookup.room_id=p_room and activity_lookup.settings ? 'arcade_mode') then
    perform public.qwiz_boost_lock(p_room);
  end if;
  return jsonb_build_object('phase',public.org_next_advance(p_room,p_action),'paused',false);
 end if;
 raise exception 'Неизвестное действие';
end $function$


CREATE OR REPLACE FUNCTION public.qwiz_public_screen(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype;q jsonb;total int;activity jsonb;metrics jsonb;reveal boolean;final_card jsonb;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then raise exception 'Неверный код';end if;
 perform public.qwiz_tick(p_code);
 select * into r from public.org_next_rooms where code=p_code;
 if not found then raise exception 'Комната не найдена';end if;
 select jsonb_array_length(x.questions),case when r.question_index>=0 then x.questions->r.question_index else null end into total,q from public.org_next_quizzes x where x.id=r.quiz_id;
 if r.phase='intermission' then
  select jsonb_build_object('type',a.kind,'title',a.title,'icon','◉','sound',coalesce(a.settings->>'sound','none'),'settings',jsonb_build_object('arcade_mode',a.settings->>'arcade_mode','arcade_seconds',a.settings->>'arcade_seconds')) into activity from public.qwiz_room_activity a where a.room_id=r.id;
 elsif r.phase='countdown' then
  select rb.timeline->coalesce((q->>'round_index')::int,0) into final_card from public.qwiz_room_builds rb where rb.room_id=r.id;
  if final_card is not null then
   activity:=jsonb_build_object('type','round_intro','title',case
    when jsonb_array_length(coalesce(final_card->'settings'->'flag_modes','[]'::jsonb))=1 then
     case final_card->'settings'->'flag_modes'->>0 when 'country' then 'Узнай страну по флагу'
      when 'picker' then 'Выбери флаг страны' when 'memory' then 'Память на флаги'
      else final_card->>'title' end
    else coalesce(final_card->>'title','Раунд вопросов') end,
    'icon',coalesce(final_card->>'icon','round'),'settings',final_card->'settings');
  end if;
 elsif r.phase='finished' then
  select rb.timeline->(jsonb_array_length(rb.timeline)-1) into final_card from public.qwiz_room_builds rb where rb.room_id=r.id;
  activity:=jsonb_build_object('type','finale','title',coalesce(final_card->>'title','Финал игры'),'sound',coalesce(final_card->'settings'->>'sound','fanfare'));
 end if;
 reveal:=r.phase in ('result','finished') or exists(select 1 from public.qwiz_room_activity x where x.room_id=r.id and r.phase='intermission' and x.kind='round_stats') or coalesce(activity->>'type','') in ('team_stats','player_stats');
 metrics:=public.qwiz_screen_metrics(r.id,r.question_index,reveal,r.phase='finished');
 return jsonb_build_object('code',r.code,'title',r.title,'phase',r.phase,'index',r.question_index,'total',total,
 'server_now',clock_timestamp(),'ends_at',r.ends_at,'duration',case when r.phase='result' then greatest(5,least(30,coalesce((q->>'answer_duration')::int,10))) else coalesce((q->>'duration')::int,30) end,
 'question',case when r.phase in ('question','result') then public.qwiz_flag_memory_view(q-'correct'-'solution'-'explanation',r.phase,r.ends_at) else null end,
 'answer',case when r.phase='result' then public.qwiz_answer_display(q) else null end,
 'activity',activity,'round_results',case when r.phase='intermission' and exists(select 1 from public.qwiz_room_activity x where x.room_id=r.id and x.kind='round_stats')
  then public.qwiz_round_results(r.id,(select x.card_position from public.qwiz_room_activity x where x.room_id=r.id)) else null end,
 'round_sound',q->>'round_sound',
 'lobby_teams',case when r.phase='lobby' then (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'position',t.position,'name',t.name,'members',(select count(*) from public.org_next_players p where p.team_id=t.id)) order by t.position),'[]'::jsonb) from public.org_next_teams t where t.room_id=r.id) else '[]'::jsonb end)||metrics;
end $function$


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
 if not v_host then v_q:=public.qwiz_flag_memory_view(v_q,v_room.phase,v_room.ends_at);end if;
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
 'public_stats',public.qwiz_screen_metrics(v_room.id,v_room.question_index,
  v_room.phase in ('result','finished') or exists(select 1 from public.qwiz_room_activity x where x.room_id=v_room.id and x.kind='round_stats'),v_room.phase='finished'),
 'round_results',case when v_room.phase='intermission' and exists(select 1 from public.qwiz_room_activity x where x.room_id=v_room.id and x.kind='round_stats')
  then public.qwiz_round_results(v_room.id,(select x.card_position from public.qwiz_room_activity x where x.room_id=v_room.id)) else null end,
 'answer',case when v_room.phase='result' then public.qwiz_answer_display(v_quiz.questions->v_room.question_index) else null end,
 'ends_at',v_room.ends_at,'question',v_q,'teams',v_teams,'players',v_players,
 'me',case when v_player.id is null then null else jsonb_build_object('id',v_player.id,'team_id',v_player.team_id) end,
 'host',v_host,'eligible',case when v_player.id is null then true else public.qwiz_answer_eligible(v_room.id,v_player.id,v_room.question_index) end,'activity',case when v_room.phase='countdown' then
 (select jsonb_build_object('type','round_intro','title',case when jsonb_array_length(coalesce(rb.timeline->coalesce((v_quiz.questions->v_room.question_index->>'round_index')::int,0)->'settings'->'flag_modes','[]'::jsonb))=1
   then coalesce((v_quiz.questions->v_room.question_index->>'kind'),rb.timeline->coalesce((v_quiz.questions->v_room.question_index->>'round_index')::int,0)->>'title')
   else rb.timeline->coalesce((v_quiz.questions->v_room.question_index->>'round_index')::int,0)->>'title' end,
  'icon',rb.timeline->coalesce((v_quiz.questions->v_room.question_index->>'round_index')::int,0)->>'icon')
 from public.qwiz_room_builds rb where rb.room_id=v_room.id)
 else case when v_room.phase='finished' then
 (select jsonb_build_object('type','finale','title',rb.timeline->(jsonb_array_length(rb.timeline)-1)->>'title','sound',coalesce(rb.timeline->(jsonb_array_length(rb.timeline)-1)->'settings'->>'sound','fanfare')) from public.qwiz_room_builds rb where rb.room_id=v_room.id)
 else (select jsonb_build_object('type',a.kind,'title',a.title,'settings',a.settings) from public.qwiz_room_activity a where a.room_id=v_room.id) end,
 'answers_count',v_answers,
 'has_answer',case when v_player.id is null then false else exists(select 1 from public.org_next_answers where room_id=v_room.id and player_id=v_player.id and question_index=v_room.question_index) end)||public.qwiz_team_state(v_room.id,v_host,v_player.id);
end $function$
