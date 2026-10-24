-- Teacher timeline previews use the full saved card order, NOT just quiz.questions.
-- Correctly include map, arcade, intro, break, standings and finale cards.
-- Access remains restricted to the room owner with moderator privileges.
CREATE OR REPLACE FUNCTION public.qwiz_host_slide_deck(p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $deck$
DECLARE
 r public.org_next_rooms%rowtype;
 activity public.qwiz_room_activity%rowtype;
 questions jsonb := '[]'::jsonb;
 cards jsonb := '[]'::jsonb;
 slides jsonb := '[]'::jsonb;
 q jsonb; card jsonb; current_q jsonb;
 n int; qn int; total int; card_count int; current_card int; card_position int; slot int;
 use_question boolean; question_index int; visible_card jsonb; kind text; current_kind text;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.org_quiz_is_admin_check() THEN
   RAISE EXCEPTION 'Недостаточно прав';
 END IF;
 SELECT * INTO r FROM public.org_next_rooms WHERE code=upper(trim(p_code));
 IF NOT FOUND OR r.owner_id<>(SELECT auth.uid()) THEN
   RAISE EXCEPTION 'Комната недоступна';
 END IF;
 SELECT COALESCE(x.questions,'[]'::jsonb) INTO questions
 FROM public.org_next_quizzes x WHERE x.id=r.quiz_id;
 SELECT COALESCE(rb.timeline,'[]'::jsonb) INTO cards
 FROM public.qwiz_room_builds rb WHERE rb.room_id=r.id;
 SELECT * INTO activity FROM public.qwiz_room_activity a WHERE a.room_id=r.id;
 total:=jsonb_array_length(questions);
 card_count:=coalesce(jsonb_array_length(cards),0);
 qn:=greatest(0,least(greatest(total-1,0),r.question_index));
 current_q:=questions->qn;
 current_card:=CASE
   WHEN r.phase='intermission' AND activity.room_id IS NOT NULL THEN activity.card_position
   WHEN r.phase='finished' THEN card_count-1
   WHEN r.phase='lobby' THEN 0
   ELSE coalesce((current_q->>'round_index')::int,0)
 END;
 current_card:=greatest(0,least(greatest(0,card_count-1),current_card));
 FOR slot IN -1..1 LOOP
   use_question:=FALSE;
   question_index:=NULL;
   card_position:=NULL;
   IF card_count=0 THEN
     question_index:=qn+slot;
     use_question:=question_index BETWEEN 0 AND total-1;
   ELSIF r.phase IN ('question','result','countdown') AND total>0 THEN
     IF slot=0 THEN
       question_index:=qn;use_question:=TRUE;
     ELSIF slot=-1 THEN
       IF qn>0 AND coalesce((questions->(qn-1)->>'round_index')::int,0)=current_card THEN
         question_index:=qn-1;use_question:=TRUE;
       ELSE card_position:=current_card-1;
       END IF;
     ELSE
       IF qn+1<total AND coalesce((questions->(qn+1)->>'round_index')::int,0)=current_card THEN
         question_index:=qn+1;use_question:=TRUE;
       ELSE card_position:=current_card+1;
       END IF;
     END IF;
   ELSE
     card_position:=current_card+slot;
   END IF;
   IF use_question THEN
     q:=questions->question_index;
     visible_card:=jsonb_build_object(
       'position',slot,'index',question_index,'kind','question','type','round',
       'title',coalesce(q->>'round_title','Вопрос '||(question_index+1)),
       'prompt',coalesce(q->>'prompt','Вопрос'),
       'media_url',coalesce(nullif(q->>'media_url',''),nullif(q->>'illustration_url','')),
       'options',coalesce(q->'options','[]'::jsonb),'correct',q->>'correct',
       'mode',null,'card_position',current_card
     );
   ELSIF card_position BETWEEN 0 AND card_count-1 THEN
     card:=cards->card_position;kind:=coalesce(card->>'type','break');
     visible_card:=jsonb_build_object(
       'position',slot,'index',coalesce((card->>'first_question')::int,-1),
       'kind',CASE WHEN kind='finale' THEN 'final' ELSE 'activity' END,
       'type',kind,'title',coalesce(card->>'title',kind),
       'prompt',CASE
         WHEN card->'settings'->>'arcade_mode'='russia_map' THEN 'Индивидуальная карта 89 субъектов России · задания и прогресс игроков'
         WHEN card->'settings'->>'arcade_mode' IS NOT NULL THEN 'Командная мини-игра · ход и результаты в реальном времени'
         WHEN kind='team_stats' THEN 'Рейтинг команд по набранным очкам'
         WHEN kind='player_stats' THEN 'Личный рейтинг участников'
         WHEN kind='finale' THEN 'Финальный рейтинг игроков и команд'
         ELSE coalesce(card->>'title','Следующий этап') END,
       'media_url',null,'options','[]'::jsonb,'correct',null,
       'mode',card->'settings'->>'arcade_mode','card_position',card_position
     );
   ELSE
     visible_card:=jsonb_build_object('position',slot,'index',-1,
       'kind',CASE WHEN slot<0 THEN 'start' ELSE 'final' END,
       'type',CASE WHEN slot<0 THEN 'intro' ELSE 'finale' END,
       'title',CASE WHEN slot<0 THEN 'Начало игры' ELSE 'Финал игры' END,
       'prompt',CASE WHEN slot<0 THEN 'Присоединение игроков' ELSE 'Итоги и награды' END,
       'options','[]'::jsonb,'mode',null);
   END IF;
   slides:=slides||jsonb_build_array(visible_card);
 END LOOP;
 RETURN jsonb_build_object('index',qn,'total',total,'phase',r.phase,
    'activity_card',current_card,'cards_total',card_count,'slides',slides);
END
$deck$;
REVOKE ALL ON FUNCTION public.qwiz_host_slide_deck(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qwiz_host_slide_deck(text) TO authenticated;
