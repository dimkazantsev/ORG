-- Execute saved non-question cards as separate server-authoritative activities.
begin;
create table if not exists public.qwiz_room_activity (
 room_id uuid primary key references public.org_next_rooms(id) on delete cascade,
 card_position integer not null,
 title text not null,
 kind text not null,
 settings jsonb not null default '{}'::jsonb,
 entered_at timestamptz not null default now()
);
alter table public.qwiz_room_activity enable row level security;
revoke all on public.qwiz_room_activity from public,anon,authenticated;

create or replace function public.org_next_advance(p_room uuid,p_action text)
returns text language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype; q jsonb; questions jsonb; timeline jsonb;
 v_duration integer;v_next integer;v_prev_card integer;v_next_card jsonb;v_kind text;
 v_card_pos integer;
begin
 if (select auth.uid()) is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 select * into r from public.org_next_rooms where id=p_room for update;
 if not found or r.owner_id<>(select auth.uid()) then raise exception 'Комната не найдена';end if;
 select questions into questions from public.org_next_quizzes where id=r.quiz_id;
 select rb.timeline into timeline from public.qwiz_room_builds rb where rb.room_id=p_room;
 if p_action='finish' then
  update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
  delete from public.qwiz_room_activity where room_id=p_room;
 elsif p_action='start' and r.phase='lobby' then
  if timeline is not null and jsonb_array_length(timeline)>0 and timeline->0->>'type'<>'round' then
   v_next_card:=timeline->0;
   insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
    values(p_room,0,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
    on conflict(room_id) do update set card_position=0,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
   update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
  else
   q:=questions->0;
   if timeline is not null then
    update public.org_next_rooms set phase='countdown',question_index=0,ends_at=now()+interval '5 seconds' where id=p_room;
   else
    v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
    update public.org_next_rooms set phase='question',question_index=0,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
   end if;
  end if;
 elsif p_action='reveal' and r.phase='question' then
  update public.org_next_rooms set phase='result',ends_at=null where id=p_room;
 elsif p_action='next' and r.phase='intermission' then
  select a.card_position into v_card_pos from public.qwiz_room_activity a where a.room_id=p_room;
  if v_card_pos is null or timeline is null then raise exception 'Переход не найден';end if;
  v_next_card:=timeline->(v_card_pos+1);
  if v_next_card is null or v_next_card->>'type'='finale' then
    update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
    delete from public.qwiz_room_activity where room_id=p_room;
  elsif v_next_card->>'type'='round' then
    v_next:=coalesce((v_next_card->>'first_question')::int,r.question_index+1);
    update public.org_next_rooms set phase='countdown',question_index=v_next,ends_at=now()+interval '5 seconds' where id=p_room;
    delete from public.qwiz_room_activity where room_id=p_room;
  else
    insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
      values(p_room,v_card_pos+1,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
      on conflict(room_id) do update set card_position=excluded.card_position,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
    update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
  end if;
 elsif p_action='next' and r.phase='result' then
  v_next:=r.question_index+1;
  if timeline is null then
    if v_next>=jsonb_array_length(questions) then
      update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
    else
      q:=questions->v_next;
      v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
      update public.org_next_rooms set phase='question',question_index=v_next,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
    end if;
  else
    v_prev_card:=coalesce((questions->r.question_index->>'round_index')::int,0);
    if v_next<jsonb_array_length(questions) and
     coalesce((questions->v_next->>'round_index')::int,0)=v_prev_card then
      q:=questions->v_next;
      v_duration:=greatest(10,least(120,coalesce((q->>'duration')::integer,30)));
      update public.org_next_rooms set phase='question',question_index=v_next,ends_at=now()+make_interval(secs=>v_duration) where id=p_room;
    else
      v_next_card:=timeline->(v_prev_card+1);
      if v_next_card is null or v_next_card->>'type'='finale' then
       update public.org_next_rooms set phase='finished',ends_at=null where id=p_room;
      elsif v_next_card->>'type'='round' then
       update public.org_next_rooms set phase='countdown',question_index=v_next,ends_at=now()+interval '5 seconds' where id=p_room;
      else
       insert into public.qwiz_room_activity(room_id,card_position,title,kind,settings)
       values(p_room,v_prev_card+1,v_next_card->>'title',v_next_card->>'type',v_next_card->'settings')
       on conflict(room_id) do update set card_position=excluded.card_position,title=excluded.title,kind=excluded.kind,settings=excluded.settings,entered_at=now();
       update public.org_next_rooms set phase='intermission',ends_at=null where id=p_room;
      end if;
    end if;
  end if;
 else raise exception 'Недопустимое действие для текущего этапа';end if;
 return (select phase from public.org_next_rooms where id=p_room);
end $$;

-- Audience API adds live activity title and rankings, but never exposes answer keys.
create or replace function public.qwiz_public_screen(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.org_next_rooms%rowtype;q jsonb;total integer;teams jsonb;players jsonb;activity jsonb;
begin
 if p_code is null or p_code !~ '^[A-F0-9]{8}$' then raise exception 'Неверный код';end if;
 select * into r from public.org_next_rooms where code=p_code;
 if not found then raise exception 'Комната не найдена';end if;
 select jsonb_array_length(x.questions),case when r.question_index>=0 then
   (x.questions->r.question_index)-'correct'-'explanation' else null end
 into total,q from public.org_next_quizzes x where x.id=r.quiz_id;
 if r.phase not in ('question','result') then q:=null;end if;
 if r.phase='intermission' then
  select jsonb_build_object('type',a.kind,'title',a.title,'icon','◉','sound',coalesce(a.settings->>'sound','none'))
  into activity from public.qwiz_room_activity a where a.room_id=r.id;
 end if;
 if r.phase='finished' or activity->>'type' in ('team_stats','player_stats') then
  select coalesce(jsonb_agg(jsonb_build_object('name',t.name,'score',t.score,'position',t.rnk) order by t.rnk),'[]'::jsonb)
  into teams from (select name,score,rank() over(order by score desc) rnk from public.org_next_teams where room_id=r.id)t;
  select coalesce(jsonb_agg(jsonb_build_object('nickname','Игрок '||lpad(p.rnk::text,2,'0'),'score',p.points,'position',p.rnk) order by p.rnk),'[]'::jsonb)
  into players from (select a.player_id,sum(a.points) points,rank() over(order by sum(a.points) desc) rnk
   from public.org_next_answers a where a.room_id=r.id group by a.player_id)p;
 end if;
 return jsonb_build_object('code',r.code,'title',r.title,'phase',r.phase,'index',r.question_index,'total',total,'question',q,
 'activity',activity,'ends_at',r.ends_at,'teams',coalesce(teams,'[]'::jsonb),'players',coalesce(players,'[]'::jsonb));
end $$;
revoke execute on function public.qwiz_public_screen(text) from public;
grant execute on function public.qwiz_public_screen(text) to anon,authenticated;
commit;