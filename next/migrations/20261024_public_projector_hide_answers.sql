-- Audience-only projection must not receive answer options/keys.
-- Keep question statement/media and published aggregate statistics.
DO $patch$
DECLARE original text; updated text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_party_projection(text)'::regprocedure) INTO original;
 IF position('s:=s-''answer'';' IN original)>0 THEN RETURN;END IF;
 IF position(' return s||jsonb_build_object(''paused'',left_ms is not null);' IN original)=0 THEN
   RAISE EXCEPTION 'Unexpected audience projection function';
 END IF;
 updated:=replace(original,
 ' return s||jsonb_build_object(''paused'',left_ms is not null);',
 ' if s->''question'' is not null and s->''question''<>''null''::jsonb then
     s:=jsonb_set(s,''{question}'',s->''question''-''options''-''correct''-''solution''-''match_choices''-''option_labels'',true);
   end if;
   s:=s-''answer'';
   return s||jsonb_build_object(''paused'',left_ms is not null);');
 EXECUTE updated;
END
$patch$;
