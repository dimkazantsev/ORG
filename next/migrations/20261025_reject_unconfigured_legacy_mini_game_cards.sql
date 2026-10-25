-- Fail closed: unsupported/unselected mini-game cards must never enter a live timeline.
-- UI previously hid legacy blank bonus cards while compiler still scheduled them.
DO $patch$
DECLARE body text;anchor text;extension text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_compile_build(uuid,text,boolean)'::regprocedure) INTO body;
 IF strpos(body,'Unconfigured arcade card must not be scheduled')>0 THEN RETURN; END IF;
 anchor:='v_timeline:=v_timeline||jsonb_build_array(jsonb_build_object(';
 extension:=$guard$
   -- Unconfigured arcade card must not be scheduled.
   IF v_card.card_type IN ('bonus','duel')
      AND COALESCE(v_card.settings->>'arcade_mode','') NOT IN
         ('rocket','blitz','tug','captain','russia_map') THEN
     v_missing:=v_missing||jsonb_build_array(jsonb_build_object(
       'title',v_card.title,'reason','Укажите механику мини-игры или удалите карточку'));
     CONTINUE;
   END IF;
   IF v_card.settings->>'arcade_mode'='russia_map' THEN
     IF jsonb_typeof(v_card.settings->'geo_modes') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_card.settings->'geo_modes')=0 THEN
       v_missing:=v_missing||jsonb_build_array(jsonb_build_object(
         'title',v_card.title,'reason','Выберите хотя бы одну механику карты России'));
       CONTINUE;
     END IF;
     IF EXISTS(
       SELECT 1 FROM jsonb_array_elements_text(v_card.settings->'geo_modes') item
       WHERE item.value NOT IN
       ('locate','identify','capital','flag','silhouette','neighbour','detective','district')
     ) THEN
       RAISE EXCEPTION 'Карточка «%»: недопустимая механика карты России',v_card.title;
     END IF;
   END IF;
   $guard$;
 IF strpos(body,anchor)=0 THEN RAISE EXCEPTION 'Unexpected build compilation timeline anchor';END IF;
 EXECUTE replace(body,anchor,extension||anchor);
END $patch$;
