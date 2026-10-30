#!/usr/bin/env python3
"""Scope-checked, non-publishing migration of exactly 11 QWIZ-related Auth rows.

Source: OLD GOS temporary qwiz_auth_export schema installed by its owner.
Target: independent Free QWIZ private qwiz_auth_snapshot schema ONLY.
No live auth.users mutations, no source DML, no logs/artifacts containing PII.
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("pooler",ROOT/"safe-session-pooler.py")
adapter=importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)

COLS={
    "users":("id","instance_id","aud","role","email","encrypted_password",
      "email_confirmed_at","phone","phone_confirmed_at","raw_app_meta_data",
      "raw_user_meta_data","created_at","updated_at","last_sign_in_at",
      "is_sso_user","is_anonymous","deleted_at","banned_until"),
    "identities":("id","user_id","provider_id","identity_data","provider",
      "created_at","updated_at","last_sign_in_at","email")
}

def cmd_env(key):
    user,password,host,_=adapter.credentials(key)
    expected={
     "GOS_SOURCE_DB_URL":("qwiz_catalog_reader.bderfrcfuhnutuoyudje","eu-central-1"),
     "QWIZ_TARGET_DB_URL":("postgres.vwsoergltegncrretxnz","eu-west-1"),
    }
    exp,region=expected[key]
    if user!=exp or region not in host: raise ValueError("Unexpected project selector")
    if key=="QWIZ_TARGET_DB_URL" and len(password)>2 and (
        (password[0],password[-1]) in (("[","]"),("'","'"),('"','"'))
    ):
        password=password[1:-1]
    env=os.environ.copy()
    env.pop("GOS_SOURCE_DB_URL",None)
    env.pop("QWIZ_TARGET_DB_URL",None)
    env.update(PGPASSWORD=password,PGSSLMODE="require",PGCONNECT_TIMEOUT="8")
    cmd=["psql","-X","--no-psqlrc","--no-password","-q","-v","ON_ERROR_STOP=1",
         "-h",host,"-p","5432","-U",user,"-d","postgres"]
    return cmd,env

def run_psql(key,sql,timeout=40):
    cmd,env=cmd_env(key)
    p=subprocess.run(cmd+["-A","-t","-c",sql],env=env,
                     capture_output=True,timeout=timeout)
    if p.returncode: raise RuntimeError("An isolated database preflight query failed")
    return p.stdout.decode().strip()

def source_preflight():
    result=run_psql("GOS_SOURCE_DB_URL","""BEGIN READ ONLY;
SELECT current_user,
 (SELECT count(*) FROM qwiz_auth_export.users),
 (SELECT count(*) FROM qwiz_auth_export.identities),
 (SELECT count(*) FROM pg_policy p
  JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE p.polname='qwiz_auth_migration_ttl'
    AND n.nspname='qwiz_auth_export');
COMMIT;""")
    parts=result.split("|")
    if len(parts)!=4 or parts[0]!="qwiz_catalog_reader" or parts[1]!="11" or parts[3]!="2":
        raise ValueError("Old GOS Auth snapshot access/scope check failed")
    identities=int(parts[2])
    if identities<1 or identities>44:raise ValueError("Unexpected identity count")
    return identities

def target_preflight():
    result=run_psql("QWIZ_TARGET_DB_URL","""BEGIN READ ONLY;
SELECT (SELECT count(*) FROM qwiz_auth_snapshot.users),
(SELECT count(*) FROM qwiz_auth_snapshot.identities),
(SELECT count(*) FROM auth.users),
(SELECT count(*) FROM pg_tables WHERE schemaname='qwiz_transfer_stage'),
has_schema_privilege('anon','qwiz_auth_snapshot','USAGE')::int,
has_schema_privilege('authenticated','qwiz_auth_snapshot','USAGE')::int,
has_schema_privilege('service_role','qwiz_auth_snapshot','USAGE')::int;
COMMIT;""")
    if result!="0|0|0|57|0|0|0":
        raise ValueError("Auth stage already populated or QWIZ Free permissions changed")

def export_csv(table,out):
    col=",".join(COLS[table])
    query="COPY (SELECT "+col+" FROM qwiz_auth_export."+table+
          " ORDER BY id) TO STDOUT WITH (FORMAT CSV)"
    cmd,env=cmd_env("GOS_SOURCE_DB_URL")
    with out.open("wb") as dest:
        os.chmod(out,0o600)
        p=subprocess.run(cmd+["-c",query],env=env,stdout=dest,
                         stderr=subprocess.PIPE,timeout=50)
    if p.returncode or out.stat().st_size==0 or out.stat().st_size>2*1024*1024:
        raise RuntimeError("Scoped source Auth export unavailable or size exceeded")

def import_stage(temp,identity_count):
    source=temp/"users.csv"
    source2=temp/"identities.csv"
    # Restrict paths to our private temporary runner directory.
    if any("'" in str(x) or "\n" in str(x) for x in (source,source2)):
        raise ValueError("Invalid private staging path")
    n=identity_count
    cols_user=",".join(COLS["users"])
    cols_identity=",".join(COLS["identities"])
    sql="""BEGIN;
