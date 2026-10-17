-- Order chats are two separate threads: customer ↔ store and customer ↔ driver.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',coalesce(u::text,''),false); perform set_config('role',case when u is null then 'postgres' else 'authenticated' end,false); end $$;
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000066c1','sb@test'),('00000000-0000-0000-0000-0000000066c2','ss@test'),('00000000-0000-0000-0000-0000000066c3','sd@test') on conflict do nothing;
insert into public.profiles(id,full_name,phone) values('00000000-0000-0000-0000-0000000066c1','زبون','07816661001'),('00000000-0000-0000-0000-0000000066c2','بائع','07816661002'),('00000000-0000-0000-0000-0000000066c3','سائق','07816661003') on conflict(id) do nothing;
insert into public.stores(id,owner_id,name,approved) values('00000000-0000-0000-0000-0000000066c5','00000000-0000-0000-0000-0000000066c2','محل',true);
insert into public.orders(id,store_id,buyer_id,driver_id,status) values('00000000-0000-0000-0000-0000000066c6','00000000-0000-0000-0000-0000000066c5','00000000-0000-0000-0000-0000000066c1','00000000-0000-0000-0000-0000000066c3','delivery');

select pg_temp.as_user('00000000-0000-0000-0000-0000000066c1');
select public.send_chat_message('store','00000000-0000-0000-0000-0000000066c6','00000000-0000-0000-0000-0000000066c1','هل يمكن تبديل اللون؟');
select public.send_chat_message('driver','00000000-0000-0000-0000-0000000066c6','00000000-0000-0000-0000-0000000066c1','اترك الطلب عند الباب');
select pg_temp.as_user('00000000-0000-0000-0000-0000000066c2');
select pg_temp.ok((select count(*) from public.chat_messages where ref_id='00000000-0000-0000-0000-0000000066c6')=1,'the store reads only its own thread');
do $$begin perform public.send_chat_message('driver','00000000-0000-0000-0000-0000000066c6','00000000-0000-0000-0000-0000000066c1','x'); raise exception 'store wrote in driver thread'; exception when others then if sqlerrm<>'not allowed' then raise; end if; end$$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000066c3');
select pg_temp.ok((select body from public.chat_messages where ref_id='00000000-0000-0000-0000-0000000066c6')='اترك الطلب عند الباب','the driver reads only the delivery thread');
select public.send_chat_message('driver','00000000-0000-0000-0000-0000000066c6','00000000-0000-0000-0000-0000000066c1','أنا في الطريق');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000066c1' and event_key like 'chat:driver:%')=1,'customer is notified for the delivery thread');
select pg_temp.ok(not exists(select 1 from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000066c2' and event_key like 'chat:driver:%'),'the store is not notified of delivery messages');
-- Read receipts: the customer reads the delivery thread; the driver sees it, the store does not.
select pg_temp.as_user('00000000-0000-0000-0000-0000000066c1');
select public.mark_chat_read('driver','00000000-0000-0000-0000-0000000066c6','00000000-0000-0000-0000-0000000066c1');
select pg_temp.as_user('00000000-0000-0000-0000-0000000066c3');
select pg_temp.ok(exists(select 1 from public.chat_reads where user_id='00000000-0000-0000-0000-0000000066c1' and kind='driver'),'the driver sees that the customer read the thread');
select pg_temp.as_user('00000000-0000-0000-0000-0000000066c2');
select public.mark_chat_read('driver','00000000-0000-0000-0000-0000000066c6','00000000-0000-0000-0000-0000000066c1');
select pg_temp.ok(not exists(select 1 from public.chat_reads where kind='driver'),'the store cannot see or mark the delivery thread');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.chat_reads where kind='driver')=1,'a stranger marking read is ignored');
select pg_temp.ok((select read_at from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000066c1' and event_key like 'chat:driver:%') is not null,'reading clears the message notice');
delete from public.chat_reads; delete from public.chat_messages where ref_id='00000000-0000-0000-0000-0000000066c6';
