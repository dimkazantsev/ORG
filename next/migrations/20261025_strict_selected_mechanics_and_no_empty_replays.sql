-- Protect saved quiz rounds: no implicit "all modes", independent ordinary
-- geography (capital/district) and map (locate/identify/flag/etc.) filters.
-- Hide duplicate EMPTY finished shells in the studio without deleting history.
-- Guard against automatically running empty classes when the moderator presses Start.
DO $patch$
DECLARE body text; old text; new text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_compile_build(uuid,text,boolean)'::regprocedure) INTO body;
 IF strpos(body,'v_geo_round boolean:=false')=0 THEN
   old:='v_modes jsonb; v_flags boolean;v_geography boolean:=false;';
   new:='v_modes jsonb; v_flags boolean;v_geo_round boolean:=false;v_geography boolean:=false;';
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'compile declaration unexpected';END IF;
   body:=replace(body,old,new);

   old:='v_flags:=exists(select 1 from public.qwiz_topics t where t.id=v_card.topic_id and t.name=''Флаги мира'');';
   new:=old||E'\n     v_geo_round:=exists(select 1 from public.qwiz_topics t where t.id=v_card.topic_id and t.name=''География России'');';
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'compile topic detection unexpected';END IF;
   body:=replace(body,old,new);

   old:='if v_modes is null or v_modes=''[]''::jsonb then v_modes:=''["country","picker","colors","symbols","fragments","errors","similar","assemble","multiple","memory","geo","history"]''::jsonb;end if;';
   new:='if v_modes is null or v_modes=''[]''::jsonb then v_missing:=v_missing||jsonb_build_array(jsonb_build_object(''title'',v_card.title,''reason'',''Выберите механики флагов''));continue;end if;';
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'compile all-flags fallback unexpected';END IF;
   body:=replace(body,old,new);

   old:=E'     end if;\n     v_count:=0;';
   new:=$geo$     elsif v_geo_round then
       v_modes:=v_card.settings->'geo_modes';
       IF jsonb_typeof(v_modes) IS DISTINCT FROM 'array'
          OR jsonb_array_length(v_modes)=0 THEN
         v_missing:=v_missing||jsonb_build_array(jsonb_build_object(
           'title',v_card.title,'reason','Выберите механики географических вопросов: административный центр или федеральный округ'));
         CONTINUE;
       END IF;
       IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_modes) item
                 WHERE item.value NOT IN ('capital','district')) THEN
         RAISE EXCEPTION 'Раунд «%»: недопустимые механики обычной географии',v_card.title;
       END IF;
     end if;
     v_count:=0;$geo$;
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'compile selection branch unexpected';END IF;
   body:=replace(body,old,new);

   old:='and not (b.id=any(v_used))';
   new:='and not (b.id=any(v_used))'||E'\n       and (not v_geo_round or b.solution->>''geo_mode'' in (select jsonb_array_elements_text(v_modes)))';
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'compile bank filter unexpected';END IF;
   body:=replace(body,old,new);
   EXECUTE body;
 END IF;

 SELECT pg_get_functiondef('public.qwiz_prepare_room(uuid,text,integer)'::regprocedure) INTO body;
 old:='compiled:=public.qwiz_compile_build(p_build,p_title,true);';
 new:='compiled:=public.qwiz_compile_build(p_build,p_title,false);';
 IF strpos(body,old)>0 THEN EXECUTE replace(body,old,new);
 ELSIF strpos(body,new)=0 THEN RAISE EXCEPTION 'prepare-room compiler call unexpected';
 END IF;

 -- All lobby rooms may be prepared before pupils join. START is different:
 -- a room with zero participants must not run through 15 questions on its own.
 SELECT pg_get_functiondef('public.qwiz_advance_room(uuid,text)'::regprocedure) INTO body;
 old:='elsif p_action=''start'' and r.phase=''lobby'' then';
 new:=old||E'\n  IF NOT EXISTS (SELECT 1 FROM public.org_next_players participant WHERE participant.room_id=p_room) THEN\n    RAISE EXCEPTION ''Для начала игры нужен хотя бы один подключённый участник. Пригласите игроков по QR-коду.'';\n  END IF;';
 IF strpos(body,'Для начала игры нужен хотя бы один подключённый участник')=0 THEN
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'advance-room start branch unexpected';END IF;
   EXECUTE replace(body,old,new);
 END IF;

 -- Old blank finished room rows have no unique scores/history. Leave them
 -- untouched in DB, but only expose the newest empty shell from each build.
 SELECT pg_get_functiondef('public.qwiz_host_rooms()'::regprocedure) INTO body;
 old:='order by created_at desc limit 30) r';
 new:=$hide$and NOT (
  phase='finished'
  AND NOT EXISTS(SELECT 1 FROM public.org_next_players old_p WHERE old_p.room_id=org_next_rooms.id)
  AND NOT EXISTS(SELECT 1 FROM public.org_next_answers old_a WHERE old_a.room_id=org_next_rooms.id)
  AND EXISTS(
    SELECT 1 FROM public.qwiz_room_builds previous_build
    JOIN public.qwiz_room_builds later_build ON later_build.build_id=previous_build.build_id
    JOIN public.org_next_rooms later_room ON later_room.id=later_build.room_id
    WHERE previous_build.room_id=org_next_rooms.id
      AND later_room.owner_id=v_user
      AND (later_room.created_at,later_room.id)>(org_next_rooms.created_at,org_next_rooms.id)
      AND NOT EXISTS(SELECT 1 FROM public.qwiz_archived_rooms archived_later WHERE archived_later.room_id=later_room.id)
  )
 ) order by created_at desc limit 30) r$hide$;
 IF strpos(body,'previous_build')=0 THEN
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'host room listing unexpected';END IF;
   EXECUTE replace(body,old,new);
 END IF;
END $patch$;
