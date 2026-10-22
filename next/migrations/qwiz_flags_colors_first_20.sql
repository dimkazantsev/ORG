-- Stage 3 curated initial batch: 20 national tricolours, four visual stripe permutations each.
-- Exact hue values are for accessible vector display; orientation and stripe order are the scored knowledge.
-- Seed creates 20 new questions, no changes to existing 390.
begin;
do $seed$
declare
 v_topic uuid;v_owner uuid;v_id uuid;v_idx integer:=0;v_pos integer;v_k integer;v_perm integer;
 v_perms integer[][]:=array[[1,2,3],[3,2,1],[2,3,1],[2,1,3]];
 v_options jsonb;v_labels jsonb;v_order text[];v_choice text[];v_solution jsonb;
 v_row record;v_count int;
begin
 select id,owner_id into v_topic,v_owner from public.qwiz_topics where name='Флаги мира';
 if v_topic is null then raise exception 'Flags topic not found';end if;
 for v_row in select * from (values
 ('DE','Германия','horizontal',array['#000000','#DD0000','#FFCE00'],array['чёрный','красный','золотой']),
 ('RU','Россия','horizontal',array['#FFFFFF','#0039A6','#D52B1E'],array['белый','синий','красный']),
 ('HU','Венгрия','horizontal',array['#CE293D','#FFFFFF','#477050'],array['красный','белый','зелёный']),
 ('BG','Болгария','horizontal',array['#FFFFFF','#00966E','#D62612'],array['белый','зелёный','красный']),
 ('NL','Нидерланды','horizontal',array['#AE1C28','#FFFFFF','#21468B'],array['красный','белый','синий']),
 ('EE','Эстония','horizontal',array['#4891D9','#000000','#FFFFFF'],array['голубой','чёрный','белый']),
 ('LT','Литва','horizontal',array['#FDB913','#006A44','#C1272D'],array['жёлтый','зелёный','красный']),
 ('LU','Люксембург','horizontal',array['#EF3340','#FFFFFF','#00A3E0'],array['красный','белый','голубой']),
 ('YE','Йемен','horizontal',array['#CE1126','#FFFFFF','#000000'],array['красный','белый','чёрный']),
 ('GA','Габон','horizontal',array['#009E60','#FCD116','#3A75C4'],array['зелёный','жёлтый','синий']),
 ('AM','Армения','horizontal',array['#D90012','#0033A0','#F2A800'],array['красный','синий','оранжевый']),
 ('SL','Сьерра-Леоне','horizontal',array['#1EB53A','#FFFFFF','#0072C6'],array['зелёный','белый','голубой']),
 ('FR','Франция','vertical',array['#0055A4','#FFFFFF','#EF4135'],array['синий','белый','красный']),
 ('IT','Италия','vertical',array['#009246','#FFFFFF','#CE2B37'],array['зелёный','белый','красный']),
 ('IE','Ирландия','vertical',array['#169B62','#FFFFFF','#FF883E'],array['зелёный','белый','оранжевый']),
 ('BE','Бельгия','vertical',array['#000000','#FDDA24','#EF3340'],array['чёрный','жёлтый','красный']),
 ('RO','Румыния','vertical',array['#002B7F','#FCD116','#CE1126'],array['синий','жёлтый','красный']),
 ('ML','Мали','vertical',array['#14B53A','#FCD116','#CE1126'],array['зелёный','жёлтый','красный']),
 ('GN','Гвинея','vertical',array['#CE1126','#FCD116','#009460'],array['красный','жёлтый','зелёный']),
 ('TD','Чад','vertical',array['#002664','#FECB00','#C60C30'],array['синий','жёлтый','красный'])
 ) t(iso,ru,orient,hexes,names) loop
   v_idx:=v_idx+1;v_pos:=(v_idx-1)%4;v_options:='[]'::jsonb;v_labels:='[]'::jsonb;
   for v_k in 0..3 loop
     v_perm:=((v_k-v_pos+4)%4)+1;
     v_choice:=array[
       v_row.hexes[v_perms[v_perm][1]],v_row.hexes[v_perms[v_perm][2]],v_row.hexes[v_perms[v_perm][3]]
     ];
     v_order:=array[
       v_row.names[v_perms[v_perm][1]],v_row.names[v_perms[v_perm][2]],v_row.names[v_perms[v_perm][3]]
     ];
     v_options:=v_options||jsonb_build_array(jsonb_build_object('orientation',v_row.orient,'stripes',to_jsonb(v_choice)));
     v_labels:=v_labels||jsonb_build_array(array_to_string(v_order,' — '));
   end loop;
   v_solution:=jsonb_build_object('flag_mode','colors','correct',v_pos,'option_labels',v_labels);
   if not public.qwiz_flags_question_valid('flag',v_options,v_solution) then
     raise exception 'Invalid stripe options for %',v_row.iso;end if;
   if not exists(select 1 from public.qwiz_bank q where q.topic_id=v_topic
      and q.solution->>'flag_mode'='colors' and 'iso:'||v_row.iso=any(q.tags)) then
     insert into public.qwiz_bank(owner_id,topic_id,kind,prompt,options,solution,explanation,difficulty,tags)
     values(v_owner,v_topic,'flag','В каком порядке расположены '||
       (case when v_row.orient='horizontal' then 'горизонтальные полосы (сверху вниз)' else 'вертикальные полосы (слева направо)' end)
       ||' на флаге государства «'||v_row.ru||'»?',v_options,v_solution,
       'Правильный порядок: '||array_to_string(v_row.names,' — ')||'.',2,
       array['fw:colors-stage3','fw:published','iso:'||v_row.iso,'source:curated-tricolors']);
   end if;
 end loop;
 if (select count(*) from public.qwiz_bank q where q.topic_id=v_topic and 'fw:colors-stage3'=any(q.tags))<>20
 then raise exception 'Expected 20 color questions';end if;
end $seed$;
commit;