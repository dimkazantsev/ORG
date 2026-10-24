-- A question asking to recognize a pictured flag must never lose its image.
-- Existing memory questions remain in the bank, but are visually available
-- for the full question interval, as requested by the moderator.
-- Changing this immutable-style view does not modify scores, rooms or bank rows.
CREATE OR REPLACE FUNCTION public.qwiz_flag_memory_view(q jsonb, p_phase text, p_ends timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=''
AS $flag$
BEGIN
  RETURN q;
END
$flag$;

-- For picture-choice questions, deliver the correct image in the ANSWER
-- reveal (result phase only). Never include image_url in question-phase answer.
CREATE OR REPLACE FUNCTION public.qwiz_answer_display(q jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $answer$
DECLARE kind text:=coalesce(q->>'kind','single');
        sol jsonb:=q->'solution';
        label text;
        indices jsonb:='[]'::jsonb;
        answer_index int:=coalesce((q->>'correct')::int,(sol->>'correct')::int);
        image_url text;
BEGIN
 IF kind='poll' THEN label:='Голосование завершено';
 ELSIF kind='multi' THEN
  indices:=coalesce(sol->'correct_indices','[]'::jsonb);
  SELECT string_agg(coalesce(sol->'option_labels'->>((x.value#>>'{}')::int),q->'options'->>((x.value#>>'{}')::int)),' · ' ORDER BY x.ordinality) INTO label
  FROM jsonb_array_elements(indices) WITH ORDINALITY x(value,ordinality);
 ELSIF kind='match' THEN
  SELECT string_agg((x.value#>>'{}')||' → '||(sol->'matches'->>(x.ordinality::int-1)),'; ' ORDER BY x.ordinality) INTO label
  FROM jsonb_array_elements(q->'options') WITH ORDINALITY x(value,ordinality);
 ELSIF kind IN ('order','sequence') THEN
  SELECT string_agg(x.value,' → ' ORDER BY x.ordinality) INTO label
  FROM jsonb_array_elements_text(sol->'order') WITH ORDINALITY x(value,ordinality);
 ELSIF kind IN ('text','number','estimate','date','riddle','puzzle','blitz') THEN label:=sol->>'answer';
 ELSIF kind='hotspot' THEN label:='Правильная область отмечена на иллюстрации';
 ELSE
  IF jsonb_typeof(q->'options'->answer_index)='object' THEN
   label:=coalesce(sol->'option_labels'->>answer_index,q->'options'->answer_index->>'label');
   -- Only a concrete flag URL is eligible for an image answer.
   IF (q->'options'->answer_index->>'image_url') ~ '^https://[^[:space:]]+[.]svg([?][^[:space:]]*)?$' THEN
    image_url:=q->'options'->answer_index->>'image_url';
   END IF;
  ELSE label:=q->'options'->>answer_index;
  END IF;
  IF answer_index IS NOT NULL THEN indices:=jsonb_build_array(answer_index);END IF;
 END IF;
 RETURN jsonb_build_object(
  'text',coalesce(nullif(label,''),'Ответ не указан'),
  'image_url',image_url,
  'explanation',coalesce(q->>'explanation',''),
  'sources',coalesce(sol->'source_urls','[]'::jsonb),
  'indices',indices,
  'hotspot',CASE WHEN kind='hotspot' THEN jsonb_build_object('x',sol->'x','y',sol->'y','radius',sol->'radius') ELSE null END);
END
$answer$;