SET LOCAL statement_timeout='90s';
SET LOCAL lock_timeout='2000ms';
DO $guards$ BEGIN
 IF (SELECT count(*) FROM auth.users)<>0
 OR (SELECT count(*) FROM qwiz_auth_snapshot.users)<>0
 OR (SELECT count(*) FROM qwiz_auth_snapshot.identities)<>0
 OR has_schema_privilege('anon','qwiz_auth_snapshot','USAGE')
 OR has_schema_privilege('authenticated','qwiz_auth_snapshot','USAGE')
 OR has_schema_privilege('service_role','qwiz_auth_snapshot','USAGE')
 THEN RAISE EXCEPTION 'Auth staging target not empty or role isolation broken'; END IF;
END $guards$;
"""
    sql += "\\copy qwiz_auth_snapshot.users("+cols_user+") FROM '"+str(source)+"' WITH (FORMAT CSV)\n"
    sql += "\\copy qwiz_auth_snapshot.identities("+cols_identity+") FROM '"+str(source2)+"' WITH (FORMAT CSV)\n"
    sql += """DO $verify$ DECLARE missing int; extras int;
BEGIN
 IF (SELECT count(*) FROM qwiz_auth_snapshot.users)<>11
 OR (SELECT count(*) FROM qwiz_auth_snapshot.identities)<>"""+str(n)+""" THEN
 RAISE EXCEPTION 'Incomplete scoped Auth staging';
 END IF;
 WITH needed AS (
  SELECT user_id AS id FROM qwiz_transfer_stage.org_next_players WHERE user_id IS NOT NULL
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
 SELECT
 (SELECT count(*) FROM needed x WHERE NOT EXISTS (SELECT FROM qwiz_auth_snapshot.users u WHERE u.id=x.id)),
 (SELECT count(*) FROM qwiz_auth_snapshot.users u WHERE NOT EXISTS (SELECT FROM needed x WHERE u.id=x.id))
 INTO missing,extras;
 IF missing<>0 OR extras<>0 THEN
 RAISE EXCEPTION 'Auth scope does not match QWIZ game FK users';
 END IF;
END $verify$;
COMMIT;
"""
    file=temp/"apply.sql"
    file.write_text(sql,encoding="utf-8")
    os.chmod(file,0o600)
    cmd,env=cmd_env("QWIZ_TARGET_DB_URL")
    p=subprocess.run(cmd+["-f",str(file)],env=env,capture_output=True,timeout=160)
    if p.returncode:
        raise RuntimeError("Scoped Auth target stage transaction failed")
    verified=run_psql("QWIZ_TARGET_DB_URL","""BEGIN READ ONLY;
SELECT (SELECT count(*) FROM qwiz_auth_snapshot.users),
(SELECT count(*) FROM qwiz_auth_snapshot.identities),
(SELECT count(*) FROM auth.users);
COMMIT;""")
    if verified!=f"11|{n}|0":
        raise RuntimeError("Failed independent exact-count Auth stage verification")
    print("PRIVATE_AUTH_STAGING_SUCCESS users=11 identities="+str(n)+" live_auth_users=0")

def main():
    identities=source_preflight()
    target_preflight()
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix="qwiz-11-auth-restricted-") as d:
        work=Path(d)
        export_csv("users",work/"users.csv")
        export_csv("identities",work/"identities.csv")
        import_stage(work,identities)

if __name__=="__main__":
    try: main()
    except Exception as e:
        print("PRIVATE_AUTH_TRANSFER_BLOCKED "+type(e).__name__,
              file=sys.stderr)
        sys.exit(1)
