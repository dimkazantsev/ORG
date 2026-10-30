# Exact 11-user QWIZ Auth transfer gate

On 2026-10-30, the user explicitly requested completion of independent QWIZ-PARTY migration.
Authorized action: check whether the old GOS project has already granted read-only
access to the **exact eleven** QWIZ-linked Auth users and provider identities
through the restricted `qwiz_auth_export` source schema. If this owner-created
snapshot exists, the GitHub workflow copies it only to the RLS-locked
`qwiz_auth_snapshot` schema in **new** QWIZ Free.

If the owner has not created that old-source snapshot, fail closed. No
attempt to grant source permissions, create fake users, copy other GOS users,
alter original GOS data, or switch the production frontend is authorized.
Credentials and personal records must remain out of logs and artifacts.
