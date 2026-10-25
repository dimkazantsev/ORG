-- Concurrent moderator devices must not produce duplicate *empty lobby* rooms.
-- Preserve real sessions, player answers, historical scores and archived rooms.
-- Keep existing RPC signature and authorization; never delete rows.
DO $gate$
BEGIN
 IF strpos(pg_get_functiondef('public.qwiz_prepare_room(uuid,text,integer)'::regprocedure),
   'qwiz_compile_build(p_build,p_title,false)')=0
 OR strpos(pg_get_functiondef('public.qwiz_advance_room(uuid,text)'::regprocedure),
   'Для начала игры нужен хотя бы один подключённый участник')=0 THEN
   RAISE EXCEPTION 'Strict build and empty-game protections are prerequisites';
 END IF;
END $gate$;

CREATE OR REPLACE FUNCTION public.qwiz_prepare_room(
 p_build uuid,p_title text DEFAULT NULL::text,p_teams integer DEFAULT 4)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $prepare$
DECLARE
 v_owner uuid;v_build public.qwiz_builds%rowtype;
 compiled jsonb;quiz_id uuid;room_id uuid;room_code text;
BEGIN
 v_owner:=(SELECT auth.uid());
 IF v_owner IS NULL OR NOT public.org_quiz_is_admin_check() THEN
   RAISE EXCEPTION 'Недостаточно прав';
 END IF;
 IF p_teams IS NULL OR p_teams NOT BETWEEN 1 AND 15 THEN
   RAISE EXCEPTION 'Количество команд: от 1 до 15';
 END IF;

 -- Serializes two browser tabs/devices preparing this build.
 -- The second transaction sees the first transaction's new room.
 SELECT * INTO v_build FROM public.qwiz_builds
 WHERE id=p_build AND owner_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Сборка не найдена'; END IF;

 -- Enforce explicit selected modes exactly as before, including missing cards.
 compiled:=public.qwiz_compile_build(p_build,p_title,false);

 SELECT r.id,r.code INTO room_id,room_code
 FROM public.org_next_rooms r
 JOIN public.qwiz_room_builds rb ON rb.room_id=r.id
 JOIN public.org_next_quizzes q ON q.id=r.quiz_id
 WHERE rb.build_id=p_build AND r.owner_id=v_owner AND r.phase='lobby'
   AND r.title=compiled->>'title'
   AND r.created_at>=COALESCE(v_build.updated_at,r.created_at)
   AND rb.timeline=compiled->'timeline'
   AND q.questions IS NOT NULL
   AND jsonb_array_length(q.questions)=jsonb_array_length(compiled->'questions')
   AND COALESCE(r.setup_issues,'[]'::jsonb)=COALESCE(compiled->'issues','[]'::jsonb)
   AND (SELECT count(*) FROM public.org_next_teams t WHERE t.room_id=r.id)=p_teams
   AND NOT EXISTS(SELECT 1 FROM public.org_next_players p WHERE p.room_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM public.org_next_answers a WHERE a.room_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM public.qwiz_archived_rooms a WHERE a.room_id=r.id)
 ORDER BY r.created_at DESC,r.id DESC LIMIT 1;

 IF room_id IS NOT NULL THEN
   RETURN jsonb_build_object('code',room_code,'room_id',room_id,
     'total_questions',jsonb_array_length(compiled->'questions'),
     'issues',compiled->'issues','reused',true);
 END IF;

 INSERT INTO public.org_next_quizzes(owner_id,title,questions)
 VALUES(v_owner,compiled->>'title',compiled->'questions')
 RETURNING id INTO quiz_id;

 room_code:=public.org_next_create_room(quiz_id,compiled->>'title',p_teams);
 SELECT r.id INTO room_id FROM public.org_next_rooms r
 WHERE r.code=room_code AND r.owner_id=v_owner;
 INSERT INTO public.qwiz_room_builds(room_id,build_id,timeline)
 VALUES(room_id,p_build,compiled->'timeline');
 UPDATE public.org_next_rooms r SET setup_issues=compiled->'issues'
 WHERE r.id=room_id;

 RETURN jsonb_build_object('code',room_code,'room_id',room_id,
   'total_questions',jsonb_array_length(compiled->'questions'),
   'issues',compiled->'issues','reused',false);
END $prepare$;

-- Old finished shells with zero players and zero answers are not completed
-- games. Remove them from the DEFAULT recent-room list, not from the DB.
CREATE OR REPLACE FUNCTION public.qwiz_host_rooms()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $listing$
DECLARE v_user uuid;
BEGIN
 v_user:=(SELECT auth.uid());
 IF v_user IS NULL OR NOT public.org_quiz_is_admin_check()
 THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
 RETURN (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',r.id,'code',r.code,'title',r.title,'phase',r.phase,
   'players',(SELECT count(*) FROM public.org_next_players p WHERE p.room_id=r.id),
   'teams',(SELECT count(*) FROM public.org_next_teams t WHERE t.room_id=r.id),
   'created_at',r.created_at) ORDER BY r.created_at DESC),'[]'::jsonb)
  FROM (
   SELECT rooms.* FROM public.org_next_rooms rooms
   WHERE rooms.owner_id=v_user
     AND NOT EXISTS(SELECT 1 FROM public.qwiz_archived_rooms a WHERE a.room_id=rooms.id)
     AND NOT (
      rooms.phase='finished'
      AND NOT EXISTS(SELECT 1 FROM public.org_next_players p WHERE p.room_id=rooms.id)
      AND NOT EXISTS(SELECT 1 FROM public.org_next_answers a WHERE a.room_id=rooms.id)
     )
   ORDER BY rooms.created_at DESC LIMIT 30
  ) r
 );
END $listing$;
