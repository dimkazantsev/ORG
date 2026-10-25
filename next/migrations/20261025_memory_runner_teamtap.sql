-- QWIZ-PARTY · Memory (all captains), one-runner-per-team and total team tapping.
-- Deliberately retains arcade_mode IDs for existing saved cards and room snapshots.
-- Apply ONLY after database smoke testing; do not auto-merge this migration.
CREATE TABLE IF NOT EXISTS public.qwiz_arcade_memory_players(
 room_id uuid NOT NULL,card_position int NOT NULL,team_id uuid NOT NULL,player_id uuid NOT NULL,
 deck jsonb NOT NULL,matched jsonb NOT NULL DEFAULT '[]'::jsonb,first_tile int,
 second_tile int,hide_until timestamptz,moves int NOT NULL DEFAULT 0,
 completed_at timestamptz,PRIMARY KEY(room_id,card_position,team_id));
CREATE TABLE IF NOT EXISTS public.qwiz_arcade_runner_players(
 room_id uuid NOT NULL,card_position int NOT NULL,team_id uuid NOT NULL,player_id uuid NOT NULL,
 cleared int NOT NULL DEFAULT 0,eliminated_at timestamptz,
 PRIMARY KEY(room_id,card_position,team_id));
ALTER TABLE public.qwiz_arcade_memory_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qwiz_arcade_runner_players ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qwiz_arcade_memory_players,public.qwiz_arcade_runner_players FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS qwiz_runner_players_by_player ON public.qwiz_arcade_runner_players(player_id,room_id,card_position);
CREATE INDEX IF NOT EXISTS qwiz_memory_players_by_player ON public.qwiz_arcade_memory_players(player_id,room_id,card_position);

CREATE OR REPLACE FUNCTION public.qwiz_runner_obstacle_at(p_index integer)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO '' AS $runner$
 SELECT 1.2+coalesce(sum(greatest(0.85::numeric,2.2::numeric-(g.n::numeric*0.055))),0)
 FROM generate_series(1,greatest(1,least(coalesce(p_index,1),200))) g(n);
$runner$;

