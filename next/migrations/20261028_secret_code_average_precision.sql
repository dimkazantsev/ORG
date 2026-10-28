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
      WHERE member.team_id=x.team_id AND member.room_id=p_room AND member.joined_at<=x.started_at)
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
 SELECT x.team_id,x.name,CASE WHEN x.mode='sequence_memory' THEN round(x.pts,1) ELSE round(x.pts) END::numeric,x.taps,x.players_active,x.members,
 row_number() OVER (ORDER BY x.pts DESC,CASE WHEN x.mode='captain' THEN x.moves ELSE 0 END ASC,x.position)::int
 FROM scores x ORDER BY x.pts DESC,CASE WHEN x.mode='captain' THEN x.moves ELSE 0 END ASC,x.position;
$function$;