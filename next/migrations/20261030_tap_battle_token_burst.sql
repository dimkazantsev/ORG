-- Improve legitimate rapid team tapping while keeping an abuse throttle.
-- Each player is limited to 16 taps/second with a short burst capacity of 18.
-- Existing idempotent tap batches, authorization and room-level scoring are unchanged.
DO $update$
DECLARE old_def text; new_def text;
old_rule constant text := 'least(12,c.tokens+greatest(0,extract(epoch from (t-c.touched_at)))*8)';
new_rule constant text := 'least(18,c.tokens+greatest(0,extract(epoch from (t-c.touched_at)))*16)';
BEGIN
 SELECT pg_get_functiondef('public.qwiz_arcade_action(uuid,text,integer,text,integer)'::regprocedure) INTO old_def;
 IF old_def IS NULL OR strpos(old_def,old_rule)=0 THEN
  RAISE EXCEPTION 'Expected tap throttle missing: aborting';
 END IF;
 new_def:=replace(old_def,old_rule,new_rule);
 IF new_def=old_def THEN RAISE EXCEPTION 'Throttle patch not applied'; END IF;
 EXECUTE new_def;
END
$update$;
