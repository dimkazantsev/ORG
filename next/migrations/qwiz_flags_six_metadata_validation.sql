-- Tighten optional metadata before it is copied into public question snapshots.
begin;
do $patch$
declare src text;anchor text;
begin
 select pg_get_functiondef('public.qwiz_flags_question_valid(text,jsonb,jsonb)'::regprocedure) into src;
 anchor:=' if v_mode in (''similar'',''assemble'',''multiple'',''memory'',''geo'',''history'') then';
 if position('Invalid optional metadata' in src)=0 then
  if position(anchor in src)=0 then raise exception 'Unexpected flags validator version';end if;
  src:=replace(src,anchor,anchor||$code$
  -- Invalid optional metadata must never reach a public renderer.
  if p_solution ? 'source_urls' then
   if jsonb_typeof(p_solution->'source_urls') is distinct from 'array' then return false;end if;
   if jsonb_array_length(p_solution->'source_urls') not between 1 and 3 then return false;end if;
   if exists(select 1 from jsonb_array_elements(p_solution->'source_urls')x where jsonb_typeof(x.value)<>'string' or (x.value#>>'{}') !~ '^https://[^ /]+/[^ ]+$') then return false;end if;
  end if;
  if v_mode='memory' and ((p_solution->'flag_memory')-'seconds') is distinct from '{}'::jsonb then return false;end if;
  if v_mode='assemble' and ((p_solution->'flag_assembly')-'colors'-'orientation') is distinct from '{}'::jsonb then return false;end if;
$code$);
 end if;
 src:=replace(src,'(p_solution->''flag_memory''-''seconds'')','((p_solution->''flag_memory'')-''seconds'')');
 src:=replace(src,'(p_solution->''flag_assembly''-''colors''-''orientation'')','((p_solution->''flag_assembly'')-''colors''-''orientation'')');
 execute src;
end $patch$;
commit;
