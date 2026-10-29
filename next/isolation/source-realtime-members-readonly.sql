BEGIN READ ONLY;
SET LOCAL statement_timeout='10000ms';
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname='supabase_realtime'
AND schemaname='public'
AND (tablename LIKE 'qwiz_%' OR tablename LIKE 'org_next_%' OR tablename LIKE 'org_quiz_%')
ORDER BY schemaname,tablename;
COMMIT;
