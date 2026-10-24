-- Geography of Russia: 178 standalone quiz questions grounded exclusively
-- in the existing 89-row qwiz_geo_regions registry. No invented geographic facts.
-- Two standard, server-scored multiple-choice mechanics per region:
-- administrative centre and federal district. Interactive map tasks remain
-- server-generated separately via qwiz_geo_play, not falsely counted as bank rows.
-- Idempotent tags protect custom teacher questions and existing flag data.
WITH facts AS (
 SELECT t.owner_id, t.id topic_id, r.id region_id, r.name region_name,
        r.capital, r.fd, m.mode,
        CASE WHEN m.mode='capital' THEN r.capital ELSE r.fd END AS answer,
        CASE WHEN m.mode='capital'
          THEN 'Какой город является административным центром субъекта РФ «'||r.name||'»?'
          ELSE 'К какому федеральному округу относится субъект РФ «'||r.name||'»?' END AS prompt,
        CASE WHEN m.mode='capital'
          THEN 'Административный центр субъекта РФ «'||r.name||'» — '||r.capital||'.'
          ELSE 'Субъект РФ «'||r.name||'» относится к федеральному округу '||r.fd||'.' END AS explanation
 FROM public.qwiz_geo_regions r
 JOIN public.qwiz_topics t ON t.name='География России'
 CROSS JOIN (VALUES('capital'),('district')) m(mode)
), expanded AS (
 SELECT f.*, d.wrong_answers,
        ascii(substr(md5(f.region_id||':'||f.mode),1,1)) % 4 AS correct_index
 FROM facts f
 CROSS JOIN LATERAL (
   SELECT array_agg(s.value ORDER BY s.order_key) AS wrong_answers
   FROM (
     SELECT u.value, md5(f.region_id||':'||f.mode||':'||u.value) AS order_key
     FROM (
       SELECT DISTINCT CASE WHEN f.mode='capital' THEN other.capital ELSE other.fd END AS value
       FROM public.qwiz_geo_regions other
     ) u
     WHERE u.value <> f.answer
     ORDER BY order_key LIMIT 3
   ) s
 ) d
), bank_rows AS (
 SELECT e.*,
   (SELECT jsonb_agg(
      CASE WHEN positions.n=e.correct_index
        THEN to_jsonb(e.answer)
        ELSE to_jsonb(e.wrong_answers[CASE WHEN positions.n<e.correct_index
             THEN positions.n+1 ELSE positions.n END])
      END ORDER BY positions.n)
    FROM generate_series(0,3) AS positions(n)) AS answer_options
 FROM expanded e
)
INSERT INTO public.qwiz_bank
  (owner_id,topic_id,kind,prompt,options,solution,explanation,difficulty,tags)
SELECT b.owner_id,b.topic_id,'single',b.prompt,b.answer_options,
  jsonb_build_object('correct',b.correct_index,'geo_mode',b.mode,'geo_region_id',b.region_id),
  b.explanation,CASE WHEN b.mode='capital' THEN 2 ELSE 3 END,
  ARRAY['geo:verified:v1','geo:mode:'||b.mode,'geo:region:'||b.region_id]::text[]
FROM bank_rows b
WHERE jsonb_array_length(b.answer_options)=4
  AND NOT EXISTS (
    SELECT 1 FROM public.qwiz_bank already
    WHERE already.owner_id=b.owner_id
      AND 'geo:verified:v1'=ANY(already.tags)
      AND 'geo:mode:'||b.mode=ANY(already.tags)
      AND 'geo:region:'||b.region_id=ANY(already.tags)
  );
-- Read-only, moderator-restricted pagination for real geography questions.
CREATE OR REPLACE FUNCTION public.qwiz_geo_questions(
 p_search text DEFAULT '',p_mode text DEFAULT '',p_sort text DEFAULT 'newest',
 p_offset integer DEFAULT 0,p_limit integer DEFAULT 25
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $geo$
DECLARE v_user uuid; v_search text; v_mode text; v_total integer; v_items jsonb;
BEGIN
 v_user:=(SELECT auth.uid());
 IF v_user IS NULL OR NOT public.org_quiz_is_admin_check() THEN
   RAISE EXCEPTION 'Недостаточно прав';
 END IF;
 v_search:=left(trim(coalesce(p_search,'')),90);
 v_mode:=coalesce(p_mode,'');
 IF v_mode NOT IN ('','capital','district','locate','identify','flag','silhouette','neighbour','detective')
 THEN RAISE EXCEPTION 'Неизвестная механика географии'; END IF;
 IF p_sort NOT IN ('newest','oldest','difficulty') THEN RAISE EXCEPTION 'Неизвестная сортировка'; END IF;
 SELECT count(*)::integer INTO v_total
 FROM public.qwiz_bank q JOIN public.qwiz_topics t ON t.id=q.topic_id
 WHERE q.owner_id=v_user AND t.owner_id=v_user AND t.name='География России'
 AND (v_mode='' OR q.solution->>'geo_mode'=v_mode)
 AND (v_search='' OR q.prompt ILIKE '%'||v_search||'%'
  OR q.explanation ILIKE '%'||v_search||'%');
 SELECT coalesce(jsonb_agg(qdata.data ORDER BY qdata.ord),'[]'::jsonb) INTO v_items
 FROM (
   SELECT jsonb_build_object('id',q.id,'topic_id',q.topic_id,'prompt',q.prompt,
      'kind',q.kind,'options',q.options,'solution',q.solution,'explanation',q.explanation,
      'difficulty',q.difficulty,'tags',q.tags) AS data,
      row_number() OVER (ORDER BY
         CASE WHEN p_sort='oldest' THEN q.created_at END ASC NULLS LAST,
         CASE WHEN p_sort='difficulty' THEN q.difficulty END DESC NULLS LAST,
         q.created_at DESC,q.id) AS ord
   FROM public.qwiz_bank q JOIN public.qwiz_topics t ON t.id=q.topic_id
   WHERE q.owner_id=v_user AND t.owner_id=v_user AND t.name='География России'
   AND (v_mode='' OR q.solution->>'geo_mode'=v_mode)
   AND (v_search='' OR q.prompt ILIKE '%'||v_search||'%'
     OR q.explanation ILIKE '%'||v_search||'%')
   ORDER BY ord
   LIMIT greatest(1,least(100,coalesce(p_limit,25)))
   OFFSET greatest(0,least(100000,coalesce(p_offset,0)))
 ) qdata;
 RETURN jsonb_build_object('total',v_total,'items',v_items);
END
$geo$;
REVOKE ALL ON FUNCTION public.qwiz_geo_questions(text,text,text,integer,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qwiz_geo_questions(text,text,text,integer,integer) TO authenticated;
