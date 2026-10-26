-- QWIZ-PARTY: exactly-once batches for the multiplayer tap mini-game.
-- Retrying an RPC after a lost HTTP response must never credit taps twice.
-- Records belong to authenticated users and cascade with the game room.
CREATE TABLE IF NOT EXISTS public.qwiz_arcade_tap_batches(
 room_id uuid NOT NULL REFERENCES public.org_next_rooms(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 batch_id uuid NOT NULL,
 tap_count integer NOT NULL CHECK(tap_count BETWEEN 1 AND 6),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT qwiz_arcade_tap_batches_pkey PRIMARY KEY(room_id,user_id,batch_id)
);
ALTER TABLE public.qwiz_arcade_tap_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qwiz_arcade_tap_batches FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.qwiz_arcade_tap_once(p_room uuid,p_batch uuid,p_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $tap_once$
DECLARE
 v_uid uuid:=(SELECT auth.uid());
 v_inserted uuid;
 v_stored record;
 v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Войдите в игру';END IF;
 IF p_room IS NULL OR p_batch IS NULL OR p_count NOT BETWEEN 1 AND 6 THEN
  RAISE EXCEPTION 'Неверный пакет нажатий';
 END IF;
 INSERT INTO public.qwiz_arcade_tap_batches(room_id,user_id,batch_id,tap_count)
 VALUES(p_room,v_uid,p_batch,p_count)
 ON CONFLICT ON CONSTRAINT qwiz_arcade_tap_batches_pkey DO NOTHING
 RETURNING batch_id INTO v_inserted;
 IF v_inserted IS NOT NULL THEN
  -- This is the only point which is allowed to mutate counters.
  -- If the nested action raises, the batch insert rolls back with it.
  v_result:=public.qwiz_arcade_action(p_room,'tap',p_count,NULL,NULL);
  UPDATE public.qwiz_arcade_tap_batches b SET result=v_result
  WHERE b.room_id=p_room AND b.user_id=v_uid AND b.batch_id=p_batch;
  RETURN v_result||jsonb_build_object('batch_id',p_batch,'duplicate',false);
 END IF;
 -- Concurrent duplicate inserts wait for the first transaction to commit.
 SELECT b.tap_count,b.result INTO v_stored FROM public.qwiz_arcade_tap_batches b
 WHERE b.room_id=p_room AND b.user_id=v_uid AND b.batch_id=p_batch;
 IF NOT FOUND OR v_stored.tap_count<>p_count OR v_stored.result IS NULL THEN
  RAISE EXCEPTION 'Пакет нажатий не удалось подтвердить';
 END IF;
 RETURN v_stored.result||jsonb_build_object('batch_id',p_batch,'duplicate',true);
END $tap_once$;
REVOKE ALL ON FUNCTION public.qwiz_arcade_tap_once(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qwiz_arcade_tap_once(uuid,uuid,integer) TO authenticated;
