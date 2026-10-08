CREATE OR REPLACE FUNCTION public.available_delivery_orders()
 RETURNS TABLE(order_id uuid, store_name text, product_total integer, platform_fee integer, delivery_fee integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1
    from public.delivery_workers w
    join public.profiles p on p.id = w.user_id
    where w.user_id = (select auth.uid())
      and w.approved
      and w.amount_due < w.debt_limit
      and not p.disabled
  ) then
    return;
  end if;

  return query
  select
    o.id,
    s.name,
    (o.total - o.platform_fee - o.delivery_fee),
    o.platform_fee,
    o.delivery_fee,
    o.created_at
  from public.orders o
  join public.stores s on s.id = o.store_id
  where o.status in ('new','accepted')
    and o.driver_id is null
    and s.approved
    and not s.removed
    and not exists (
      select 1
      from public.delivery_declines d
      where d.order_id = o.id
        and d.driver_id = (select auth.uid())
    )
  order by o.created_at desc
  limit 50;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_delivery(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.orders%rowtype;
begin
  if not exists (
    select 1
    from public.delivery_workers w
    join public.profiles p on p.id = w.user_id
    where w.user_id = (select auth.uid())
      and w.approved
      and w.amount_due < w.debt_limit
      and not p.disabled
  ) then
    raise exception 'driver unavailable or debt limit reached';
  end if;

  select *
  into v
  from public.orders
  where id = p_order
  for update;

  if not found
     or v.status not in ('new','accepted')
     or v.driver_id is not null then
    raise exception 'order no longer available';
  end if;

  update public.orders
  set driver_id = (select auth.uid())
  where id = p_order;
end;
$function$;

create or replace function private.notify_order_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; summary text; label text;
begin
 select s.owner_id into owner_id from public.stores s where s.id=new.store_id;
 select coalesce(string_agg(i.product_name||' × '||i.quantity,'، ' order by i.id),'طلب #'||right(new.id::text,6)) into summary from public.order_items i where i.order_id=new.id;
 if tg_op='INSERT' then
  insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,order_id)
  select r,'order:new:'||new.id,'order','طلب جديد من زبون',summary,new.id
  from (select owner_id r union select p.id from public.profiles p where p.role='admin' and not p.disabled) recipients where r is not null on conflict do nothing;
  insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,order_id)
  select w.user_id,'order:offer:'||new.id,'delivery_offer','طلب جديد متاح للتوصيل',summary,new.id
  from public.delivery_workers w join public.profiles p on p.id=w.user_id
  where w.approved and w.amount_due<w.debt_limit and not p.disabled on conflict do nothing;
 else
  if new.driver_id is distinct from old.driver_id and new.driver_id is not null then
   insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,order_id)
   select r,'order:assigned:'||new.id||':'||new.driver_id,'assigned',
    case when r=new.driver_id then 'وافقت على توصيل الطلب' else 'تمت الموافقة من قبل التوصيل' end,summary,new.id
   from (select unnest(array[owner_id,new.buyer_id,new.driver_id]) r union select p.id from public.profiles p where p.role='admin' and not p.disabled) recipients where r is not null on conflict do nothing;
  end if;
  if new.status is distinct from old.status then
   label:=case new.status when 'accepted' then 'تمت الموافقة من قبل البائع' when 'delivery' then 'استلم السائق الطلب' when 'delivered' then 'اكتمل توصيل الطلب' when 'cancelled' then 'أُلغي الطلب' else 'تحديث الطلب' end;
   insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,order_id)
   select r,'order:status:'||new.id||':'||new.status,'status',label,summary,new.id
   from (select unnest(array[owner_id,new.buyer_id,new.driver_id]) r union select p.id from public.profiles p where p.role='admin' and not p.disabled) recipients where r is not null on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.notify_order_activity() from public,anon,authenticated;

create or replace function private.refresh_order_notice_items() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.account_notifications set body=(select string_agg(i.product_name||' × '||i.quantity,'، ' order by i.id) from public.order_items i where i.order_id=new.order_id)
 where order_id=new.order_id and event_kind in ('order','delivery_offer');
 return new;
end $$;
revoke all on function private.refresh_order_notice_items() from public,anon,authenticated;

