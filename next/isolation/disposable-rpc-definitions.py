#!/usr/bin/env python3
"""Generate PRIVATE, disposable-only definitions of QWIZ SQL routines.

Never deploy to production. Disables body validation ONLY in disposable
test database to detect syntax/return-type issues without side-effect calls.
"""
import argparse
import json
from pathlib import Path

def main():
    p=argparse.ArgumentParser()
    p.add_argument("source_json")
    p.add_argument("scratch_sql")
    a=p.parse_args()
    lines=[v for v in Path(a.source_json).read_text().splitlines() if v.lstrip().startswith("{")]
    if len(lines)!=1:raise ValueError("Expected one private schema JSON record")
    doc=json.loads(lines[0])
    if doc.get("project_ref")!="bderfrcfuhnutuoyudje":raise ValueError("Incorrect source project")
    funcs=doc["routines"]
    if len(funcs)!=139:raise ValueError("Expected 137 QWIZ plus two related helper routines")
    accepted=("qwiz_","org_next_","org_quiz_")
    helpers={"org_party_create_set_from_questions","org_party_set_life_state"}
    body=["-- Scratch-only RPC definition parser (NOT production migration).",
          "SET check_function_bodies = off;"]
    for entry in funcs:
        if not (entry["name"].startswith(accepted) or entry["name"] in helpers):
            raise ValueError("Unrelated GOS function in source manifest")
        definition=entry["definition"].rstrip()
        if not definition.startswith(("CREATE OR REPLACE FUNCTION", "CREATE OR REPLACE PROCEDURE", "CREATE FUNCTION", "CREATE PROCEDURE")):
            raise ValueError("Unexpected function definition kind")
        body.append(definition.rstrip(";")+";")
    Path(a.scratch_sql).write_text("\n\n".join(body)+"\n")
    print("DISPOSABLE_RPC_DEFINITIONS_PREPARED: count=139, never executed, no live production DDL")
if __name__=="__main__":
    main()
