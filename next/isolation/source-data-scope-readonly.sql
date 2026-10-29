BEGIN READ ONLY;
SET LOCAL statement_timeout='12000ms';
SET LOCAL lock_timeout='2000ms';
\echo === QWIZ DATA TRANSFER / CATALOG ESTIMATES ONLY (NOT ACTUAL ROW COUNTS) ===
SELECT c.relname AS table_name,
 greatest(c.reltuples::bigint,0) AS estimated_rows,
 pg_size_pretty(pg_total_relation_size(c.oid)) AS estimated_storage
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
 AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%' OR c.relname LIKE 'org_quiz_%')
ORDER BY c.reltuples DESC,c.relname
LIMIT 25;

\echo === FOREIGN KEYS TO AUTH BY REFERENCING TABLE/COLUMN ===
SELECT c.relname AS game_table,
  (SELECT string_agg(a.attname,', ' ORDER BY v.ordinal)
   FROM unnest(k.conkey) WITH ORDINALITY v(attnum,ordinal)
   JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=v.attnum) AS source_columns,
  tgt.relname AS auth_reference,
  k.conname AS constraint_name
FROM pg_constraint k
JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
JOIN pg_class tgt ON tgt.oid=k.confrelid JOIN pg_namespace tn ON tn.oid=tgt.relnamespace
WHERE k.contype='f' AND cn.nspname='public' AND tn.nspname='auth'
 AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%' OR c.relname LIKE 'org_quiz_%')
ORDER BY c.relname,k.conname;
COMMIT;
