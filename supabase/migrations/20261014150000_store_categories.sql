-- Store categories (مطاعم، ماركت، أكلات بيتية…) managed by the admin.
-- A seller picks one for their store; the admin can change it at any time.
-- Product categories stay in catalog_categories; admins can now delete them too.

create table if not exists public.store_categories(
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 60),
 icon text check(icon is null or icon ~ '^[a-z0-9_]{1,30}$'),
 position integer not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index if not exists store_categories_name_key on public.store_categories(lower(trim(name)));
alter table public.store_categories enable row level security;
drop policy if exists store_categories_read on public.store_categories;
create policy store_categories_read on public.store_categories for select to anon,authenticated using(active or (select public.is_admin()));
grant select on public.store_categories to anon,authenticated;

alter table public.stores add column if not exists store_category_id uuid references public.store_categories(id) on delete set null;
create index if not exists stores_store_category_idx on public.stores(store_category_id);

create or replace function public.admin_save_store_category(p_id uuid,p_name text,p_position integer,p_active boolean,p_icon text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid:=coalesce(p_id,gen_random_uuid());
begin
 perform private.require_admin();
 if length(trim(coalesce(p_name,''))) not between 2 and 60 then raise exception 'invalid name'; end if;
 insert into public.store_categories(id,name,icon,position,active) values(v,trim(p_name),nullif(p_icon,''),coalesce(p_position,0),coalesce(p_active,true))
 on conflict(id) do update set name=excluded.name,icon=excluded.icon,position=excluded.position,active=excluded.active;
 return v;
end $$;
revoke all on function public.admin_save_store_category(uuid,text,integer,boolean,text) from public,anon;
grant execute on function public.admin_save_store_category(uuid,text,integer,boolean,text) to authenticated;

-- Stores in a deleted category simply become uncategorised (on delete set null).
create or replace function public.admin_delete_store_category(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 delete from public.store_categories where id=p_id;
end $$;
revoke all on function public.admin_delete_store_category(uuid) from public,anon;
grant execute on function public.admin_delete_store_category(uuid) to authenticated;

create or replace function public.admin_set_store_category(p_store uuid,p_category uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_category is not null and not exists(select 1 from public.store_categories where id=p_category) then raise exception 'unknown category'; end if;
 update public.stores set store_category_id=p_category where id=p_store;
 if not found then raise exception 'unknown store'; end if;
end $$;
revoke all on function public.admin_set_store_category(uuid,uuid) from public,anon;
grant execute on function public.admin_set_store_category(uuid,uuid) to authenticated;

-- The owner picks from the active list, before or after approval.
create or replace function public.set_my_store_category(p_category uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'login required'; end if;
 if p_category is not null and not exists(select 1 from public.store_categories where id=p_category and active) then raise exception 'unknown category'; end if;
 update public.stores set store_category_id=p_category where owner_id=auth.uid() and not removed;
 if not found then raise exception 'store required'; end if;
end $$;
revoke all on function public.set_my_store_category(uuid) from public,anon;
grant execute on function public.set_my_store_category(uuid) to authenticated;

-- Deleting a product category detaches its products (they keep their text section) and removes its subcategories.
create or replace function public.admin_delete_catalog_category(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 update public.products set catalog_category_id=null where catalog_category_id in (select id from public.catalog_categories where id=p_id or parent_id=p_id);
 delete from public.catalog_categories where parent_id=p_id;
 delete from public.catalog_categories where id=p_id;
end $$;
revoke all on function public.admin_delete_catalog_category(uuid) from public,anon;
grant execute on function public.admin_delete_catalog_category(uuid) to authenticated;

notify pgrst,'reload schema';