CREATE OR REPLACE FUNCTION public.qwiz_arcade_extras(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $extras$
DECLARE r public.org_next_rooms%rowtype; a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype; me public.org_next_players%rowtype;
 record_row record; board public.qwiz_arcade_memory_players%rowtype;
 runner public.qwiz_arcade_runner_players%rowtype;
 result jsonb:='{}'::jsonb; scoreboard jsonb:='[]'::jsonb; tiles jsonb:='[]'::jsonb;
 sec int; now_at timestamptz:=clock_timestamp();
 BEGIN
 IF p_code !~ '^[A-F0-9]{8}$' THEN RETURN result;END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE code=p_code;
 IF NOT FOUND OR r.phase<>'intermission' THEN RETURN result;END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=r.id;
 IF NOT FOUND OR a.settings->>'arcade_mode' NOT IN ('captain','rocket') THEN RETURN result;END IF;
 v:=public.qwiz_arcade_ensure(r.id);
 IF v.room_id IS NULL OR v.card_position<>a.card_position THEN RETURN result;END IF;
 sec:=public.qwiz_arcade_duration(a.settings,v.mode);
 -- A room-card is initialized only once. Selection is random across ALL team members.
 IF v.mode='rocket' THEN
   INSERT INTO public.qwiz_arcade_runner_players(room_id,card_position,team_id,player_id)
   SELECT r.id,v.card_position,t.id,(SELECT p.id FROM public.org_next_players p
      WHERE p.room_id=r.id AND p.team_id=t.id AND p.joined_at<=v.started_at ORDER BY random() LIMIT 1)
   FROM public.org_next_teams t WHERE t.room_id=r.id
    AND EXISTS(SELECT 1 FROM public.org_next_players p WHERE p.room_id=r.id AND p.team_id=t.id AND p.joined_at<=v.started_at)
   ON CONFLICT(room_id,card_position,team_id) DO NOTHING;
   UPDATE public.qwiz_arcade_runner_players rp
    SET eliminated_at=now_at FROM public.qwiz_arcade_runs rr
    WHERE rp.room_id=r.id AND rp.card_position=v.card_position
      AND rr.room_id=rp.room_id AND rr.card_position=rp.card_position
      AND rp.eliminated_at IS NULL AND now_at<rr.started_at+make_interval(secs=>sec)
      AND now_at>rr.started_at+make_interval(secs=>public.qwiz_runner_obstacle_at(rp.cleared+1)+0.42);
   SELECT * INTO runner FROM public.qwiz_arcade_runner_players rp
      WHERE rp.room_id=r.id AND rp.card_position=v.card_position
       AND rp.player_id IN (SELECT p.id FROM public.org_next_players p
        WHERE p.room_id=r.id AND (p.user_id=(SELECT auth.uid()) OR EXISTS
         (SELECT 1 FROM public.qwiz_player_device_access d WHERE d.player_id=p.id
           AND d.room_id=r.id AND d.user_id=(SELECT auth.uid())))) LIMIT 1;
   SELECT coalesce(jsonb_agg(jsonb_build_object('team_id',rp.team_id,
       'player',p.name,'cleared',rp.cleared,'eliminated',rp.eliminated_at IS NOT NULL)
       ORDER BY rp.cleared DESC,rp.eliminated_at DESC NULLS FIRST),'[]'::jsonb)
     INTO scoreboard FROM public.qwiz_arcade_runner_players rp
     JOIN public.org_next_players p ON p.id=rp.player_id
     WHERE rp.room_id=r.id AND rp.card_position=v.card_position;
   RETURN jsonb_build_object('kind','runner','selected',runner.player_id IS NOT NULL,
      'alive',runner.player_id IS NOT NULL AND runner.eliminated_at IS NULL,
      'cleared',coalesce(runner.cleared,0),'next_at',
      CASE WHEN runner.player_id IS NOT NULL THEN v.started_at+make_interval(secs=>public.qwiz_runner_obstacle_at(runner.cleared+1)) ELSE NULL END,
      'started_at',v.started_at,'ends_at',v.started_at+make_interval(secs=>sec),
      'players',scoreboard);
 END IF;
 -- Every captain plays in parallel. Each has a freshly shuffled, privately stored deck.
 INSERT INTO public.qwiz_arcade_memory_players(room_id,card_position,team_id,player_id,deck)
 SELECT r.id,v.card_position,t.id,p.id,
   (SELECT jsonb_agg(jsonb_build_object('pair',x.pair,'icon',
     (ARRAY['🚀','🌈','💎','⭐','🎮','🎯'])[x.pair]) ORDER BY random())
      FROM (SELECT ((i+1)/2)::int AS pair FROM generate_series(1,12) i) x)
 FROM public.org_next_teams t
 JOIN LATERAL (SELECT x.id FROM public.org_next_players x WHERE x.team_id=t.id
         AND x.room_id=r.id AND x.joined_at<=v.started_at ORDER BY x.joined_at,x.id LIMIT 1) p ON true
 WHERE t.room_id=r.id
 ON CONFLICT(room_id,card_position,team_id) DO NOTHING;
 SELECT * INTO board FROM public.qwiz_arcade_memory_players m
 WHERE m.room_id=r.id AND m.card_position=v.card_position
 AND m.player_id IN (SELECT p.id FROM public.org_next_players p
        WHERE p.room_id=r.id AND (p.user_id=(SELECT auth.uid()) OR EXISTS
        (SELECT 1 FROM public.qwiz_player_device_access d WHERE d.player_id=p.id
           AND d.room_id=r.id AND d.user_id=(SELECT auth.uid())))) LIMIT 1;
 IF board.player_id IS NOT NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('index',idx-1,
    'icon', CASE WHEN board.matched @> jsonb_build_array(idx-1) OR (board.first_tile=idx-1 AND (board.second_tile IS NULL OR now_at<board.hide_until))
      OR (board.second_tile=idx-1 AND now_at<board.hide_until)
      THEN board.deck->(idx-1)->>'icon' ELSE NULL END,
    'matched',board.matched @> jsonb_build_array(idx-1),'open',
       (board.first_tile=idx-1 AND (board.second_tile IS NULL OR now_at<board.hide_until))
        OR (board.second_tile=idx-1 AND now_at<board.hide_until))
       ORDER BY idx),'[]'::jsonb)
  INTO tiles FROM generate_series(1,12) idx;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('team_id',m.team_id,'captain',p.name,
     'pairs',jsonb_array_length(m.matched)/2,'moves',m.moves,
     'completed_ms',CASE WHEN m.completed_at IS NULL THEN NULL ELSE
      greatest(0,round(extract(epoch from (m.completed_at-v.started_at))*1000)) END)
     ORDER BY m.completed_at ASC NULLS LAST,jsonb_array_length(m.matched) DESC,m.moves ASC),'[]'::jsonb)
 INTO scoreboard FROM public.qwiz_arcade_memory_players m
 JOIN public.org_next_players p ON p.id=m.player_id
 WHERE m.room_id=r.id AND m.card_position=v.card_position;
 RETURN jsonb_build_object('kind','memory','captain',board.player_id IS NOT NULL,
   'tiles',tiles,'pairs',CASE WHEN board.player_id IS NULL THEN 0 ELSE jsonb_array_length(board.matched)/2 END,
   'moves',board.moves,'completed_ms',
   CASE WHEN board.completed_at IS NULL THEN NULL ELSE greatest(0,round(extract(epoch from (board.completed_at-v.started_at))*1000)) END,
   'locked_until',board.hide_until,'players',scoreboard);
