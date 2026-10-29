-- READ ONLY catalog-only QWIZ schema definition extraction.
-- No SELECT from any user or Auth table, and no data rows are exported.
-- stdout contains sensitive source code/DDL: redirect to PRIVATE ephemeral file only.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15000ms';
SET LOCAL lock_timeout='2000ms';
WITH target_rel AS MATERIALIZED (
 SELECT c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,
        pg_get_userbyid(c.relowner) AS owner
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
   AND (c.relname LIKE 'qwiz_%' OR c.relname LIKE 'org_next_%' OR c.relname LIKE 'org_quiz_%')
   AND c.relkind IN ('r','p','v','m','S')
), target_functions AS MATERIALIZED (
 SELECT p.oid,p.proname,p.prosecdef,p.prokind,pg_get_function_identity_arguments(p.oid) AS identity_arguments
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND (p.proname LIKE 'qwiz_%' OR p.proname LIKE 'org_next_%'
        OR p.proname LIKE 'org_quiz_%'
        OR p.proname IN ('org_party_create_set_from_questions','org_party_set_life_state'))
)
SELECT jsonb_build_object(
  'version',1,
  'project_ref','bderfrcfuhnutuoyudje',
  'postgres',current_setting('server_version'),
  'relations',COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
        'name',relname,'kind',relkind,'rls',relrowsecurity,'force_rls',relforcerowsecurity,
        'options',reloptions,'owner',owner) ORDER BY relname) FROM target_rel
  ),'[]'::jsonb),
  'columns',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
     'table',r.relname,'column',a.attname,'position',a.attnum,
     'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
     'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
     'collation',CASE WHEN a.attcollation=typ.typcollation THEN NULL ELSE
       (SELECT co.collname FROM pg_collation co WHERE co.oid=a.attcollation) END,
     'default',CASE WHEN d.oid IS NULL THEN NULL ELSE pg_get_expr(d.adbin,d.adrelid) END
    ) ORDER BY r.relname,a.attnum)
    FROM target_rel r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
    JOIN pg_type typ ON typ.oid=a.atttypid
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE r.relkind IN ('r','p')
  ),'[]'::jsonb),
  'constraints',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
     'table',r.relname,'name',k.conname,'kind',k.contype,
     'definition',pg_get_constraintdef(k.oid,true),'validated',k.convalidated
    ) ORDER BY r.relname,k.conname)
    FROM target_rel r JOIN pg_constraint k ON k.conrelid=r.oid
  ),'[]'::jsonb),
  'indexes',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
     'table',r.relname,'name',ic.relname,'definition',pg_get_indexdef(i.indexrelid),
     'is_primary',i.indisprimary,'is_unique',i.indisunique
    ) ORDER BY r.relname,ic.relname)
    FROM target_rel r JOIN pg_index i ON i.indrelid=r.oid
    JOIN pg_class ic ON ic.oid=i.indexrelid
  ),'[]'::jsonb),
  'triggers',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
     'table',r.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid,true),
     'enabled',t.tgenabled
    ) ORDER BY r.relname,t.tgname)
    FROM target_rel r JOIN pg_trigger t ON t.tgrelid=r.oid AND NOT t.tgisinternal
  ),'[]'::jsonb),
  'policies',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
     'table',r.relname,'name',p.polname,'command',p.polcmd,
     'permissive',p.polpermissive,'role_names',
     (SELECT array_agg(CASE WHEN v.role_oid=0 THEN 'PUBLIC'
      ELSE (SELECT rolname FROM pg_roles WHERE oid=v.role_oid) END)
       FROM unnest(p.polroles) v(role_oid)),
     'using',pg_get_expr(p.polqual,p.polrelid),
     'with_check',pg_get_expr(p.polwithcheck,p.polrelid)
    ) ORDER BY r.relname,p.polname)
    FROM target_rel r JOIN pg_policy p ON p.polrelid=r.oid
  ),'[]'::jsonb),
  'views',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
     'name',r.relname,'definition',pg_get_viewdef(r.oid,true)
    ) ORDER BY r.relname)
    FROM target_rel r WHERE r.relkind IN ('v','m')
  ),'[]'::jsonb),
  'routines',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
     'name',f.proname,'arguments',f.identity_arguments,
     'security_definer',f.prosecdef,'kind',f.prokind,
     'definition',pg_get_functiondef(f.oid)
    ) ORDER BY f.proname,f.identity_arguments)
    FROM target_functions f
  ),'[]'::jsonb),
  'table_grants',COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
       'table',r.relname,
       'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE (SELECT rolname FROM pg_roles WHERE oid=a.grantee) END,
       'privilege',a.privilege_type,'grantable',a.is_grantable
     ) ORDER BY r.relname,a.grantee,a.privilege_type)
     FROM target_rel r
     JOIN pg_class c ON c.oid=r.oid
     CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
     WHERE r.relkind IN ('r','p')
  ),'[]'::jsonb),
  'routine_grants',COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
       'name',f.proname,'arguments',f.identity_arguments,
       'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE (SELECT rolname FROM pg_roles WHERE oid=a.grantee) END,
       'privilege',a.privilege_type,'grantable',a.is_grantable
     ) ORDER BY f.proname,f.identity_arguments,a.grantee,a.privilege_type)
     FROM target_functions f
     JOIN pg_proc p ON p.oid=f.oid
     CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
  ),'[]'::jsonb),
  'required_auth_fk',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('table',r.relname,'constraint',k.conname,
     'referenced_schema',n.nspname,'referenced_table',c.relname)
      ORDER BY r.relname,k.conname)
    FROM target_rel r JOIN pg_constraint k ON k.conrelid=r.oid AND k.contype='f'
    JOIN pg_class c ON c.oid=k.confrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname<>'public'
  ),'[]'::jsonb)
)::text;
COMMIT;
