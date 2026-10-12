-- Customer order management; preserve financial and inventory history.
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
 if auth.uid() is null or not public.is_active_user() or not (public.is_admin() or public.owns_store(o.store_id) or (o.buyer_id=auth.uid() and p_status='cancelled' and o.status in ('new','accepted') and o.driver_id is null)) then raise exception 'not permitted'; end if;
 if not ((o.status='new' and p_status in ('accepted','cancelled')) or (o.status='accepted' and p_status='cancelled' and (o.driver_id is null or public.is_admin())) or (o.driver_id is null and o.status='delivery' and p_status='cancelled')) then raise exception 'invalid transition'; end if;
 update public.orders set status=p_status,driver_id=case when p_status='cancelled' then null else driver_id end where id=p_order;
 if p_status='cancelled' then
 perform set_config('souq.inventory_reason','cancelled_order',true);perform set_config('souq.inventory_order',p_order::text,true);
 for i in select product_id,variant_id,sum(quantity)::integer qty from public.order_items where order_id=p_order and product_id is not null group by product_id,variant_id order by product_id,variant_id loop
 perform 1 from public.products where id=i.product_id for update;
 if i.variant_id is not null then update public.product_variants set stock=stock+i.qty where id=i.variant_id and product_id=i.product_id;
 elsif not exists(select 1 from public.products where id=i.product_id and has_variants) then update public.products set stock=stock+i.qty where id=i.product_id;
 else
 -- Old orders predating conversion retain a separate legacy reserve; never credit an arbitrary size.
 update public.products set legacy_stock_reserve=legacy_stock_reserve+i.qty where id=i.product_id;
 insert into public.product_stock_movements(store_id,product_id,product_name,delta,balance,reason,actor_id,order_id) select store_id,id,name,i.qty,legacy_stock_reserve,'legacy_cancel_after_conversion',auth.uid(),p_order from public.products where id=i.product_id;
 end if;
 end loop;
 end if;
end; $function$
;
create table public.order_customer_actions (
 order_id uuid primary key references public.orders(id) on delete cascade,
 buyer_id uuid not null references public.profiles(id),
 hidden_at timestamptz,
 request_kind text check(request_kind in ('cancel','return')),
 reason text not null default '' check(length(reason)<=500),
 updated_at timestamptz not null default now()
);
alter table public.order_customer_actions enable row level security;
create policy customer_actions_read on public.order_customer_actions for select to authenticated
 using(public.is_active_user() and (buyer_id=(select auth.uid()) or public.is_admin() or exists(select 1 from public.orders o where o.id=order_id and public.owns_store(o.store_id))));
revoke all on public.order_customer_actions from anon,authenticated;
grant select on public.order_customer_actions to authenticated;

create or replace function public.customer_order_action(p_order uuid,p_action text,p_reason text default '')
returns text language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; recipient uuid; kind text; title text;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'not permitted';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.buyer_id<>auth.uid() then raise exception 'not permitted';end if;
 if p_action not in ('hide','restore','cancel','return') or p_action is null then raise exception 'invalid action';end if;
 if length(coalesce(p_reason,''))>500 then raise exception 'reason too long';end if;
 if p_action in ('hide','restore') then
  insert into public.order_customer_actions(order_id,buyer_id,hidden_at) values(o.id,o.buyer_id,case when p_action='hide' then now() else null end)
  on conflict(order_id) do update set hidden_at=excluded.hidden_at,updated_at=now();
  return p_action;
 end if;
 if p_action='cancel' and o.status='cancelled' then return 'cancelled';end if;
 if p_action='cancel' and o.status in ('new','accepted') and o.driver_id is null then
  perform public.set_order_status(o.id,'cancelled');return 'cancelled';
 end if;
 if (p_action='return' and o.status<>'delivered') or (p_action='cancel' and o.status not in ('new','accepted','delivery')) then raise exception 'invalid transition';end if;
 kind:=p_action;title:=case when kind='return' then 'طلب إرجاع من الزبون' else 'طلب إلغاء من الزبون' end;
 if exists(select 1 from public.order_customer_actions where order_id=o.id and request_kind=kind) then return 'requested';end if;
 insert into public.order_customer_actions(order_id,buyer_id,request_kind,reason)
 values(o.id,o.buyer_id,kind,coalesce(p_reason,''))
 on conflict(order_id) do update set request_kind=excluded.request_kind,reason=excluded.reason,updated_at=now();
 for recipient in select id from public.profiles where not disabled and
 (id=o.buyer_id or role='admin' or id=o.driver_id or id in(select owner_id from public.stores where id=o.store_id)) loop
 insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,order_id)
 values(recipient,'order:customer:'||o.id||':'||kind,'order',title,'أرسل الزبون طلبًا للمراجعة. '||coalesce(p_reason,''),o.id)
 on conflict(recipient_id,event_key) do nothing;
 end loop;
 return 'requested';
end $$;
revoke all on function public.customer_order_action(uuid,text,text) from public,anon;
grant execute on function public.customer_order_action(uuid,text,text) to authenticated;

