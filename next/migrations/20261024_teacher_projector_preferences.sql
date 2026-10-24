-- Persistent teacher-only projector preferences. Shared read-only as part of projection.
CREATE TABLE IF NOT EXISTS public.qwiz_projector_preferences(
 room_id uuid PRIMARY KEY REFERENCES public.org_next_rooms(id) ON DELETE CASCADE,
 sound_enabled boolean NOT NULL DEFAULT true,
 volume smallint NOT NULL DEFAULT 45 CHECK (volume BETWEEN 0 AND 100),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.qwiz_projector_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qwiz_projector_preferences FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.qwiz_projector_settings(p_room uuid,p_enabled boolean DEFAULT NULL,p_volume smallint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $set$
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
 RETURN jsonb_build_object('sound_enabled',p.sound_enabled,'volume',p.volume);
END
$set$;
REVOKE ALL ON FUNCTION public.qwiz_projector_settings(uuid,boolean,smallint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qwiz_projector_settings(uuid,boolean,smallint) TO authenticated;
DO $patch$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_party_projection(text)'::regprocedure) INTO definition;
 IF position('''screen_settings'',coalesce(' IN definition)>0 THEN RETURN; END IF;
 IF position('''paused'',left_ms is not null' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected projector function';END IF;
 EXECUTE replace(definition,
   '''paused'',left_ms is not null',
   '''paused'',left_ms is not null,''screen_settings'',coalesce(
      (SELECT jsonb_build_object(''sound_enabled'',p.sound_enabled,''volume'',p.volume)
       FROM public.qwiz_projector_preferences p WHERE p.room_id=r.id),
      jsonb_build_object(''sound_enabled'',true,''volume'',45))'
 );
END $patch$;
