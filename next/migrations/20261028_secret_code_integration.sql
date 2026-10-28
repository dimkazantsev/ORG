-- Integrate Secret Code into existing robust room/timer/score lifecycle.
-- qwiz_arcade_ensure
CREATE OR REPLACE FUNCTION public.qwiz_arcade_ensure(p_room uuid)
 RETURNS qwiz_arcade_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.qwiz_room_activity%rowtype; r public.org_next_rooms%rowtype; item public.qwiz_arcade_runs%rowtype; qid uuid; md text;
begin
 select * into a from public.qwiz_room_activity where room_id=p_room;
 if not found then return null;end if;
 md:=a.settings->>'arcade_mode';
 if md is null or md not in ('rocket','blitz','tug','captain','sequence_memory') then return null;end if;
 select * into item from public.qwiz_arcade_runs where room_id=p_room and card_position=a.card_position;
 if found then if item.mode='sequence_memory' then perform public.qwiz_secret_code_ensure(p_room,item.card_position);end if;return item;end if;
 select * into r from public.org_next_rooms where id=p_room;
 if md='blitz' then
   select id into qid from public.qwiz_bank where owner_id=r.owner_id and kind='flag'
   and tags @> array['fw:published']::text[] and jsonb_array_length(options)=4
   and public.qwiz_flags_question_valid(kind,options,solution)
   order by random() limit 1;
 end if;
 insert into public.qwiz_arcade_runs(room_id,card_position,mode,started_at,question_id)
 values(p_room,a.card_position,md,a.entered_at,qid)
 on conflict(room_id,card_position) do nothing;
 update public.qwiz_arcade_runs ar set option_order=(select jsonb_agg((i-1) order by random()) from generate_series(1,4) i) where ar.room_id=p_room and ar.card_position=a.card_position and ar.mode='blitz' and ar.option_order is null;
 select * into item from public.qwiz_arcade_runs where room_id=p_room and card_position=a.card_position;
 if item.mode='sequence_memory' then perform public.qwiz_secret_code_ensure(p_room,item.card_position);end if;
 return item;
end $function$;

