-- Supabase default grants may provide EXECUTE to anon explicitly, even after REVOKE FROM PUBLIC.
-- Host/player RPCs require a signed-in session; projector/read-only RPCs remain public.
revoke execute on function public.qwiz_party_control(uuid,text) from anon;
revoke execute on function public.qwiz_vote_boost(uuid,text) from anon;
revoke execute on function public.qwiz_party_state(text) from anon;
revoke execute on function public.qwiz_boost_teams(jsonb,uuid,integer) from anon,authenticated;
revoke execute on function public.qwiz_boost_view(text) from anon,authenticated;
revoke execute on function public.qwiz_party_paused(uuid) from anon,authenticated;
revoke execute on function public.qwiz_apply_round_boost() from anon,authenticated;
revoke execute on function public.qwiz_result_deadline() from anon,authenticated;
grant execute on function public.qwiz_party_control(uuid,text) to authenticated;
grant execute on function public.qwiz_vote_boost(uuid,text) to authenticated;
grant execute on function public.qwiz_party_state(text) to authenticated;
