-- QWIZ / GOS.ID physical split: read-only metadata validation.
-- Run on original gos-sim and independently on new QWIZ staging. No writes, no personal rows.
select current_setting('server_version') as pg_version;
select extname,extversion from pg_extension order by extname;
select case when tablename like 'qwiz_%' then 'qwiz'
            when tablename like 'org_next_%' then 'org_next'
            when tablename like 'org_quiz_%' then 'org_quiz' end family,
 count(*) tables,count(*) filter(where rowsecurity) rls_enabled
from pg_tables where schemaname='public'
 and (tablename like 'qwiz_%' or tablename like 'org_next_%' or tablename like 'org_quiz_%')
group by 1 order by 1;
select case when p.proname like 'qwiz_%' then 'qwiz'
            when p.proname like 'org_next_%' then 'org_next'
            when p.proname like 'org_quiz_%' then 'org_quiz' end family,
 count(*) functions,count(*) filter(where p.prosecdef) security_definer_functions
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and (p.proname like 'qwiz_%' or p.proname like 'org_next_%' or p.proname like 'org_quiz_%')
group by 1 order by 1;
select case when c.relname like 'qwiz_%' then 'qwiz'
            when c.relname like 'org_next_%' then 'org_next'
            when c.relname like 'org_quiz_%' then 'org_quiz' end family,
 pg_size_pretty(sum(pg_total_relation_size(c.oid))) total_storage,
 sum(pg_total_relation_size(c.oid)) bytes
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and
(c.relname like 'qwiz_%' or c.relname like 'org_next_%' or c.relname like 'org_quiz_%')
group by 1 order by 1;
select conrelid::regclass::text as referencing_table, confrelid::regclass::text as referenced_table,
 conname as foreign_key
from pg_constraint
where contype='f' and connamespace='public'::regnamespace
  and (conrelid::regclass::text like 'qwiz_%' or conrelid::regclass::text like 'org_next_%')
  and confrelid::regclass::text not like 'qwiz_%'
  and confrelid::regclass::text not like 'org_next_%'
order by 1,2,3;
select conrelid::regclass::text as external_table, confrelid::regclass::text as referenced_quiz_table
from pg_constraint
where contype='f' and connamespace='public'::regnamespace
  and (confrelid::regclass::text like 'qwiz_%' or confrelid::regclass::text like 'org_next_%' or confrelid::regclass::text like 'org_quiz_%')
  and not (conrelid::regclass::text like 'qwiz_%' or conrelid::regclass::text like 'org_next_%' or conrelid::regclass::text like 'org_quiz_%')
order by 1,2;
select p.proname as external_qwiz_helper
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f'
 and p.proname not like 'qwiz_%' and p.proname not like 'org_next_%' and p.proname not like 'org_quiz_%'
 and (pg_get_functiondef(p.oid) ilike '%qwiz_%' or pg_get_functiondef(p.oid) ilike '%org_next_%' or pg_get_functiondef(p.oid) ilike '%org_quiz_%')
order by 1;
select schemaname,tablename from pg_publication_tables
where pubname='supabase_realtime' and
 (tablename like 'qwiz_%' or tablename like 'org_next_%' or tablename like 'org_quiz_%')
order by 1,2;
select name,public from storage.buckets order by name;
-- No object paths or file bytes; ownership must be reviewed separately.
select bucket_id,count(*) object_count from storage.objects group by bucket_id order by bucket_id;
