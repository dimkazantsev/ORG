BEGIN READ ONLY;
SET LOCAL statement_timeout='15000ms';
WITH rr AS (
 SELECT c.oid,c.relname,c.relkind,c.relrowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='quiz_private' AND c.relkind IN ('r','p')
), ff AS (
 SELECT p.oid,p.proname,p.prosecdef
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='quiz_private'
)
SELECT jsonb_build_object(
'project_ref','bderfrcfuhnutuoyudje','version',1,
'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',relname,'kind',relkind,'rls',relrowsecurity) ORDER BY relname) FROM rr),'[]'::jsonb),
'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object(
'table',r.relname,'column',a.attname,'position',a.attnum,
'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
'default',CASE WHEN d.oid IS NULL THEN NULL ELSE pg_get_expr(d.adbin,d.adrelid) END
) ORDER BY r.relname,a.attnum)
FROM rr r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum),'[]'::jsonb),
'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('table',r.relname,'name',k.conname,
'kind',k.contype,'definition',pg_get_constraintdef(k.oid,true)) ORDER BY r.relname,k.conname)
FROM rr r JOIN pg_constraint k ON k.conrelid=r.oid),'[]'::jsonb),
'functions',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',f.proname,
'definition',pg_get_functiondef(f.oid),'security_definer',f.prosecdef) ORDER BY f.proname)
FROM ff f),'[]'::jsonb)
)::text;
COMMIT;
