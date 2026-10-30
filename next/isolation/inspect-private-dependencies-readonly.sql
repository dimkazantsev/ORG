BEGIN READ ONLY;
SET LOCAL statement_timeout='10000ms';
SELECT 'private_relations' AS item,
       c.relkind::text AS kind,
       count(*)::bigint AS total,
       string_agg(c.relname,', ' ORDER BY c.relname) AS object_names
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='quiz_private'
GROUP BY c.relkind
UNION ALL
SELECT 'private_routines' AS item, p.prokind::text AS kind,
       count(*)::bigint AS total,
       string_agg(p.proname, ', ' ORDER BY p.proname) AS object_names
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='quiz_private'
GROUP BY p.prokind
UNION ALL
SELECT 'private_types' AS item, t.typtype::text AS kind,
       count(*)::bigint AS total,
       string_agg(t.typname, ', ' ORDER BY t.typname) AS object_names
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='quiz_private' AND t.typtype IN ('d','e','c')
GROUP BY t.typtype;
COMMIT;
