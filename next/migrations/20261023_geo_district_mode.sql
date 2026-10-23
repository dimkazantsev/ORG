-- Upgrade geography RPC to eighth mode (federal district); previous registry seed already applied.
create or replace function public.qwiz_geo_play(p_room uuid,p_answer text default null)
returns jsonb language plpgsql security definer set search_path='' as $geo$
declare r public.org_next_rooms%rowtype;a public.qwiz_room_activity%rowtype;
p public.org_next_players%rowtype; run public.qwiz_geo_runs%rowtype;
ids text[]; all_ids text[]; opts text[]; n int;i int;
modes jsonb;v_mode text;v_id text;v_answer text;v_neighbor text;v_options jsonb;v_tasks jsonb:='[]'::jsonb;
v_region public.qwiz_geo_regions%rowtype;v_task jsonb;v_hit boolean;v_award int:=0;
v_count int;v_sec int;v_open boolean;v_remaining int;
begin
 if (select auth.uid()) is null then raise exception 'Требуется вход';end if;
 select * into r from public.org_next_rooms where id=p_room;
 if not found then raise exception 'Комната не найдена';end if;
 select * into p from public.org_next_players x where x.room_id=p_room and x.team_id is not null
  and (x.user_id=(select auth.uid()) or exists(
   select 1 from public.qwiz_player_device_access d where d.room_id=p_room
    and d.player_id=x.id and d.user_id=(select auth.uid()))) limit 1;
 if not found then raise exception 'Сначала вступите в команду';end if;
 select * into a from public.qwiz_room_activity where room_id=p_room;
 if r.phase<>'intermission' or not found or a.settings->>'arcade_mode'<>'russia_map' then
   return jsonb_build_object('active',false);end if;
 v_sec:=greatest(45,least(600,coalesce((a.settings->>'geo_seconds')::int,180)));
 v_remaining:=greatest(0,ceil(extract(epoch from a.entered_at+make_interval(secs=>v_sec)-clock_timestamp()))::int);
 v_open:=v_remaining>0;
 select * into run from public.qwiz_geo_runs x
 where x.room_id=p_room and x.player_id=p.id and x.card_position=a.card_position for update;
 if not found then
   n:=greatest(1,least(89,coalesce((a.settings->>'geo_count')::int,15)));
   modes:=a.settings->'geo_modes';
   if jsonb_typeof(modes) is distinct from 'array' or jsonb_array_length(modes)=0 then
    modes:='["locate","identify","capital","flag","silhouette","neighbour","detective","district"]'::jsonb;
   end if;
   select array_agg(id order by md5(id||':'||p.id::text||':'||p_room::text||':'||a.card_position::text))
     into ids from public.qwiz_geo_regions;
   for i in 1..n loop
    v_id:=ids[i];select * into v_region from public.qwiz_geo_regions where id=v_id;
    v_mode:=modes->>((i-1)%jsonb_array_length(modes));
    if v_mode not in ('locate','identify','capital','flag','silhouette','neighbour','detective','district') then v_mode:='locate';end if;
    if v_mode='neighbour' and cardinality(v_region.neighbors)=0 then v_mode:='locate';end if;
    if v_mode='flag' and v_region.flag is null then v_mode:='identify';end if;
    v_answer:=case when v_mode='neighbour'
       then v_region.neighbors[1+mod(i+length(p.id::text),cardinality(v_region.neighbors))]
       else v_id end;
    if v_mode='district' then
     select array_agg(z.id order by md5(z.id||':'||p.id::text||':'||i::text)) into all_ids
     from (select distinct on (fd) id,fd from public.qwiz_geo_regions
      where fd<>v_region.fd order by fd,id) z;
    else
     select array_agg(z.id order by md5(z.id||':'||p.id::text||':'||i::text)) into all_ids
       from public.qwiz_geo_regions z where z.id<>v_answer;
    end if;
    opts:=array[v_answer,all_ids[1],all_ids[2],all_ids[3]];
    select jsonb_agg(jsonb_build_object('id',x.id,'text',
      case when v_mode='capital' then z.capital when v_mode='district' then z.fd else z.name end)
      order by md5(x.id||':'||p.id::text||':'||i::text))
      into v_options from unnest(opts) x(id) join public.qwiz_geo_regions z on z.id=x.id;
    v_tasks:=v_tasks||jsonb_build_array(jsonb_build_object(
      'mode',v_mode,'region',v_id,'answer',v_answer,
      'name',v_region.name,'capital',v_region.capital,
      'district',v_region.fd,'region_type',v_region.kind,
      'flag',v_region.flag,'options',v_options));
   end loop;
   insert into public.qwiz_geo_runs(room_id,player_id,card_position,tasks)
     values(p_room,p.id,a.card_position,v_tasks) returning * into run;
 end if;
 v_count:=jsonb_array_length(run.tasks);
 if p_answer is not null and v_open and run.current_index<v_count then
   v_task:=run.tasks->run.current_index;v_hit:=p_answer=v_task->>'answer';
   v_award:=case when v_hit then 100 else 0 end;
   update public.qwiz_geo_runs x set current_index=x.current_index+1,
    score=x.score+v_award,correct_count=x.correct_count+case when v_hit then 1 else 0 end,
    updated_at=clock_timestamp()
    where x.room_id=p_room and x.player_id=p.id and x.card_position=a.card_position returning * into run;
   if v_award>0 then
     update public.org_next_teams t set score=t.score+v_award where t.id=p.team_id and t.room_id=p_room;
   end if;
 end if;
 return jsonb_build_object(
 'active',true,'open',v_open,'remaining',v_remaining,'index',run.current_index,
 'total',v_count,'score',run.score,'correct',run.correct_count,'finished',run.current_index>=v_count,
 'last_correct',case when p_answer is not null then v_hit else null end,
 'last_award',v_award,'question',case when v_open and run.current_index<v_count
 then (run.tasks->run.current_index)-'answer' else null end);
end $geo$;
