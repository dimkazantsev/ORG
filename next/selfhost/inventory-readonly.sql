-- QWIZ-PARTY metadata inspection only. READ-ONLY: no data, secrets, schema changes.
-- Run with read-only database access on cloud and isolated self-hosted test database.
-- Expected snapshot as of 2026-10-29: 36 qwiz tables, 5 org_next tables,
-- 16 org_quiz legacy tables, PG17.6. The inventory can change after migrations.

select current_setting('server_version') as postgres_version;
select extname,extversion from pg_extension order by extname;

select
 case
  when left(tablename,5)='qwiz_' then 'qwiz'
  when left(tablename,9)='org_next_' then 'org_next'
  else 'org_quiz' end as family,
 count(*) as tables,
 count(*) filter (where rowsecurity) as rls_tables
from pg_tables
where schemaname='public'
 and (left(tablename,5)='qwiz_' or left(tablename,9)='org_next_' or left(tablename,9)='org_quiz_')
group by 1 order by 1;

select
 case
  when left(p.proname,5)='qwiz_' then 'qwiz'
  when left(p.proname,9)='org_next_' then 'org_next'
  else 'org_quiz' end as family,
 count(*) as routines,
 count(*) filter(where p.prosecdef) as security_definer_routines
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
 and (left(p.proname,5)='qwiz_' or left(p.proname,9)='org_next_' or left(p.proname,9)='org_quiz_')
group by 1 order by 1;

select
 case
  when left(c.relname,5)='qwiz_' then 'qwiz'
  when left(c.relname,9)='org_next_' then 'org_next'
  else 'org_quiz' end as family,
 count(*) filter(where not t.tgisinternal) as noninternal_triggers
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
 and (left(c.relname,5)='qwiz_' or left(c.relname,9)='org_next_' or left(c.relname,9)='org_quiz_')
group by 1 order by 1;

-- Dependency edges: names only, not individual account or room records.
select c.conrelid::regclass::text as table_name,
       c.confrelid::regclass::text as references_table,
       c.conname as foreign_key
from pg_constraint c
where c.contype='f'
  and c.connamespace='public'::regnamespace
  and (left(c.conrelid::regclass::text,5)='qwiz_'
       or left(c.conrelid::regclass::text,9)='org_next_')
order by 1,2,3;

-- RPC helpers essential to the 40-player integration test.
select p.proname,p.pronargs,p.prosecdef,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('org_quiz_is_admin_check','qwiz_party_projection',
     'qwiz_party_state','org_next_answer','org_next_join','qwiz_advance_room')
order by p.proname,p.pronargs;
