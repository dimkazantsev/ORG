-- Fix SQLSTATE 42725 "operator is not unique: unknown - unknown".
-- PostgreSQL subtraction has higher precedence than custom ->, so the unparenthesized
-- s->'question'-'options' is interpreted as s -> ('question' - 'options').
-- Parenthesize the jsonb operand explicitly; do not re-expose answer keys.
DO $fix$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_party_projection(text)'::regprocedure) INTO definition;
 IF position('(s->''question'') - ''options''::text' in definition)>0 THEN RETURN; END IF;
 IF position('s->''question''-''options''-''correct''-''solution''-''match_choices''-''option_labels''' in definition)=0
 THEN RAISE EXCEPTION 'Unexpected public.qwiz_party_projection body; no patch applied'; END IF;
 EXECUTE replace(definition,
   's->''question''-''options''-''correct''-''solution''-''match_choices''-''option_labels''',
   '(s->''question'') - ''options''::text - ''correct''::text - ''solution''::text - ''match_choices''::text - ''option_labels''::text'
 );
END
$fix$;
