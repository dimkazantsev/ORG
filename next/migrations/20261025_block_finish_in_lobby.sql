-- A finished game must have started. Never silently archive an untouched lobby.
-- Existing rooms, answers, scoring and historical results remain unchanged.
DO $patch$
DECLARE current_fn text;
DECLARE old_fragment text;
DECLARE new_fragment text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_party_control(uuid,text)'::regprocedure)
 INTO current_fn;
 IF strpos(current_fn,'Prevent finishing a lobby that has never started')=0 THEN
   old_fragment:=$old$
 elsif p_action in ('start','next','reveal','finish') then
  if p_action='finish' then$old$;
   new_fragment:=$new$
 elsif p_action in ('start','next','reveal','finish') then
  -- Prevent finishing a lobby that has never started.
  if p_action='finish' and r.phase='lobby' then
   raise exception 'Игра ещё не началась. Ненужную комнату можно удалить из списка.';
  end if;
  if p_action='finish' then$new$;
   IF strpos(current_fn,old_fragment)=0 THEN
     RAISE EXCEPTION 'qwiz_party_control changed, refusing unsafe patch';
   END IF;
   EXECUTE replace(current_fn,old_fragment,new_fragment);
 END IF;
END $patch$;
