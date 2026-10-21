create or replace function public.qwiz_seed_topics()
returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid;v_count integer;
begin
 v_user:=(select auth.uid());
 if v_user is null or not public.org_quiz_is_admin_check() then raise exception 'Недостаточно прав';end if;
 insert into public.qwiz_topics(owner_id,name,category)
 select v_user,x.name,x.category from (values
 ('Флаги стран','География'),('Города и столицы','География'),
 ('Лица и портреты','Лица и биографии'),('Исторические события','История'),
 ('Кино и сериалы','Культура и искусство'),('Угадай мелодию','Кино и музыка'),
 ('Искусство','Культура и искусство'),('Наука и изобретения','Наука и техника'),
 ('Спорт','Спорт'),('Природа и животные','Общие знания'),
 ('Политика и общество','Политика и общество'),('Логика и загадки','Логика'),
 ('Технологии и интернет','Наука и техника'),('Карты и география','География')
 ) as x(name,category)
 where not exists(select 1 from public.qwiz_topics t where t.owner_id=v_user and t.name=x.name);
 get diagnostics v_count=row_count;
 return v_count;
end $$;
revoke execute on function public.qwiz_seed_topics() from public,anon;
grant execute on function public.qwiz_seed_topics() to authenticated;