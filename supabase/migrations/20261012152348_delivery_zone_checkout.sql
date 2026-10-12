-- Additive: existing orders, the original checkout and inventory logic stay intact.
create table if not exists public.delivery_zones (
 id text primary key,
 name text not null check (length(trim(name)) between 2 and 80),
 fee integer not null check (fee between 0 and 100000),
 enabled boolean not null default true
);
alter table public.delivery_zones enable row level security;
revoke all on public.delivery_zones from anon, authenticated;
grant select on public.delivery_zones to anon, authenticated;
create policy "published delivery zones" on public.delivery_zones for select to anon, authenticated
 using (enabled or (public.is_admin() and public.is_active_user()));
insert into public.delivery_zones(id,name,fee) values ('shatra','داخل الشطرة',2000),('nasr','مدينة النصر',5000) on conflict (id) do nothing;
alter table public.orders add column if not exists delivery_zone_id text;
alter table public.orders add column if not exists delivery_zone_name text;

create or replace function public.admin_set_delivery_zone(p_id text,p_name text,p_fee integer,p_enabled boolean)
returns text language plpgsql security definer set search_path='' as $$
declare zone_id text:=coalesce(nullif(trim(p_id),''),gen_random_uuid()::text);
begin
 if not public.is_admin() or not public.is_active_user() then raise exception 'admin required';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 80 or p_fee is null or p_fee not between 0 and 100000 or p_enabled is null then raise exception 'invalid delivery zone';end if;
 if length(zone_id)>80 then raise exception 'invalid zone';end if;
 insert into public.delivery_zones(id,name,fee,enabled) values(zone_id,trim(p_name),p_fee,p_enabled)
 on conflict(id) do update set name=excluded.name,fee=excluded.fee,enabled=excluded.enabled;
 return zone_id;
end;$$;
revoke all on function public.admin_set_delivery_zone(text,text,integer,boolean) from public,anon;
grant execute on function public.admin_set_delivery_zone(text,text,integer,boolean) to authenticated;

create or replace function public.place_order_with_delivery_zone(p_store uuid,p_lines jsonb,p_name text,p_phone text,p_address text,p_note text,p_zone text,p_expected_fee integer,p_expected_platform_fee integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare zone public.delivery_zones%rowtype; settings public.delivery_settings%rowtype; new_order uuid;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required';end if;
 select * into zone from public.delivery_zones where id=p_zone and enabled for share;
 if not found then raise exception 'delivery zone unavailable';end if;
 select * into settings from public.delivery_settings where id=true for share;
 if p_expected_fee is distinct from zone.fee or p_expected_platform_fee is distinct from coalesce(settings.platform_fee,0) then raise exception 'delivery fee changed';end if;
 -- Reuse the established checkout, stock locks, variants and authorization.
 new_order:=public.place_order(p_store,p_lines,p_name,p_phone,zone.name||' · '||trim(p_address),p_note);
 update public.orders set total=total-delivery_fee+zone.fee,delivery_fee=zone.fee,delivery_zone_id=zone.id,delivery_zone_name=zone.name where id=new_order and buyer_id=auth.uid();
 if (select total from public.orders where id=new_order)>2000000000 then raise exception 'total too large';end if;
 return new_order;
end;$$;
revoke all on function public.place_order_with_delivery_zone(uuid,jsonb,text,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.place_order_with_delivery_zone(uuid,jsonb,text,text,text,text,text,integer,integer) to authenticated;
