-- One authoritative competition timer for the entire server-side lifecycle.
CREATE OR REPLACE FUNCTION public.qwiz_arcade_duration(p_settings jsonb,p_mode text)
 RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO ''
 AS $duration$
 SELECT greatest(30,least(120,coalesce(nullif(p_settings->>'arcade_seconds','')::int,
   CASE p_mode WHEN 'rocket' THEN 45 WHEN 'blitz' THEN 60
   WHEN 'tug' THEN 45 WHEN 'captain' THEN 40 ELSE 45 END)));
 $duration$;

DO $migration$
DECLARE rec record; src text; patched text;
BEGIN
 FOR rec IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.proname IN
  ('qwiz_advance_room','qwiz_arcade_action','qwiz_arcade_state',
   'qwiz_boost_view','qwiz_party_control','qwiz_tick','qwiz_vote_boost')
 LOOP
  src:=pg_get_functiondef(rec.oid);patched:=src;
  patched:=replace(patched,
   $old$greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,12)))$old$,
   $new$public.qwiz_arcade_duration(a.settings,a.settings->>'arcade_mode')$new$);
  patched:=replace(patched,
   $old$greatest(8,least(40,coalesce((v_active.settings->>'arcade_seconds')::int,12)))$old$,
   $new$public.qwiz_arcade_duration(v_active.settings,v_active.settings->>'arcade_mode')$new$);
  patched:=replace(patched,
   $old$greatest(8,least(40,coalesce((a.settings->>'arcade_seconds')::int,case v.mode when 'blitz' then 25 else 12 end)))$old$,
   $new$public.qwiz_arcade_duration(a.settings,v.mode)$new$);
  IF rec.proname='qwiz_tick' THEN
   patched:=replace(patched,
    $old$else case a.kind when 'intro' then 9$old$,
    $new$else case a.kind when 'card_intro' then greatest(1,least(5,coalesce((a.settings->>'lead_seconds')::int,5))) when 'round_stats' then greatest(5,least(10,coalesce((a.settings->>'stats_seconds')::int,7))) when 'intro' then 9$new$);
   IF position($old$when 'card_intro' then greatest(1,least(5$old$ in patched)=0
    THEN RAISE EXCEPTION 'Prelude timing was not patched'; END IF;
  END IF;
  IF patched=src OR position($old$greatest(8,least(40,coalesce($old$ in patched)>0
   THEN RAISE EXCEPTION 'Old arcade duration remains: %',rec.proname; END IF;
  EXECUTE patched;
 END LOOP;
END $migration$;
