-- QWIZ-PARTY: avoid PostgREST PGRST203 on rpc('qwiz_geo_catalog', {}).
-- The full 89-subject teacher catalog uses qwiz_geo_catalog().
-- The paginated/search variant must require all three named arguments:
-- defaults make it ALSO match {}, so PostgREST cannot select the 0-arg RPC.
-- Preserve the existing function's OID, permissions and returned JSON shape.
create or replace function public.qwiz_geo_catalog(
  p_search text,
  p_offset integer,
  p_limit integer
)
returns jsonb
language sql stable security definer set search_path='' as $function$
 select jsonb_build_object(
  'total',(select count(*) from public.qwiz_geo_regions r
   where r.name ilike '%'||left(coalesce(p_search,''),90)||'%'
    or r.capital ilike '%'||left(coalesce(p_search,''),90)||'%'),
  'items',(select coalesce(jsonb_agg(to_jsonb(s) order by s.name),'[]'::jsonb) from
   (select r.id,r.name,r.capital,r.fd,r.kind,r.flag,cardinality(r.neighbors) as neighbor_count
    from public.qwiz_geo_regions r
    where r.name ilike '%'||left(coalesce(p_search,''),90)||'%'
     or r.capital ilike '%'||left(coalesce(p_search,''),90)||'%'
    order by r.name
    offset greatest(0,least(coalesce(p_offset,0),100))
    limit greatest(1,least(coalesce(p_limit,25),89))) s));
$function$;

-- Fail the migration if ambiguous no-argument candidates are reintroduced.
do $check$
declare
 count_defaults integer;
 count_noargs integer;
begin
 select count(*) into count_defaults
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='qwiz_geo_catalog'
  and p.pronargs>0 and p.pronargdefaults>0;
 select count(*) into count_noargs
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='qwiz_geo_catalog' and p.pronargs=0;
 if count_defaults<>0 or count_noargs<>1 then
  raise exception 'Ambiguous qwiz_geo_catalog RPC signatures: defaults %, zero-arg %',
   count_defaults,count_noargs;
 end if;
end $check$;

-- PostgREST can briefly retain the old argument-default metadata in its schema cache.
notify pgrst, 'reload schema';
