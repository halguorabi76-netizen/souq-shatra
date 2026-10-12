-- Keep the established checkout default aligned with the inside-city tariff.
create or replace function public.admin_set_delivery_zone(p_id text,p_name text,p_fee integer,p_enabled boolean)
returns text language plpgsql security definer set search_path='' as $$
declare zone_id text:=coalesce(nullif(trim(p_id),''),gen_random_uuid()::text);
begin
 if not public.is_admin() or not public.is_active_user() then raise exception 'admin required';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 80 or p_fee is null or p_fee not between 0 and 100000 or p_enabled is null then raise exception 'invalid delivery zone';end if;
 if length(zone_id)>80 then raise exception 'invalid zone';end if;
 insert into public.delivery_zones(id,name,fee,enabled) values(zone_id,trim(p_name),p_fee,p_enabled)
 on conflict(id) do update set name=excluded.name,fee=excluded.fee,enabled=excluded.enabled;
 if zone_id='shatra' then update public.delivery_settings set delivery_fee=p_fee where id=true;end if;
 return zone_id;
end;$$;
revoke all on function public.admin_set_delivery_zone(text,text,integer,boolean) from public,anon;
grant execute on function public.admin_set_delivery_zone(text,text,integer,boolean) to authenticated;

update public.delivery_settings set delivery_fee=(select fee from public.delivery_zones where id='shatra') where id=true;
