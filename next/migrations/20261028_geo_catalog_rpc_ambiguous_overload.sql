-- QWIZ-PARTY / PostgREST PGRST203 fix.
-- Two RPC overloads matched {}: () and (p_search,p_offset,p_limit) WITH DEFAULTS.
-- PostgreSQL disallows removing existing defaults by CREATE OR REPLACE (42P13).
-- Rename the existing pagination function (preserving its OID, grants,
-- definition and any database dependencies), then provide an explicit,
-- 3-required-arguments compatibility RPC with the original name.
do $rename$
begin
 if to_regprocedure('public.qwiz_geo_catalog_page(text,integer,integer)') is null then
  if to_regprocedure('public.qwiz_geo_catalog(text,integer,integer)') is null then
   raise exception 'Missing existing paginated geography catalog';
  end if;
  alter function public.qwiz_geo_catalog(text,integer,integer)
   rename to qwiz_geo_catalog_page;
 end if;
end $rename$;

-- Full 3-parameter callers keep their familiar endpoint. This function
-- deliberately has NO argument defaults; the no-argument RPC is unique.
create or replace function public.qwiz_geo_catalog(
 p_search text, p_offset integer, p_limit integer
)
returns jsonb
language sql stable security invoker set search_path='' as $compat$
 select public.qwiz_geo_catalog_page(p_search,p_offset,p_limit)
$compat$;
revoke all on function public.qwiz_geo_catalog(text,integer,integer)
 from public,anon,authenticated;
grant execute on function public.qwiz_geo_catalog(text,integer,integer)
 to authenticated;

-- Assert required signatures and absence of overloaded default parameters.
do $check$
declare defaults_count integer;zero_count integer;
begin
 select count(*) into defaults_count
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='qwiz_geo_catalog'
  and p.pronargs>0 and p.pronargdefaults>0;
 select count(*) into zero_count
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='qwiz_geo_catalog' and p.pronargs=0;
 if defaults_count<>0 or zero_count<>1 then
  raise exception 'Ambiguous geography RPC: defaulted %, no-argument %',defaults_count,zero_count;
 end if;
end $check$;
notify pgrst, 'reload schema';
