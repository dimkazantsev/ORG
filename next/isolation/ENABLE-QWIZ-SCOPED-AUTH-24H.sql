-- OLD GOS.ID ONLY (project bderfrcfuhnutuoyudje), SQL Editor.
-- ONE-TIME OWNER-AUTHORIZED EXPORT OF ONLY THE 11 QWIZ-REFERENCED AUTH USERS.
-- Never run in independent QWIZ Free. Never paste results containing credentials.
-- No existing auth/game rows are modified. NO GRANT on auth.users/identities.
-- Creates two restricted snapshots in an unexposed schema; read expires in 24h.
-- After transfer run CLEANUP-QWIZ-SCOPED-AUTH-SNAPSHOT.sql in old GOS.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='3s';
DO $guards$
DECLARE n int;
BEGIN
 IF current_database()<>'postgres' THEN
   RAISE EXCEPTION 'Wrong database';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='qwiz_auth_export') THEN
   RAISE EXCEPTION 'Old Auth snapshot already exists: clean up, then review before retry';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname='qwiz_catalog_reader'
  AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb
 ) THEN
   RAISE EXCEPTION 'Restricted source technical role is absent or elevated';
 END IF;
 SELECT count(*) INTO n FROM pg_tables WHERE schemaname='public' AND
  (tablename LIKE 'qwiz_%' OR tablename LIKE 'org_next_%' OR tablename LIKE 'org_quiz_%');
 IF n <> 57 THEN
  RAISE EXCEPTION 'Expected exactly 57 QWIZ source tables, got %',n;
 END IF;
END;
$guards$;

-- The selected QWIZ Auth IDs come EXCLUSIVELY from 13 existing game FKs.
-- These queries are evaluated by the GOS database owner, not the technical reader.
CREATE SCHEMA qwiz_auth_export AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA qwiz_auth_export FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE qwiz_auth_export.users AS
WITH needed AS (
 SELECT user_id AS id FROM public.org_next_players WHERE user_id IS NOT NULL
 UNION SELECT owner_id FROM public.org_next_quizzes WHERE owner_id IS NOT NULL
 UNION SELECT owner_id FROM public.org_next_rooms WHERE owner_id IS NOT NULL
 UNION SELECT user_id FROM public.org_quiz_participants WHERE user_id IS NOT NULL
 UNION SELECT created_by FROM public.org_quiz_sessions WHERE created_by IS NOT NULL
 UNION SELECT created_by FROM public.org_quiz_sets WHERE created_by IS NOT NULL
 UNION SELECT owner_id FROM public.qwiz_archived_rooms WHERE owner_id IS NOT NULL
 UNION SELECT owner_id FROM public.qwiz_bank WHERE owner_id IS NOT NULL
 UNION SELECT owner_id FROM public.qwiz_builds WHERE owner_id IS NOT NULL
 UNION SELECT user_id FROM public.qwiz_player_device_access WHERE user_id IS NOT NULL
 UNION SELECT user_id FROM public.qwiz_student_links WHERE user_id IS NOT NULL
 UNION SELECT user_id FROM public.qwiz_student_profiles WHERE user_id IS NOT NULL
 UNION SELECT owner_id FROM public.qwiz_topics WHERE owner_id IS NOT NULL
)
SELECT u.id,u.instance_id,u.aud,u.role,u.email,u.encrypted_password,
 u.email_confirmed_at,u.phone,u.phone_confirmed_at,u.raw_app_meta_data,
 u.raw_user_meta_data,u.created_at,u.updated_at,u.last_sign_in_at,
 u.is_sso_user,u.is_anonymous,u.deleted_at,u.banned_until
FROM needed n JOIN auth.users u ON u.id=n.id;

ALTER TABLE qwiz_auth_export.users ADD PRIMARY KEY(id);

CREATE TABLE qwiz_auth_export.identities AS
SELECT i.id,i.user_id,i.provider_id,i.identity_data,i.provider,
 i.created_at,i.updated_at,i.last_sign_in_at,i.email
FROM auth.identities i
JOIN qwiz_auth_export.users u ON u.id=i.user_id;

