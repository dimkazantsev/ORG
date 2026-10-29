# QWIZ-PARTY Free schema import gate

The schema-only migration has **NOT** been executed against the live Free Supabase project. This file is a manual push trigger for the strictly gated GitHub Actions workflow; editing this file without the exact approved commit message never runs migration. All passwords are stored as GitHub Actions secrets, not here.

## User-authorized isolated schema-only import

The user explicitly requested continuation of QWIZ separation. Two read-only CI probes have succeeded, and direct Supabase SQL has verified the independent Free QWIZ target is empty. This gate authorizes ONLY the single-transaction empty-target schema-only import in workflow `qwiz-gated-schema-import.yml`. It authorizes no transfer of personal game data, Auth identities, Storage objects, no public frontend cutover and no changes to old GOS.ID. Gate run must verify target SQL counts and remain reversible by transaction rollback on failure.
