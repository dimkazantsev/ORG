-- Prefer a participant's actual room display name in final ranking when no nickname exists.
DO $patch$
DECLARE original text; updated text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_screen_metrics(uuid,integer,boolean,boolean)'::regprocedure) INTO original;
 IF position('nullif(max(op.name),'''')' IN original)>0 THEN RETURN; END IF;
 IF position('nullif(max(sp.nickname),''''),''Игрок ''' IN original)=0 THEN
   RAISE EXCEPTION 'Unexpected metrics function; do not overwrite';
 END IF;
 updated:=replace(original,
   'nullif(max(sp.nickname),''''),''Игрок ''',
   'nullif(max(sp.nickname),''''),nullif(max(op.name),''''),''Игрок ''');
 EXECUTE updated;
END $patch$;
