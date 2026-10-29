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
    # Detect the placeholder displayed in the Supabase Dashboard before parsing:
    # square brackets can make a standard URL parser reject the authority.
    if '[YOUR-PASSWORD]' in value or '[YOUR_PASSWORD]' in value or '[PASSWORD]' in value:
        raise SystemExit('ERROR: PASSWORD_PLACEHOLDER — the Supabase URI still contains [YOUR-PASSWORD]. Replace it locally in the GitHub secret with the actual DB password; do not share it in chat.')
    if not value.startswith(('postgresql://', 'postgres://')):
        raise SystemExit('ERROR: NOT_POSTGRES_URI — copy the URI from Supabase Connect > Direct > Session pooler > Type URI. Do not paste the API URL, connection parameters or code snippets.')
    if any(ch in value for ch in ('\\n', '\\r', '\\t')):
        raise SystemExit('ERROR: INVALID_WHITESPACE — expected one continuous database URI on one line.')
    try:
        u = urlsplit(value)
        host = (u.hostname or '').lower()
        user = unquote(u.username or '')
        port = u.port
    except (ValueError, TypeError):
        raise SystemExit('ERROR: URI_PARSE_FAILED — re-copy the URI; URL-encode reserved characters in the password, and never include [YOUR-PASSWORD].')
    if u.scheme not in ('postgres', 'postgresql') or not u.password:
        raise SystemExit('ERROR: PASSWORD_NOT_PRESENT — the PostgreSQL URI needs a real encoded database password (not the account password or publishable key).')
    # Allow only the dedicated, non-admin GOS catalog reader on the source.
    # Custom Supabase shared-pooler usernames are ROLE.PROJECT_REF.
    if key == 'GOS_SOURCE_DB_URL':
        expected_user = f'qwiz_catalog_reader.{ref}'
        pool = (host.endswith('.pooler.supabase.com')
                and user == expected_user and port == 5432)
        if not pool:
            raise SystemExit('ERROR: GOS_READER_REQUIRED — use the dedicated qwiz_catalog_reader.<project_ref> user with official Session pooler port 5432; no postgres admin credentials.')
    else:
        direct = host == f'db.{ref}.supabase.co' and user == 'postgres' and port == 5432
        pool = (host.endswith('.pooler.supabase.com') and user == f'postgres.{ref}' and port == 5432)
        if not (direct or pool):
            raise SystemExit('ERROR: database host/user is not the expected project for ' + key)
    if u.path not in ('', '/', '/postgres'):
        raise SystemExit('ERROR: expected postgres database for ' + key)

check('GOS_SOURCE_DB_URL', 'bderfrcfuhnutuoyudje')
if environ.get('QWIZ_TARGET_DB_URL'):
    check('QWIZ_TARGET_DB_URL', 'vwsoergltegncrretxnz')
PY

# Use an explicit PostgreSQL READ ONLY transaction rather than depending on
# pooler-specific PGOPTIONS support. No changes to either production database.
export PGSSLMODE=require PGCONNECT_TIMEOUT=7
query="
begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
select
  (select count(*) from pg_tables where schemaname='public' and tablename like 'qwiz_%') as qwiz_tables,
  (select count(*) from pg_tables where schemaname='public' and tablename like 'org_next_%') as org_next_tables,
  (select count(*) from pg_tables where schemaname='public' and tablename like 'org_quiz_%') as org_quiz_tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'qwiz_%') as qwiz_functions,
  current_setting('server_version') as pg_version;
commit;
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
