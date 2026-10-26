-- Save removable historical card snapshot before deleting the one live builder card.
CREATE TABLE IF NOT EXISTS private.qwiz_removed_dino_cards_20261027
AS SELECT * FROM public.qwiz_build_cards WHERE false;
INSERT INTO private.qwiz_removed_dino_cards_20261027
SELECT * FROM public.qwiz_build_cards WHERE settings->>'arcade_mode'='rocket'
ON CONFLICT DO NOTHING;
DELETE FROM public.qwiz_build_cards WHERE settings->>'arcade_mode'='rocket';

CREATE OR REPLACE FUNCTION public.qwiz_studio(p_action text, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_id uuid; v_build uuid; v_obj jsonb; v_cards jsonb;
v_cards_arr jsonb; v_card jsonb; v_pos integer; v_topic uuid; v_kind text;
begin
 v_user := (select auth.uid());
 if v_user is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 if p_action='overview' then
  return jsonb_build_object(
   'topics',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'category',t.category) order by t.category,t.name),'[]'::jsonb) from public.qwiz_topics t where t.owner_id=v_user),
   'builds',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,'description',b.description,'updated_at',b.updated_at) order by b.updated_at desc),'[]'::jsonb) from public.qwiz_builds b where b.owner_id=v_user),
   'types',jsonb_build_array('single','boolean','multi','match','order','text','number','image','audio','video','flag','portrait','map','date','estimate','sequence','hotspot','puzzle','riddle','auction','blitz','poll')
  );
 elsif p_action='topic_save' then
  if char_length(trim(coalesce(p_input->>'name',''))) not between 2 and 90 then raise exception 'Укажите название темы'; end if;
  if coalesce(p_input->>'id','')<>'' then
   update public.qwiz_topics set name=trim(p_input->>'name'),category=left(coalesce(p_input->>'category','Общие знания'),80)
   where id=(p_input->>'id')::uuid and owner_id=v_user returning id into v_id;
  else
   insert into public.qwiz_topics(owner_id,name,category)
   values(v_user,trim(p_input->>'name'),left(coalesce(p_input->>'category','Общие знания'),80)) returning id into v_id;
  end if;
  if v_id is null then raise exception 'Тема не найдена'; end if;
  return jsonb_build_object('id',v_id);
 elsif p_action='questions' then
  return jsonb_build_object(
   'total',(select count(*) from public.qwiz_bank q where q.owner_id=v_user and (nullif(p_input->>'topic_id','') is null or q.topic_id=(p_input->>'topic_id')::uuid)
     and (nullif(p_input->>'kind','') is null or (q.kind=p_input->>'kind' or (p_input->>'kind'='flag' and q.solution->>'flag_mode' in ('assemble','multiple'))))
     and (nullif(p_input->>'mode','') is null or q.solution->>'flag_mode'=p_input->>'mode')
     and (nullif(p_input->>'search','') is null or q.prompt ilike '%'||(p_input->>'search')||'%')),
   'items',(select coalesce(jsonb_agg(s.data order by s.ord),'[]'::jsonb) from
      (select jsonb_build_object('id',q.id,'prompt',q.prompt,'topic_id',q.topic_id,'kind',q.kind,'difficulty',q.difficulty,
       'options',q.options,'explanation',q.explanation,'tags',q.tags,
       'solution',q.solution) as data,
       row_number() over(order by
        case when p_input->>'sort'='oldest' then q.created_at end asc nulls last,
        case when p_input->>'sort'='difficulty' then q.difficulty end desc nulls last,
        q.created_at desc) ord
       from public.qwiz_bank q where q.owner_id=v_user
       and (nullif(p_input->>'topic_id','') is null or q.topic_id=(p_input->>'topic_id')::uuid)
       and (nullif(p_input->>'kind','') is null or (q.kind=p_input->>'kind' or (p_input->>'kind'='flag' and q.solution->>'flag_mode' in ('assemble','multiple'))))
       and (nullif(p_input->>'mode','') is null or q.solution->>'flag_mode'=p_input->>'mode')
       and (nullif(p_input->>'search','') is null or q.prompt ilike '%'||(p_input->>'search')||'%')
       order by ord limit greatest(1,least(100,coalesce((p_input->>'limit')::int,25))) offset greatest(0,least(100000,coalesce((p_input->>'offset')::int,0)))
      )s)
  );
 elsif p_action='question_save' then
  v_kind := coalesce(p_input->>'kind','single');
  if v_kind not in ('single','boolean','multi','match','order','text','number','image','audio','video','flag','portrait','map','date','estimate','sequence','hotspot','puzzle','riddle','auction','blitz','poll') then raise exception 'Неизвестный тип'; end if;
  if char_length(trim(coalesce(p_input->>'prompt',''))) not between 4 and 3000 then raise exception 'Текст вопроса слишком короткий или длинный'; end if;
  if jsonb_typeof(p_input->'options') is distinct from 'array' or jsonb_typeof(p_input->'solution') is distinct from 'object' then raise exception 'Некорректные данные ответа'; end if;
  if v_kind in ('single','boolean','flag','portrait','image') then
   if jsonb_array_length(p_input->'options') not between 2 and 6 or
   jsonb_typeof(p_input->'solution'->'correct') is distinct from 'number'
   or (p_input->'solution'->>'correct')::int not between 0 and jsonb_array_length(p_input->'options')-1 then
    raise exception 'Для этого типа нужны 2–6 вариантов и номер правильного'; end if;
  end if;
  if p_input ? 'topic_id' and nullif(p_input->>'topic_id','') is not null then
   v_topic:=(p_input->>'topic_id')::uuid;
   if not exists(select 1 from public.qwiz_topics where id=v_topic and owner_id=v_user) then raise exception 'Тема недоступна'; end if;
  else v_topic:=null;end if;
  if nullif(p_input->>'id','') is not null then
    update public.qwiz_bank set topic_id=v_topic,kind=v_kind,prompt=trim(p_input->>'prompt'),options=p_input->'options',
     solution=p_input->'solution',difficulty=greatest(1,least(5,coalesce((p_input->>'difficulty')::int,2))),
     explanation=left(coalesce(p_input->>'explanation',''),3000),tags=array_remove(tags,'fw:published')
    where id=(p_input->>'id')::uuid and owner_id=v_user returning id into v_id;
  else
    insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,difficulty,explanation)
    values(v_user,v_topic,v_kind,trim(p_input->>'prompt'),p_input->'options',p_input->'solution',
       greatest(1,least(5,coalesce((p_input->>'difficulty')::int,2))),left(coalesce(p_input->>'explanation',''),3000))
    returning id into v_id;
  end if;
  if v_id is null then raise exception 'Вопрос не найден'; end if;
  return jsonb_build_object('id',v_id);
 elsif p_action='flag_publish' then
   v_id:=nullif(p_input->>'id','')::uuid;
   if v_id is null then raise exception 'Укажите вопрос';end if;
   if not exists(select 1 from public.qwiz_bank q
       join public.qwiz_topics t on t.id=q.topic_id
       where q.id=v_id and q.owner_id=v_user and t.owner_id=v_user
       and t.name='Флаги мира' and public.qwiz_flags_question_valid(q.kind,q.options,q.solution)) then
       raise exception 'Вопрос не прошёл проверку формы и правильного ответа';end if;
   update public.qwiz_bank set tags=case when 'fw:published'=any(tags)
      then tags else tags || array['fw:published']::text[] end
   where id=v_id and owner_id=v_user;
   return jsonb_build_object('id',v_id,'published',true);
 elsif p_action='build_delete' then
   if nullif(p_input->>'id','') is null then raise exception 'Укажите сборку';end if;
   v_id:=(p_input->>'id')::uuid;
   delete from public.qwiz_builds where id=v_id and owner_id=v_user returning id into v_build;
   if v_build is null then raise exception 'Сборка не найдена или нет прав';end if;
   -- Existing room snapshots and scores are retained (room_builds.build_id ON DELETE SET NULL).
   return jsonb_build_object('deleted',true,'id',v_id);
 elsif p_action='build_get' then
   v_id:=(p_input->>'id')::uuid;
   if not exists(select 1 from public.qwiz_builds where id=v_id and owner_id=v_user) then raise exception 'Сборка не найдена'; end if;
   return jsonb_build_object('build',(select jsonb_build_object('id',b.id,'title',b.title,'description',b.description) from public.qwiz_builds b where id=v_id),
    'cards',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'type',c.card_type,'title',c.title,'icon',c.icon,'topic_id',c.topic_id,'settings',c.settings) order by c.position),'[]'::jsonb) from public.qwiz_build_cards c where c.build_id=v_id));
 elsif p_action='build_save' then
   if char_length(trim(coalesce(p_input->>'title',''))) not between 2 and 140 or jsonb_typeof(p_input->'cards') is distinct from 'array' or jsonb_array_length(p_input->'cards') not between 1 and 60 then
    raise exception 'Укажите название и от 1 до 60 карточек'; end if;
   if nullif(p_input->>'id','') is not null then
    update public.qwiz_builds set title=trim(p_input->>'title'),description=left(coalesce(p_input->>'description',''),500),updated_at=now()
    where id=(p_input->>'id')::uuid and owner_id=v_user returning id into v_id;
    if v_id is null then raise exception 'Сборка не найдена'; end if;
    delete from public.qwiz_build_cards where build_id=v_id;
   else
    insert into public.qwiz_builds(owner_id,title,description) values(v_user,trim(p_input->>'title'),left(coalesce(p_input->>'description',''),500)) returning id into v_id;
   end if;
   IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_input->'cards') c
    WHERE c->'settings'->>'arcade_mode'='rocket'
   ) THEN RAISE EXCEPTION 'Дино-забег удалён из доступных игровых механик'; END IF;
   v_pos:=0;
   for v_card in select value from jsonb_array_elements(p_input->'cards') loop
    if coalesce(v_card->>'type','') not in ('round','intro','break','team_stats','player_stats','bonus','duel','finale') then raise exception 'Неверный тип карточки'; end if;
    if jsonb_typeof(v_card->'settings') is distinct from 'object' then raise exception 'Неверные настройки карточки'; end if;
    v_topic:=nullif(v_card->>'topic_id','')::uuid;
    if v_topic is not null and not exists(select 1 from public.qwiz_topics where id=v_topic and owner_id=v_user) then raise exception 'Чужая тема';end if;
    insert into public.qwiz_build_cards(build_id,position,card_type,title,icon,topic_id,settings)
    values(v_id,v_pos,v_card->>'type',left(coalesce(nullif(v_card->>'title',''),'Раунд'),120),
      left(coalesce(v_card->>'icon','layers'),40),v_topic,v_card->'settings');
    v_pos:=v_pos+1;
   end loop;
   if (select card_type from public.qwiz_build_cards where build_id=v_id order by position desc limit 1)<>'finale' then
      raise exception 'Последней карточкой должен быть финал'; end if;
   return jsonb_build_object('id',v_id,'cards',v_pos);
 else raise exception 'Неизвестная команда студии'; end if;
end $function$
;
