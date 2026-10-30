-- QWIZ-PARTY / GOS.ID catalog closure inspection.
-- This is READ ONLY. Designed for qwiz_catalog_reader (no user records, no secrets).
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15000ms';
SET LOCAL lock_timeout = '2000ms';
\echo === QWIZ SOURCE CATALOG / SAFE AGGREGATE COUNTS ===
WITH class AS (
 SELECT c.oid,c.relname,c.relkind,c.relrowsecurity,
   CASE WHEN c.relname LIKE 'qwiz_%' THEN 'qwiz'
        WHEN c.relname LIKE 'org_next_%' THEN 'org_next'
        WHEN c.relname LIKE 'org_quiz_%' THEN 'org_quiz'
        ELSE 'other' END AS family
 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public'
)
SELECT family,
  count(*) FILTER(WHERE relkind='r') AS ordinary_tables,
  count(*) FILTER(WHERE relkind='r' AND relrowsecurity) AS rls_tables,
  count(*) FILTER(WHERE relkind IN ('v','m')) AS views,
  count(*) FILTER(WHERE relkind IN ('p','f')) AS partitioned_or_foreign_tables
FROM class
WHERE family <> 'other'
GROUP BY family ORDER BY family;

\echo === FUNCTION COUNTS AND SECURITY DEFINER ===
WITH routine AS (
 SELECT p.oid,p.proname,p.prosecdef,
 CASE WHEN p.proname LIKE 'qwiz_%' THEN 'qwiz'
      WHEN p.proname LIKE 'org_next_%' THEN 'org_next'
      WHEN p.proname LIKE 'org_quiz_%' THEN 'org_quiz'
      WHEN p.proname LIKE 'org_party_%' THEN 'org_party'
      ELSE 'other' END family
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
)
SELECT family,count(*) routines,
       count(*) FILTER(WHERE prosecdef) security_definer
FROM routine WHERE family <> 'other'
GROUP BY family ORDER BY family;

\echo === POLICIES, INDEXES, USER TRIGGERS ===
SELECT
  (SELECT count(*) FROM pg_policy po
     JOIN pg_class c ON c.oid=po.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%' OR c.relname LIKE 'org_quiz_%')) AS policy_count,
  (SELECT count(*) FROM pg_index i
     JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%' OR c.relname LIKE 'org_quiz_%')) AS index_count,
  (SELECT count(*) FROM pg_trigger t
     JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND NOT t.tgisinternal AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%' OR c.relname LIKE 'org_quiz_%')) AS user_triggers;

\echo === FOREIGN KEY CROSS-BOUNDARY DEPENDENCIES ===
WITH fk AS (
 SELECT child.relname AS child, parent.relname AS parent,
        CASE WHEN child.relname LIKE 'qwiz_%' OR child.relname LIKE 'org_next_%' OR child.relname LIKE 'org_quiz_%' THEN true ELSE false END child_quiz,
        CASE WHEN parent.relname LIKE 'qwiz_%' OR parent.relname LIKE 'org_next_%' OR parent.relname LIKE 'org_quiz_%' THEN true ELSE false END parent_quiz,
        cn.nspname AS child_schema, pn.nspname AS parent_schema
 FROM pg_constraint k
 JOIN pg_class child ON child.oid=k.conrelid
 JOIN pg_namespace cn ON cn.oid=child.relnamespace
 JOIN pg_class parent ON parent.oid=k.confrelid
 JOIN pg_namespace pn ON pn.oid=parent.relnamespace
 WHERE k.contype='f'
)
SELECT count(*) FILTER(WHERE child_quiz AND parent_quiz) AS quiz_to_quiz,
       count(*) FILTER(WHERE child_quiz AND NOT parent_quiz) AS quiz_to_external,
       count(*) FILTER(WHERE NOT child_quiz AND parent_quiz) AS external_to_quiz,
       count(*) FILTER(WHERE child_quiz AND parent_schema='auth') AS quiz_to_auth
FROM fk WHERE child_schema='public' OR parent_schema='public';

\echo === ROUTINE TEXT REFERENCES (APPROXIMATION ONLY) ===
WITH q AS (
 SELECT p.proname,p.prosecdef,pg_get_functiondef(p.oid) AS body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
)
SELECT count(*) FILTER(WHERE proname LIKE 'qwiz_%' AND body ILIKE '%org_quiz_%') AS qwiz_functions_referencing_legacy,
       count(*) FILTER(WHERE proname NOT LIKE 'qwiz_%' AND proname NOT LIKE 'org_next_%' AND proname NOT LIKE 'org_quiz_%'
         AND (body ILIKE '%qwiz_%' OR body ILIKE '%org_next_%' OR body ILIKE '%org_quiz_%')) AS external_helpers_referencing_quiz,
       count(*) FILTER(WHERE proname LIKE 'qwiz_%' AND body ILIKE '%storage.%') AS qwiz_functions_referencing_storage
FROM q;

\echo === REALTIME TABLE FAMILY COUNTS ===
SELECT count(*) FILTER(WHERE tablename LIKE 'qwiz_%') AS qwiz_tables,
 count(*) FILTER(WHERE tablename LIKE 'org_next_%') AS org_next_tables,
 count(*) FILTER(WHERE tablename LIKE 'org_quiz_%') AS org_quiz_tables
FROM pg_publication_tables
WHERE pubname='supabase_realtime';

\echo === INSTALLED EXTENSIONS (PUBLIC NAMES ONLY) ===
SELECT extname,extversion FROM pg_extension ORDER BY extname;
COMMIT;
