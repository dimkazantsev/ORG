#!/usr/bin/env python3
"""Build least-privilege QWIZ ACLs from live PostgreSQL catalog manifest.

Scratch-only until reviewed; REVOKE PUBLIC defaults, then regrant explicitly.
All statement bodies stay in the private temporary GitHub runner.
"""
import argparse
import collections
import json
from pathlib import Path

TABLE_ROLES={"PUBLIC","anon","authenticated","service_role","postgres"}
TABLE_PRIVS={"SELECT","INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER","MAINTAIN"}
FUNC_ROLES=TABLE_ROLES

def quote_id(s):return '"'+str(s).replace('"','""')+'"'

def main():
    p=argparse.ArgumentParser();p.add_argument("manifest");p.add_argument("output")
    args=p.parse_args()
    lines=[l for l in Path(args.manifest).read_text().splitlines() if l.lstrip().startswith("{")]
    if len(lines)!=1:raise ValueError("Unexpected source catalog shape")
    o=json.loads(lines[0])
    if o.get("project_ref")!="bderfrcfuhnutuoyudje":raise ValueError("Unexpected GOS source")
    tables={x["name"] for x in o["relations"] if x["kind"] in ("r","p","v","m")}
    fs={(x["name"],x["arguments"]) for x in o["routines"]}
    if len(tables)!=61 or len(fs)!=139:raise ValueError("Unexpected source QWIZ table/view/function count")
    out=[]
    # Supabase-managed roles are pre-existing in managed projects, but the
    # disposable vanilla PostgreSQL fixture needs harmless NOLOGIN stubs.
    for role in ("anon","authenticated","service_role"):
        out.append("DO $scratch$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='"+
                   role+"') THEN CREATE ROLE "+quote_id(role)+
                   " NOLOGIN; END IF; END $scratch$;")
    for t in sorted(tables):
        if not t.startswith(("qwiz_","org_next_","org_quiz_")):raise ValueError("External table")
        out.append("REVOKE ALL PRIVILEGES ON TABLE public."+quote_id(t)+
                   " FROM PUBLIC, anon, authenticated, service_role;")
    for name,sign in sorted(fs):
        out.append("REVOKE ALL PRIVILEGES ON FUNCTION public."+quote_id(name)+"("+sign+
                   ") FROM PUBLIC, anon, authenticated, service_role;")
    counts=collections.Counter()
    for g in o.get("table_grants",[]):
        if g["table"] not in tables or g["grantee"] not in TABLE_ROLES or g["privilege"] not in TABLE_PRIVS:
            raise ValueError("Unexpected source table privilege/grantee")
        if g["grantee"]=="postgres":continue
        suffix=" WITH GRANT OPTION" if g.get("grantable") else ""
        out.append("GRANT "+g["privilege"]+" ON TABLE public."+quote_id(g["table"])+
                   " TO "+("PUBLIC" if g["grantee"]=="PUBLIC" else quote_id(g["grantee"]))+suffix+";")
        counts[("table",g["grantee"])]+=1
    for g in o.get("routine_grants",[]):
        if (g["name"],g["arguments"]) not in fs or g["grantee"] not in FUNC_ROLES or g["privilege"]!="EXECUTE":
            raise ValueError("Unexpected source function privilege/grantee")
        if g["grantee"]=="postgres":continue
        suffix=" WITH GRANT OPTION" if g.get("grantable") else ""
        out.append("GRANT EXECUTE ON FUNCTION public."+quote_id(g["name"])+"("+g["arguments"]+
                   ") TO "+("PUBLIC" if g["grantee"]=="PUBLIC" else quote_id(g["grantee"]))+suffix+";")
        counts[("function",g["grantee"])]+=1
    Path(args.output).write_text("\n".join(out)+"\n")
    print("DISPOSABLE_ACL_PREPARED: tables_and_views="+str(len(tables))+
          " routines="+str(len(fs))+" source_table_grants="+str(len(o["table_grants"]))+
          " source_function_grants="+str(len(o["routine_grants"]))+
          " revoked_public_defaults=yes; no user rows")
if __name__=="__main__":main()
