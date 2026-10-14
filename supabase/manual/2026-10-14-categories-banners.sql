-- سوق الشطرة: تشغيل يدوي من Supabase ← SQL Editor ← New query ← الصق كل الملف ← Run.
-- يضيف أقسام المتاجر وصور الواجهة وأيقونات الأقسام، ثم يحذف أقسام المنتجات القديمة (نسختها الاحتياطية في backup_20261014.catalog_categories).
-- آمن للتشغيل مرة ثانية. لا يحذف أي منتج أو طلب أو متجر.
begin;
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

-- Home banners: large images the admin uploads for the slider at the top of the shop,
-- each with an optional title, button and link, a display order and optional dates.
-- Also an icon (from the site's own icon family) for product categories.

alter table if exists public.catalog_categories add column if not exists icon text check(icon is null or icon ~ '^[a-z0-9_]{1,30}$');

create or replace function public.admin_set_category_icon(p_id uuid,p_icon text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_icon is not null and p_icon<>'' and p_icon !~ '^[a-z0-9_]{1,30}$' then raise exception 'invalid icon'; end if;
 update public.catalog_categories set icon=nullif(p_icon,'') where id=p_id;
 if not found then raise exception 'unknown category'; end if;
end $$;
revoke all on function public.admin_set_category_icon(uuid,text) from public,anon;
grant execute on function public.admin_set_category_icon(uuid,text) to authenticated;

create table if not exists public.home_banners(
 id uuid primary key default gen_random_uuid(),
 image_path text not null check(length(image_path)<=200 and image_path ~ '^[a-zA-Z0-9/_.-]+$'),
 title text not null default '' check(length(title)<=80),
 subtitle text not null default '' check(length(subtitle)<=140),
 cta text not null default '' check(length(cta)<=30),
 link text not null default '' check(length(link)<=300 and (link='' or link ~ '^#/' or link ~ '^https://')),
 position integer not null default 0,
 active boolean not null default true,
 starts_at timestamptz,
 ends_at timestamptz,
 created_at timestamptz not null default now(),
 check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create index if not exists home_banners_position_idx on public.home_banners(position);
alter table public.home_banners enable row level security;
drop policy if exists banners_read on public.home_banners;
create policy banners_read on public.home_banners for select to anon,authenticated
 using((active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())) or (select public.is_admin()));
drop policy if exists banners_admin_insert on public.home_banners;
create policy banners_admin_insert on public.home_banners for insert to authenticated with check((select public.is_admin()));
drop policy if exists banners_admin_update on public.home_banners;
create policy banners_admin_update on public.home_banners for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
drop policy if exists banners_admin_delete on public.home_banners;
create policy banners_admin_delete on public.home_banners for delete to authenticated using((select public.is_admin()));
grant select on public.home_banners to anon;
grant select,insert,update,delete on public.home_banners to authenticated;

-- Public bucket for banner images; only admins write to it.
do $$
begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('banners','banners',true,4194304,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
 end if;
 if to_regclass('storage.objects') is not null then
  execute 'drop policy if exists "banner images public" on storage.objects';
  execute 'create policy "banner images public" on storage.objects for select to anon,authenticated using(bucket_id=''banners'')';
  execute 'drop policy if exists "admin uploads banners" on storage.objects';
  execute 'create policy "admin uploads banners" on storage.objects for insert to authenticated with check(bucket_id=''banners'' and (select public.is_admin()))';
  execute 'drop policy if exists "admin deletes banners" on storage.objects';
  execute 'create policy "admin deletes banners" on storage.objects for delete to authenticated using(bucket_id=''banners'' and (select public.is_admin()))';
 end if;
end $$;


-- Old product categories: detach products (they keep their text section), then delete subcategories and main categories.
update public.products set catalog_category_id=null where catalog_category_id is not null;
delete from public.catalog_categories where parent_id is not null;
delete from public.catalog_categories where parent_id is null;
commit;
notify pgrst,'reload schema';
