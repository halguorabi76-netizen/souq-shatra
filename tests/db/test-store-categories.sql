-- Store categories on the local harness (runs after test-revenue.sql, reusing its users and store).
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',coalesce(u::text,''),false); perform set_config('role',case when u is null then 'postgres' else 'authenticated' end,false); end $$;
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
create temp table t_cat(name text primary key,id uuid);
grant all on t_cat to authenticated;

-- Only the admin manages the list.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$begin perform public.admin_save_store_category(null,'مطاعم',0,true); raise exception 'seller saved category'; exception when others then if sqlerrm like 'seller saved%' then raise; end if; end$$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into t_cat values('food',public.admin_save_store_category(null,'مطاعم',0,true)),('home',public.admin_save_store_category(null,'أكلات بيتية',1,true)),('old',public.admin_save_store_category(null,'قديم',2,false));
select pg_temp.ok((select count(*) from public.store_categories)=3,'admin creates categories');

-- Buyers see active categories only.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from public.store_categories)=2,'inactive category hidden from buyers');

-- The owner picks an active category; inactive or other stores are refused.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.set_my_store_category((select id from t_cat where name='home'));
select pg_temp.ok((select store_category_id from public.stores where id='10000000-0000-0000-0000-000000000001')=(select id from t_cat where name='home'),'seller sets own store category');
do $$begin perform public.set_my_store_category((select id from t_cat where name='old')); raise exception 'inactive accepted'; exception when others then if sqlerrm like 'inactive accepted%' then raise; end if; end$$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$begin perform public.set_my_store_category((select id from t_cat where name='food')); raise exception 'buyer without store accepted'; exception when others then if sqlerrm like 'buyer without%' then raise; end if; end$$;

-- The admin overrides it, and deleting a category leaves the store uncategorised.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_store_category('10000000-0000-0000-0000-000000000001',(select id from t_cat where name='food'));
select pg_temp.ok((select store_category_id from public.stores where id='10000000-0000-0000-0000-000000000001')=(select id from t_cat where name='food'),'admin changes store category');
select public.admin_delete_store_category((select id from t_cat where name='food'));
select pg_temp.ok((select store_category_id from public.stores where id='10000000-0000-0000-0000-000000000001') is null,'deleted category detaches the store');
select pg_temp.as_user(null);
