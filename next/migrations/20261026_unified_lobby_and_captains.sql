-- QWIZ-PARTY: opt-in lobby workflow for newly created rooms only.
-- Existing rooms are left untouched. All claims are serialized on the room row.
CREATE TABLE IF NOT EXISTS public.qwiz_lobby_config(
 room_id uuid PRIMARY KEY REFERENCES public.org_next_rooms(id) ON DELETE CASCADE,
 confirmed_at timestamptz,
 captain_started_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.qwiz_lobby_captains(
 room_id uuid NOT NULL REFERENCES public.org_next_rooms(id) ON DELETE CASCADE,
 team_id uuid NOT NULL REFERENCES public.org_next_teams(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES public.org_next_players(id) ON DELETE CASCADE,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(room_id,team_id),
 UNIQUE(room_id,player_id)
);
ALTER TABLE public.qwiz_lobby_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qwiz_lobby_captains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qwiz_lobby_config,public.qwiz_lobby_captains FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.qwiz_lobby_view(p_room uuid,p_public boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $lobby_view$
DECLARE cfg public.qwiz_lobby_config%rowtype;r public.org_next_rooms%rowtype;
 actor uuid;host boolean:=false;pid uuid;team uuid;n integer;claimed integer;
BEGIN
 SELECT * INTO cfg FROM public.qwiz_lobby_config WHERE room_id=p_room;
 IF NOT FOUND THEN RETURN null;END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 IF NOT FOUND THEN RETURN null;END IF;
 SELECT count(*) INTO n FROM public.org_next_teams WHERE room_id=p_room;
 SELECT count(*) INTO claimed FROM public.qwiz_lobby_captains WHERE room_id=p_room;
 IF NOT p_public THEN
  actor:=(SELECT auth.uid());
  host:=r.owner_id=actor AND public.org_quiz_is_admin_check();
  IF actor IS NOT NULL THEN
   SELECT p.id,p.team_id INTO pid,team FROM public.org_next_players p WHERE p.room_id=p_room
    AND (p.user_id=actor OR EXISTS(SELECT 1 FROM public.qwiz_player_device_access d
      WHERE d.room_id=p_room AND d.player_id=p.id AND d.user_id=actor)) LIMIT 1;
  END IF;
  IF NOT host AND pid IS NULL THEN RETURN null;END IF;
 END IF;
 RETURN jsonb_build_object('mode',r.team_mode,'confirmed',cfg.confirmed_at IS NOT NULL,
  'captain_started_at',cfg.captain_started_at,'team_count',n,'captain_count',claimed,
  'captains_ready',r.team_mode='captain' AND n>0 AND n=claimed,
  'my_captain',pid IS NOT NULL AND EXISTS(SELECT 1 FROM public.qwiz_lobby_captains c WHERE c.room_id=p_room AND c.player_id=pid),
  'captain_team',(SELECT c.team_id FROM public.qwiz_lobby_captains c WHERE c.room_id=p_room AND c.player_id=pid),
  'can_claim',r.phase='lobby' AND r.team_mode='captain' AND pid IS NOT NULL AND team IS NULL AND claimed<n AND
   (SELECT count(*) FROM public.org_next_players firsts WHERE firsts.room_id=p_room AND
    (firsts.joined_at,firsts.id)<=(SELECT p.joined_at,p.id FROM public.org_next_players p WHERE p.id=pid))<=n,
  'team_members',CASE WHEN pid IS NOT NULL AND EXISTS(SELECT 1 FROM public.qwiz_lobby_captains c WHERE c.room_id=p_room AND c.player_id=pid)
   THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) ORDER BY p.joined_at),'[]'::jsonb)
    FROM public.org_next_players p WHERE p.room_id=p_room AND p.team_id=team) ELSE '[]'::jsonb END,
  'effects_history',CASE WHEN host THEN
   (SELECT coalesce(jsonb_agg(jsonb_build_object('team_id',b.team_id,'choice',b.choice,
    'points_awarded',b.points_awarded,'applied_at',b.applied_at,'round_index',b.round_index,'card_position',b.card_position)
    ORDER BY b.card_position),'[]'::jsonb) FROM public.qwiz_round_boosts b WHERE b.room_id=p_room)
    ELSE '[]'::jsonb END,
  'captains',CASE WHEN host THEN
   (SELECT coalesce(jsonb_agg(jsonb_build_object('team_id',c.team_id,'player_id',c.player_id)),'[]'::jsonb)
    FROM public.qwiz_lobby_captains c WHERE c.room_id=p_room) ELSE '[]'::jsonb END);
