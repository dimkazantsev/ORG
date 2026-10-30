-- QWIZ-PARTY: keep both audience voting stages visible for the full server window.
-- No changes to ГОС.ID, user records, scores or existing ballots.
-- This migration preserves the existing function signatures and privileges.
DO $migration$
DECLARE original text; updated text; needle text; replacement text;
BEGIN
  SELECT pg_get_functiondef('public.qwiz_tick(text)'::regprocedure) INTO original;
  needle := 'public.qwiz_bonus_vote_complete(r.id,a.card_position)';
  IF position(needle IN original)=0 THEN
    RAISE EXCEPTION 'qwiz_tick does not contain the expected early-vote check';
  END IF;
  updated := replace(original, 'and not ' || needle, '');
  updated := replace(updated, 'AND NOT ' || needle, '');
  IF position(needle IN updated)>0 THEN RAISE EXCEPTION 'qwiz_tick still allows early voting completion'; END IF;
  EXECUTE updated;

  SELECT pg_get_functiondef('public.qwiz_boost_view(text)'::regprocedure) INTO original;
  IF position('stage:=CASE WHEN elapsed>=first_window OR' IN original)=0 THEN
    RAISE EXCEPTION 'qwiz_boost_view stage logic does not match expected source';
  END IF;
  updated := regexp_replace(original,
    '(?s)stage:=CASE WHEN elapsed>=first_window OR.*?THEN ''option'' ELSE ''strategy'' END;',
    'stage:=CASE WHEN elapsed>=first_window THEN ''option'' ELSE ''strategy'' END;');
  IF updated=original OR position('stage:=CASE WHEN elapsed>=first_window OR' IN updated)>0 THEN
    RAISE EXCEPTION 'qwiz_boost_view stage replacement failed';
  END IF;
  EXECUTE updated;

  SELECT pg_get_functiondef('public.qwiz_vote_boost(uuid,text)'::regprocedure) INTO original;
  IF position('stage:=CASE WHEN elapsed>=first_window OR' IN original)=0 THEN
    RAISE EXCEPTION 'qwiz_vote_boost stage logic does not match expected source';
  END IF;
  updated := regexp_replace(original,
    '(?s)stage:=CASE WHEN elapsed>=first_window OR.*?THEN ''option'' ELSE ''strategy'' END;',
    'stage:=CASE WHEN elapsed>=first_window THEN ''option'' ELSE ''strategy'' END;');
  IF updated=original OR position('stage:=CASE WHEN elapsed>=first_window OR' IN updated)>0 THEN
    RAISE EXCEPTION 'qwiz_vote_boost stage replacement failed';
  END IF;
  EXECUTE updated;

  SELECT pg_get_functiondef('public.qwiz_party_control(uuid,text)'::regprocedure) INTO original;
  needle := 'perform public.qwiz_arcade_finalize(p_room,a.card_position);' || chr(10) ||
            '      perform public.qwiz_boost_lock(p_room);';
  IF position(needle IN original)=0 THEN
    RAISE EXCEPTION 'qwiz_party_control no longer matches the expected Next branch';
  END IF;
  replacement :=
    'perform public.qwiz_arcade_finalize(p_room,a.card_position);' || chr(10) ||
    '      -- Do not consume the audience vote with moderator Next.' || chr(10) ||
    '      IF public.qwiz_bonus_eligible(p_room,a.card_position) AND' || chr(10) ||
    '        clock_timestamp()<public.qwiz_arcade_vote_start(p_room,a.card_position)' || chr(10) ||
    '          +make_interval(secs=>public.qwiz_bonus_window(p_room,a.card_position)) THEN' || chr(10) ||
    '        RETURN jsonb_build_object(''phase'',''intermission'',''bonus_voting'',true);' || chr(10) ||
    '      END IF;' || chr(10) ||
    '      perform public.qwiz_boost_lock(p_room);';
  updated := replace(original,needle,replacement);
  IF updated=original THEN RAISE EXCEPTION 'qwiz_party_control change was not applied'; END IF;
  EXECUTE updated;
END
$migration$;
