#!/usr/bin/env bash
# Read-only metadata check for the source GOS.ID project. Target is optional.
# Never prints database URIs, keys, password, or personal information.
set -euo pipefail
umask 077
: "${GOS_SOURCE_DB_URL:?Encrypted Actions secret GOS_SOURCE_DB_URL is required}"
command -v python3 >/dev/null || { echo "Python3 is required" >&2; exit 2; }
command -v psql >/dev/null || { echo "psql is required" >&2; exit 2; }

# Parse the actual hostname/username. Reject a project ref appearing only in a password.
# Both direct database and official session pooler URLs are supported.
python3 - <<'PY'
from os import environ
from urllib.parse import urlsplit, unquote

def check(key, ref):
    value = environ.get(key, '')
    if not value:
        raise SystemExit('ERROR: missing database URL for ' + key)
    try:
        u = urlsplit(value)
        host = (u.hostname or '').lower()
        user = unquote(u.username or '')
        port = u.port
    except (ValueError, TypeError):
        raise SystemExit('ERROR: invalid database URL for ' + key)
    if u.scheme not in ('postgres', 'postgresql') or not u.password:
        raise SystemExit('ERROR: expected an authenticated PostgreSQL URI in ' + key)
    direct = host == f'db.{ref}.supabase.co' and user in ('postgres', f'postgres.{ref}')
    pool = (host.endswith('.pooler.supabase.com') and user == f'postgres.{ref}' and port == 5432)
    if not (direct or pool):
        raise SystemExit('ERROR: database host/user is not the expected project for ' + key)
    if u.path not in ('', '/', '/postgres'):
        raise SystemExit('ERROR: expected postgres database for ' + key)

check('GOS_SOURCE_DB_URL', 'bderfrcfuhnutuoyudje')
if environ.get('QWIZ_TARGET_DB_URL'):
    check('QWIZ_TARGET_DB_URL', 'vwsoergltegncrretxnz')
PY

# Every SQL query is SELECT-only; the PostgreSQL session additionally defaults to read-only.
export PGSSLMODE=require PGCONNECT_TIMEOUT=7
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=2000"
query="
select
  (select count(*) from pg_tables where schemaname='public' and tablename like 'qwiz_%') as qwiz_tables,
  (select count(*) from pg_tables where schemaname='public' and tablename like 'org_next_%') as org_next_tables,
  (select count(*) from pg_tables where schemaname='public' and tablename like 'org_quiz_%') as org_quiz_tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'qwiz_%') as qwiz_functions,
  current_setting('server_version') as pg_version;
"
echo "Verifying legacy GOS.ID PostgreSQL (read-only catalog counts)..."
psql "$GOS_SOURCE_DB_URL" -X --no-psqlrc --no-password -v ON_ERROR_STOP=1 -A -t -q -c "$query"
if [[ -n "${QWIZ_TARGET_DB_URL:-}" ]]; then
  echo "Verifying the separate QWIZ PostgreSQL (read-only catalog counts)..."
  psql "$QWIZ_TARGET_DB_URL" -X --no-psqlrc --no-password -v ON_ERROR_STOP=1 -A -t -q -c "$query"
  echo "PASS: read-only SQL succeeded on both independent projects; no records changed."
else
  echo "PASS: source GOS.ID metadata is accessible. QWIZ target checked separately through Supabase connector; NOT verified by this job."
fi
