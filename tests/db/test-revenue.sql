-- Revenue migration behaviour on the local harness (tests/db/run.sh).
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',coalesce(u::text,''),false); perform set_config('role',case when u is null then 'postgres' else 'authenticated' end,false); end $$;
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','admin@test'),('00000000-0000-0000-0000-00000000000b','buyer@test'),
 ('00000000-0000-0000-0000-00000000000c','seller@test'),('00000000-0000-0000-0000-00000000000d','driver@test');
insert into public.profiles(id,full_name,phone,role) values
 ('00000000-0000-0000-0000-00000000000a','Admin','07700000001','admin'),('00000000-0000-0000-0000-00000000000b','Buyer','07700000002','buyer'),
 ('00000000-0000-0000-0000-00000000000c','Seller','07700000003','seller'),('00000000-0000-0000-0000-00000000000d','Driver','07700000004','driver');
insert into public.stores(id,owner_id,name,phone,address,approved) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','متجر','07700000003','الشطرة',true);
insert into public.products(id,store_id,name,price,stock) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','قميص',10000,50);
insert into public.driver_profiles(user_id,full_name,phone,email,address,vehicle) values('00000000-0000-0000-0000-00000000000d','Driver','07700000004','driver@test','الشطرة','دراجة');
insert into public.delivery_workers(user_id,approved) values('00000000-0000-0000-0000-00000000000d',true);
update public.delivery_settings set platform_fee=500,delivery_fee=2000;

-- Admin sets prices; buyers and sellers cannot.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$begin perform public.admin_set_platform_settings('{"commission_percent":5}'); raise exception 'seller changed settings'; exception when others then if sqlerrm like 'seller changed%' then raise; end if; end$$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_platform_settings('{"commission_percent":5,"delivery_share_percent":10,"payment_methods":{"cod":true,"zaincash":true,"card":false}}');
select public.admin_save_plan('gold','الذهبية','',35000,2.5,null,10,true);
select public.admin_save_plan('free','الأساسية','',0,null,2,0,false);
select pg_temp.ok((select payment_methods->>'zaincash' from public.platform_settings)='true','admin enables ZainCash');
select pg_temp.ok((select active from public.seller_plans where id='free'),'free plan cannot be disabled');

-- Cash order: commission accrues to the store, delivery share to the driver.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
create temp table t_ids(name text primary key,id uuid);
grant all on t_ids to authenticated,service_role,anon;
insert into t_ids values('cod',public.place_order('10000000-0000-0000-0000-000000000001','[{"id":"20000000-0000-0000-0000-000000000001","quantity":2}]','Buyer','07700000002','الحي العسكري',''));
-- The repository's place_order leaves fees to the route checkout; emulate place_route_order fees.
select pg_temp.as_user(null);
update public.orders set platform_fee=500,delivery_fee=2000,total=total+2500 where platform_fee=0 and delivery_fee=0;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.set_order_status((select id from t_ids where name='cod'),'accepted');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.claim_delivery((select id from t_ids where name='cod'));
select public.delivery_step((select id from t_ids where name='cod'),'delivered');
select pg_temp.as_user(null);
select pg_temp.ok((select commission_amount from public.orders where id=(select id from t_ids where name='cod'))=1000,'5% commission on 20000 goods');
select pg_temp.ok((select delivery_share_amount from public.orders where id=(select id from t_ids where name='cod'))=200,'10% of 2000 delivery fee');
select pg_temp.ok((select amount_due from public.delivery_workers where user_id='00000000-0000-0000-0000-00000000000d')=700,'driver owes platform fee 500 + share 200');
select pg_temp.ok((select sum(amount) from public.ledger_entries where party_type='store')=1000,'store owes commission');
-- Retried delivery confirmation does not double charge.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.delivery_step((select id from t_ids where name='cod'),'delivered');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.ledger_entries where kind='commission')=1,'commission booked once');

-- Online order: platform owes store the goods minus commission and refunds the driver's fee.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into t_ids values('online',public.place_order('10000000-0000-0000-0000-000000000001','[{"id":"20000000-0000-0000-0000-000000000001","quantity":1}]','Buyer','07700000002','الحي العسكري',''));
-- The repository's place_order leaves fees to the route checkout; emulate place_route_order fees.
select pg_temp.as_user(null);
update public.orders set platform_fee=500,delivery_fee=2000,total=total+2500 where platform_fee=0 and delivery_fee=0;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.set_order_payment_method(array[(select id from t_ids where name='online')],'zaincash');
select pg_temp.as_user(null);
set role service_role;
create temp table t_intent as select (public.payment_create_intent('00000000-0000-0000-0000-00000000000b','order',array[(select id from t_ids where name='online')],'zaincash')).*;
reset role;
select pg_temp.ok((select amount from t_intent)=12500,'intent amount comes from the order total');
do $$begin perform public.payment_create_intent('00000000-0000-0000-0000-00000000000c','order',array[(select id from t_ids where name='online')],'zaincash'); raise exception 'other user'; exception when others then if sqlerrm='other user' then raise; end if; end$$;
select public.payment_complete_intent((select id from t_intent),true,'zc-1','{}');
select public.payment_complete_intent((select id from t_intent),true,'zc-1','{}');
select pg_temp.ok((select payment_status from public.orders where id=(select id from t_ids where name='online'))='paid','order marked paid');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.set_order_status((select id from t_ids where name='online'),'accepted');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.claim_delivery((select id from t_ids where name='online'));
select public.delivery_step((select id from t_ids where name='online'),'delivered');
select pg_temp.as_user(null);
select pg_temp.ok((select sum(amount) from public.ledger_entries where party_type='store')=1000+500-10000,'store balance: two commissions minus online goods');
select pg_temp.ok((select sum(amount) from public.ledger_entries where party_type='driver')=-2500,'driver credited delivery fee and platform fee');

