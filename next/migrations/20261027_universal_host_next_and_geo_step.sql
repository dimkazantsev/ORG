-- Moderator Next skips arcade guards and moves geography one question at a time.
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
     then public.qwiz_geo_total_seconds(a.settings)
     else case a.kind when 'card_intro' then greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))) when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
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
       then public.qwiz_geo_total_seconds(a.settings)
       else case a.kind when 'card_intro' then greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))) when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
     update public.qwiz_room_activity set entered_at=clock_timestamp()-make_interval(secs=>greatest(0.001,v_stage_seconds-v.remaining_ms/1000.0)) where room_id=p_room;
    end if;
  end if;
  if r.phase not in ('finished','lobby','intermission') and v.remaining_ms>=0 then
   update public.org_next_rooms set ends_at=clock_timestamp()+make_interval(secs=>greatest(0.001,v.remaining_ms/1000.0)) where id=p_room;
  end if;
  return jsonb_build_object('phase',r.phase,'paused',false);
 elsif p_action in ('start','next','reveal','finish') then
 if p_action='start' and r.phase='lobby' and EXISTS(select 1 from public.qwiz_lobby_config where room_id=p_room) and (r.team_mode='random' AND NOT EXISTS(select 1 from public.qwiz_lobby_config where room_id=p_room and confirmed_at is not null) OR r.team_mode='captain' AND ((SELECT count(*) from public.qwiz_lobby_captains where room_id=p_room)<>(SELECT count(*) from public.org_next_teams where room_id=p_room)) OR r.team_mode='captain' AND EXISTS(select 1 from public.org_next_players WHERE room_id=p_room and team_id is null) OR r.team_mode='manual' OR NOT EXISTS(select 1 from public.org_next_players WHERE room_id=p_room)) then raise exception 'Сначала завершите формирование команд';end if;
  -- Prevent finishing a lobby that has never started.
  if p_action='finish' and r.phase='lobby' then
   raise exception 'Игра ещё не началась. Ненужную комнату можно удалить из списка.';
  end if;
  if p_action='finish' then delete from public.qwiz_room_pauses where room_id=p_room;
  elsif exists(select 1 from public.qwiz_room_pauses where room_id=p_room) then raise exception 'Сначала продолжите игру';end if;

  -- In Geography of Russia, Next advances one internal question across all
  -- participating devices, not the entire round. No advancement without host permission.
  if p_action='next' and r.phase='intermission' then
    select * into a from public.qwiz_room_activity where room_id=p_room;
    if found and a.settings->>'arcade_mode'='russia_map' and a.kind<>'card_intro' then
      if exists(select 1 from public.qwiz_geo_runs g where g.room_id=p_room
        and g.card_position=a.card_position and g.current_index<jsonb_array_length(g.tasks))
      then
        update public.qwiz_geo_runs g set
          current_index=least(jsonb_array_length(g.tasks),g.current_index+1),
          updated_at=clock_timestamp()
        where g.room_id=p_room and g.card_position=a.card_position
          and g.current_index<jsonb_array_length(g.tasks);
        return jsonb_build_object('phase','intermission','geo_advanced',true);
      end if;
    end if;
    if found and a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain') then
      perform public.qwiz_arcade_finalize(p_room,a.card_position);
      perform public.qwiz_boost_lock(p_room);
    end if;
  end if;
  return jsonb_build_object('phase',public.org_next_advance(p_room,p_action),'paused',false);
 end if;
 raise exception 'Неизвестное действие';
end $function$
;

CREATE OR REPLACE FUNCTION public.qwiz_advance_room(p_room uuid, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype; q jsonb; v_active public.qwiz_room_activity%rowtype; v_questions jsonb; timeline jsonb;
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
  IF public.qwiz_room_snapshot_issue(p_room) IS NOT NULL THEN
    RAISE EXCEPTION 'Невозможно начать старую комнату: %. Откройте исправленную сборку и создайте новую комнату.',
      public.qwiz_room_snapshot_issue(p_room);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.org_next_players participant WHERE participant.room_id=p_room) THEN
    RAISE EXCEPTION 'Для начала игры нужен хотя бы один подключённый участник. Пригласите игроков по QR-коду.';
  END IF;
  if timeline is not null and jsonb_array_length(timeline)>0 and (timeline->0->>'type'<>'round' or timeline->0->'settings'->>'arcade_mode'='russia_map') then
   v_next_card:=timeline->0;
   if v_next_card->'settings'->>'arcade_mode' in ('rocket','blitz','tug','captain','russia_map') then
    insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
    values(p_room,0,v_next_card->>'title','card_intro',
       jsonb_build_object('queued_kind',v_next_card->>'type','queued_settings',v_next_card->'settings',
        'queued_icon',v_next_card->>'icon','lead_seconds',greatest(1,least(5,coalesce((v_next_card->'settings'->>'lead_seconds')::int,5)))))
    on conflict(room_id) do update set card_position=0,title=excluded.title,kind=excluded.kind,
       settings=excluded.settings,entered_at=clock_timestamp();
   else
   insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
    values(p_room,0,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
    on conflict(room_id) do update set card_position=0,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
   end if;
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
  q:=v_questions->r.question_index;
  update public.org_next_rooms set phase='result',
    ends_at=clock_timestamp()+make_interval(secs=>greatest(5,least(30,coalesce((q->>'answer_duration')::int,8))))
    where id=p_room;
 elsif p_action='next' and r.phase='intermission' then
  select a.* into v_active from public.qwiz_room_activity a where a.room_id=p_room for update;
  v_card_pos:=v_active.card_position;
  if v_card_pos is null or timeline is null then raise exception 'Переход не найден';end if;
  -- Moderator Next is an explicit override, including active arcade and ballots.
  if v_active.kind='card_intro' then
    update public.qwiz_room_activity
      set kind=v_active.settings->>'queued_kind',settings=v_active.settings->'queued_settings',
          entered_at=clock_timestamp()
      where room_id=p_room;
    return 'intermission';
  end if;
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
    if v_next_card->'settings'->>'arcade_mode' in ('rocket','blitz','tug','captain','russia_map') then
     insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
      values(p_room,v_card_pos+1,v_next_card->>'title','card_intro',
        jsonb_build_object('queued_kind',v_next_card->>'type','queued_settings',v_next_card->'settings',
          'queued_icon',v_next_card->>'icon','lead_seconds',greatest(1,least(5,coalesce((v_next_card->'settings'->>'lead_seconds')::int,5)))))
      on conflict(room_id) do update set card_position=excluded.card_position,title=excluded.title,kind=excluded.kind,
        settings=excluded.settings,entered_at=clock_timestamp();
    else
     insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
      values(p_room,v_card_pos+1,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
      on conflict(room_id) do update set card_position=excluded.card_position,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
    end if;
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
;

CREATE OR REPLACE FUNCTION public.qwiz_control_revision(p_room uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT md5(concat_ws('|',
  r.id::text,r.phase,coalesce(r.question_index::text,'-'),
  coalesce(extract(epoch from r.ends_at)::text,'-'),
  coalesce((SELECT a.card_position::text||':'||extract(epoch from a.entered_at)::text
             FROM public.qwiz_room_activity a WHERE a.room_id=r.id),'-'),
  coalesce((SELECT sum(g.current_index)::text FROM public.qwiz_geo_runs g WHERE g.room_id=r.id),'0'),
  CASE WHEN EXISTS(SELECT 1 FROM public.qwiz_room_pauses p WHERE p.room_id=r.id)
    THEN 'paused' ELSE 'running' END
 )) FROM public.org_next_rooms r WHERE r.id=p_room
$function$
;