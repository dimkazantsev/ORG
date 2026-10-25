-- QWIZ-PARTY geography: independent presentation shuffle.
-- The old function chose three distractors sorted by md5(id:player:step)
-- and then sorted ALL four options by the IDENTICAL md5 key. The correct
-- region consequently appeared in the fourth slot in 240/255 saved tasks.
-- Shuffle after distractor selection; generated question tasks are persisted
-- in qwiz_geo_runs, so F5 / RPC refresh never changes an exposed order.
-- Already saved (potentially answered) tasks are intentionally NOT rewritten.
DO $fix_geo_correct_slot$
DECLARE definition text;
DECLARE patched text;
DECLARE old_order text := 'order by md5(x.id||'':''||p.id::text||'':''||i::text))';
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='qwiz_geo_play'
   AND pg_get_function_identity_arguments(p.oid)='p_room uuid, p_answer text';
 IF definition IS NULL THEN
   RAISE EXCEPTION 'Expected qwiz_geo_play(uuid,text) not found';
 END IF;
 IF position(old_order IN definition)=0 THEN
   IF position('order by random())' IN definition)>0 THEN RETURN; END IF;
   RAISE EXCEPTION 'Unexpected geography function source; do not patch blindly';
 END IF;
 patched:=replace(definition,old_order,'order by random())');
 EXECUTE patched;
END $fix_geo_correct_slot$;
