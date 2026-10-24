-- Background music is strictly instructor-owned, off until explicitly enabled.
ALTER TABLE public.qwiz_projector_preferences ADD COLUMN IF NOT EXISTS music_enabled boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.qwiz_projector_music(p_room uuid,p_enable boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $music$
DECLARE p public.qwiz_projector_preferences%rowtype;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.org_quiz_is_admin_check()
 OR NOT EXISTS(SELECT 1 FROM public.org_next_rooms r WHERE r.id=p_room AND r.owner_id=(SELECT auth.uid()))
 THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
 INSERT INTO public.qwiz_projector_preferences(room_id) VALUES(p_room) ON CONFLICT(room_id) DO NOTHING;
 IF p_enable IS NOT NULL THEN UPDATE public.qwiz_projector_preferences SET music_enabled=p_enable,updated_at=clock_timestamp() WHERE room_id=p_room; END IF;
 SELECT * INTO p FROM public.qwiz_projector_preferences WHERE room_id=p_room;
 RETURN jsonb_build_object('music_enabled',p.music_enabled);
END $music$;
GRANT EXECUTE ON FUNCTION public.qwiz_projector_music(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.qwiz_projector_settings(p_room uuid, p_enabled boolean DEFAULT NULL::boolean, p_volume smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE owner uuid; p public.qwiz_projector_preferences%rowtype;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.org_quiz_is_admin_check() THEN RAISE EXCEPTION 'Недостаточно прав';END IF;
 SELECT r.owner_id INTO owner FROM public.org_next_rooms r WHERE r.id=p_room;
 IF owner IS NULL OR owner<>(SELECT auth.uid()) THEN RAISE EXCEPTION 'Нет доступа к комнате';END IF;
 INSERT INTO public.qwiz_projector_preferences(room_id) VALUES(p_room) ON CONFLICT(room_id) DO NOTHING;
 IF p_enabled IS NOT NULL OR p_volume IS NOT NULL THEN
  UPDATE public.qwiz_projector_preferences v SET
   sound_enabled=coalesce(p_enabled,v.sound_enabled),
   volume=coalesce(p_volume,v.volume),
   updated_at=clock_timestamp()
  WHERE v.room_id=p_room;
 END IF;
 SELECT * INTO p FROM public.qwiz_projector_preferences WHERE room_id=p_room;
 RETURN jsonb_build_object('sound_enabled',p.sound_enabled,'volume',p.volume,'music_enabled',p.music_enabled);
END $function$;
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
      (SELECT jsonb_build_object('sound_enabled',p.sound_enabled,'volume',p.volume,'music_enabled',p.music_enabled)
       FROM public.qwiz_projector_preferences p WHERE p.room_id=r.id),
      jsonb_build_object('sound_enabled',true,'volume',45)));
END $function$;