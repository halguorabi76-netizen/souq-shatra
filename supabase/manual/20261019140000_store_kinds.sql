-- More store types: a page on social media (Instagram, TikTok, Facebook), a single seller selling
-- one item or a few pieces, and «غير ذلك». Only «محل في المدينة» (physical) shows its address to customers;
-- every other type keeps the pickup address private to the seller and the driver, like «online».

alter table public.stores drop constraint if exists stores_store_kind_check;
alter table public.stores add constraint stores_store_kind_check check(store_kind in ('physical','online','social','personal','other'));

create or replace function private.save_store_location(p_store uuid,p_kind text,p_address text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_user() or not exists(select 1 from public.stores where id=p_store and owner_id=auth.uid() and not removed) then raise exception 'store owner required'; end if;
 if p_kind not in ('physical','online','social','personal','other') or p_kind is null or length(trim(coalesce(p_address,''))) not between 3 and 500 then raise exception 'store type and pickup address required'; end if;
 update public.stores set store_kind=p_kind,address=case when p_kind='physical' then trim(p_address) else '' end where id=p_store;
 insert into public.store_pickups(store_id,pickup_address) values(p_store,trim(p_address)) on conflict(store_id) do update set pickup_address=excluded.pickup_address;
end $$;

create or replace function public.claim_professional_invite(p_role text,p_store_name text,p_kind text,p_description text,p_address text,p_lat double precision,p_lon double precision,p_vehicle text) returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_tail text; v_invite uuid; v_store uuid; v_name text; v_phone text; v_email text;
begin
 if v_user is null or not public.is_active_user() then raise exception 'login required'; end if;
 select private.phone_tail(coalesce(nullif(u.phone,''),p.phone)),p.full_name,p.phone,u.email into v_tail,v_name,v_phone,v_email
  from auth.users u join public.profiles p on p.id=u.id where u.id=v_user;
 select id into v_invite from public.professional_invites where phone_tail=v_tail and role=p_role and used_at is null for update;
 if v_invite is null then raise exception 'not invited'; end if;
 if length(btrim(coalesce(p_address,'')))<3 then raise exception 'address required'; end if;
 if p_role='seller' then
  if length(btrim(coalesce(p_store_name,'')))<2 or coalesce(p_kind,'') not in ('physical','online','social','personal','other') then raise exception 'store details required'; end if;
  select id into v_store from public.stores where owner_id=v_user for update;
  if v_store is null then
   insert into public.stores(owner_id,name,phone,address,description,store_kind,approved,removed)
   values(v_user,btrim(p_store_name),coalesce(v_phone,''),btrim(p_address),left(btrim(coalesce(p_description,'')),1000),p_kind,true,false) returning id into v_store;
  else
   update public.stores set name=btrim(p_store_name),address=btrim(p_address),description=left(btrim(coalesce(p_description,'')),1000),store_kind=p_kind,approved=true,removed=false where id=v_store;
  end if;
  insert into public.store_pickups(store_id,pickup_address,latitude,longitude) values(v_store,btrim(p_address),p_lat,p_lon)
  on conflict(store_id) do update set pickup_address=excluded.pickup_address,latitude=excluded.latitude,longitude=excluded.longitude;
  update public.profiles set role='seller' where id=v_user and role='buyer';
 elsif p_role='driver' then
  if length(btrim(coalesce(p_vehicle,'')))<2 then raise exception 'vehicle required'; end if;
  insert into public.driver_profiles(user_id,full_name,phone,email,address,vehicle) values(v_user,coalesce(nullif(btrim(v_name),''),'سائق'),coalesce(v_phone,''),coalesce(v_email,''),btrim(p_address),btrim(p_vehicle))
  on conflict(user_id) do update set full_name=excluded.full_name,phone=excluded.phone,address=excluded.address,vehicle=excluded.vehicle,updated_at=now();
  insert into public.delivery_workers(user_id,approved) values(v_user,true) on conflict(user_id) do update set approved=true;
  update public.profiles set role='driver' where id=v_user and role='buyer';
 else raise exception 'invalid role'; end if;
 update public.professional_invites set used_by=v_user,used_at=now() where id=v_invite;
 return p_role;
end $$;


create or replace function private.store_kind_label(p_kind text) returns text language sql immutable set search_path='' as $$
 select case p_kind when 'physical' then 'محل في المدينة' when 'online' then 'متجر إلكتروني / من البيت' when 'social' then 'صفحة على مواقع التواصل' when 'personal' then 'بائع فردي' when 'other' then 'غير ذلك' else 'غير محدد' end
$$;
revoke all on function private.store_kind_label(text) from public,anon,authenticated;

notify pgrst,'reload schema';
