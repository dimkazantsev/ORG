-- GOS.ID ONLY: remove temporary QWIZ game-data export permissions.
-- Use after secure migration or immediately if the operation is cancelled.
-- Does not delete or update game data. Safe to re-run.
BEGIN;
DO $qwiz_cleanup$
DECLARE t record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='qwiz_catalog_reader') THEN
    RAISE EXCEPTION 'Restricted reader role is absent, refusing cleanup';
  END IF;
  FOR t IN SELECT c.relname
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind='r'
      AND (left(c.relname,5)='qwiz_' OR left(c.relname,9)='org_next_'
           OR left(c.relname,9)='org_quiz_')
    ORDER BY c.relname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS qwiz_temporary_migration_reader ON public.%I',t.relname);
    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM qwiz_catalog_reader',t.relname);
  END LOOP;
END;
$qwiz_cleanup$;
COMMIT;

SELECT count(*) AS remaining_temporary_policies
FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND p.polname='qwiz_temporary_migration_reader';
-- Expected: 0. Catalog-only access to PostgreSQL metadata remains intact.
