-- Catalog-only inventory of QWIZ data export permissions on GOS.ID.
-- No user data, secrets, or auth.users records are read.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10000ms';
SELECT
 count(*) FILTER (WHERE n.nspname='public') AS qwiz_public_tables,
 count(*) FILTER (WHERE n.nspname='public' AND has_schema_privilege(current_user,n.oid,'USAGE')) AS public_schema_visible,
 count(*) FILTER (WHERE n.nspname='public' AND has_table_privilege(current_user,c.oid,'SELECT')) AS readable_public_tables,
 count(*) FILTER (WHERE n.nspname='quiz_private') AS private_tables,
 count(*) FILTER (WHERE n.nspname='quiz_private' AND has_table_privilege(current_user,c.oid,'SELECT')) AS readable_private_tables,
 current_user AS technical_role
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND
 ((n.nspname='public' AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%' OR c.relname LIKE 'org_quiz_%'))
 OR (n.nspname='quiz_private' AND c.relname IN ('org_quiz_keys','qwiz_flags_reset_archive_20261022')));
SELECT 'catalog_auth_objects' AS category,
 count(*) AS objects,
 count(*) FILTER (WHERE has_table_privilege(current_user,c.oid,'SELECT')) AS selected_allowed
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='auth' AND c.relname IN ('users','identities')
UNION ALL
SELECT 'catalog_storage_objects',count(*),
count(*) FILTER (WHERE has_table_privilege(current_user,c.oid,'SELECT'))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='storage' AND c.relname IN ('buckets','objects');
SELECT c.relname AS table_name,has_table_privilege(current_user,c.oid,'SELECT') AS can_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
AND (c.relname IN ('qwiz_bank','qwiz_geo_regions','org_quiz_questions','qwiz_run_members','org_quiz_sessions','qwiz_secret_code_catalog'))
ORDER BY c.relname;
COMMIT;
