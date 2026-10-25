-- QWIZ-PARTY: qualify arcade run alias distinctly from PL/pgSQL room variable.
-- The old function declares r org_next_rooms%ROWTYPE and also uses UPDATE ... r.
-- PL/pgSQL may resolve r.room_id as the room record (which has only r.id).
-- Idempotent patch preserves all other gameplay rules and grants.
DO $fix_arcade_room_alias$
DECLARE definition text;
DECLARE patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='qwiz_arcade_ensure'
     AND pg_get_function_identity_arguments(p.oid)='p_room uuid';
  IF definition IS NULL THEN
    RAISE EXCEPTION 'qwiz_arcade_ensure(uuid) is missing';
  END IF;
  IF position('update public.qwiz_arcade_runs ar set option_order=' IN definition)>0 THEN
    RETURN;
  END IF;
  IF position('update public.qwiz_arcade_runs r set option_order=' IN definition)=0
    OR position('where r.room_id=p_room and r.card_position=a.card_position and r.mode=''blitz'' and r.option_order is null;' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected qwiz_arcade_ensure source; manual review required';
  END IF;
  patched:=replace(definition,
    'update public.qwiz_arcade_runs r set option_order=',
    'update public.qwiz_arcade_runs ar set option_order=');
  patched:=replace(patched,
    'where r.room_id=p_room and r.card_position=a.card_position and r.mode=''blitz'' and r.option_order is null;',
    'where ar.room_id=p_room and ar.card_position=a.card_position and ar.mode=''blitz'' and ar.option_order is null;');
  EXECUTE patched;
END $fix_arcade_room_alias$;
