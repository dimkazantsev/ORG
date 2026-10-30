-- QWIZ-PARTY FREE ONLY: vwsoergltegncrretxnz. NEVER RUN ON OLD GOS.ID!
-- FINAL ATOMIC RESTORE AFTER AND ONLY AFTER 11 REAL OLD GOS AUTH ACCOUNTS
-- HAVE BEEN VERIFIED IN qwiz_auth_snapshot.{users,identities}.
-- All 2,344 game rows MUST already be staged in qwiz_transfer_stage.
-- This runs transactionally; any failure rolls back Auth and game changes.
-- It does NOT switch frontend, remove old data, or copy Storage assets.
BEGIN;
SET LOCAL statement_timeout='480s';
SET LOCAL lock_timeout='3000ms';
SELECT pg_advisory_xact_lock(hashtext('qwiz-final-auth-and-game-20261030'));

DO $preflight$
DECLARE n integer; n_auth integer; n_ids integer;
BEGIN
 IF current_user<>'postgres' THEN
  RAISE EXCEPTION 'Target-owned postgres required';
 END IF;
 IF (SELECT count(*) FROM pg_tables WHERE schemaname='public'
  AND (tablename LIKE 'qwiz_%' OR tablename LIKE 'org_next_%' OR tablename LIKE 'org_quiz_%'))<>57
 OR (SELECT count(*) FROM pg_tables WHERE schemaname='qwiz_transfer_stage')<>57
 OR (SELECT count(*) FROM pg_tables WHERE schemaname='qwiz_auth_snapshot')<>2 THEN
  RAISE EXCEPTION 'Expected 57 public, 57 private staged and two private Auth snapshot tables';
 END IF;
 IF (SELECT count(*) FROM auth.users)<>0 OR (SELECT count(*) FROM auth.identities)<>0 THEN
  RAISE EXCEPTION 'Target live Auth is not empty; never overwrite or combine identities';
 END IF;
 SELECT count(*) INTO n_auth FROM qwiz_auth_snapshot.users;
 SELECT count(*) INTO n_ids FROM qwiz_auth_snapshot.identities;
 IF n_auth<>11 OR n_ids<1 OR n_ids>44 THEN
  RAISE EXCEPTION 'Must first restore exact 11 real Auth users and 1..44 identities privately';
 END IF;
 IF EXISTS (SELECT FROM qwiz_auth_snapshot.identities i WHERE NOT EXISTS (
   SELECT FROM qwiz_auth_snapshot.users u WHERE u.id=i.user_id)) THEN
  RAISE EXCEPTION 'Unmatched Auth identity in private snapshot';
 END IF;
 WITH needed AS (
   SELECT user_id id FROM qwiz_transfer_stage.org_next_players WHERE user_id IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.org_next_quizzes WHERE owner_id IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.org_next_rooms WHERE owner_id IS NOT NULL
   UNION SELECT user_id FROM qwiz_transfer_stage.org_quiz_participants WHERE user_id IS NOT NULL
   UNION SELECT created_by FROM qwiz_transfer_stage.org_quiz_sessions WHERE created_by IS NOT NULL
   UNION SELECT created_by FROM qwiz_transfer_stage.org_quiz_sets WHERE created_by IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.qwiz_archived_rooms WHERE owner_id IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.qwiz_bank WHERE owner_id IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.qwiz_builds WHERE owner_id IS NOT NULL
   UNION SELECT user_id FROM qwiz_transfer_stage.qwiz_player_device_access WHERE user_id IS NOT NULL
   UNION SELECT user_id FROM qwiz_transfer_stage.qwiz_student_links WHERE user_id IS NOT NULL
   UNION SELECT user_id FROM qwiz_transfer_stage.qwiz_student_profiles WHERE user_id IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.qwiz_topics WHERE owner_id IS NOT NULL
 )
 SELECT count(*) INTO n FROM needed;
 IF n<>11 THEN RAISE EXCEPTION 'Game FK Auth scope has changed; expected 11 UUIDs'; END IF;
 IF EXISTS (
  WITH needed AS (
   SELECT user_id id FROM qwiz_transfer_stage.org_next_players WHERE user_id IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.org_next_quizzes WHERE owner_id IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.org_next_rooms WHERE owner_id IS NOT NULL
   UNION SELECT user_id FROM qwiz_transfer_stage.org_quiz_participants WHERE user_id IS NOT NULL
   UNION SELECT created_by FROM qwiz_transfer_stage.org_quiz_sessions WHERE created_by IS NOT NULL
   UNION SELECT created_by FROM qwiz_transfer_stage.org_quiz_sets WHERE created_by IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.qwiz_archived_rooms WHERE owner_id IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.qwiz_bank WHERE owner_id IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.qwiz_builds WHERE owner_id IS NOT NULL
   UNION SELECT user_id FROM qwiz_transfer_stage.qwiz_player_device_access WHERE user_id IS NOT NULL
   UNION SELECT user_id FROM qwiz_transfer_stage.qwiz_student_links WHERE user_id IS NOT NULL
   UNION SELECT user_id FROM qwiz_transfer_stage.qwiz_student_profiles WHERE user_id IS NOT NULL
   UNION SELECT owner_id FROM qwiz_transfer_stage.qwiz_topics WHERE owner_id IS NOT NULL
  )
  SELECT 1 FROM (
   (SELECT id FROM needed EXCEPT SELECT id FROM qwiz_auth_snapshot.users)
   UNION ALL
   (SELECT id FROM qwiz_auth_snapshot.users EXCEPT SELECT id FROM needed)
  ) mismatch
 ) THEN
  RAISE EXCEPTION 'Private Auth IDs do not match EXACTLY 11 QWIZ game FK users';
 END IF;
 IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'qwiz_%'
   AND tablename NOT LIKE 'org_next_%' AND tablename NOT LIKE 'org_quiz_%')>0 THEN
  RAISE EXCEPTION 'Unexpected unrelated public table in dedicated QWIZ Free';
 END IF;
 IF has_schema_privilege('anon','qwiz_transfer_stage','USAGE')
 OR has_schema_privilege('authenticated','qwiz_transfer_stage','USAGE')
 OR has_schema_privilege('service_role','qwiz_transfer_stage','USAGE')
 OR has_schema_privilege('anon','qwiz_auth_snapshot','USAGE')
 OR has_schema_privilege('authenticated','qwiz_auth_snapshot','USAGE')
 OR has_schema_privilege('service_role','qwiz_auth_snapshot','USAGE') THEN
  RAISE EXCEPTION 'Staging is exposed to API roles';
 END IF;
