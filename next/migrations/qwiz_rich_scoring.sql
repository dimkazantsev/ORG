-- Unified server-side scoring for the supported QWIZ question formats.
-- Does not modify legacy ORG or ГОС.ID data.
begin;
create table if not exists public.qwiz_answer_details(
 answer_id uuid primary key references public.org_next_answers(id) on delete cascade,
 response jsonb not null check(jsonb_typeof(response)='object')
);
alter table public.qwiz_answer_details enable row level security;
revoke all on public.qwiz_answer_details from public,anon,authenticated;

create or replace function public.qwiz_normalize_answer(p_text text)
returns text language sql immutable set search_path='' as $$
 select regexp_replace(lower(btrim(coalesce(p_text,''))),'\s+',' ','g')
$$;
revoke execute on function public.qwiz_normalize_answer(text) from public,anon;
grant execute on function public.qwiz_normalize_answer(text) to authenticated;

create or replace function public.qwiz_validate_question(p_kind text,p_options jsonb,p_solution jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare n int; a jsonb; idx int; v text;
begin
 if jsonb_typeof(p_options)<>'array' or jsonb_typeof(p_solution)<>'object' then return false;end if;
 n:=jsonb_array_length(p_options);
 if p_kind in ('single','boolean','flag','portrait','image','audio','video','map','poll') then
  if n not between 2 and 6 then return false;end if;
  if p_kind='poll' then return true;end if;
  return jsonb_typeof(p_solution->'correct')='number'
      and (p_solution->>'correct')::int between 0 and n-1;
 elsif p_kind='multi' then
  if n not between 2 and 6 or jsonb_typeof(p_solution->'correct_indices')<>'array'
     or jsonb_array_length(p_solution->'correct_indices')<1 then return false;end if;
  for a in select value from jsonb_array_elements(p_solution->'correct_indices') loop
   if jsonb_typeof(a)<>'number' then return false;end if;
   idx:=(a#>>'{}')::integer;
   if idx not between 0 and n-1 then return false;end if;
  end loop;
  return true;
 elsif p_kind='match' then
  if n not between 2 and 12 then return false;end if;
  for a in select value from jsonb_array_elements(p_options) loop
   if jsonb_typeof(a)<>'string' then return false;end if;
   v:=a#>>'{}';
   if position('=' in v)<2 or length(btrim(split_part(v,'=',2)))<1 then return false;end if;
  end loop;
  return true;
 elsif p_kind in ('order','sequence') then return n between 2 and 12;
 elsif p_kind in ('text','riddle','puzzle','blitz','number','date','estimate') then
  return length(btrim(coalesce(p_solution->>'answer','')))>0;
 elsif p_kind='hotspot' then
  return jsonb_typeof(p_solution->'x')='number' and jsonb_typeof(p_solution->'y')='number'
   and jsonb_typeof(p_solution->'radius')='number'
   and (p_solution->>'x')::numeric between 0 and 100
   and (p_solution->>'y')::numeric between 0 and 100
   and (p_solution->>'radius')::numeric between 0.1 and 100
   and coalesce(p_solution->>'media_url','') ~ '^https://';
 end if;
 return false;
end $$;
revoke execute on function public.qwiz_validate_question(text,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.qwiz_question_integrity()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not public.qwiz_validate_question(new.kind,new.options,new.solution) then
  raise exception 'Не заполнен правильный ответ или неверные варианты для типа %',new.kind;
 end if;
 return new;
end $$;
revoke execute on function public.qwiz_question_integrity() from public,anon,authenticated;
drop trigger if exists qwiz_question_integrity_check on public.qwiz_bank;
create trigger qwiz_question_integrity_check before insert or update of kind,options,solution on public.qwiz_bank
 for each row execute function public.qwiz_question_integrity();

create or replace function public.qwiz_submit_answer(p_room uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room public.org_next_rooms%rowtype;v_player public.org_next_players%rowtype;
 q jsonb; sol jsonb; kind text; v_correct boolean:=false; v_points integer:=0; a_id uuid;
 v_index integer; v_idx jsonb; expected text[]; supplied text[]; v_ans text; target numeric; actual numeric;
 xp numeric; yp numeric;
begin
 if (select auth.uid()) is null then raise exception 'Необходим вход';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>4096
 then raise exception 'Некорректный формат ответа';end if;
 select * into v_room from public.org_next_rooms where id=p_room for share;
 if not found or v_room.phase<>'question' or v_room.ends_at<=now() then raise exception 'Время ответа завершено';end if;
 select * into v_player from public.org_next_players p
  where p.room_id=p_room and (p.user_id=(select auth.uid()) or exists(
   select 1 from public.qwiz_player_device_access d where d.room_id=p_room and d.player_id=p.id and d.user_id=(select auth.uid())))
 limit 1;
 if not found then raise exception 'Участник не найден';end if;
 if not public.qwiz_answer_eligible(p_room,v_player.id,v_room.question_index) then
  raise exception 'Этот раунд вам недоступен';end if;
 select questions->v_room.question_index into q from public.org_next_quizzes where id=v_room.quiz_id;
 if q is null then raise exception 'Вопрос отсутствует';end if;
 kind:=coalesce(q->>'kind','single');
 sol:=coalesce(q->'solution',jsonb_build_object('correct',q->'correct'));
 if kind in ('single','boolean','flag','portrait','image','audio','video','map','poll') then
  if jsonb_typeof(p_payload->'index')<>'number' then raise exception 'Выберите вариант ответа';end if;
  v_index:=(p_payload->>'index')::int;
  if v_index not between 0 and jsonb_array_length(q->'options')-1 then raise exception 'Неверный вариант';end if;
  if kind<>'poll' then v_correct:=v_index=(q->>'correct')::int;end if;
 elsif kind='multi' then
  if jsonb_typeof(p_payload->'indices')<>'array' or jsonb_array_length(p_payload->'indices')>6
    or jsonb_array_length(p_payload->'indices')<1 then raise exception 'Выберите правильные варианты';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'indices') x
      where jsonb_typeof(x.value)<>'number' or (x.value#>>'{}')::integer not between 0 and jsonb_array_length(q->'options')-1)
   then raise exception 'Некорректные варианты';end if;
  select array_agg((x.value#>>'{}')::text order by (x.value#>>'{}')::int) into supplied from
   (select distinct value from jsonb_array_elements(p_payload->'indices'))x;
  select array_agg((x.value#>>'{}')::text order by (x.value#>>'{}')::int) into expected from
   (select distinct value from jsonb_array_elements(sol->'correct_indices'))x;
  v_correct:=supplied=expected;
 elsif kind in ('order','sequence','match') then
  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')<>jsonb_array_length(q->'options')
  then raise exception 'Заполните все позиции';end if;
  if kind='match' then
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into supplied from jsonb_array_elements(p_payload->'items') with ordinality x(value,ordinality);
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into expected from jsonb_array_elements(sol->'matches') with ordinality x(value,ordinality);
  else
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into supplied from jsonb_array_elements(p_payload->'items') with ordinality x(value,ordinality);
   select array_agg(public.qwiz_normalize_answer(x.value#>>'{}') order by x.ordinality)
    into expected from jsonb_array_elements(sol->'order') with ordinality x(value,ordinality);
  end if;
  v_correct:=supplied=expected;
 elsif kind in ('text','riddle','puzzle','blitz','date') then
  v_ans:=public.qwiz_normalize_answer(left(p_payload->>'text',200));
  if v_ans='' then raise exception 'Введите ответ';end if;
  v_correct:=v_ans=public.qwiz_normalize_answer(sol->>'answer');
  if not v_correct and jsonb_typeof(sol->'alternatives')='array' then
   v_correct:=exists(select 1 from jsonb_array_elements_text(sol->'alternatives') x
    where public.qwiz_normalize_answer(x.value)=v_ans);
  end if;
 elsif kind in ('number','estimate') then
  if coalesce(p_payload->>'text','') !~ '^-?[0-9]+([.,][0-9]+)?$' then raise exception 'Введите число';end if;
  actual:=replace(p_payload->>'text',',','.')::numeric;
  target:=replace(sol->>'answer',',','.')::numeric;
  v_correct:=abs(actual-target)<=greatest(0,least(1000000,coalesce(nullif(sol->>'tolerance','')::numeric,0)));
 elsif kind='hotspot' then
  if jsonb_typeof(p_payload->'x')<>'number' or jsonb_typeof(p_payload->'y')<>'number' then raise exception 'Нажмите на изображение';end if;
  xp:=(p_payload->>'x')::numeric;yp:=(p_payload->>'y')::numeric;
  if xp not between 0 and 100 or yp not between 0 and 100 then raise exception 'Неверные координаты';end if;
  v_correct:=(xp-(sol->>'x')::numeric)^2+(yp-(sol->>'y')::numeric)^2 <= ((sol->>'radius')::numeric)^2;
 else raise exception 'Тип пока не поддерживает игровые ответы';end if;
 v_points:=case when v_correct then 100 else 0 end;
 insert into public.org_next_answers(room_id,player_id,question_index,choice,correct,points)
 values(p_room,v_player.id,v_room.question_index,
   case when kind in ('single','boolean','flag','portrait','image','audio','video','map','poll') then v_index else 0 end,
   v_correct,v_points)
 on conflict(room_id,player_id,question_index) do nothing returning id into a_id;
 if a_id is null then raise exception 'Ответ уже принят';end if;
 insert into public.qwiz_answer_details(answer_id,response) values(a_id,p_payload);
 if v_points>0 then update public.org_next_teams set score=score+v_points where id=v_player.team_id and room_id=p_room;end if;
 return jsonb_build_object('accepted',true);
end $$;
revoke execute on function public.qwiz_submit_answer(uuid,jsonb) from public,anon;
grant execute on function public.qwiz_submit_answer(uuid,jsonb) to authenticated;
commit;