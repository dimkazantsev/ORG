-- Use unpredictable per-room server entropy so room_id or source inspection never reveals future answers.
CREATE OR REPLACE FUNCTION public.qwiz_secret_code_ensure(p_room uuid, p_position integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.qwiz_room_activity%rowtype; r public.qwiz_arcade_runs%rowtype;
 c public.qwiz_secret_code_catalog%rowtype; selected integer; answer jsonb:='[]'::jsonb;
 n integer; index_ integer; label text; picked jsonb;
 symbols jsonb; palette jsonb;
BEGIN
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room AND card_position=p_position;
 IF a.room_id IS NULL OR a.settings->>'arcade_mode'<>'sequence_memory' THEN RETURN;END IF;
 SELECT * INTO r FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=p_position;
 IF r.room_id IS NULL THEN RETURN;END IF;
 selected:=CASE WHEN (a.settings->>'secret_challenge') ~ '^([1-9]|[12][0-9]|30)$'
  THEN (a.settings->>'secret_challenge')::int
  ELSE (('x'||substr(md5(gen_random_uuid()::text),1,8))::bit(32)::bigint % 30+1)::int END;
 SELECT * INTO c FROM public.qwiz_secret_code_catalog WHERE n=selected;
 IF c.n IS NULL THEN RAISE EXCEPTION 'Задания Секретного кода не установлены'; END IF;
 palette:=c.palette;
 FOR n IN 1..c.length LOOP
  index_:=((('x'||substr(md5(gen_random_uuid()::text),1,8))::bit(32)::bigint
    % jsonb_array_length(palette))::int);
  answer:=answer||jsonb_build_array(palette->index_);
 END LOOP;
 INSERT INTO public.qwiz_secret_code_sessions(room_id,card_position,template_no,code,choices)
 VALUES(p_room,p_position,c.n,answer,palette) ON CONFLICT DO NOTHING;
END $function$;
