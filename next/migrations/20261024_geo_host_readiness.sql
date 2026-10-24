-- Expose map round existence so the host's Start button is not incorrectly disabled when zero traditional questions are present.
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
 end if;
 return s||jsonb_build_object('paused',left_ms is not null,
  'has_geo_round',exists(select 1 from public.qwiz_room_builds rb,
     jsonb_array_elements(rb.timeline) card
     where rb.room_id=r and card->'settings'->>'arcade_mode'='russia_map'));
end $function$
;
