-- A finished game must have started. Never silently archive an untouched lobby.
-- Existing rooms, answers, scoring and completed-game history are unchanged.
DO $patch$
DECLARE current_fn text;
DECLARE old_fragment text;
DECLARE new_fragment text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_party_control(uuid,text)'::regprocedure)
 INTO current_fn;
 IF strpos(current_fn,'Prevent finishing a lobby that has never started')=0 THEN
   old_fragment:=E' elsif p_action in (''start'',''next'',''reveal'',''finish'') then\\n  if p_action=''finish'' then';
   new_fragment:=E' elsif p_action in (''start'',''next'',''reveal'',''finish'') then\\n  -- Prevent finishing a lobby that has never started.\\n  if p_action=''finish'' and r.phase=''lobby'' then\\n   raise exception ''Игра ещё не началась. Ненужную комнату можно удалить из списка.'';\\n  end if;\\n  if p_action=''finish'' then';
   -- The E-string above escapes linefeeds exactly once, matching pg_get_functiondef.
   old_fragment:=replace(old_fragment,E'\\\\n',E'\\n');
   new_fragment:=replace(new_fragment,E'\\\\n',E'\\n');
   IF strpos(current_fn,old_fragment)=0 THEN
     RAISE EXCEPTION 'qwiz_party_control changed, refusing unsafe patch';
   END IF;
   EXECUTE replace(current_fn,old_fragment,new_fragment);
 END IF;
END $patch$;
