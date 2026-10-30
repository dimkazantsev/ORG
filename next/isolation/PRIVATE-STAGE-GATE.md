# QWIZ private staging gate

Confirmed by user request: stage only the 57 QWIZ game-table rows from old GOS source in a nonexposed schema on the already-isolated Free QWIZ Supabase. Keep Auth users, identities, Storage, source rows, live frontend and GOS backend unchanged. Use the encrypted GitHub Actions source reader and independent target credentials, single source data snapshot, strict record completeness checks, transactional insertion, and independent Supabase post-commit checks. No user row data or secrets in GitHub source/logs/artifacts.
