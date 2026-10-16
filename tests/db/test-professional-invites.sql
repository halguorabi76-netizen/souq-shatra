-- Admin approves a number first; the person then signs up once and is a seller or driver at once.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',coalesce(u::text,''),false); perform set_config('role',case when u is null then 'postgres' else 'authenticated' end,false); end $$;
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
insert into auth.users(id,email,phone) values('00000000-0000-0000-0000-0000000000b1','inv-admin@test',null),('00000000-0000-0000-0000-0000000000b2','inv-seller@test','9647818880001'),('00000000-0000-0000-0000-0000000000b3','inv-driver@test',null),('00000000-0000-0000-0000-0000000000b4','inv-other@test','9647818880009') on conflict do nothing;
insert into public.profiles(id,full_name,phone,role) values('00000000-0000-0000-0000-0000000000b1','مدير','07818880000','admin'),('00000000-0000-0000-0000-0000000000b2','صاحب محل','07818880001','buyer'),('00000000-0000-0000-0000-0000000000b3','سائق جديد','07818880002','buyer'),('00000000-0000-0000-0000-0000000000b4','شخص آخر','07818880001','buyer') on conflict(id) do update set role=excluded.role,phone=excluded.phone;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$begin perform public.admin_add_professional_invite('07818880001','seller',''); raise exception 'customer invited'; exception when others then if sqlerrm<>'admin required' then raise; end if; end$$;
do $$begin perform public.claim_professional_invite('seller','محل','physical','','الشطرة',31.4,46.1,null); raise exception 'claimed uninvited'; exception when others then if sqlerrm<>'not invited' then raise; end if; end$$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select public.admin_add_professional_invite('0781 888 0001','seller','محل النور');
select public.admin_add_professional_invite('07818880002','driver','');
select pg_temp.ok((select count(*) from public.admin_professional_invites())=2,'admin lists invites');
select pg_temp.as_user(null);
set role anon;
select pg_temp.ok(public.professional_invite_open('07818880001','seller') and not public.professional_invite_open('07818880001','driver'),'sign-up form can check the number');
reset role;

-- Someone else who typed the invited number in their profile cannot take it: Auth's verified number wins.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
do $$begin perform public.claim_professional_invite('seller','محل','physical','','الشطرة',31.4,46.1,null); raise exception 'stolen'; exception when others then if sqlerrm<>'not invited' then raise; end if; end$$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.claim_professional_invite('seller','محل النور','physical','مواد غذائية','الشطرة - السوق',31.4,46.1,null);
select pg_temp.as_user(null);
select pg_temp.ok((select approved from public.stores where owner_id='00000000-0000-0000-0000-0000000000b2'),'store is approved at once');
select pg_temp.ok((select latitude from public.store_pickups p join public.stores s on s.id=p.store_id where s.owner_id='00000000-0000-0000-0000-0000000000b2')=31.4,'pickup point saved');
select pg_temp.ok((select role from public.profiles where id='00000000-0000-0000-0000-0000000000b2')='seller','profile becomes seller');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$begin perform public.claim_professional_invite('seller','محل','physical','','الشطرة',31.4,46.1,null); raise exception 'claimed twice'; exception when others then if sqlerrm<>'not invited' then raise; end if; end$$;
-- Driver whose WhatsApp hid the number: the profile number is used.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select public.claim_professional_invite('driver',null,null,null,'النصر',null,null,'دراجة نارية');
select pg_temp.as_user(null);
select pg_temp.ok((select approved from public.delivery_workers where user_id='00000000-0000-0000-0000-0000000000b3'),'driver approved at once');
select pg_temp.ok((select vehicle from public.driver_profiles where user_id='00000000-0000-0000-0000-0000000000b3')='دراجة نارية','driver details saved');
