set local lock_timeout='5s';set local statement_timeout='20s';
CREATE OR REPLACE FUNCTION public.qwiz_public_screen(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.org_next_rooms%rowtype;q jsonb;total int;activity jsonb;metrics jsonb;reveal boolean;final_card jsonb;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then raise exception 'Неверный код';end if;
 perform public.qwiz_tick(p_code);
 select * into r from public.org_next_rooms where code=p_code;
 if not found then raise exception 'Комната не найдена';end if;
 select jsonb_array_length(x.questions),case when r.question_index>=0 then x.questions->r.question_index else null end into total,q from public.org_next_quizzes x where x.id=r.quiz_id;
 if r.phase='intermission' then
  select jsonb_build_object('type',a.kind,'title',a.title,'icon','◉','sound',coalesce(a.settings->>'sound','none')) into activity from public.qwiz_room_activity a where a.room_id=r.id;
 elsif r.phase='finished' then
  select rb.timeline->(jsonb_array_length(rb.timeline)-1) into final_card from public.qwiz_room_builds rb where rb.room_id=r.id;
  activity:=jsonb_build_object('type','finale','title',coalesce(final_card->>'title','Финал игры'),'sound',coalesce(final_card->'settings'->>'sound','fanfare'));
 end if;
 reveal:=r.phase in ('result','finished') or coalesce(activity->>'type','') in ('team_stats','player_stats');
 metrics:=public.qwiz_screen_metrics(r.id,r.question_index,reveal,r.phase='finished');
 return jsonb_build_object('code',r.code,'title',r.title,'phase',r.phase,'index',r.question_index,'total',total,
 'server_now',clock_timestamp(),'ends_at',r.ends_at,'duration',case when r.phase='result' then greatest(5,least(30,coalesce((q->>'answer_duration')::int,10))) else coalesce((q->>'duration')::int,30) end,
 'question',case when r.phase in ('question','result') then q-'correct'-'solution'-'explanation' else null end,
 'answer',case when r.phase='result' then public.qwiz_answer_display(q) else null end,
 'activity',activity,'round_sound',q->>'round_sound',
 'lobby_teams',case when r.phase='lobby' then (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'position',t.position,'name',t.name,'members',(select count(*) from public.org_next_players p where p.team_id=t.id)) order by t.position),'[]'::jsonb) from public.org_next_teams t where t.room_id=r.id) else '[]'::jsonb end)||metrics;
end $function$
;

revoke all on function public.qwiz_compile_build(uuid,text,boolean),public.qwiz_refresh_room_content(uuid),public.qwiz_check_room_start(uuid),public.qwiz_team_state(uuid,boolean,uuid),public.qwiz_new_team_name(uuid) from public,anon,authenticated;
revoke all on function public.qwiz_prepare_room(uuid,text,integer),public.qwiz_team_admin(uuid,text,jsonb),public.qwiz_join_team(text,text,text,uuid,uuid) from public,anon;
grant execute on function public.qwiz_prepare_room(uuid,text,integer),public.qwiz_team_admin(uuid,text,jsonb),public.qwiz_join_team(text,text,text,uuid,uuid) to authenticated;
-- Existing org_next_* entry points retain their existing role grants.


