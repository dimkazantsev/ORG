-- Replace tap-to-capture in blitz with team consensus.
-- Team score +10 once after the round; captain decision or majority fallback.
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
 'teams',v_teams,'question',v_question,'consensus',CASE WHEN v.mode='blitz' THEN public.qwiz_consensus_state(r.id,v.card_position) ELSE NULL END,'answer_team',v.answer_team,
 'answer_correct',v.answer_correct,'answered_at',v.answered_at,'blitz_attempts',v.blitz_attempts,'blitz_eligible_team',v_next_team,
 'winner_team',v.winner_team,'awarded_at',v.awarded_at,
 'awards',v_awards,'mine',v_my);
end $function$
;

CREATE OR REPLACE FUNCTION public.qwiz_arcade_action(p_room uuid, p_action text, p_count integer DEFAULT 1, p_upgrade text DEFAULT NULL::text, p_choice integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype; a public.qwiz_room_activity%rowtype;
 p public.org_next_players%rowtype; v public.qwiz_arcade_runs%rowtype; c public.qwiz_arcade_clicks%rowtype;
 w public.qwiz_arcade_wallets%rowtype; t timestamptz; v_secs integer; v_until timestamptz;
 v_tokens numeric; v_cost int; v_col text; v_best uuid; v_question public.qwiz_bank%rowtype; v_good boolean; v_captain uuid;
begin
 if (select auth.uid()) is null then raise exception 'Войдите в игру';end if;
 select * into r from public.org_next_rooms where id=p_room;
 if not found then raise exception 'Комната не найдена';end if;
 select * into p from public.org_next_players x where x.room_id=p_room and (
 x.user_id=(select auth.uid()) or exists(select 1 from public.qwiz_player_device_access d
 where d.room_id=p_room and d.player_id=x.id and d.user_id=(select auth.uid()))
 ) limit 1;
 if not found or p.team_id is null then raise exception 'Сначала присоединитесь к команде';end if;
 t:=clock_timestamp();
 if p_action='buy' then
  if r.phase not in ('lobby','question','result','countdown') then raise exception 'Улучшения можно приобретать между испытаниями';end if;
  if p_upgrade not in ('turbo','grip','navigator') then raise exception 'Неизвестное улучшение';end if;
  v_cost:=case p_upgrade when 'turbo' then 15 when 'grip' then 15 else 20 end;
  insert into public.qwiz_arcade_wallets(room_id,team_id) values(p_room,p.team_id) on conflict do nothing;
  select * into w from public.qwiz_arcade_wallets where room_id=p_room and team_id=p.team_id for update;
  if w.credits<v_cost then raise exception 'Недостаточно жетонов';end if;
  if (p_upgrade='turbo' and w.turbo=1) or(p_upgrade='grip' and w.grip=1)
     or (p_upgrade='navigator' and w.navigator=1) then raise exception 'Это улучшение уже куплено';end if;
  update public.qwiz_arcade_wallets set credits=credits-v_cost,
    turbo=case when p_upgrade='turbo' then 1 else turbo end,
    grip=case when p_upgrade='grip' then 1 else grip end,
    navigator=case when p_upgrade='navigator' then 1 else navigator end
    where room_id=p_room and team_id=p.team_id;
  return jsonb_build_object('ok',true,'action','buy','upgrade',p_upgrade);
 end if;
 if r.phase<>'intermission' then raise exception 'Испытание сейчас не проводится';end if;
 select * into a from public.qwiz_room_activity where room_id=p_room;
 v:=public.qwiz_arcade_ensure(p_room);
 if v.room_id is null or v.awarded_at is not null then raise exception 'Здесь нет активной командной игры';end if;
 v_secs:=public.qwiz_arcade_duration(a.settings,v.mode);
 v_until:=v.started_at+make_interval(secs=>v_secs);
 if v.mode='blitz' and p_action IN ('tap','answer') then raise exception 'Обновите страницу: теперь играется Блиц-консенсус';end if;
 if p_action='tap' then
  if v.mode in ('captain','rocket') then raise exception 'Use qwiz_arcade_play instead'; end if;
  if p_count is null or p_count<1 or p_count>12 then raise exception 'Некорректный пакет нажатий';end if;
  if t>v_until then raise exception 'Время нажатий истекло';end if;
  if v.mode='blitz' and t>v.started_at+interval '7 seconds' then raise exception 'Захват вопроса завершён';end if;
  if v.mode='captain' then
   if p_count<>1 then raise exception 'В дуэли только один удар';end if;
   select x.id into v_captain from public.org_next_players x where x.team_id=p.team_id order by x.joined_at,x.id limit 1;
   if v_captain is distinct from p.id then raise exception 'Нажать может только капитан команды';end if;
  end if;
  insert into public.qwiz_arcade_clicks(room_id,card_position,player_id)
    values(p_room,v.card_position,p.id) on conflict do nothing;
  select * into c from public.qwiz_arcade_clicks
    where room_id=p_room and card_position=v.card_position and player_id=p.id for update;
  if v.mode='captain' then
    if c.reacted_at is not null or c.false_start then raise exception 'У капитана только одна попытка';end if;
    if t<v.started_at+interval '3 seconds' then
      update public.qwiz_arcade_clicks set false_start=true where room_id=p_room and card_position=v.card_position and player_id=p.id;
      return jsonb_build_object('ok',false,'false_start',true);
    end if;
    update public.qwiz_arcade_clicks set reacted_at=t,clicks=1,touched_at=t
      where room_id=p_room and card_position=v.card_position and player_id=p.id;
  else
    v_tokens:=least(12,c.tokens+greatest(0,extract(epoch from (t-c.touched_at)))*8);
    if v_tokens<p_count then raise exception 'Слишком быстрые нажатия: часть не засчитана';end if;
    update public.qwiz_arcade_clicks set clicks=clicks+p_count,tokens=v_tokens-p_count,touched_at=t
    where room_id=p_room and card_position=v.card_position and player_id=p.id;
  end if;
  return jsonb_build_object('ok',true,'action','tap','count',p_count);
 elsif p_action='answer' then
   if v.mode<>'blitz' or v.question_id is null then raise exception 'Блиц-вопрос недоступен';end if;
   if t<v.started_at+interval '7 seconds' or t>v_until then raise exception 'Время ответа ещё не наступило или закончилось';end if;
   if p_choice is null or p_choice not between 0 and 3 then raise exception 'Неверный вариант ответа';end if;
   select * into v from public.qwiz_arcade_runs where room_id=p_room and card_position=v.card_position for update;
   if v.answer_correct is true then raise exception 'Блиц-вопрос уже решён';end if;
   select team_id into v_best from public.qwiz_arcade_rank(p_room,v.card_position)
     where points>0 order by place limit 1 offset v.blitz_attempts;
   if p.team_id is distinct from v_best then raise exception 'Право ответа сейчас у другой команды';end if;
   select * into v_question from public.qwiz_bank where id=v.question_id;
   v_good:=coalesce((v.option_order->>p_choice)::int,p_choice)=(v_question.solution->>'correct')::int;
   update public.qwiz_arcade_runs set answered_at=t,answer_team=p.team_id,answer_correct=v_good,blitz_attempts=blitz_attempts+1
     where room_id=p_room and card_position=v.card_position;
   if v_good then
    update public.org_next_teams set score=score+10 where id=p.team_id and room_id=p_room;
    perform public.qwiz_arcade_award(p_room,v.card_position,p.team_id,'blitz_answer','Знатоки блица',20);
   end if;
   return jsonb_build_object('ok',true,'action','answer','correct',v_good);
 else raise exception 'Неизвестное действие';end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.qwiz_arcade_finalize(p_room uuid, p_position integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.qwiz_arcade_runs%rowtype; best_team uuid; last_team uuid; t record; v_title text; target int; correct_answer int; entry record; is_correct boolean;
begin
 select * into r from public.qwiz_arcade_runs where room_id=p_room and card_position=p_position for update;
 if not found or r.awarded_at is not null then return;end if;
 if r.mode='blitz' then
   SELECT (q.solution->>'correct')::int INTO correct_answer
     FROM public.qwiz_bank q WHERE q.id=r.question_id;
   FOR entry IN SELECT tm.id,tm.position FROM public.org_next_teams tm
     WHERE tm.room_id=p_room ORDER BY tm.position LOOP
     target:=public.qwiz_consensus_choice(p_room,p_position,entry.id);
     is_correct:=target IS NOT NULL AND (r.option_order->>target)::int=correct_answer;
     IF is_correct THEN
       UPDATE public.org_next_teams SET score=score+10 WHERE id=entry.id AND room_id=p_room;
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
     v_title:=CASE r.mode WHEN 'rocket' THEN 'Покорители препятствий'
       WHEN 'tug' THEN 'Мастера тапов' ELSE 'Мастера памяти' END;
     PERFORM public.qwiz_arcade_award(p_room,p_position,best_team,r.mode||'_win',v_title,15);
   END IF;
 end if;
 for t in select team_id,active from public.qwiz_arcade_rank(p_room,p_position) where active>0 loop
  perform public.qwiz_arcade_award(p_room,p_position,t.team_id,'participant','Команда в деле',5);
  if t.active>=3 then perform public.qwiz_arcade_award(p_room,p_position,t.team_id,'coordinated','Слаженная команда',8);end if;
 end loop;
 update public.qwiz_arcade_runs set awarded_at=clock_timestamp(),winner_team=best_team
 where room_id=p_room and card_position=p_position;
end $function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.qwiz_bonus_eligible(p_room uuid, p_position integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v public.qwiz_arcade_runs%rowtype; r record; other_points numeric;
 pct integer; gap integer; card jsonb;
BEGIN
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=p_position;
 IF NOT FOUND OR v.winner_team IS NULL OR v.awarded_at IS NULL THEN RETURN false;END IF;
 SELECT rb.timeline->p_position INTO card FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room;
 pct:=greatest(50,least(100,coalesce((card->'settings'->>'bonus_percent')::int,70)));
 gap:=greatest(0,least(200,coalesce((card->'settings'->>'bonus_lead')::int,15)));
 SELECT * INTO r FROM public.qwiz_arcade_rank(p_room,p_position) a WHERE a.team_id=v.winner_team;
 SELECT max(a.points) INTO other_points FROM public.qwiz_arcade_rank(p_room,p_position) a WHERE a.team_id<>v.winner_team;
 -- Team-wide participation applies to tap games; blitz and captain games are played by one delegate.
 -- No award when there is no competing team with a measurable score.
 RETURN r.team_id IS NOT NULL
   AND r.points>=1 AND (other_points IS NULL OR (v.mode='blitz' AND r.points>=other_points OR v.mode<>'blitz' AND r.points-other_points>=gap))
   AND (v.mode IN ('blitz','captain') AND r.active>=1
        OR v.mode IN ('rocket','tug') AND r.active*100>=pct*greatest(r.members,1));
END $function$
;

CREATE OR REPLACE FUNCTION public.qwiz_round_results(p_room uuid, p_card integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH card AS (
 SELECT coalesce(rb.timeline->p_card->'settings'->>'arcade_mode','') mode
 FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room
), room_questions AS (
 SELECT q.questions FROM public.org_next_rooms rm JOIN public.org_next_quizzes q ON q.id=rm.quiz_id WHERE rm.id=p_room
), answers AS (
 SELECT a.player_id,p.team_id,a.points,a.correct FROM public.org_next_answers a
 JOIN public.org_next_players p ON p.id=a.player_id AND p.room_id=a.room_id CROSS JOIN room_questions rq
 WHERE a.room_id=p_room AND coalesce((rq.questions->a.question_index->>'round_index')::int,0)=p_card
), player_scores AS (
 SELECT p.id,p.name,p.team_id,coalesce(sum(a.points),0)::int question_points,
 coalesce((SELECT g.score FROM public.qwiz_geo_runs g WHERE g.room_id=p_room AND g.player_id=p.id AND g.card_position=p_card),0)::int map_points,
 coalesce((SELECT c.clicks FROM public.qwiz_arcade_clicks c WHERE c.room_id=p_room AND c.player_id=p.id AND c.card_position=p_card),0)::int taps,
 coalesce((SELECT round(rank.points)::int
    FROM public.qwiz_arcade_memory_players mp JOIN public.qwiz_arcade_rank(p_room,p_card) rank
     ON rank.team_id=mp.team_id
    WHERE mp.room_id=p_room AND mp.card_position=p_card AND mp.player_id=p.id
    LIMIT 1),0)::int memory_points,
 count(a.player_id)::int answers,count(*) FILTER(WHERE a.correct)::int correct
 FROM public.org_next_players p LEFT JOIN answers a ON a.player_id=p.id WHERE p.room_id=p_room
 GROUP BY p.id,p.name,p.team_id
), team_scores AS (
 SELECT t.id,t.name,t.score AS total_score,
 coalesce(sum(p.question_points),0)::int question_points,coalesce(sum(p.map_points),0)::int map_points,
 coalesce((SELECT ar.points FROM public.qwiz_arcade_rank(p_room,p_card) ar WHERE ar.team_id=t.id),0)::numeric arcade_points,
 coalesce((SELECT CASE WHEN
  public.qwiz_consensus_choice(p_room,p_card,t.id) IS NOT NULL
  AND (ar.option_order->>public.qwiz_consensus_choice(p_room,p_card,t.id))::int=(q.solution->>'correct')::int
  THEN 10 ELSE 0 END FROM public.qwiz_arcade_runs ar
  JOIN public.qwiz_bank q ON q.id=ar.question_id
  WHERE ar.room_id=p_room AND ar.card_position=p_card AND ar.mode='blitz'),0)::int blitz_points,
 coalesce(sum(p.taps),0)::int taps,coalesce(sum(p.answers),0)::int answers,coalesce(sum(p.correct),0)::int correct
 FROM public.org_next_teams t LEFT JOIN player_scores p ON p.team_id=t.id WHERE t.room_id=p_room GROUP BY t.id,t.name,t.score
), info AS (SELECT coalesce((SELECT mode FROM card),'') mode)
SELECT jsonb_build_object('mode',info.mode,
 'team_unit','баллы за вопросы',
 'player_unit','баллы за вопросы',
 'metric_unit',case info.mode when 'tug' then 'нажатия' when 'rocket' then 'препятствия' when 'captain' then 'результат мэмори' when 'blitz' then 'командное согласие' else null end,
 'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode='blitz' then blitz_points
    when info.mode in ('rocket','tug','captain') then 0
    else question_points end,'metric',case when info.mode in ('rocket','blitz','tug','captain') then arcade_points else null end,'total_score',total_score,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points::numeric
 when info.mode='blitz' then blitz_points::numeric when info.mode in ('rocket','tug','captain') then arcade_points else question_points::numeric end) DESC,name)
 FROM team_scores),'[]'::jsonb),
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nickname',name,'score',case
    when info.mode='russia_map' then map_points
    when info.mode in ('rocket','blitz','tug','captain') then 0
    else question_points end,'metric',case when info.mode='captain' then memory_points when info.mode in ('rocket','blitz','tug') then taps else null end,'answers',answers,'correct',correct)
 ORDER BY (case when info.mode='russia_map' then map_points
 when info.mode='captain' then memory_points
 when info.mode in ('rocket','blitz','tug') then taps else question_points end) DESC,name)
 FROM player_scores),'[]'::jsonb),
 'reward',(SELECT jsonb_build_object('choice',b.choice,'target',t.name,
 'tone',case when b.choice in ('fog','storm','drain') then 'harm' else 'boost' end,
 'title',case b.choice when 'headstart' then 'Фора +12'
  when 'teamwork' then 'Командный рывок'
  when 'momentum' then 'Импульс'
  when 'fog' then 'Туман соперника'
  when 'storm' then 'Штормовой заслон'
  when 'drain' then 'Энергетический отток'
  else 'Командное преимущество' end,
 'pending',b.applied_at is null)
 FROM public.qwiz_round_boosts b JOIN public.org_next_teams t ON t.id=b.team_id
 WHERE b.room_id=p_room AND b.card_position=p_card ORDER BY b.team_id LIMIT 1))
FROM info;
$function$
;