-- Preserve the visual remaining timer when moderator pauses a room.
create or replace function public.qwiz_party_state(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; r uuid; left_ms bigint;
begin
 s:=public.org_next_state(p_code);
 r:=(s->>'room_id')::uuid;
 s:=jsonb_set(s,'{public_stats,teams}',public.qwiz_boost_teams(s#>'{public_stats,teams}',r,coalesce((s->>'index')::int,-1)),true);
 select p.remaining_ms into left_ms from public.qwiz_room_pauses p where p.room_id=r;
 if left_ms is not null and left_ms>=0 then
   s:=jsonb_set(s,'{ends_at}',to_jsonb(clock_timestamp()+make_interval(secs=>left_ms/1000.0)),true);
 end if;
 return s||jsonb_build_object('paused',left_ms is not null);
end $$;

create or replace function public.qwiz_party_projection(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; r public.org_next_rooms%rowtype; left_ms bigint;
begin
 s:=public.qwiz_public_screen(p_code);
 select * into r from public.org_next_rooms where code=p_code;
 if not found then return s;end if;
 s:=jsonb_set(s,'{teams}',public.qwiz_boost_teams(s->'teams',r.id,coalesce((s->>'index')::int,-1)),true);
 select p.remaining_ms into left_ms from public.qwiz_room_pauses p where p.room_id=r.id;
 if left_ms is not null and left_ms>=0 then
   s:=jsonb_set(s,'{ends_at}',to_jsonb(clock_timestamp()+make_interval(secs=>left_ms/1000.0)),true);
 end if;
 return s||jsonb_build_object('paused',left_ms is not null);
end $$;
