-- Proportional 10–15 second reward window: higher-scoring leaders have more time, but never over 15 seconds.
CREATE OR REPLACE FUNCTION public.qwiz_bonus_window(p_room uuid,p_position integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $win$
 SELECT greatest(10,least(15,10+floor(greatest(0,coalesce(
 (select points from public.qwiz_arcade_rank(p_room,p_position) where place=1 limit 1),0))/25)::integer));
$win$;
REVOKE ALL ON FUNCTION public.qwiz_bonus_window(uuid,integer) FROM PUBLIC,anon,authenticated;
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
 IF a.settings->>'arcade_mode' NOT IN ('rocket','blitz','tug','captain') THEN RETURN NULL;END IF;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=r.id AND card_position=a.card_position;
 IF NOT FOUND THEN RETURN NULL;END IF;
 seconds:=greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)));
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

CREATE OR REPLACE FUNCTION public.qwiz_vote_boost(p_room uuid, p_choice text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.org_next_rooms%rowtype;a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype;p public.org_next_players%rowtype;
 seconds integer;elapsed numeric;stage text;strategy text;vote_window integer;first_window integer;members integer;strategy_votes integer;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Войдите в игру';END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 IF NOT FOUND OR r.phase<>'intermission' THEN RAISE EXCEPTION 'Голосование завершено';END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=a.card_position;
 IF NOT FOUND THEN RAISE EXCEPTION 'Нет соревнования';END IF;
 seconds:=greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)));
 elapsed:=extract(epoch FROM clock_timestamp()-v.started_at)-seconds;
 vote_window:=public.qwiz_bonus_window(p_room,a.card_position);
 first_window:=ceil(vote_window*0.46)::integer;
 IF elapsed<0 OR elapsed>=vote_window OR NOT public.qwiz_bonus_eligible(p_room,a.card_position) THEN
   RAISE EXCEPTION 'Сейчас нельзя голосовать';END IF;
 strategy:=public.qwiz_bonus_strategy(p_room,a.card_position);
 SELECT count(*) INTO members FROM public.org_next_players WHERE room_id=p_room AND team_id=v.winner_team;
 SELECT count(*) INTO strategy_votes FROM public.qwiz_bonus_ballots WHERE room_id=p_room
   AND card_position=a.card_position AND team_id=v.winner_team AND vote_phase='strategy';
 stage:=CASE WHEN elapsed>=first_window OR
  (strategy IS NOT NULL AND strategy_votes>=members AND members>0) THEN 'option' ELSE 'strategy' END;
 IF stage='strategy' AND p_choice NOT IN ('support','sabotage') THEN RAISE EXCEPTION 'Сначала выберите стратегию';END IF;
 IF stage='option' AND (strategy IS NULL OR
  (strategy='support' AND p_choice NOT IN ('headstart','teamwork','momentum')) OR
  (strategy='sabotage' AND p_choice NOT IN ('fog','storm','drain')))
 THEN RAISE EXCEPTION 'Нужно выбрать вариант одобренной стратегии';END IF;
 SELECT * INTO p FROM public.org_next_players x WHERE x.room_id=p_room AND
 (x.user_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.qwiz_player_device_access d
 WHERE d.room_id=p_room AND d.player_id=x.id AND d.user_id=(SELECT auth.uid()))) LIMIT 1;
 IF p.id IS NULL OR p.team_id IS DISTINCT FROM v.winner_team THEN RAISE EXCEPTION 'Голосует команда-победитель';END IF;
 INSERT INTO public.qwiz_bonus_ballots(room_id,card_position,team_id,player_id,vote_phase,choice)
 VALUES(p_room,a.card_position,p.team_id,p.id,stage,p_choice)
 ON CONFLICT(room_id,card_position,player_id,vote_phase) DO UPDATE SET choice=excluded.choice,voted_at=clock_timestamp();
 BEGIN PERFORM realtime.send(jsonb_build_object('changed',true),'phase','org-next-'||r.code,false); EXCEPTION WHEN OTHERS THEN NULL; END;
 RETURN jsonb_build_object('ok',true,'stage',stage,'choice',p_choice);
END $function$;

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
      if public.qwiz_bonus_eligible(r.id,a.card_position) AND
        clock_timestamp()<a.entered_at+make_interval(secs=>greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)))+public.qwiz_bonus_window(r.id,a.card_position))
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
end $function$;