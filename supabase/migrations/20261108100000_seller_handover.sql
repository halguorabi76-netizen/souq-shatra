-- Seller hands a prepared order to its assigned driver: accepted -> delivery.
-- Same function as live, with one extra allowed transition for the store owner
-- (only when a driver is already assigned). Everything else is unchanged.
CREATE OR REPLACE FUNCTION public.set_order_status(p_order uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.orders%rowtype; i record;
begin
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'order not found'; end if;
 if auth.uid() is null or not public.is_active_user() or not (public.is_admin() or public.owns_store(o.store_id) or (o.buyer_id=auth.uid() and p_status='cancelled' and ((o.status in ('new','accepted') and o.driver_id is null) or (o.status in ('new','accepted','delivery') and exists(select 1 from public.delivery_tracking where order_id=o.id and late_reported_at is not null))))) then raise exception 'not permitted'; end if;
 if not ((o.buyer_id=auth.uid() and p_status='cancelled' and o.status in ('new','accepted','delivery') and exists(select 1 from public.delivery_tracking where order_id=o.id and late_reported_at is not null))
   or (o.status='new' and p_status in ('accepted','cancelled'))
   or (o.status='accepted' and p_status='delivery' and o.driver_id is not null and (public.owns_store(o.store_id) or public.is_admin()))
   or (o.status='accepted' and p_status='cancelled' and (o.driver_id is null or public.is_admin()))
   or (o.driver_id is null and o.status='delivery' and p_status='cancelled')) then raise exception 'invalid transition'; end if;
 update public.orders set status=p_status,driver_id=case when p_status='cancelled' then null else driver_id end where id=p_order;
 if p_status='cancelled' then
 perform set_config('souq.inventory_reason','cancelled_order',true);perform set_config('souq.inventory_order',p_order::text,true);
 for i in select product_id,variant_id,sum(quantity)::integer qty from public.order_items where order_id=p_order and product_id is not null group by product_id,variant_id order by product_id,variant_id loop
 perform 1 from public.products where id=i.product_id for update;
 if i.variant_id is not null then update public.product_variants set stock=stock+i.qty where id=i.variant_id and product_id=i.product_id;
 elsif not exists(select 1 from public.products where id=i.product_id and has_variants) then update public.products set stock=stock+i.qty where id=i.product_id;
 else
 update public.products set legacy_stock_reserve=legacy_stock_reserve+i.qty where id=i.product_id;
 insert into public.product_stock_movements(store_id,product_id,product_name,delta,balance,reason,actor_id,order_id) select store_id,id,name,i.qty,legacy_stock_reserve,'legacy_cancel_after_conversion',auth.uid(),p_order from public.products where id=i.product_id;
 end if;
 end loop;
 end if;
end; $function$;
revoke all on function public.set_order_status(uuid,text) from public,anon;
grant execute on function public.set_order_status(uuid,text) to authenticated;
notify pgrst,'reload schema';
