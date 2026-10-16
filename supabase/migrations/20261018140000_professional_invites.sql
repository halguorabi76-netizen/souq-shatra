-- Approve first, sign up once: the admin approves a phone number as a seller or a driver, then the
-- person fills the store or vehicle details and confirms the number. The account is ready at once —
-- no second message to the admin.

-- Already present in production; kept here so the function also compiles on fresh databases.
alter table public.store_pickups add column if not exists latitude double precision;
alter table public.store_pickups add column if not exists longitude double precision;

create table if not exists public.professional_invites(
 id uuid primary key default gen_random_uuid(),
 phone_tail text not null check(phone_tail ~ '^7[0-9]{9}$'),
 role text not null check(role in ('seller','driver')),
 note text not null default '' check(char_length(note)<=200),
 created_at timestamptz not null default now(),
 used_by uuid references public.profiles(id) on delete set null,
 used_at timestamptz,
 unique(phone_tail,role)
);
alter table public.professional_invites enable row level security;
revoke all on public.professional_invites from anon,authenticated;

create or replace function private.phone_tail(p text) returns text language sql immutable set search_path='' as $$
 select right(regexp_replace(coalesce(p,''),'[^0-9]','','g'),10)
$$;
revoke all on function private.phone_tail(text) from public,anon,authenticated;

create or replace function public.admin_professional_invites() returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_admin();
 return query select jsonb_build_object('id',i.id,'phone','0'||i.phone_tail,'role',i.role,'note',i.note,'created_at',i.created_at,'used_at',i.used_at,'used_name',p.full_name)
  from public.professional_invites i left join public.profiles p on p.id=i.used_by order by i.created_at desc limit 300;
end $$;

create or replace function public.admin_add_professional_invite(p_phone text,p_role text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare v_tail text:=private.phone_tail(p_phone);
begin
 perform private.require_admin();
 if v_tail !~ '^7[0-9]{9}$' then raise exception 'invalid phone'; end if;
 if p_role not in ('seller','driver') then raise exception 'invalid role'; end if;
 insert into public.professional_invites(phone_tail,role,note) values(v_tail,p_role,left(btrim(coalesce(p_note,'')),200))
 on conflict(phone_tail,role) do update set note=excluded.note where public.professional_invites.used_at is null;
end $$;

create or replace function public.admin_remove_professional_invite(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 delete from public.professional_invites where id=p_id and used_at is null;
end $$;

-- Lets the sign-up form say early whether the number was approved (no other detail is revealed).
create or replace function public.professional_invite_open(p_phone text,p_role text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.professional_invites where phone_tail=private.phone_tail(p_phone) and role=p_role and used_at is null)
$$;

-- Called right after the number is confirmed. Uses the WhatsApp-verified number when Auth has it.
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
  if length(btrim(coalesce(p_store_name,'')))<2 or coalesce(p_kind,'') not in ('physical','online') then raise exception 'store details required'; end if;
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

revoke all on function public.admin_professional_invites(),public.admin_add_professional_invite(text,text,text),public.admin_remove_professional_invite(uuid),public.professional_invite_open(text,text),public.claim_professional_invite(text,text,text,text,text,double precision,double precision,text) from public,anon;
grant execute on function public.admin_professional_invites(),public.admin_add_professional_invite(text,text,text),public.admin_remove_professional_invite(uuid),public.claim_professional_invite(text,text,text,text,text,double precision,double precision,text) to authenticated;
grant execute on function public.professional_invite_open(text,text) to anon,authenticated;

notify pgrst,'reload schema';