END $preflight$;

-- Restore actual old Auth UUIDs and existing bcrypt/Argon password hashes.
-- Never create placeholder accounts. Do not insert generated Auth columns.
INSERT INTO auth.users(
 id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 phone,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,
 updated_at,last_sign_in_at,is_sso_user,is_anonymous,deleted_at,banned_until)
SELECT id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 phone,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,
 updated_at,last_sign_in_at,is_sso_user,is_anonymous,deleted_at,banned_until
FROM qwiz_auth_snapshot.users;

INSERT INTO auth.identities(id,user_id,provider_id,identity_data,provider,
 created_at,updated_at,last_sign_in_at)
SELECT id,user_id,provider_id,identity_data,provider,
 created_at,updated_at,last_sign_in_at
FROM qwiz_auth_snapshot.identities;

-- Dependency cycles exist among org_quiz_sessions and org_quiz_teams.
-- All FK constraints are temporarily made deferred within this transaction,
-- then fully checked and restored to their initial NOT DEFERRABLE state.
DO $copy$
DECLARE t record; f record; expected_count bigint; live_count bigint;
DECLARE cols text; geo_old text; geo_new text; code_old text; code_new text;
BEGIN
 IF (SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE k.contype='f' AND n.nspname='public'
       AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%'
          OR c.relname LIKE 'org_quiz_%'))<>123 THEN
  RAISE EXCEPTION 'Source FK graph changed since validation';
 END IF;
 IF EXISTS (
  SELECT FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE k.contype='f' AND n.nspname='public'
    AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%'
       OR c.relname LIKE 'org_quiz_%')
    AND k.condeferrable
 ) THEN
  RAISE EXCEPTION 'Unexpected preexisting deferred FK, review before altering';
 END IF;
 -- Existing seeded catalogs must match the staged live-source snapshot.
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]'))
 INTO geo_old FROM qwiz_transfer_stage.qwiz_geo_regions x;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]'))
 INTO geo_new FROM public.qwiz_geo_regions x;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.n)::text,'[]'))
 INTO code_old FROM qwiz_transfer_stage.qwiz_secret_code_catalog x;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.n)::text,'[]'))
 INTO code_new FROM public.qwiz_secret_code_catalog x;
 IF geo_old IS DISTINCT FROM geo_new OR code_old IS DISTINCT FROM code_new THEN
  RAISE EXCEPTION 'Previously seeded catalogs differ from source snapshot';
 END IF;
 -- No other QWIZ live table may already contain rows.
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND (tablename LIKE 'qwiz_%' OR tablename LIKE 'org_next_%'
      OR tablename LIKE 'org_quiz_%') ORDER BY tablename LOOP
   IF t.tablename NOT IN ('qwiz_geo_regions','qwiz_secret_code_catalog') THEN
    EXECUTE format('SELECT count(*) FROM public.%I',t.tablename) INTO live_count;
    IF live_count<>0 THEN
     RAISE EXCEPTION 'Live QWIZ table % already has data', t.tablename;
    END IF;
   END IF;
 END LOOP;
 -- User-defined triggers are suppressed only during bulk restore. Their
 -- original enabled status is checked and restored before COMMIT.
 IF (SELECT count(*) FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%'
      OR c.relname LIKE 'org_quiz_%') AND NOT tg.tgisinternal AND tg.tgenabled='O')<>9 THEN
  RAISE EXCEPTION 'Unexpected user trigger state, refuse migration';
 END IF;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND (tablename LIKE 'qwiz_%' OR tablename LIKE 'org_next_%'
    OR tablename LIKE 'org_quiz_%') ORDER BY tablename LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER',t.tablename);
 END LOOP;
 FOR f IN
  SELECT c.relname AS child,k.conname AS name FROM pg_constraint k
  JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE k.contype='f' AND n.nspname='public'
   AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%'
     OR c.relname LIKE 'org_quiz_%')
  ORDER BY c.relname,k.conname LOOP
   EXECUTE format('ALTER TABLE public.%I ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED',
       f.child,f.name);
 END LOOP;
 SET CONSTRAINTS ALL DEFERRED;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND (tablename LIKE 'qwiz_%' OR tablename LIKE 'org_next_%'
    OR tablename LIKE 'org_quiz_%') ORDER BY tablename LOOP
    IF t.tablename NOT IN ('qwiz_geo_regions','qwiz_secret_code_catalog') THEN
     EXECUTE format('INSERT INTO public.%I SELECT * FROM qwiz_transfer_stage.%I',
       t.tablename,t.tablename);
    END IF;
    EXECUTE format('SELECT count(*) FROM qwiz_transfer_stage.%I',t.tablename)
      INTO expected_count;
    EXECUTE format('SELECT count(*) FROM public.%I',t.tablename)
      INTO live_count;
    IF live_count<>expected_count THEN
     RAISE EXCEPTION 'QWIZ table % row count differs after restore',t.tablename;
    END IF;
 END LOOP;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND (tablename LIKE 'qwiz_%' OR tablename LIKE 'org_next_%'
      OR tablename LIKE 'org_quiz_%') ORDER BY tablename LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER',t.tablename);
 END LOOP;