END $extras$;

CREATE OR REPLACE FUNCTION public.qwiz_arcade_play(p_room uuid,p_action text,p_tile integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $play$
DECLARE r public.org_next_rooms%rowtype;a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype;p public.org_next_players%rowtype;
 m public.qwiz_arcade_memory_players%rowtype;
 runner public.qwiz_arcade_runner_players%rowtype;
 target_time timestamptz; now_at timestamptz:=clock_timestamp();
 secs int;is_match boolean;matched_new jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Авторизация обязательна';END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 IF NOT FOUND OR r.phase<>'intermission' THEN RAISE EXCEPTION 'Игра не активна';END IF;
 IF public.qwiz_party_paused(p_room) THEN RAISE EXCEPTION 'Игра на паузе';END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room;
 v:=public.qwiz_arcade_ensure(p_room);
 IF v.room_id IS NULL OR v.card_position IS DISTINCT FROM a.card_position OR v.awarded_at IS NOT NULL
    THEN RAISE EXCEPTION 'Мини-игра не активна';END IF;
 secs:=public.qwiz_arcade_duration(a.settings,v.mode);
 IF now_at>v.started_at+make_interval(secs=>secs) THEN RAISE EXCEPTION 'Время закончилось';END IF;
 SELECT * INTO p FROM public.org_next_players x
 WHERE x.room_id=p_room AND (x.user_id=(SELECT auth.uid()) OR EXISTS
   (SELECT 1 FROM public.qwiz_player_device_access d WHERE d.room_id=p_room
    AND d.player_id=x.id AND d.user_id=(SELECT auth.uid()))) LIMIT 1;
 IF NOT FOUND OR p.team_id IS NULL THEN RAISE EXCEPTION 'Нет команды';END IF;
 IF p_action='jump' AND v.mode='rocket' THEN
  SELECT * INTO runner FROM public.qwiz_arcade_runner_players
   WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Управляет только выбранный бегун команды';END IF;
  IF runner.eliminated_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'eliminated',true);END IF;
  target_time:=v.started_at+make_interval(secs=>public.qwiz_runner_obstacle_at(runner.cleared+1));
  IF now_at>target_time+interval '420 milliseconds' THEN
   UPDATE public.qwiz_arcade_runner_players SET eliminated_at=now_at
     WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id;
   RETURN jsonb_build_object('ok',false,'eliminated',true);
  END IF;
  IF now_at<target_time-interval '420 milliseconds' THEN
   -- Prevent rapid blind-tapping; the participant must time the obstacle.
   UPDATE public.qwiz_arcade_runner_players SET eliminated_at=now_at
     WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id;
   RETURN jsonb_build_object('ok',false,'eliminated',true,'early',true);
  END IF;
  UPDATE public.qwiz_arcade_runner_players SET cleared=cleared+1
   WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id;
  RETURN jsonb_build_object('ok',true,'cleared',runner.cleared+1);
 ELSIF p_action='flip' AND v.mode='captain' THEN
  IF p_tile IS NULL OR p_tile NOT BETWEEN 0 AND 11 THEN RAISE EXCEPTION 'Неверная плитка';END IF;
  SELECT * INTO m FROM public.qwiz_arcade_memory_players
   WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Дуэль проводят капитаны';END IF;
  IF m.completed_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'completed',true);END IF;
  IF m.second_tile IS NOT NULL THEN
    IF now_at<m.hide_until THEN RETURN jsonb_build_object('ok',false,'wait',true);END IF;
    UPDATE public.qwiz_arcade_memory_players SET first_tile=NULL,second_tile=NULL,hide_until=NULL
    WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id;
    m.first_tile:=NULL;m.second_tile:=NULL;
  END IF;
  IF m.matched @> jsonb_build_array(p_tile) OR m.first_tile=p_tile THEN
    RETURN jsonb_build_object('ok',false,'already_open',true);
  END IF;
  IF m.first_tile IS NULL THEN
    UPDATE public.qwiz_arcade_memory_players SET first_tile=p_tile
     WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id;
    RETURN jsonb_build_object('ok',true,'first',p_tile);
  END IF;
  is_match=(m.deck->m.first_tile->>'pair')=(m.deck->p_tile->>'pair');
  IF is_match THEN
    matched_new:=m.matched||jsonb_build_array(m.first_tile,p_tile);
    UPDATE public.qwiz_arcade_memory_players
      SET first_tile=NULL,second_tile=NULL,hide_until=NULL,matched=matched_new,
       moves=moves+1,completed_at=CASE WHEN jsonb_array_length(matched_new)=12 THEN now_at ELSE NULL END
      WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id;
    RETURN jsonb_build_object('ok',true,'match',true,'pairs',jsonb_array_length(matched_new)/2,
      'completed',jsonb_array_length(matched_new)=12);
  END IF;
  UPDATE public.qwiz_arcade_memory_players SET second_tile=p_tile,
       hide_until=now_at+interval '1350 milliseconds',moves=moves+1
    WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id;
  RETURN jsonb_build_object('ok',true,'match',false);
 END IF;
 RAISE EXCEPTION 'Недопустимое действие для данного режима';
