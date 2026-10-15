-- Free WhatsApp sign-in: only the service role reaches it; codes link once, expire, and stay bound to their secret.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
create temp table t_wa(k text primary key,v text);
grant all on t_wa to service_role,authenticated;

set role authenticated;
do $$begin perform public.whatsapp_login_start(repeat('a',64),'x'); raise exception 'browser started'; exception when insufficient_privilege then null; end$$;
reset role;

set role service_role;
insert into t_wa values('c1',public.whatsapp_login_start(repeat('a',64),'ip1')->>'code');
select pg_temp.ok((select v from t_wa where k='c1') ~ '^[0-9]{6}$','start returns a 6-digit code');
select pg_temp.ok(public.whatsapp_login_claim((select v from t_wa where k='c1'),repeat('a',64))->>'status'='pending','unconfirmed code is pending');
select pg_temp.ok(not public.whatsapp_login_confirm('12345','9647801234567'),'malformed code ignored');
select pg_temp.ok(public.whatsapp_login_confirm((select v from t_wa where k='c1'),'9647801234567'),'incoming message confirms the code');
select pg_temp.ok(not public.whatsapp_login_confirm((select v from t_wa where k='c1'),'9647700000000'),'a second sender cannot take over a confirmed code');
select pg_temp.ok(public.whatsapp_login_claim((select v from t_wa where k='c1'),repeat('b',64))->>'status'='expired','wrong secret learns nothing');
select pg_temp.ok(public.whatsapp_login_claim((select v from t_wa where k='c1'),repeat('a',64))->>'phone'='9647801234567','owner collects the verified phone');
select pg_temp.ok(public.whatsapp_login_claim((select v from t_wa where k='c1'),repeat('a',64))->>'status'='expired','a result is collected only once');
reset role;

-- Existing account with that phone is returned; expired codes cannot be confirmed.
insert into auth.users(id,email,phone) values('00000000-0000-0000-0000-0000000000d1','wa@phone.invalid','9647809999999');
set role service_role;
insert into t_wa values('c2',public.whatsapp_login_start(repeat('c',64),'ip1')->>'code');
select public.whatsapp_login_confirm((select v from t_wa where k='c2'),'9647809999999');
select pg_temp.ok(public.whatsapp_login_claim((select v from t_wa where k='c2'),repeat('c',64))->>'user_id'='00000000-0000-0000-0000-0000000000d1','known phone maps to its account');
insert into t_wa values('c3',public.whatsapp_login_start(repeat('d',64),'ip2')->>'code');
reset role;
update private.whatsapp_logins set expires_at=now()-interval '1 second' where code=(select v from t_wa where k='c3');
set role service_role;
select pg_temp.ok(not public.whatsapp_login_confirm((select v from t_wa where k='c3'),'9647801234567'),'expired code cannot be confirmed');
select pg_temp.ok(public.whatsapp_login_claim((select v from t_wa where k='c3'),repeat('d',64))->>'status'='expired','expired code reports expired');
-- Rate limit: five starts per client in ten minutes.
select public.whatsapp_login_start(repeat('e',64),'ip3') from generate_series(1,5);
select pg_temp.ok((public.whatsapp_login_start(repeat('e',64),'ip3')->>'limited')::boolean,'sixth start is rate limited');
reset role;
