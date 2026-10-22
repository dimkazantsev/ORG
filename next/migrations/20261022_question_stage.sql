-- Server-owned question and answer stages. Apply after the existing next/migrations.
begin;
create table if not exists public.qwiz_question_runs(
 room_id uuid not null references public.org_next_rooms(id) on delete cascade,
 question_index integer not null check(question_index>=0),started_at timestamptz not null,
 deadline timestamptz not null,closed_at timestamptz,answer_deadline timestamptz,
 duration integer not null check(duration between 10 and 120),
 answer_duration integer not null default 10 check(answer_duration between 5 and 30),
 primary key(room_id,question_index));
create table if not exists public.qwiz_run_members(
 room_id uuid not null,question_index integer not null,
 player_id uuid not null references public.org_next_players(id) on delete cascade,
 team_id uuid references public.org_next_teams(id) on delete cascade,
 primary key(room_id,question_index,player_id),
 foreign key(room_id,question_index) references public.qwiz_question_runs(room_id,question_index) on delete cascade);
create index if not exists qwiz_run_members_player_idx on public.qwiz_run_members(player_id,room_id);
create index if not exists qwiz_run_members_team_idx on public.qwiz_run_members(team_id,room_id);
alter table public.qwiz_question_runs enable row level security;
alter table public.qwiz_run_members enable row level security;
revoke all on public.qwiz_question_runs,public.qwiz_run_members from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.org_next_advance(p_room uuid, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check()
 or not exists(select 1 from public.org_next_rooms where id=p_room and owner_id=(select auth.uid()))
 then raise exception 'Недостаточно прав';end if;
 return public.qwiz_advance_room(p_room,p_action);
end $function$;

CREATE OR REPLACE FUNCTION public.org_next_create_room(p_quiz uuid, p_title text, p_teams integer DEFAULT 4)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_code text; v_n integer; i integer;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 if not exists(select 1 from public.org_next_quizzes where id=p_quiz and owner_id=(select auth.uid())) then raise exception 'Набор не найден'; end if;
 if p_teams not between 1 and 15 then raise exception 'Число команд: от 1 до 15'; end if;
 if (select count(*) from public.org_next_rooms where owner_id=(select auth.uid()) and phase!='finished')>=10 then raise exception 'Сначала завершите старые комнаты'; end if;
 for i in 1..15 loop
  v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  exit when not exists(select 1 from public.org_next_rooms where code=v_code);
 end loop;
 if exists(select 1 from public.org_next_rooms where code=v_code) then raise exception 'Не удалось создать код'; end if;
 insert into public.org_next_rooms(quiz_id,owner_id,code,title)
 values(p_quiz,(select auth.uid()),v_code,left(trim(coalesce(nullif(p_title,''),'Новая игра')),140)) returning id into v_id;
 for v_n in 1..p_teams loop
  insert into public.org_next_teams(room_id,position,name) values(v_id,v_n,(select word from unnest(array['Несгибаемые','Космические','Невесомые','Искристые','Парадоксальные','Безмятежные','Сверхзвуковые','Непредсказуемые','Бархатные','Лучезарные','Молниеносные','Таинственные','Неукротимые','Зазеркальные','Фантастические','Невероятные','Шелестящие','Искромётные','Гравитационные','Неслучайные','Лунные','Пружинистые','Невозмутимые','Запредельные','Лавандовые','Непотопляемые','Сумеречные','Пушистые','Ультрамариновые','Звёздные']) word where not exists(select 1 from public.org_next_teams t where t.room_id=v_id and t.name=word) order by random() limit 1));
 end loop;
 return v_code;
end $function$;

CREATE OR REPLACE FUNCTION public.org_next_state(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room public.org_next_rooms%rowtype; v_host boolean; v_player public.org_next_players%rowtype;
 v_q jsonb; v_quiz public.org_next_quizzes%rowtype;
 v_teams jsonb; v_players jsonb; v_answers int;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход'; end if;
 select * into v_room from public.org_next_rooms where code=upper(trim(p_code));
 if not found then raise exception 'Комната не найдена'; end if;
 v_host:=v_room.owner_id=(select auth.uid()) and public.org_quiz_is_admin_check();
 select * into v_player from public.org_next_players p
 where p.room_id=v_room.id and (p.user_id=(select auth.uid())
 or exists(select 1 from public.qwiz_player_device_access d
    where d.room_id=v_room.id and d.player_id=p.id and d.user_id=(select auth.uid()))) limit 1;
 if not v_host and v_player.id is null then raise exception 'Нет доступа к комнате'; end if;
 perform public.qwiz_tick(v_room.code);
 select * into v_room from public.org_next_rooms where id=v_room.id;
 select * into v_quiz from public.org_next_quizzes where id=v_room.quiz_id;
 if v_room.question_index>=0 then
  v_q:=v_quiz.questions->v_room.question_index;
  if v_room.phase in ('lobby','countdown','intermission') then v_q:=null;
  elsif not v_host and v_room.phase not in ('result','finished') then v_q:=v_q-'correct'-'solution'-'explanation';end if;
 else v_q:=null; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'name',t.name,'score',t.score,
  'players',(select count(*) from public.org_next_players x where x.team_id=t.id)
  ) order by t.position),'[]'::jsonb)
 into v_teams from public.org_next_teams t where t.room_id=v_room.id;
 if v_host then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'group',p.group_name,'team_id',p.team_id) order by p.joined_at),'[]'::jsonb)
  into v_players from public.org_next_players p where p.room_id=v_room.id;
 else v_players:='[]'::jsonb; end if;
 select count(*) into v_answers from public.org_next_answers where room_id=v_room.id and question_index=v_room.question_index;
 return jsonb_build_object(
 'room_id',v_room.id,'code',v_room.code,'title',v_room.title,'phase',v_room.phase,
 'index',v_room.question_index,'total',jsonb_array_length(v_quiz.questions),
 'server_now',clock_timestamp(),'duration',case when v_room.phase='result' then greatest(5,least(30,coalesce((v_q->>'answer_duration')::int,10))) else coalesce((v_q->>'duration')::int,30) end,
 'public_stats',public.qwiz_screen_metrics(v_room.id,v_room.question_index,v_room.phase in ('result','finished'),v_room.phase='finished'),
 'answer',case when v_room.phase='result' then public.qwiz_answer_display(v_q) else null end,
 'ends_at',v_room.ends_at,'question',v_q,'teams',v_teams,'players',v_players,
 'me',case when v_player.id is null then null else jsonb_build_object('id',v_player.id,'team_id',v_player.team_id) end,
 'host',v_host,'eligible',case when v_player.id is null then true else public.qwiz_answer_eligible(v_room.id,v_player.id,v_room.question_index) end,'activity',case when v_room.phase='finished' then
 (select jsonb_build_object('type','finale','title',rb.timeline->(jsonb_array_length(rb.timeline)-1)->>'title','sound',coalesce(rb.timeline->(jsonb_array_length(rb.timeline)-1)->'settings'->>'sound','fanfare')) from public.qwiz_room_builds rb where rb.room_id=v_room.id)
 else (select jsonb_build_object('type',a.kind,'title',a.title,'settings',a.settings) from public.qwiz_room_activity a where a.room_id=v_room.id) end,
 'answers_count',v_answers,
 'has_answer',case when v_player.id is null then false else exists(select 1 from public.org_next_answers where room_id=v_room.id and player_id=v_player.id and question_index=v_room.question_index) end);
