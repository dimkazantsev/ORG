
-- QWIZ-PARTY: team-wide Blitz Consensus, one ballot per player and one
-- authoritative decision per team. Neither tables nor hidden answer are public.
CREATE TABLE IF NOT EXISTS public.qwiz_consensus_votes (
 room_id uuid NOT NULL REFERENCES public.org_next_rooms(id) ON DELETE CASCADE,
 card_position integer NOT NULL,
 player_id uuid NOT NULL REFERENCES public.org_next_players(id) ON DELETE CASCADE,
 team_id uuid NOT NULL REFERENCES public.org_next_teams(id) ON DELETE CASCADE,
 choice integer NOT NULL CHECK(choice BETWEEN 0 AND 3),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(room_id,card_position,player_id)
);
CREATE TABLE IF NOT EXISTS public.qwiz_consensus_decisions (
 room_id uuid NOT NULL REFERENCES public.org_next_rooms(id) ON DELETE CASCADE,
 card_position integer NOT NULL,
 team_id uuid NOT NULL REFERENCES public.org_next_teams(id) ON DELETE CASCADE,
 choice integer NOT NULL CHECK(choice BETWEEN 0 AND 3),
 captain_id uuid NOT NULL REFERENCES public.org_next_players(id) ON DELETE CASCADE,
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(room_id,card_position,team_id)
);
CREATE INDEX IF NOT EXISTS qwiz_consensus_votes_team_ix ON public.qwiz_consensus_votes(room_id,card_position,team_id);
ALTER TABLE public.qwiz_consensus_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qwiz_consensus_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qwiz_consensus_votes,public.qwiz_consensus_decisions FROM PUBLIC,anon,authenticated;
-- Stable majority fallback: sort by vote count, earliest vote, then choice ID.
-- If nobody votes and the captain does not decide, that team receives zero.
CREATE OR REPLACE FUNCTION public.qwiz_consensus_choice(p_room uuid,p_card integer,p_team uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
 SELECT COALESCE(
  (SELECT d.choice FROM public.qwiz_consensus_decisions d WHERE d.room_id=p_room AND d.card_position=p_card AND d.team_id=p_team),
  (SELECT v.choice FROM public.qwiz_consensus_votes v
   WHERE v.room_id=p_room AND v.card_position=p_card AND v.team_id=p_team
   GROUP BY v.choice ORDER BY count(*) DESC,min(v.updated_at) ASC,v.choice ASC LIMIT 1)
 );
$$;
REVOKE ALL ON FUNCTION public.qwiz_consensus_choice(uuid,integer,uuid) FROM PUBLIC,anon,authenticated;
-- State never includes correct answer during the active round.
CREATE OR REPLACE FUNCTION public.qwiz_consensus_state(p_room uuid,p_card integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v public.qwiz_arcade_runs%rowtype; r public.org_next_rooms%rowtype;
 p public.org_next_players%rowtype; captain uuid; secs integer; elapsed double precision;
 cutoff timestamptz; finish_at timestamptz; cutoff_secs integer;
 totals jsonb; team_votes jsonb; mine_choice integer; final_choice integer; votes_count int;
 mine_team uuid; is_captain boolean:=false;
BEGIN
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=p_card AND mode='blitz';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 secs:=public.qwiz_arcade_duration(COALESCE((SELECT a.settings FROM public.qwiz_room_activity a
  WHERE a.room_id=p_room AND a.card_position=p_card),'{}'::jsonb),'blitz');
 cutoff_secs:=greatest(7,ceil(secs*0.65)::int);
 cutoff:=v.started_at+make_interval(secs=>cutoff_secs);
 finish_at:=v.started_at+make_interval(secs=>secs);
 elapsed:=extract(epoch FROM (clock_timestamp()-v.started_at));
 IF (SELECT auth.uid()) IS NOT NULL THEN
  SELECT * INTO p FROM public.org_next_players x WHERE x.room_id=p_room
   AND (x.user_id=(SELECT auth.uid()) OR EXISTS(
     SELECT 1 FROM public.qwiz_player_device_access d WHERE d.room_id=p_room AND d.player_id=x.id
       AND d.user_id=(SELECT auth.uid()))) LIMIT 1;
 END IF;
 mine_team:=p.team_id;
 IF mine_team IS NOT NULL THEN
  SELECT COALESCE((SELECT c.player_id FROM public.qwiz_lobby_captains c
     WHERE c.room_id=p_room AND c.team_id=mine_team),
   (SELECT x.id FROM public.org_next_players x WHERE x.room_id=p_room
    AND x.team_id=mine_team ORDER BY x.joined_at,x.id LIMIT 1)) INTO captain;
  is_captain:=(captain=p.id);
  SELECT v.choice INTO mine_choice FROM public.qwiz_consensus_votes v
   WHERE v.room_id=p_room AND v.card_position=p_card AND v.player_id=p.id;
  SELECT d.choice INTO final_choice FROM public.qwiz_consensus_decisions d
   WHERE d.room_id=p_room AND d.card_position=p_card AND d.team_id=mine_team;
  SELECT count(*) INTO votes_count FROM public.qwiz_consensus_votes v
   WHERE v.room_id=p_room AND v.card_position=p_card AND v.team_id=mine_team;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('team_id',t.id,'name',t.name,
   'votes',(SELECT count(*) FROM public.qwiz_consensus_votes vv WHERE vv.room_id=p_room AND vv.card_position=p_card AND vv.team_id=t.id),
   'members',(SELECT count(*) FROM public.org_next_players pp WHERE pp.room_id=p_room AND pp.team_id=t.id),
   'submitted',EXISTS(SELECT 1 FROM public.qwiz_consensus_decisions dd WHERE dd.room_id=p_room AND dd.card_position=p_card AND dd.team_id=t.id))
   ORDER BY t.position),'[]'::jsonb) INTO totals
 FROM public.org_next_teams t WHERE t.room_id=p_room;
 IF mine_team IS NOT NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('choice',z.choice,'votes',z.cnt)
   ORDER BY z.choice),'[]'::jsonb) INTO team_votes
  FROM (SELECT vv.choice,count(*)::int cnt FROM public.qwiz_consensus_votes vv
    WHERE vv.room_id=p_room AND vv.card_position=p_card AND vv.team_id=mine_team GROUP BY vv.choice) z;
 END IF;
 RETURN jsonb_build_object('stage',CASE WHEN elapsed<3 THEN 'reading'
    WHEN clock_timestamp()<cutoff THEN 'voting'
    WHEN clock_timestamp()<finish_at THEN 'captain' ELSE 'completed' END,
  'vote_ends_at',cutoff,'ends_at',finish_at,'team_progress',totals,
  'my_choice',mine_choice,'final_choice',final_choice,'captain',is_captain,
  'my_team_votes',team_votes,'my_team_count',votes_count,
  'my_team_id',mine_team,
  'team_decision',CASE WHEN v.awarded_at IS NOT NULL OR clock_timestamp()>=finish_at
      THEN public.qwiz_consensus_choice(p_room,p_card,mine_team) ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.qwiz_consensus_state(uuid,integer) FROM PUBLIC,anon,authenticated;
-- Authenticated team voting and captain decisions only. Server clock defines phases.
CREATE OR REPLACE FUNCTION public.qwiz_consensus_vote(p_room uuid,p_choice integer,p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r public.org_next_rooms%rowtype; a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype; p public.org_next_players%rowtype;
 captain uuid; secs integer; cutoff timestamptz; now_at timestamptz:=clock_timestamp();
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Войдите в игру'; END IF;
 IF p_choice NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Выберите один из четырёх ответов'; END IF;
 IF p_phase NOT IN ('vote','final') THEN RAISE EXCEPTION 'Недопустимый этап'; END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 IF NOT FOUND OR r.phase<>'intermission' OR public.qwiz_party_paused(p_room)
   THEN RAISE EXCEPTION 'Раунд не активен'; END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room;
 IF a.settings->>'arcade_mode'<>'blitz' THEN RAISE EXCEPTION 'Не тот тип игры'; END IF;
 v:=public.qwiz_arcade_ensure(p_room);
 IF v.mode<>'blitz' OR v.question_id IS NULL OR v.awarded_at IS NOT NULL
  OR a.card_position<>v.card_position THEN RAISE EXCEPTION 'Блиц-консенсус недоступен'; END IF;
 SELECT * INTO p FROM public.org_next_players x WHERE x.room_id=p_room
  AND (x.user_id=(SELECT auth.uid()) OR EXISTS(
    SELECT 1 FROM public.qwiz_player_device_access d WHERE d.room_id=p_room
      AND d.player_id=x.id AND d.user_id=(SELECT auth.uid()))) LIMIT 1;
 IF NOT FOUND OR p.team_id IS NULL THEN RAISE EXCEPTION 'Вы не состоите в команде'; END IF;
 secs:=public.qwiz_arcade_duration(a.settings,'blitz');
 cutoff:=v.started_at+make_interval(secs=>greatest(7,ceil(secs*0.65)::int));
 IF now_at<v.started_at+interval '3 seconds' OR now_at>=v.started_at+make_interval(secs=>secs)
  THEN RAISE EXCEPTION 'Время ответа истекло или ещё не наступило'; END IF;
 IF p_phase='vote' THEN
  IF now_at>=cutoff THEN RAISE EXCEPTION 'Командное голосование завершено'; END IF;
  INSERT INTO public.qwiz_consensus_votes(room_id,card_position,player_id,team_id,choice)
   VALUES(p_room,v.card_position,p.id,p.team_id,p_choice)
   ON CONFLICT(room_id,card_position,player_id) DO UPDATE
    SET choice=EXCLUDED.choice,updated_at=clock_timestamp();
  RETURN jsonb_build_object('ok',true,'phase','vote','choice',p_choice);
 END IF;
 IF now_at<cutoff THEN RAISE EXCEPTION 'Выбор капитана ещё не открыт'; END IF;
 SELECT COALESCE((SELECT c.player_id FROM public.qwiz_lobby_captains c
   WHERE c.room_id=p_room AND c.team_id=p.team_id),
   (SELECT x.id FROM public.org_next_players x WHERE x.room_id=p_room AND x.team_id=p.team_id
    ORDER BY x.joined_at,x.id LIMIT 1)) INTO captain;
 IF captain IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'Окончательный ответ выбирает капитан'; END IF;
 INSERT INTO public.qwiz_consensus_decisions(room_id,card_position,team_id,choice,captain_id)
  VALUES(p_room,v.card_position,p.team_id,p_choice,p.id)
  ON CONFLICT(room_id,card_position,team_id) DO UPDATE
   SET choice=EXCLUDED.choice,captain_id=EXCLUDED.captain_id,submitted_at=clock_timestamp();
 RETURN jsonb_build_object('ok',true,'phase','final','choice',p_choice);
END;
$$;
REVOKE ALL ON FUNCTION public.qwiz_consensus_vote(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qwiz_consensus_vote(uuid,integer,text) TO authenticated;
