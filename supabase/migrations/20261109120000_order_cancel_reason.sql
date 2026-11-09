-- Why an order was cancelled: written by whoever cancels it (store, customer, driver
-- or admin) and shown to the admin under «ملغاة».
alter table public.orders add column if not exists cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300);

create or replace function public.set_cancel_reason(p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; v text:=left(btrim(coalesce(p_reason,'')),300);
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'not permitted'; end if;
  select * into o from public.orders where id=p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.status<>'cancelled' then raise exception 'order not cancelled'; end if;
  if not coalesce(public.is_admin() or public.owns_store(o.store_id) or o.buyer_id is not distinct from auth.uid() or (o.driver_id is not null and o.driver_id=auth.uid()), false) then raise exception 'not permitted'; end if;
  if char_length(v)<3 then raise exception 'reason required'; end if;
  update public.orders set cancel_reason=v where id=p_order;
end $$;
revoke all on function public.set_cancel_reason(uuid,text) from public, anon;
grant execute on function public.set_cancel_reason(uuid,text) to authenticated;
notify pgrst,'reload schema';
