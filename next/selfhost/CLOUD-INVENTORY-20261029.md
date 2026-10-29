# QWIZ-PARTY — read-only inventory of cloud database (2026-10-29)

Source: live Supabase project `bderfrcfuhnutuoyudje`, inspected **read-only** via database catalogs and Supabase Advisors on 2026-10-29. **No production DDL, writes, copied account data or secret values.**

## Current engine and schema inventory

| Item | Count/version |
|---|---:|
| PostgreSQL | 17.6 (project reports 17.6.1.166) |
| `public.qwiz_*` tables | 36 |
| `public.org_next_*` tables | 5 |
| Legacy `public.org_quiz_*` tables | 16 |
| `public.qwiz_*` functions | 95 |
| `public.org_next_*` functions | 10 |
| Legacy `public.org_quiz_*` functions | 32 |
| Non-internal triggers on `qwiz_*` tables | 2 |
| Non-internal triggers on `org_next_*` tables | 7 |

Installed PostgreSQL extensions: `pg_cron 1.6.4`, `pg_net 0.20.4`, `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`. Confirm equivalent availability and versions before schema import, **do not blindly install all extensions if unused by selected application objects**.

All 41 `qwiz_*` and `org_next_*` primary tables have RLS enabled according to `pg_tables`. This does not prove every exposed RPC is properly authorized.

Critical dependencies include: `org_next_players` referencing `qwiz_student_accounts` and `auth.users`; `qwiz_secret_code_sessions` referencing `qwiz_secret_code_catalog`; many scoring, arcade, geography and lobby tables referencing `org_next_rooms`, `org_next_players` and `org_next_teams`. Existing administrative RPC `org_quiz_is_admin_check()` belongs to legacy-named function family, but QWIZ depends on it for access checks.

**Conclusion:** `next/migration.sql` (five core tables) is **not sufficient** to restore the current QWIZ-PARTY Studio. Use a complete inspected schema export; apply deterministic schema selection only after reviewing dependency closure. Never execute all `next/migrations/*.sql` automatically.

## Read-only Advisor signals scoped to QWIZ

| Lint | QWIZ findings | Context |
|---|---:|---|
| Foreign keys without covering index | 29 | Can affect joins and writes; require workload analysis before creating indexes |
| QWIZ table without primary key | 1 | `qwiz_removed_dino_cards_20261027` is historical/retired; do not re-enable without need |
| Unused indexes | 4 | Not a reason to drop indexes without inspecting workload |
| RLS enabled without policy | 41 | Likely deliberate for RPC-only tables with direct table grants revoked; check per table |
| Anonymous role can invoke SECURITY DEFINER functions | 13 | Requires explicit authorization/parameter validation review for every exposed function |
| Authenticated role can invoke SECURITY DEFINER functions | 56 | Can be intentional for QWIZ RPC, but audit EXECUTE grants, object ownership, `search_path` and membership checks |

The function advisory findings are *not* confirmation of an exploit. Preserving deny-by-default direct table access and correct RPC authorization is mandatory. Do not remove RLS to eliminate a warning. Links: 
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Next safety gates before using copied schema on staging

1. Export only schema and roles (not data, not `auth.users`, not storage objects). Protect local exports; object definitions can contain privileged logic.
2. Check referenced `auth`, `extensions`, and legacy helper functions. Explicitly mark which `org_quiz_*` objects are needed by QWIZ; do not copy GOС.ID user data.
3. Recheck PG17 compatibility and exact extension support on staging; stop on SQL errors.
4. On staging, provision synthetic authenticated moderator with the correct auth role, synthetic student identities and the dedicated test fixture; do not bypass RLS or expose `service_role`.
5. Run ACL/RPC authorization checks as both `anon` and `authenticated`, including forbidden-room accesses and attempt to call RPCs from unrelated users.
6. Compare 40-answer and 40-WebSocket test metrics only after the isolated staging deployment is validated. Measure query plans for frequent room-state and score functions before adding indexes.
7. Do not merge the PR or repoint GitHub Pages until a full test on an actual isolated host passes.

## Reproduction

Use the read-only queries from `next/selfhost/inventory-readonly.sql` on the current project and independently on the new self-hosted database; compare structure and counts. The referenced SQL does **not** export personal records or credentials.
