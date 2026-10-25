-- Do not silently schedule unselected geography tasks or duplicate empty lobbies.
-- No active room, participant, answer, score, or historical finished game is modified.
-- Guards ensure these patches apply only to the verified live function versions.
DO $patch$
DECLARE body text; old text; replacement text;
BEGIN
 -- (1) The map question generator must never fall back to all eight modes.
 SELECT pg_get_functiondef('public.qwiz_geo_play(uuid,text)'::regprocedure) INTO body;
 IF strpos(body,'Map modes must be selected explicitly')=0 THEN
   old:=E'   modes:=a.settings->''geo_modes'';\n   if jsonb_typeof(modes) is distinct from ''array'' or jsonb_array_length(modes)=0 then\n    modes:=''["locate","identify","capital","flag","silhouette","neighbour","detective","district"]''::jsonb;\n   end if;';
   replacement:=E'   -- Map modes must be selected explicitly; never run all modes by default.\n   modes:=a.settings->''geo_modes'';\n   if jsonb_typeof(modes) is distinct from ''array'' or jsonb_array_length(modes)=0 then\n    raise exception ''Для карты России выберите механики и пересоздайте игровую комнату.'';\n   end if;\n   if exists(select 1 from jsonb_array_elements_text(modes) selected(mode)\n     where selected.mode not in (''locate'',''identify'',''capital'',''flag'',''silhouette'',''neighbour'',''detective'',''district'')) then\n    raise exception ''Недопустимая механика карты России. Пересохраните сборку.'';\n   end if;';
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_geo_play default-modes block';END IF;
   body:=replace(body,old,replacement);
   -- A missing neighbour/flag must never silently switch to an UNSELECTED
   -- mechanic. Select a supported region instead and keep the same mode.
   old:=E'    if v_mode not in (''locate'',''identify'',''capital'',''flag'',''silhouette'',''neighbour'',''detective'',''district'') then v_mode:=''locate'';end if;\n    if v_mode=''neighbour'' and cardinality(v_region.neighbors)=0 then v_mode:=''locate'';end if;\n    if v_mode=''flag'' and v_region.flag is null then v_mode:=''identify'';end if;';
   replacement:=E'    if v_mode not in (''locate'',''identify'',''capital'',''flag'',''silhouette'',''neighbour'',''detective'',''district'') then\n      raise exception ''Некорректная механика карты России'';\n    end if;\n    if v_mode=''neighbour'' and cardinality(v_region.neighbors)=0 then\n      select * into v_region from public.qwiz_geo_regions candidate\n       where cardinality(candidate.neighbors)>0\n       order by md5(candidate.id||'':''||p.id::text||'':''||i::text) limit 1;\n      if not found then raise exception ''Недостаточно регионов с соседними субъектами'';end if;\n      v_id:=v_region.id;\n    end if;\n    if v_mode=''flag'' and v_region.flag is null then\n      select * into v_region from public.qwiz_geo_regions candidate\n       where candidate.flag is not null\n       order by md5(candidate.id||'':''||p.id::text||'':''||i::text) limit 1;\n      if not found then raise exception ''Нет подходящих изображений флагов'';end if;\n      v_id:=v_region.id;\n    end if;';
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_geo_play mode substitution';END IF;
   body:=replace(body,old,replacement);
   old:=' if not found then'||E'\n   n:=greatest(1,least(89,coalesce((a.settings->>''geo_count'')::int,15)));';
   replacement:=' if not found then'||E'\n   n:=greatest(1,least(89,coalesce((a.settings->>''geo_count'')::int,15)));';
   -- Above block only creates a task on first access. Enforce configured modes
   -- for existing runs as well (including sessions compiled by older versions).
   old:=' v_count:=jsonb_array_length(run.tasks);';
   replacement:=E' -- Check configured selections for existing runs, too.\n modes:=a.settings->''geo_modes'';\n if jsonb_typeof(modes) is distinct from ''array'' or jsonb_array_length(modes)=0 then\n   raise exception ''Для карты России выберите механики и пересоздайте комнату.'';\n end if;\n if exists(select 1 from jsonb_array_elements(run.tasks) as old_task(value)\n   where not (modes ? (old_task.value->>''mode''))) then\n   raise exception ''В комнате сохранены задания невыбранных механик. Создайте новую комнату из исправленной сборки.'';\n end if;\n v_count:=jsonb_array_length(run.tasks);';
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_geo_play run position';END IF;
   body:=replace(body,old,replacement);
   EXECUTE body;
 END IF;

 -- (2) Preparing the same build repeatedly must reuse the one unstarted,
 -- empty room even after a harmless re-save or a title adjustment.
 SELECT pg_get_functiondef('public.qwiz_prepare_room(uuid,text,integer)'::regprocedure) INTO body;
 IF strpos(body,'Reuse the current unoccupied lobby regardless of build timestamp')=0 THEN
   old:=E' WHERE rb.build_id=p_build AND r.owner_id=v_owner AND r.phase=''lobby''\n   AND r.title=compiled->>''title''\n   AND r.created_at>=COALESCE(v_build.updated_at,r.created_at)\n   AND rb.timeline=compiled->''timeline''\n   AND q.questions IS NOT NULL\n   AND jsonb_array_length(q.questions)=jsonb_array_length(compiled->''questions'')\n   AND COALESCE(r.setup_issues,''[]''::jsonb)=COALESCE(compiled->''issues'',''[]''::jsonb)';
   replacement:=E' WHERE rb.build_id=p_build AND r.owner_id=v_owner AND r.phase=''lobby''\n   -- Reuse the current unoccupied lobby regardless of build timestamp.\n   -- Content will be refreshed below while nobody has joined.\n   AND q.id=r.quiz_id';
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_prepare_room reuse query';END IF;
   body:=replace(body,old,replacement);
   old:=E' IF room_id IS NOT NULL THEN\n   RETURN jsonb_build_object(';
   replacement:=E' IF room_id IS NOT NULL THEN\n   -- Serialized by the owner/build FOR UPDATE lock above. Refresh only an\n   -- empty lobby, never an active session or any room with participants.\n   UPDATE public.org_next_quizzes quiz\n   SET title=compiled->>''title'',questions=compiled->''questions''\n   WHERE quiz.id=(SELECT live.quiz_id FROM public.org_next_rooms live WHERE live.id=room_id);\n   UPDATE public.qwiz_room_builds snapshot SET timeline=compiled->''timeline'' WHERE snapshot.room_id=room_id;\n   UPDATE public.org_next_rooms live SET title=compiled->>''title'',setup_issues=compiled->''issues''\n   WHERE live.id=room_id;\n   RETURN jsonb_build_object(';
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_prepare_room reuse return';END IF;
   body:=replace(body,old,replacement);
   EXECUTE body;
 END IF;

 -- (3) Existing lobby sessions with an old snapshot must not begin with
 -- formerly enabled mechanics after their source build has been changed.
 SELECT pg_get_functiondef('public.qwiz_check_room_start(uuid)'::regprocedure) INTO body;
 IF strpos(body,'Reject stale compiled room timelines')=0 THEN
   old:='declare r public.org_next_rooms%rowtype;q_count integer;';
   replacement:='declare r public.org_next_rooms%rowtype;q_count integer;v_source_build uuid;v_stored_timeline jsonb;v_current jsonb;';
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected start-check declaration';END IF;
   body:=replace(body,old,replacement);
   old:=' select jsonb_array_length(q.questions) into q_count from public.org_next_quizzes q where q.id=r.quiz_id;';
   replacement:=E' -- Reject stale compiled room timelines, including removed mechanisms.\n select snapshot.build_id,snapshot.timeline into v_source_build,v_stored_timeline\n from public.qwiz_room_builds snapshot where snapshot.room_id=p_room;\n if v_source_build is not null then\n   v_current:=public.qwiz_compile_build(v_source_build,r.title,false);\n   if v_stored_timeline is distinct from v_current->''timeline'' then\n     raise exception ''Сборка изменена после создания комнаты. Подготовьте комнату заново, чтобы исключить старые механики.'';\n   end if;\n end if;\n'||old;
   IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected qwiz_check_room_start validation position';END IF;
   body:=replace(body,old,replacement);
   EXECUTE body;
 END IF;
END $patch$;
