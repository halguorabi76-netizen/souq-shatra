-- Join requests from the sign-up form reach the admins; approve turns into an approved number.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',coalesce(u::text,''),false); perform set_config('role',case when u is null then 'postgres' else 'authenticated' end,false); end $$;
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
create temp table t_jr(k text primary key,v uuid);grant all on t_jr to authenticated,anon;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000a7','jr-admin@test'),('00000000-0000-0000-0000-0000000000a8','jr-driver@test') on conflict do nothing;
insert into public.profiles(id,full_name,phone,role) values('00000000-0000-0000-0000-0000000000a7','مدير','07817770000','admin'),('00000000-0000-0000-0000-0000000000a8','سائق مرفوض','07817770009','driver') on conflict(id) do update set role=excluded.role;

set role anon;
select pg_temp.ok(public.request_professional_join('07817770001','driver','حسن علي','{"vehicle":"دراجة","zone":"الشطرة","evil":"x"}')='sent','a visitor sends a request');
select pg_temp.ok(public.request_professional_join('07817770001','driver','حسن علي كاظم','{}')='pending','a second tap updates the same request');
reset role;
select pg_temp.ok((select count(*) from public.professional_join_requests where phone_tail='7817770001')=1,'one open request per number');
select pg_temp.ok((select details ? 'evil' from public.professional_join_requests where phone_tail='7817770001')=false,'only known details are kept');
select pg_temp.ok((select count(*) from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000000a7' and event_kind='join_request')=1,'admin is notified');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a8');
do $$begin perform public.admin_join_requests(); raise exception 'customer read requests'; exception when others then if sqlerrm<>'admin required' then raise; end if; end$$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
insert into t_jr values('r',(select (j->>'id')::uuid from public.admin_join_requests() j limit 1));
select public.admin_decide_join_request((select v from t_jr where k='r'),true);
select pg_temp.as_user(null);
select pg_temp.ok(exists(select 1 from public.professional_invites where phone_tail='7817770001' and role='driver' and used_at is null),'approving approves the number for sign-up');
set role anon;
select pg_temp.ok(public.request_professional_join('07817770001','driver','حسن','{}')='approved','the person is told they are already approved');
reset role;

-- Reject a pending driver.
insert into public.driver_profiles(user_id,full_name,phone,email,address,vehicle) values('00000000-0000-0000-0000-0000000000a8','سائق','07817770009','jr-driver@test','الشطرة','دراجة') on conflict do nothing;
insert into public.delivery_workers(user_id,approved) values('00000000-0000-0000-0000-0000000000a8',false) on conflict(user_id) do update set approved=false;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
select public.admin_reject_driver('00000000-0000-0000-0000-0000000000a8');
select pg_temp.as_user(null);
select pg_temp.ok(not exists(select 1 from public.delivery_workers where user_id='00000000-0000-0000-0000-0000000000a8') and not exists(select 1 from public.driver_profiles where user_id='00000000-0000-0000-0000-0000000000a8'),'rejected driver application removed');
select pg_temp.ok((select role from public.profiles where id='00000000-0000-0000-0000-0000000000a8')='buyer','rejected driver is a customer again');
select pg_temp.ok(exists(select 1 from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000000a8' and title='لم تتم الموافقة على طلب التوصيل'),'rejected driver is told');
delete from public.professional_invites; delete from public.professional_join_requests;