END $lobby_view$;

CREATE OR REPLACE FUNCTION public.qwiz_lobby_action(p_room uuid,p_action text,p_input jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $lobby_action$
DECLARE cfg public.qwiz_lobby_config%rowtype;r public.org_next_rooms%rowtype;
 actor uuid:=(SELECT auth.uid());pid uuid;team uuid;assigned uuid;
 n integer;k integer;nm text;target uuid;is_host boolean;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Войдите в комнату';END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room FOR UPDATE;
 SELECT * INTO cfg FROM public.qwiz_lobby_config WHERE room_id=p_room;
 IF NOT FOUND OR r.id IS NULL THEN RAISE EXCEPTION 'Данный сценарий недоступен';END IF;
 is_host:=r.owner_id=actor AND public.org_quiz_is_admin_check();
 IF NOT is_host THEN
  SELECT p.id INTO pid FROM public.org_next_players p WHERE p.room_id=p_room AND
   (p.user_id=actor OR EXISTS(SELECT 1 FROM public.qwiz_player_device_access d
      WHERE d.room_id=p_room AND d.player_id=p.id AND d.user_id=actor)) LIMIT 1;
  IF pid IS NULL THEN RAISE EXCEPTION 'Вы не участник этой комнаты';END IF;
 END IF;
 IF p_action='claim' THEN
  IF is_host THEN RAISE EXCEPTION 'Роль капитана доступна только участникам';END IF;
  IF r.phase<>'lobby' OR r.team_mode<>'captain' THEN RAISE EXCEPTION 'Капитанский набор не активен';END IF;
  IF EXISTS(SELECT 1 FROM public.qwiz_lobby_captains c WHERE c.room_id=p_room AND c.player_id=pid) THEN
   RETURN public.qwiz_lobby_view(p_room);
  END IF;
  IF EXISTS(SELECT 1 FROM public.org_next_players p WHERE p.id=pid AND p.team_id IS NOT NULL) THEN RAISE EXCEPTION 'Вы уже в команде';END IF;
  IF (SELECT count(*) FROM public.org_next_players firsts WHERE firsts.room_id=p_room AND
   (firsts.joined_at,firsts.id)<=(SELECT p.joined_at,p.id FROM public.org_next_players p WHERE p.id=pid))>
   (SELECT count(*) FROM public.org_next_teams WHERE room_id=p_room) THEN
   RAISE EXCEPTION 'Капитанами становятся первые участники, вошедшие в комнату';END IF;
  SELECT t.id INTO team FROM public.org_next_teams t WHERE t.room_id=p_room AND NOT EXISTS
   (SELECT 1 FROM public.qwiz_lobby_captains c WHERE c.room_id=p_room AND c.team_id=t.id)
   ORDER BY t.position LIMIT 1;
  IF team IS NULL THEN RAISE EXCEPTION 'Все капитаны уже назначены';END IF;
  UPDATE public.org_next_players SET team_id=team WHERE id=pid;
  INSERT INTO public.qwiz_lobby_captains(room_id,team_id,player_id) VALUES(p_room,team,pid);
  UPDATE public.qwiz_lobby_config SET captain_started_at=coalesce(captain_started_at,clock_timestamp())
   WHERE room_id=p_room;
 ELSIF p_action='rename' THEN
  SELECT team_id INTO team FROM public.qwiz_lobby_captains WHERE room_id=p_room AND player_id=pid;
  IF team IS NULL THEN RAISE EXCEPTION 'Название меняет капитан';END IF;
  nm:=trim(p_input->>'name');
  IF char_length(nm) NOT BETWEEN 3 AND 40 OR nm ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Название: от 3 до 40 символов';END IF;
  IF EXISTS(SELECT 1 FROM public.org_next_teams WHERE room_id=p_room AND id<>team AND lower(name)=lower(nm))
   THEN RAISE EXCEPTION 'Название уже занято';END IF;
  UPDATE public.org_next_teams SET name=nm WHERE id=team;
 ELSIF p_action='transfer' THEN
  SELECT team_id INTO team FROM public.qwiz_lobby_captains WHERE room_id=p_room AND player_id=pid;
  IF team IS NULL THEN RAISE EXCEPTION 'Назначать капитана может действующий капитан';END IF;
  target:=nullif(p_input->>'player_id','')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.org_next_players WHERE id=target AND room_id=p_room AND team_id=team)
   THEN RAISE EXCEPTION 'Новый капитан должен быть из вашей команды';END IF;
  UPDATE public.qwiz_lobby_captains SET player_id=target WHERE room_id=p_room AND team_id=team;
 ELSIF p_action='confirm' THEN
  IF NOT is_host OR r.phase<>'lobby' OR r.team_mode<>'random' THEN RAISE EXCEPTION 'Подтверждает преподаватель в случайном режиме';END IF;
  -- A fresh seeded permutation yields team sizes differing by at most one.
  -- Existing manual placements survive if everyone is already assigned.
  -- Preserve teacher drag-and-drop decisions. Allocate only pending members,
  -- always to a smallest team, choosing randomly between equally small teams.
  FOR assigned IN SELECT id FROM public.org_next_players WHERE room_id=p_room AND team_id IS NULL ORDER BY random() LOOP
   SELECT t.id INTO team FROM public.org_next_teams t WHERE t.room_id=p_room
    ORDER BY (SELECT count(*) FROM public.org_next_players p WHERE p.team_id=t.id),random() LIMIT 1;
   UPDATE public.org_next_players SET team_id=team WHERE id=assigned;
  END LOOP;
  UPDATE public.qwiz_lobby_config SET confirmed_at=clock_timestamp() WHERE room_id=p_room;
 ELSE RAISE EXCEPTION 'Неизвестная операция';END IF;
 RETURN public.qwiz_lobby_view(p_room);
