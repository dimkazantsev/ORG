-- Teacher-owned per-card bonus thresholds. Existing rooms keep immutable timeline snapshots.
-- Default values exactly match the existing live bonus rules; no historic scores are touched.
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
   AND r.points>=greatest(1,least(200,coalesce((card->'settings'->>'bonus_min_points')::integer,1))) AND (other_points IS NULL OR (v.mode='blitz' AND r.points>=other_points OR v.mode<>'blitz' AND r.points-other_points>=gap))
   AND (v.mode IN ('blitz','captain') AND r.active>=1
        OR v.mode IN ('rocket','tug') AND r.active*100>=pct*greatest(r.members,1));
END $function$


CREATE OR REPLACE FUNCTION public.qwiz_bonus_window(p_room uuid, p_position integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT greatest(18,least(24,coalesce(
  (SELECT (rb.timeline->p_position->'settings'->>'bonus_vote_seconds')::integer
   FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room),
  18+floor(greatest(0,coalesce(
   (SELECT points FROM public.qwiz_arcade_rank(p_room,p_position) WHERE place=1 LIMIT 1),0))/25)::integer
 )));
$function$;

CREATE OR REPLACE FUNCTION public.qwiz_teacher_bonus_rules(
 p_action text, p_build uuid, p_card uuid DEFAULT NULL, p_settings jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $bonus$
DECLARE
 v_user uuid := (SELECT auth.uid());
 v_mode text;
 v_percent integer;
 v_gap integer;
 v_min integer;
 v_vote integer;
BEGIN
 IF v_user IS NULL OR NOT public.org_quiz_is_admin_check() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.qwiz_builds b WHERE b.id=p_build AND b.owner_id=v_user)
 THEN RAISE EXCEPTION 'Сборка недоступна'; END IF;
 IF p_action='save' THEN
  SELECT c.settings->>'arcade_mode' INTO v_mode
  FROM public.qwiz_build_cards c WHERE c.build_id=p_build AND c.id=p_card FOR UPDATE;
  IF NOT FOUND OR v_mode NOT IN ('tug','blitz','captain')
  THEN RAISE EXCEPTION 'Действующая мини-игра не найдена'; END IF;
  IF jsonb_typeof(p_settings) <> 'object'
   OR jsonb_typeof(p_settings->'bonus_percent') <> 'number'
   OR jsonb_typeof(p_settings->'bonus_lead') <> 'number'
   OR jsonb_typeof(p_settings->'bonus_min_points') <> 'number'
   OR NOT (p_settings ? 'bonus_vote_seconds')
   OR jsonb_typeof(p_settings->'bonus_vote_seconds') NOT IN ('number','null')
  THEN RAISE EXCEPTION 'Некорректные настройки бонуса'; END IF;
  v_percent := (p_settings->>'bonus_percent')::integer;
  v_gap := (p_settings->>'bonus_lead')::integer;
  v_min := (p_settings->>'bonus_min_points')::integer;
  v_vote := (p_settings->>'bonus_vote_seconds')::integer;
  IF v_percent NOT BETWEEN 50 AND 100 OR v_gap NOT BETWEEN 0 AND 200
   OR v_min NOT BETWEEN 1 AND 200
   OR (v_mode='blitz' AND v_min>10)
   OR (v_vote IS NOT NULL AND v_vote NOT BETWEEN 18 AND 24)
  THEN RAISE EXCEPTION 'Значения вне допустимых границ'; END IF;
  UPDATE public.qwiz_build_cards c
  SET settings=(coalesce(c.settings,'{}'::jsonb)-'bonus_vote_seconds')
    || jsonb_build_object('bonus_percent',v_percent,'bonus_lead',v_gap,'bonus_min_points',v_min)
    || CASE WHEN v_vote IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('bonus_vote_seconds',v_vote) END
  WHERE c.id=p_card AND c.build_id=p_build;
  UPDATE public.qwiz_builds SET updated_at=clock_timestamp() WHERE id=p_build AND owner_id=v_user;
 ELSIF p_action<>'list' THEN
  RAISE EXCEPTION 'Неизвестное действие';
 END IF;
 RETURN jsonb_build_object('cards',coalesce((
  SELECT jsonb_agg(jsonb_build_object(
   'id',c.id,'title',c.title,'position',c.position,
   'mode',c.settings->>'arcade_mode',
   'bonus_percent',greatest(50,least(100,coalesce((c.settings->>'bonus_percent')::integer,70))),
   'bonus_lead',greatest(0,least(200,coalesce((c.settings->>'bonus_lead')::integer,15))),
   'bonus_min_points',greatest(1,least(200,coalesce((c.settings->>'bonus_min_points')::integer,1))),
   'bonus_vote_seconds',nullif(c.settings->>'bonus_vote_seconds','')::integer
  ) ORDER BY c.position)
  FROM public.qwiz_build_cards c WHERE c.build_id=p_build
   AND c.settings->>'arcade_mode' IN ('tug','blitz','captain')
 ),'[]'::jsonb));
END $bonus$;
REVOKE ALL ON FUNCTION public.qwiz_teacher_bonus_rules(text,uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qwiz_teacher_bonus_rules(text,uuid,uuid,jsonb) TO authenticated;
