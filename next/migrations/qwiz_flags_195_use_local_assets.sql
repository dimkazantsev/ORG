-- Apply only after the new 155 SVGs are successfully deployed on GitHub Pages.
-- Switch 310 new catalog questions from immutable pinned raw URLs to local assets.
-- Earlier 80 pilot questions already use first-party URLs.
-- No changes to question keys, publication status or scoring.
begin;
do $set_local$
declare
 v_prefix constant text:='https://dimkazantsev.github.io/ORG/next/assets/flags-world/';
 v_q public.qwiz_bank%rowtype;v_code text;v_img jsonb;v_opts jsonb;v_n integer;
begin
 select count(*) into v_n from public.qwiz_bank q join public.qwiz_topics t on t.id=q.topic_id
 where t.name='Флаги мира' and 'fw:catalog195'=any(q.tags);
 if v_n<>310 then raise exception 'Expected 310 new questions, found %',v_n;end if;
 for v_q in select q.* from public.qwiz_bank q join public.qwiz_topics t on t.id=q.topic_id
    where t.name='Флаги мира' and 'fw:catalog195'=any(q.tags) loop
   if v_q.solution->>'flag_mode'='country' then
     select lower(substring(tag from 5)) into v_code from unnest(v_q.tags) tag
       where tag like 'iso:%' limit 1;
     if v_code !~ '^[a-z]{2}$' then raise exception 'Missing ISO code for %',v_q.id;end if;
     update public.qwiz_bank set solution=jsonb_set(v_q.solution,'{media_url}',
       to_jsonb(v_prefix||v_code||'.svg'),true) where id=v_q.id;
   elsif v_q.solution->>'flag_mode'='picker' then
     v_opts:='[]'::jsonb;
     for v_img in select value from jsonb_array_elements(v_q.options) loop
       v_code:=right(split_part(v_img->>'image_url','.svg',1),2);
       if v_code !~ '^[a-z]{2}$' then raise exception 'Incorrect SVG URL for %',v_q.id;end if;
       v_opts:=v_opts||jsonb_build_array(jsonb_build_object('image_url',v_prefix||v_code||'.svg'));
     end loop;
     update public.qwiz_bank set options=v_opts where id=v_q.id;
   else raise exception 'Unknown mechanism on %',v_q.id;end if;
 end loop;
 if exists(select 1 from public.qwiz_bank q join public.qwiz_topics t on t.id=q.topic_id
   where t.name='Флаги мира' and not public.qwiz_flags_question_valid(q.kind,q.options,q.solution))
 then raise exception 'Invalid flag answers after URL update';end if;
 if exists(select 1 from public.qwiz_bank q join public.qwiz_topics t on t.id=q.topic_id
   where t.name='Флаги мира' and 'fw:catalog195'=any(q.tags)
   and ((q.solution->>'flag_mode'='country' and q.solution->>'media_url' not like v_prefix||'%')
   or (q.solution->>'flag_mode'='picker' and exists(
      select 1 from jsonb_array_elements(q.options) v where v.value->>'image_url' not like v_prefix||'%'))))
 then raise exception 'A flag URL still points to a third-party host';end if;
end $set_local$;
commit;