-- Present answer choices to the audience while keeping answer keys private.
-- Preserve all current room state, timer, music and projector preference logic.
-- Only modifies the projection function's active-question redaction list.
DO $$
DECLARE
  original_ddl text;
  updated_ddl text;
BEGIN
  SELECT pg_get_functiondef('public.qwiz_party_projection(text)'::regprocedure)
    INTO original_ddl;
  IF original_ddl IS NULL THEN
    RAISE EXCEPTION 'Projector state function is unavailable';
  END IF;
  IF position('s:=s-''answer'';' IN original_ddl)=0
     OR position('''correct''::text-' IN original_ddl)=0
     OR position('''solution''::text' IN original_ddl)=0 THEN
    RAISE EXCEPTION 'Unexpected public projector answer-key safeguards';
  END IF;
  -- Keep correct, solution and option_labels redacted. Choice sets are not keys.
  updated_ddl:=replace(original_ddl,
    '''options''::text-''correct''::text',
    '''correct''::text');
  updated_ddl:=replace(updated_ddl,
    '''match_choices''::text-''option_labels''::text',
    '''option_labels''::text');
  IF updated_ddl<>original_ddl THEN
    EXECUTE updated_ddl;
  END IF;
END
$$;
