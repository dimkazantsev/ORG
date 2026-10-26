-- QWIZ-PARTY release 2026-10-27: authoritative ten-point question scoring
-- and authenticated per-player assembly verdict after a result is revealed.
-- Do not modify or regrade historical responses here.

CREATE OR REPLACE FUNCTION public.org_next_answer(p_room uuid, p_choice integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room public.org_next_rooms%rowtype; v_player public.org_next_players%rowtype;
 v_question jsonb; v_correct boolean; v_points integer; v_ans uuid;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход'; end if;
 select * into v_room from public.org_next_rooms where id=p_room for share;
 if not found or v_room.phase!='question' or (v_room.ends_at IS NULL OR v_room.ends_at<=now() OR public.qwiz_party_paused(p_room))
 then raise exception 'Время ответа закончилось'; end if;
 select * into v_player from public.org_next_players p
 where p.room_id=p_room and (p.user_id=(select auth.uid())
 or exists(select 1 from public.qwiz_player_device_access d
    where d.room_id=p_room and d.player_id=p.id and d.user_id=(select auth.uid()))) limit 1;
 if not found then raise exception 'Игрок не найден'; end if;
 if not public.qwiz_answer_eligible(p_room,v_player.id,v_room.question_index) then raise exception 'Этот раунд не назначен вашей команде или участнику'; end if;
 select questions->v_room.question_index into v_question from public.org_next_quizzes where id=v_room.quiz_id;
 if v_question->'flag_memory'->>'seconds' is not null and clock_timestamp()<v_room.ends_at-make_interval(secs=>(v_question->>'duration')::int-(v_question->'flag_memory'->>'seconds')::int) then raise exception 'Сначала запомните флаг. Ответ откроется после скрытия';end if;
 if coalesce(v_question->>'kind','single') not in ('single','boolean','flag','portrait','image')
 then raise exception 'Используйте обработчик сложного вопроса';end if;
 if p_choice is null or p_choice<0 or p_choice>=jsonb_array_length(v_question->'options') then raise exception 'Неверный вариант'; end if;
 v_correct:=p_choice=(v_question->>'correct')::integer;
 v_points:=case when v_correct then 10 else 0 end;
 insert into public.org_next_answers(room_id,player_id,question_index,choice,correct,points)
 values(p_room,v_player.id,v_room.question_index,p_choice,v_correct,v_points)
 on conflict(room_id,player_id,question_index) do nothing returning id into v_ans;
 if v_ans is null then raise exception 'Ответ уже принят'; end if;
 if v_points>0 then update public.org_next_teams set score=score+v_points where id=v_player.team_id and room_id=p_room; end if;
 return jsonb_build_object('accepted',true);
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

CREATE OR REPLACE FUNCTION public.qwiz_my_question_result(p_room uuid, p_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_player uuid;v_phase text;v_index integer;v_correct boolean;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Требуется вход';END IF;
 SELECT r.phase,r.question_index INTO v_phase,v_index
 FROM public.org_next_rooms r WHERE r.id=p_room;
 IF NOT FOUND THEN RAISE EXCEPTION 'Комната не найдена';END IF;
 IF v_phase NOT IN ('result','finished') OR (v_phase='result' AND v_index<>p_index)
 THEN RAISE EXCEPTION 'Результат ещё не открыт';END IF;
 SELECT p.id INTO v_player FROM public.org_next_players p
 WHERE p.room_id=p_room AND
  (p.user_id=(SELECT auth.uid()) OR EXISTS
   (SELECT 1 FROM public.qwiz_player_device_access d WHERE
    d.room_id=p_room AND d.player_id=p.id AND d.user_id=(SELECT auth.uid())))
 LIMIT 1;
 IF v_player IS NULL THEN RAISE EXCEPTION 'Нет доступа к результату';END IF;
 SELECT a.correct INTO v_correct FROM public.org_next_answers a
 WHERE a.room_id=p_room AND a.player_id=v_player AND a.question_index=p_index;
 RETURN jsonb_build_object('answered',v_correct IS NOT NULL,'correct',COALESCE(v_correct,false));
END $function$
;

CREATE OR REPLACE FUNCTION public.qwiz_submit_answer(p_room uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room public.org_next_rooms%rowtype;v_player public.org_next_players%rowtype;
 q jsonb; sol jsonb; kind text; v_correct boolean:=false; v_points integer:=0; a_id uuid;
 v_index integer; v_idx jsonb; expected text[]; supplied text[]; v_ans text; target numeric; actual numeric;
 xp numeric; yp numeric;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>4096
 then raise exception 'Некорректный формат ответа';end if;
 select * into v_room from public.org_next_rooms where id=p_room for share;
 if not found or v_room.phase<>'question' or (v_room.ends_at IS NULL OR v_room.ends_at<=now() OR public.qwiz_party_paused(p_room)) then raise exception 'Время ответа завершено';end if;
 select * into v_player from public.org_next_players p
  where p.room_id=p_room and (p.user_id=(select auth.uid()) or exists(
   select 1 from public.qwiz_player_device_access d where d.room_id=p_room and d.player_id=p.id and d.user_id=(select auth.uid())))
 limit 1;
 if not found then raise exception 'Участник не найден';end if;
 if not public.qwiz_answer_eligible(p_room,v_player.id,v_room.question_index) then
  raise exception 'Этот раунд вам недоступен';end if;
 select questions->v_room.question_index into q from public.org_next_quizzes where id=v_room.quiz_id;
 if q->'flag_memory'->>'seconds' is not null and clock_timestamp()<v_room.ends_at-make_interval(secs=>(q->>'duration')::int-(q->'flag_memory'->>'seconds')::int) then raise exception 'Сначала запомните флаг. Ответ откроется после скрытия';end if;
 if q is null then raise exception 'Вопрос отсутствует';end if;
 kind:=coalesce(q->>'kind','single');
 sol:=coalesce(q->'solution',jsonb_build_object('correct',q->'correct'));
 if kind in ('single','boolean','flag','portrait','image','audio','video','map','poll') then
  if jsonb_typeof(p_payload->'index')<>'number' then raise exception 'Выберите вариант ответа';end if;
  v_index:=(p_payload->>'index')::int;
  if v_index not between 0 and jsonb_array_length(q->'options')-1 then raise exception 'Неверный вариант';end if;
  if kind<>'poll' then v_correct:=v_index=(q->>'correct')::int;end if;
 elsif kind='multi' then
  if jsonb_typeof(p_payload->'indices')<>'array' or jsonb_array_length(p_payload->'indices')>6
    or jsonb_array_length(p_payload->'indices')<1 then raise exception 'Выберите правильные варианты';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'indices') x
      where jsonb_typeof(x.value)<>'number' or (x.value#>>'{}')::integer not between 0 and jsonb_array_length(q->'options')-1)
   then raise exception 'Некорректные варианты';end if;
  select array_agg((x.value#>>'{}')::text order by (x.value#>>'{}')::int) into supplied from
   (select distinct value from jsonb_array_elements(p_payload->'indices'))x;
  select array_agg((x.value#>>'{}')::text order by (x.value#>>'{}')::int) into expected from
   (select distinct value from jsonb_array_elements(sol->'correct_indices'))x;
  v_correct:=supplied=expected;
 elsif kind in ('order','sequence','match') then
  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')<>jsonb_array_length(q->'options')
  then raise exception 'Заполните все позиции';end if;
  if kind='match' then
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into supplied from jsonb_array_elements(p_payload->'items') with ordinality x(value,ordinality);
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into expected from jsonb_array_elements(sol->'matches') with ordinality x(value,ordinality);
  else
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into supplied from jsonb_array_elements(p_payload->'items') with ordinality x(value,ordinality);
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into expected from jsonb_array_elements(sol->'order') with ordinality x(value,ordinality);
  end if;
  v_correct:=supplied=expected;
 elsif kind in ('text','riddle','puzzle','blitz','date') then
  v_ans:=public.qwiz_normalize_answer(left(p_payload->>'text',200));
  if v_ans='' then raise exception 'Введите ответ';end if;
  v_correct:=v_ans=public.qwiz_normalize_answer(sol->>'answer');
  if not v_correct and jsonb_typeof(sol->'alternatives')='array' then
   v_correct:=exists(select 1 from jsonb_array_elements_text(sol->'alternatives') x
    where public.qwiz_normalize_answer(x.value)=v_ans);
  end if;
 elsif kind in ('number','estimate') then
  if coalesce(p_payload->>'text','') !~ '^-?[0-9]+([.,][0-9]+)?$' then raise exception 'Введите число';end if;
  actual:=replace(p_payload->>'text',',','.')::numeric;
  target:=replace(sol->>'answer',',','.')::numeric;
  v_correct:=abs(actual-target)<=greatest(0,least(1000000,coalesce(nullif(sol->>'tolerance','')::numeric,0)));
 elsif kind='hotspot' then
  if jsonb_typeof(p_payload->'x')<>'number' or jsonb_typeof(p_payload->'y')<>'number' then raise exception 'Нажмите на изображение';end if;
  xp:=(p_payload->>'x')::numeric;yp:=(p_payload->>'y')::numeric;
  if xp not between 0 and 100 or yp not between 0 and 100 then raise exception 'Неверные координаты';end if;
  v_correct:=(xp-(sol->>'x')::numeric)^2+(yp-(sol->>'y')::numeric)^2 <= ((sol->>'radius')::numeric)^2;
 else raise exception 'Тип пока не поддерживает игровые ответы';end if;
 v_points:=case when v_correct then 10 else 0 end;
 insert into public.org_next_answers(room_id,player_id,question_index,choice,correct,points)
 values(p_room,v_player.id,v_room.question_index,
   case when kind in ('single','boolean','flag','portrait','image','audio','video','map','poll') then v_index else 0 end,
   v_correct,v_points)
 on conflict(room_id,player_id,question_index) do nothing returning id into a_id;
 if a_id is null then raise exception 'Ответ уже принят';end if;
 insert into public.qwiz_answer_details(answer_id,response) values(a_id,p_payload);
 if v_points>0 then update public.org_next_teams set score=score+v_points where id=v_player.team_id and room_id=p_room;end if;
 return jsonb_build_object('accepted',true);
end $function$
;

REVOKE ALL ON FUNCTION public.qwiz_my_question_result(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qwiz_my_question_result(uuid,integer) TO authenticated;
