-- Allow a saved build with only Secret Code (no question bank) to enter lobby and start.
CREATE OR REPLACE FUNCTION public.qwiz_party_state(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb; r uuid; left_ms bigint;
begin
 s:=public.org_next_state(p_code);
 r:=(s->>'room_id')::uuid;
 s:=jsonb_set(s,'{public_stats,teams}',public.qwiz_boost_teams(s#>'{public_stats,teams}',r,coalesce((s->>'index')::int,-1)),true);
 select p.remaining_ms into left_ms from public.qwiz_room_pauses p where p.room_id=r;
 if left_ms is not null and left_ms>=0 then
   s:=jsonb_set(s,'{ends_at}',to_jsonb(clock_timestamp()+make_interval(secs=>left_ms/1000.0)),true);
   -- Guest state: never reveal memory choices before the frozen study interval ends.
   if s->>'phase'='question'
     and coalesce((s->>'host')::boolean,false)=false
     and jsonb_typeof(s->'question')='object' then
     s:=jsonb_set(s,'{question}',public.qwiz_flag_memory_view(
       s->'question','question',(s->>'ends_at')::timestamptz),true);
   end if;
 end if;
 return s||jsonb_build_object('team_effects',public.qwiz_team_effect_history(r,coalesce((s->>'host')::boolean,false)),'team_lobby',public.qwiz_lobby_view(r,false))||jsonb_build_object('control_revision',case when coalesce((s->>'host')::boolean,false) then public.qwiz_control_revision(r) else null end,'paused',left_ms is not null,
  'has_geo_round',exists(select 1 from public.qwiz_room_builds rb,
     jsonb_array_elements(rb.timeline) card
     where rb.room_id=r and card->'settings'->>'arcade_mode'='russia_map'),
  'has_arcade_round',exists(select 1 from public.qwiz_room_builds rb
     cross join lateral jsonb_array_elements(rb.timeline) card
     where rb.room_id=r
       and card->>'type' in ('round','bonus','duel')
       and card->'settings'->>'arcade_mode' in ('blitz','captain','tug','sequence_memory')));
end $function$;
