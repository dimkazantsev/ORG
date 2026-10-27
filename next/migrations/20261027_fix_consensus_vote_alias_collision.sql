-- Keep row variable v (qwiz_arcade_runs) separate from consensus vote aliases.
-- Prevent record "v" has no field "choice" in voting phase.
CREATE OR REPLACE FUNCTION public.qwiz_consensus_state(p_room uuid, p_card integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  SELECT cv.choice INTO mine_choice FROM public.qwiz_consensus_votes cv
   WHERE cv.room_id=p_room AND cv.card_position=p_card AND cv.player_id=p.id;
  SELECT d.choice INTO final_choice FROM public.qwiz_consensus_decisions d
   WHERE d.room_id=p_room AND d.card_position=p_card AND d.team_id=mine_team;
  SELECT count(*) INTO votes_count FROM public.qwiz_consensus_votes cv
   WHERE cv.room_id=p_room AND cv.card_position=p_card AND cv.team_id=mine_team;
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
$function$
;
