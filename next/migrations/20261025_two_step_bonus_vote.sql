-- Two-stage majority vote (strategy then perk/penalty), server-timed in 7 + 8 seconds.
-- Rarity threshold: leader scored >=25 mode points, leads runner-up by >=15,
-- and >=70% of its active roster took part. All parameters derive from saved card settings.
CREATE TABLE IF NOT EXISTS public.qwiz_bonus_ballots(
 room_id uuid NOT NULL REFERENCES public.org_next_rooms(id) ON DELETE CASCADE,
 card_position integer NOT NULL,team_id uuid NOT NULL REFERENCES public.org_next_teams(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES public.org_next_players(id) ON DELETE CASCADE,
 vote_phase text NOT NULL CHECK(vote_phase IN ('strategy','option')),
 choice text NOT NULL CHECK(choice IN ('support','sabotage','headstart','teamwork','momentum','fog','storm','drain')),
 voted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(room_id,card_position,player_id,vote_phase));
ALTER TABLE public.qwiz_bonus_ballots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qwiz_bonus_ballots FROM PUBLIC,anon,authenticated;
ALTER TABLE public.qwiz_round_boosts DROP CONSTRAINT IF EXISTS qwiz_round_boosts_choice_check;
ALTER TABLE public.qwiz_round_boosts ADD CONSTRAINT qwiz_round_boosts_choice_check
 CHECK(choice IN ('headstart','teamwork','momentum','fog','storm','drain'));

CREATE OR REPLACE FUNCTION public.qwiz_bonus_eligible(p_room uuid,p_position integer)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $b$
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
 RETURN r.team_id IS NOT NULL AND r.points>=25 AND r.points-coalesce(other_points,0)>=gap
   AND r.active*100>=pct*greatest(r.members,1);
END $b$;
REVOKE ALL ON FUNCTION public.qwiz_bonus_eligible(uuid,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.qwiz_bonus_strategy(p_room uuid,p_position integer)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $b$
SELECT CASE WHEN coalesce(sum(1) FILTER(WHERE choice='support'),0)>members/2 THEN 'support'
 WHEN coalesce(sum(1) FILTER(WHERE choice='sabotage'),0)>members/2 THEN 'sabotage'
 ELSE NULL END
FROM public.qwiz_bonus_ballots v CROSS JOIN LATERAL
 (SELECT count(*) members FROM public.org_next_players p
  WHERE p.team_id=v.team_id AND p.room_id=p_room) t
WHERE v.room_id=p_room AND v.card_position=p_position AND v.vote_phase='strategy'
GROUP BY members ORDER BY members DESC LIMIT 1;
$b$;
REVOKE ALL ON FUNCTION public.qwiz_bonus_strategy(uuid,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.qwiz_bonus_vote_complete(p_room uuid,p_position integer)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $b$
DECLARE v public.qwiz_arcade_runs%rowtype; members int; votes int; mode text;
BEGIN
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=p_position;
 IF NOT FOUND OR v.winner_team IS NULL THEN RETURN false;END IF;
 SELECT count(*) INTO members FROM public.org_next_players WHERE room_id=p_room AND team_id=v.winner_team;
 SELECT count(*) INTO votes FROM public.qwiz_bonus_ballots
 WHERE room_id=p_room AND card_position=p_position AND team_id=v.winner_team AND vote_phase='strategy';
 IF members<1 OR votes<members THEN RETURN false;END IF;
 mode:=public.qwiz_bonus_strategy(p_room,p_position);
 IF mode IS NULL THEN RETURN true; END IF;
 SELECT count(*) INTO votes FROM public.qwiz_bonus_ballots
 WHERE room_id=p_room AND card_position=p_position AND team_id=v.winner_team AND vote_phase='option';
 RETURN votes>=members;
END $b$;
REVOKE ALL ON FUNCTION public.qwiz_bonus_vote_complete(uuid,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.qwiz_boost_view(p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $b$
DECLARE r public.org_next_rooms%rowtype; a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype;p public.org_next_players%rowtype;
 total int;choices jsonb;picked text;seconds int;elapsed numeric;
 stage text;strategy text;phase_ends timestamptz;target_name text;
BEGIN
 SELECT * INTO r FROM public.org_next_rooms WHERE code=p_code;
 IF NOT FOUND OR r.phase<>'intermission' THEN RETURN NULL;END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=r.id;
 IF a.settings->>'arcade_mode' NOT IN ('rocket','blitz','tug','captain') THEN RETURN NULL;END IF;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=r.id AND card_position=a.card_position;
 IF NOT FOUND THEN RETURN NULL;END IF;
 seconds:=greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)));
 elapsed:=extract(epoch FROM clock_timestamp()-v.started_at)-seconds;
 IF elapsed<0 OR elapsed>=15 OR NOT public.qwiz_bonus_eligible(r.id,a.card_position) THEN RETURN NULL;END IF;
 stage:=CASE WHEN elapsed<7 THEN 'strategy' ELSE 'option' END;
 strategy:=public.qwiz_bonus_strategy(r.id,a.card_position);
 phase_ends:=v.started_at+make_interval(secs=>seconds+CASE WHEN stage='strategy' THEN 7 ELSE 15 END);
 SELECT count(*) INTO total FROM public.org_next_players WHERE room_id=r.id AND team_id=v.winner_team;
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
 'open',elapsed<15,'vote_ends_at',phase_ends,'full_vote_ends_at',v.started_at+make_interval(secs=>seconds+15));
END $b$;

CREATE OR REPLACE FUNCTION public.qwiz_vote_boost(p_room uuid,p_choice text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $b$
DECLARE r public.org_next_rooms%rowtype;a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype;p public.org_next_players%rowtype;
 seconds integer;elapsed numeric;stage text;strategy text;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Войдите в игру';END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 IF NOT FOUND OR r.phase<>'intermission' THEN RAISE EXCEPTION 'Голосование завершено';END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=a.card_position;
 IF NOT FOUND THEN RAISE EXCEPTION 'Нет соревнования';END IF;
 seconds:=greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)));
 elapsed:=extract(epoch FROM clock_timestamp()-v.started_at)-seconds;
 IF elapsed<0 OR elapsed>=15 OR NOT public.qwiz_bonus_eligible(p_room,a.card_position) THEN
   RAISE EXCEPTION 'Сейчас нельзя голосовать';END IF;
 stage:=CASE WHEN elapsed<7 THEN 'strategy' ELSE 'option' END;
 strategy:=public.qwiz_bonus_strategy(p_room,a.card_position);
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
END $b$;

