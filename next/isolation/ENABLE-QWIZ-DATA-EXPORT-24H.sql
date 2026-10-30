-- GOS.ID ONLY: temporary, time-limited SELECT of exactly 57 QWIZ public tables.
-- Run in the OLD Supabase project bderfrcfuhnutuoyudje SQL Editor.
-- Do NOT run in the new QWIZ Free project.
-- This changes NO game rows and grants NO Auth/Storage/private schema access.
-- The role's existing GitHub credential works; NO password or secret is needed.
-- Remove permissions with REVOKE-QWIZ-DATA-EXPORT.sql after migration.
BEGIN;
DO $qwiz_migration$
DECLARE
  t record;
  n int;
  expiry timestamptz := clock_timestamp() + interval '24 hours';
  role_id oid;
BEGIN
  SELECT oid INTO role_id FROM pg_roles WHERE rolname='qwiz_catalog_reader'
     AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
     AND NOT rolcreatedb;
  IF role_id IS NULL THEN
    RAISE EXCEPTION 'Refusing: restricted role qwiz_catalog_reader missing or privileged';
  END IF;
  IF current_database()<>'postgres' THEN
    RAISE EXCEPTION 'Unexpected source database';
  END IF;
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind='r'
      AND (left(c.relname,5)='qwiz_' OR left(c.relname,9)='org_next_'
           OR left(c.relname,9)='org_quiz_');
  IF n<>57 THEN
    RAISE EXCEPTION 'Expected 57 QWIZ tables, got %; refusing',n;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind='r'
      AND (left(c.relname,5)='qwiz_' OR left(c.relname,9)='org_next_'
           OR left(c.relname,9)='org_quiz_')
      AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Found game table without enabled RLS: refusing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public'
      AND p.polname='qwiz_temporary_migration_reader'
  ) THEN
    RAISE EXCEPTION 'Temporary QWIZ policy already installed: use cleanup/review before rerun';
  END IF;

  -- USAGE and SELECT are limited to these exact QWIZ-owned public tables.
  -- Existing 57 tables stay in place, with all current policies unchanged.
  GRANT USAGE ON SCHEMA public TO qwiz_catalog_reader;
  FOR t IN SELECT c.relname
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind='r'
      AND (left(c.relname,5)='qwiz_' OR left(c.relname,9)='org_next_'
           OR left(c.relname,9)='org_quiz_')
    ORDER BY c.relname
  LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO qwiz_catalog_reader',t.relname);
    EXECUTE format(
       'CREATE POLICY qwiz_temporary_migration_reader ON public.%I FOR SELECT TO qwiz_catalog_reader USING (CURRENT_TIMESTAMP < %L::timestamptz)',
       t.relname, expiry
    );
  END LOOP;
END;
$qwiz_migration$;
COMMIT;

-- Read-only confirmation: no personal records or passwords.
SELECT count(*) AS temporary_policies,
  count(*) FILTER (WHERE has_table_privilege('qwiz_catalog_reader',c.oid,'SELECT')) AS granted_tables
FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid=c.oid
  AND p.polname='qwiz_temporary_migration_reader'
WHERE ns.nspname='public' AND c.relkind='r'
  AND (left(c.relname,5)='qwiz_' OR left(c.relname,9)='org_next_'
       OR left(c.relname,9)='org_quiz_')
  AND p.oid IS NOT NULL;
-- Expected: 57 temporary_policies, 57 granted_tables.
-- All these permissions are RLS-filtered and AUTOMATICALLY become ineffective
-- after the 24-hour window. Run the cleanup SQL to revoke them entirely.
