-- QWIZ-PARTY / 2026-10-25. Correct answers must not occupy a predictable slot.
-- Run after existing 20261025 migrations. Existing room snapshots remain unchanged.
-- Randomization is materialized ONCE when a new room is compiled, not on every read.
CREATE OR REPLACE FUNCTION public.qwiz_shuffle_question_options(p_options jsonb, p_solution jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path TO '' AS $shuffle$
DECLARE v_n integer; v_options jsonb; v_labels jsonb; v_indices jsonb;
        v_correct int; v_arr jsonb; v_out_sol jsonb:=p_solution;
BEGIN
 IF jsonb_typeof(p_options)<>'array' OR jsonb_typeof(p_solution)<>'object' THEN
   RETURN jsonb_build_object('options',p_options,'solution',p_solution);
 END IF;
 v_n:=jsonb_array_length(p_options);
 IF v_n<2 OR v_n>24 THEN
   RETURN jsonb_build_object('options',p_options,'solution',p_solution);
 END IF;
 IF p_solution ? 'correct' AND (p_solution->>'correct') ~ '^[0-9]+$' THEN
   v_correct:=(p_solution->>'correct')::int;
   IF v_correct>=v_n THEN RAISE EXCEPTION 'Question has invalid correct answer index';END IF;
 ELSIF jsonb_typeof(p_solution->'correct_indices')='array' THEN
   v_correct:=null;
 ELSE
   RETURN jsonb_build_object('options',p_options,'solution',p_solution);
 END IF;
 -- Ordering is uniform and the old positions are stored only inside this transaction.
 SELECT coalesce(jsonb_agg(idx ORDER BY shuffled), '[]'::jsonb)
 INTO v_indices FROM (
   SELECT (i-1)::int idx, row_number() over(order by random(),i) shuffled
   FROM generate_series(1,v_n) g(i)
 ) permutation;
 SELECT jsonb_agg(p_options->((item.value)::int) ORDER BY item.ordinality)
 INTO v_options FROM jsonb_array_elements_text(v_indices) WITH ORDINALITY AS item(value,ordinality);
 IF jsonb_typeof(p_solution->'option_labels')='array'
    AND jsonb_array_length(p_solution->'option_labels')=v_n THEN
   SELECT jsonb_agg((p_solution->'option_labels')->((item.value)::int) ORDER BY item.ordinality)
   INTO v_labels FROM jsonb_array_elements_text(v_indices) WITH ORDINALITY AS item(value,ordinality);
   v_out_sol:=v_out_sol||jsonb_build_object('option_labels',v_labels);
 END IF;
 IF v_correct IS NOT NULL THEN
   SELECT (ordinality-1)::int INTO v_correct
   FROM jsonb_array_elements_text(v_indices) WITH ORDINALITY AS item(value,ordinality)
   WHERE item.value::int=v_correct;
   v_out_sol:=v_out_sol||jsonb_build_object('correct',v_correct);
 END IF;
 IF jsonb_typeof(p_solution->'correct_indices')='array' THEN
   SELECT coalesce(jsonb_agg(to_jsonb((per.ordinality-1)::int) ORDER BY per.ordinality),'[]'::jsonb)
   INTO v_arr
   FROM jsonb_array_elements_text(v_indices) WITH ORDINALITY per(value,ordinality)
   WHERE (p_solution->'correct_indices') @> jsonb_build_array((per.value)::int);
   v_out_sol:=v_out_sol||jsonb_build_object('correct_indices',v_arr);
 END IF;
 RETURN jsonb_build_object('options',v_options,'solution',v_out_sol);
END $shuffle$;

DO $patch$
DECLARE old_source text; new_source text; needle text; replacement text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO old_source
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='qwiz_compile_build'
 ORDER BY p.oid DESC LIMIT 1;
 IF old_source IS NULL THEN RAISE EXCEPTION 'Missing qwiz_compile_build';END IF;
 needle:='v_opts:=v_question.options;v_sol:=v_question.solution;v_match_choices:=''[]''::jsonb;';
 replacement:=needle||
   E'\n       if v_question.kind not in (''order'',''sequence'',''match'',''hotspot'') then'||
   E'\n         select x->''options'',x->''solution'' into v_opts,v_sol from'||
   E'\n           public.qwiz_shuffle_question_options(v_opts,v_sol) x;'||
   E'\n       end if;';
 IF position(needle in old_source)=0 THEN
   IF position('qwiz_shuffle_question_options(v_opts,v_sol)' in old_source)>0 THEN RETURN;END IF;
   RAISE EXCEPTION 'Unexpected compiler source: answer shuffle insertion point missing';
 END IF;
 new_source:=replace(old_source,needle,replacement);
 EXECUTE new_source;
END $patch$;

-- Blitz questions use the same stable per-room principle, with server-owned original indices.
ALTER TABLE public.qwiz_arcade_runs ADD COLUMN IF NOT EXISTS option_order jsonb;
DO $blitz$
DECLARE source text; changed text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO source
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='qwiz_arcade_ensure' LIMIT 1;
 IF source IS NULL THEN RAISE EXCEPTION 'No arcade initializer';END IF;
 IF position('option_order' in source)=0 THEN
   IF position('on conflict(room_id,card_position) do nothing;' in source)=0 THEN RAISE EXCEPTION 'Arcade initializer incompatible';END IF;
   changed:=replace(source,'on conflict(room_id,card_position) do nothing;',
     'on conflict(room_id,card_position) do nothing;'||E'\n'||
     ' update public.qwiz_arcade_runs r set option_order=('||
     'select jsonb_agg((i-1) order by random()) from generate_series(1,4) i)'||
     ' where r.room_id=p_room and r.card_position=a.card_position and r.mode=''blitz'' and r.option_order is null;');
   EXECUTE changed;
 END IF;
 SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='qwiz_arcade_state' LIMIT 1;
 IF position('v.option_order' in source)=0 THEN
   IF position('''options'',q.options' in source)=0 THEN RAISE EXCEPTION 'Arcade state answer options target missing';END IF;
   changed:=replace(source,'''options'',q.options',
     '''options'',coalesce((select jsonb_agg(q.options->(e.value::int) order by e.ordinality)'||
     ' from jsonb_array_elements_text(v.option_order) with ordinality e(value,ordinality)),q.options)');
   changed:=replace(changed,'then q.solution->''correct'' else null end',
     'then to_jsonb(coalesce((select (e.ordinality-1)::int from jsonb_array_elements_text(v.option_order)'||
     ' with ordinality e(value,ordinality) where e.value::int=(q.solution->>''correct'')::int),'||
     '(q.solution->>''correct'')::int)) else null end');
   EXECUTE changed;
 END IF;
 SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='qwiz_arcade_action' LIMIT 1;
 IF position('v.option_order->>p_choice' in source)=0 THEN
   IF position('p_choice=(v_question.solution->>''correct'')::int' in source)=0 THEN RAISE EXCEPTION 'Arcade answer validator target missing';END IF;
   changed:=replace(source,
      'p_choice=(v_question.solution->>''correct'')::int',
      'coalesce((v.option_order->>p_choice)::int,p_choice)=(v_question.solution->>''correct'')::int');
   EXECUTE changed;
 END IF;
END $blitz$;

REVOKE ALL ON FUNCTION public.qwiz_shuffle_question_options(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
