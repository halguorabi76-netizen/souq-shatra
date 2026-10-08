-- Additive: no existing orders, prices, inventory, approvals or balances are changed.
alter table public.stores add column if not exists store_kind text
  check (store_kind in ('physical','online'));
alter table public.stores add constraint physical_store_address_required
  check (store_kind is distinct from 'physical' or (address is not null and length(trim(address)) between 3 and 500));

create table public.store_pickups (
 store_id uuid primary key references public.stores(id) on delete cascade,
 pickup_address text not null check(length(trim(pickup_address)) between 3 and 500)
);
alter table public.store_pickups enable row level security;
revoke all on public.store_pickups from anon,authenticated;
grant select on public.store_pickups to authenticated;
create policy "owner reads pickup" on public.store_pickups for select to authenticated
 using (exists(select 1 from public.stores s where s.id=store_id and s.owner_id=(select auth.uid())) or (select public.is_admin()));

create table public.driver_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 full_name text not null check(length(trim(full_name)) between 2 and 160),
 phone text not null check(phone ~ '^[0-9]{10,15}$'),
 email text not null,
 address text not null check(length(trim(address)) between 3 and 500),
 vehicle text not null check(length(trim(vehicle)) between 2 and 160),
 updated_at timestamptz not null default now()
);
alter table public.driver_profiles enable row level security;
revoke all on public.driver_profiles from anon,authenticated;
grant select on public.driver_profiles to authenticated;
create policy "driver profile private" on public.driver_profiles for select to authenticated
 using (user_id=(select auth.uid()) or (select public.is_admin()));

create table public.product_interactions (
 user_id uuid not null references public.profiles(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 kind text not null check(kind in ('favorite','like')),
 created_at timestamptz not null default now(),
 primary key(user_id,product_id,kind)
);
alter table public.product_interactions enable row level security;
revoke all on public.product_interactions from anon,authenticated;
grant select,insert,delete on public.product_interactions to authenticated;
create policy "own interactions read" on public.product_interactions for select to authenticated using(user_id=(select auth.uid()));
create policy "own interactions add" on public.product_interactions for insert to authenticated
 with check(user_id=(select auth.uid()) and (select public.is_active_user()) and exists(
  select 1 from public.products p join public.stores s on s.id=p.store_id
  where p.id=product_id and p.active and not p.blocked and s.approved and not s.removed and s.owner_id<>auth.uid()));
create policy "own interactions remove" on public.product_interactions for delete to authenticated using(user_id=(select auth.uid()));
create index product_interactions_product_idx on public.product_interactions(product_id);

create table public.account_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 event_key text not null,
 event_kind text not null,
 title text not null,
 body text not null default '',
 order_id uuid references public.orders(id) on delete cascade,
 product_id uuid references public.products(id) on delete set null,
 read_at timestamptz,
 created_at timestamptz not null default now(),
 unique(recipient_id,event_key)
);
create index account_notifications_inbox_idx on public.account_notifications(recipient_id,created_at desc);
create index account_notifications_order_idx on public.account_notifications(order_id);
create index account_notifications_product_idx on public.account_notifications(product_id);
alter table public.account_notifications enable row level security;
revoke all on public.account_notifications from anon,authenticated;
grant select,update(read_at) on public.account_notifications to authenticated;
create policy "recipient reads notifications" on public.account_notifications for select to authenticated
 using(recipient_id=(select auth.uid()) and (select public.is_active_user()));
create policy "recipient marks read" on public.account_notifications for update to authenticated
 using(recipient_id=(select auth.uid()) and (select public.is_active_user()))
 with check(recipient_id=(select auth.uid()) and (select public.is_active_user()));

create or replace function private.notify_product_interaction() returns trigger
 language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype; s public.stores%rowtype;
begin
 select * into p from public.products where id=new.product_id;
 select * into s from public.stores where id=p.store_id;
 if new.user_id is distinct from auth.uid() or not public.is_active_user() or not p.active or p.blocked or not s.approved or s.removed or s.owner_id=new.user_id then
  raise exception 'interaction not allowed';
 end if;
 insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,product_id)
 values(s.owner_id,'interaction:'||new.user_id||':'||p.id||':'||new.kind,new.kind,
  case when new.kind='favorite' then 'أُضيف منتجك إلى المفضلة' else 'إعجاب جديد بمنتجك' end,p.name,p.id)
 on conflict(recipient_id,event_key) do nothing;
 return new;