END $lobby_action$;

-- Patch existing production functions at guarded anchor points instead of copying large
-- business logic, and keep all legacy rooms compatible.
DO $patch$
DECLARE src text;changed text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='org_next_create_room' LIMIT 1;
 IF position('return v_code;' IN src)=0 THEN RAISE EXCEPTION 'Room creator ABI changed';END IF;
 changed:=replace(src,'return v_code;',
  'INSERT INTO public.qwiz_lobby_config(room_id) VALUES(v_id) ON CONFLICT(room_id) DO NOTHING;'||
  E'\n return v_code;');
 EXECUTE changed;

 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='qwiz_prepare_room' LIMIT 1;
 IF position('IF p_teams IS NULL' IN src)=0 OR position('RETURN jsonb_build_object(''code'',room_code' IN src)=0 THEN RAISE EXCEPTION 'Prepare-room ABI changed';END IF;
 changed:=replace(src,'RETURN jsonb_build_object(''code'',room_code',
  'INSERT INTO public.qwiz_lobby_config(room_id) VALUES(room_id) ON CONFLICT(room_id) DO NOTHING;'||
  E'\n RETURN jsonb_build_object(''code'',room_code');
 EXECUTE changed;

 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='qwiz_join_team' LIMIT 1;
 IF position('if v_team is null and r.team_mode=''random'' then' IN src)=0 THEN RAISE EXCEPTION 'Join ABI changed';END IF;
 changed:=replace(src,
  'if v_team is null and r.team_mode=''random'' then',
  'if v_team is null and r.team_mode=''random'' AND NOT EXISTS('||
  ' SELECT 1 FROM public.qwiz_lobby_config cfg WHERE cfg.room_id=r.id AND cfg.confirmed_at IS NULL) then');
 changed:=replace(changed,
  'if p_team is not null and p_team is distinct from player_team then',
  'if p_team is not null and p_team is distinct from player_team then'||
   E'\n' || ' if player_team is not null and exists(select 1 from public.qwiz_lobby_config WHERE room_id=r.id)'||
   ' and ((r.team_mode=''random'' and (select confirmed_at from public.qwiz_lobby_config where room_id=r.id) is not null)'||
   ' or r.team_mode=''captain'') then raise exception ''Команда уже закреплена'';end if;');
 changed:=replace(changed,
  'if p_inviter is not null and (p_team is null or not exists(select 1 from public.org_next_players',
  'if p_team is not null and r.team_mode=''captain'' and exists(select 1 from public.qwiz_lobby_config where room_id=r.id)'||
  ' and not exists(select 1 from public.qwiz_lobby_captains c where c.room_id=r.id and c.team_id=p_team and c.player_id=p_inviter)'||
  ' then raise exception ''Только QR действующего капитана позволяет вступить в команду'';end if;'||E'\n'||
  ' if p_inviter is not null and (p_team is null or not exists(select 1 from public.org_next_players');
 changed:=replace(changed,
  'if p_team is not null and not exists(select 1 from public.org_next_teams',
  'if p_team is not null AND EXISTS(SELECT 1 FROM public.qwiz_lobby_config c WHERE c.room_id=r.id)'||
  ' AND (r.team_mode=''random'' AND (SELECT confirmed_at FROM public.qwiz_lobby_config WHERE room_id=r.id) IS NULL'||
  ' OR r.team_mode=''captain'' AND (SELECT count(*) FROM public.qwiz_lobby_captains WHERE room_id=r.id)<>'||
  ' (SELECT count(*) FROM public.org_next_teams WHERE room_id=r.id)) THEN'||
  ' RAISE EXCEPTION ''Приглашения команд ещё не активированы'';END IF;'||E'\n'||
  ' if p_team is not null and not exists(select 1 from public.org_next_teams');
 EXECUTE changed;

 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='qwiz_team_admin' LIMIT 1;
 IF position('mode not in (''random'',''manual'')' IN src)=0 THEN RAISE EXCEPTION 'Team settings ABI changed';END IF;
 changed:=replace(src,'mode not in (''random'',''manual'')','mode not in (''random'',''manual'',''captain'')');
 changed:=replace(changed,'if p_action=''shuffle'' or (mode=''random'' and (team_count<>old_count or r.team_mode<>''random'')) then',
  'if p_action=''shuffle'' or (mode=''random'' and (team_count<>old_count or r.team_mode<>''random'') AND NOT EXISTS('||
   'SELECT 1 FROM public.qwiz_lobby_config WHERE room_id=p_room)) then');
 changed:=replace(changed,'elsif p_action in (''settings'',''shuffle'') then',
  'elsif p_action in (''settings'',''shuffle'') then' || E'\n' ||
  ' if exists(select 1 from public.qwiz_lobby_config where room_id=p_room and confirmed_at is not null)'||
  ' then raise exception ''Команды уже подтверждены'';end if;' ||
  ' if p_action=''shuffle'' and r.team_mode<>''random'' then raise exception ''Перемешивание доступно только в случайном режиме'';end if;');
 changed:=replace(changed, 'elsif p_action=''refresh_content'' then',
  ' if p_action=''settings'' and exists(select 1 from public.qwiz_lobby_config where room_id=p_room)'||
  ' and (team_count<>old_count or mode<>r.team_mode) then' ||
  ' DELETE FROM public.qwiz_lobby_captains WHERE room_id=p_room;'||
  ' UPDATE public.qwiz_lobby_config SET confirmed_at=null,captain_started_at=null WHERE room_id=p_room;'||
  ' UPDATE public.org_next_players SET team_id=null WHERE room_id=p_room;end if;'||
  E'\n elsif p_action=''refresh_content'' then');
 EXECUTE changed;

 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='qwiz_party_state' LIMIT 1;
 IF position('return s||jsonb_build_object(' IN src)=0 THEN RAISE EXCEPTION 'Player state ABI changed';END IF;
 changed:=replace(src,'return s||jsonb_build_object(',
  'return s||jsonb_build_object(''team_lobby'',public.qwiz_lobby_view(r,false))||jsonb_build_object(');
 EXECUTE changed;

 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='qwiz_party_projection' LIMIT 1;
 IF position('RETURN s||jsonb_build_object(' IN src)=0 THEN RAISE EXCEPTION 'Projection ABI changed';END IF;
 changed:=replace(src,'RETURN s||jsonb_build_object(',
  'RETURN s||jsonb_build_object(''team_lobby'',public.qwiz_lobby_view(r.id,true))||jsonb_build_object(');
 EXECUTE changed;

 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='qwiz_party_control' LIMIT 1;
 IF position('elsif p_action in (''start'',''next'',''reveal'',''finish'') then' IN src)=0 THEN RAISE EXCEPTION 'Control ABI changed';END IF;
 changed:=replace(src, 'elsif p_action in (''start'',''next'',''reveal'',''finish'') then',
  'elsif p_action in (''start'',''next'',''reveal'',''finish'') then' || E'\n' ||
  ' if p_action=''start'' and r.phase=''lobby'' and EXISTS(select 1 from public.qwiz_lobby_config where room_id=p_room)'||
  ' and (r.team_mode=''random'' AND NOT EXISTS(select 1 from public.qwiz_lobby_config where room_id=p_room and confirmed_at is not null)'||
  ' OR r.team_mode=''captain'' AND ((SELECT count(*) from public.qwiz_lobby_captains where room_id=p_room)<>'||
  '(SELECT count(*) from public.org_next_teams where room_id=p_room))'||
  ' OR r.team_mode=''captain'' AND EXISTS(select 1 from public.org_next_players WHERE room_id=p_room and team_id is null)'||
  ' OR r.team_mode=''manual'') then raise exception ''Сначала завершите формирование команд'';end if;');
 EXECUTE changed;
