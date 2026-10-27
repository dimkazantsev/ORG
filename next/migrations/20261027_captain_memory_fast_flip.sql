-- Faster captain memory: preserve server authority, make brief mismatch reveal, expose only clicked tile icons to authenticated captain.
CREATE OR REPLACE FUNCTION public.qwiz_arcade_play(p_room uuid, p_action text, p_tile integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF now_at<target_time-interval '720 milliseconds' THEN
   -- Early taps do not score, but do not instantly end a valid run.
   RETURN jsonb_build_object('ok',false,'early',true);
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
    IF now_at<m.hide_until THEN RETURN jsonb_build_object('ok',false,'wait',true,
    'retry_ms',greatest(1,least(700,ceil(extract(epoch FROM (m.hide_until-now_at))*1000)::int)));END IF;
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
    RETURN jsonb_build_object('ok',true,'first',p_tile,'icon',m.deck->p_tile->>'icon');
  END IF;
  is_match=(m.deck->m.first_tile->>'pair')=(m.deck->p_tile->>'pair');
  IF is_match THEN
    matched_new:=m.matched||jsonb_build_array(m.first_tile,p_tile);
    UPDATE public.qwiz_arcade_memory_players
      SET first_tile=NULL,second_tile=NULL,hide_until=NULL,matched=matched_new,
       moves=moves+1,completed_at=CASE WHEN jsonb_array_length(matched_new)=12 THEN now_at ELSE NULL END
      WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id;
    RETURN jsonb_build_object('ok',true,'match',true,'pairs',jsonb_array_length(matched_new)/2,
      'completed',jsonb_array_length(matched_new)=12,
      'first_icon',m.deck->m.first_tile->>'icon','icon',m.deck->p_tile->>'icon');
  END IF;
  UPDATE public.qwiz_arcade_memory_players SET second_tile=p_tile,
       hide_until=now_at+interval '640 milliseconds',moves=moves+1
    WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id;
  RETURN jsonb_build_object('ok',true,'match',false,
    'first_icon',m.deck->m.first_tile->>'icon','icon',m.deck->p_tile->>'icon',
    'hide_ms',640);
 END IF;
 RAISE EXCEPTION 'Недопустимое действие для данного режима';
END $function$
;
