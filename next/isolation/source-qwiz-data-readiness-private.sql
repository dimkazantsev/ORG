-- After ENABLE-QWIZ-DATA-EXPORT-24H.sql has been run in old GOS.ID.
-- Strictly READ ONLY. Outputs counts and hashes, never student records.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20000ms';
SET LOCAL lock_timeout='2000ms';
DO $verify$
DECLARE permissions int; policies int;
BEGIN
 IF current_user <> 'qwiz_catalog_reader' THEN
   RAISE EXCEPTION 'Wrong reader role';
 END IF;
 SELECT count(*) INTO permissions
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
   AND (left(c.relname,5)='qwiz_' OR left(c.relname,9)='org_next_'
        OR left(c.relname,9)='org_quiz_')
   AND has_table_privilege(current_user,c.oid,'SELECT');
 SELECT count(*) INTO policies
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND p.polname='qwiz_temporary_migration_reader';
 IF permissions<>57 OR policies<>57 THEN
   RAISE EXCEPTION 'Temporary QWIZ access not enabled: % tables, % policies',permissions,policies;
 END IF;
END;
$verify$;
SELECT
 (SELECT count(*) FROM public.qwiz_geo_regions) AS source_geography_count,
 (SELECT count(*) FROM public.qwiz_secret_code_catalog) AS source_secret_code_count,
 (SELECT count(*) FROM public.qwiz_bank) AS source_teacher_bank_count,
 (SELECT count(*) FROM public.org_quiz_questions) AS source_legacy_question_count,
 (SELECT count(*) FROM public.qwiz_run_members) AS source_player_records_count,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]'))
    FROM public.qwiz_geo_regions t) AS geography_digest,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.n)::text,'[]'))
    FROM public.qwiz_secret_code_catalog t) AS secret_code_digest;
COMMIT;
