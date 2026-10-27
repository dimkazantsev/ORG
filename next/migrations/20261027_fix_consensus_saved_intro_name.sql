-- Canonical intro names for previously saved game cards and new game cards.
CREATE OR REPLACE FUNCTION public.qwiz_card_intro_title(p_room uuid, p_card integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c jsonb; modes jsonb; single_mode text; topic_name text; game text;
BEGIN
 SELECT rb.timeline->p_card INTO c FROM public.qwiz_room_builds rb WHERE rb.room_id=p_room;
 IF c IS NULL THEN RETURN 'Следующий раунд';END IF;
 game:=coalesce(c->'settings'->>'arcade_mode','');
 IF game='blitz' THEN RETURN 'Блиц-консенсус';END IF;
 IF game='captain' THEN RETURN 'Мэмори капитанов';END IF;
 IF game='tug' THEN RETURN 'Тап-баттл';END IF;
 IF game NOT IN ('','russia_map') THEN RETURN coalesce(c->>'title','Командная игра');END IF;
 IF game='russia_map' THEN modes:=coalesce(c->'settings'->'geo_modes','[]'::jsonb);
 ELSE modes:=coalesce(c->'settings'->'flag_modes','[]'::jsonb);END IF;
 IF jsonb_typeof(modes)='array' AND jsonb_array_length(modes)=1 THEN
  single_mode:=modes->>0;
  RETURN CASE single_mode
   WHEN 'country' THEN 'Угадай страну по флагу'
   WHEN 'picker' THEN 'Выбери флаг по названию'
   WHEN 'colors' THEN 'Цвета и полосы флагов'
   WHEN 'symbols' THEN 'Символы и гербы'
   WHEN 'fragments' THEN 'Скрытые фрагменты'
   WHEN 'errors' THEN 'Найди ошибку на флаге'
   WHEN 'similar' THEN 'Похожие флаги'
   WHEN 'assemble' THEN 'Собери флаг'
   WHEN 'multiple' THEN 'Несколько правильных ответов'
   WHEN 'memory' THEN 'Запомни флаг'
   WHEN 'geo' THEN 'География и карты'
   WHEN 'history' THEN 'История флагов'
   WHEN 'locate' THEN 'Найди субъект России'
   WHEN 'identify' THEN 'Узнай регион на карте'
   WHEN 'capital' THEN 'Назови административный центр'
   WHEN 'flag' THEN 'Узнай регион по флагу'
   WHEN 'silhouette' THEN 'Узнай регион по контуру'
   WHEN 'neighbour' THEN 'Соседи регионов России'
   WHEN 'detective' THEN 'Географический детектив'
   WHEN 'district' THEN 'Определи федеральный округ'
   ELSE coalesce(c->>'title','Новый раунд') END;
 END IF;
 IF nullif(c->>'topic_id','') IS NOT NULL THEN
  SELECT t.name INTO topic_name FROM public.qwiz_topics t WHERE t.id=(c->>'topic_id')::uuid;
 END IF;
 RETURN coalesce(topic_name,c->>'title','Новый раунд');
END $function$
;
