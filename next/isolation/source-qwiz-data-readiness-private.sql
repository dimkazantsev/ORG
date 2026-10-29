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
    FROM public.qwiz_secret_code_catalog t) AS secret_code_digest,
 (SELECT count(*) FROM (
     SELECT user_id AS uid FROM public.org_next_players WHERE user_id IS NOT NULL
     UNION SELECT owner_id FROM public.org_next_quizzes WHERE owner_id IS NOT NULL
     UNION SELECT owner_id FROM public.org_next_rooms WHERE owner_id IS NOT NULL
     UNION SELECT user_id FROM public.org_quiz_participants WHERE user_id IS NOT NULL
     UNION SELECT created_by FROM public.org_quiz_sessions WHERE created_by IS NOT NULL
     UNION SELECT created_by FROM public.org_quiz_sets WHERE created_by IS NOT NULL
     UNION SELECT owner_id FROM public.qwiz_archived_rooms WHERE owner_id IS NOT NULL
     UNION SELECT owner_id FROM public.qwiz_bank WHERE owner_id IS NOT NULL
     UNION SELECT owner_id FROM public.qwiz_builds WHERE owner_id IS NOT NULL
     UNION SELECT user_id FROM public.qwiz_player_device_access WHERE user_id IS NOT NULL
     UNION SELECT user_id FROM public.qwiz_student_links WHERE user_id IS NOT NULL
     UNION SELECT user_id FROM public.qwiz_student_profiles WHERE user_id IS NOT NULL
     UNION SELECT owner_id FROM public.qwiz_topics WHERE owner_id IS NOT NULL
  ) source_qwiz_auth_ids) AS distinct_required_auth_user_ids;
COMMIT;
