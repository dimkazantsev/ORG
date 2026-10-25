-- Atomic moderator actions: two devices cannot advance the same room stage twice.
-- No change to balances, answer scoring, existing control RPC, or participant sessions.
CREATE OR REPLACE FUNCTION public.qwiz_control_revision(p_room uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $revision$
 SELECT md5(concat_ws('|',
  r.id::text,r.phase,coalesce(r.question_index::text,'-'),
  coalesce(extract(epoch from r.ends_at)::text,'-'),
  coalesce((SELECT a.card_position::text||':'||extract(epoch from a.entered_at)::text
             FROM public.qwiz_room_activity a WHERE a.room_id=r.id),'-'),
  CASE WHEN EXISTS(SELECT 1 FROM public.qwiz_room_pauses p WHERE p.room_id=r.id)
    THEN 'paused' ELSE 'running' END
 )) FROM public.org_next_rooms r WHERE r.id=p_room
$revision$;

-- Never let public clients use an unauthorised room ID to query revisions.
REVOKE ALL ON FUNCTION public.qwiz_control_revision(uuid) FROM PUBLIC, anon, authenticated;

-- Append the revision to the existing host state without rewriting its logic.
-- If the existing function was modified incompatibly, abort instead of clobbering it.
DO $patch$
DECLARE body text; anchor text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_party_state(text)'::regprocedure) INTO body;
 IF position('public.qwiz_control_revision(r)' IN body)>0 THEN RETURN; END IF;
 anchor:='return s||jsonb_build_object(''paused'',left_ms is not null,';
 replacement:='return s||jsonb_build_object(''control_revision'',case when coalesce((s->>''host'')::boolean,false) then public.qwiz_control_revision(r) else null end,''paused'',left_ms is not null,';
 IF position(anchor IN body)=0 THEN
  RAISE EXCEPTION 'Unexpected qwiz_party_state body: do not overwrite';
 END IF;
 EXECUTE replace(body,anchor,replacement);
END $patch$;

CREATE OR REPLACE FUNCTION public.qwiz_party_control_checked(
 p_room uuid, p_action text, p_revision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $checked$
DECLARE room_row public.org_next_rooms%rowtype;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.org_quiz_is_admin_check()
 THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;

 -- A row lock serializes both moderators. The second sees a new revision.
 SELECT * INTO room_row FROM public.org_next_rooms
 WHERE id=p_room FOR UPDATE;
 IF NOT FOUND OR room_row.owner_id IS DISTINCT FROM (SELECT auth.uid())
 THEN RAISE EXCEPTION 'Комната не найдена'; END IF;

 IF p_revision IS NULL
    OR p_revision IS DISTINCT FROM public.qwiz_control_revision(p_room)
 THEN
  RAISE EXCEPTION 'Состояние игры изменилось на другом устройстве. Обновите комнату и повторите действие.';
 END IF;

 -- All established checks for pause, score, finale, and stage remain here.
 RETURN public.qwiz_party_control(p_room,p_action);
END $checked$;

REVOKE ALL ON FUNCTION public.qwiz_party_control_checked(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qwiz_party_control_checked(uuid,text,text) TO authenticated;
