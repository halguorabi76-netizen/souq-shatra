create table public.seller_categories (
 id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80),active boolean not null default true,
 deleted_at timestamptz,created_at timestamptz not null default now(),unique(store_id,name)
);
create table public.seller_customers (
 id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id) on delete cascade,
 customer_key text not null check(length(customer_key) between 1 and 100),buyer_id uuid references public.profiles(id) on delete set null,
 name text not null check(length(trim(name)) between 2 and 120),phone text not null default '' check(length(phone)<=40),
 address text not null default '' check(length(address)<=500),province text not null default '' check(length(province)<=80),
 customer_group text not null default '' check(length(customer_group)<=80),tags text[] not null default '{}' check(cardinality(tags)<=20),
 note text not null default '' check(length(note)<=2000),blocked boolean not null default false,
 deleted_at timestamptz,created_at timestamptz not null default now(),unique(store_id,customer_key),check(not blocked or buyer_id is not null)
);
alter table public.seller_categories enable row level security;
alter table public.seller_customers enable row level security;
revoke all on public.seller_categories,public.seller_customers from anon,authenticated;
grant select,insert on public.seller_categories,public.seller_customers to authenticated;
grant update(name,active,deleted_at) on public.seller_categories to authenticated;
grant update(name,phone,address,province,customer_group,tags,note,blocked,deleted_at) on public.seller_customers to authenticated;
create policy categories_read on public.seller_categories for select to authenticated using(public.can_manage_approved_store(store_id));
create policy categories_add on public.seller_categories for insert to authenticated with check(public.can_manage_approved_store(store_id));
create policy categories_edit on public.seller_categories for update to authenticated using(public.can_manage_approved_store(store_id)) with check(public.can_manage_approved_store(store_id));
create policy customers_read on public.seller_customers for select to authenticated using(public.can_manage_approved_store(store_id));
create policy customers_add on public.seller_customers for insert to authenticated with check(public.can_manage_approved_store(store_id) and (buyer_id is null or exists(select 1 from public.orders o where o.store_id=seller_customers.store_id and o.buyer_id=seller_customers.buyer_id)));
create policy customers_edit on public.seller_customers for update to authenticated using(public.can_manage_approved_store(store_id)) with check(public.can_manage_approved_store(store_id));
insert into public.seller_categories(store_id,name) select distinct store_id,category from public.products where length(trim(category)) between 1 and 80 on conflict do nothing;
create function public.rename_seller_category(p_id uuid,p_name text) returns void language plpgsql security invoker set search_path='' as $$
declare c public.seller_categories%rowtype;
begin
 select * into c from public.seller_categories where id=p_id for update;
 if not found or not public.can_manage_approved_store(c.store_id) then raise exception 'store access denied';end if;
 update public.seller_categories set name=trim(p_name) where id=p_id;
 update public.products set category=trim(p_name) where store_id=c.store_id and category=c.name;
end;$$;
revoke all on function public.rename_seller_category(uuid,text) from public,anon;
grant execute on function public.rename_seller_category(uuid,text) to authenticated;
create schema if not exists private;
create function private.check_store_customer_block() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.seller_customers c where c.store_id=new.store_id and c.buyer_id=new.buyer_id and c.blocked) then raise exception 'customer blocked by store';end if;
 return new;
end;$$;
revoke all on function private.check_store_customer_block() from public,anon,authenticated;
create trigger check_store_customer_block before insert on public.orders for each row execute function private.check_store_customer_block();
notify pgrst,'reload schema';
create function private.sync_product_category() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.seller_categories(store_id,name) values(new.store_id,new.category) on conflict(store_id,name) do nothing;
 return new;
end;$$;
revoke all on function private.sync_product_category() from public,anon,authenticated;
create trigger sync_product_category after insert or update of category on public.products for each row execute function private.sync_product_category();
grant select on public.seller_categories to anon;
create policy categories_public on public.seller_categories for select to anon,authenticated using(active and deleted_at is null and exists(select 1 from public.stores s where s.id=store_id and s.approved and not s.removed));
