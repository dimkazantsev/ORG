-- Automatic result slideshow timeout is not the answer deadline.
-- Keep scoring metadata tied to the prior question phase's deadline.
DO $patch$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_record_stage()'::regprocedure) INTO body;
 IF position('answer_deadline=old.ends_at' IN body)>0 THEN RETURN;END IF;
 IF position('answer_deadline=new.ends_at' IN body)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_record_stage body';END IF;
 EXECUTE replace(body,'answer_deadline=new.ends_at','answer_deadline=old.ends_at');
END $patch$;
