-- Review queue: the admin decides before things appear to customers.
--  * A store's first products (5 by default) wait for approval; after that the store is trusted.
--  * Editing an approved product keeps the live version and holds the edit for review.
--  * Every used listing waits for approval before it is shown.
--  * Join requests (stores, drivers), products and used listings can be put «قيد الانتظار».

alter table public.platform_settings add column if not exists product_review_count integer not null default 5 check (product_review_count between 0 and 100);

alter table public.products add column if not exists review_status text not null default 'approved' check (review_status in ('approved','pending','rejected'));
alter table public.products add column if not exists pending_changes jsonb check (pending_changes is null or pg_column_size(pending_changes) < 8000);
alter table public.products add column if not exists review_hold boolean not null default false;
alter table public.stores add column if not exists review_hold boolean not null default false;
alter table public.delivery_workers add column if not exists review_hold boolean not null default false;
alter table public.used_listings add column if not exists review_hold boolean not null default false;

-- Used listings start as «pending» until the admin approves them.
alter table public.used_listings drop constraint if exists used_listings_status_check;
alter table public.used_listings add constraint used_listings_status_check check (status in ('pending','active','sold','removed','rejected'));
alter table public.used_listings alter column status set default 'pending';

-- Customers only see approved products (owners and admins still see their own / all).
drop policy if exists "public approved products" on public.products;
create policy "public approved products" on public.products for select using (
  (active and not blocked and review_status='approved' and exists(select 1 from public.stores s where s.id=products.store_id and s.approved and not s.removed))
  or public.owns_store(store_id) or public.is_admin());

-- New product: pending while the store still has fewer approved products than the threshold.
create or replace function private.product_review_on_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_limit integer; v_approved integer;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  select coalesce(product_review_count,5) into v_limit from public.platform_settings where id=true;
  select count(*) into v_approved from public.products where store_id=new.store_id and review_status='approved';
  if v_approved < coalesce(v_limit,5) then new.review_status:='pending'; else new.review_status:='approved'; end if;
  new.pending_changes:=null; new.review_hold:=false;
  return new;
end $$;
drop trigger if exists a_product_review_insert on public.products;
create trigger a_product_review_insert before insert on public.products for each row execute function private.product_review_on_insert();

-- Edit by the seller: an approved product keeps its live content; the edit waits in pending_changes.
create or replace function private.product_review_on_update() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_changes jsonb:='{}'::jsonb; k text; v_old jsonb; v_new jsonb;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  -- Review fields are the admin's alone.
  new.review_status:=old.review_status; new.pending_changes:=old.pending_changes; new.review_hold:=old.review_hold;
  v_old:=to_jsonb(old); v_new:=to_jsonb(new);
  foreach k in array array['name','description','category','price','compare_at_price','image_path','variant','sku'] loop
    if v_new->k is distinct from v_old->k then v_changes:=v_changes||jsonb_build_object(k,v_new->k); end if;
  end loop;
  if v_changes='{}'::jsonb then return new; end if;
  if old.review_status='approved' then
    new.pending_changes:=coalesce(old.pending_changes,'{}'::jsonb)||v_changes;
    new.name:=old.name; new.description:=old.description; new.category:=old.category; new.price:=old.price;
    new.compare_at_price:=old.compare_at_price; new.image_path:=old.image_path; new.variant:=old.variant; new.sku:=old.sku;
  elsif old.review_status='rejected' then
    new.review_status:='pending';
  end if;
  return new;
end $$;
drop trigger if exists a_product_review_update on public.products;
create trigger a_product_review_update before update on public.products for each row execute function private.product_review_on_update();

-- The admin's decisions.
create or replace function public.review_product(p_id uuid, p_decision text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype; c jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'not permitted'; end if;
  select * into p from public.products where id=p_id for update;
  if not found then raise exception 'product not found'; end if;
  if p_decision='hold' then update public.products set review_hold=true where id=p_id; return; end if;
  if p_decision not in ('approve','reject') then raise exception 'invalid decision'; end if;
  c:=p.pending_changes;
  if c is not null then
    if p_decision='approve' then
      update public.products set
        name=coalesce(c->>'name',name), description=case when c ? 'description' then c->>'description' else description end,
        category=coalesce(c->>'category',category), price=coalesce((c->>'price')::integer,price),
        compare_at_price=case when c ? 'compare_at_price' then (c->>'compare_at_price')::integer else compare_at_price end,
        image_path=case when c ? 'image_path' then c->>'image_path' else image_path end,
        variant=case when c ? 'variant' then c->>'variant' else variant end, sku=case when c ? 'sku' then c->>'sku' else sku end,
        pending_changes=null, review_hold=false, review_status=case when review_status='pending' then 'approved' else review_status end
      where id=p_id;
    else
      update public.products set pending_changes=null, review_hold=false where id=p_id;
    end if;
  else
    update public.products set review_status=case when p_decision='approve' then 'approved' else 'rejected' end, review_hold=false where id=p_id;
  end if;
end $$;

create or replace function public.review_used(p_id uuid, p_decision text)
returns void language plpgsql security definer set search_path='' as $$
declare cfg public.platform_settings%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'not permitted'; end if;
  if p_decision='hold' then update public.used_listings set review_hold=true where id=p_id and status='pending'; return; end if;
  if p_decision not in ('approve','reject') then raise exception 'invalid decision'; end if;
  select * into cfg from public.platform_settings where id=true;
  if p_decision='approve' then
    update public.used_listings set status='active', review_hold=false, expires_at=now()+make_interval(days=>coalesce(cfg.used_listing_days,15)) where id=p_id and status='pending';
  else
    update public.used_listings set status='rejected', review_hold=false where id=p_id and status='pending';
  end if;
  if not found then raise exception 'listing not waiting for review'; end if;
end $$;

-- «قيد الانتظار» for join requests (stores and drivers).
create or replace function public.set_review_hold(p_kind text, p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'not permitted'; end if;
  if p_kind='store' then update public.stores set review_hold=coalesce(p_on,false) where id=p_id;
  elsif p_kind='driver' then update public.delivery_workers set review_hold=coalesce(p_on,false) where user_id=p_id;
  else raise exception 'invalid kind'; end if;
end $$;

revoke all on function public.review_product(uuid,text), public.review_used(uuid,text), public.set_review_hold(text,uuid,boolean) from public, anon;
grant execute on function public.review_product(uuid,text), public.review_used(uuid,text), public.set_review_hold(text,uuid,boolean) to authenticated;
revoke all on function private.product_review_on_insert(), private.product_review_on_update() from public, anon, authenticated;
notify pgrst,'reload schema';
