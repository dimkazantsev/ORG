-- QWIZ-PARTY: paused rounds must reject answers and preserve frozen memory tasks.
-- Idempotent, guarded patches: abort when the live function body has diverged.
-- No table writes, changes to scores, or changes to room transitions.
DO $patch$
DECLARE body text; old_fragment text;
BEGIN
 SELECT pg_get_functiondef('public.org_next_answer(uuid,integer)'::regprocedure) INTO body;
 IF position('public.qwiz_party_paused(p_room)' IN body)>0 THEN
   IF position('v_room.ends_at is null' IN lower(body))=0 THEN RAISE EXCEPTION 'Partial answer-guard patch'; END IF;
 ELSE
   old_fragment:='v_room.ends_at<=now()';
   IF position(old_fragment IN body)=0 THEN RAISE EXCEPTION 'Unexpected org_next_answer deadline guard'; END IF;
   EXECUTE replace(body,old_fragment,
     '(v_room.ends_at IS NULL OR v_room.ends_at<=now() OR public.qwiz_party_paused(p_room))');
 END IF;
 SELECT pg_get_functiondef('public.qwiz_submit_answer(uuid,jsonb)'::regprocedure) INTO body;
 IF position('public.qwiz_party_paused(p_room)' IN body)>0 THEN
   IF position('v_room.ends_at is null' IN lower(body))=0 THEN RAISE EXCEPTION 'Partial rich-answer guard patch'; END IF;
 ELSE
   old_fragment:='v_room.ends_at<=now()';
   IF position(old_fragment IN body)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_submit_answer deadline guard'; END IF;
   EXECUTE replace(body,old_fragment,
     '(v_room.ends_at IS NULL OR v_room.ends_at<=now() OR public.qwiz_party_paused(p_room))');
 END IF;
END $patch$;

-- On pause room.ends_at is intentionally NULL. The public/client wrapper has
-- a virtual deadline based on remaining_ms; use it for the memory view too.
-- Each paused refresh re-anchors this virtual deadline without consuming time.
DO $patch$
DECLARE body text; needle text; extension text;
BEGIN
 needle:=$needle$s:=jsonb_set(s,'{ends_at}',to_jsonb(clock_timestamp()+make_interval(secs=>left_ms/1000.0)),true);$needle$;
 extension:=$extension$
   -- Guest state: never reveal memory choices before the frozen study interval ends.
   if s->>'phase'='question'
     and coalesce((s->>'host')::boolean,false)=false
     and jsonb_typeof(s->'question')='object' then
     s:=jsonb_set(s,'{question}',public.qwiz_flag_memory_view(
       s->'question','question',(s->>'ends_at')::timestamptz),true);
   end if;$extension$;
 SELECT pg_get_functiondef('public.qwiz_party_state(text)'::regprocedure) INTO body;
 IF position('public.qwiz_flag_memory_view(' IN body)=0 THEN
   IF position(needle IN body)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_party_state deadline source'; END IF;
   EXECUTE replace(body,needle,needle||extension);
 END IF;
 needle:=$needle$s:=jsonb_set(s,'{ends_at}',
      to_jsonb(clock_timestamp()+make_interval(secs=>left_ms/1000.0)),true);$needle$;
 extension:=$extension$
    -- Apply memory redaction to the frozen deadline before returning public state.
    IF s->>'phase'='question' AND jsonb_typeof(s->'question')='object' THEN
      s:=jsonb_set(s,'{question}',public.qwiz_flag_memory_view(
        s->'question','question',(s->>'ends_at')::timestamptz),true);
    END IF;$extension$;
 SELECT pg_get_functiondef('public.qwiz_party_projection(text)'::regprocedure) INTO body;
 IF position('public.qwiz_flag_memory_view(' IN body)=0 THEN
   IF position(needle IN body)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_party_projection deadline source'; END IF;
   EXECUTE replace(body,needle,needle||extension);
 END IF;
END $patch$;
