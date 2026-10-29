#!/usr/bin/env python3
"""Apply one QWIZ-only staging SQL transaction to the independent Free database.

The SQL input is built privately by build-private-qwiz-row-stage.py from a
read-only source snapshot. Never prints SQL/records/passwords. This is NOT a
live-game import or a user/identity migration.
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("pooler", ROOT/"safe-session-pooler.py")
pooler=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pooler)

def main():
    if len(sys.argv)!=2:
        raise ValueError("Expected one private staging SQL path")
    sqlfile=Path(sys.argv[1])
    if not sqlfile.is_file() or sqlfile.stat().st_size>52*1024*1024:
        raise ValueError("Missing or oversized private staging SQL")
    with sqlfile.open(encoding="utf-8") as inp:
        head=inp.read(2200)
    with sqlfile.open("rb") as inp:
        inp.seek(max(0,sqlfile.stat().st_size-80))
        tail=inp.read().decode("utf-8")
    if not (head.startswith("BEGIN;")
            and "Target private staging refused" in head
            and "CREATE SCHEMA qwiz_transfer_stage" in head
            and tail.rstrip().endswith("COMMIT;")):
        raise ValueError("Not a guarded staging transaction")
    user,password,host,raw=pooler.credentials("QWIZ_TARGET_DB_URL")
    if user!="postgres.vwsoergltegncrretxnz" or "eu-west-1" not in host:
        raise ValueError("Refusing target other than independently verified QWIZ Free")
    if len(password)>=2 and (password[0],password[-1]) in (("[","]"),("'","'"),('"','"')):
        password=password[1:-1]
    env=os.environ.copy()
    env.pop("QWIZ_TARGET_DB_URL",None)
    env.pop("GOS_SOURCE_DB_URL",None)
    env.update({"PGPASSWORD":password,"PGSSLMODE":"require","PGCONNECT_TIMEOUT":"8"})
    cmd=["psql","-X","--no-psqlrc","--no-password","-q",
         "-v","ON_ERROR_STOP=1","-h",host,"-p","5432","-U",user,
         "-d","postgres","-f",str(sqlfile)]
    p=subprocess.run(cmd,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                     timeout=650)
    if p.returncode:
        raise RuntimeError("QWIZ Free private staging transaction failed")
    print("QWIZ_PRIVATE_STAGE_TRANSACTION_COMMITTED; verify counts and grants separately")
if __name__=="__main__":
    try: main()
    except Exception as err:
        print("QWIZ_STAGE_REFUSED "+type(err).__name__,file=sys.stderr)
        sys.exit(1)
