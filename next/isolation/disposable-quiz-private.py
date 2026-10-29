#!/usr/bin/env python3
"""Disposable reconstruction of quiz_private dependencies, no user data.

Creates two empty private tables and nine function declarations only.
No private values, stored keys, game records or credentials are read.
"""
import argparse
import json
from pathlib import Path

TABLES={"org_quiz_keys","qwiz_flags_reset_archive_20261022"}
FUNCS={"combo_multiplier","is_quiz_admin","org_quiz_open_steal_impl",
"org_quiz_rescue_impl","org_quiz_submit_payload_v2_impl",
"org_quiz_submit_payload_v3_impl","org_quiz_submit_steal_impl",
"org_quiz_use_power_impl","power_gain_for_streak"}
def qi(x):return '"'+str(x).replace('"','""')+'"'
def main():
    p=argparse.ArgumentParser();p.add_argument("private_manifest");p.add_argument("output")
    a=p.parse_args()
    rows=[x for x in Path(a.private_manifest).read_text().splitlines() if x.lstrip().startswith("{")]
    if len(rows)!=1:raise ValueError("Private manifest must have one JSON object")
    doc=json.loads(rows[0])
    if doc.get("project_ref")!="bderfrcfuhnutuoyudje":raise ValueError("Not GOS source")
    t={x["name"] for x in doc["relations"]}
    f={x["name"] for x in doc["functions"]}
    if t!=TABLES or f!=FUNCS:raise ValueError("quiz_private closure changed; review first")
    by_table={name:[] for name in t}
    for c in doc["columns"]:
        if c["table"] not in t:raise ValueError("Unexpected private column")
        by_table[c["table"]].append(c)
    sql=["CREATE SCHEMA quiz_private;"]
    for table in sorted(t):
        columns=sorted(by_table[table],key=lambda x:x["position"])
        sql.append("CREATE TABLE quiz_private."+qi(table)+" ("+
          ", ".join(qi(c["column"])+" "+c["type"]+(" NOT NULL" if c["not_null"] else "") for c in columns)+");")
        sql.append("ALTER TABLE quiz_private."+qi(table)+" ENABLE ROW LEVEL SECURITY;")
        # Preserve defaults on the two private tables; no private rows exported.
        for c in columns:
            if c.get("default"):
                sql.append("ALTER TABLE quiz_private."+qi(table)+" ALTER COLUMN "+
                           qi(c["column"])+" SET DEFAULT "+c["default"]+";")
    for c in doc["constraints"]:
        if c["table"] not in t:raise ValueError("Unexpected private constraint")
        sql.append("ALTER TABLE quiz_private."+qi(c["table"])+" ADD CONSTRAINT "+
                   qi(c["name"])+" "+c["definition"]+";")
    sql.append("SET check_function_bodies = off;")
    for fn in doc["functions"]:
        if not fn["definition"].startswith(("CREATE OR REPLACE FUNCTION","CREATE FUNCTION")):
            raise ValueError("Unexpected private function DDL")
        sql.append(fn["definition"].rstrip(";")+";")
    Path(a.output).write_text("\n".join(sql)+"\n")
    print("DISPOSABLE_PRIVATE_CLOSURE_PREPARED: tables=2 functions=9; source_rows=0")
if __name__=="__main__":main()
