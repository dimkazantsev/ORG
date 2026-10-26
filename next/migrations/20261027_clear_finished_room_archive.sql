-- QWIZ-PARTY: clear only the signed-in teacher's completed game history.
-- Does not touch active rooms, saved builds, teacher profiles, or auth accounts.
-- The first call (p_confirm=false) previews the exact number eligible for deletion.
CREATE OR REPLACE FUNCTION public.qwiz_clear_finished_rooms(p_confirm boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_owner uuid := (SELECT auth.uid());
 v_count integer := 0;
 v_quizzes uuid[] := ARRAY[]::uuid[];
BEGIN
 IF v_owner IS NULL OR NOT public.org_quiz_is_admin_check() THEN
  RAISE EXCEPTION 'Недостаточно прав';
 END IF;
 IF NOT COALESCE(p_confirm,false) THEN
  SELECT count(*) INTO v_count
  FROM public.org_next_rooms r
  WHERE r.owner_id=v_owner AND r.phase='finished';
  RETURN jsonb_build_object('count',v_count,'deleted',false);
 END IF;

 -- All affected room records are finished and belong to the current teacher.
 -- Foreign keys on room-owned results, answers and players use ON DELETE CASCADE.
 WITH removed AS (
  DELETE FROM public.org_next_rooms r
  WHERE r.owner_id=v_owner AND r.phase='finished'
  RETURNING r.quiz_id
 )
 SELECT count(*),COALESCE(array_agg(DISTINCT quiz_id),ARRAY[]::uuid[])
 INTO v_count,v_quizzes FROM removed;

 -- Remove generated quiz snapshots only if no remaining room references them.
 -- Saved original builds, questions, profiles and active rooms remain intact.
 DELETE FROM public.org_next_quizzes quiz
 WHERE quiz.owner_id=v_owner
  AND quiz.id=ANY(v_quizzes)
  AND NOT EXISTS (
   SELECT 1 FROM public.org_next_rooms r WHERE r.quiz_id=quiz.id
  );

 RETURN jsonb_build_object('count',v_count,'deleted',true);
END $function$;

REVOKE ALL ON FUNCTION public.qwiz_clear_finished_rooms(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qwiz_clear_finished_rooms(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.qwiz_clear_finished_rooms(boolean) TO authenticated;
