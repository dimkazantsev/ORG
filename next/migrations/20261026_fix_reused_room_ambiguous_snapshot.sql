-- QWIZ-PARTY follow-up: fix the second ambiguous reference in the lobby reuse branch.
-- Direct snapshot.room_id comparison to a PL/pgSQL variable named room_id
-- raises PostgreSQL 42702. Use the already-known room code with an explicit table alias.
-- Preserves all game data, selected build, access controls and duplicate prevention.
DO $fix_reused_room_snapshot$
DECLARE src text; patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname='qwiz_prepare_room'
    AND pg_get_function_identity_arguments(p.oid)='p_build uuid, p_title text, p_teams integer';
  IF src IS NULL THEN RAISE EXCEPTION 'Room launch SQL function missing'; END IF;
  IF position('WHERE snapshot.room_id=room_id;' IN src)=0 THEN
    IF position('WHERE snapshot.room_id=(SELECT existing_room.id' IN src)>0 THEN RETURN;END IF;
    RAISE EXCEPTION 'Room reuse SQL changed; refusing blind patch';
  END IF;
  patched:=replace(src,
    'WHERE snapshot.room_id=room_id;',
    'WHERE snapshot.room_id=(SELECT existing_room.id FROM public.org_next_rooms existing_room WHERE existing_room.code=room_code AND existing_room.owner_id=v_owner);');
  EXECUTE patched;
END $fix_reused_room_snapshot$;