CREATE OR REPLACE FUNCTION public.qwiz_card_intro_title(p_room uuid,p_card integer)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $intro$
DECLARE c jsonb; modes jsonb; single_mode text; topic_name text; game text;
BEGIN
 SELECT rb.timeline->p_card INTO c FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room;
 IF c IS NULL THEN RETURN 'Следующий раунд';END IF;
 game:=coalesce(c->'settings'->>'arcade_mode','');
 IF game NOT IN ('','russia_map') THEN RETURN coalesce(c->>'title','Командная игра');END IF;
 IF game='russia_map' THEN modes:=coalesce(c->'settings'->'geo_modes','[]'::jsonb);
 ELSE modes:=coalesce(c->'settings'->'flag_modes','[]'::jsonb);END IF;
 IF jsonb_typeof(modes)='array' AND jsonb_array_length(modes)=1 THEN
  single_mode:=modes->>0;
  RETURN CASE single_mode
   WHEN 'country' THEN 'Угадай страну по флагу'
   WHEN 'picker' THEN 'Выбери флаг по названию'
   WHEN 'colors' THEN 'Цвета и полосы флагов'
   WHEN 'symbols' THEN 'Символы и гербы'
   WHEN 'fragments' THEN 'Скрытые фрагменты'
   WHEN 'errors' THEN 'Найди ошибку на флаге'
   WHEN 'similar' THEN 'Похожие флаги'
   WHEN 'assemble' THEN 'Собери флаг'
   WHEN 'multiple' THEN 'Несколько правильных ответов'
   WHEN 'memory' THEN 'Запомни флаг'
   WHEN 'geo' THEN 'География и карты'
   WHEN 'history' THEN 'История флагов'
   WHEN 'locate' THEN 'Найди субъект России'
   WHEN 'identify' THEN 'Узнай регион на карте'
   WHEN 'capital' THEN 'Назови административный центр'
   WHEN 'flag' THEN 'Узнай регион по флагу'
   WHEN 'silhouette' THEN 'Узнай регион по контуру'
   WHEN 'neighbour' THEN 'Соседи регионов России'
   WHEN 'detective' THEN 'Географический детектив'
   WHEN 'district' THEN 'Определи федеральный округ'
   ELSE coalesce(c->>'title','Новый раунд') END;
 END IF;
 IF nullif(c->>'topic_id','') IS NOT NULL THEN
  SELECT t.name INTO topic_name FROM public.qwiz_topics t WHERE t.id=(c->>'topic_id')::uuid;
 END IF;
 RETURN coalesce(topic_name,c->>'title','Новый раунд');