-- qwiz_arcade_duration
CREATE OR REPLACE FUNCTION public.qwiz_arcade_duration(p_settings jsonb, p_mode text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN p_mode='sequence_memory' THEN greatest(35,least(120,coalesce(nullif(p_settings->>'arcade_seconds','')::int,45)))
 WHEN p_mode='captain' THEN greatest(90,least(120,coalesce(nullif(p_settings->>'arcade_seconds','')::int,100)))
 ELSE greatest(30,least(120,coalesce(nullif(p_settings->>'arcade_seconds','')::int,
   CASE p_mode WHEN 'rocket' THEN 45 WHEN 'blitz' THEN 60 WHEN 'tug' THEN 45 ELSE 45 END))) END;
$function$;

-- qwiz_arcade_rank
CREATE OR REPLACE FUNCTION public.qwiz_arcade_rank(p_room uuid, p_position integer)
 RETURNS TABLE(team_id uuid, name text, points numeric, taps integer, active integer, members integer, place integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH stage AS (SELECT ar.mode,ar.started_at FROM public.qwiz_arcade_runs ar
   WHERE ar.room_id=p_room AND ar.card_position=p_position),
 totals AS (
 SELECT t.id team_id,t.name,t.position,
  (SELECT count(*)::int FROM public.org_next_players p WHERE p.team_id=t.id) members,
  coalesce(sum(c.clicks),0)::int taps,
  count(c.player_id) FILTER(WHERE c.clicks>0 OR c.reacted_at IS NOT NULL)::int tapped_members,
  coalesce(max(w.turbo),0) turbo,coalesce(max(w.grip),0) grip,coalesce(max(w.navigator),0) navigator,
  max(s.mode) mode,max(s.started_at) started_at
 FROM public.org_next_teams t CROSS JOIN stage s
 LEFT JOIN public.org_next_players p ON p.team_id=t.id
 LEFT JOIN public.qwiz_arcade_clicks c ON c.player_id=p.id AND c.room_id=p_room AND c.card_position=p_position
 LEFT JOIN public.qwiz_arcade_wallets w ON w.room_id=p_room AND w.team_id=t.id
 WHERE t.room_id=p_room GROUP BY t.id,t.name,t.position
 ), scores AS (
 SELECT x.*,
  (CASE WHEN mode='captain' THEN
     CASE WHEN mp.completed_at IS NOT NULL THEN
      (60 + greatest(0,40-least(40,ceil(extract(epoch from (mp.completed_at-x.started_at)))::int)))::numeric
     ELSE (coalesce(jsonb_array_length(mp.matched)/2,0)*10)::numeric END
   WHEN mode='rocket' THEN CASE WHEN coalesce(rp.cleared,0)=0 THEN 0::numeric ELSE coalesce(rp.cleared,0)::numeric
     +coalesce(least(0.99::numeric,greatest(0::numeric,
       extract(epoch from (coalesce(rp.eliminated_at,clock_timestamp())-x.started_at))::numeric/200)),0) END
   WHEN mode='sequence_memory' THEN (
      SELECT coalesce(avg(coalesce(ans.points,0))::numeric,0) FROM public.org_next_players member
      LEFT JOIN public.qwiz_secret_code_answers ans ON ans.room_id=p_room AND ans.card_position=p_position AND ans.player_id=member.id
      WHERE member.team_id=x.team_id AND member.room_id=p_room)
   WHEN mode='tug' THEN x.taps::numeric
   WHEN mode='blitz' THEN
    CASE WHEN EXISTS(SELECT 1 FROM public.qwiz_arcade_runs ar
       WHERE ar.room_id=p_room AND ar.card_position=p_position
       AND (ar.awarded_at IS NOT NULL OR clock_timestamp()>=ar.started_at+
         make_interval(secs=>public.qwiz_arcade_duration(
           coalesce((select a.settings from public.qwiz_room_activity a
             where a.room_id=p_room and a.card_position=p_position),'{}'::jsonb),'blitz'))))
       AND EXISTS(SELECT 1 FROM public.qwiz_arcade_runs ar
          JOIN public.qwiz_bank q ON q.id=ar.question_id
          WHERE ar.room_id=p_room AND ar.card_position=p_position
           AND public.qwiz_consensus_choice(p_room,p_position,x.team_id) IS NOT NULL
           AND (ar.option_order->>public.qwiz_consensus_choice(p_room,p_position,x.team_id))::int
                  =(q.solution->>'correct')::int)
       THEN 10::numeric ELSE 0::numeric END
   ELSE round((x.taps::numeric/greatest(x.members,1))*
    (1+0.10*x.navigator),0)
   END) AS pts,
   CASE WHEN mode='captain' THEN CASE WHEN mp.moves>0 THEN 1 ELSE 0 END
    WHEN mode='rocket' THEN CASE WHEN rp.cleared>0 THEN 1 ELSE 0 END
    WHEN mode='sequence_memory' THEN
      (SELECT count(*)::int FROM public.qwiz_secret_code_answers ans WHERE ans.room_id=p_room AND ans.card_position=p_position AND ans.team_id=x.team_id)
    WHEN mode='blitz' THEN
       ((SELECT count(*) FROM public.qwiz_consensus_votes cv
         WHERE cv.room_id=p_room AND cv.card_position=p_position AND cv.team_id=x.team_id)
       + (SELECT count(*) FROM public.qwiz_consensus_decisions cd
         WHERE cd.room_id=p_room AND cd.card_position=p_position AND cd.team_id=x.team_id))::int
    ELSE x.tapped_members END AS players_active,
   coalesce(mp.moves,0) AS moves
 FROM totals x
 LEFT JOIN public.qwiz_arcade_memory_players mp ON mp.room_id=p_room AND mp.card_position=p_position AND mp.team_id=x.team_id
 LEFT JOIN public.qwiz_arcade_runner_players rp ON rp.room_id=p_room AND rp.card_position=p_position AND rp.team_id=x.team_id
 )
 SELECT x.team_id,x.name,round(x.pts)::numeric,x.taps,x.players_active,x.members,
 row_number() OVER (ORDER BY x.pts DESC,CASE WHEN x.mode='captain' THEN x.moves ELSE 0 END ASC,x.position)::int
 FROM scores x ORDER BY x.pts DESC,CASE WHEN x.mode='captain' THEN x.moves ELSE 0 END ASC,x.position;
$function$;

-- qwiz_arcade_finalize
CREATE OR REPLACE FUNCTION public.qwiz_arcade_finalize(p_room uuid, p_position integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.qwiz_arcade_runs%rowtype; best_team uuid; last_team uuid; t record; v_title text; target int; correct_answer int; entry record; is_correct boolean; v_rating_points integer;
begin
 select * into r from public.qwiz_arcade_runs where room_id=p_room and card_position=p_position for update;
 if not found or r.awarded_at is not null then return;end if;
 SELECT greatest(0,least(200,coalesce(
  (rb.timeline->p_position->'settings'->>'arcade_score_points')::integer,
  CASE WHEN r.mode='blitz' THEN 10 ELSE 0 END)))
 INTO v_rating_points FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room;
 v_rating_points:=coalesce(v_rating_points,CASE WHEN r.mode='blitz' THEN 10 ELSE 0 END);
 IF r.mode='blitz' THEN v_rating_points:=least(10,v_rating_points); END IF;
 if r.mode='blitz' then
   SELECT (q.solution->>'correct')::int INTO correct_answer
     FROM public.qwiz_bank q WHERE q.id=r.question_id;
   FOR entry IN SELECT tm.id,tm.position FROM public.org_next_teams tm
     WHERE tm.room_id=p_room ORDER BY tm.position LOOP
     target:=public.qwiz_consensus_choice(p_room,p_position,entry.id);
     is_correct:=target IS NOT NULL AND (r.option_order->>target)::int=correct_answer;
     IF is_correct THEN
       UPDATE public.org_next_teams SET score=score+v_rating_points WHERE id=entry.id AND room_id=p_room;
       PERFORM public.qwiz_arcade_award(p_room,p_position,entry.id,'blitz_answer',
         'Знатоки консенсуса',20);
     END IF;
   END LOOP;
   -- Equal correct answers earn 10 each; majority support breaks ties for bonus winner.
   SELECT tm.id INTO best_team FROM public.org_next_teams tm
     WHERE tm.room_id=p_room
       AND public.qwiz_consensus_choice(p_room,p_position,tm.id) IS NOT NULL
       AND (r.option_order->>public.qwiz_consensus_choice(p_room,p_position,tm.id))::int=correct_answer
     ORDER BY
       (SELECT count(*) FROM public.qwiz_consensus_votes vv WHERE vv.room_id=p_room
          AND vv.card_position=p_position AND vv.team_id=tm.id
          AND vv.choice=public.qwiz_consensus_choice(p_room,p_position,tm.id)) DESC,
       (SELECT min(vv.updated_at) FROM public.qwiz_consensus_votes vv WHERE vv.room_id=p_room
          AND vv.card_position=p_position AND vv.team_id=tm.id) ASC NULLS LAST,
       tm.position ASC LIMIT 1;
   IF best_team IS NOT NULL THEN
      PERFORM public.qwiz_arcade_award(p_room,p_position,best_team,
        'blitz_consensus','Командный консенсус',12);
   END IF;
 else
   SELECT team_id INTO best_team FROM public.qwiz_arcade_rank(p_room,p_position)
     WHERE points>0 ORDER BY place LIMIT 1;
   IF best_team IS NOT NULL THEN
     IF r.mode IN ('tug','captain','sequence_memory') AND v_rating_points>0 THEN
       UPDATE public.org_next_teams SET score=score+v_rating_points
       WHERE id=best_team AND room_id=p_room;
     END IF;
     v_title:=CASE r.mode WHEN 'rocket' THEN 'Покорители препятствий'
       WHEN 'tug' THEN 'Мастера тапов' WHEN 'sequence_memory' THEN 'Хранители кода' ELSE 'Мастера памяти' END;
     PERFORM public.qwiz_arcade_award(p_room,p_position,best_team,r.mode||'_win',v_title,15);
   END IF;
 end if;
 for t in select team_id,active from public.qwiz_arcade_rank(p_room,p_position) where active>0 loop
  perform public.qwiz_arcade_award(p_room,p_position,t.team_id,'participant','Команда в деле',5);
  if t.active>=3 then perform public.qwiz_arcade_award(p_room,p_position,t.team_id,'coordinated','Слаженная команда',8);end if;
 end loop;
 update public.qwiz_arcade_runs set awarded_at=clock_timestamp(),winner_team=best_team
 where room_id=p_room and card_position=p_position;
end $function$;

-- qwiz_arcade_state
CREATE OR REPLACE FUNCTION public.qwiz_arcade_state(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype; a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype; me public.org_next_players%rowtype; my_wallet public.qwiz_arcade_wallets%rowtype;
 v_secs int; v_team uuid; v_question jsonb; v_teams jsonb; v_awards jsonb; v_my jsonb; v_captain uuid; v_achievements jsonb; v_next_team uuid; v_active_teams int;
begin
 if p_code !~ '^[A-F0-9]{8}$' then raise exception 'Неверный код комнаты';end if;
 select * into r from public.org_next_rooms where code=p_code;
 if not found then raise exception 'Комната не найдена';end if;
 if r.phase='intermission' then
   select * into a from public.qwiz_room_activity where room_id=r.id;
   v:=public.qwiz_arcade_ensure(r.id);
 else
   select * into v from public.qwiz_arcade_runs where room_id=r.id order by card_position desc limit 1;
 end if;
 if v.room_id is null then return jsonb_build_object('mode',null,'server_now',clock_timestamp(),'mine',public.qwiz_arcade_wallet_state(r.id));end if;
 v_secs:=public.qwiz_arcade_duration(a.settings,v.mode);
 select coalesce(jsonb_agg(jsonb_build_object('id',s.team_id,'name',s.name,'points',s.points,
 'taps',s.taps,'active',s.active,'members',s.members,'place',s.place) order by s.place),'[]'::jsonb)
 into v_teams from public.qwiz_arcade_rank(r.id,v.card_position) s;
 if v.mode='blitz' and clock_timestamp()>=v.started_at+interval '3 seconds'
    and v.question_id is not null and r.phase='intermission' then
   select jsonb_build_object('prompt',q.prompt,
     'options',coalesce((select jsonb_agg(q.options->(e.value::int) ORDER BY e.ordinality)
       from jsonb_array_elements_text(v.option_order) with ordinality e(value,ordinality)),q.options),
     'media_url',coalesce(q.solution->>'media_url',''),
     'explanation',CASE WHEN v.awarded_at IS NOT NULL OR clock_timestamp()>=v.started_at+
       make_interval(secs=>v_secs) THEN q.explanation ELSE NULL END,
     'correct',CASE WHEN v.awarded_at IS NOT NULL OR clock_timestamp()>=v.started_at+
       make_interval(secs=>v_secs) THEN
       to_jsonb(coalesce((SELECT (e.ordinality-1)::int from jsonb_array_elements_text(v.option_order)
         with ordinality e(value,ordinality)
         WHERE e.value::int=(q.solution->>'correct')::int),(q.solution->>'correct')::int))
       ELSE NULL END)
     into v_question from public.qwiz_bank q WHERE q.id=v.question_id;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('team_id',z.team_id,'title',z.title,'credits',z.credits) order by z.awarded_at),'[]'::jsonb)
 into v_awards from public.qwiz_arcade_achievements z where z.room_id=r.id and z.card_position=v.card_position;
 if (select auth.uid()) is not null then
   select * into me from public.org_next_players p where p.room_id=r.id
   and (p.user_id=(select auth.uid()) or exists(select 1 from public.qwiz_player_device_access d where d.room_id=r.id and d.player_id=p.id and d.user_id=(select auth.uid()))) limit 1;
 end if;
 if me.id is not null and me.team_id is not null then
   select * into my_wallet from public.qwiz_arcade_wallets where room_id=r.id and team_id=me.team_id;
   select coalesce((select c.player_id from public.qwiz_lobby_captains c where c.room_id=r.id and c.team_id=me.team_id), (select p.id from public.org_next_players p where p.team_id=me.team_id order by p.joined_at,p.id limit 1)) into v_captain;
   select coalesce(jsonb_agg(jsonb_build_object('title',z.title,'credits',z.credits,'code',z.code) order by z.awarded_at desc),'[]'::jsonb)
   into v_achievements from public.qwiz_arcade_achievements z where z.room_id=r.id and z.team_id=me.team_id;
   v_my:=jsonb_build_object('team_id',me.team_id,'player_id',me.id,'captain',v_captain=me.id,
     'credits',coalesce(my_wallet.credits,0),'turbo',coalesce(my_wallet.turbo,0),
     'grip',coalesce(my_wallet.grip,0),'navigator',coalesce(my_wallet.navigator,0),
     'achievements',v_achievements);
 end if;
 return jsonb_build_object('mode',v.mode,'running',r.phase='intermission' and a.card_position=v.card_position,
 'card_position',v.card_position,'started_at',v.started_at,
 'capture_until',case when v.mode='blitz' then v.started_at+interval '7 seconds' else null end,
 'ends_at',v.started_at+make_interval(secs=>v_secs),'server_now',clock_timestamp(),
 'teams',v_teams,'question',v_question,'secret_code',CASE WHEN v.mode='sequence_memory' AND r.phase='intermission' THEN public.qwiz_secret_code_state(p_code) ELSE NULL END,'consensus',CASE WHEN v.mode='blitz' THEN public.qwiz_consensus_state(r.id,v.card_position) ELSE NULL END,'answer_team',v.answer_team,
 'answer_correct',v.answer_correct,'answered_at',v.answered_at,'blitz_attempts',v.blitz_attempts,'blitz_eligible_team',v_next_team,
 'winner_team',v.winner_team,'awarded_at',v.awarded_at,
 'awards',v_awards,'mine',v_my);
end $function$;

-- qwiz_compile_build
CREATE OR REPLACE FUNCTION public.qwiz_compile_build(p_build uuid, p_title text DEFAULT NULL::text, p_allow_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_build public.qwiz_builds%rowtype; v_card public.qwiz_build_cards%rowtype;
 v_question public.qwiz_bank%rowtype; v_questions jsonb:='[]'::jsonb; v_timeline jsonb:='[]'::jsonb;
 v_n integer; v_skip integer; v_secs integer; v_order text; v_limit integer;
 v_quiz uuid; v_code text; v_room uuid; v_count integer; v_opts jsonb; v_sol jsonb; v_match_choices jsonb; v_missing jsonb:='[]'::jsonb; v_used uuid[]:='{}'::uuid[]; v_modes jsonb; v_flags boolean;v_geo_round boolean:=false;v_geography boolean:=false;
begin
 v_owner:=(select auth.uid());
 if v_owner is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 
 select * into v_build from public.qwiz_builds where id=p_build and owner_id=v_owner;
 if not found then raise exception 'Сборка не найдена'; end if;
 for v_card in select * from public.qwiz_build_cards where build_id=p_build order by position loop
   if v_card.card_type in ('round','bonus') and v_card.settings->>'arcade_mode'='russia_map' then v_geography:=true;end if;
   
   -- Unconfigured arcade card must not be scheduled.
   IF v_card.card_type IN ('team_stats','player_stats') THEN
     v_missing:=v_missing||jsonb_build_array(jsonb_build_object(
       'title',v_card.title,
       'reason','Устаревшая отдельная карточка рейтинга. Откройте сборку и сохраните её'));
     CONTINUE;
   END IF;
   IF v_card.card_type IN ('bonus','duel')
      AND COALESCE(v_card.settings->>'arcade_mode','') NOT IN
         ('rocket','blitz','tug','captain','sequence_memory','russia_map') THEN
     v_missing:=v_missing||jsonb_build_array(jsonb_build_object(
       'title',v_card.title,'reason','Укажите механику мини-игры или удалите карточку'));
     CONTINUE;
   END IF;
   IF v_card.settings->>'arcade_mode'='russia_map' THEN
     IF NOT (CASE WHEN jsonb_typeof(v_card.settings->'geo_modes')='array'
      THEN jsonb_array_length(v_card.settings->'geo_modes')>0 ELSE false END) THEN
       v_missing:=v_missing||jsonb_build_array(jsonb_build_object(
         'title',v_card.title,'reason','Выберите хотя бы одну механику карты России'));
       CONTINUE;
     END IF;
     IF EXISTS(
       SELECT 1 FROM jsonb_array_elements_text(v_card.settings->'geo_modes') item
       WHERE item.value NOT IN
       ('locate','identify','capital','flag','silhouette','neighbour','detective','district')
     ) THEN
       RAISE EXCEPTION 'Карточка «%»: недопустимая механика карты России',v_card.title;
     END IF;
   END IF;
   v_timeline:=v_timeline||jsonb_build_array(jsonb_build_object(
    'type',v_card.card_type,'title',v_card.title,'icon',v_card.icon,
    'settings',v_card.settings,'first_question',jsonb_array_length(v_questions)));
   if v_card.card_type='round' and coalesce(v_card.settings->>'arcade_mode','') <> 'russia_map' then
     if v_card.topic_id is null then
      v_missing:=v_missing||jsonb_build_array(jsonb_build_object('title',v_card.title,'topic_id',null,'reason','Не выбрана тема'));continue;
     end if;
     v_limit:=greatest(1,least(100,coalesce((v_card.settings->>'count')::integer,5)));
     v_skip:=greatest(0,coalesce((v_card.settings->>'offset')::integer,0));
     v_secs:=greatest(10,least(120,coalesce((v_card.settings->>'seconds')::integer,30)));
     v_order:=coalesce(v_card.settings->>'order','random');
     v_flags:=exists(select 1 from public.qwiz_topics t where t.id=v_card.topic_id and t.name='Флаги мира');
     v_geo_round:=exists(select 1 from public.qwiz_topics t where t.id=v_card.topic_id and t.name='География России');
     v_modes:='[]'::jsonb;
     if v_flags then
      v_modes:=v_card.settings->'flag_modes';
      if v_modes is null or v_modes='[]'::jsonb then v_missing:=v_missing||jsonb_build_array(jsonb_build_object('title',v_card.title,'reason','Выберите механики флагов'));continue;end if;
      if jsonb_typeof(v_modes)<>'array' then raise exception 'Раунд «%»: неверный список механик',v_card.title;end if;
      if jsonb_array_length(v_modes)>12 or exists(select 1 from jsonb_array_elements_text(v_modes) x where x.value not in ('country','picker','colors','symbols','fragments','errors','similar','assemble','multiple','memory','geo','history')) then
       raise exception 'Раунд «%»: неверный список механик',v_card.title;
      end if;
     elsif v_geo_round then
       v_modes:=v_card.settings->'geo_modes';
       IF jsonb_typeof(v_modes) IS DISTINCT FROM 'array'
          OR jsonb_array_length(v_modes)=0 THEN
         v_missing:=v_missing||jsonb_build_array(jsonb_build_object(
           'title',v_card.title,'reason','Выберите механики географических вопросов: административный центр или федеральный округ'));
         CONTINUE;
       END IF;
       IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_modes) item
                 WHERE item.value NOT IN ('capital','district')) THEN
         RAISE EXCEPTION 'Раунд «%»: недопустимые механики обычной географии',v_card.title;
       END IF;
     end if;
     v_count:=0;
     for v_question in
      select * from public.qwiz_bank b where b.owner_id=v_owner and b.topic_id=v_card.topic_id
       and not (b.id=any(v_used))
       and (not v_geo_round or b.solution->>'geo_mode' in (select jsonb_array_elements_text(v_modes)))
       and (not v_flags or (b.kind in ('flag','order','multi') and b.tags @> array['fw:published']::text[]
        and b.solution->>'flag_mode' in (select jsonb_array_elements_text(v_modes))
        and public.qwiz_flags_question_valid(b.kind,b.options,b.solution)))
       and b.kind in ('single','boolean','multi','match','order','sequence','text','number','date','estimate','riddle','puzzle','blitz','flag','portrait','image','audio','video','map','poll','hotspot')
      order by case when v_order='random' then random() end,
        case when v_order='reverse' then b.created_at end desc,
        case when v_order='sequential' then b.created_at end asc,
        b.id
      limit v_limit offset v_skip
     loop
       
       v_opts:=v_question.options;v_sol:=v_question.solution;v_match_choices:='[]'::jsonb;
       if v_question.kind not in ('order','sequence','match','hotspot') then
         select x->'options',x->'solution' into v_opts,v_sol from
           public.qwiz_shuffle_question_options(v_opts,v_sol) x;
       end if;
       if v_question.kind in ('order','sequence') then
         select coalesce(jsonb_agg(x.val order by case when v_question.solution->>'flag_mode'='assemble' then random() else x.ordinality end desc),'[]'::jsonb)
         into v_opts from jsonb_array_elements(v_question.options) with ordinality as x(val,ordinality);
         v_sol:=v_question.solution||jsonb_build_object('order',v_question.options);
       elsif v_question.kind='match' then
         select coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',1))) order by x.ordinality),'[]'::jsonb),
          coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',2))) order by x.ordinality desc),'[]'::jsonb),
          coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',2))) order by x.ordinality),'[]'::jsonb)
         into v_opts,v_match_choices,v_sol from jsonb_array_elements_text(v_question.options) with ordinality as x(value,ordinality);
         v_sol:=jsonb_build_object('matches',v_sol);
       end if;
       v_questions:=v_questions||jsonb_build_array(jsonb_build_object(
         'prompt',v_question.prompt,'options',v_opts,'match_choices',v_match_choices, 'solution',v_sol,
         'correct',case when v_sol ? 'correct' then (v_sol->>'correct')::integer else null end,
         'explanation',v_question.explanation,
         'flag_visual',coalesce(v_question.solution->'flag_visual','null'::jsonb),
         'flag_assembly',v_question.solution->'flag_assembly','flag_memory',v_question.solution->'flag_memory',
         'media_url',coalesce(v_question.solution->>'media_url',''),'illustration_url',coalesce(v_question.solution->>'illustration_url',''),
         'answer_duration',greatest(5,least(30,coalesce((v_card.settings->>'answer_seconds')::int,10))),'duration',greatest(v_secs,coalesce((v_question.solution->'flag_memory'->>'seconds')::int,0)+10),'topic',(select t.name from public.qwiz_topics t where t.id=v_card.topic_id),'round_title',v_card.title,'round_sound',coalesce(v_card.settings->>'sound','fanfare'),'card_type',v_card.card_type,
         'round_index',v_card.position,'kind',v_question.kind));
       v_used:=array_append(v_used,v_question.id);
       v_count:=v_count+1;
     end loop;
     if v_count=0 then v_missing:=v_missing||jsonb_build_array(jsonb_build_object('title',v_card.title,'topic_id',v_card.topic_id,'reason',case when v_flags then 'Нет опубликованных вопросов выбранных механик с выбранного номера' else 'Нет игровых вопросов с выбранного номера' end));end if;
   end if;
 end loop;
 if jsonb_array_length(v_questions)>100 then raise exception 'В сборке не больше 100 игровых вопросов';end if;
 if jsonb_array_length(v_questions)=0 AND NOT v_geography
  AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_timeline) c
    WHERE c->>'type' IN ('round','bonus','duel')
      AND c->'settings'->>'arcade_mode' IN ('blitz','captain','tug','sequence_memory','russia_map')
  )
  AND v_missing='[]'::jsonb THEN
  v_missing:=jsonb_build_array(jsonb_build_object('title','Сборка',
    'reason','Добавьте хотя бы одну игровую карточку или раунд вопросов'));
 end if;
 if not p_allow_empty and v_missing<>'[]'::jsonb then raise exception 'Сборка ещё не готова: % — %',v_missing->0->>'title',v_missing->0->>'reason';end if;
 return jsonb_build_object('title',coalesce(nullif(trim(p_title),''),v_build.title),'questions',v_questions,'timeline',v_timeline,'issues',v_missing);
