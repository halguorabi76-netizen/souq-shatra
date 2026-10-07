-- Additive identifiers. Existing UUID relationships remain unchanged.
alter table public.profiles add column if not exists username text;
alter table public.stores add column if not exists username text;
alter table public.stores add column if not exists verified boolean not null default false;
alter table public.profiles add constraint professional_username_format check(username is null or username ~ '^[a-z][a-z0-9_]{2,29}$');
create unique index if not exists professional_username_unique on public.profiles(lower(username)) where username is not null;
create unique index if not exists store_username_unique on public.stores(lower(username)) where username is not null;

create or replace function private.guard_public_store_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.verified is distinct from old.verified and not public.is_admin() then raise exception 'admin required for verification'; end if;
 if new.username is distinct from old.username and new.username is distinct from (select username from public.profiles where id=new.owner_id) then raise exception 'use professional username'; end if;
 return new;
end;$$;
revoke all on function private.guard_public_store_identity() from public,anon,authenticated;
create trigger store_public_identity_guard before update on public.stores for each row execute function private.guard_public_store_identity();

create or replace function private.guard_professional_username() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.username is distinct from old.username then
  if new.username is null or not exists(select 1 from public.stores where owner_id=new.id and not removed) and not exists(select 1 from public.delivery_workers where user_id=new.id) then raise exception 'professional account required'; end if;
  new.username:=lower(trim(new.username));
 end if;
 return new;
end;$$;
revoke all on function private.guard_professional_username() from public,anon,authenticated;
create trigger professional_username_guard before update of username on public.profiles for each row execute function private.guard_professional_username();

create or replace function private.sync_professional_username() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.stores set username=new.username where owner_id=new.id; return new; end;$$;
revoke all on function private.sync_professional_username() from public,anon,authenticated;
create trigger professional_username_sync after update of username on public.profiles for each row execute function private.sync_professional_username();

create or replace function private.set_professional_username(p_username text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required'; end if;
 if lower(trim(p_username)) !~ '^[a-z][a-z0-9_]{2,29}$' or p_username is null then raise exception 'username: use 3-30 letters, numbers or underscore, starting with a letter'; end if;
 update public.profiles set username=lower(trim(p_username)) where id=auth.uid();
end;$$;
create or replace function public.set_professional_username(p_username text) returns void language sql security invoker set search_path='' as $$ select private.set_professional_username(p_username); $$;
revoke all on function private.set_professional_username(text),public.set_professional_username(text) from public,anon;
grant execute on function private.set_professional_username(text),public.set_professional_username(text) to authenticated;

-- Allocate human identifiers to existing professionals, without modifying names or relations.
update public.profiles p set username=(case when exists(select 1 from public.stores where owner_id=p.id) then 'seller_' else 'driver_' end)||replace(p.id::text,'-','')::varchar(20)
where username is null and (exists(select 1 from public.stores where owner_id=p.id and not removed) or exists(select 1 from public.delivery_workers where user_id=p.id));
create or replace function private.assign_professional_username() returns trigger language plpgsql security definer set search_path='' as $$
declare account_id uuid;
begin
 account_id:=(to_jsonb(new)->>case when tg_table_name='stores' then 'owner_id' else 'user_id' end)::uuid;
 update public.profiles set username=case when tg_table_name='stores' then 'seller_' else 'driver_' end||left(replace(account_id::text,'-',''),20) where id=account_id and username is null;
 if tg_table_name='stores' then update public.stores set username=(select username from public.profiles where id=account_id) where id=new.id;end if;
 return new;
end;$$;
revoke all on function private.assign_professional_username() from public,anon,authenticated;
create trigger store_username_assign after insert on public.stores for each row execute function private.assign_professional_username();
create trigger driver_username_assign after insert on public.delivery_workers for each row execute function private.assign_professional_username();

create or replace function private.guard_historical_product_delete() returns trigger language plpgsql set search_path='' as $$
begin if exists(select 1 from public.order_items where product_id=old.id) then raise exception 'historical product: archive instead'; end if; return old; end;$$;
revoke all on function private.guard_historical_product_delete() from public,anon,authenticated;
create trigger preserve_order_product before delete on public.products for each row execute function private.guard_historical_product_delete();
create or replace function private.delete_product_safely(p_product uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype;
begin
 select * into p from public.products where id=p_product for update;
 if not found or not public.can_manage_approved_store(p.store_id) then raise exception 'not permitted';end if;
 if exists(select 1 from public.order_items where product_id=p_product) then
  update public.products set active=false,attributes=attributes||'{"_deleted":true}'::jsonb where id=p_product;
 else delete from public.products where id=p_product; end if;
end;$$;
create or replace function public.delete_product_safely(p_product uuid) returns void language sql security invoker set search_path='' as $$ select private.delete_product_safely(p_product); $$;
revoke all on function private.delete_product_safely(uuid),public.delete_product_safely(uuid) from public,anon;
grant execute on function private.delete_product_safely(uuid),public.delete_product_safely(uuid) to authenticated;