END $intro$;
REVOKE ALL ON FUNCTION public.qwiz_card_intro_title(uuid,integer) FROM PUBLIC,anon,authenticated;

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
  select jsonb_build_object('type',a.kind,'title',case when a.kind='card_intro' then public.qwiz_card_intro_title(r.id,a.card_position) else a.title end,'icon',case when a.kind='card_intro' then coalesce(a.settings->>'queued_icon','flag') else '◉' end,'sound',coalesce(a.settings->>'sound','none'),'settings',jsonb_build_object('arcade_mode',a.settings->>'arcade_mode','arcade_seconds',a.settings->>'arcade_seconds')) into activity from public.qwiz_room_activity a where a.room_id=r.id;
 elsif r.phase='countdown' then
  select rb.timeline->coalesce((q->>'round_index')::int,0) into final_card from public.qwiz_room_builds rb where rb.room_id=r.id;
  if final_card is not null then
   activity:=jsonb_build_object('type','round_intro','title',public.qwiz_card_intro_title(r.id,coalesce((q->>'round_index')::int,0)),
    'icon',coalesce(final_card->>'icon','round'),'settings',final_card->'settings');
  end if;
 elsif r.phase='finished' then
  select rb.timeline->(jsonb_array_length(rb.timeline)-1) into final_card from public.qwiz_room_builds rb where rb.room_id=r.id;
  activity:=jsonb_build_object('type','finale','title',coalesce(final_card->>'title','Финал игры'),'sound',coalesce(final_card->'settings'->>'sound','fanfare'));
 end if;
 reveal:=r.phase in ('result','finished') or exists(select 1 from public.qwiz_room_activity x where x.room_id=r.id and r.phase='intermission' and x.kind='round_stats') or coalesce(activity->>'type','') in ('team_stats','player_stats');
 metrics:=public.qwiz_screen_metrics(r.id,r.question_index,reveal,r.phase='finished');
 return jsonb_build_object('code',r.code,'title',r.title,'phase',r.phase,'index',r.question_index,'total',total,
 'server_now',clock_timestamp(),'ends_at',case when r.phase='intermission' then
 (select a.entered_at+make_interval(secs=>greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))))
 from public.qwiz_room_activity a where a.room_id=r.id and a.kind='card_intro')
 else r.ends_at end,'duration',case when r.phase='result' then greatest(5,least(30,coalesce((q->>'answer_duration')::int,10))) else coalesce((q->>'duration')::int,30) end,
 'question',case when r.phase in ('question','result') then public.qwiz_flag_memory_view(q-'correct'-'solution'-'explanation',r.phase,r.ends_at) else null end,
 'answer',case when r.phase='result' then public.qwiz_answer_display(q) else null end,
 'activity',activity,'round_results',case when r.phase='intermission' and exists(select 1 from public.qwiz_room_activity x where x.room_id=r.id and x.kind='round_stats')
  then public.qwiz_round_results(r.id,(select x.card_position from public.qwiz_room_activity x where x.room_id=r.id)) else null end,
 'round_sound',q->>'round_sound',
 'lobby_teams',case when r.phase='lobby' then (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'position',t.position,'name',t.name,'members',(select count(*) from public.org_next_players p where p.team_id=t.id)) order by t.position),'[]'::jsonb) from public.org_next_teams t where t.room_id=r.id) else '[]'::jsonb end)||metrics;
end $function$;

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
 'ends_at',case when v_room.phase='intermission' then
 (select a.entered_at+make_interval(secs=>greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))))
  from public.qwiz_room_activity a where a.room_id=v_room.id and a.kind='card_intro')
 else v_room.ends_at end,'question',v_q,'teams',v_teams,'players',v_players,
 'me',case when v_player.id is null then null else jsonb_build_object('id',v_player.id,'team_id',v_player.team_id) end,
 'host',v_host,'eligible',case when v_player.id is null then true else public.qwiz_answer_eligible(v_room.id,v_player.id,v_room.question_index) end,'activity',case when v_room.phase='countdown' then
 (select jsonb_build_object('type','round_intro','title',public.qwiz_card_intro_title(v_room.id,coalesce((v_quiz.questions->v_room.question_index->>'round_index')::int,0)),
  'icon',rb.timeline->coalesce((v_quiz.questions->v_room.question_index->>'round_index')::int,0)->>'icon')
 from public.qwiz_room_builds rb where rb.room_id=v_room.id)
 when v_room.phase='finished' then
 (select jsonb_build_object('type','finale','title',rb.timeline->(jsonb_array_length(rb.timeline)-1)->>'title','sound',coalesce(rb.timeline->(jsonb_array_length(rb.timeline)-1)->'settings'->>'sound','fanfare')) from public.qwiz_room_builds rb where rb.room_id=v_room.id)
 else (select jsonb_build_object('type',a.kind,'title',case when a.kind='card_intro' then public.qwiz_card_intro_title(v_room.id,a.card_position) else a.title end,'icon',case when a.kind='card_intro' then a.settings->>'queued_icon' else null end,'settings',a.settings) from public.qwiz_room_activity a where a.room_id=v_room.id) end,
 'answers_count',v_answers,
 'has_answer',case when v_player.id is null then false else exists(select 1 from public.org_next_answers where room_id=v_room.id and player_id=v_player.id and question_index=v_room.question_index) end)||public.qwiz_team_state(v_room.id,v_host,v_player.id);
end $function$;