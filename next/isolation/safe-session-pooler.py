#!/usr/bin/env python3
"""Exact-project Supabase Session Pooler adapter. Does NOT print secret URLs.

The dashboard's connection URI may contain an unescaped database password.
Instead of reparsing that value as a URL, parse only a strictly checked URI
shape and supply the password via PGPASSWORD. Secrets stay in process memory.
This file intentionally never supports source DML/DDL.
"""
import argparse
import os
import re
import subprocess
import sys
from urllib.parse import unquote

PROJECTS={
  "GOS_SOURCE_DB_URL":("bderfrcfuhnutuoyudje","qwiz_catalog_reader"),
  "QWIZ_TARGET_DB_URL":("vwsoergltegncrretxnz","postgres"),
}
HOST_RE=re.compile(r"^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$")

def credentials(key):
    if key not in PROJECTS: raise ValueError("Unrecognized connection selector")
    val=os.environ.get(key,"")
    if not val: raise ValueError(key+": secret is missing")
    if any(t in val for t in ("[YOUR-PASSWORD]","[PASSWORD]","[YOUR_PASSWORD]")):
        raise ValueError(key+": dashboard password placeholder not replaced")
    if "\n" in val or "\r" in val or "\t" in val:
        raise ValueError(key+": secret must be a single PostgreSQL URI")
    ref,role=PROJECTS[key]
    user=f"{role}.{ref}"
    # Greedy password capture supports literal #, @, ?, brackets and colons.
    # The project username, db name, pooler suffix and port are exact guards.
    m=re.fullmatch(r"postgres(?:ql)?://"+re.escape(user)+
        r":(.+)@([a-zA-Z0-9.-]+):5432/postgres(?:\?sslmode=require)?",val)
    if not m:
        raise ValueError(key+": expected Session pooler URI with project-scoped user and port 5432")
    password,host=m.groups()
    host=host.lower()
    if not HOST_RE.fullmatch(host):
        raise ValueError(key+": invalid Supabase session pooler hostname")
    # URI escapes, if any, are decoded before supplying to libpq via PGPASSWORD.
    password=unquote(password)
    if not password:raise ValueError(key+": empty PostgreSQL password")
    return user,password,host

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--connection",choices=list(PROJECTS),required=True)
    p.add_argument("--mode",choices=("probe","apply-schema"),default="probe")
    p.add_argument("--schema-file")
    a=p.parse_args()
    try:
        user,password,host=credentials(a.connection)
    except ValueError as e:
        print("CONNECTION_CONFIG_ERROR: "+str(e),file=sys.stderr)
        return 2
    if a.mode=="apply-schema" and a.connection!="QWIZ_TARGET_DB_URL":
        print("REFUSED: schema import permitted only for isolated Free QWIZ target",file=sys.stderr)
        return 2
    if a.mode=="apply-schema" and not a.schema_file:
        print("REFUSED: schema file is required",file=sys.stderr)
        return 2
    if a.mode=="probe":
        sql="""BEGIN READ ONLY;
SET LOCAL statement_timeout = '10000ms';
SET LOCAL lock_timeout = '2000ms';
SELECT current_setting('server_version'),
 (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND
  (tablename LIKE 'qwiz_%' OR tablename LIKE 'org_next_%' OR tablename LIKE 'org_quiz_%'))""" + (
  """,(SELECT count(*) FROM auth.users);""" if a.connection=="QWIZ_TARGET_DB_URL"
  else """;""") + """
COMMIT;"""
    else:
        from pathlib import Path
        sqlfile=Path(a.schema_file)
        if not sqlfile.is_file():
            print("REFUSED: missing schema-only file",file=sys.stderr)
            return 2
        sql=sqlfile.read_text()
        if (not sql.lstrip().startswith("BEGIN;")
            or not sql.rstrip().endswith("COMMIT;")
            or "Target public schema is not empty: refusing import" not in sql):
            print("REFUSED: schema-only transactional guards are absent",file=sys.stderr)
            return 2
    env=os.environ.copy()
    env.pop("GOS_SOURCE_DB_URL",None)
    env.pop("QWIZ_TARGET_DB_URL",None)
    env.update({"PGPASSWORD":password,"PGSSLMODE":"require","PGCONNECT_TIMEOUT":"8"})
    args=["psql","-X","--no-psqlrc","--no-password","-v","ON_ERROR_STOP=1",
          "-h",host,"-p","5432","-U",user,"-d","postgres"]
    if a.mode=="probe": args.extend(["-q","-A","-t","-c",sql])
    else: args.extend(["-q","-f",str(sqlfile)])
    # Never put a URI/password on the command line or print it to logs.
    result=subprocess.run(args,env=env,capture_output=True,text=True,timeout=150)
    if result.returncode:
        # Don't print raw libpq errors that may inadvertently echo a URI.
        print("DB_PROBE_FAILED" if a.mode=="probe" else "SCHEMA_IMPORT_FAILED",file=sys.stderr)
        print("pgcode="+str(result.returncode),file=sys.stderr)
        return 1
    if a.mode=="probe":
        if result.stdout.strip():print("READ_ONLY_PROBE_SUCCESS "+a.connection+" "+result.stdout.strip())
        else:print("READ_ONLY_PROBE_SUCCESS "+a.connection)
    else:print("SCHEMA_IMPORT_COMMAND_SUCCEEDED; inspect target through Supabase connector")
    return 0

if __name__=="__main__":sys.exit(main())