END $patch$;
REVOKE ALL ON FUNCTION public.qwiz_lobby_action(uuid,text,jsonb),public.qwiz_lobby_view(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qwiz_lobby_action(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qwiz_lobby_view(uuid,boolean) TO authenticated,anon;


-- Visual effect metadata, including the THREE penalties. The actual balance
-- and point calculations continue to use qwiz_apply_round_boost unchanged.
CREATE OR REPLACE FUNCTION public.qwiz_boost_teams(p_teams jsonb,p_room uuid,p_index integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $effectview$
SELECT coalesce(jsonb_agg(t.row||CASE WHEN b.choice IS NULL THEN '{}'::jsonb
 ELSE jsonb_build_object('boost',jsonb_build_object(
   'title',CASE b.choice
    WHEN 'headstart' THEN 'Фора +12'
    WHEN 'teamwork' THEN 'Командный рывок'
    WHEN 'momentum' THEN 'Импульс +15%'
    WHEN 'fog' THEN 'Туман −5'
    WHEN 'storm' THEN 'Шторм −8'
    WHEN 'drain' THEN 'Потеря −12'
    ELSE b.choice END,
   'tone',CASE WHEN b.choice IN ('fog','storm','drain') THEN 'harm' ELSE 'boost' END,
   'points',b.points_awarded)) END ORDER BY t.n),'[]'::jsonb)
FROM jsonb_array_elements(coalesce(p_teams,'[]'::jsonb)) WITH ORDINALITY t(row,n)
LEFT JOIN LATERAL (
 SELECT choice,points_awarded FROM public.qwiz_round_boosts x
 JOIN public.org_next_rooms rr ON rr.id=x.room_id
 JOIN public.org_next_quizzes q ON q.id=rr.quiz_id
 WHERE x.room_id=p_room AND x.team_id=(t.row->>'id')::uuid
  AND x.round_index=coalesce((q.questions->greatest(p_index,0)->>'round_index')::int,0)
 ORDER BY x.card_position DESC LIMIT 1
) b ON true;
$effectview$;
