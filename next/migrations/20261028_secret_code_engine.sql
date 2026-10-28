
-- Independent "Секретный код" arcade: server-scored and isolated from flag questions.
CREATE TABLE IF NOT EXISTS public.qwiz_secret_code_catalog(
 n integer PRIMARY KEY CHECK(n between 1 and 30),
 title text NOT NULL, level integer NOT NULL CHECK(level between 1 and 5),
 length integer NOT NULL CHECK(length between 4 and 8), palette jsonb NOT NULL
);
INSERT INTO public.qwiz_secret_code_catalog(n,title,level,length,palette)
SELECT (x->>'n')::integer,x->>'name',(x->>'level')::integer,(x->>'length')::integer,x->'palette'
FROM jsonb_array_elements('[{"n":1,"name":"Красный сигнал","level":1,"length":4,"palette":["red","blue","yellow","green"]},{"n":2,"name":"Четыре цвета","level":1,"length":4,"palette":["red","blue","yellow","green"]},{"n":3,"name":"Первый повтор","level":1,"length":4,"palette":["red","blue","yellow","green"]},{"n":4,"name":"Двойной сигнал","level":1,"length":4,"palette":["red","blue","yellow","green"]},{"n":5,"name":"Перемена порядка","level":1,"length":4,"palette":["red","blue","yellow","green"]},{"n":6,"name":"Цветовая комбинация","level":1,"length":4,"palette":["red","blue","yellow","green"]},{"n":7,"name":"Европейская комбинация","level":2,"length":5,"palette":["ru","cn","br","jp","fr","de","it"]},{"n":8,"name":"Азиатский маршрут","level":2,"length":5,"palette":["ru","cn","br","jp","fr","de","it"]},{"n":9,"name":"Пять государств","level":2,"length":5,"palette":["ru","cn","br","jp","fr","de","it"]},{"n":10,"name":"Похожие триколоры","level":2,"length":5,"palette":["ru","cn","br","jp","fr","de","it"]},{"n":11,"name":"Возвращение флага","level":2,"length":5,"palette":["ru","cn","br","jp","fr","de","it"]},{"n":12,"name":"Международный код","level":2,"length":5,"palette":["ru","cn","br","jp","fr","de","it"]},{"n":13,"name":"Геральдический ряд","level":3,"length":6,"palette":["star","shield","crown","eagle","globe","torch"]},{"n":14,"name":"Короны и щиты","level":3,"length":6,"palette":["star","shield","crown","eagle","globe","torch"]},{"n":15,"name":"Повтор звезды","level":3,"length":6,"palette":["star","shield","crown","eagle","globe","torch"]},{"n":16,"name":"Государственные знаки","level":3,"length":6,"palette":["star","shield","crown","eagle","globe","torch"]},{"n":17,"name":"Запутанная последовательность","level":3,"length":6,"palette":["star","shield","crown","eagle","globe","torch"]},{"n":18,"name":"Дипломатический шифр","level":3,"length":6,"palette":["star","shield","crown","eagle","globe","torch"]},{"n":19,"name":"Код делегации","level":4,"length":7,"palette":["letter","dove","globe","key","shield","seal","star"]},{"n":20,"name":"Сигнал посольства","level":4,"length":7,"palette":["letter","dove","globe","key","shield","seal","star"]},{"n":21,"name":"Повторяющийся шифр","level":4,"length":7,"palette":["letter","dove","globe","key","shield","seal","star"]},{"n":22,"name":"Протокол саммита","level":4,"length":7,"palette":["letter","dove","globe","key","shield","seal","star"]},{"n":23,"name":"Смешанная последовательность","level":4,"length":7,"palette":["letter","dove","globe","key","shield","seal","star"]},{"n":24,"name":"Последнее сообщение","level":4,"length":7,"palette":["letter","dove","globe","key","shield","seal","star"]},{"n":25,"name":"Восьмёрка","level":5,"length":8,"palette":["red","blue","crown","star","ru","jp","cn","shield","globe"]},{"n":26,"name":"Обманчивые повторы","level":5,"length":8,"palette":["red","blue","crown","star","ru","jp","cn","shield","globe"]},{"n":27,"name":"Символы трёх стран","level":5,"length":8,"palette":["red","blue","crown","star","ru","jp","cn","shield","globe"]},{"n":28,"name":"Двойной шифр","level":5,"length":8,"palette":["red","blue","crown","star","ru","jp","cn","shield","globe"]},{"n":29,"name":"Последняя комбинация","level":5,"length":8,"palette":["red","blue","crown","star","ru","jp","cn","shield","globe"]},{"n":30,"name":"Финальный мастер-код","level":5,"length":8,"palette":["red","blue","crown","star","ru","jp","cn","shield","globe"]}]'::jsonb) x
ON CONFLICT(n) DO UPDATE SET title=excluded.title,level=excluded.level,length=excluded.length,palette=excluded.palette;
CREATE TABLE IF NOT EXISTS public.qwiz_secret_code_sessions(
 room_id uuid NOT NULL REFERENCES public.org_next_rooms(id) ON DELETE CASCADE,
 card_position integer NOT NULL, template_no integer NOT NULL REFERENCES public.qwiz_secret_code_catalog(n),
 code jsonb NOT NULL, choices jsonb NOT NULL,
 PRIMARY KEY(room_id,card_position)
);
CREATE TABLE IF NOT EXISTS public.qwiz_secret_code_answers(
 room_id uuid NOT NULL REFERENCES public.org_next_rooms(id) ON DELETE CASCADE,
 card_position integer NOT NULL,
 player_id uuid NOT NULL REFERENCES public.org_next_players(id) ON DELETE CASCADE,
 team_id uuid NOT NULL REFERENCES public.org_next_teams(id) ON DELETE CASCADE,
 answer jsonb NOT NULL, exact integer NOT NULL CHECK(exact between 0 and 8),
 points integer NOT NULL CHECK(points IN (0,3,6,10)),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(room_id,card_position,player_id)
);
CREATE INDEX IF NOT EXISTS qwiz_secret_code_answers_team ON public.qwiz_secret_code_answers(room_id,card_position,team_id);
ALTER TABLE public.qwiz_secret_code_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qwiz_secret_code_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qwiz_secret_code_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qwiz_secret_code_sessions,public.qwiz_secret_code_answers FROM anon,authenticated;
REVOKE ALL ON public.qwiz_secret_code_catalog FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.qwiz_secret_code_ensure(p_room uuid,p_position integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $secret$
DECLARE a public.qwiz_room_activity%rowtype; r public.qwiz_arcade_runs%rowtype;
 c public.qwiz_secret_code_catalog%rowtype; selected integer; answer jsonb:='[]'::jsonb;
 n integer; index_ integer; label text; picked jsonb;
 symbols jsonb; palette jsonb;
BEGIN
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room AND card_position=p_position;
 IF a.room_id IS NULL OR a.settings->>'arcade_mode'<>'sequence_memory' THEN RETURN;END IF;
 SELECT * INTO r FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=p_position;
 IF r.room_id IS NULL THEN RETURN;END IF;
 selected:=CASE WHEN (a.settings->>'secret_challenge') ~ '^([1-9]|[12][0-9]|30)$'
  THEN (a.settings->>'secret_challenge')::int
  ELSE (('x'||substr(md5(p_room::text||':'||p_position),1,8))::bit(32)::bigint % 30+1)::int END;
 SELECT * INTO c FROM public.qwiz_secret_code_catalog WHERE n=selected;
 IF c.n IS NULL THEN RAISE EXCEPTION 'Задания Секретного кода не установлены'; END IF;
 palette:=c.palette;
 FOR n IN 1..c.length LOOP
  index_:=((('x'||substr(md5(p_room::text||':'||p_position||':'||n),1,8))::bit(32)::bigint
    % jsonb_array_length(palette))::int);
  answer:=answer||jsonb_build_array(palette->index_);
 END LOOP;
 INSERT INTO public.qwiz_secret_code_sessions(room_id,card_position,template_no,code,choices)
 VALUES(p_room,p_position,c.n,answer,palette) ON CONFLICT DO NOTHING;
END $secret$;

CREATE OR REPLACE FUNCTION public.qwiz_secret_code_state(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $secret$
DECLARE r public.org_next_rooms%rowtype; a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype; challenge public.qwiz_secret_code_sessions%rowtype;
 template public.qwiz_secret_code_catalog%rowtype; me uuid;
 spent integer; idx integer; visible text; phase text; secs integer; was_awarded boolean;
 mine public.qwiz_secret_code_answers%rowtype;
BEGIN
 IF p_code !~ '^[A-F0-9]{8}$' THEN RETURN NULL;END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE code=p_code;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=r.id;
 IF a.settings->>'arcade_mode'<>'sequence_memory' THEN RETURN NULL; END IF;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=r.id AND card_position=a.card_position;
 IF v.room_id IS NULL THEN RETURN NULL;END IF;
 PERFORM public.qwiz_secret_code_ensure(r.id,v.card_position);
 SELECT * INTO challenge FROM public.qwiz_secret_code_sessions WHERE room_id=r.id AND card_position=v.card_position;
 SELECT * INTO template FROM public.qwiz_secret_code_catalog WHERE n=challenge.template_no;
 spent:=greatest(0,floor(extract(epoch FROM clock_timestamp()-v.started_at)*1000)::int);
 idx:=floor(greatest(0,spent-1500)/1100)::int;
 secs:=public.qwiz_arcade_duration(a.settings,'sequence_memory');
 was_awarded:=v.awarded_at IS NOT NULL OR clock_timestamp()>=v.started_at+make_interval(secs=>secs);
 IF was_awarded THEN phase:='result';
 ELSIF spent<1500 THEN phase:='ready';
 ELSIF idx<jsonb_array_length(challenge.code) THEN phase:='show';
 ELSE phase:='answer';END IF;
 visible:=CASE WHEN phase='show' THEN challenge.code->>idx ELSE NULL END;
 SELECT p.id INTO me FROM public.org_next_players p
  WHERE p.room_id=r.id AND (p.user_id=(SELECT auth.uid()) OR EXISTS(
    SELECT 1 FROM public.qwiz_player_device_access d
    WHERE d.room_id=r.id AND d.player_id=p.id AND d.user_id=(SELECT auth.uid())))
  LIMIT 1;
 IF me IS NOT NULL THEN
  SELECT * INTO mine FROM public.qwiz_secret_code_answers
    WHERE room_id=r.id AND card_position=v.card_position AND player_id=me;
 END IF;
 RETURN jsonb_build_object(
  'phase',phase,'template',template.title,'level',template.level,'length',template.length,
  'index',CASE WHEN phase='show' THEN idx+1 ELSE NULL END,
  'symbol',visible,'choices',challenge.choices,
  'show_ms',1100,'started_at',v.started_at,'server_now',clock_timestamp(),
  'submitted',mine.player_id IS NOT NULL,
  'my_points',CASE WHEN was_awarded THEN mine.points ELSE NULL END,
  'my_exact',CASE WHEN was_awarded THEN mine.exact ELSE NULL END,
  'solution',CASE WHEN was_awarded THEN challenge.code ELSE NULL END,
  'answer_count',(SELECT count(*) FROM public.qwiz_secret_code_answers ans WHERE ans.room_id=r.id AND ans.card_position=v.card_position)
 );
END $secret$;

CREATE OR REPLACE FUNCTION public.qwiz_secret_code_submit(p_room uuid,p_answer jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $secret$
DECLARE r public.org_next_rooms%rowtype; a public.qwiz_room_activity%rowtype;
 v public.qwiz_arcade_runs%rowtype; p public.org_next_players%rowtype;
 c public.qwiz_secret_code_sessions%rowtype; existing public.qwiz_secret_code_answers%rowtype;
 elapsed integer; n integer; exact_ integer:=0; points_ integer; v_seconds integer;
 BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Требуется вход в игру';END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE id=p_room;
 IF r.id IS NULL OR r.phase<>'intermission' OR public.qwiz_party_paused(p_room) THEN RAISE EXCEPTION 'Раунд не активен';END IF;
 SELECT * INTO a FROM public.qwiz_room_activity WHERE room_id=p_room;
 IF a.settings->>'arcade_mode'<>'sequence_memory' THEN RAISE EXCEPTION 'Сейчас другая мини-игра';END IF;
 SELECT * INTO v FROM public.qwiz_arcade_runs WHERE room_id=p_room AND card_position=a.card_position;
 IF v.room_id IS NULL OR v.awarded_at IS NOT NULL THEN RAISE EXCEPTION 'Раунд не запущен';END IF;
 SELECT * INTO p FROM public.org_next_players x WHERE x.room_id=p_room AND
  (x.user_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.qwiz_player_device_access d
    WHERE d.room_id=p_room AND d.player_id=x.id AND d.user_id=(SELECT auth.uid()))) LIMIT 1;
 IF p.id IS NULL OR p.team_id IS NULL THEN RAISE EXCEPTION 'Сначала выберите команду';END IF;
 SELECT * INTO existing FROM public.qwiz_secret_code_answers
  WHERE room_id=p_room AND card_position=v.card_position AND player_id=p.id;
 IF existing.player_id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'already_submitted',true);END IF;
 SELECT * INTO c FROM public.qwiz_secret_code_sessions WHERE room_id=p_room AND card_position=v.card_position;
 IF c.room_id IS NULL OR jsonb_typeof(p_answer)<>'array' OR jsonb_array_length(p_answer)<>jsonb_array_length(c.code)
 THEN RAISE EXCEPTION 'Введите всю последовательность';END IF;
 elapsed:=floor(extract(epoch from clock_timestamp()-v.started_at)*1000)::int;
 v_seconds:=public.qwiz_arcade_duration(a.settings,'sequence_memory');
 IF elapsed<1500+jsonb_array_length(c.code)*1100 THEN RAISE EXCEPTION 'Дождитесь завершения показа';END IF;
 IF elapsed>v_seconds*1000 THEN RAISE EXCEPTION 'Время на ответ закончилось';END IF;
 FOR n IN 0..jsonb_array_length(c.code)-1 LOOP
  IF jsonb_typeof(p_answer->n)<>'string' OR NOT (c.choices ? (p_answer->>n))
    THEN RAISE EXCEPTION 'Неизвестный символ';END IF;
  IF p_answer->n=c.code->n THEN exact_:=exact_+1;END IF;
 END LOOP;
 points_:=CASE WHEN exact_=jsonb_array_length(c.code) THEN 10
    WHEN exact_=jsonb_array_length(c.code)-1 THEN 6
    WHEN exact_>=ceil(jsonb_array_length(c.code)/2.0) THEN 3 ELSE 0 END;
 INSERT INTO public.qwiz_secret_code_answers(room_id,card_position,player_id,team_id,answer,exact,points)
 VALUES(p_room,v.card_position,p.id,p.team_id,p_answer,exact_,points_)
 ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('ok',true,'submitted',true);
END $secret$;

REVOKE ALL ON FUNCTION public.qwiz_secret_code_ensure(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.qwiz_secret_code_state(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.qwiz_secret_code_submit(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qwiz_secret_code_state(text),public.qwiz_secret_code_submit(uuid,jsonb) TO authenticated;