end $function$;

CREATE OR REPLACE FUNCTION public.qwiz_advance_room(p_room uuid, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype; q jsonb; v_questions jsonb; timeline jsonb;
 v_duration integer;v_next integer;v_prev_card integer;v_next_card jsonb;v_kind text;
 v_card_pos integer;
begin
 select * into r from public.org_next_rooms where id=p_room for update;
 if not found then raise exception 'Комната не найдена';end if;
 if p_action='next' and r.phase='question' then p_action:='reveal';end if;
 select quiz.questions into v_questions from public.org_next_quizzes quiz where quiz.id=r.quiz_id;
 select rb.timeline into timeline from public.qwiz_room_builds rb where rb.room_id=p_room;
 if p_action='finish' then
  update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
  delete from public.qwiz_room_activity where room_id=p_room;
 elsif p_action='start' and r.phase='lobby' then
  if timeline is not null and jsonb_array_length(timeline)>0 and timeline->0->>'type'<>'round' then
   v_next_card:=timeline->0;
   insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
    values(p_room,0,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
    on conflict(room_id) do update set card_position=0,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
   update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
  else
   q:=v_questions->0;
   if timeline is not null then
    update public.org_next_rooms set phase='countdown',question_index=0,ends_at=now()+interval '5 seconds' where id=p_room;
   else
    v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
    update public.org_next_rooms set phase='question',question_index=0,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
   end if;
  end if;
 elsif p_action='reveal' and r.phase='question' then
  update public.org_next_rooms set phase='result',ends_at=null where id=p_room;
 elsif p_action='next' and r.phase='intermission' then
  select a.card_position into v_card_pos from public.qwiz_room_activity a where a.room_id=p_room;
  if v_card_pos is null or timeline is null then raise exception 'Переход не найден';end if;
  v_next_card:=timeline->(v_card_pos+1);
  if v_next_card is null or v_next_card->>'type'='finale' then
    update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
    delete from public.qwiz_room_activity where room_id=p_room;
  elsif v_next_card->>'type'='round' then
    v_next:=coalesce((v_next_card->>'first_question')::int,r.question_index+1);
    update public.org_next_rooms set phase='countdown',question_index=v_next,ends_at=now()+interval '5 seconds' where id=p_room;
    delete from public.qwiz_room_activity where room_id=p_room;
  else
    insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
      values(p_room,v_card_pos+1,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
      on conflict(room_id) do update set card_position=excluded.card_position,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
    update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
  end if;
 elsif p_action='next' and r.phase='result' then
  v_next:=r.question_index+1;
  if timeline is null then
    if v_next>=jsonb_array_length(v_questions) then
      update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
    else
      q:=v_questions->v_next;
      v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
      update public.org_next_rooms set phase='question',question_index=v_next,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
    end if;
  else
    v_prev_card:=coalesce((v_questions->r.question_index->>'round_index')::int,0);
    if v_next<jsonb_array_length(v_questions) and
     coalesce((v_questions->v_next->>'round_index')::int,0)=v_prev_card then
      q:=v_questions->v_next;
      v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
      update public.org_next_rooms set phase='question',question_index=v_next,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
    else
      v_next_card:=timeline->(v_prev_card+1);
      if v_next_card is null or v_next_card->>'type'='finale' then
       update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
      elsif v_next_card->>'type'='round' then
       update public.org_next_rooms set phase='countdown',question_index=v_next,ends_at=now()+interval '5 seconds' where id=p_room;
      else
       insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
       values(p_room,v_prev_card+1,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
       on conflict(room_id) do update set card_position=excluded.card_position,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
       update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
      end if;
    end if;
  end if;
 else raise exception 'Недопустимое действие для текущего этапа';end if;
 return (select phase from public.org_next_rooms where id=p_room);
end $function$;

CREATE OR REPLACE FUNCTION public.qwiz_answer_display(q jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare kind text:=coalesce(q->>'kind','single'); sol jsonb:=q->'solution'; label text; indices jsonb:='[]'::jsonb;
begin
 if kind='poll' then label:='Голосование завершено';
 elsif kind='multi' then
  indices:=coalesce(sol->'correct_indices','[]'::jsonb);
  select string_agg(q->'options'->>((x.value#>>'{}')::int),' · ' order by x.ordinality) into label
   from jsonb_array_elements(indices) with ordinality x(value,ordinality);
 elsif kind='match' then
  select string_agg((x.value#>>'{}')||' → '||(sol->'matches'->>(x.ordinality::int-1)),'; ' order by x.ordinality) into label
   from jsonb_array_elements(q->'options') with ordinality x(value,ordinality);
 elsif kind in ('order','sequence') then
  select string_agg(x.value,' → ' order by x.ordinality) into label from jsonb_array_elements_text(sol->'order') with ordinality x(value,ordinality);
 elsif kind in ('text','number','estimate','date','riddle','puzzle','blitz') then label:=sol->>'answer';
 elsif kind='hotspot' then label:='Правильная область отмечена на иллюстрации';
 else
  label:=q->'options'->>coalesce((q->>'correct')::int,(sol->>'correct')::int);
  if coalesce(q->'correct',sol->'correct') is not null then indices:=jsonb_build_array(coalesce(q->'correct',sol->'correct'));end if;
 end if;
 return jsonb_build_object('text',coalesce(nullif(label,''),'Ответ не указан'),'explanation',coalesce(q->>'explanation',''),
 'indices',indices,'hotspot',case when kind='hotspot' then jsonb_build_object('x',sol->'x','y',sol->'y','radius',sol->'radius') else null end);
end $function$;

CREATE OR REPLACE FUNCTION public.qwiz_launch_build(p_build uuid, p_title text DEFAULT NULL::text, p_teams integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_build public.qwiz_builds%rowtype; v_card public.qwiz_build_cards%rowtype;
 v_question public.qwiz_bank%rowtype; v_questions jsonb:='[]'::jsonb; v_timeline jsonb:='[]'::jsonb;
 v_n integer; v_skip integer; v_secs integer; v_order text; v_limit integer;
 v_quiz uuid; v_code text; v_room uuid; v_count integer; v_opts jsonb; v_sol jsonb; v_match_choices jsonb;
begin
 v_owner:=(select auth.uid());
 if v_owner is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 if p_teams not between 1 and 15 then raise exception 'Количество команд от 1 до 15'; end if;
 select * into v_build from public.qwiz_builds where id=p_build and owner_id=v_owner;
 if not found then raise exception 'Сборка не найдена'; end if;
 for v_card in select * from public.qwiz_build_cards where build_id=p_build order by position loop
   v_timeline:=v_timeline||jsonb_build_array(jsonb_build_object(
    'type',v_card.card_type,'title',v_card.title,'icon',v_card.icon,
    'settings',v_card.settings,'first_question',jsonb_array_length(v_questions)));
   if v_card.card_type='round' then
     if v_card.topic_id is null then raise exception 'У раунда «%» не выбрана тема',v_card.title; end if;
     v_limit:=greatest(1,least(100,coalesce((v_card.settings->>'count')::integer,5)));
     v_skip:=greatest(0,coalesce((v_card.settings->>'offset')::integer,0));
     v_secs:=greatest(10,least(120,coalesce((v_card.settings->>'seconds')::integer,30)));
     v_order:=coalesce(v_card.settings->>'order','random');
     v_count:=0;
     for v_question in
      select * from public.qwiz_bank b where b.owner_id=v_owner and b.topic_id=v_card.topic_id
       and b.kind in ('single','boolean','multi','match','order','sequence','text','number','date','estimate','riddle','puzzle','blitz','flag','portrait','image','audio','video','map','poll','hotspot')
      order by case when v_order='random' then random() end,
        case when v_order='reverse' then b.created_at end desc,
        case when v_order='sequential' then b.created_at end asc,
        b.id
      limit v_limit offset v_skip
     loop
       
       v_opts:=v_question.options;v_sol:=v_question.solution;v_match_choices:='[]'::jsonb;
       if v_question.kind in ('order','sequence') then
         select coalesce(jsonb_agg(x.val order by x.ordinality desc),'[]'::jsonb)
         into v_opts from jsonb_array_elements(v_question.options) with ordinality as x(val,ordinality);
         v_sol:=v_question.solution||jsonb_build_object('order',v_question.options);
       elsif v_question.kind='match' then
         select coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',1))) order by x.ordinality),'[]'::jsonb),
          coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',2))) order by x.ordinality desc),'[]'::jsonb),
          coalesce(jsonb_agg(to_jsonb(trim(split_part(x.value,'=',2))) order by x.ordinality),'[]'::jsonb)
         into v_opts,v_match_choices,v_sol from jsonb_array_elements_text(v_question.options) with ordinality as x(value,ordinality);
         v_sol:=jsonb_build_object('matches',v_sol);
       end if;
       v_questions:=v_questions||jsonb_build_array(jsonb_build_object(
         'prompt',v_question.prompt,'options',v_opts,'match_choices',v_match_choices, 'solution',v_sol,
         'correct',case when v_sol ? 'correct' then (v_sol->>'correct')::integer else null end,
         'explanation',v_question.explanation,
         'media_url',coalesce(v_question.solution->>'media_url',''),'illustration_url',coalesce(v_question.solution->>'illustration_url',''),
         'answer_duration',greatest(5,least(30,coalesce((v_card.settings->>'answer_seconds')::int,10))),'duration',v_secs,'topic',(select t.name from public.qwiz_topics t where t.id=v_card.topic_id),'round_title',v_card.title,'round_sound',coalesce(v_card.settings->>'sound','fanfare'),'card_type',v_card.card_type,
         'round_index',v_card.position,'kind',v_question.kind));
       v_count:=v_count+1;
     end loop;
     if v_count=0 then raise exception 'Раунд «%»: нет игровых вопросов в выбранной теме',v_card.title;end if;
   end if;
 end loop;
 if jsonb_array_length(v_questions)<1 or jsonb_array_length(v_questions)>100 then raise exception 'Сборка должна содержать 1–100 игровых вопросов'; end if;
 insert into public.org_next_quizzes(owner_id,title,questions)
 values(v_owner,coalesce(nullif(trim(p_title),''),v_build.title),v_questions)
 returning id into v_quiz;
 v_code:=public.org_next_create_room(v_quiz,coalesce(nullif(trim(p_title),''),v_build.title),p_teams);
 select id into v_room from public.org_next_rooms where code=v_code and owner_id=v_owner;
 insert into public.qwiz_room_builds(room_id,build_id,timeline) values(v_room,p_build,v_timeline);
 return jsonb_build_object('code',v_code,'room_id',v_room,'total_questions',jsonb_array_length(v_questions),
   'total_cards',jsonb_array_length(v_timeline));
end $function$;

CREATE OR REPLACE FUNCTION public.qwiz_public_screen(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype;q jsonb;total int;activity jsonb;metrics jsonb;reveal boolean;final_card jsonb;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then raise exception 'Неверный код';end if;
 perform public.qwiz_tick(p_code);
 select * into r from public.org_next_rooms where code=p_code;
 if not found then raise exception 'Комната не найдена';end if;
 select jsonb_array_length(x.questions),case when r.question_index>=0 then x.questions->r.question_index else null end into total,q from public.org_next_quizzes x where x.id=r.quiz_id;
 if r.phase='intermission' then
  select jsonb_build_object('type',a.kind,'title',a.title,'icon','◉','sound',coalesce(a.settings->>'sound','none')) into activity from public.qwiz_room_activity a where a.room_id=r.id;
 elsif r.phase='finished' then
  select rb.timeline->(jsonb_array_length(rb.timeline)-1) into final_card from public.qwiz_room_builds rb where rb.room_id=r.id;
  activity:=jsonb_build_object('type','finale','title',coalesce(final_card->>'title','Финал игры'),'sound',coalesce(final_card->'settings'->>'sound','fanfare'));
 end if;
 reveal:=r.phase in ('result','finished') or coalesce(activity->>'type','') in ('team_stats','player_stats');
 metrics:=public.qwiz_screen_metrics(r.id,r.question_index,reveal,r.phase='finished');
 return jsonb_build_object('code',r.code,'title',r.title,'phase',r.phase,'index',r.question_index,'total',total,
 'server_now',clock_timestamp(),'ends_at',r.ends_at,'duration',case when r.phase='result' then greatest(5,least(30,coalesce((q->>'answer_duration')::int,10))) else coalesce((q->>'duration')::int,30) end,
 'question',case when r.phase in ('question','result') then q-'correct'-'solution'-'explanation' else null end,
 'answer',case when r.phase='result' then public.qwiz_answer_display(q) else null end,
 'activity',activity,'round_sound',q->>'round_sound')||metrics;
end $function$;

CREATE OR REPLACE FUNCTION public.qwiz_record_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q jsonb; secs int; start_time timestamptz; finish_time timestamptz;
begin
 if new.phase in ('question','result') and (old.phase is distinct from new.phase or old.question_index<>new.question_index) then
  select x.questions->new.question_index into q from public.org_next_quizzes x where x.id=new.quiz_id;
  secs:=greatest(10,least(120,coalesce((q->>'duration')::int,30)));
  finish_time:=case when new.phase='question' then new.ends_at else old.ends_at end;
  start_time:=finish_time-make_interval(secs=>secs);
  insert into public.qwiz_question_runs(room_id,question_index,started_at,deadline,duration,answer_duration)
   values(new.id,new.question_index,start_time,finish_time,secs,greatest(5,least(30,coalesce((q->>'answer_duration')::int,10))))
   on conflict(room_id,question_index) do nothing;
  insert into public.qwiz_run_members(room_id,question_index,player_id,team_id)
   select new.id,new.question_index,p.id,p.team_id from public.org_next_players p
   where p.room_id=new.id and public.qwiz_answer_eligible(new.id,p.id,new.question_index)
   on conflict do nothing;
  if new.phase='result' then
   update public.qwiz_question_runs set closed_at=least(clock_timestamp(),deadline),answer_deadline=new.ends_at
    where room_id=new.id and question_index=new.question_index;
  end if;
 elsif new.phase='finished' and old.phase='question' then
  update public.qwiz_question_runs set closed_at=least(clock_timestamp(),deadline)
   where room_id=new.id and question_index=new.question_index;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.qwiz_release_countdown(p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if exists(select 1 from public.org_next_rooms where code=p_code and phase='countdown') then return public.qwiz_tick(p_code);end if;
 return false;
end $function$;

CREATE OR REPLACE FUNCTION public.qwiz_screen_metrics(p_room uuid, p_index integer, p_reveal boolean, p_final boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with records as (
 select m.player_id,m.team_id,m.question_index,r.duration,r.closed_at,a.id answer_id,a.correct,a.points,
  case when a.id is null then r.duration::numeric else
   greatest(0,least(r.duration::numeric,extract(epoch from(a.created_at-r.started_at)))) end elapsed,
  case when a.id is null then 1::numeric else
   greatest(0,least(1::numeric,extract(epoch from(a.created_at-r.started_at))/r.duration)) end normalized
 from public.qwiz_run_members m join public.qwiz_question_runs r using(room_id,question_index)
 left join public.org_next_answers a on a.room_id=m.room_id and a.player_id=m.player_id and a.question_index=m.question_index
 where m.room_id=p_room
), current_team as (
 select team_id,count(*) members,count(answer_id) answered,count(*) filter(where correct) correct,
 avg(elapsed) mean_seconds,avg(normalized) mean_normalized
 from records where question_index=p_index group by team_id
), previous_team as (
 select distinct on(team_id) team_id,avg(normalized) mean_normalized
 from records where question_index<p_index and closed_at is not null
 group by team_id,question_index order by team_id,question_index desc
), all_team as (
 select team_id,avg(normalized) mean_normalized from records where closed_at is not null group by team_id
), team_rows as (
 select t.id,t.name,t.position,t.score,
 coalesce(c.members,(select count(*) from public.org_next_players op where op.team_id=t.id)) members,
 coalesce(c.answered,0) answered,c.correct,round(c.mean_seconds,2) mean_seconds,
 case when p_final then at.mean_normalized else c.mean_normalized end speed,
 case when p_reveal and pt.mean_normalized>0 and c.mean_normalized>0 then round(100*(pt.mean_normalized/c.mean_normalized-1),1) else null end speed_delta,
 row_number() over(order by
  case when p_final then t.score end desc,
  case when p_reveal then case when p_final then at.mean_normalized else c.mean_normalized end end asc nulls last,
  t.position) rank
 from public.org_next_teams t left join current_team c on c.team_id=t.id
 left join previous_team pt on pt.team_id=t.id left join all_team at on at.team_id=t.id where t.room_id=p_room
), player_rows as (
 select op.id,coalesce(nullif(max(sa.nickname),''),nullif(max(sp.nickname),''),'Игрок '||lpad(row_number() over(order by op.joined_at,op.id)::text,2,'0')) nickname,
 op.joined_at,coalesce(sum(a.points),0) score,count(a.id) answers,count(a.id) filter(where a.correct) correct,
 max(case when a.question_index=p_index then a.correct::int else 0 end) latest_correct,
 min(rec.elapsed) filter(where a.question_index=p_index and a.correct) latest_elapsed,
 avg(rec.normalized) filter(where a.correct) mean_correct_time
 from public.org_next_players op
 left join public.org_next_answers a on a.room_id=op.room_id and a.player_id=op.id
 left join records rec on rec.player_id=a.player_id and rec.question_index=a.question_index
 left join public.qwiz_student_accounts sa on sa.id=op.student_account_id
 left join public.qwiz_student_profiles sp on sp.user_id=op.user_id
 where op.room_id=p_room group by op.id
), ranked_players as (
 select *,row_number() over(order by score desc,latest_correct desc,latest_elapsed asc nulls last,mean_correct_time asc nulls last,joined_at,id) rank from player_rows
), question_rows as (
 select r.question_index,q.questions->r.question_index->>'prompt' prompt,count(rec.player_id) participants,
 count(rec.answer_id) answered,count(*) filter(where rec.correct) correct,
 round(100*count(*) filter(where rec.correct)/nullif(count(rec.player_id)::numeric,0),1) correct_rate
 from public.qwiz_question_runs r join public.org_next_rooms room on room.id=r.room_id
 join public.org_next_quizzes q on q.id=room.quiz_id
 left join records rec on rec.question_index=r.question_index
 where r.room_id=p_room and r.closed_at is not null and coalesce(q.questions->r.question_index->>'kind','single')<>'poll'
 group by r.question_index,q.questions
)
select jsonb_build_object(
 'teams',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'position',position,'rank',rank,
 'score',case when p_reveal then score else null end,'members',members,'answered',answered,
 'correct',case when p_reveal then correct else null end,'mean_seconds',case when p_reveal then mean_seconds else null end,
 'speed_delta',speed_delta) order by rank) from team_rows),'[]'::jsonb),
 'players',case when p_reveal then coalesce((select jsonb_agg(jsonb_build_object('nickname',nickname,'score',score,'answers',answers,
 'correct',correct,'latest_seconds',round(latest_elapsed,2),'position',rank) order by rank) from ranked_players),'[]'::jsonb) else '[]'::jsonb end,
 'question_stats',case when p_final then coalesce((select jsonb_agg(jsonb_build_object('index',question_index,'prompt',prompt,
 'participants',participants,'answered',answered,'correct',correct,'incorrect',answered-correct,'unanswered',participants-answered,
  'correct_rate',correct_rate,'incorrect_rate',round(100*incorrect/nullif(participants::numeric,0),1)) order by question_index) from (select *,answered-correct incorrect from question_rows)x),'[]'::jsonb) else '[]'::jsonb end
);
$function$;

CREATE OR REPLACE FUNCTION public.qwiz_stage_deadline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q jsonb; secs int;
begin
 if new.phase='result' and old.phase='question' then
  select x.questions->new.question_index into q from public.org_next_quizzes x where x.id=new.quiz_id;
  secs:=greatest(5,least(30,coalesce((q->>'answer_duration')::int,10)));
  new.ends_at:=clock_timestamp()+make_interval(secs=>secs);
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.qwiz_tick(p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype; q jsonb; secs int;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then return false;end if;
 select * into r from public.org_next_rooms where code=p_code and phase in ('countdown','question','result') and ends_at<=clock_timestamp() for update;
 if not found or r.phase not in ('countdown','question','result') or r.ends_at is null or r.ends_at>clock_timestamp() then return false;end if;
 if r.phase='countdown' then
  select x.questions->r.question_index into q from public.org_next_quizzes x where x.id=r.quiz_id;
  secs:=greatest(10,least(120,coalesce((q->>'duration')::int,30)));
  update public.org_next_rooms set phase='question',ends_at=clock_timestamp()+make_interval(secs=>secs) where id=r.id;
 elsif r.phase='question' then perform public.qwiz_advance_room(r.id,'reveal');
 else perform public.qwiz_advance_room(r.id,'next');end if;
 return true;
end $function$;
drop trigger if exists qwiz_stage_deadline on public.org_next_rooms;
create trigger qwiz_stage_deadline before update on public.org_next_rooms for each row execute function public.qwiz_stage_deadline();
drop trigger if exists qwiz_record_stage on public.org_next_rooms;
create trigger qwiz_record_stage after update on public.org_next_rooms for each row execute function public.qwiz_record_stage();
revoke execute on function public.qwiz_advance_room(uuid,text),public.qwiz_tick(text),public.qwiz_screen_metrics(uuid,integer,boolean,boolean),public.qwiz_answer_display(jsonb),public.qwiz_stage_deadline(),public.qwiz_record_stage() from public,anon,authenticated;
revoke execute on function public.org_next_advance(uuid,text),public.org_next_state(text),public.org_next_create_room(uuid,text,integer),public.qwiz_launch_build(uuid,text,integer) from public,anon;
grant execute on function public.org_next_advance(uuid,text),public.org_next_state(text),public.org_next_create_room(uuid,text,integer),public.qwiz_launch_build(uuid,text,integer) to authenticated;
revoke execute on function public.qwiz_public_screen(text),public.qwiz_release_countdown(text) from public;
grant execute on function public.qwiz_public_screen(text),public.qwiz_release_countdown(text) to anon,authenticated;
-- Only open questions can be backfilled with an exact start timestamp.
insert into public.qwiz_question_runs(room_id,question_index,started_at,deadline,duration,answer_duration)
 select r.id,r.question_index,r.ends_at-make_interval(secs=>greatest(10,least(120,coalesce((q.questions->r.question_index->>'duration')::int,30)))),r.ends_at,
 greatest(10,least(120,coalesce((q.questions->r.question_index->>'duration')::int,30))),greatest(5,least(30,coalesce((q.questions->r.question_index->>'answer_duration')::int,10)))
 from public.org_next_rooms r join public.org_next_quizzes q on q.id=r.quiz_id where r.phase='question' and r.ends_at is not null on conflict do nothing;
insert into public.qwiz_run_members(room_id,question_index,player_id,team_id)
 select r.room_id,r.question_index,p.id,p.team_id from public.qwiz_question_runs r join public.org_next_players p on p.room_id=r.room_id where public.qwiz_answer_eligible(r.room_id,p.id,r.question_index) on conflict do nothing;
commit;
