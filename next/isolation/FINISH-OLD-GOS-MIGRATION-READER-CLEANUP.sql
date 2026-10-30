-- OLD GOS.ID ONLY: bderfrcfuhnutuoyudje.
-- Safe cleanup AFTER confirmed successful QWIZ migration.
-- Scoped Auth copy of 11 users and temporary 57-table SELECT grants have
-- already been used. This file DOES NOT delete original Auth/game records.
-- Only run in the OLD GOS SQL Editor. Do NOT run on new QWIZ Free.
-- PHASE 1 (remove two temporary restricted Auth tables):
-- OLD GOS.ID ONLY: remove ONLY the two restricted QWIZ Auth export copies
-- created by ENABLE-QWIZ-SCOPED-AUTH-24H.sql.
-- Never deletes Auth users, identities, game data or Storage originals.
BEGIN;
DO $guard$ BEGIN
  IF current_database()<>'postgres' THEN
    RAISE EXCEPTION 'Wrong database';
  END IF;
  IF EXISTS(
   SELECT 1 FROM pg_namespace WHERE nspname='qwiz_auth_export'
  ) THEN
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='qwiz_auth_export' AND c.relname='users' AND c.relkind='r')
    OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='qwiz_auth_export' AND c.relname='identities' AND c.relkind='r')
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='qwiz_auth_export' AND c.relkind IN ('r','v','m','p')) <> 2 THEN
      RAISE EXCEPTION 'Unexpected objects in Auth export schema; refusing cleanup';
    END IF;
    REVOKE ALL ON SCHEMA qwiz_auth_export FROM qwiz_catalog_reader;
    REVOKE SELECT ON qwiz_auth_export.users,qwiz_auth_export.identities FROM qwiz_catalog_reader;
    -- Fail closed if the temporary export is referenced from outside the schema.
    -- No external objects may be removed by this cleanup.
    DROP TABLE qwiz_auth_export.identities RESTRICT;
    DROP TABLE qwiz_auth_export.users RESTRICT;
    DROP SCHEMA qwiz_auth_export RESTRICT;
  END IF;
END;
$guard$;
COMMIT;
SELECT count(*) AS remaining_export_schemas FROM pg_namespace WHERE nspname='qwiz_auth_export';
-- Expected 0. This does not affect source auth.users/auth.identities.

-- PHASE 2 (remove only 57 temporary migration reader SELECT policies/grants):
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

-- Verification: expected 0, 0, 0, 0.
SELECT
 (SELECT count(*) FROM pg_namespace WHERE nspname='qwiz_auth_export') AS remaining_auth_export_schema,
 (SELECT count(*) FROM pg_policy WHERE polname='qwiz_temporary_migration_reader') AS remaining_game_export_policies,
 (SELECT count(*) FROM pg_policy WHERE polname='qwiz_auth_migration_ttl') AS remaining_auth_export_policies,
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
  AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%' OR c.relname LIKE 'org_quiz_%')
  AND has_table_privilege('qwiz_catalog_reader',c.oid,'SELECT')) AS game_tables_still_readable;
