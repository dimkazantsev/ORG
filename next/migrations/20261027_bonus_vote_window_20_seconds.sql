-- Allow a real two-phase team ballot after the mini-game; 18-24 sec total.
CREATE OR REPLACE FUNCTION public.qwiz_bonus_window(p_room uuid, p_position integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT greatest(18,least(24,18+floor(greatest(0,coalesce(
 (select points from public.qwiz_arcade_rank(p_room,p_position) where place=1 limit 1),0))/25)::integer));
$function$
;
