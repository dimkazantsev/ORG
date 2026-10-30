-- QWIZ-PARTY: expose the corresponding team label alongside each player
-- in the public round-results projection, so multicrew podiums are unambiguous.
-- Existing points, sorting, cards and answers are unchanged.
DO $$
DECLARE
 definition text;
 before_text text := '''players'',coalesce((SELECT jsonb_agg(jsonb_build_object(''id'',id,''nickname'',name,''score'',case';
 after_text text := '''players'',coalesce((SELECT jsonb_agg(jsonb_build_object(''id'',id,''nickname'',name,''team_id'',team_id,''team_name'',(SELECT tt.name FROM public.org_next_teams tt WHERE tt.id=player_scores.team_id),''score'',case';
BEGIN
 SELECT pg_get_functiondef('public.qwiz_round_results(uuid,integer)'::regprocedure)
 INTO definition;
 IF position('''team_name'',(SELECT tt.name' IN definition)>0 THEN
  RAISE NOTICE 'Player team identity already available in round results';
  RETURN;
 END IF;
 IF position(before_text IN definition)=0 THEN
  RAISE EXCEPTION 'Round results implementation has changed; migration refused';
 END IF;
 definition:=replace(definition,before_text,after_text);
 EXECUTE definition;
END $$;
