-- Canonical Geography of Russia catalog: teacher-only, 89 stored federal subjects.
-- Legacy geography bonuses become question cards in saved builds. Active room snapshots stay untouched.
create or replace function public.qwiz_geo_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $geo$
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then
   raise exception 'Недостаточно прав';
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,
  'capital',capital,'district',fd,'region_type',kind,'flag',flag,
  'neighbors',neighbors) order by name),'[]'::jsonb)
 from public.qwiz_geo_regions);
end $geo$;
revoke all on function public.qwiz_geo_catalog() from public,anon,authenticated;
grant execute on function public.qwiz_geo_catalog() to authenticated;
update public.qwiz_build_cards c
set card_type='round',topic_id=coalesce(
 (select t.id from public.qwiz_topics t
   join public.qwiz_builds b on b.id=c.build_id
   where t.owner_id=b.owner_id and t.name='География России' limit 1),c.topic_id)
where c.settings->>'arcade_mode'='russia_map' and c.card_type='bonus';
