-- Run AFTER GitHub Pages deployed next/assets/flags-world/*.svg.
-- Swap only the 80 reviewed pilot questions to first-party cacheable static assets.
-- No request-time database media transfer. Reversible from archive/source URL prefix if necessary.
begin;
do $local_assets$
declare
 v_prefix constant text:='https://dimkazantsev.github.io/ORG/next/assets/flags-world/';
 v_topic uuid; v_q public.qwiz_bank%rowtype; v_code text;v_opts jsonb;v_asset text;
 v_img jsonb;v_k integer;v_mode text;
begin
 select id into v_topic from public.qwiz_topics where name='Флаги мира';
 if v_topic is null then raise exception 'Флаги мира: тема не найдена';end if;
 if (select count(*) from public.qwiz_bank where topic_id=v_topic and 'fw:pilot'=any(tags))<>80
   then raise exception 'Ожидалось ровно 80 проверенных вопросов';end if;
 for v_q in select * from public.qwiz_bank where topic_id=v_topic and 'fw:pilot'=any(tags) loop
   v_mode:=v_q.solution->>'flag_mode';
   if v_mode='country' then
     select lower(substring(tag from 5)) into v_code from unnest(v_q.tags) tag where tag like 'iso:%' limit 1;
     if v_code !~ '^[a-z]{2}$' then raise exception 'Нет ISO у вопроса %',v_q.id;end if;
     v_asset:=v_prefix||v_code||'.svg';
     update public.qwiz_bank set solution=jsonb_set(v_q.solution,'{media_url}',to_jsonb(v_asset),true)
       where id=v_q.id;
   elsif v_mode='picker' then
     v_opts:='[]'::jsonb;
     for v_img in select value from jsonb_array_elements(v_q.options) loop
       v_code:=right(split_part(v_img->>'image_url','.svg',1),2);
       if v_code !~ '^[a-z]{2}$' then raise exception 'Неверная ссылка картинки у %',v_q.id;end if;
       v_opts:=v_opts||jsonb_build_array(jsonb_build_object('image_url',v_prefix||v_code||'.svg'));
     end loop;
     update public.qwiz_bank set options=v_opts where id=v_q.id;
   else raise exception 'Неизвестная механика у %',v_q.id;end if;
 end loop;
 if exists(select 1 from public.qwiz_bank q where q.topic_id=v_topic and 'fw:pilot'=any(q.tags)
    and not public.qwiz_flags_question_valid(q.kind,q.options,q.solution)) then
    raise exception 'После переноса URL обнаружен невалидный вопрос';end if;
 if exists(select 1 from public.qwiz_bank q where q.topic_id=v_topic and 'fw:pilot'=any(q.tags)
    and ((q.solution->>'flag_mode'='country' and q.solution->>'media_url' not like v_prefix||'%')
      or (q.solution->>'flag_mode'='picker' and exists(
       select 1 from jsonb_array_elements(q.options) x where x.value->>'image_url' not like v_prefix||'%'))))
 then raise exception 'Часть ссылок осталась внешней';end if;
end $local_assets$;
commit;