CREATE OR REPLACE FUNCTION public.qwiz_boost_lock(p_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $b$
DECLARE a public.qwiz_room_activity%rowtype;v public.qwiz_arcade_runs%rowtype;
 r public.org_next_rooms%rowtype;tl jsonb;qs jsonb;target int;idx int;
 leader uuid;recipient uuid;choice text;strategy text;members int;votes int;
BEGIN
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room;
 IF NOT FOUND OR a.settings->>'arcade_mode' NOT IN ('rocket','blitz','tug','captain') THEN RETURN;END IF;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=a.card_position FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF;
 PERFORM public.qwiz_arcade_finalize(p_room,a.card_position);
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=a.card_position;
 IF v.winner_team IS NULL OR NOT public.qwiz_bonus_eligible(p_room,a.card_position)
 OR EXISTS(SELECT 1 FROM public.qwiz_round_boosts WHERE room_id=p_room AND card_position=a.card_position) THEN RETURN;END IF;
 SELECT count(*) INTO members FROM public.org_next_players WHERE room_id=p_room AND team_id=v.winner_team;
 strategy:=public.qwiz_bonus_strategy(p_room,a.card_position);
 IF strategy IS NULL THEN RETURN;END IF;
 SELECT choice,count(*) INTO choice,votes FROM public.qwiz_bonus_ballots
 WHERE room_id=p_room AND card_position=a.card_position AND team_id=v.winner_team AND vote_phase='option'
 AND ((strategy='support' AND choice IN ('headstart','teamwork','momentum'))
 OR (strategy='sabotage' AND choice IN ('fog','storm','drain')))
 GROUP BY choice ORDER BY count(*) DESC,choice LIMIT 1;
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
 VALUES(p_room,a.card_position,recipient,choice,coalesce((qs->target->>'round_index')::int,0))
 ON CONFLICT DO NOTHING;
END $b$;

CREATE OR REPLACE FUNCTION public.qwiz_apply_round_boost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $b$
DECLARE current_round int;b public.qwiz_round_boosts%rowtype;members int;points int;prior int;
BEGIN
 IF new.phase<>'question' OR (old.phase='question' AND old.question_index=new.question_index) THEN RETURN new;END IF;
 SELECT coalesce((q.questions->new.question_index->>'round_index')::int,0)
 INTO current_round FROM public.org_next_quizzes q WHERE q.id=new.quiz_id;
 FOR b IN SELECT * FROM public.qwiz_round_boosts WHERE room_id=new.id AND round_index=current_round AND applied_at IS NULL FOR UPDATE LOOP
 SELECT count(*) INTO members FROM public.org_next_players WHERE team_id=b.team_id;
 SELECT score INTO prior FROM public.org_next_teams WHERE id=b.team_id FOR UPDATE;
 points:=CASE b.choice WHEN 'headstart' THEN 12 WHEN 'teamwork' THEN least(24,3*members)
 WHEN 'momentum' THEN least(30,greatest(5,round(coalesce(prior,0)*0.15)::int))
 WHEN 'fog' THEN -5 WHEN 'storm' THEN -8 WHEN 'drain' THEN -12 ELSE 0 END;
 UPDATE public.org_next_teams SET score=greatest(0,score+points) WHERE id=b.team_id AND room_id=new.id;
 UPDATE public.qwiz_round_boosts SET applied_at=clock_timestamp(),points_awarded=CASE WHEN points<0 THEN -least(-points,coalesce(prior,0)) ELSE points END
 WHERE room_id=b.room_id AND card_position=b.card_position AND team_id=b.team_id;
 END LOOP;
 RETURN new;
END $b$;
