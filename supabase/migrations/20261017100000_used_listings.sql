-- «بِع غرضك»: any signed-in customer may list a few used items a month (no store needed).
-- Buyers call or WhatsApp the owner; the sale happens outside the app. Listings disappear when
-- marked sold or after a set number of days unless renewed. The monthly limit, listing days and
-- listing price (0 د.ع for now) are set by the admin.

alter table public.platform_settings add column if not exists used_monthly_limit integer not null default 3 check(used_monthly_limit between 0 and 100);
alter table public.platform_settings add column if not exists used_listing_days integer not null default 15 check(used_listing_days between 1 and 90);
alter table public.platform_settings add column if not exists used_listing_price integer not null default 0 check(used_listing_price between 0 and 1000000);

create table if not exists public.used_listings(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 2 and 80),
 description text not null default '' check(char_length(description)<=600),
 price integer not null check(price between 0 and 1000000000),
 zone_id text references public.delivery_zones(id) on delete set null,
 image_path text check(image_path is null or char_length(image_path)<=200),
 status text not null default 'active' check(status in ('active','sold','removed')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 sold_at timestamptz
);
create index if not exists used_listings_live on public.used_listings(expires_at desc) where status='active';
create index if not exists used_listings_owner on public.used_listings(owner_id,created_at desc);
alter table public.used_listings enable row level security;
revoke all on public.used_listings from anon,authenticated;
grant select on public.used_listings to anon,authenticated;
-- Profiles are private, so the policy asks a definer helper whether the owner is still active.
create or replace function public.used_owner_active(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_owner and not p.disabled)
$$;
revoke all on function public.used_owner_active(uuid) from public;
grant execute on function public.used_owner_active(uuid) to anon,authenticated;
drop policy if exists used_listings_read on public.used_listings;
-- Everyone sees live listings; owners also see their own sold or expired ones; admins see all.
create policy used_listings_read on public.used_listings for select using(
 (status='active' and expires_at>now() and public.used_owner_active(owner_id))
 or owner_id=(select auth.uid()) or (select public.is_admin()));

-- This month (Baghdad time) for the limit.
create or replace function private.used_month_start() returns timestamptz language sql stable set search_path='' as $$
 select (date_trunc('month',now() at time zone 'Asia/Baghdad')) at time zone 'Asia/Baghdad'
$$;

create or replace function public.used_listing_quota() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg public.platform_settings%rowtype; v_used integer;
begin
 select * into cfg from public.platform_settings where id=true;
 select count(*) into v_used from public.used_listings where owner_id=auth.uid() and created_at>=private.used_month_start();
 return jsonb_build_object('limit',cfg.used_monthly_limit,'used',coalesce(v_used,0),'days',cfg.used_listing_days,'price',cfg.used_listing_price);
end $$;

create or replace function public.create_used_listing(p_title text,p_description text,p_price integer,p_zone text,p_image_path text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); cfg public.platform_settings%rowtype; v_used integer; v_id uuid;
begin
 if v_user is null or not public.is_active_user() then raise exception 'login required'; end if;
 if char_length(btrim(coalesce(p_title,''))) not between 2 and 80 then raise exception 'invalid title'; end if;
 if p_price is null or p_price<0 or p_price>1000000000 then raise exception 'invalid price'; end if;
 if char_length(coalesce(p_description,''))>600 then raise exception 'invalid description'; end if;
 if p_image_path is not null and split_part(p_image_path,'/',1)<>v_user::text then raise exception 'invalid image'; end if;
 if p_zone is not null and not exists(select 1 from public.delivery_zones z where z.id=p_zone) then raise exception 'invalid zone'; end if;
 perform pg_advisory_xact_lock(hashtext('used_listing:'||v_user::text));
 select * into cfg from public.platform_settings where id=true;
 select count(*) into v_used from public.used_listings where owner_id=v_user and created_at>=private.used_month_start();
 if v_used>=cfg.used_monthly_limit then raise exception 'monthly_limit'; end if;
 insert into public.used_listings(owner_id,title,description,price,zone_id,image_path,expires_at)
 values(v_user,btrim(p_title),btrim(coalesce(p_description,'')),p_price,p_zone,p_image_path,now()+make_interval(days=>cfg.used_listing_days))
 returning id into v_id;
 return v_id;
end $$;

-- Owner: sold / renew / delete. Admin: delete (removal) of any listing.
create or replace function public.used_listing_action(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare r public.used_listings; v_admin boolean:=public.is_admin() and public.is_active_user();
begin
 select * into r from public.used_listings where id=p_id for update;
 if not found or (r.owner_id is distinct from auth.uid() and not v_admin) then raise exception 'not allowed'; end if;
 if p_action='sold' and r.owner_id=auth.uid() and r.status='active' then
  update public.used_listings set status='sold',sold_at=now() where id=p_id;
 elsif p_action='renew' and r.owner_id=auth.uid() and r.status='active' then
  update public.used_listings set expires_at=now()+make_interval(days=>(select used_listing_days from public.platform_settings where id=true)) where id=p_id;
 elsif p_action='delete' then
  update public.used_listings set status='removed' where id=p_id;
 else raise exception 'invalid action'; end if;
end $$;

-- The owner's number is shown only to signed-in visitors.
create or replace function public.used_listing_contact(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_phone text; v_name text;
begin
 if auth.uid() is null then raise exception 'login required'; end if;
 select p.phone,p.full_name into v_phone,v_name from public.used_listings l join public.profiles p on p.id=l.owner_id
  where l.id=p_id and l.status='active' and l.expires_at>now() and not p.disabled;
 if not found then return null; end if;
 return jsonb_build_object('phone',nullif(btrim(coalesce(v_phone,'')),''),'name',v_name);
end $$;

create or replace function public.admin_set_used_settings(p_limit integer,p_days integer,p_price integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 update public.platform_settings set used_monthly_limit=p_limit,used_listing_days=p_days,used_listing_price=p_price,updated_at=now() where id=true;
end $$;

revoke all on function private.used_month_start() from public,anon,authenticated;
revoke all on function public.used_listing_quota(),public.create_used_listing(text,text,integer,text,text),public.used_listing_action(uuid,text),public.used_listing_contact(uuid),public.admin_set_used_settings(integer,integer,integer) from public,anon;
grant execute on function public.used_listing_quota(),public.create_used_listing(text,text,integer,text,text),public.used_listing_action(uuid,text),public.used_listing_contact(uuid),public.admin_set_used_settings(integer,integer,integer) to authenticated;

-- Public bucket for item photos; each customer writes only inside their own folder.
do $$
begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('used-items','used-items',true,4194304,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
 end if;
 if to_regclass('storage.objects') is not null then
  execute 'drop policy if exists "used item images public" on storage.objects';
  execute 'create policy "used item images public" on storage.objects for select to anon,authenticated using(bucket_id=''used-items'')';
  execute 'drop policy if exists "customers upload used items" on storage.objects';
  execute 'create policy "customers upload used items" on storage.objects for insert to authenticated with check(bucket_id=''used-items'' and split_part(name,''/'',1)=(select auth.uid())::text)';
  execute 'drop policy if exists "customers delete used items" on storage.objects';
  execute 'create policy "customers delete used items" on storage.objects for delete to authenticated using(bucket_id=''used-items'' and split_part(name,''/'',1)=(select auth.uid())::text)';
 end if;
end $$;

notify pgrst,'reload schema';
