-- «بِع غرضك»: monthly limit, owner-only actions, live-only visibility and number shown to signed-in users.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',coalesce(u::text,''),false); perform set_config('role',case when u is null then 'postgres' else 'authenticated' end,false); end $$;
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
create temp table t_used(k text primary key,v uuid);
grant all on t_used to authenticated,anon;

insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000e1','u1@test'),('00000000-0000-0000-0000-0000000000e2','u2@test'),('00000000-0000-0000-0000-0000000000e3','adm@test')
 on conflict do nothing;
insert into public.profiles(id,full_name,phone,role) values('00000000-0000-0000-0000-0000000000e1','علي','07819990001','buyer'),('00000000-0000-0000-0000-0000000000e2','حسن','07819990002','buyer'),('00000000-0000-0000-0000-0000000000e3','مدير','07819990003','admin')
 on conflict(id) do update set phone=excluded.phone,role=excluded.role;
insert into public.delivery_zones(id,name,fee) values('used_tz','منطقة اختبار',1000) on conflict do nothing;
update public.platform_settings set used_monthly_limit=3,used_listing_days=15,used_listing_price=0;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.ok((public.used_listing_quota()->>'limit')::int=3 and (public.used_listing_quota()->>'used')::int=0,'quota starts at 0 of 3');
insert into t_used values('a',public.create_used_listing('دراجة هوائية','بحالة جيدة',75000,'used_tz','00000000-0000-0000-0000-0000000000e1/a.jpg'));
insert into t_used values('b',public.create_used_listing('بلايستيشن 5','',450000,null,null));
insert into t_used values('c',public.create_used_listing('مروحة','',20000,null,null));
select pg_temp.ok((public.used_listing_quota()->>'used')::int=3,'three listings counted this month');
do $$begin perform public.create_used_listing('رابع','',1000,null,null); raise exception 'fourth allowed'; exception when others then if sqlerrm<>'monthly_limit' then raise; end if; end$$;
select public.used_listing_action((select v from t_used where k='c'),'delete');
do $$begin perform public.create_used_listing('رابع','',1000,null,null); raise exception 'delete freed a slot'; exception when others then if sqlerrm<>'monthly_limit' then raise; end if; end$$;
select pg_temp.ok(true,'deleting does not give the slot back');
do $$begin perform public.create_used_listing('صورة غيري','',1000,null,'00000000-0000-0000-0000-0000000000e2/x.jpg'); raise exception 'foreign image'; exception when others then if sqlerrm<>'invalid image' then raise; end if; end$$;
select pg_temp.ok((select expires_at>now()+interval '14 days' from public.used_listings where id=(select v from t_used where k='a')),'listing lives for the set days');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.ok((select count(*) from public.used_listings)=2,'others see only live listings');
select pg_temp.ok(public.used_listing_contact((select v from t_used where k='a'))->>'phone'='07819990001','signed-in visitor gets the number');
do $$begin perform public.used_listing_action((select v from t_used where k='a'),'sold'); raise exception 'stranger sold it'; exception when others then if sqlerrm<>'not allowed' then raise; end if; end$$;

select pg_temp.as_user(null);
set role anon;
select pg_temp.ok((select count(*) from public.used_listings)=2,'guests browse live listings');
do $$begin perform public.used_listing_contact((select id from public.used_listings limit 1)); raise exception 'guest got number'; exception when insufficient_privilege then null; end$$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select public.used_listing_action((select v from t_used where k='a'),'sold');
select pg_temp.ok((select status from public.used_listings where id=(select v from t_used where k='a'))='sold','owner marks sold');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.ok((select count(*) from public.used_listings)=1,'sold listing disappears for others');
select pg_temp.ok(public.used_listing_contact((select v from t_used where k='a')) is null,'no number for a sold listing');
select pg_temp.as_user(null);
update public.used_listings set expires_at=now()-interval '1 minute' where id=(select v from t_used where k='b');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.ok((select count(*) from public.used_listings)=0,'expired listing disappears');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select public.used_listing_action((select v from t_used where k='b'),'renew');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.ok((select count(*) from public.used_listings)=1,'renewed listing is back');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select public.used_listing_action((select v from t_used where k='b'),'delete');
select pg_temp.ok((select status from public.used_listings where id=(select v from t_used where k='b'))='removed','admin removes any listing');
select public.admin_set_used_settings(5,10,1000);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.ok((public.used_listing_quota()->>'limit')::int=5 and (public.used_listing_quota()->>'price')::int=1000,'admin changes limit and price');
do $$begin perform public.admin_set_used_settings(9,9,0); raise exception 'customer changed settings'; exception when others then if sqlerrm<>'admin required' then raise; end if; end$$;
select pg_temp.as_user(null);
