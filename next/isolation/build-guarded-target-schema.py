#!/usr/bin/env python3
"""Build a guarded, single-transaction QWIZ SCHEMA ONLY candidate.

Inputs are private, read-only catalog manifests from GOS.ID.
Output stays in ephemeral GitHub runner; never upload to public artifacts/logs.
No Auth users, game rows, Storage objects, or sessions are exported.
Only for EMPTY destination Supabase project after separate target verification.
"""
from pathlib import Path
import argparse
import json
import subprocess
import sys
import tempfile

HERE=Path(__file__).resolve().parent

def generate(script, manifests, output):
    subprocess.run([sys.executable,str(HERE/script),*(str(x) for x in manifests),str(output)],
                   check=True,stdout=subprocess.DEVNULL)

def strip_exact(text,expected):
    lines=text.splitlines(keepends=True)
    if lines[:len(expected)]!=[x+"\n" for x in expected]:
        raise ValueError("Generated scratch fixture has unexpected auth stubs")
    return "".join(lines[len(expected):])

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("public_manifest")
    parser.add_argument("private_manifest")
    parser.add_argument("target_sql")
    a=parser.parse_args()
    doc=json.loads(next(l for l in Path(a.public_manifest).read_text().splitlines() if l.startswith("{")))
    if doc["project_ref"]!="bderfrcfuhnutuoyudje" or len(doc["relations"])!=61:
        raise ValueError("Unexpected source snapshot or QWIZ closure")
    with tempfile.TemporaryDirectory(prefix="qwiz-bundle-") as d:
        root=Path(d)
        scripts=[
            ("disposable-table-types.py", [a.public_manifest]),
            ("disposable-table-integrity.py", [a.public_manifest]),
            ("disposable-quiz-private.py", [a.private_manifest]),
            ("disposable-rpc-definitions.py", [a.public_manifest]),
            ("disposable-schema-tail.py", [a.public_manifest]),
            ("disposable-acls.py", [a.public_manifest])
        ]
        parts=[]
        for ix,(script,inputs) in enumerate(scripts):
            output=root/f"part-{ix}.sql"
            generate(script,inputs,output)
            contents=output.read_text()
            if script=="disposable-table-integrity.py":
                contents=strip_exact(contents,[
                    "CREATE SCHEMA auth;",
                    "CREATE TABLE auth.users (id uuid PRIMARY KEY);"
                ])
            elif script=="disposable-schema-tail.py":
                lines=contents.splitlines(keepends=True)
                contents="".join(l for l in lines
                    if not l.startswith(("CREATE OR REPLACE FUNCTION auth.uid()",
                                         "CREATE OR REPLACE FUNCTION auth.jwt()",
                                         "DO $scratch$")))
            elif script=="disposable-acls.py":
                contents="".join(l for l in contents.splitlines(keepends=True)
                                 if not l.startswith("DO $scratch$"))
            if any(s in contents for s in (
                "CREATE SCHEMA auth;",
                "CREATE TABLE auth.users (id uuid PRIMARY KEY);",
                "CREATE OR REPLACE FUNCTION auth.uid()",
                "CREATE OR REPLACE FUNCTION auth.jwt()",
            )):
                raise ValueError("Refusing to alter managed Supabase Auth infrastructure")
            parts.append((script,contents))

    guard="""BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '2s';
DO $qwiz_guard$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'QWIZ import requires project-owned postgres role';
  END IF;
  IF current_setting('server_version_num')::int < 170000 THEN
    RAISE EXCEPTION 'QWIZ import requires PostgreSQL 17+';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'auth') THEN
    RAISE EXCEPTION 'Target is not a managed Supabase database';
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public') THEN
    RAISE EXCEPTION 'Target public schema is not empty: refusing import';
  END IF;
  IF EXISTS (SELECT FROM auth.users LIMIT 1) THEN
    RAISE EXCEPTION 'Target already has Auth users: refusing import';
  END IF;
  IF EXISTS (SELECT FROM pg_namespace WHERE nspname='quiz_private') THEN
    RAISE EXCEPTION 'Target quiz_private already exists: refusing import';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon')
    OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated')
    OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'Managed Supabase roles are missing';
  END IF;
END;
$qwiz_guard$;
"""
    checks="""DO $verify$
BEGIN
 IF (SELECT count(*) FROM pg_tables WHERE schemaname='public'
  AND (tablename LIKE 'qwiz_%' OR tablename LIKE 'org_next_%' OR tablename LIKE 'org_quiz_%'))<>57 THEN
   RAISE EXCEPTION 'Incomplete public QWIZ schema';
 END IF;
 IF (SELECT count(*) FROM pg_views WHERE schemaname='public' AND viewname LIKE 'org_quiz_%')<>4 THEN
   RAISE EXCEPTION 'Missing legacy views';
 END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND (p.proname LIKE 'qwiz_%' OR p.proname LIKE 'org_next_%'
      OR p.proname LIKE 'org_quiz_%' OR p.proname IN ('org_party_create_set_from_questions','org_party_set_life_state')))<>139 THEN
   RAISE EXCEPTION 'Incomplete QWIZ routines';
 END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='quiz_private')<>9 THEN
   RAISE EXCEPTION 'Missing private functions';
 END IF;
 IF EXISTS (SELECT FROM auth.users LIMIT 1) THEN
   RAISE EXCEPTION 'Schema-only stage unexpectedly inserted Auth users';
 END IF;
END;
$verify$;
COMMIT;
"""
    # Keep SQL definitions private; no output containing function bodies.
    Path(a.target_sql).write_text(guard+
          "\n".join("-- migration phase "+str(ix+1)+"\n"+part for ix,(_,part) in enumerate(parts))+
          "\n"+checks)
    print("QWIZ_SCHEMA_BUNDLE_READY: 57 public tables, 2 private tables, 148 functions, RLS and ACL. NO DATA. NOT APPLIED.")
if __name__=="__main__":main()