ALTER TABLE qwiz_auth_export.identities ADD PRIMARY KEY(id);
ALTER TABLE qwiz_auth_export.identities
 ADD CONSTRAINT scoped_identity_user_fk
 FOREIGN KEY (user_id) REFERENCES qwiz_auth_export.users(id);

-- Explicitly fail closed if referenced Auth users are missing in the source.
DO $check$
DECLARE expected int; obtained int; identities int;
BEGIN
 SELECT count(*) INTO expected FROM (
  SELECT user_id AS id FROM public.org_next_players WHERE user_id IS NOT NULL
  UNION SELECT owner_id FROM public.org_next_quizzes WHERE owner_id IS NOT NULL
  UNION SELECT owner_id FROM public.org_next_rooms WHERE owner_id IS NOT NULL
  UNION SELECT user_id FROM public.org_quiz_participants WHERE user_id IS NOT NULL
  UNION SELECT created_by FROM public.org_quiz_sessions WHERE created_by IS NOT NULL
  UNION SELECT created_by FROM public.org_quiz_sets WHERE created_by IS NOT NULL
  UNION SELECT owner_id FROM public.qwiz_archived_rooms WHERE owner_id IS NOT NULL
  UNION SELECT owner_id FROM public.qwiz_bank WHERE owner_id IS NOT NULL
  UNION SELECT owner_id FROM public.qwiz_builds WHERE owner_id IS NOT NULL
  UNION SELECT user_id FROM public.qwiz_player_device_access WHERE user_id IS NOT NULL
  UNION SELECT user_id FROM public.qwiz_student_links WHERE user_id IS NOT NULL
  UNION SELECT user_id FROM public.qwiz_student_profiles WHERE user_id IS NOT NULL
  UNION SELECT owner_id FROM public.qwiz_topics WHERE owner_id IS NOT NULL
 ) t;
 SELECT count(*) INTO obtained FROM qwiz_auth_export.users;
 SELECT count(*) INTO identities FROM qwiz_auth_export.identities;
 IF expected<>11 OR obtained<>11 OR identities>44 THEN
  RAISE EXCEPTION 'QWIZ Auth scope mismatch (expected %, found %, identities %); rollback',
  expected,obtained,identities;
 END IF;
END;
$check$;

ALTER TABLE qwiz_auth_export.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE qwiz_auth_export.identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA qwiz_auth_export FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA qwiz_auth_export TO qwiz_catalog_reader;
GRANT SELECT ON qwiz_auth_export.users,qwiz_auth_export.identities TO qwiz_catalog_reader;

DO $expire$
DECLARE expiry timestamptz := clock_timestamp() + interval '24 hours';
BEGIN
 EXECUTE format(
  'CREATE POLICY qwiz_auth_migration_ttl ON qwiz_auth_export.users FOR SELECT TO qwiz_catalog_reader USING (clock_timestamp() < %L::timestamptz)',expiry
 );
 EXECUTE format(
  'CREATE POLICY qwiz_auth_migration_ttl ON qwiz_auth_export.identities FOR SELECT TO qwiz_catalog_reader USING (clock_timestamp() < %L::timestamptz)',expiry
 );
END;
$expire$;
COMMIT;

-- Only aggregates are shown, no UUID, email, password hash or identity data.
SELECT (SELECT count(*) FROM qwiz_auth_export.users) AS qwiz_user_count,
       (SELECT count(*) FROM qwiz_auth_export.identities) AS qwiz_identity_count,
       (SELECT count(*) FROM qwiz_auth_export.users WHERE encrypted_password IS NOT NULL AND encrypted_password<>'') AS users_with_password_hash,
       (SELECT count(*) FROM qwiz_auth_export.users WHERE is_sso_user) AS sso_users,
       (SELECT count(*) FROM qwiz_auth_export.users WHERE is_anonymous) AS anonymous_users,
       (SELECT count(*) FROM qwiz_auth_export.users WHERE deleted_at IS NOT NULL) AS deleted_users;
-- Expected qwiz_user_count = 11. The others are descriptive, not leaked rows.
