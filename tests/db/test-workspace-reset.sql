-- «تصفير الواجهة»: only the owner's test accounts may wipe their seller or driver history.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',coalesce(u::text,''),false); perform set_config('role',case when u is null then 'postgres' else 'authenticated' end,false); end $$;
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000077d1','wr-admin@test'),('00000000-0000-0000-0000-0000000077d2','wr-seller@test'),('00000000-0000-0000-0000-0000000077d3','wr-driver@test'),('00000000-0000-0000-0000-0000000077d4','wr-real@test'),('00000000-0000-0000-0000-0000000077d5','wr-buyer@test') on conflict do nothing;
insert into public.profiles(id,full_name,phone,role) values
 ('00000000-0000-0000-0000-0000000077d1','مدير','07816660000','admin'),
 ('00000000-0000-0000-0000-0000000077d2','بائع تجربة','07816660000','seller'),
 ('00000000-0000-0000-0000-0000000077d3','سائق تجربة','07816660003','driver'),
 ('00000000-0000-0000-0000-0000000077d4','بائع حقيقي','07816660004','seller'),
 ('00000000-0000-0000-0000-0000000077d5','زبون','07816660005','buyer') on conflict(id) do update set role=excluded.role,phone=excluded.phone;
insert into public.stores(id,owner_id,name,approved) values('00000000-0000-0000-0000-0000000077e1','00000000-0000-0000-0000-0000000077d2','محل التجربة',true),('00000000-0000-0000-0000-0000000077e2','00000000-0000-0000-0000-0000000077d4','محل حقيقي',true);
insert into public.delivery_workers(user_id,approved) values('00000000-0000-0000-0000-0000000077d3',true) on conflict(user_id) do update set approved=true;
insert into public.products(id,store_id,name,price,stock) values('00000000-0000-0000-0000-0000000077f1','00000000-0000-0000-0000-0000000077e1','قميص',1000,5),('00000000-0000-0000-0000-0000000077f2','00000000-0000-0000-0000-0000000077e2','حذاء',2000,5);
insert into public.orders(id,store_id,buyer_id,driver_id,status) values
 ('00000000-0000-0000-0000-00000000a0e1','00000000-0000-0000-0000-0000000077e1','00000000-0000-0000-0000-0000000077d5',null,'delivered'),
 ('00000000-0000-0000-0000-00000000a0e2','00000000-0000-0000-0000-0000000077e2','00000000-0000-0000-0000-0000000077d5','00000000-0000-0000-0000-0000000077d3','delivered'),
 ('00000000-0000-0000-0000-00000000a0e3','00000000-0000-0000-0000-0000000077e2','00000000-0000-0000-0000-0000000077d5',null,'new');
insert into public.order_items(order_id,product_id,product_name,price,quantity) values
 ('00000000-0000-0000-0000-00000000a0e1','00000000-0000-0000-0000-0000000077f1','قميص',1000,1),
 ('00000000-0000-0000-0000-00000000a0e2','00000000-0000-0000-0000-0000000077f2','حذاء',2000,1);
insert into public.chat_messages(kind,ref_id,buyer_id,sender_id,body) values('order','00000000-0000-0000-0000-00000000a0e1','00000000-0000-0000-0000-0000000077d5','00000000-0000-0000-0000-0000000077d5','مرحبا');

-- Who may reset.
select pg_temp.as_user('00000000-0000-0000-0000-0000000077d4');
select pg_temp.ok(not public.can_reset_workspace(),'a real seller cannot reset');
do $$begin perform public.reset_my_workspace('seller'); raise exception 'real seller reset'; exception when others then if sqlerrm<>'not allowed' then raise; end if; end$$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000077d3');
select pg_temp.ok(not public.can_reset_workspace(),'a driver on another number cannot reset yet');
do $$begin perform public.admin_set_reset_phone('07816660003',true); raise exception 'driver managed list'; exception when others then if sqlerrm<>'admin required' then raise; end if; end$$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000077d2');
select pg_temp.ok(public.can_reset_workspace(),'a seller on the admin number can reset');

-- Seller reset wipes only that store.
select pg_temp.ok((public.reset_my_workspace('seller')->>'orders')::int=1,'seller reset removes the store orders');
select pg_temp.as_user(null);
select pg_temp.ok(not exists(select 1 from public.orders where store_id='00000000-0000-0000-0000-0000000077e1'),'store orders gone for everyone');
select pg_temp.ok(not exists(select 1 from public.products where store_id='00000000-0000-0000-0000-0000000077e1'),'store products gone');
select pg_temp.ok(not exists(select 1 from public.chat_messages where ref_id='00000000-0000-0000-0000-00000000a0e1'),'order messages gone');
select pg_temp.ok(exists(select 1 from public.stores where id='00000000-0000-0000-0000-0000000077e1'),'the store itself stays');
select pg_temp.ok((select count(*) from public.orders where store_id='00000000-0000-0000-0000-0000000077e2')=2 and exists(select 1 from public.products where id='00000000-0000-0000-0000-0000000077f2'),'another store is untouched');

-- Driver reset after the admin adds the number.
select pg_temp.as_user('00000000-0000-0000-0000-0000000077d1');
select public.admin_set_reset_phone('07816660003',true);
select pg_temp.ok((select count(*) from public.admin_reset_phones() p where p='07816660003')=1,'admin lists the test number');
select pg_temp.as_user('00000000-0000-0000-0000-0000000077d3');
select pg_temp.ok(public.can_reset_workspace(),'listed driver can reset');
select pg_temp.ok((public.reset_my_workspace('driver')->>'orders')::int=1,'driver reset removes delivered orders');
select pg_temp.as_user(null);
select pg_temp.ok(not exists(select 1 from public.orders where driver_id='00000000-0000-0000-0000-0000000077d3'),'driver orders gone');
select pg_temp.ok(exists(select 1 from public.orders where id='00000000-0000-0000-0000-00000000a0e3'),'orders without the driver stay');
select pg_temp.ok(exists(select 1 from public.delivery_workers where user_id='00000000-0000-0000-0000-0000000077d3' and approved),'driver stays approved');

-- Clean up.
select private.purge_orders(array(select id from public.orders where store_id in ('00000000-0000-0000-0000-0000000077e1','00000000-0000-0000-0000-0000000077e2')));
delete from public.delivery_events where store_id in ('00000000-0000-0000-0000-0000000077e1','00000000-0000-0000-0000-0000000077e2');
delete from public.products where store_id in ('00000000-0000-0000-0000-0000000077e1','00000000-0000-0000-0000-0000000077e2');
delete from public.stores where id in ('00000000-0000-0000-0000-0000000077e1','00000000-0000-0000-0000-0000000077e2');
delete from public.workspace_reset_phones;
