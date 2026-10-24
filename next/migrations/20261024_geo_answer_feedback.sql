-- Provide verified answer feedback only AFTER a submitted response;
-- opaque answer tokens remain hidden on unanswered tasks.
DO $patch$
DECLARE source_sql text; original text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_geo_play(uuid,text)'::regprocedure) INTO source_sql;
 original := '''last_award'',v_award,''question'',case when';
 replacement := '''last_award'',v_award,
 ''last_answer'',case when p_answer is not null and v_task is not null then
 jsonb_build_object(
  ''correct'',v_hit,
  ''correct_text'',case when v_task->>''mode''=''locate'' then
     (select name from public.qwiz_geo_regions where id=v_task->>''answer'')
    else (select choice->>''text'' from jsonb_array_elements(v_task->''options'') choice
          where choice->>''id''=v_task->>''answer'' limit 1) end,
  ''correct_region_id'',case when v_task->>''mode''=''locate'' then v_task->>''answer'' else null end,
  ''selected_region_id'',case when v_task->>''mode''=''locate'' then p_answer else null end
 ) else null end,
 ''question'',case when';
 IF position(original IN source_sql)=0 THEN
   IF position('''last_answer'',case when p_answer' IN source_sql)>0 THEN RETURN; END IF;
   RAISE EXCEPTION 'Unexpected geography function version; refusing patch';
 END IF;
 EXECUTE replace(source_sql,original,replacement);
END
$patch$;
