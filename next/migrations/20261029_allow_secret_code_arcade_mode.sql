-- Applied to Supabase project bderfrcfuhnutuoyudje on 2026-10-29.
-- The original check listed only rocket/blitz/tug/captain, blocking a launched Secret Code session.
-- Preserve the four existing modes and allow the standalone sequence_memory game.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.qwiz_arcade_runs DROP CONSTRAINT qwiz_arcade_runs_mode_check;
ALTER TABLE public.qwiz_arcade_runs ADD CONSTRAINT qwiz_arcade_runs_mode_check
 CHECK (mode = ANY (ARRAY['rocket','blitz','tug','captain','sequence_memory']::text[]));
COMMIT;
