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
    DROP SCHEMA qwiz_auth_export CASCADE;
  END IF;
END;
$guard$;
COMMIT;
SELECT count(*) AS remaining_export_schemas FROM pg_namespace WHERE nspname='qwiz_auth_export';
-- Expected 0. This does not affect source auth.users/auth.identities.
