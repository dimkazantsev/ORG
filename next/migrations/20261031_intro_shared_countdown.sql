-- QWIZ-PARTY 2026-10-31: align the mobile and projector intro countdown.
-- qwiz_tick uses a 9-second server-controlled "intro" card; both public
-- state functions used to return NULL ends_at for that card.
DO $intro_deadline$
DECLARE
  fn record;
  original text;
  updated text;
  filter_old text := 'a.kind in (''card_intro'',''round_stats''))';
  filter_new text := 'a.kind in (''card_intro'',''round_stats'',''intro''))';
  case_old text := 'when a.kind=''round_stats'' then';
  case_new text := 'when a.kind=''intro'' then 9 when a.kind=''round_stats'' then';
BEGIN
  FOR fn IN SELECT oid,proname FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname IN ('org_next_state','qwiz_public_screen')
  LOOP
    original:=pg_get_functiondef(fn.oid);
    IF strpos(original,filter_old)=0 OR strpos(original,case_old)=0 THEN
      RAISE EXCEPTION 'Unexpected source for %, refusing unsafe patch',fn.proname;
    END IF;
    updated:=replace(replace(original,filter_old,filter_new),case_old,case_new);
    EXECUTE updated;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname='org_next_state'
      AND strpos(pg_get_functiondef(oid),'a.kind in (''card_intro'',''round_stats'',''intro''))')>0
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname='qwiz_public_screen'
      AND strpos(pg_get_functiondef(oid),'a.kind in (''card_intro'',''round_stats'',''intro''))')>0
  ) THEN RAISE EXCEPTION 'Shared intro countdown verification failed'; END IF;
END $intro_deadline$;