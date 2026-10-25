-- Replaying a finished build from two moderator devices must reuse the same
-- empty lobby instead of creating identical rooms. Never delete real games.
DO $patch$
DECLARE body text; old text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_repeat_finished_room(uuid)'::regprocedure)
 INTO body;
 IF strpos(body,'reused_lobby_is_valid')>0 THEN RETURN; END IF;

 old:='WHERE r.id=p_room AND r.owner_id=(SELECT auth.uid()) AND r.phase=''finished'';';
 replacement:='WHERE r.id=p_room AND r.owner_id=(SELECT auth.uid()) AND r.phase=''finished'' FOR UPDATE;';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected replay room lock source'; END IF;
 body:=replace(body,old,replacement);

 old:=' -- Create a genuinely new session through the existing checked constructor.';
 replacement:=$reuse$
 -- Same finished-room row lock serializes replay requests from two devices.
 -- reused_lobby_is_valid: reuse only an EMPTY unarchived lobby copied from this
 -- exact quiz and build timeline. Actual played sessions remain independent.
 SELECT candidate.id,candidate.code INTO fresh_id,fresh_code
 FROM public.org_next_rooms candidate
 LEFT JOIN public.qwiz_room_builds cb ON cb.room_id=candidate.id
 LEFT JOIN public.qwiz_room_builds sb ON sb.room_id=p_room
 WHERE candidate.owner_id=old_room.owner_id
  AND candidate.quiz_id=old_room.quiz_id
  AND candidate.title=old_room.title
  AND candidate.phase='lobby'
  AND candidate.created_at>old_room.created_at
  AND candidate.id<>p_room
  AND cb.build_id IS NOT DISTINCT FROM sb.build_id
  AND cb.timeline IS NOT DISTINCT FROM sb.timeline
  AND (SELECT count(*) FROM public.org_next_teams t WHERE t.room_id=candidate.id)=team_count
  AND NOT EXISTS(SELECT 1 FROM public.org_next_players p WHERE p.room_id=candidate.id)
  AND NOT EXISTS(SELECT 1 FROM public.org_next_answers a WHERE a.room_id=candidate.id)
  AND NOT EXISTS(SELECT 1 FROM public.qwiz_archived_rooms a WHERE a.room_id=candidate.id)
 ORDER BY candidate.created_at DESC,candidate.id DESC LIMIT 1;
 IF fresh_id IS NOT NULL THEN
  SELECT jsonb_array_length(q.questions) INTO question_count
  FROM public.org_next_quizzes q WHERE q.id=old_room.quiz_id;
  RETURN jsonb_build_object('room_id',fresh_id,'code',fresh_code,
    'phase','lobby','source_room',old_room.code,'total_questions',question_count,
    'teams',team_count,'players',0,'reused',true);
 END IF;

 -- Create a genuinely new session through the existing checked constructor.$reuse$;
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected replay room creation anchor'; END IF;
 body:=replace(body,old,replacement);
 old:='''teams'',team_count,''players'',0);';
 replacement:='''teams'',team_count,''players'',0,''reused'',false);';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected replay response anchor'; END IF;
 EXECUTE replace(body,old,replacement);
END $patch$;
