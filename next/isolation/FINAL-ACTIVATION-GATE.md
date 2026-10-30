# Final QWIZ Free activation safety gate

**Not approved to run until the old GOS owner has created exactly the 11-user restricted `qwiz_auth_export` snapshot.** Source readiness on 2026-10-30 was explicitly checked and returned zero for schema, tables and SELECT grants. Until then all Auth/identities remain in GOS and QWIZ game data remain in the protected Free staging area.

Once restricted old-source Auth snapshot is verified, this gate can be armed through a separate, explicit commit `QWIZ_FINAL_AUTH_AND_DATA_APPROVED` to run the already-tested Auth transfer and transactionally restore all 2,344 QWIZ game rows to Free public tables without switching the live frontend. No changes may be made to old GOS production data or user passwords.

## Authorization condition now met — verified independent Auth stage

Old GOS Auth export schema and two RLS-protected restricted tables were confirmed by read-only GitHub audit after SQL Editor connection timeout (run 41013193522). Restricted source-to-target Auth copy then completed successfully (run 41013264331). Official target Supabase SQL confirms 11 exact Auth users and six provider identities in unexposed `qwiz_auth_snapshot`, zero live `auth.users`, 716 staged bank questions and all 57 staged game tables; client roles cannot access staging. The full 2,344-row final SQL was tested successfully in disposable PG17 (run 41012363682). User repeatedly authorized complete QWIZ separation. Activate ONLY new QWIZ Free Auth/live game data in a single fail-closed transaction; DO NOT switch site or change old GOS production.
