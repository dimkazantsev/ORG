-- QWIZ-PARTY · 2026-10-25. Arcade stage must remain playable for the configured time.
-- Read-only audit source: pg_get_functiondef() of live, owner-protected functions.
-- Adds early returns to both tick passes and rejects premature manual Next.
-- No data, role, permission, scoring or room content changes.

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
     stage_seconds:=public.qwiz_arcade_duration(a.settings,a.settings->>'arcade_mode');
     -- Never advance any arcade card before its full playable window expires.
     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
     if clock_timestamp()>=a.entered_at+make_interval(secs=>stage_seconds) then
       perform public.qwiz_arcade_finalize(r.id,a.card_position);
     end if;
     if public.qwiz_bonus_eligible(r.id,a.card_position) AND
      clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds+public.qwiz_bonus_window(r.id,a.card_position))
      AND NOT public.qwiz_bonus_vote_complete(r.id,a.card_position)
     then return false;end if;
   else
     stage_seconds:=case when a.settings->>'arcade_mode'='russia_map' then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180))) else case a.kind when 'card_intro' then greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))) when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
   end if;
   select * into r from public.org_next_rooms where id=r.id for update;
   if r.phase<>'intermission' or public.qwiz_party_paused(r.id) then return false;end if;
   select * into a from public.qwiz_room_activity where room_id=r.id;
   if not found then return false;end if;
   if a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain') then
      -- Recheck after acquiring the room lock: other tick callers may race.
      stage_seconds:=public.qwiz_arcade_duration(a.settings,a.settings->>'arcade_mode');
      if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
      if public.qwiz_bonus_eligible(r.id,a.card_position) AND
        clock_timestamp()<a.entered_at+make_interval(secs=>public.qwiz_arcade_duration(a.settings,a.settings->>'arcade_mode')+public.qwiz_bonus_window(r.id,a.card_position))
        AND NOT public.qwiz_bonus_vote_complete(r.id,a.card_position)
       then return false;end if;
      perform public.qwiz_boost_lock(r.id);
   else
      stage_seconds:=case when a.settings->>'arcade_mode'='russia_map' then greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180))) else case a.kind when 'card_intro' then greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))) when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
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
  -- Do not let a manual "Next" bypass an active playable arcade window.
  if v_active.settings->>'arcade_mode' in ('rocket','blitz','tug','captain') and
    clock_timestamp()<v_active.entered_at+make_interval(
      secs=>public.qwiz_arcade_duration(v_active.settings,v_active.settings->>'arcade_mode')) then
    raise exception 'Мини-игра ещё идёт. Дождитесь окончания таймера.';
  end if;
  -- Do not let a moderator or another RPC skip an eligible two-stage team ballot.
  -- The time limit remains absolute: at most 15 seconds after the arcade ends.
  if v_active.settings->>'arcade_mode' in ('rocket','blitz','tug','captain')
    and public.qwiz_bonus_eligible(p_room,v_card_pos)
    and not public.qwiz_bonus_vote_complete(p_room,v_card_pos)
    and exists (
      select 1 from public.qwiz_arcade_runs v
      where v.room_id=p_room and v.card_position=v_card_pos
        and clock_timestamp()<v.started_at+
          make_interval(secs=>public.qwiz_arcade_duration(v_active.settings,v_active.settings->>'arcade_mode')
            +public.qwiz_bonus_window(p_room,v_card_pos))
    )
  then
    raise exception 'Идёт командное голосование — дождитесь решения или истечения 15 секунд';
  end if;
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
