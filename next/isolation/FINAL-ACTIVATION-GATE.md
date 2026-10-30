# Final QWIZ Free activation safety gate

**Not approved to run until the old GOS owner has created exactly the 11-user restricted `qwiz_auth_export` snapshot.** Source readiness on 2026-10-30 was explicitly checked and returned zero for schema, tables and SELECT grants. Until then all Auth/identities remain in GOS and QWIZ game data remain in the protected Free staging area.

Once restricted old-source Auth snapshot is verified, this gate can be armed through a separate, explicit commit `QWIZ_FINAL_AUTH_AND_DATA_APPROVED` to run the already-tested Auth transfer and transactionally restore all 2,344 QWIZ game rows to Free public tables without switching the live frontend. No changes may be made to old GOS production data or user passwords.
