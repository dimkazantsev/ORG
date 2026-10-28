-- QWIZ-PARTY · Retire the superseded 12 "remember the shown flag" questions.
-- "Задание на память" becomes a separate future arcade type, not a flag_question mode.
-- No completed game or saved build may refer to these questions.
DO $retire_flag_memory$
DECLARE v_n integer;
BEGIN
 SELECT count(*) INTO v_n
 FROM public.qwiz_bank q JOIN public.qwiz_topics t ON t.id=q.topic_id
 WHERE t.name='Флаги мира' AND q.kind='flag'
   AND q.solution->>'flag_mode'='memory'
   AND 'fw:published'=ANY(q.tags)
   AND 'fw:stages7-12'=ANY(q.tags);
 IF v_n<>12 THEN
  RAISE EXCEPTION 'Expected exactly 12 retired flag-memory questions; found %',v_n;
 END IF;

 IF EXISTS(
  SELECT 1 FROM public.qwiz_arcade_runs r JOIN public.qwiz_bank q ON q.id=r.question_id
  WHERE q.solution->>'flag_mode'='memory'
 ) THEN
  RAISE EXCEPTION 'Some old memory questions have arcade result references';
 END IF;
 IF EXISTS(
  SELECT 1 FROM public.qwiz_build_cards c WHERE c.settings->'flag_modes' ? 'memory'
 ) THEN
  RAISE EXCEPTION 'Some saved builds still select flag-memory questions';
 END IF;
 IF EXISTS(
  SELECT 1 FROM public.qwiz_room_builds rb
  WHERE rb.timeline::text LIKE '%"memory"%'
 ) THEN
  RAISE EXCEPTION 'Some room timeline snapshots still contain the old flag-memory mode';
 END IF;

 DELETE FROM public.qwiz_bank q
 USING public.qwiz_topics t
 WHERE q.topic_id=t.id AND t.name='Флаги мира' AND q.kind='flag'
   AND q.solution->>'flag_mode'='memory'
   AND 'fw:published'=ANY(q.tags)
   AND 'fw:stages7-12'=ANY(q.tags);
 GET DIAGNOSTICS v_n=ROW_COUNT;
 IF v_n<>12 THEN RAISE EXCEPTION 'Deleted % instead of 12',v_n; END IF;
END;
$retire_flag_memory$;
