#!/usr/bin/env python3
"""Create an ephemeral, NON-PRODUCTION table-type compatibility fixture.

Only the 57 QWIZ table names, column SQL types, and NOT NULL attributes are
used. Defaults, data, functions, constraints and identity are intentionally
NOT included. NEVER deploy this fixture to a real Supabase project.
"""
import argparse
import collections
import json
from pathlib import Path

def quote_ident(value):
    return '"' + str(value).replace('"','""') + '"'

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("source_json")
    parser.add_argument("scratch_sql")
    args=parser.parse_args()
    entries=[s for s in Path(args.source_json).read_text().splitlines() if s.lstrip().startswith("{")]
    if len(entries)!=1:
        raise ValueError("Expected exactly one private source schema manifest")
    src=json.loads(entries[0])
    if src.get("project_ref")!="bderfrcfuhnutuoyudje":
        raise ValueError("Source must be the original GOS.ID project")
    cols=collections.defaultdict(list)
    for c in src["columns"]:
        cols[c["table"]].append(c)
    tables=[r for r in src["relations"] if r["kind"] in ("r","p")]
    if len(tables)!=57:
        raise ValueError("Expected 57 source QWIZ tables")
    ddl=[]
    for t in tables:
        if t["kind"]!="r":
            raise ValueError("Partitioned table requires special migration planning")
        name=t["name"]
        if not name.startswith(("qwiz_","org_next_","org_quiz_")):
            raise ValueError("Unrelated GOS.ID table detected")
        columns=sorted(cols[name],key=lambda c:c["position"])
        fields=[quote_ident(c["column"])+" "+c["type"]+(" NOT NULL" if c["not_null"] else "") for c in columns]
        ddl.append("CREATE TABLE public."+quote_ident(name)+" ("+", ".join(fields)+");")
        ddl.append("ALTER TABLE public."+quote_ident(name)+" ENABLE ROW LEVEL SECURITY;")
    Path(args.scratch_sql).write_text("\n".join(ddl)+"\n")
    print("DISPOSABLE_TABLE_TYPES_PREPARED: tables=57; columns="+str(len(src["columns"]))+"; user_rows=0")

if __name__=="__main__":
    main()
