-- QWIZ-PARTY: unblock room creation (PostgreSQL 42702 ambiguous room_id).
-- qwiz_prepare_room declares local variable room_id; ON CONFLICT(room_id)
-- can resolve to either that PL/pgSQL variable or the table's room_id.
-- Use the named PRIMARY KEY to avoid the variable/column collision.
-- No data changes, no role/grant changes, preserves existing room reuse rules.
DO $fix_room_creation$
DECLARE
  src text;
  patched text;
  n integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname='qwiz_prepare_room'
    AND pg_get_function_identity_arguments(p.oid)='p_build uuid, p_title text, p_teams integer';
  IF src IS NULL THEN
    RAISE EXCEPTION 'qwiz_prepare_room signature changed: review required';
  END IF;
  n:=(length(src)-length(replace(src,
    'INSERT INTO public.qwiz_lobby_config(room_id) VALUES(room_id) ON CONFLICT(room_id) DO NOTHING;',
    '')))/length('INSERT INTO public.qwiz_lobby_config(room_id) VALUES(room_id) ON CONFLICT(room_id) DO NOTHING;');
  IF n=0 AND position('ON CONFLICT ON CONSTRAINT qwiz_lobby_config_pkey DO NOTHING;' IN src)>0 THEN
    RETURN;
  END IF;
  IF n<>2 THEN
    RAISE EXCEPTION 'Expected exactly 2 ambiguous inserts in qwiz_prepare_room, found %',n;
  END IF;
  patched:=replace(src,
    'INSERT INTO public.qwiz_lobby_config(room_id) VALUES(room_id) ON CONFLICT(room_id) DO NOTHING;',
    'INSERT INTO public.qwiz_lobby_config(room_id) VALUES(room_id) ON CONFLICT ON CONSTRAINT qwiz_lobby_config_pkey DO NOTHING;');
  EXECUTE patched;
END $fix_room_creation$;
