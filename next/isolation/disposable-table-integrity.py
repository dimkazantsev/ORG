#!/usr/bin/env python3
"""Generate disposable-only constraints and index compatibility fixture.

Never deploy this file to real Supabase: it lacks the actual auth policies, RPC,
sequence defaults and live data. The output is private ephemeral runner state.
"""
import argparse
import json
import collections
from pathlib import Path

def qi(value):
    return '"'+str(value).replace('"','""')+'"'

def run():
    p=argparse.ArgumentParser()
    p.add_argument("source_json")
    p.add_argument("scratch_sql")
    a=p.parse_args()
    records=[s for s in Path(a.source_json).read_text().splitlines() if s.lstrip().startswith("{")]
    if len(records)!=1: raise ValueError("Expected one catalog JSON object")
    z=json.loads(records[0])
    if z.get("project_ref")!="bderfrcfuhnutuoyudje":raise ValueError("Unexpected source ref")
    tables={r["name"] for r in z["relations"] if r["kind"] in ("r","p")}
    if len(tables)!=57:raise ValueError("Missing QWIZ tables")
    cons=z["constraints"]
    indexes=z["indexes"]
    if len(cons)!=283 or len(indexes)!=111:
        raise ValueError("Unexpected constraint or index counts")
    lines=["CREATE SCHEMA auth;",
           "CREATE TABLE auth.users (id uuid PRIMARY KEY);"]
    # PostgreSQL must know primary/unique candidate keys before foreign keys.
    order={"p":0,"u":1,"x":2,"c":3,"f":4}
    for c in sorted(cons,key=lambda v:(order.get(v["kind"],10),v["table"],v["name"])):
        if c["table"] not in tables:raise ValueError("External table in QWIZ constraints")
        if c["kind"] not in order:raise ValueError("Unknown constraint type")
        lines.append("ALTER TABLE public."+qi(c["table"])+" ADD CONSTRAINT "+
                     qi(c["name"])+" "+c["definition"]+";")
    constrained={c["name"] for c in cons if c["kind"] in ("p","u","x")}
    optional=0
    for i in indexes:
        if i["table"] not in tables:raise ValueError("Unknown indexed table")
        if i["name"] in constrained:continue
        lines.append(i["definition"].rstrip(";")+";")
        optional+=1
    Path(a.scratch_sql).write_text("\n".join(lines)+"\n")
    print("DISPOSABLE_INTEGRITY_GENERATED: constraints=283, additional_indexes="+str(optional)+", user_rows=0")

if __name__=="__main__":
    run()
