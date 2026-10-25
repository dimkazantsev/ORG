-- QWIZ-PARTY: remove two aggregates that are overwritten by qwiz_team_state.
-- Only decreases redundant database work. Does NOT change the returned JSON,
-- access checks, phase transitions, scoring, RPC signatures or privileges.
--
-- org_next_state currently builds local v_teams/v_players once, but its final
-- "... jsonb_build_object(..., 'teams',v_teams,'players',v_players,...) ||
-- public.qwiz_team_state(...)" overwrites BOTH values every time.
-- qwiz_team_state always emits both keys, for student and moderator alike.
DO $patch$
DECLARE
  def text;
  roster_def text;
  first_pos integer;
  last_pos integer;
  removed text;
BEGIN
  SELECT pg_get_functiondef('public.org_next_state(text)'::regprocedure) INTO def;
  IF position('PERF-STATE-ROSTER-READS-20261025' IN def) > 0 THEN RETURN; END IF;
  SELECT pg_get_functiondef('public.qwiz_team_state(uuid,boolean,uuid)'::regprocedure) INTO roster_def;
  -- Never optimize unless the right-hand operand still supplies both keys.
  IF position('''teams'',(select' IN roster_def)=0
     OR position('''players'',case when p_host' IN roster_def)=0
     OR position('||public.qwiz_team_state(v_room.id,v_host,v_player.id)' IN def)=0
     OR position('''teams'',v_teams,''players'',v_players,' IN def)=0
  THEN RAISE EXCEPTION 'State/team contract changed: review manually'; END IF;

  first_pos:=position(' select coalesce(jsonb_agg(jsonb_build_object(' IN def);
  last_pos:=position(' select count(*) into v_answers from public.org_next_answers' IN def);
  IF first_pos<1 OR last_pos<=first_pos
  THEN RAISE EXCEPTION 'Unexpected roster aggregate layout'; END IF;
  removed:=substring(def from first_pos for last_pos-first_pos);
  IF position('into v_teams from public.org_next_teams t' IN removed)=0
     OR position('into v_players from public.org_next_players p' IN removed)=0
     OR position('if v_host then' IN removed)=0
     OR position('else v_players:=' IN removed)=0
  THEN RAISE EXCEPTION 'Unexpected changed aggregation code'; END IF;
  def:=left(def,first_pos-1)
     ||E'\n -- PERF-STATE-ROSTER-READS-20261025: values below are overwritten by\n'
     ||E' -- qwiz_team_state; skip duplicate teams and host player queries.\n'
     ||substring(def from last_pos);
  EXECUTE def;
END $patch$;
