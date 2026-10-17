-- Client error reports are write-only for visitors and capped.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
set role anon;
select public.log_client_error('blocked','after cart','top=div#ghost','cartPage','v1','test');
select public.log_client_error('nonsense','x','','','','');
do $$begin perform 1 from public.client_errors; raise exception 'anon read reports'; exception when insufficient_privilege then null; end$$;
reset role;
select pg_temp.ok((select count(*) from public.client_errors where message='after cart' and detail='top=div#ghost')=1,'a report is stored');
select pg_temp.ok(not exists(select 1 from public.client_errors where kind='nonsense'),'unknown kinds are ignored');
delete from public.client_errors;
