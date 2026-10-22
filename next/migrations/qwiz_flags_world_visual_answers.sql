-- Flags of the World: safe readable reveal of image-based answer choices.
-- Non-destructive, preserves legacy types and scoring.
-- Apply after 20261022_question_stage.sql and any subsequent answer-display migrations.
begin;
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
  -- Flag-picker answer options may be image records rather than strings.
  -- Reveal only the human-reviewed country label, never serialized JSON.
  if jsonb_typeof(q->'options'->coalesce((q->>'correct')::int,(sol->>'correct')::int))='object' then
    label:=coalesce(
      sol->'option_labels'->>coalesce((q->>'correct')::int,(sol->>'correct')::int),
      q->'options'->coalesce((q->>'correct')::int,(sol->>'correct')::int)->>'label'
    );
  else
    label:=q->'options'->>coalesce((q->>'correct')::int,(sol->>'correct')::int);
  end if;
  if coalesce(q->'correct',sol->'correct') is not null then indices:=jsonb_build_array(coalesce(q->'correct',sol->'correct'));end if;
 end if;
 return jsonb_build_object('text',coalesce(nullif(label,''),'Ответ не указан'),'explanation',coalesce(q->>'explanation',''),
 'indices',indices,'hotspot',case when kind='hotspot' then jsonb_build_object('x',sol->'x','y',sol->'y','radius',sol->'radius') else null end);
end $function$;
-- Assert readable display for image choices (without writing fixtures).
do $verify$
declare v_label text;
begin
  select public.qwiz_answer_display(jsonb_build_object(
    'kind','flag','options',jsonb_build_array(
       jsonb_build_object('image_url','https://example.com/fr.svg'),
       jsonb_build_object('image_url','https://example.com/de.svg')),
    'correct',1,'solution',jsonb_build_object('correct',1,'option_labels',jsonb_build_array('Франция','Германия')))) ->> 'text' into v_label;
  if v_label is distinct from 'Германия' then raise exception 'Ошибка раскрытия ответа-картинки: %',v_label;end if;
end $verify$;
commit;