end $function$;

-- qwiz_advance_room
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
   if v_next_card->'settings'->>'arcade_mode' in ('rocket','blitz','tug','captain','sequence_memory','russia_map') then
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
   and x.settings->>'arcade_mode' in ('rocket','blitz','tug','captain','sequence_memory','russia_map')) then
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
    if v_next_card->'settings'->>'arcade_mode' in ('rocket','blitz','tug','captain','sequence_memory','russia_map') then
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
end $function$;

-- qwiz_check_room_start
CREATE OR REPLACE FUNCTION public.qwiz_check_room_start(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype;q_count integer;v_source_build uuid;v_stored_timeline jsonb;v_current jsonb;
begin
 select * into r from public.org_next_rooms x where x.id=p_room for update;
 if r.id is null or r.owner_id is distinct from (select auth.uid()) or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 if r.phase<>'lobby' then return;end if;
 if r.setup_issues<>'[]'::jsonb then perform public.qwiz_refresh_room_content(p_room);select * into r from public.org_next_rooms x where x.id=p_room;end if;
 -- Reject stale compiled room timelines, including removed mechanisms.
 select snapshot.build_id,snapshot.timeline into v_source_build,v_stored_timeline
 from public.qwiz_room_builds snapshot where snapshot.room_id=p_room;
 if v_source_build is not null then
   v_current:=public.qwiz_compile_build(v_source_build,r.title,false);
   if v_stored_timeline is distinct from v_current->'timeline' then
     raise exception 'Сборка изменена после создания комнаты. Подготовьте комнату заново, чтобы исключить старые механики.';
   end if;
 end if;
 select jsonb_array_length(q.questions) into q_count from public.org_next_quizzes q where q.id=r.quiz_id;
 if (
  coalesce(q_count,0)=0
  AND NOT EXISTS(
    SELECT 1 FROM public.qwiz_room_builds b
    CROSS JOIN LATERAL jsonb_array_elements(b.timeline) card
    WHERE b.room_id=p_room
      AND card->>'type' IN ('round','bonus','duel')
      AND card->'settings'->>'arcade_mode' IN ('russia_map','blitz','captain','tug','sequence_memory')
  )
 ) OR r.setup_issues<>'[]'::jsonb THEN
  RAISE EXCEPTION 'Добавьте игровую карточку или вопросы, затем обновите комнату';
 END IF;
 if exists(select 1 from public.org_next_players p where p.room_id=p_room and p.team_id is null) then raise exception 'Сначала распределите всех участников по командам';end if;
end $function$;

-- qwiz_tick
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
   if a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain','sequence_memory') then
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
     stage_seconds:=case when a.settings->>'arcade_mode'='russia_map' then public.qwiz_geo_total_seconds(a.settings) else case a.kind when 'card_intro' then greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))) when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
     if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
   end if;
   select * into r from public.org_next_rooms where id=r.id for update;
   if r.phase<>'intermission' or public.qwiz_party_paused(r.id) then return false;end if;
   select * into a from public.qwiz_room_activity where room_id=r.id;
   if not found then return false;end if;
   if a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain','sequence_memory') then
      -- Recheck after acquiring the room lock: other tick callers may race.
      stage_seconds:=public.qwiz_arcade_duration(a.settings,a.settings->>'arcade_mode');
      if clock_timestamp()<a.entered_at+make_interval(secs=>stage_seconds) then return false;end if;
      if public.qwiz_bonus_eligible(r.id,a.card_position) AND
        clock_timestamp()<a.entered_at+make_interval(secs=>public.qwiz_arcade_duration(a.settings,a.settings->>'arcade_mode')+public.qwiz_bonus_window(r.id,a.card_position))
        AND NOT public.qwiz_bonus_vote_complete(r.id,a.card_position)
       then return false;end if;
      perform public.qwiz_boost_lock(r.id);
   else
      stage_seconds:=case when a.settings->>'arcade_mode'='russia_map' then public.qwiz_geo_total_seconds(a.settings) else case a.kind when 'card_intro' then greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))) when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9 when 'break' then 12 when 'team_stats' then 9 when 'player_stats' then 9 else 10 end end;
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
end $function$;

