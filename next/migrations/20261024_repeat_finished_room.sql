-- Repeat a finished QWIZ-PARTY session without resetting its results.
-- New room code and room_id, same frozen quiz/timeline and team labels.
-- Player roster, answers, scores and awards are intentionally NOT copied.
CREATE OR REPLACE FUNCTION public.qwiz_repeat_finished_room(p_room uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $repeat$
DECLARE old_room public.org_next_rooms%rowtype;
        fresh_id uuid; fresh_code text; team_count integer; question_count integer;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.org_quiz_is_admin_check() THEN
   RAISE EXCEPTION 'Недостаточно прав';
 END IF;
 SELECT * INTO old_room
 FROM public.org_next_rooms r
 WHERE r.id=p_room AND r.owner_id=(SELECT auth.uid()) AND r.phase='finished';
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Повторный запуск доступен только для вашей завершённой игры';
 END IF;
 SELECT count(*)::integer INTO team_count FROM public.org_next_teams t WHERE t.room_id=p_room;
 IF team_count NOT BETWEEN 1 AND 15 THEN RAISE EXCEPTION 'Некорректный состав команд'; END IF;
 -- Create a genuinely new session through the existing checked constructor.
 fresh_code:=public.org_next_create_room(old_room.quiz_id,old_room.title,team_count);
 SELECT r.id INTO fresh_id FROM public.org_next_rooms r
 WHERE r.code=fresh_code AND r.owner_id=(SELECT auth.uid());
 IF fresh_id IS NULL THEN RAISE EXCEPTION 'Новая игровая комната не создана'; END IF;
 UPDATE public.org_next_rooms r SET setup_issues=old_room.setup_issues WHERE r.id=fresh_id;
 INSERT INTO public.qwiz_room_builds(room_id,build_id,timeline)
 SELECT fresh_id,b.build_id,b.timeline FROM public.qwiz_room_builds b WHERE b.room_id=p_room;
 UPDATE public.org_next_teams t SET name=old_team.name
 FROM public.org_next_teams old_team
 WHERE t.room_id=fresh_id AND old_team.room_id=p_room AND t.position=old_team.position;
 SELECT jsonb_array_length(q.questions) INTO question_count
 FROM public.org_next_quizzes q WHERE q.id=old_room.quiz_id;
 RETURN jsonb_build_object('room_id',fresh_id,'code',fresh_code,
   'phase','lobby','source_room',old_room.code,'total_questions',question_count,
   'teams',team_count,'players',0);
END
$repeat$;
REVOKE ALL ON FUNCTION public.qwiz_repeat_finished_room(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qwiz_repeat_finished_room(uuid) TO authenticated;
