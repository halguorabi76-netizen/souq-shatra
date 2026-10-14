-- Reconstructed core schema. The production tables were created in the Supabase dashboard
-- and are not versioned; this file mirrors the columns and functions the application uses
-- so additive migrations can be tested locally. It is NOT a migration for production.
create table public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', phone text not null default '',
 role text not null default 'buyer' check(role in ('buyer','seller','driver','admin')),
 disabled boolean not null default false, username text unique, created_at timestamptz not null default now());
create table public.stores(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 name text not null, phone text not null default '', address text not null default '', description text not null default '',
 social_url text, approved boolean not null default false, removed boolean not null default false,
 created_at timestamptz not null default now());
create table public.products(
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 name text not null, description text not null default '', category text not null default 'أخرى',
 price integer not null check(price>0), stock integer not null default 0 check(stock>=0), image_path text,
 active boolean not null default true, blocked boolean not null default false,
 created_at timestamptz not null default now());
create table public.orders(
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 buyer_id uuid not null references public.profiles(id), driver_id uuid references public.profiles(id),
 status text not null default 'new' check(status in ('new','accepted','delivery','delivered','cancelled')),
 total integer not null default 0, platform_fee integer not null default 0, delivery_fee integer not null default 0,
 customer_name text not null default '', customer_phone text not null default '', address text not null default '', note text not null default '',
 created_at timestamptz not null default now());
create table public.order_items(
 id bigint generated always as identity primary key, order_id uuid not null references public.orders(id) on delete cascade,
 product_id uuid references public.products(id) on delete set null, product_name text not null, price integer not null, quantity integer not null);
create table public.delivery_settings(id boolean primary key default true check(id), platform_fee integer not null default 0, delivery_fee integer not null default 0, qi_number text not null default '');
insert into public.delivery_settings default values;
create table public.delivery_workers(user_id uuid primary key references public.profiles(id), approved boolean not null default false,
 amount_due integer not null default 0, debt_limit integer not null default 50000, created_at timestamptz not null default now());
create table public.delivery_payments(id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.profiles(id),
 amount integer not null, receipt text not null default '', status text not null default 'pending', created_at timestamptz not null default now());
create table public.delivery_declines(order_id uuid references public.orders(id), driver_id uuid references public.profiles(id), primary key(order_id,driver_id));

create function public.is_admin() returns boolean language sql stable security definer set search_path='' as
 $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and not disabled)$$;
create function public.is_active_user() returns boolean language sql stable security definer set search_path='' as
 $$select exists(select 1 from public.profiles where id=auth.uid() and not disabled)$$;
create function public.owns_store(p_store uuid) returns boolean language sql stable security definer set search_path='' as
 $$select exists(select 1 from public.stores where id=p_store and owner_id=auth.uid())$$;
grant execute on function public.is_admin(),public.is_active_user(),public.owns_store(uuid) to anon,authenticated;

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.delivery_workers enable row level security;
alter table public.delivery_payments enable row level security;
grant select on public.stores,public.products,public.delivery_settings to anon,authenticated;
grant select,update(full_name,phone) on public.profiles to authenticated;
grant select on public.orders,public.order_items,public.delivery_workers,public.delivery_payments to authenticated;
grant update(name,phone,description) on public.stores to authenticated;
grant insert,update,delete on public.products to authenticated;
create policy profiles_self on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy stores_read on public.stores for select using(approved and not removed or owner_id=auth.uid() or public.is_admin());
create policy stores_update on public.stores for update to authenticated using(owner_id=auth.uid());
create policy products_read on public.products for select using(true);
create policy products_owner on public.products for all to authenticated using(public.owns_store(store_id)) with check(public.owns_store(store_id));
create policy orders_read on public.orders for select to authenticated using(buyer_id=auth.uid() or driver_id=auth.uid() or public.owns_store(store_id) or public.is_admin());
create policy items_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create policy settings_read on public.delivery_settings for select using(true);
create policy workers_read on public.delivery_workers for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy payments_read on public.delivery_payments for select to authenticated using(driver_id=auth.uid() or public.is_admin());

-- Simplified order placement with the same signature and money semantics as production.
create function public.place_order(p_store uuid,p_lines jsonb,p_name text,p_phone text,p_address text,p_note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare o uuid; l jsonb; p public.products%rowtype; sub integer:=0; s public.delivery_settings%rowtype;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required'; end if;
 select * into s from public.delivery_settings;
 insert into public.orders(store_id,buyer_id,customer_name,customer_phone,address,note,platform_fee,delivery_fee)
 values(p_store,auth.uid(),p_name,p_phone,p_address,coalesce(p_note,''),s.platform_fee,s.delivery_fee) returning id into o;
 for l in select * from jsonb_array_elements(p_lines) loop
  select * into p from public.products where id=(l->>'id')::uuid and store_id=p_store for update;
  if not found or not p.active or p.blocked or p.stock<(l->>'quantity')::int then raise exception 'product unavailable'; end if;
  update public.products set stock=stock-(l->>'quantity')::int where id=p.id;
  insert into public.order_items(order_id,product_id,product_name,price,quantity) values(o,p.id,p.name,p.price,(l->>'quantity')::int);
  sub:=sub+p.price*(l->>'quantity')::int;
 end loop;
 update public.orders set total=sub+platform_fee+delivery_fee where id=o;
 return o;
end $$;
grant execute on function public.place_order(uuid,jsonb,text,text,text,text) to authenticated;
create function public.register_driver() returns void language sql security definer set search_path='' as
 $$insert into public.delivery_workers(user_id) values(auth.uid()) on conflict do nothing$$;
create function public.request_seller_join(p_first text,p_last text,p_name text,p_phone text,p_address text,p_description text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 select id into v from public.stores where owner_id=auth.uid();
 if v is null then insert into public.stores(owner_id,name,phone,address,description) values(auth.uid(),p_name,p_phone,p_address,coalesce(p_description,'')) returning id into v;
 else update public.stores set name=p_name,phone=p_phone,address=p_address,description=coalesce(p_description,'') where id=v; end if;
 return v;
end $$;