end $$;
revoke all on function private.notify_product_interaction() from public,anon,authenticated;
create trigger product_interaction_notice after insert on public.product_interactions
 for each row execute function private.notify_product_interaction();

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

create trigger order_activity_notice after insert or update of status,driver_id on public.orders
 for each row execute function private.notify_order_activity();
create or replace function private.refresh_order_notice_items() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 update public.account_notifications set body=(select string_agg(i.product_name||' × '||i.quantity,'، ' order by i.id) from public.order_items i where i.order_id=new.order_id)
 where order_id=new.order_id and event_kind in ('order','delivery_offer');
 return new;
end $$;
revoke all on function private.refresh_order_notice_items() from public,anon,authenticated;
create trigger order_notice_items after insert on public.order_items for each row execute function private.refresh_order_notice_items();

create or replace function private.save_store_location(p_store uuid,p_kind text,p_address text) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_user() or not exists(select 1 from public.stores where id=p_store and owner_id=auth.uid() and not removed) then raise exception 'store owner required'; end if;
 if p_kind not in ('physical','online') or p_kind is null or length(trim(coalesce(p_address,''))) not between 3 and 500 then raise exception 'store type and pickup address required'; end if;
 update public.stores set store_kind=p_kind,address=case when p_kind='physical' then trim(p_address) else '' end where id=p_store;
 insert into public.store_pickups(store_id,pickup_address) values(p_store,trim(p_address)) on conflict(store_id) do update set pickup_address=excluded.pickup_address;
end $$;
revoke all on function private.save_store_location(uuid,text,text) from public,anon,authenticated;
grant execute on function private.save_store_location(uuid,text,text) to authenticated;
create or replace function public.save_store_location(p_store uuid,p_kind text,p_address text) returns void
 language sql security invoker set search_path='' as $$ select private.save_store_location(p_store,p_kind,p_address); $$;
revoke all on function public.save_store_location(uuid,text,text) from public,anon;
grant execute on function public.save_store_location(uuid,text,text) to authenticated;

