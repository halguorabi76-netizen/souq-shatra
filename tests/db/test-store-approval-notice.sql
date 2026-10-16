-- The seller hears about approval and pausing of their store; removed stores stay silent.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000f1','shopnote@test') on conflict do nothing;
insert into public.profiles(id,full_name,phone) values('00000000-0000-0000-0000-0000000000f1','صاحب محل','07819990011') on conflict do nothing;
insert into public.stores(id,owner_id,name) values('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f1','محل الاختبار');
select pg_temp.ok((select count(*) from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000000f1')=0,'a pending request sends nothing to the seller');
update public.stores set approved=true where id='00000000-0000-0000-0000-0000000000f2';
select pg_temp.ok((select title from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000000f1' and event_kind='approval')='تمت الموافقة على متجرك','approval notifies the seller');
update public.stores set name='اسم جديد' where id='00000000-0000-0000-0000-0000000000f2';
select pg_temp.ok((select count(*) from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000000f1')=1,'other edits do not notify');
update public.stores set approved=false where id='00000000-0000-0000-0000-0000000000f2';
select pg_temp.ok((select count(*) from public.account_notifications where recipient_id='00000000-0000-0000-0000-0000000000f1' and title='تم إيقاف متجرك مؤقتًا')=1,'pausing notifies the seller');
