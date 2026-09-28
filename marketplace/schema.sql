-- Run once in Supabase SQL Editor. Never place service_role keys in the website.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'buyer' check (role in ('buyer','seller','admin')),
  full_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 100),
  description text not null default '',
  address text not null default '',
  phone text not null default '',
  social_url text not null default '',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 150),
  description text not null default '',
  category text not null default 'أخرى',
  price integer not null check (price > 0),
  stock integer not null default 0 check (stock >= 0),
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  store_id uuid not null references public.stores(id),
  customer_name text not null,
  customer_phone text not null,
  address text not null,
  note text not null default '',
  total integer not null check (total > 0),
  status text not null default 'new' check (status in ('new','accepted','delivery','delivered','cancelled')),
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  price integer not null,
  quantity integer not null check (quantity > 0)
);

create index on public.products(store_id);
create index on public.orders(buyer_id, created_at desc);
create index on public.orders(store_id, created_at desc);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

create or replace function public.owns_store(p_store uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.stores where id = p_store and owner_id = (select auth.uid()));
$$;

create or replace function public.new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name) values(new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.new_profile();

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "profile self or admin read" on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_admin());
create policy "profile self update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Do not grant role writes to clients; changing buyer to seller is handled by register_store().
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

create policy "public approved stores" on public.stores for select to anon, authenticated using (approved or owner_id = (select auth.uid()) or public.is_admin());
create policy "owner edits store" on public.stores for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke update on public.stores from authenticated;
grant update (name, description, address, phone, social_url) on public.stores to authenticated;
create policy "admin approves store" on public.stores for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Admin approval is via approve_store(), since clients never get UPDATE(approved).

create policy "public approved products" on public.products for select to anon, authenticated using (
  (active and exists(select 1 from public.stores s where s.id = store_id and s.approved))
  or public.owns_store(store_id) or public.is_admin()
);
create policy "seller adds products" on public.products for insert to authenticated with check (public.owns_store(store_id));
create policy "seller updates products" on public.products for update to authenticated using (public.owns_store(store_id)) with check (public.owns_store(store_id));
create policy "seller deletes products" on public.products for delete to authenticated using (public.owns_store(store_id));

create policy "participants read orders" on public.orders for select to authenticated using (buyer_id = (select auth.uid()) or public.owns_store(store_id) or public.is_admin());
create policy "participants read items" on public.order_items for select to authenticated using (
  exists(select 1 from public.orders o where o.id = order_id and (o.buyer_id = (select auth.uid()) or public.owns_store(o.store_id) or public.is_admin()))
);

create or replace function public.register_store(p_name text, p_phone text, p_address text, p_description text, p_social_url text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'store name required'; end if;
  insert into public.stores(owner_id,name,phone,address,description,social_url)
  values((select auth.uid()),trim(p_name),coalesce(p_phone,''),coalesce(p_address,''),coalesce(p_description,''),coalesce(p_social_url,'')) returning id into v_id;
  update public.profiles set role = 'seller' where id = (select auth.uid()) and role = 'buyer';
  return v_id;
end;
$$;

create or replace function public.approve_store(p_store uuid, p_approved boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin required'; end if;
  update public.stores set approved = p_approved where id = p_store;
end;
$$;

-- Atomic: server validates price, availability and store; clients cannot set totals.
create or replace function public.place_order(p_store uuid, p_lines jsonb, p_name text, p_phone text, p_address text, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_line jsonb; v_product public.products%rowtype; v_qty integer; v_total bigint := 0;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if length(trim(coalesce(p_name,''))) < 2 or length(trim(coalesce(p_phone,''))) < 10 or length(trim(coalesce(p_address,''))) < 3 then raise exception 'complete contact details'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 30 then raise exception 'invalid basket'; end if;
  if not exists(select 1 from public.stores where id = p_store and approved) then raise exception 'store unavailable'; end if;
  -- Reject repeated product lines; the browser combines quantities before calling.
  if (select count(distinct x->>'id') from jsonb_array_elements(p_lines) x) <> jsonb_array_length(p_lines) then raise exception 'duplicate product'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::integer;
    if v_qty < 1 or v_qty > 100 then raise exception 'invalid quantity'; end if;
    select * into v_product from public.products where id = (v_line->>'id')::uuid and store_id = p_store and active for update;
    if not found or v_product.stock < v_qty then raise exception 'product unavailable'; end if;
    v_total := v_total + v_product.price::bigint * v_qty;
  end loop;
  if v_total > 2000000000 then raise exception 'total too large'; end if;
  insert into public.orders(buyer_id,store_id,customer_name,customer_phone,address,note,total)
  values((select auth.uid()),p_store,trim(p_name),trim(p_phone),trim(p_address),coalesce(p_note,''),v_total) returning id into v_order;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::integer;
    select * into v_product from public.products where id = (v_line->>'id')::uuid;
    update public.products set stock = stock - v_qty where id = v_product.id;
    insert into public.order_items(order_id,product_id,product_name,price,quantity)
    values(v_order,v_product.id,v_product.name,v_product.price,v_qty);
  end loop;
  return v_order;
end;
$$;

create or replace function public.set_order_status(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if not (public.owns_store(v_order.store_id) or public.is_admin()) then raise exception 'not permitted'; end if;
  if not ((v_order.status='new' and p_status in ('accepted','cancelled')) or (v_order.status='accepted' and p_status in ('delivery','cancelled')) or (v_order.status='delivery' and p_status in ('delivered','cancelled'))) then raise exception 'invalid transition'; end if;
  update public.orders set status = p_status where id = p_order;
  if p_status='cancelled' then
    update public.products p set stock = p.stock + i.quantity from public.order_items i where i.order_id = p_order and i.product_id = p.id;
  end if;
end;
$$;

revoke all on function public.register_store(text,text,text,text,text) from public;
revoke all on function public.approve_store(uuid,boolean) from public;
revoke all on function public.place_order(uuid,jsonb,text,text,text,text) from public;
revoke all on function public.set_order_status(uuid,text) from public;
grant execute on function public.register_store(text,text,text,text,text) to authenticated;
grant execute on function public.approve_store(uuid,boolean) to authenticated;
grant execute on function public.place_order(uuid,jsonb,text,text,text,text) to authenticated;
grant execute on function public.set_order_status(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('products','products',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy "product images public" on storage.objects for select to anon, authenticated using(bucket_id='products');
create policy "seller uploads to own folder" on storage.objects for insert to authenticated with check (
  bucket_id='products' and public.owns_store((storage.foldername(name))[1]::uuid)
);
create policy "seller deletes own image" on storage.objects for delete to authenticated using (
  bucket_id='products' and public.owns_store((storage.foldername(name))[1]::uuid)
);

-- After your own email account is created, make yourself admin in SQL Editor:
-- update public.profiles set role='admin' where id=(select id from auth.users where email='YOUR_EMAIL');
