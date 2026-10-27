-- Retire obsolete pre-2026-10-25 bonus ballots.
-- Current voting uses qwiz_bonus_ballots and applied effects use qwiz_round_boosts.
-- Never delete active bonus ballots, earned effects or historical team scores.
DO $cleanup$
BEGIN
 IF to_regclass('public.qwiz_boost_votes') IS NULL THEN RETURN; END IF;
 IF EXISTS (SELECT 1 FROM public.qwiz_boost_votes LIMIT 1) THEN
  RAISE EXCEPTION 'Legacy bonus vote table contains records; refusing destructive cleanup';
 END IF;
 -- Declared application functions must no longer reference the obsolete table.
 IF EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosrc ILIKE '%qwiz_boost_votes%'
 ) THEN
  RAISE EXCEPTION 'Active function still references old qwiz_boost_votes; cleanup aborted';
 END IF;
 EXECUTE 'DROP TABLE public.qwiz_boost_votes RESTRICT';
END $cleanup$;

-- Audit guard: the current six effects and strategies remain in the live schema.
DO $assert$
DECLARE text_rule text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO text_rule
 FROM pg_constraint
 WHERE conrelid='public.qwiz_round_boosts'::regclass AND conname='qwiz_round_boosts_choice_check';
 IF text_rule IS NULL OR
  NOT (text_rule LIKE '%headstart%' AND text_rule LIKE '%teamwork%' AND
       text_rule LIKE '%momentum%' AND text_rule LIKE '%fog%' AND
       text_rule LIKE '%storm%' AND text_rule LIKE '%drain%') THEN
  RAISE EXCEPTION 'Active bonus constraints do not contain all six choices';
 END IF;
END $assert$;
