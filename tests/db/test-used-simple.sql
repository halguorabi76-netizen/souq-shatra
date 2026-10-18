-- Simple «بِع غرضك»: photos + one description, optional price, vehicle details kept to known keys.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',coalesce(u::text,''),false); perform set_config('role',case when u is null then 'postgres' else 'authenticated' end,false); end $$;
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000055e1','us1@test') on conflict do nothing;
insert into public.profiles(id,full_name,phone,role) values('00000000-0000-0000-0000-0000000055e1','بائع مستعمل','07815550001','buyer') on conflict(id) do nothing;
update public.platform_settings set used_monthly_limit=3;
select pg_temp.as_user('00000000-0000-0000-0000-0000000055e1');
do $$begin perform public.create_used_listing_simple('غسالة',null,'{}',null); raise exception 'no photo accepted'; exception when others then if sqlerrm<>'photo required' then raise; end if; end$$;
do $$begin perform public.create_used_listing_simple('غسالة',null,array['someone-else/a.jpg'],null); raise exception 'foreign photo accepted'; exception when others then if sqlerrm<>'invalid image' then raise; end if; end$$;
select public.create_used_listing_simple(E'غسالة سامسونج 7 كيلو\nنظيفة وتعمل بشكل ممتاز',null,array['00000000-0000-0000-0000-0000000055e1/1.jpg','00000000-0000-0000-0000-0000000055e1/2.jpg'],'{}');
select public.create_used_listing_simple('تويوتا كامري للبيع',18500000,array['00000000-0000-0000-0000-0000000055e1/3.jpg'],'{"vehicle":"car","make":"تويوتا كامري","year":"2015","km":"120000","gear":"أوتوماتيك","evil":"x"}');
select pg_temp.as_user(null);
select pg_temp.ok((select title from public.used_listings where owner_id='00000000-0000-0000-0000-0000000055e1' and price is null)='غسالة سامسونج 7 كيلو','title is the first line; price may be empty');
select pg_temp.ok((select cardinality(image_paths) from public.used_listings where owner_id='00000000-0000-0000-0000-0000000055e1' and price is null)=2,'several photos are kept');
select pg_temp.ok((select details->>'year' from public.used_listings where price=18500000)='2015' and (select not (details ? 'evil') from public.used_listings where price=18500000),'vehicle details keep only known keys');
delete from public.used_listings where owner_id='00000000-0000-0000-0000-0000000055e1';
