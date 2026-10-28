-- Old cached teacher editors omit the new reward field.
-- Preserve the existing reward in that case; new editors can set 0–200 explicitly.
CREATE OR REPLACE FUNCTION public.qwiz_teacher_bonus_rules(p_action text, p_build uuid, p_card uuid DEFAULT NULL::uuid, p_settings jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_user uuid := (SELECT auth.uid());
 v_mode text;
 v_percent integer;
 v_gap integer;
 v_min integer;
 v_vote integer;
 v_reward integer;
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
   OR (p_settings ? 'arcade_score_points' AND jsonb_typeof(p_settings->'arcade_score_points') <> 'number')
   OR jsonb_typeof(p_settings->'bonus_min_points') <> 'number'
   OR NOT (p_settings ? 'bonus_vote_seconds')
   OR jsonb_typeof(p_settings->'bonus_vote_seconds') NOT IN ('number','null')
  THEN RAISE EXCEPTION 'Некорректные настройки бонуса'; END IF;
  v_percent := (p_settings->>'bonus_percent')::integer;
  v_gap := (p_settings->>'bonus_lead')::integer;
  v_min := (p_settings->>'bonus_min_points')::integer;
  v_vote := (p_settings->>'bonus_vote_seconds')::integer;
  v_reward := CASE WHEN p_settings ? 'arcade_score_points'
   THEN (p_settings->>'arcade_score_points')::integer
   ELSE (SELECT (c.settings->>'arcade_score_points')::integer
         FROM public.qwiz_build_cards c WHERE c.id=p_card AND c.build_id=p_build)
   END;
  v_reward := coalesce(v_reward,CASE WHEN v_mode='blitz' THEN 10 ELSE 15 END);
  IF v_reward NOT BETWEEN 0 AND 200 OR v_percent NOT BETWEEN 50 AND 100 OR v_gap NOT BETWEEN 0 AND 200
   OR v_min NOT BETWEEN 1 AND 200
   OR (v_mode='blitz' AND v_min>10)
   OR (v_vote IS NOT NULL AND v_vote NOT BETWEEN 18 AND 24)
  THEN RAISE EXCEPTION 'Значения вне допустимых границ'; END IF;
  UPDATE public.qwiz_build_cards c
  SET settings=(coalesce(c.settings,'{}'::jsonb)-'bonus_vote_seconds')
    || jsonb_build_object('arcade_score_points',v_reward,'bonus_percent',v_percent,'bonus_lead',v_gap,'bonus_min_points',v_min)
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
   'arcade_score_points',greatest(0,least(200,coalesce((c.settings->>'arcade_score_points')::integer,
      CASE WHEN c.settings->>'arcade_mode'='blitz' THEN 10 ELSE 15 END))),
   'bonus_percent',greatest(50,least(100,coalesce((c.settings->>'bonus_percent')::integer,70))),
   'bonus_lead',greatest(0,least(200,coalesce((c.settings->>'bonus_lead')::integer,15))),
   'bonus_min_points',greatest(1,least(200,coalesce((c.settings->>'bonus_min_points')::integer,1))),
   'bonus_vote_seconds',nullif(c.settings->>'bonus_vote_seconds','')::integer
  ) ORDER BY c.position)
  FROM public.qwiz_build_cards c WHERE c.build_id=p_build
   AND c.settings->>'arcade_mode' IN ('tug','blitz','captain')
 ),'[]'::jsonb));
END $function$;