END $play$;

-- Keep the existing reward values (+25 runner, +15 memory/tapping); replace only who wins.
CREATE OR REPLACE FUNCTION public.qwiz_arcade_rank(p_room uuid,p_position integer)
RETURNS TABLE(team_id uuid,name text,points numeric,taps integer,active integer,members integer,place integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $rank$
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
      greatest(100::numeric,100000::numeric-extract(epoch from (mp.completed_at-x.started_at)))
     ELSE coalesce(jsonb_array_length(mp.matched)/2,0)::numeric END
   WHEN mode='rocket' THEN CASE WHEN coalesce(rp.cleared,0)=0 THEN 0::numeric ELSE coalesce(rp.cleared,0)::numeric
     +coalesce(least(0.99::numeric,greatest(0::numeric,
       extract(epoch from (coalesce(rp.eliminated_at,clock_timestamp())-x.started_at))::numeric/200)),0) END
   WHEN mode='tug' THEN x.taps::numeric -- Real total, not an average per participant.
   ELSE round((x.taps::numeric/greatest(x.members,1))*
    (1+0.10*x.navigator),2)
   END) AS pts,
   CASE WHEN mode='captain' THEN CASE WHEN mp.moves>0 THEN 1 ELSE 0 END
    WHEN mode='rocket' THEN CASE WHEN rp.cleared>0 THEN 1 ELSE 0 END
    ELSE x.tapped_members END AS players_active,
   coalesce(mp.moves,0) AS moves
 FROM totals x
 LEFT JOIN public.qwiz_arcade_memory_players mp ON mp.room_id=p_room AND mp.card_position=p_position AND mp.team_id=x.team_id
 LEFT JOIN public.qwiz_arcade_runner_players rp ON rp.room_id=p_room AND rp.card_position=p_position AND rp.team_id=x.team_id
 )
 SELECT x.team_id,x.name,x.pts,x.taps,x.players_active,x.members,
 row_number() OVER (ORDER BY x.pts DESC,CASE WHEN x.mode='captain' THEN x.moves ELSE 0 END ASC,x.position)::int
 FROM scores x ORDER BY x.pts DESC,CASE WHEN x.mode='captain' THEN x.moves ELSE 0 END ASC,x.position;
