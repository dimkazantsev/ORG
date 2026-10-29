#!/usr/bin/env python3
"""Read one *private ephemeral* QWIZ catalog JSON file; emit ONLY aggregate checks.

Never print SQL definitions, names or data. No external HTTP or persistence.
"""
from pathlib import Path
import argparse
import collections
import hashlib
import json
import re
import sys

FAMILIES = ("qwiz_", "org_next_", "org_quiz_")
MIN_TABLES = {"qwiz_":36, "org_next_":5, "org_quiz_":16}
MIN_FUNCTIONS = {"qwiz_":95, "org_next_":10, "org_quiz_":32}
EXPECTED_HELPERS = {"org_party_create_set_from_questions","org_party_set_life_state"}

def parse(data):
    # psql --quiet and --tuples-only typically emits only the JSON row, but
    # accept harmless preceding transaction status lines if client differs.
    lines = [l for l in data.splitlines() if l.lstrip().startswith("{")]
    if len(lines) != 1:
        raise ValueError("Expected exactly one private catalog JSON record")
    return json.loads(lines[0])

def verify(o):
    if o.get("project_ref") != "bderfrcfuhnutuoyudje":
        raise ValueError("Source project ref is not GOS.ID")
    required=("relations","columns","constraints","indexes","triggers","policies","views","routines","required_auth_fk")
    if any(not isinstance(o.get(k),list) for k in required):
        raise ValueError("Missing mandatory schema sections")
    rel=collections.Counter()
    func=collections.Counter()
    for r in o["relations"]:
        if r["kind"] in ("r","p"):
            f=next((k for k in FAMILIES if r["name"].startswith(k)),None)
            if f:
                rel[f]+=1
        if not r["name"].startswith(FAMILIES):
            raise ValueError("Found unrelated GOS relation in QWIZ manifest")
    for r in o["routines"]:
        f=next((k for k in FAMILIES if r["name"].startswith(k)),None)
        if f:
            func[f]+=1
        elif r["name"] not in EXPECTED_HELPERS:
            raise ValueError("Found unrelated GOS function in QWIZ manifest")
    for k,n in MIN_TABLES.items():
        if rel[k]<n:
            raise ValueError(f"Missing source tables for {k}: {rel[k]} < {n}")
    for k,n in MIN_FUNCTIONS.items():
        if func[k]<n:
            raise ValueError(f"Missing source routines for {k}: {func[k]} < {n}")
    helpers = {x["name"] for x in o["routines"] if x["name"] in EXPECTED_HELPERS}
    if helpers != EXPECTED_HELPERS:
        raise ValueError("Missing QWIZ legacy helper routine")
    definer=sum(1 for x in o["routines"] if x["security_definer"])
    digest=hashlib.sha256(json.dumps(o,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return {
        "origin_project_confirmed":True,
        "postgres_version":o["postgres"],
        "tables_by_family":dict(rel),
        "functions_by_family":dict(func),
        "extra_legacy_helpers":len(helpers),
        "security_definer_total":definer,
        "columns":len(o["columns"]),
        "constraints":len(o["constraints"]),
        "indexes":len(o["indexes"]),
        "triggers":len(o["triggers"]),
        "rls_policies":len(o["policies"]),
        "views":len(o["views"]),
        "foreign_keys_to_non_public":len(o["required_auth_fk"]),
        "manifest_sha256":digest,
        "manifest_version":o["version"],
        "schema_material_only":True,
        "data_rows_exported":0,
    }

def main():
    a=argparse.ArgumentParser()
    a.add_argument("private_manifest")
    args=a.parse_args()
    result=verify(parse(Path(args.private_manifest).read_text()))
    print("SOURCE_CATALOG_VALIDATED: "+json.dumps(result,sort_keys=True))
    print("PRIVATE SOURCE SQL BODIES WERE NOT DISPLAYED, UPLOADED OR COMMITTED.")

if __name__=="__main__":
    main()
