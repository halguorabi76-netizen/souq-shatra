-- Messages reach only the people in the thread; ratings only after delivery, by the buyer.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',coalesce(u::text,''),false); perform set_config('role',case when u is null then 'postgres' else 'authenticated' end,false); end $$;
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000c1','cb@test'),('00000000-0000-0000-0000-0000000000c2','cs@test'),('00000000-0000-0000-0000-0000000000c3','cd@test'),('00000000-0000-0000-0000-0000000000c4','cx@test') on conflict do nothing;
insert into public.profiles(id,full_name,phone) values('00000000-0000-0000-0000-0000000000c1','زبون','07819991001'),('00000000-0000-0000-0000-0000000000c2','بائع','07819991002'),('00000000-0000-0000-0000-0000000000c3','سائق','07819991003'),('00000000-0000-0000-0000-0000000000c4','غريب','07819991004') on conflict do nothing;
insert into public.stores(id,owner_id,name,approved) values('00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000c2','محل الرسائل',true);
insert into public.orders(id,store_id,buyer_id,driver_id,status) values('00000000-0000-0000-0000-0000000000c6','00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c3','delivery');
insert into public.used_listings(id,owner_id,title,price,expires_at) values('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-0000000000c2','دراجة',1000,now()+interval '5 days');

-- Order thread: buyer, store owner and driver talk; a stranger cannot read or write.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select public.send_chat_message('order','00000000-0000-0000-0000-0000000000c6','00000000-0000-0000-0000-0000000000c1','وصلت، أنا عند الباب');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.ok((select count(*) from public.chat_messages)=1,'buyer reads the driver message');
select pg_temp.ok((select count(*) from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000000c1' and event_kind='message')=1,'buyer is notified');
select public.send_chat_message('order','00000000-0000-0000-0000-0000000000c6','00000000-0000-0000-0000-0000000000c1','اتركه عند الباب رجاءً');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000000c2' and event_kind='message')=1,'store owner gets one notice per thread');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
select pg_temp.ok((select count(*) from public.chat_messages)=0,'stranger reads nothing');
do $$begin perform public.send_chat_message('order','00000000-0000-0000-0000-0000000000c6','00000000-0000-0000-0000-0000000000c1','مرحبا'); raise exception 'stranger wrote'; exception when others then if sqlerrm<>'not allowed' then raise; end if; end$$;

-- Used item: only an interested buyer opens the thread; the owner answers.
do $$begin perform public.send_chat_message('used','00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-0000000000c4','هل ما زال متوفرًا؟'); end$$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
do $$begin perform public.send_chat_message('used','00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-0000000000c3','تعال اشترِ'); raise exception 'owner spammed'; exception when others then if sqlerrm<>'not allowed' then raise; end if; end$$;
select public.send_chat_message('used','00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-0000000000c4','نعم متوفر');
select pg_temp.ok((select count(*) from public.chat_messages where kind='used')=2,'owner answers the buyer');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.ok((select count(*) from public.chat_messages where kind='used')=0,'other customers do not see the used-item thread');

-- Ratings.
do $$begin perform public.rate_order('00000000-0000-0000-0000-0000000000c6',5,array['سريع'],''); raise exception 'rated early'; exception when others then if sqlerrm<>'rate after delivery' then raise; end if; end$$;
select pg_temp.as_user(null);
update public.orders set status='delivered' where id='00000000-0000-0000-0000-0000000000c6';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select public.rate_order('00000000-0000-0000-0000-0000000000c6',4,array['سريع','طازج'],'ممتاز');
select public.rate_order('00000000-0000-0000-0000-0000000000c6',5,array['سريع'],'ممتاز جدًا');
select pg_temp.ok((select stars from public.store_ratings)=5,'buyer can change the rating');
do $$begin perform public.rate_order('00000000-0000-0000-0000-0000000000c6',5,array['كلمة غريبة'],''); raise exception 'bad tag'; exception when others then if sqlerrm<>'invalid tags' then raise; end if; end$$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
do $$begin perform public.rate_order('00000000-0000-0000-0000-0000000000c6',1,'{}',''); raise exception 'stranger rated'; exception when others then if sqlerrm<>'not allowed' then raise; end if; end$$;
select pg_temp.as_user(null);
set role anon;
select pg_temp.ok((select rating from public.store_rating_summary() where store_id='00000000-0000-0000-0000-0000000000c5')=5.0,'guests see the store average');
reset role;
delete from public.chat_messages; delete from public.used_listings where id='00000000-0000-0000-0000-0000000000c7';