-- Paid then cancelled orders become refund_due and notify admins.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into t_ids values('refund',public.place_order('10000000-0000-0000-0000-000000000001','[{"id":"20000000-0000-0000-0000-000000000001","quantity":1}]','Buyer','07700000002','الحي العسكري',''));
-- The repository's place_order leaves fees to the route checkout; emulate place_route_order fees.
select pg_temp.as_user(null);
update public.orders set platform_fee=500,delivery_fee=2000,total=total+2500 where platform_fee=0 and delivery_fee=0;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.as_user(null);
set role service_role;
create temp table t_intent2 as select (public.payment_create_intent('00000000-0000-0000-0000-00000000000b','order',array[(select id from t_ids where name='refund')],'zaincash')).*;
reset role;
select public.payment_complete_intent((select id from t_intent2),true,'zc-2','{}');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.customer_order_action((select id from t_ids where name='refund'),'cancel','');
select pg_temp.as_user(null);
select pg_temp.ok((select payment_status from public.orders where id=(select id from t_ids where name='refund'))='refund_due','cancelled paid order needs refund');
select pg_temp.ok(exists(select 1 from public.account_notifications where event_key like 'payment:refund:%'),'admins notified about refund');

-- Plan product limit (free plan max 2 active products).
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.products(store_id,name,price,stock) values('10000000-0000-0000-0000-000000000001','بنطلون',5000,3);
do $$begin insert into public.products(store_id,name,price,stock) values('10000000-0000-0000-0000-000000000001','حذاء',5000,3); raise exception 'limit ignored'; exception when others then if sqlerrm='limit ignored' then raise; end if; end$$;

-- Subscription via transfer proof, approved by admin, lifts the limit and lowers commission.
create temp table t_sub(id uuid);
grant all on t_sub to authenticated,service_role,anon;
insert into t_sub select public.request_subscription('gold',2);
select pg_temp.ok((select amount from public.store_subscriptions where id=(select id from t_sub))=70000,'two months of gold');
do $$begin perform public.submit_payment_proof('subscription',(select id from t_sub),1000,'zaincash','tx-1'); raise exception 'wrong amount accepted'; exception when others then if sqlerrm='wrong amount accepted' then raise; end if; end$$;
create temp table t_req as select public.submit_payment_proof('subscription',(select id from t_sub),70000,'zaincash','tx-123') id;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_review_payment_request((select id from t_req),true);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.products(store_id,name,price,stock) values('10000000-0000-0000-0000-000000000001','حذاء',5000,3);
select pg_temp.ok((public.store_finance()->>'commission_percent')::numeric=2.5,'gold commission applies');
select pg_temp.ok(jsonb_array_length(public.store_finance()->'promotions')=1,'plan grants spotlight days');

-- Paid promotion and RLS: anonymous visitors see only live promotions.
select public.admin_save_placement('home_featured',2000,12,true) where false;
create temp table t_promo(id uuid);
grant all on t_promo to authenticated,service_role,anon;
insert into t_promo select public.request_promotion('home_featured','20000000-0000-0000-0000-000000000001',3);
select pg_temp.ok((select status from public.promotions where id=(select id from t_promo))='active','free placement activates immediately');
select pg_temp.as_user(null);
set role anon;
select pg_temp.ok((select count(*) from public.promotions)=2,'anon sees live promotions');
do $$begin perform 1 from public.ledger_entries; raise exception 'anon read ledger'; exception when insufficient_privilege then raise notice 'ok - anon cannot read ledger'; end$$;
reset role;

-- Dues settlement.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_ledger_entry('store','10000000-0000-0000-0000-000000000001','payout',8500,'تحويل مستحقات المتجر');
select pg_temp.ok((public.admin_finance_summary(now()-interval '1 day',now()+interval '1 day')->>'commissions')::int=1500,'finance summary counts commissions');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok(public.admin_balances() is null,'non-admin gets no balances');
select pg_temp.as_user(null);
