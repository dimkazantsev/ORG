#!/usr/bin/env python3
"""Apply pre-reviewed atomic Auth+game SQL ONLY to isolated QWIZ Free.

This script cannot read/write old GOS project and does not print credentials,
source Auth rows or SQL text. Requires the exact eleven real Auth users to have
already been staged in the independent Free project.
"""
import importlib.util
import sys
from pathlib import Path
import subprocess

BASE=Path(__file__).resolve().parent
SPEC=importlib.util.spec_from_file_location("private_auth",BASE/"transfer-exact-11-auth-snapshot.py")
TRANSFER=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TRANSFER)

def run():
    sql_path=BASE/"FINAL-QWIZ-LIVE-IMPORT-AFTER-AUTH.sql"
    sql=sql_path.read_text(encoding="utf-8")
    if not(sql.lstrip().startswith("-- QWIZ-PARTY FREE ONLY:")
           and "SELECT pg_advisory_xact_lock" in sql
           and "EXACTLY 11 QWIZ game FK users" in sql
           and "SET CONSTRAINTS ALL IMMEDIATE;" in sql
           and sql.rstrip().endswith("COMMIT;")):
        raise ValueError("Unexpected or unreviewed atomic restore script")
    scope=TRANSFER.run_psql("QWIZ_TARGET_DB_URL","""BEGIN READ ONLY;
SELECT (SELECT count(*) FROM qwiz_auth_snapshot.users),
       (SELECT count(*) FROM qwiz_auth_snapshot.identities),
       (SELECT count(*) FROM auth.users),
       (SELECT count(*) FROM qwiz_transfer_stage.qwiz_bank),
       (SELECT count(*) FROM qwiz_transfer_stage.org_quiz_questions),
       (SELECT count(*) FROM public.qwiz_bank);
COMMIT;""")
    if len(scope.split("|"))!=6:
        raise ValueError("Unexpected target preflight")
    users,identities,live_users,bank,questions,live_bank=map(int,scope.split("|"))
    if users!=11 or identities<1 or identities>44 or live_users!=0 or bank!=716 or questions!=927 or live_bank!=0:
        raise ValueError("Auth/row source scope not ready or live target modified")
    cmd,env=TRANSFER.cmd_env("QWIZ_TARGET_DB_URL")
    cmd+=["-f",str(sql_path)]
    p=subprocess.run(cmd,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                     timeout=650)
    if p.returncode:
        raise RuntimeError("Atomic QWIZ target restore failed and was rolled back")
    result=TRANSFER.run_psql("QWIZ_TARGET_DB_URL","""BEGIN READ ONLY;
SELECT (SELECT count(*) FROM auth.users),
       (SELECT count(*) FROM public.qwiz_bank),
       (SELECT count(*) FROM public.org_quiz_questions),
       (SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND k.contype='f' AND k.condeferrable
            AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%' OR c.relname LIKE 'org_quiz_%'));
COMMIT;""")
    if result!="11|716|927|0":
        raise RuntimeError("QWIZ committed restoration counts/constraint properties mismatch")
    print("QWIZ_LIVE_DB_RESTORE_VERIFIED Auth=11 bank=716 questions=927 source_FK_mode_restored=true")
    print("FRONTEND_NOT_SWITCHED; Old GOS database unmodified; Storage still requires audit")

if __name__=="__main__":
    try:
        run()
    except Exception as exc:
        print("QWIZ_CUTOVER_GUARD_REFUSED "+type(exc).__name__,file=sys.stderr)
        sys.exit(1)
