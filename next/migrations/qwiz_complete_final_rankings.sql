create or replace function public.qwiz_public_screen(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype;q jsonb;total integer;teams jsonb;players jsonb;activity jsonb;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then raise exception 'Неверный код';end if;
 select * into r from public.org_next_rooms where code=p_code;
 if not found then raise exception 'Комната не найдена';end if;
 select jsonb_array_length(x.questions),case when r.question_index>=0 then
   (x.questions->r.question_index)-'correct'-'solution'-'explanation' else null end
 into total,q from public.org_next_quizzes x where x.id=r.quiz_id;
 if r.phase not in ('question','result') then q:=null;end if;
 if r.phase='intermission' then
  select jsonb_build_object('type',a.kind,'title',a.title,'icon','◉','sound',coalesce(a.settings->>'sound','none'))
  into activity from public.qwiz_room_activity a where a.room_id=r.id;
 end if;
 if r.phase='finished' or activity->>'type' in ('team_stats','player_stats') then
  select coalesce(jsonb_agg(jsonb_build_object('name',t.name,'score',t.score,'position',t.rnk) order by t.rnk),'[]'::jsonb)
  into teams from (select name,score,row_number() over(order by score desc,position asc,id) rnk
    from public.org_next_teams where room_id=r.id)t;
  select coalesce(jsonb_agg(jsonb_build_object(
     'nickname',coalesce(nullif(p.nickname,''),'Игрок '||lpad(p.rnk::text,2,'0')),
     'score',p.points,'position',p.rnk) order by p.rnk),'[]'::jsonb)
  into players from (
   select z.player_id,z.nickname,z.points,
    row_number() over(order by z.points desc,z.joined_at,z.player_id) rnk
   from (
    select op.id player_id,op.joined_at,max(sa.nickname) nickname,
     coalesce(sum(a.points),0) points
    from public.org_next_players op
    left join public.org_next_answers a on a.player_id=op.id and a.room_id=op.room_id
    left join public.qwiz_student_accounts sa on sa.id=op.student_account_id
    where op.room_id=r.id group by op.id,op.joined_at
   )z
  )p;
 end if;
 return jsonb_build_object('code',r.code,'title',r.title,'phase',r.phase,'index',r.question_index,'total',total,'question',q,
 'activity',activity,'round_sound',(select x.questions->r.question_index->>'round_sound' from public.org_next_quizzes x where x.id=r.quiz_id),'ends_at',r.ends_at,'teams',coalesce(teams,'[]'::jsonb),'players',coalesce(players,'[]'::jsonb));
end $$;
