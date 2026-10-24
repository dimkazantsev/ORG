-- Auto-advance from answer reveal; historically result ended with ends_at=NULL,
-- preventing qwiz_tick from ever moving to the next configured card.
-- Keep all rounds, scoring and manually controlled pauses unchanged.
DO $patch$
DECLARE definition text;
 old_sql text := 'update public.org_next_rooms set phase=''result'',ends_at=null where id=p_room;';
 new_sql text := 'update public.org_next_rooms set phase=''result'',ends_at=clock_timestamp()+interval ''8 seconds'' where id=p_room;';
BEGIN
 SELECT pg_get_functiondef('public.qwiz_advance_room(uuid,text)'::regprocedure) INTO definition;
 IF position(new_sql IN definition)>0 THEN RETURN; END IF;
 IF position(old_sql IN definition)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_advance_room body'; END IF;
 EXECUTE replace(definition,old_sql,new_sql);
END $patch$;
