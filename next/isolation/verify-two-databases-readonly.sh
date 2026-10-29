#!/usr/bin/env bash
# QWIZ/GOS migration: READ-ONLY authorized connectivity smoke test.
# Never prints connection URIs, secrets, records, usernames, or user identifiers.
set -euo pipefail
umask 077
: "${GOS_SOURCE_DB_URL:?GOS_SOURCE_DB_URL is required}"
: "${QWIZ_TARGET_DB_URL:?QWIZ_TARGET_DB_URL is required}"

# Verify both secrets point at the intended, different projects.
case "$GOS_SOURCE_DB_URL" in
  *bderfrcfuhnutuoyudje*) ;;
  *) echo "ERROR: GOS_SOURCE_DB_URL is not bound to expected legacy project ref" >&2; exit 2 ;;
esac
case "$QWIZ_TARGET_DB_URL" in
  *vwsoergltegncrretxnz*) ;;
  *) echo "ERROR: QWIZ_TARGET_DB_URL is not bound to expected free QWIZ project ref" >&2; exit 2 ;;
esac
if [[ "$GOS_SOURCE_DB_URL" == "$QWIZ_TARGET_DB_URL" ]]; then
 echo "ERROR: two database URIs are identical" >&2
 exit 2
fi
command -v psql >/dev/null || { echo "ERROR: PostgreSQL psql is not installed" >&2;exit 2; }

# Every query is SELECT-only and has a bounded lock/statement timeout.
export PGSSLMODE=require PGCONNECT_TIMEOUT=7 PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=2000"
query="
select
  (select count(*) from pg_tables where schemaname='public' and tablename like 'qwiz_%') as qwiz_tables,
  (select count(*) from pg_tables where schemaname='public' and tablename like 'org_next_%') as org_next_tables,
  (select count(*) from pg_tables where schemaname='public' and tablename like 'org_quiz_%') as org_quiz_tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'qwiz_%') as qwiz_functions,
  current_setting('server_version') as pg_version;
"
echo "Verifying legacy GOS Supabase metadata (read only)..."
psql "$GOS_SOURCE_DB_URL" -X --no-psqlrc --no-password -v ON_ERROR_STOP=1 -A -t -q -c "$query"
echo "Verifying isolated QWIZ Supabase metadata (read only)..."
psql "$QWIZ_TARGET_DB_URL" -X --no-psqlrc --no-password -v ON_ERROR_STOP=1 -A -t -q -c "$query"
echo "PASS: both project refs verified and database read-only queries succeeded. No changes were made."
