CREATE OR REPLACE FUNCTION public.delivery_step(p_order uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v public.orders%rowtype;
begin
 if auth.uid() is null or not public.is_active_user() or not exists(
  select 1 from public.delivery_workers w where w.user_id=auth.uid() and w.approved
 ) then raise exception 'active approved driver required'; end if;
 select * into v from public.orders where id=p_order for update;
 if not found or v.driver_id is distinct from auth.uid() then raise exception 'not assigned to you';end if;
 -- A retried delivery confirmation must not charge the platform fee twice.
 if v.status='delivered' and p_status='delivered' then return;end if;
 if not (
  (v.status='accepted' and p_status='delivery') or
  (v.status in ('accepted','delivery') and p_status='delivered')
 ) then raise exception 'invalid transition';end if;
 update public.orders set status=p_status where id=p_order;
 if p_status='delivered' then
  update public.delivery_workers set amount_due=amount_due+v.platform_fee where user_id=auth.uid();
 end if;
end;$function$;
REVOKE EXECUTE ON FUNCTION public.delivery_step(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delivery_step(uuid,text) TO authenticated;
