-- New store types are accepted by the sign-up claim; unknown ones are refused.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',coalesce(u::text,''),false); perform set_config('role',case when u is null then 'postgres' else 'authenticated' end,false); end $$;
create or replace function pg_temp.ok(cond boolean,msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %',msg; end if; raise notice 'ok - %',msg; end $$;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000088a1','sk-social@test') on conflict do nothing;
insert into public.profiles(id,full_name,phone,role) values('00000000-0000-0000-0000-0000000088a1','صفحة','07819990771','buyer') on conflict(id) do update set role='buyer';
insert into public.professional_invites(phone_tail,role) values('7819990771','seller') on conflict do nothing;
select pg_temp.as_user('00000000-0000-0000-0000-0000000088a1');
do $$begin perform public.claim_professional_invite('seller','صفحة الأناقة','shop','ملابس','الشطرة',31.4,46.1,null); raise exception 'unknown kind accepted'; exception when others then if sqlerrm<>'store details required' then raise; end if; end$$;
select public.claim_professional_invite('seller','صفحة الأناقة','social','ملابس على إنستغرام','الشطرة - حي الشهداء',31.4,46.1,null);
select pg_temp.as_user(null);
select pg_temp.ok((select store_kind from public.stores where owner_id='00000000-0000-0000-0000-0000000088a1')='social','a social-media page is saved as its own store type');
select pg_temp.ok(private.store_kind_label('personal')='بائع فردي','labels for the new types');
delete from public.store_pickups where store_id in (select id from public.stores where owner_id='00000000-0000-0000-0000-0000000088a1');
delete from public.stores where owner_id='00000000-0000-0000-0000-0000000088a1';
delete from public.professional_invites where phone_tail='7819990771';
