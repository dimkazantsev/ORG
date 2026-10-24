-- Audience projection: hide all answer data while the question is live,
-- then reveal the answer, options and images ONLY in the server-confirmed
-- result phase. The phase is read from the room in the DB, not the caller.
-- The source function qwiz_public_screen already strips q.correct and q.solution.
CREATE OR REPLACE FUNCTION public.qwiz_party_projection(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  s jsonb;
  r public.org_next_rooms%rowtype;
  left_ms bigint;
BEGIN
  s:=public.qwiz_public_screen(p_code);
  SELECT * INTO r FROM public.org_next_rooms WHERE code=p_code;
  IF NOT FOUND THEN RETURN s; END IF;

  s:=jsonb_set(s,'{teams}',
    public.qwiz_boost_teams(s->'teams',r.id,coalesce((s->>'index')::int,-1)),true);
  SELECT p.remaining_ms INTO left_ms
  FROM public.qwiz_room_pauses p WHERE p.room_id=r.id;
  IF left_ms IS NOT NULL AND left_ms>=0 THEN
    s:=jsonb_set(s,'{ends_at}',
      to_jsonb(clock_timestamp()+make_interval(secs=>left_ms/1000.0)),true);
  END IF;

  IF s->>'phase' = 'result' THEN
    -- Result is controlled by the DB room phase. q.options contain any
    -- image_url records; s.answer comes from qwiz_answer_display.
    -- Never expose solution keys on either phase.
    IF jsonb_typeof(s->'question')='object' THEN
      s:=jsonb_set(s,'{question}',(s->'question') -
        'correct'::text-'solution'::text-'option_labels'::text,true);
    END IF;
  ELSE
    IF jsonb_typeof(s->'question')='object' THEN
      s:=jsonb_set(s,'{question}',(s->'question') -
        'options'::text-'correct'::text-'solution'::text -
        'match_choices'::text-'option_labels'::text,true);
    END IF;
    s:=s-'answer';
  END IF;

  RETURN s||jsonb_build_object('paused',left_ms IS NOT NULL,
    'screen_settings',coalesce(
      (SELECT jsonb_build_object('sound_enabled',p.sound_enabled,'volume',p.volume)
       FROM public.qwiz_projector_preferences p WHERE p.room_id=r.id),
      jsonb_build_object('sound_enabled',true,'volume',45)));
END
$function$;
