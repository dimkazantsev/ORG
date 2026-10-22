-- ONE-TIME, GUARDED content reset for the QWIZ-PARTY lecturer's former template catalog.
-- Removes old topics and the old build only when there are 0 questions and 0 rooms.
-- Never touches org_quiz_* legacy game state, ГОС.ID, auth, or game results.
-- Original topic/build/card rows are archived in inaccessible quiz_private schema.
-- DO NOT wire this file into automatic migrations.
begin;
create table if not exists quiz_private.qwiz_flags_reset_archive_20261022 (
  entity text not null check(entity in ('topic','build','build_card')),
  original_id uuid not null,
  payload jsonb not null,
  archived_at timestamptz not null default now(),
  primary key(entity,original_id)
);
revoke all on quiz_private.qwiz_flags_reset_archive_20261022 from public,anon,authenticated;

do $reset$
declare
  v_owner uuid; v_flag_id uuid;
  v_count integer;
begin
  -- On rerun after a successful reset, do not touch the freshly-created catalog.
  select id,owner_id into v_flag_id,v_owner
  from public.qwiz_topics where name='Флаги стран' order by created_at limit 1;
  if v_flag_id is null then
    if exists(select 1 from public.qwiz_topics where name='Флаги мира') and
       exists(select 1 from quiz_private.qwiz_flags_reset_archive_20261022) then
       return;
    end if;
    raise exception 'Старая тема флагов не найдена: очистка отменена';
  end if;
  select count(*) into v_count from public.qwiz_topics where name='Флаги стран';
  if v_count<>1 then raise exception 'Неоднозначная тема флагов: очистка отменена';end if;
  if (select count(*) from public.qwiz_bank where owner_id=v_owner)<>0 then
    raise exception 'Вопросы существуют: требуется отдельная проверка и архив';
  end if;
  if (select count(*) from public.org_next_rooms where owner_id=v_owner)<>0 then
    raise exception 'Есть игровые комнаты: очистка отменена';
  end if;
  if (select count(*) from public.qwiz_topics where owner_id=v_owner)<>14
     or (select count(*) from public.qwiz_builds where owner_id=v_owner)<>1 then
    raise exception 'Состав старого каталога изменился: очистка отменена';
  end if;
  -- Restore order: topic -> build -> build_card. Archive all original row values.
  insert into quiz_private.qwiz_flags_reset_archive_20261022(entity,original_id,payload)
  select 'topic',t.id,to_jsonb(t) from public.qwiz_topics t where t.owner_id=v_owner
  on conflict do nothing;
  insert into quiz_private.qwiz_flags_reset_archive_20261022(entity,original_id,payload)
  select 'build',b.id,to_jsonb(b) from public.qwiz_builds b where b.owner_id=v_owner
  on conflict do nothing;
  insert into quiz_private.qwiz_flags_reset_archive_20261022(entity,original_id,payload)
  select 'build_card',c.id,to_jsonb(c) from public.qwiz_build_cards c
  where c.build_id in (select id from public.qwiz_builds where owner_id=v_owner)
  on conflict do nothing;

  delete from public.qwiz_build_cards c
    where c.build_id in (select id from public.qwiz_builds where owner_id=v_owner);
  delete from public.qwiz_builds where owner_id=v_owner;
  delete from public.qwiz_topics where owner_id=v_owner and id<>v_flag_id;
  update public.qwiz_topics set name='Флаги мира',category='География' where id=v_flag_id;

  if (select count(*) from public.qwiz_topics where owner_id=v_owner)<>1
     or (select count(*) from public.qwiz_builds where owner_id=v_owner)<>0 then
    raise exception 'Очистка не прошла итоговую проверку';
  end if;
end $reset$;
commit;