-- qwiz_party_control
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
   if not found or a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain','sequence_memory') then
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
  if p_action='finish' or p_action='next' then
    delete from public.qwiz_room_pauses where room_id=p_room;
  elsif exists(select 1 from public.qwiz_room_pauses where room_id=p_room) then
    raise exception 'Сначала продолжите игру';
  end if;
  if p_action='next' and r.phase='countdown' then
    update public.org_next_rooms set ends_at=clock_timestamp()-interval '1 second'
      where id=p_room;
    perform public.qwiz_tick(r.code);
    return jsonb_build_object('phase',(select phase from public.org_next_rooms where id=p_room),'paused',false);
  end if;

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
        insert into public.qwiz_geo_control_steps(room_id,step) values(p_room,1)
          on conflict(room_id) do update set step=public.qwiz_geo_control_steps.step+1;
        return jsonb_build_object('phase','intermission','geo_advanced',true);
      end if;
    end if;
    if found and a.settings->>'arcade_mode' in ('rocket','blitz','tug','captain','sequence_memory') then
      perform public.qwiz_arcade_finalize(p_room,a.card_position);
      perform public.qwiz_boost_lock(p_room);
    end if;
  end if;
  return jsonb_build_object('phase',public.org_next_advance(p_room,p_action),'paused',false);
 end if;
 raise exception 'Неизвестное действие';
