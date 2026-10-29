#!/usr/bin/env python3
"""Build a private, transaction-wrapped 57-table QWIZ staging import.

Input is pg_dump --data-only --column-inserts from a strictly limited role.
This reads no Auth/Storage rows. Output is temporary runner-only SQL; never
publish its contents or upload it as a GitHub artifact.
"""
import argparse
import collections
import re
from pathlib import Path

PAT=re.compile(r"(?m)^INSERT INTO public\.([a-z_][a-z_0-9]*)\b")
ALLOWED=re.compile(r"^(qwiz_|org_next_|org_quiz_)[a-z0-9_]+$")

def scan_statement(data,pos):
    single=False
    double=False
    i=pos
    while i<len(data):
        ch=data[i]
        if single:
            if ch=="'" and i+1<len(data) and data[i+1]=="'":
                i+=2
                continue
            if ch=="'" and (i==0 or data[i-1]!="\\"):
                single=False
        elif double:
            if ch=='"':
                double=False
        elif ch=="'":single=True
        elif ch=='"':double=True
        elif ch==";":return data[pos:i+1],i+1
        i+=1
    raise ValueError("Unterminated source INSERT statement")

def main():
    p=argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("tables")
    p.add_argument("output")
    x=p.parse_args()
    names=Path(x.tables).read_text().splitlines()
    if len(names)!=57 or len(set(names))!=57 or not all(
        ALLOWED.fullmatch(n) for n in names):
        raise ValueError("Expected exactly 57 known public QWIZ tables")
    data=Path(x.dump).read_text(encoding="utf-8")
    matches=list(PAT.finditer(data))
    inserts=[]
    totals=collections.Counter()
    last_end=0
    for m in matches:
        if m.start()<last_end:
            continue  # Text inside a previously parsed quoted SQL literal.
        name=m.group(1)
        if name not in names:raise ValueError("An unrelated GOS INSERT was found")
        stmt,end=scan_statement(data,m.start())
        if not stmt.endswith(";"):raise ValueError("Invalid INSERT statement")
        stmt=stmt.replace("INSERT INTO public."+name,
                          "INSERT INTO qwiz_transfer_stage."+name,1)
        inserts.append(stmt)
        totals[name]+=1
        last_end=end
    if not inserts:raise ValueError("Source dump contains no QWIZ INSERTs")
    # Strictly reject other data records. Sequence setval is expected and is
    # intentionally excluded: target public sequences MUST NOT be changed.
    if len(matches)!=len(inserts):raise ValueError("Unexpected nested INSERT syntax")
    sql=["BEGIN;","SET LOCAL statement_timeout='480s';",
         "SET LOCAL lock_timeout='2000ms';",
         """DO $guard$
BEGIN
 IF (SELECT count(*) FROM auth.users)<>0 OR
    (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND
      (tablename LIKE 'qwiz_%' OR tablename LIKE 'org_next_%' OR
       tablename LIKE 'org_quiz_%'))<>57 OR
    EXISTS(SELECT FROM pg_namespace WHERE nspname='qwiz_transfer_stage')
 THEN RAISE EXCEPTION 'Target private staging refused'; END IF;
END;
$guard$;""",
         "CREATE SCHEMA qwiz_transfer_stage AUTHORIZATION postgres;",
         "REVOKE ALL ON SCHEMA qwiz_transfer_stage FROM PUBLIC,anon,authenticated,service_role;"]
    for name in names:
        sql.append('CREATE TABLE qwiz_transfer_stage."'+name+
                   '" (LIKE public."'+name+'");')
        sql.append('ALTER TABLE qwiz_transfer_stage."'+name+
                   '" ENABLE ROW LEVEL SECURITY;')
    sql.append("REVOKE ALL ON ALL TABLES IN SCHEMA qwiz_transfer_stage FROM PUBLIC,anon,authenticated,service_role;")
    sql.extend(inserts)
    for name in names:
        sql.append("""DO $verify$
BEGIN
 IF (SELECT count(*) FROM qwiz_transfer_stage."""+name+""")<>"""+
                   str(totals[name])+""" THEN
 RAISE EXCEPTION 'Private QWIZ staging count check failed';
 END IF;
END;
$verify$;""")
    sql.append("COMMIT;")
    output=Path(x.output)
    output.write_text("\n".join(sql)+"\n",encoding="utf-8")
    output.chmod(0o600)
    print("PRIVATE_QWIZ_STAGE_BUILT tables=57 inserted_rows="+str(sum(totals.values()))+
          " nonempty_tables="+str(len(totals)))
if __name__=="__main__":
    main()
