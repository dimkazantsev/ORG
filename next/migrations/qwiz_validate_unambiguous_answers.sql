create or replace function public.qwiz_validate_question(p_kind text,p_options jsonb,p_solution jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare n int; a jsonb; idx int; v text;
begin
 if jsonb_typeof(p_options)<>'array' or jsonb_typeof(p_solution)<>'object' then return false;end if;
 n:=jsonb_array_length(p_options);
 if p_kind in ('single','boolean','flag','portrait','image','audio','video','map','poll') then
  if n not between 2 and 6 then return false;end if;
  if p_kind='poll' then return true;end if;
  return jsonb_typeof(p_solution->'correct')='number'
      and (p_solution->>'correct')::int between 0 and n-1;
 elsif p_kind='multi' then
  if n not between 2 and 6 or jsonb_typeof(p_solution->'correct_indices')<>'array'
     or jsonb_array_length(p_solution->'correct_indices')<1 then return false;end if;
  for a in select value from jsonb_array_elements(p_solution->'correct_indices') loop
   if jsonb_typeof(a)<>'number' then return false;end if;
   idx:=(a#>>'{}')::integer;
   if idx not between 0 and n-1 then return false;end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_solution->'correct_indices'))<>
       (select count(distinct value) from jsonb_array_elements(p_solution->'correct_indices')) then return false;end if;
  return true;
 elsif p_kind='match' then
  if n not between 2 and 12 then return false;end if;
  for a in select value from jsonb_array_elements(p_options) loop
   if jsonb_typeof(a)<>'string' then return false;end if;
   v:=a#>>'{}';
   if position('=' in v)<2 or length(btrim(split_part(v,'=',2)))<1 then return false;end if;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(p_options) x
    group by lower(trim(split_part(x.value,'=',1))) having count(*)>1) then return false;end if;
  if exists(select 1 from jsonb_array_elements_text(p_options) x
    group by lower(trim(split_part(x.value,'=',2))) having count(*)>1) then return false;end if;
  return true;
 elsif p_kind in ('order','sequence') then
  if n not between 2 and 12 then return false;end if;
  return not exists(select 1 from jsonb_array_elements_text(p_options) x
    group by lower(trim(x.value)) having count(*)>1);
 elsif p_kind in ('text','riddle','puzzle','blitz','number','date','estimate') then
  if length(btrim(coalesce(p_solution->>'answer','')))=0 then return false;end if;
  if p_kind in ('number','estimate') then
   if (p_solution->>'answer') !~ '^-?[0-9]+([.,][0-9]+)?
 elsif p_kind='hotspot' then
  return jsonb_typeof(p_solution->'x')='number' and jsonb_typeof(p_solution->'y')='number'
   and jsonb_typeof(p_solution->'radius')='number'
   and (p_solution->>'x')::numeric between 0 and 100
   and (p_solution->>'y')::numeric between 0 and 100
   and (p_solution->>'radius')::numeric between 0.1 and 100
   and coalesce(p_solution->>'media_url','') ~ '^https://';
 end if;
 return false;
end $$; then return false;end if;
   if p_kind='estimate' and
    (coalesce(p_solution->>'tolerance','0') !~ '^[0-9]+([.][0-9]+)?
 elsif p_kind='hotspot' then
  return jsonb_typeof(p_solution->'x')='number' and jsonb_typeof(p_solution->'y')='number'
   and jsonb_typeof(p_solution->'radius')='number'
   and (p_solution->>'x')::numeric between 0 and 100
   and (p_solution->>'y')::numeric between 0 and 100
   and (p_solution->>'radius')::numeric between 0.1 and 100
   and coalesce(p_solution->>'media_url','') ~ '^https://';
 end if;
 return false;
end $$; or
    (coalesce(p_solution->>'tolerance','0'))::numeric<0) then return false;end if;
  end if;
  return true;
 elsif p_kind='hotspot' then
  return jsonb_typeof(p_solution->'x')='number' and jsonb_typeof(p_solution->'y')='number'
   and jsonb_typeof(p_solution->'radius')='number'
   and (p_solution->>'x')::numeric between 0 and 100
   and (p_solution->>'y')::numeric between 0 and 100
   and (p_solution->>'radius')::numeric between 0.1 and 100
   and coalesce(p_solution->>'media_url','') ~ '^https://';
 end if;
 return false;
end $$;
revoke execute on function public.qwiz_validate_question(text,jsonb,jsonb) from public,anon,authenticated;