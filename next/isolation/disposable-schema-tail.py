#!/usr/bin/env python3
"""Disposable QWIZ schema tail: 151 defaults, 20 RLS policies, 4 views, 9 triggers.

ONLY for ephemeral PG fixture. Does not export data and is NOT a production
migration. Runs after skeleton tables, constraints, indexes and 139 functions.
"""
import argparse
import json
import re
from pathlib import Path

FAMILY=("qwiz_","org_next_","org_quiz_")
ALLOWED_ROLES={"PUBLIC","anon","authenticated","service_role","postgres","authenticator","supabase_auth_admin"}
def qi(s):
    return '"' + str(s).replace('"','""') + '"'

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("output")
    a=ap.parse_args()
    rows=[x for x in Path(a.manifest).read_text().splitlines() if x.lstrip().startswith("{")]
    if len(rows)!=1:raise ValueError("Expected one private manifest")
    o=json.loads(rows[0])
    if o.get("project_ref")!="bderfrcfuhnutuoyudje":raise ValueError("Not the original source")
    defaults=[c for c in o["columns"] if c.get("default")]
    if len(defaults)!=151:raise ValueError("Unexpected number of source defaults")
    if any(c.get("identity") or c.get("generated") for c in o["columns"]):
        raise ValueError("Identity/generated column support requires review")
    if len(o["policies"])!=20 or len(o["views"])!=4 or len(o["triggers"])!=9:
        raise ValueError("Unexpected policy/view/trigger count")
    lines=["-- Discardable scratch-only schema. Never apply to real Supabase.",
           'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
           "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';",
           "CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS 'SELECT NULL::jsonb';"]
    names=set()
    for policy in o["policies"]:
        names.update(policy.get("role_names") or [])
    if not names.issubset(ALLOWED_ROLES):raise ValueError("Unrecognized role in source RLS policy")
    for role in sorted(names-{"PUBLIC","postgres"}):
        lines.append("DO $scratch$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname="+
                     "'"+role+"') THEN CREATE ROLE "+qi(role)+" NOLOGIN; END IF; END $scratch$;")
    for col in defaults:
        if not col["table"].startswith(FAMILY):raise ValueError("Non-quiz column")
        lines.append("ALTER TABLE public."+qi(col["table"])+" ALTER COLUMN "+qi(col["column"])+
                     " SET DEFAULT "+col["default"]+";")
    for v in o["views"]:
        if not v["name"].startswith(FAMILY):raise ValueError("Unexpected GOS view")
        lines.append("CREATE VIEW public."+qi(v["name"])+" AS "+v["definition"].rstrip(";")+";")
    commands={"r":"SELECT","a":"INSERT","w":"UPDATE","d":"DELETE","*":"ALL"}
    for p in o["policies"]:
        if not p["table"].startswith(FAMILY):raise ValueError("Unexpected GOS policy")
        kind=commands.get(p["command"])
        if kind is None:raise ValueError("Unknown PostgreSQL policy command")
        roles=p.get("role_names") or []
        if not roles or not set(roles).issubset(ALLOWED_ROLES):raise ValueError("Policy role missing/not permitted")
        sql=("CREATE POLICY "+qi(p["name"])+" ON public."+qi(p["table"])+
            (" AS PERMISSIVE" if p["permissive"] else " AS RESTRICTIVE")+
            " FOR "+kind+" TO "+", ".join(role if role=="PUBLIC" else qi(role) for role in roles))
        if p["using"] is not None:sql+=" USING ("+p["using"]+")"
        if p["with_check"] is not None:sql+=" WITH CHECK ("+p["with_check"]+")"
        lines.append(sql+";")
    for trig in o["triggers"]:
        if not trig["table"].startswith(FAMILY):raise ValueError("Non-quiz trigger")
        lines.append(trig["definition"].rstrip(";")+";")
        if trig["enabled"]=="D":
            lines.append("ALTER TABLE public."+qi(trig["table"])+" DISABLE TRIGGER "+qi(trig["name"])+";")
    Path(a.output).write_text("\n".join(lines)+"\n")
    print("DISPOSABLE_TAIL_PREPARED: defaults=151 policies=20 views=4 triggers=9; user_rows=0")
if __name__=="__main__":
    main()