END $copy$;
-- Force evaluation of all 123 actual FK constraints after all rows exist.
SET CONSTRAINTS ALL IMMEDIATE;
DO $restore_fk$
DECLARE f record;
BEGIN
 FOR f IN SELECT c.relname AS child,k.conname AS name
  FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE k.contype='f' AND n.nspname='public'
   AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%'
     OR c.relname LIKE 'org_quiz_%')
  ORDER BY c.relname,k.conname LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER CONSTRAINT %I NOT DEFERRABLE INITIALLY IMMEDIATE',
      f.child,f.name);
 END LOOP;
 IF (SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.contype='f' AND n.nspname='public'
    AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%'
      OR c.relname LIKE 'org_quiz_%') AND k.condeferrable)<>0 THEN
   RAISE EXCEPTION 'FK settings were not restored';
 END IF;
 IF (SELECT count(*) FROM auth.users)<>11
 OR (SELECT count(*) FROM auth.identities)<>(SELECT count(*) FROM qwiz_auth_snapshot.identities)
 OR (SELECT count(*) FROM public.qwiz_bank)<>716
 OR (SELECT count(*) FROM public.org_quiz_questions)<>927 THEN
  RAISE EXCEPTION 'Final QWIZ user/question counts failed';
 END IF;
 IF (SELECT count(*) FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%'
      OR c.relname LIKE 'org_quiz_%') AND NOT tg.tgisinternal AND tg.tgenabled='O')<>9 THEN
  RAISE EXCEPTION 'Game triggers were not fully restored';
 END IF;
END $restore_fk$;
COMMIT;
-- No old GOS database writes. No client cutover. Evaluate Auth login, storage,
-- RLS, Realtime and 40-player E2E before changing the production frontend.
