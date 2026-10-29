-- QWIZ-PARTY: issue a dedicated limited-permission catalog reader on ORIGINAL GOS.ID.
-- Run ONLY in the GOS.ID (gos-sim, ref bderfrcfuhnutuoyudje) SQL Editor.
-- One-time generated password is NOT embedded in SQL history. Keep result PRIVATE.
-- Do not run this on the new QWIZ Free project.
--
-- The role can read PostgreSQL system catalogs for migration inventory.
-- It has NO explicit SELECT on private game/Auth/Storage tables, NO bypassrls,
-- NO schema modification, NO membership in predefined read-all roles.
-- Exporting QWIZ game rows is a SEPARATE later step with RLS review.
--
-- Re-running this SQL ROTATES ONLY this dedicated user's password, never
-- the original 'postgres' password; update GitHub Secret after any re-run.

CREATE TEMP TABLE IF NOT EXISTS qwiz_reader_one_time_password (
  secret text NOT NULL
);
TRUNCATE TABLE pg_temp.qwiz_reader_one_time_password;

DO $qwiz_reader$
DECLARE
  generated text := replace(gen_random_uuid()::text, '-', '') ||
                    replace(gen_random_uuid()::text, '-', '');
BEGIN
  -- Confine DDL to a uniquely named role. No changes to any existing GOS user.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname = 'qwiz_catalog_reader') THEN
    EXECUTE format('ALTER ROLE %I PASSWORD %L',
                   'qwiz_catalog_reader', generated);
  ELSE
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 2',
                   'qwiz_catalog_reader', generated);
  END IF;

  -- Defensive defaults; actual GitHub job uses an explicit READ ONLY transaction.
  EXECUTE 'ALTER ROLE qwiz_catalog_reader SET default_transaction_read_only = on';
  EXECUTE 'ALTER ROLE qwiz_catalog_reader SET statement_timeout = ''10s''';
  EXECUTE 'ALTER ROLE qwiz_catalog_reader SET lock_timeout = ''2s''';
  GRANT CONNECT ON DATABASE postgres TO qwiz_catalog_reader;

  INSERT INTO pg_temp.qwiz_reader_one_time_password(secret) VALUES (generated);
END;
$qwiz_reader$;

-- COPY THE VALUE FROM THIS RESULT DIRECTLY TO GITHUB ACTIONS SECRET.
-- The hostname below must match the "host" shown in the existing GOS.ID
-- Connect > Direct > Session pooler > Connection parameters.
-- Supabase session-pooler custom login syntax: ROLE.PROJECT_REF.
SELECT
  'postgresql://qwiz_catalog_reader.bderfrcfuhnutuoyudje:' ||
  secret ||
  '@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
    AS github_secret_GOS_SOURCE_DB_URL
FROM pg_temp.qwiz_reader_one_time_password;

-- IMPORTANT: This output contains a password. Do not screenshot or share it.
-- After copying, close the SQL Editor tab to end its session.
