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

notify pgrst,'reload schema';