$rank$;

-- Don't permit legacy reaction/tap requests to influence Memory and Runner scores.
DO $guards$
DECLARE src text; new_src text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='qwiz_arcade_action' LIMIT 1;
 IF position('Use qwiz_arcade_play instead' in src)=0 THEN
   IF position('if p_action=''tap'' then' in src)=0 THEN RAISE EXCEPTION 'Arcade tap guard target missing';END IF;
   new_src:=replace(src,'if p_action=''tap'' then',
     'if p_action=''tap'' then'||
     E'\n  if v.mode in (''captain'',''rocket'') then raise exception ''Use qwiz_arcade_play instead''; end if;');
   EXECUTE new_src;
 END IF;
END $guards$;

-- Tapping is a cooperative competition, not the former tug-of-war penalty.
-- Preserve the winner's +15 and achievements; no automatic deduction from the losing team.
DO $reward$
DECLARE old_source text; src text; p1 int; p2 int;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO old_source FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='qwiz_arcade_finalize' LIMIT 1;
 IF position('Повелители каната' in old_source)=0 THEN RETURN;END IF;
 p1:=position('if r.mode=''tug'' then' in old_source);
 p2:=position('v_title:=case r.mode' in old_source);
 IF p1=0 OR p2<=p1 THEN RAISE EXCEPTION 'Old tug penalty source changed; inspect before release';END IF;
 src:=substring(old_source FROM 1 FOR p1-1)||substring(old_source FROM p2);
 src:=replace(src,'Пилоты скорости','Покорители препятствий');
 src:=replace(src,'Повелители каната','Мастера тапов');
 src:=replace(src,'Молниеносная реакция','Мастера памяти');
 EXECUTE src;
END $reward$;

-- A full 12-tile memory game should not inherit the old 40-second reflex deadline.
CREATE OR REPLACE FUNCTION public.qwiz_arcade_duration(p_settings jsonb,p_mode text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO '' AS $duration$
 SELECT CASE WHEN p_mode='captain' THEN greatest(90,least(120,coalesce(nullif(p_settings->>'arcade_seconds','')::int,100)))
 ELSE greatest(30,least(120,coalesce(nullif(p_settings->>'arcade_seconds','')::int,
   CASE p_mode WHEN 'rocket' THEN 45 WHEN 'blitz' THEN 60 WHEN 'tug' THEN 45 ELSE 45 END))) END;
$duration$;

-- Return optional mini-game state in the EXISTING arcade RPC. No second HTTP poll per player.
CREATE OR REPLACE FUNCTION public.qwiz_party_arcade(p_code text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $publicarcade$
 SELECT public.qwiz_arcade_state(p_code)
    || jsonb_build_object('vote',public.qwiz_boost_view(p_code))
    || jsonb_build_object('extra',public.qwiz_arcade_extras(p_code));
$publicarcade$;

-- These functions must not be accessible via direct anonymous writes.
REVOKE ALL ON FUNCTION public.qwiz_arcade_play(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qwiz_arcade_play(uuid,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.qwiz_arcade_extras(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qwiz_arcade_extras(text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.qwiz_runner_obstacle_at(integer) FROM PUBLIC,anon,authenticated;
