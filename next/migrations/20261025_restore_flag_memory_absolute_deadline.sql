-- QWIZ-PARTY: honour the absolute, server-controlled memory interval.
-- The existing answer RPC already rejects early submissions. This only changes
-- what the server presents to participants and the public projector.
CREATE OR REPLACE FUNCTION public.qwiz_flag_memory_view(
 q jsonb, p_phase text, p_ends timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
 v_seconds integer;
 v_duration integer;
 v_until timestamptz;
BEGIN
 IF q IS NULL OR p_phase <> 'question' OR p_ends IS NULL
   OR jsonb_typeof(q->'flag_memory') <> 'object' THEN
  RETURN q;
 END IF;
 v_seconds := greatest(1,least(30,coalesce((q->'flag_memory'->>'seconds')::int,5)));
 v_duration := greatest(v_seconds+1,coalesce((q->>'duration')::int,30));
 v_until := p_ends - make_interval(secs=>v_duration-v_seconds);
 IF current_timestamp >= v_until THEN
  RETURN (q-'media_url'-'illustration_url') ||
    jsonb_build_object('memory_until',v_until);
 END IF;
 RETURN q || jsonb_build_object('memory_until',v_until);
END
$function$;

-- The phase/room-end metadata are server-generated, never trusted from clients.
