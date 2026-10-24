-- Regression fix for moderator "Завершить": SQLSTATE 42702.
-- The PL/pgSQL variable `a` has composite type qwiz_room_activity%ROWTYPE.
-- Reusing `a` as the table alias makes `a.room_id` ambiguous while
-- planning the IF expression shared by next/finish.
-- Preserve all role checks, pause handling, and function attributes.
-- Idempotent: a second execution does not replace an already-fixed function.
DO $patch$
DECLARE
  existing_definition text;
  corrected_definition text;
  old_fragment text := 'from public.qwiz_room_activity a where a.room_id=p_room and a.settings ? ''arcade_mode''';
  new_fragment text := 'from public.qwiz_room_activity activity_lookup where activity_lookup.room_id=p_room and activity_lookup.settings ? ''arcade_mode''';
BEGIN
  SELECT pg_get_functiondef('public.qwiz_party_control(uuid,text)'::regprocedure)
  INTO existing_definition;

  IF existing_definition IS NULL THEN
    RAISE EXCEPTION 'qwiz_party_control does not exist';
  END IF;

  IF position(old_fragment in existing_definition) > 0 THEN
    corrected_definition := replace(existing_definition,old_fragment,new_fragment);
    EXECUTE corrected_definition;
  ELSIF position(new_fragment in existing_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected qwiz_party_control body: inspect manually';
  END IF;
END
$patch$;

-- This function must remain callable by authenticated moderators, never anon.
DO $check$
BEGIN
  IF NOT has_function_privilege('authenticated','public.qwiz_party_control(uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.qwiz_party_control(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected qwiz_party_control EXECUTE grants';
  END IF;
END
$check$;
