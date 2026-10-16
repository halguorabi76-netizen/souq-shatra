-- «تصفير الواجهة»: a test seller or driver account can wipe its own history and start clean.
-- Only for the site owner's test accounts: the admin account itself, any account on the same
-- number as an admin, or a number the admin added to the test list. Real sellers never see it.
-- Seller: every order of the store (also gone for the customer and the admin), every product, the
-- store's customers, stock moves, payments, ratings and notices. The store itself stays.
-- Driver: every order the driver delivered or holds, payments, declines and notices.

create table if not exists public.workspace_reset_phones(
 phone_tail text primary key check(phone_tail ~ '^7[0-9]{9}$'),
 created_at timestamptz not null default now()
);
alter table public.workspace_reset_phones enable row level security;
revoke all on public.workspace_reset_phones from anon,authenticated;

create or replace function private.user_phone_tail(p_user uuid) returns text language sql stable security definer set search_path='' as $$
 select private.phone_tail(coalesce(nullif(u.phone,''),p.phone)) from auth.users u join public.profiles p on p.id=u.id where u.id=p_user
$$;
revoke all on function private.user_phone_tail(uuid) from public,anon,authenticated;

create or replace function public.can_reset_workspace() returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_tail text;
begin
 if v_user is null or not public.is_active_user() then return false; end if;
 if exists(select 1 from public.profiles where id=v_user and role='admin') then return true; end if;
 v_tail:=private.user_phone_tail(v_user);
 if v_tail is null or v_tail !~ '^7[0-9]{9}$' then return false; end if;
 return exists(select 1 from public.workspace_reset_phones where phone_tail=v_tail)
  or exists(select 1 from public.profiles p where p.role='admin' and not p.disabled and p.id<>v_user and private.user_phone_tail(p.id)=v_tail);
end $$;

create or replace function private.purge_orders(p_orders uuid[]) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if coalesce(cardinality(p_orders),0)=0 then return 0; end if;
 delete from public.chat_messages where kind='order' and ref_id=any(p_orders);
 delete from public.delivery_tracking where order_id=any(p_orders);
 delete from public.delivery_events where order_id=any(p_orders);
 delete from public.ledger_entries where order_id=any(p_orders);
 delete from public.orders where id=any(p_orders);
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function private.purge_orders(uuid[]) from public,anon,authenticated;

create or replace function public.reset_my_workspace(p_role text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_store uuid; v_orders uuid[]; v_products uuid[]; v_count integer:=0; v_items integer:=0;
begin
 if not public.can_reset_workspace() then raise exception 'not allowed'; end if;
 if p_role='seller' then
  select id into v_store from public.stores where owner_id=v_user;
  if v_store is null then raise exception 'no store'; end if;
  perform pg_advisory_xact_lock(hashtext('reset:'||v_store::text));
  select coalesce(array_agg(id),'{}') into v_orders from public.orders where store_id=v_store;
  v_count:=private.purge_orders(v_orders);
  select coalesce(array_agg(id),'{}') into v_products from public.products where store_id=v_store;
  update public.order_items set product_id=null where product_id=any(v_products);
  delete from public.product_stock_movements where store_id=v_store;
  delete from public.delivery_events where store_id=v_store;
  delete from public.promotions where store_id=v_store;
  delete from public.payment_requests where store_id=v_store;
  delete from public.store_ratings where store_id=v_store;
  delete from public.seller_customers where store_id=v_store;
  delete from public.ledger_entries where party_id=v_store;
  delete from public.products where store_id=v_store;
  get diagnostics v_items=row_count;
 elsif p_role='driver' then
  if not exists(select 1 from public.delivery_workers where user_id=v_user) then raise exception 'no driver'; end if;
  perform pg_advisory_xact_lock(hashtext('reset:'||v_user::text));
  select coalesce(array_agg(id),'{}') into v_orders from public.orders where driver_id=v_user;
  v_count:=private.purge_orders(v_orders);
  update public.delivery_tracking set accepted_driver_id=null where accepted_driver_id=v_user;
  delete from public.delivery_declines where driver_id=v_user;
  delete from public.delivery_events where driver_id=v_user;
  delete from public.delivery_payments where driver_id=v_user;
  delete from public.ledger_entries where party_id=v_user;
 else raise exception 'invalid role'; end if;
 delete from public.account_notifications where recipient_id=v_user;
 return jsonb_build_object('orders',v_count,'products',v_items);
end $$;

-- Admin: the list of test numbers allowed to reset.
create or replace function public.admin_reset_phones() returns setof text language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_admin();
 return query select '0'||phone_tail from public.workspace_reset_phones order by created_at desc;
end $$;
create or replace function public.admin_set_reset_phone(p_phone text,p_allowed boolean) returns void language plpgsql security definer set search_path='' as $$
declare v_tail text:=private.phone_tail(p_phone);
begin
 perform private.require_admin();
 if v_tail !~ '^7[0-9]{9}$' then raise exception 'invalid phone'; end if;
 if p_allowed then insert into public.workspace_reset_phones(phone_tail) values(v_tail) on conflict do nothing;
 else delete from public.workspace_reset_phones where phone_tail=v_tail; end if;
end $$;

revoke all on function public.can_reset_workspace(),public.reset_my_workspace(text),public.admin_reset_phones(),public.admin_set_reset_phone(text,boolean) from public,anon;
grant execute on function public.can_reset_workspace(),public.reset_my_workspace(text),public.admin_reset_phones(),public.admin_set_reset_phone(text,boolean) to authenticated;

notify pgrst,'reload schema';
