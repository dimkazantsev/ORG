set local lock_timeout='5s';set local statement_timeout='20s';
-- Team preparation and invitations. All writes serialize on the room row.
alter table public.org_next_rooms add column if not exists team_mode text not null default 'random' check(team_mode in ('random','manual'));
alter table public.org_next_rooms add column if not exists setup_issues jsonb not null default '[]'::jsonb;
alter table public.org_next_players alter column team_id drop not null;
alter table public.org_next_players add column if not exists entry_question integer not null default 0 check(entry_question>=0);



create or replace function public.qwiz_new_team_name(p_room uuid) returns text language sql volatile security definer set search_path='' as $$
 select x.word from unnest(array['Несгибаемые','Космические','Невесомые','Искристые','Парадоксальные','Безмятежные','Сверхзвуковые','Непредсказуемые','Бархатные','Лучезарные','Молниеносные','Таинственные','Неукротимые','Зазеркальные','Фантастические','Невероятные','Шелестящие','Искромётные','Гравитационные','Неслучайные','Лунные','Пружинистые','Невозмутимые','Запредельные','Лавандовые','Непотопляемые','Сумеречные','Пушистые','Ультрамариновые','Звёздные']) as x(word) where not exists(select 1 from public.org_next_teams t where t.room_id=p_room and t.name=x.word) order by random() limit 1
$$;


revoke all on function public.qwiz_new_team_name(uuid) from public,anon,authenticated;

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
 if p_teams is null or p_teams not between 1 and 15 then raise exception 'Число команд: от 1 до 15'; end if;
 if (select count(*) from public.org_next_rooms where owner_id=(select auth.uid()) and phase!='finished')>=10 then raise exception 'Сначала завершите старые комнаты'; end if;
 for i in 1..15 loop
  v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  exit when not exists(select 1 from public.org_next_rooms where code=v_code);
 end loop;
 if exists(select 1 from public.org_next_rooms where code=v_code) then raise exception 'Не удалось создать код'; end if;
 insert into public.org_next_rooms(quiz_id,owner_id,code,title)
 values(p_quiz,(select auth.uid()),v_code,left(trim(coalesce(nullif(p_title,''),'Новая игра')),140)) returning id into v_id;
 for v_n in 1..p_teams loop
  insert into public.org_next_teams(room_id,position,name) values(v_id,v_n,public.qwiz_new_team_name(v_id));
 end loop;
 return v_code;
end $function$
;


CREATE OR REPLACE FUNCTION public.qwiz_compile_build(p_build uuid, p_title text default null, p_allow_empty boolean default false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_build public.qwiz_builds%rowtype; v_card public.qwiz_build_cards%rowtype;
 v_question public.qwiz_bank%rowtype; v_questions jsonb:='[]'::jsonb; v_timeline jsonb:='[]'::jsonb;
 v_n integer; v_skip integer; v_secs integer; v_order text; v_limit integer;
 v_quiz uuid; v_code text; v_room uuid; v_count integer; v_opts jsonb; v_sol jsonb; v_match_choices jsonb; v_missing jsonb:='[]'::jsonb;
begin
 v_owner:=(select auth.uid());
 if v_owner is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав'; end if;
 
 select * into v_build from public.qwiz_builds where id=p_build and owner_id=v_owner;
 if not found then raise exception 'Сборка не найдена'; end if;
 for v_card in select * from public.qwiz_build_cards where build_id=p_build order by position loop
   v_timeline:=v_timeline||jsonb_build_array(jsonb_build_object(
    'type',v_card.card_type,'title',v_card.title,'icon',v_card.icon,
    'settings',v_card.settings,'first_question',jsonb_array_length(v_questions)));
   if v_card.card_type='round' then
     if v_card.topic_id is null then
      v_missing:=v_missing||jsonb_build_array(jsonb_build_object('title',v_card.title,'topic_id',null,'reason','Не выбрана тема'));continue;
     end if;
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
     if v_count=0 then v_missing:=v_missing||jsonb_build_array(jsonb_build_object('title',v_card.title,'topic_id',v_card.topic_id,'reason','Нет игровых вопросов с выбранного номера'));end if;
   end if;
 end loop;
 if jsonb_array_length(v_questions)>100 then raise exception 'В сборке не больше 100 игровых вопросов';end if;
 if jsonb_array_length(v_questions)=0 and v_missing='[]'::jsonb then
  v_missing:=jsonb_build_array(jsonb_build_object('title','Сборка','reason','Добавьте раунд с вопросами'));end if;
 if not p_allow_empty and v_missing<>'[]'::jsonb then raise exception 'Сборка ещё не готова: % — %',v_missing->0->>'title',v_missing->0->>'reason';end if;
 return jsonb_build_object('title',coalesce(nullif(trim(p_title),''),v_build.title),'questions',v_questions,'timeline',v_timeline,'issues',v_missing);
end $function$;


revoke all on function public.qwiz_compile_build(uuid,text,boolean) from public,anon,authenticated;

create or replace function public.qwiz_prepare_room(p_build uuid,p_title text default null,p_teams integer default 4)
returns jsonb language plpgsql security definer set search_path='' as $$
declare compiled jsonb;quiz_id uuid;room_id uuid;room_code text;
begin
 if p_teams is null or p_teams not between 1 and 15 then raise exception 'Количество команд: от 1 до 15';end if;
 compiled:=public.qwiz_compile_build(p_build,p_title,true);
 insert into public.org_next_quizzes(owner_id,title,questions) values((select auth.uid()),compiled->>'title',compiled->'questions') returning id into quiz_id;
 room_code:=public.org_next_create_room(quiz_id,compiled->>'title',p_teams);
 select r.id into room_id from public.org_next_rooms r where r.code=room_code and r.owner_id=(select auth.uid());
 insert into public.qwiz_room_builds(room_id,build_id,timeline) values(room_id,p_build,compiled->'timeline');
 update public.org_next_rooms r set setup_issues=compiled->'issues' where r.id=room_id;
 return jsonb_build_object('code',room_code,'room_id',room_id,'total_questions',jsonb_array_length(compiled->'questions'),'issues',compiled->'issues');
end $$;


revoke all on function public.qwiz_prepare_room(uuid,text,integer) from public,anon,authenticated;


