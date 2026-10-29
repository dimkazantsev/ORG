-- Helpers are internal to SECURITY DEFINER game functions, not direct client RPCs.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.qwiz_stage_everyone_done(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.qwiz_arcade_vote_start(uuid,integer) FROM PUBLIC, anon, authenticated;
COMMIT;