create or replace function private.request_seller_join_location(p_first text,p_last text,p_name text,p_phone text,p_address text,p_description text,p_kind text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare store_id uuid;
begin
 if not public.is_active_user() then raise exception 'active account required'; end if;
 store_id:=public.request_seller_join(p_first,p_last,p_name,p_phone,p_address,p_description);
 perform private.save_store_location(store_id,p_kind,p_address);
 return store_id;
end $$;
revoke all on function private.request_seller_join_location(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.request_seller_join_location(text,text,text,text,text,text,text) to authenticated;
create or replace function public.request_seller_join_location(p_first text,p_last text,p_name text,p_phone text,p_address text,p_description text,p_kind text) returns uuid
 language sql security invoker set search_path='' as $$ select private.request_seller_join_location(p_first,p_last,p_name,p_phone,p_address,p_description,p_kind); $$;
revoke all on function public.request_seller_join_location(text,text,text,text,text,text,text) from public,anon;
grant execute on function public.request_seller_join_location(text,text,text,text,text,text,text) to authenticated;

create or replace function private.request_driver_application(p_name text,p_phone text,p_email text,p_address text,p_vehicle text) returns void
 language plpgsql security definer set search_path='' as $$
declare email text;
begin
 if not public.is_active_user() then raise exception 'active account required'; end if;
 select u.email into email from auth.users u where u.id=auth.uid();
 if email is null or lower(trim(p_email)) is distinct from lower(email) then raise exception 'use account email'; end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 160 or coalesce(p_phone,'') !~ '^[0-9]{10,15}$' or length(trim(coalesce(p_address,''))) not between 3 and 500 or length(trim(coalesce(p_vehicle,''))) not between 2 and 160 then raise exception 'complete driver details'; end if;
 insert into public.driver_profiles(user_id,full_name,phone,email,address,vehicle) values(auth.uid(),trim(p_name),p_phone,email,trim(p_address),trim(p_vehicle))
 on conflict(user_id) do update set full_name=excluded.full_name,phone=excluded.phone,email=excluded.email,address=excluded.address,vehicle=excluded.vehicle,updated_at=now();
 update public.profiles set full_name=trim(p_name),phone=p_phone where id=auth.uid();
 perform public.register_driver();
end $$;
revoke all on function private.request_driver_application(text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.request_driver_application(text,text,text,text,text) to authenticated;
create or replace function public.request_driver_application(p_name text,p_phone text,p_email text,p_address text,p_vehicle text) returns void
 language sql security invoker set search_path='' as $$ select private.request_driver_application(p_name,p_phone,p_email,p_address,p_vehicle); $$;
revoke all on function public.request_driver_application(text,text,text,text,text) from public,anon;
grant execute on function public.request_driver_application(text,text,text,text,text) to authenticated;

create or replace function private.driver_approval_gate() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if new.approved and not old.approved and not exists(select 1 from public.driver_profiles where user_id=new.user_id) then raise exception 'complete driver application first'; end if;
 return new;
end $$;
revoke all on function private.driver_approval_gate() from public,anon,authenticated;
create trigger driver_application_required before update of approved on public.delivery_workers for each row execute function private.driver_approval_gate();
create or replace function private.driver_approval_notice() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if new.approved is distinct from old.approved then
  insert into public.account_notifications(recipient_id,event_key,event_kind,title,body)
  values(new.user_id,'driver:approval:'||gen_random_uuid(),'approval',case when new.approved then 'تم اعتمادك كسائق توصيل' else 'تم إيقاف اعتماد التوصيل' end,case when new.approved then 'يمكنك الآن استقبال الطلبات وقبول التوصيل.' else 'تواصل مع الإدارة لمعرفة التفاصيل.' end);
 end if;
 return new;
end $$;
revoke all on function private.driver_approval_notice() from public,anon,authenticated;
create trigger driver_approval_notice after update of approved on public.delivery_workers for each row execute function private.driver_approval_notice();

-- Additional safe offer details: products only, never customer name/phone/address before assignment.
create or replace function private.delivery_offer_details() returns jsonb
 language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_user() then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('items',
  (select jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity,'image_path',p.image_path)) from public.order_items i left join public.products p on p.id=i.product_id where i.order_id=d.order_id)))
  from public.available_delivery_orders() d),'[]'::jsonb);
end $$;
revoke all on function private.delivery_offer_details() from public,anon,authenticated;
grant execute on function private.delivery_offer_details() to authenticated;
create or replace function public.delivery_offer_details() returns jsonb language sql security invoker set search_path='' as $$ select private.delivery_offer_details(); $$;
revoke all on function public.delivery_offer_details() from public,anon;
grant execute on function public.delivery_offer_details() to authenticated;

create or replace function private.assigned_delivery_contacts() returns jsonb
 language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_user() then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('order_id',o.id,'driver_id',o.driver_id,'full_name',coalesce(d.full_name,p.full_name),'phone',coalesce(d.phone,p.phone),'vehicle',d.vehicle,
  'pickup_address',case when o.driver_id=auth.uid() or s.owner_id=auth.uid() or public.is_admin() then coalesce(l.pickup_address,s.address) else null end))
 from public.orders o join public.stores s on s.id=o.store_id left join public.profiles p on p.id=o.driver_id left join public.driver_profiles d on d.user_id=o.driver_id left join public.store_pickups l on l.store_id=s.id
 where (o.driver_id=auth.uid() or s.owner_id=auth.uid() or o.buyer_id=auth.uid() or public.is_admin()) and o.driver_id is not null),'[]'::jsonb);
end $$;
revoke all on function private.assigned_delivery_contacts() from public,anon,authenticated;
grant execute on function private.assigned_delivery_contacts() to authenticated;
create or replace function public.assigned_delivery_contacts() returns jsonb language sql security invoker set search_path='' as $$ select private.assigned_delivery_contacts(); $$;
revoke all on function public.assigned_delivery_contacts() from public,anon;
grant execute on function public.assigned_delivery_contacts() to authenticated;
grant usage on schema private to authenticated;
notify pgrst,'reload schema';

