-- Add only the requested service areas; preserve historical order snapshots.
insert into public.delivery_zones(id,name,fee,enabled) values
 ('shatra','داخل الشطرة',2000,true),('nasr','مدينة النصر',5000,true),
 ('dawaya','مدينة الدواي',5000,true),('bidaa','مدينة البدعة',3000,true),
 ('alsada','السادة آل حمد',4000,true),('seven_april','سبعة نيسان',3000,true)
on conflict(id) do update set name=excluded.name,fee=excluded.fee,enabled=excluded.enabled;
create table public.customer_addresses(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 label text not null check(length(trim(label)) between 2 and 80),
 recipient_name text not null check(length(trim(recipient_name)) between 2 and 120),
 phone text not null check(phone ~ '^[0-9]{10,11}$'),
 phone_secondary text check(phone_secondary is null or phone_secondary ~ '^[0-9]{10,11}$'),
 address text not null check(length(trim(address)) between 3 and 500),
 zone_id text not null references public.delivery_zones(id),
 latitude numeric(9,6) not null check(latitude between -90 and 90),
 longitude numeric(9,6) not null check(longitude between -180 and 180),
 created_at timestamptz not null default now()
);
create index customer_addresses_owner on public.customer_addresses(user_id,created_at desc);
alter table public.customer_addresses enable row level security;
revoke all on public.customer_addresses from public,anon,authenticated;
grant select,insert,update,delete on public.customer_addresses to authenticated;
create policy addresses_read on public.customer_addresses for select to authenticated using((select auth.uid())=user_id and (select public.is_active_user()));
create policy addresses_insert on public.customer_addresses for insert to authenticated with check((select auth.uid())=user_id and (select public.is_active_user()));
create policy addresses_update on public.customer_addresses for update to authenticated using((select auth.uid())=user_id and (select public.is_active_user())) with check((select auth.uid())=user_id and (select public.is_active_user()));
create policy addresses_delete on public.customer_addresses for delete to authenticated using((select auth.uid())=user_id and (select public.is_active_user()));
