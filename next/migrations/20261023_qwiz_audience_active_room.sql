-- Public, read-only discovery of the most recently launched classroom game.
-- Only room code, title and phase are exposed; no participant data, answers or admin privileges.
-- Prefer rooms already in progress over unstarted lobbies.
create or replace function public.qwiz_audience_active_room()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (
      select jsonb_build_object('code',r.code,'phase',r.phase,'title',r.title)
      from public.org_next_rooms r
      where r.phase in ('lobby','countdown','question','result','intermission')
      order by
        case when r.phase='lobby' then 1 else 0 end,
        r.created_at desc, r.id desc
      limit 1
    ),
    jsonb_build_object('code',null,'phase',null,'title',null)
  );
$fn$;
revoke all on function public.qwiz_audience_active_room() from public;
revoke all on function public.qwiz_audience_active_room() from anon,authenticated;
grant execute on function public.qwiz_audience_active_room() to anon,authenticated;
comment on function public.qwiz_audience_active_room() is
 'Public discoverable current classroom room for the audience QR; read-only minimal metadata.';
