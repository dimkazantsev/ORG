-- Review from Supabase database security/performance advisors, 2026-10-22.
-- Keep public screen & countdown explicitly callable by guests; both expose no secrets.
-- Trigger functions have no legitimate direct API entrypoints.
revoke execute on function public.qwiz_broadcast_room_change() from public,anon,authenticated;
revoke execute on function public.qwiz_broadcast_player_join() from public,anon,authenticated;
create index if not exists qwiz_bank_topic_fk_idx on public.qwiz_bank(topic_id);
create index if not exists qwiz_build_cards_topic_fk_idx on public.qwiz_build_cards(topic_id);
create index if not exists qwiz_builds_owner_fk_idx on public.qwiz_builds(owner_id);
create index if not exists qwiz_player_device_access_user_fk_idx on public.qwiz_player_device_access(user_id);
create index if not exists qwiz_room_builds_build_fk_idx on public.qwiz_room_builds(build_id);
create index if not exists qwiz_student_pairings_account_fk_idx on public.qwiz_student_pairings(account_id);