end $function$;

-- qwiz_arcade_leave
CREATE OR REPLACE FUNCTION public.qwiz_arcade_leave()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (tg_op='DELETE' or (tg_op='UPDATE' and new.card_position is distinct from old.card_position))
 and old.settings->>'arcade_mode' in ('rocket','blitz','tug','captain','sequence_memory') then
  perform public.qwiz_arcade_finalize(old.room_id,old.card_position);
 end if;
 return case when tg_op='DELETE' then old else new end;
end $function$;

-- qwiz_boost_view
CREATE OR REPLACE FUNCTION public.qwiz_boost_view(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.org_next_rooms%rowtype; a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype;p public.org_next_players%rowtype;
 total int;choices jsonb;picked text;seconds int;elapsed numeric;
 stage text;strategy text;phase_ends timestamptz;target_name text;vote_window integer;first_window integer;
BEGIN
 SELECT * INTO r FROM public.org_next_rooms WHERE code=p_code;
 IF NOT FOUND OR r.phase<>'intermission' THEN RETURN NULL;END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=r.id;
 IF a.settings->>'arcade_mode' NOT IN ('rocket','blitz','tug','captain','sequence_memory') THEN RETURN NULL;END IF;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=r.id AND card_position=a.card_position;
 IF NOT FOUND THEN RETURN NULL;END IF;
 seconds:=public.qwiz_arcade_duration(a.settings,a.settings->>'arcade_mode');
 elapsed:=extract(epoch FROM clock_timestamp()-v.started_at)-seconds;
 vote_window:=public.qwiz_bonus_window(r.id,a.card_position);
 first_window:=ceil(vote_window*0.46)::integer;
 IF elapsed<0 OR elapsed>=vote_window OR NOT public.qwiz_bonus_eligible(r.id,a.card_position) THEN RETURN NULL;END IF;
 strategy:=public.qwiz_bonus_strategy(r.id,a.card_position);
 SELECT count(*) INTO total FROM public.org_next_players WHERE room_id=r.id AND team_id=v.winner_team;
 stage:=CASE WHEN elapsed>=first_window OR
   (strategy IS NOT NULL AND (SELECT count(*) FROM public.qwiz_bonus_ballots b WHERE
    b.room_id=r.id AND b.card_position=a.card_position AND b.team_id=v.winner_team
    AND b.vote_phase='strategy')>=total AND total>0)
   THEN 'option' ELSE 'strategy' END;
 phase_ends:=v.started_at+make_interval(secs=>seconds+CASE WHEN stage='strategy' THEN first_window ELSE vote_window END);
 IF (SELECT auth.uid()) IS NOT NULL THEN
  SELECT * INTO p FROM public.org_next_players x WHERE x.room_id=r.id
   AND(x.user_id=(SELECT auth.uid()) OR EXISTS(
    SELECT 1 FROM public.qwiz_player_device_access d WHERE d.room_id=r.id AND d.player_id=x.id AND d.user_id=(SELECT auth.uid()))) LIMIT 1;
 END IF;
 SELECT coalesce(jsonb_object_agg(choice,n),'{}'::jsonb) INTO choices FROM
 (SELECT choice,count(*) n FROM public.qwiz_bonus_ballots WHERE room_id=r.id
  AND card_position=a.card_position AND team_id=v.winner_team AND vote_phase=stage GROUP BY choice) x;
 SELECT choice INTO picked FROM public.qwiz_bonus_ballots
 WHERE room_id=r.id AND card_position=a.card_position AND player_id=p.id AND vote_phase=stage;
 SELECT name INTO target_name FROM public.qwiz_arcade_rank(r.id,a.card_position) 
 WHERE team_id<>v.winner_team ORDER BY place LIMIT 1;
 RETURN jsonb_build_object('winner_team',v.winner_team,'team_members',total,'counts',choices,
 'my_choice',picked,'stage',stage,'strategy',strategy,'target_name',target_name,
 'can_vote',p.id IS NOT NULL AND p.team_id=v.winner_team AND (stage='strategy' OR strategy IS NOT NULL),
 'open',elapsed<vote_window,'vote_ends_at',phase_ends,'full_vote_ends_at',v.started_at+make_interval(secs=>seconds+vote_window));
END $function$;

-- qwiz_boost_lock
CREATE OR REPLACE FUNCTION public.qwiz_boost_lock(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.qwiz_room_activity%rowtype;v public.qwiz_arcade_runs%rowtype;
 r public.org_next_rooms%rowtype;tl jsonb;qs jsonb;target int;idx int;
 leader uuid;recipient uuid;chosen_effect text;strategy text;members int;votes int;
BEGIN
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room;
 IF NOT FOUND OR a.settings->>'arcade_mode' NOT IN ('rocket','blitz','tug','captain','sequence_memory') THEN RETURN;END IF;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=a.card_position FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF;
 PERFORM public.qwiz_arcade_finalize(p_room,a.card_position);
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=a.card_position;
 IF v.winner_team IS NULL OR NOT public.qwiz_bonus_eligible(p_room,a.card_position)
 OR EXISTS(SELECT 1 FROM public.qwiz_round_boosts WHERE room_id=p_room AND card_position=a.card_position) THEN RETURN;END IF;
 SELECT count(*) INTO members FROM public.org_next_players WHERE room_id=p_room AND team_id=v.winner_team;
 strategy:=public.qwiz_bonus_strategy(p_room,a.card_position);
 IF strategy IS NULL THEN RETURN;END IF;
 SELECT ballot.choice,count(*) INTO chosen_effect,votes FROM public.qwiz_bonus_ballots AS ballot
 WHERE ballot.room_id=p_room AND ballot.card_position=a.card_position AND ballot.team_id=v.winner_team AND ballot.vote_phase='option'
 AND ((strategy='support' AND ballot.choice IN ('headstart','teamwork','momentum'))
 OR (strategy='sabotage' AND ballot.choice IN ('fog','storm','drain')))
 GROUP BY ballot.choice ORDER BY count(*) DESC,ballot.choice LIMIT 1;
 IF votes IS NULL OR votes<=members/2 THEN RETURN;END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 SELECT b.timeline,q.questions INTO tl,qs FROM public.qwiz_room_builds b
 JOIN public.org_next_quizzes q ON q.id=r.quiz_id WHERE b.room_id=p_room;
 IF tl IS NULL THEN RETURN;END IF;
 FOR idx IN a.card_position+1..jsonb_array_length(tl)-1 LOOP
 IF tl->idx->>'type'='round' AND coalesce(tl->idx->'settings'->>'arcade_mode','')<>'russia_map' THEN
 target:=coalesce((tl->idx->>'first_question')::int,r.question_index+1);EXIT;END IF; END LOOP;
 IF target IS NULL OR qs->target IS NULL THEN RETURN;END IF;
 recipient:=v.winner_team;
 IF strategy='sabotage' THEN
  SELECT team_id INTO recipient FROM public.qwiz_arcade_rank(p_room,a.card_position)
   WHERE team_id<>v.winner_team ORDER BY place LIMIT 1;
 END IF;
 IF recipient IS NULL THEN RETURN;END IF;
 INSERT INTO public.qwiz_round_boosts(room_id,card_position,team_id,choice,round_index)
 VALUES(p_room,a.card_position,recipient,chosen_effect,coalesce((qs->target->>'round_index')::int,0))
 ON CONFLICT DO NOTHING;
END $function$;
