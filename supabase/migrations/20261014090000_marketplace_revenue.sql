-- Marketplace revenue: seller commission, seller plans, paid promotions, delivery share,
-- a per-party ledger, manual transfer proofs and online payment intents.
-- Additive only: no existing order, price, stock or balance is rewritten. Every rate
-- starts at 0 so nothing is charged until the admin sets prices in the admin console.

-- ===== Settings and catalogues =====
create table public.platform_settings (
 id boolean primary key default true check(id),
 commission_percent numeric(5,2) not null default 0 check(commission_percent between 0 and 50),
 delivery_share_percent numeric(5,2) not null default 0 check(delivery_share_percent between 0 and 100),
 store_debt_limit integer not null default 0 check(store_debt_limit between 0 and 100000000),
 payment_methods jsonb not null default '{"cod":true,"zaincash":false,"card":false}'::jsonb,
 transfer_accounts jsonb not null default '{"zaincash":"","qi":""}'::jsonb,
 support_phone text not null default '9647837271707' check(support_phone ~ '^[0-9]{8,15}$'),
 updated_at timestamptz not null default now()
);
insert into public.platform_settings default values;

create table public.seller_plans (
 id text primary key check(id ~ '^[a-z][a-z0-9_]{1,30}$'),
 name text not null check(length(trim(name)) between 2 and 60),
 description text not null default '' check(length(description)<=500),
 monthly_price integer not null default 0 check(monthly_price between 0 and 100000000),
 commission_percent numeric(5,2) check(commission_percent between 0 and 50),
 max_products integer check(max_products between 1 and 100000),
 featured_days integer not null default 0 check(featured_days between 0 and 31),
 position integer not null default 0,
 active boolean not null default true,
 updated_at timestamptz not null default now()
);
insert into public.seller_plans(id,name,description,monthly_price,commission_percent,max_products,featured_days,position) values
 ('free','الأساسية','ابدأ البيع مجانًا مع عمولة السوق الافتراضية.',0,null,null,0,0),
 ('silver','الفضية','عمولة أقل وأيام ظهور مميز كل شهر.',0,null,null,3,1),
 ('gold','الذهبية','أقل عمولة، ظهور مميز أطول، وشارة متجر مميز.',0,null,null,10,2);

create table public.promotion_placements (
 id text primary key check(id in ('home_hero','home_featured','search_top','category_top','store_spotlight')),
 name text not null,
 description text not null default '',
 daily_price integer not null default 0 check(daily_price between 0 and 100000000),
 max_active integer not null default 8 check(max_active between 1 and 100),
 needs_product boolean not null default true,
 active boolean not null default true
);
insert into public.promotion_placements(id,name,description,needs_product,max_active) values
 ('home_hero','واجهة الصفحة الرئيسية','إعلان كبير أعلى الصفحة الرئيسية.',true,5),
 ('home_featured','منتجات مميزة','يظهر المنتج في قسم «مميز» بالصفحة الرئيسية.',true,12),
 ('search_top','أعلى نتائج البحث','يظهر المنتج أولًا عندما يطابق البحث.',true,20),
 ('category_top','أعلى القسم','يظهر المنتج أولًا في قسمه.',true,20),
 ('store_spotlight','متجر مميز','يظهر متجرك في قائمة المتاجر المميزة.',false,8);

alter table public.platform_settings enable row level security;
alter table public.seller_plans enable row level security;
alter table public.promotion_placements enable row level security;
revoke all on public.platform_settings,public.seller_plans,public.promotion_placements from anon,authenticated;
grant select on public.platform_settings,public.seller_plans,public.promotion_placements to anon,authenticated;
create policy settings_public on public.platform_settings for select using(true);
create policy plans_public on public.seller_plans for select using(active or public.is_admin());
create policy placements_public on public.promotion_placements for select using(active or public.is_admin());

-- ===== Subscriptions and promotions =====
create table public.store_subscriptions (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete cascade,
 plan_id text not null references public.seller_plans(id),
 months integer not null check(months between 1 and 12),
 amount integer not null check(amount>=0),
 status text not null default 'pending' check(status in ('pending','active','rejected','cancelled')),
 starts_at timestamptz, ends_at timestamptz,
 created_at timestamptz not null default now()
);
create index store_subscriptions_store_idx on public.store_subscriptions(store_id,status,ends_at desc);

create table public.promotions (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete cascade,
 product_id uuid references public.products(id) on delete cascade,
 placement text not null references public.promotion_placements(id),
 days integer not null check(days between 1 and 90),
 amount integer not null check(amount>=0),
 status text not null default 'pending' check(status in ('pending','active','rejected','cancelled')),
 source text not null default 'paid' check(source in ('paid','plan','admin')),
 starts_at timestamptz, ends_at timestamptz,
 created_at timestamptz not null default now()
);
create index promotions_live_idx on public.promotions(placement,status,ends_at);

alter table public.store_subscriptions enable row level security;
alter table public.promotions enable row level security;
revoke all on public.store_subscriptions,public.promotions from anon,authenticated;
grant select on public.store_subscriptions to authenticated;
grant select on public.promotions to anon,authenticated;
create policy subscriptions_read on public.store_subscriptions for select to authenticated using(public.owns_store(store_id) or public.is_admin());
create policy promotions_live on public.promotions for select using(status='active' and now() between starts_at and ends_at);
create policy promotions_owner on public.promotions for select to authenticated using(public.owns_store(store_id) or public.is_admin());

-- ===== Ledger, transfer proofs, online payments =====
-- amount > 0: the party owes the platform. amount < 0: the platform owes the party.
create table public.ledger_entries (
 id bigint generated always as identity primary key,
 party_type text not null check(party_type in ('store','driver')),
 party_id uuid not null,
 order_id uuid references public.orders(id),
 kind text not null check(kind in ('commission','online_sale','online_delivery','settlement','payout','adjustment')),
 amount integer not null check(amount<>0),
 note text not null default '' check(length(note)<=500),
 created_by uuid,
 created_at timestamptz not null default now()
);
create unique index ledger_order_once on public.ledger_entries(party_type,party_id,order_id,kind) where order_id is not null;
create index ledger_party_idx on public.ledger_entries(party_type,party_id,created_at desc);

create table public.payment_requests (
 id uuid primary key default gen_random_uuid(),
 payer_id uuid not null references public.profiles(id),
 store_id uuid not null references public.stores(id) on delete cascade,
 purpose text not null check(purpose in ('dues','subscription','promotion')),
 ref_id uuid,
 amount integer not null check(amount between 1 and 100000000),
 method text not null check(method in ('zaincash','qi','cash')),
 reference text not null check(length(trim(reference)) between 3 and 400),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid, reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index payment_requests_status_idx on public.payment_requests(status,created_at desc);

create table public.payment_intents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 purpose text not null check(purpose in ('order','subscription','promotion','dues')),
 ref_ids uuid[] not null,
 amount integer not null check(amount between 250 and 100000000),
 provider text not null check(provider in ('zaincash','card')),
 status text not null default 'created' check(status in ('created','paid','failed','cancelled')),
 provider_ref text,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 paid_at timestamptz
);
create index payment_intents_user_idx on public.payment_intents(user_id,created_at desc);

alter table public.ledger_entries enable row level security;
alter table public.payment_requests enable row level security;
alter table public.payment_intents enable row level security;
revoke all on public.ledger_entries,public.payment_requests,public.payment_intents from anon,authenticated;
grant select on public.ledger_entries,public.payment_requests,public.payment_intents to authenticated;
create policy ledger_read on public.ledger_entries for select to authenticated using(public.is_admin()
 or (party_type='store' and public.owns_store(party_id)) or (party_type='driver' and party_id=auth.uid()));
create policy requests_read on public.payment_requests for select to authenticated using(public.is_admin() or public.owns_store(store_id));
create policy intents_read on public.payment_intents for select to authenticated using(user_id=auth.uid() or public.is_admin());

-- ===== Order payment columns =====
alter table public.orders add column if not exists payment_method text not null default 'cod' check(payment_method in ('cod','zaincash','card'));
alter table public.orders add column if not exists payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','refund_due','refunded'));
alter table public.orders add column if not exists commission_amount integer;
alter table public.orders add column if not exists delivery_share_amount integer;
-- participant_orders exposes whole order rows; the new columns ride along automatically.
grant select(payment_method,payment_status,commission_amount,delivery_share_amount) on public.orders to authenticated;

-- ===== Helpers =====
create or replace function private.store_plan(p_store uuid) returns public.seller_plans language sql stable security definer set search_path='' as $$
 select p.* from public.seller_plans p where p.id=coalesce((select s.plan_id from public.store_subscriptions s
  where s.store_id=p_store and s.status='active' and now() between s.starts_at and s.ends_at order by s.ends_at desc limit 1),'free')
$$;
revoke all on function private.store_plan(uuid) from public,anon,authenticated;

create or replace function private.store_balance(p_store uuid) returns integer language sql stable security definer set search_path='' as $$
 select coalesce(sum(amount),0)::integer from public.ledger_entries where party_type='store' and party_id=p_store
$$;
revoke all on function private.store_balance(uuid) from public,anon,authenticated;

create or replace function private.notify(p_recipient uuid,p_key text,p_title text,p_body text,p_order uuid default null) returns void
language sql security definer set search_path='' as $$
 insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,order_id)
 values(p_recipient,p_key,'status',p_title,coalesce(p_body,''),p_order) on conflict do nothing
$$;
revoke all on function private.notify(uuid,text,text,text,uuid) from public,anon,authenticated;

create or replace function private.notify_admins(p_key text,p_title text,p_body text,p_order uuid default null) returns void
language sql security definer set search_path='' as $$
 insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,order_id)
 select id,p_key,'warning',p_title,coalesce(p_body,''),p_order from public.profiles where role='admin' and not disabled on conflict do nothing
$$;
revoke all on function private.notify_admins(text,text,text,uuid) from public,anon,authenticated;

-- ===== Revenue accrual when an order is delivered or cancelled =====
create or replace function private.order_revenue_before() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.platform_settings%rowtype; plan public.seller_plans%rowtype; subtotal integer;
begin
 if new.status='delivered' and old.status is distinct from 'delivered' and new.commission_amount is null then
  select * into cfg from public.platform_settings;
  plan:=private.store_plan(new.store_id);
  subtotal:=greatest(new.total-new.platform_fee-new.delivery_fee,0);
  new.commission_amount:=round(subtotal*coalesce(plan.commission_percent,cfg.commission_percent)/100.0)::integer;
  new.delivery_share_amount:=case when new.driver_id is null then 0 else round(new.delivery_fee*cfg.delivery_share_percent/100.0)::integer end;
 end if;
 if new.status='cancelled' and old.status is distinct from 'cancelled' and new.payment_status='paid' then
  new.payment_status:='refund_due';
 end if;
 return new;
end $$;
revoke all on function private.order_revenue_before() from public,anon,authenticated;
create trigger order_revenue_before before update of status on public.orders for each row execute function private.order_revenue_before();

create or replace function private.order_revenue_after() returns trigger language plpgsql security definer set search_path='' as $$
declare subtotal integer:=greatest(new.total-new.platform_fee-new.delivery_fee,0);
 delivered_now boolean:=new.status='delivered' and old.status is distinct from 'delivered';
 paid_now boolean:=new.payment_status='paid' and old.payment_status is distinct from 'paid';
begin
 if delivered_now then
  if coalesce(new.commission_amount,0)>0 then
   insert into public.ledger_entries(party_type,party_id,order_id,kind,amount,note) values('store',new.store_id,new.id,'commission',new.commission_amount,'عمولة الطلب') on conflict do nothing;
  end if;
  if coalesce(new.delivery_share_amount,0)>0 and new.driver_id is not null then
   update public.delivery_workers set amount_due=amount_due+new.delivery_share_amount where user_id=new.driver_id;
  end if;
 end if;
 -- Online money reached the platform: it owes the store the goods and the driver the delivery fee.
 -- delivery_step still adds platform_fee to amount_due, so the driver credit includes it (the driver collected nothing).
 if new.status='delivered' and new.payment_status='paid' and (delivered_now or paid_now) then
  if subtotal>0 then insert into public.ledger_entries(party_type,party_id,order_id,kind,amount,note) values('store',new.store_id,new.id,'online_sale',-subtotal,'ثمن طلب مدفوع إلكترونيًا') on conflict do nothing; end if;
  if new.driver_id is not null and new.delivery_fee+new.platform_fee>0 then
   insert into public.ledger_entries(party_type,party_id,order_id,kind,amount,note) values('driver',new.driver_id,new.id,'online_delivery',-(new.delivery_fee+new.platform_fee),'أجرة توصيل طلب مدفوع إلكترونيًا') on conflict do nothing;
  end if;
 end if;
 if new.payment_status='refund_due' and old.payment_status is distinct from 'refund_due' then
  perform private.notify_admins('payment:refund:'||new.id,'استرجاع مبلغ مدفوع','أُلغي طلب مدفوع إلكترونيًا #'||right(new.id::text,6)||' بقيمة '||new.total||' د.ع. أعد المبلغ للزبون ثم علّمه كمسترجع.',new.id);
 end if;
 return new;
end $$;
revoke all on function private.order_revenue_after() from public,anon,authenticated;
create trigger order_revenue_after after update of status,payment_status on public.orders for each row execute function private.order_revenue_after();

-- ===== Plan limits and store debt gate =====
create or replace function private.enforce_plan_products() returns trigger language plpgsql security definer set search_path='' as $$
declare plan public.seller_plans%rowtype; n integer;
begin
 if public.is_admin() then return new; end if;
 plan:=private.store_plan(new.store_id);
 if plan.max_products is null then return new; end if;
 if not new.active then return new; end if;
 select count(*) into n from public.products where store_id=new.store_id and active and id<>new.id;
 if n>=plan.max_products then raise exception 'plan product limit reached: %',plan.max_products; end if;
 return new;
end $$;
revoke all on function private.enforce_plan_products() from public,anon,authenticated;
create trigger products_plan_limit before insert or update of active on public.products for each row execute function private.enforce_plan_products();

create or replace function private.enforce_store_debt() returns trigger language plpgsql security definer set search_path='' as $$
declare lim integer;
begin
 select store_debt_limit into lim from public.platform_settings;
 if lim>0 and private.store_balance(new.store_id)>=lim then raise exception 'store temporarily unavailable'; end if;
 return new;
end $$;
revoke all on function private.enforce_store_debt() from public,anon,authenticated;
create trigger orders_store_debt before insert on public.orders for each row execute function private.enforce_store_debt();

-- ===== Seller requests =====
create or replace function private.own_store() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.stores where owner_id=auth.uid() and approved and not removed limit 1
$$;
revoke all on function private.own_store() from public,anon,authenticated;

create or replace function public.request_subscription(p_plan text,p_months integer) returns uuid language plpgsql security definer set search_path='' as $$
declare s uuid:=private.own_store(); p public.seller_plans%rowtype; v uuid;
begin
 if auth.uid() is null or not public.is_active_user() or s is null then raise exception 'approved store required'; end if;
 select * into p from public.seller_plans where id=p_plan and active;
 if not found or p_months is null or p_months not between 1 and 12 then raise exception 'invalid plan'; end if;
 update public.store_subscriptions set status='cancelled' where store_id=s and status='pending';
 insert into public.store_subscriptions(store_id,plan_id,months,amount) values(s,p.id,p_months,p.monthly_price*p_months) returning id into v;
 if p.monthly_price=0 then perform private.activate_subscription(v); end if;
 return v;
end $$;
revoke all on function public.request_subscription(text,integer) from public,anon;
grant execute on function public.request_subscription(text,integer) to authenticated;

create or replace function private.activate_subscription(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare x public.store_subscriptions%rowtype; start timestamptz; p public.seller_plans%rowtype;
begin
 select * into x from public.store_subscriptions where id=p_id for update;
 if not found or x.status<>'pending' then return; end if;
 select greatest(now(),coalesce(max(ends_at),now())) into start from public.store_subscriptions where store_id=x.store_id and status='active' and plan_id=x.plan_id;
 update public.store_subscriptions set status='active',starts_at=start,ends_at=start+make_interval(months=>x.months) where id=p_id;
 select * into p from public.seller_plans where id=x.plan_id;
 if p.featured_days>0 then
  insert into public.promotions(store_id,placement,days,amount,status,source,starts_at,ends_at)
  values(x.store_id,'store_spotlight',p.featured_days*x.months,0,'active','plan',start,start+make_interval(days=>p.featured_days*x.months));
 end if;
 perform private.notify((select owner_id from public.stores where id=x.store_id),'subscription:'||p_id,'تم تفعيل باقة '||p.name,'الباقة فعالة حتى '||to_char(start+make_interval(months=>x.months),'YYYY-MM-DD'));
end $$;
revoke all on function private.activate_subscription(uuid) from public,anon,authenticated;

create or replace function public.request_promotion(p_placement text,p_product uuid,p_days integer) returns uuid language plpgsql security definer set search_path='' as $$
declare s uuid:=private.own_store(); pl public.promotion_placements%rowtype; v uuid;
begin
 if auth.uid() is null or not public.is_active_user() or s is null then raise exception 'approved store required'; end if;
 select * into pl from public.promotion_placements where id=p_placement and active;
 if not found or p_days is null or p_days not between 1 and 90 then raise exception 'invalid promotion'; end if;
 if pl.needs_product and not exists(select 1 from public.products where id=p_product and store_id=s and active and not blocked) then raise exception 'choose one of your published products'; end if;
 insert into public.promotions(store_id,product_id,placement,days,amount) values(s,case when pl.needs_product then p_product end,pl.id,p_days,pl.daily_price*p_days) returning id into v;
 if pl.daily_price=0 then perform private.activate_promotion(v); end if;
 return v;
end $$;
revoke all on function public.request_promotion(text,uuid,integer) from public,anon;
grant execute on function public.request_promotion(text,uuid,integer) to authenticated;

create or replace function private.activate_promotion(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare x public.promotions%rowtype;
begin
 select * into x from public.promotions where id=p_id for update;
 if not found or x.status<>'pending' then return; end if;
 update public.promotions set status='active',starts_at=now(),ends_at=now()+make_interval(days=>x.days) where id=p_id;
 perform private.notify((select owner_id from public.stores where id=x.store_id),'promotion:'||p_id,'بدأ إعلانك المميز','يظهر إعلانك لمدة '||x.days||' يوم.');
end $$;
revoke all on function private.activate_promotion(uuid) from public,anon,authenticated;

create or replace function public.submit_payment_proof(p_purpose text,p_ref uuid,p_amount integer,p_method text,p_reference text) returns uuid language plpgsql security definer set search_path='' as $$
declare s uuid:=private.own_store(); v uuid; expected integer;
begin
 if auth.uid() is null or not public.is_active_user() or s is null then raise exception 'approved store required'; end if;
 if p_purpose='subscription' then select amount into expected from public.store_subscriptions where id=p_ref and store_id=s and status='pending';
 elsif p_purpose='promotion' then select amount into expected from public.promotions where id=p_ref and store_id=s and status='pending';
 elsif p_purpose='dues' then expected:=p_amount; p_ref:=null;
 else raise exception 'invalid purpose'; end if;
 if expected is null or p_amount is distinct from expected and p_purpose<>'dues' then raise exception 'amount does not match the request'; end if;
 insert into public.payment_requests(payer_id,store_id,purpose,ref_id,amount,method,reference) values(auth.uid(),s,p_purpose,p_ref,p_amount,p_method,trim(p_reference)) returning id into v;
 perform private.notify_admins('payment:proof:'||v,'إثبات دفع بانتظار المراجعة',(select name from public.stores where id=s)||' · '||p_amount||' د.ع');
 return v;
end $$;
revoke all on function public.submit_payment_proof(text,uuid,integer,text,text) from public,anon;
grant execute on function public.submit_payment_proof(text,uuid,integer,text,text) to authenticated;

create or replace function public.set_order_payment_method(p_orders uuid[],p_method text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required'; end if;
 if p_method not in ('cod','zaincash','card') or cardinality(p_orders) not between 1 and 30 then raise exception 'invalid payment method'; end if;
 if exists(select 1 from public.orders where id=any(p_orders) and (buyer_id<>auth.uid() or payment_status<>'unpaid' or status in ('delivered','cancelled'))) then raise exception 'not permitted'; end if;
 update public.orders set payment_method=p_method where id=any(p_orders);
end $$;
revoke all on function public.set_order_payment_method(uuid[],text) from public,anon;
grant execute on function public.set_order_payment_method(uuid[],text) to authenticated;

create or replace function public.store_finance() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s uuid:=private.own_store(); plan public.seller_plans%rowtype;
begin
 if s is null then return null; end if;
 plan:=private.store_plan(s);
 return jsonb_build_object(
  'balance',private.store_balance(s),
  'plan',to_jsonb(plan),
  'commission_percent',coalesce(plan.commission_percent,(select commission_percent from public.platform_settings)),
  'product_count',(select count(*) from public.products where store_id=s and active),
  'subscription',(select to_jsonb(x) from public.store_subscriptions x where store_id=s and status='active' and now() between starts_at and ends_at order by ends_at desc limit 1),
  'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from public.ledger_entries where party_type='store' and party_id=s order by created_at desc limit 200) e),'[]'),
  'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (select * from public.payment_requests where store_id=s order by created_at desc limit 50) r),'[]'),
  'pending_subscriptions',coalesce((select jsonb_agg(to_jsonb(x)) from public.store_subscriptions x where store_id=s and status='pending'),'[]'),
  'promotions',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from (select * from public.promotions where store_id=s order by created_at desc limit 50) p),'[]'));
end $$;
revoke all on function public.store_finance() from public,anon;
grant execute on function public.store_finance() to authenticated;

create or replace function public.driver_finance() returns jsonb language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null or not public.is_active_user() then null else jsonb_build_object(
  'credit',-coalesce((select sum(amount) from public.ledger_entries where party_type='driver' and party_id=auth.uid()),0),
  'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from public.ledger_entries where party_type='driver' and party_id=auth.uid() order by created_at desc limit 100) e),'[]')) end
$$;
revoke all on function public.driver_finance() from public,anon;
grant execute on function public.driver_finance() to authenticated;

-- ===== Admin =====
create or replace function private.require_admin() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() or not public.is_active_user() then raise exception 'admin required'; end if;
end $$;
revoke all on function private.require_admin() from public,anon,authenticated;

create or replace function public.admin_set_platform_settings(p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if jsonb_typeof(p_values)<>'object' then raise exception 'invalid settings'; end if;
 update public.platform_settings set
  commission_percent=coalesce((p_values->>'commission_percent')::numeric,commission_percent),
  delivery_share_percent=coalesce((p_values->>'delivery_share_percent')::numeric,delivery_share_percent),
  store_debt_limit=coalesce((p_values->>'store_debt_limit')::integer,store_debt_limit),
  payment_methods=case when jsonb_typeof(p_values->'payment_methods')='object' then jsonb_build_object(
   'cod',coalesce((p_values->'payment_methods'->>'cod')::boolean,true),
   'zaincash',coalesce((p_values->'payment_methods'->>'zaincash')::boolean,false),
   'card',coalesce((p_values->'payment_methods'->>'card')::boolean,false)) else payment_methods end,
  transfer_accounts=case when jsonb_typeof(p_values->'transfer_accounts')='object' then jsonb_build_object(
   'zaincash',left(coalesce(p_values->'transfer_accounts'->>'zaincash',''),40),'qi',left(coalesce(p_values->'transfer_accounts'->>'qi',''),40)) else transfer_accounts end,
  support_phone=coalesce(nullif(p_values->>'support_phone',''),support_phone),
  updated_at=now()
 where id=true;
end $$;
revoke all on function public.admin_set_platform_settings(jsonb) from public,anon;
grant execute on function public.admin_set_platform_settings(jsonb) to authenticated;

create or replace function public.admin_save_plan(p_id text,p_name text,p_description text,p_price integer,p_commission numeric,p_max_products integer,p_featured_days integer,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 insert into public.seller_plans(id,name,description,monthly_price,commission_percent,max_products,featured_days,active,position)
 values(p_id,trim(p_name),coalesce(p_description,''),p_price,p_commission,p_max_products,coalesce(p_featured_days,0),coalesce(p_active,true),(select coalesce(max(position),0)+1 from public.seller_plans))
 on conflict(id) do update set name=excluded.name,description=excluded.description,monthly_price=excluded.monthly_price,commission_percent=excluded.commission_percent,
  max_products=excluded.max_products,featured_days=excluded.featured_days,active=case when public.seller_plans.id='free' then true else excluded.active end,updated_at=now();
end $$;
revoke all on function public.admin_save_plan(text,text,text,integer,numeric,integer,integer,boolean) from public,anon;
grant execute on function public.admin_save_plan(text,text,text,integer,numeric,integer,integer,boolean) to authenticated;

create or replace function public.admin_save_placement(p_id text,p_price integer,p_max integer,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 update public.promotion_placements set daily_price=p_price,max_active=p_max,active=p_active where id=p_id;
 if not found then raise exception 'unknown placement'; end if;
end $$;
revoke all on function public.admin_save_placement(text,integer,integer,boolean) from public,anon;
grant execute on function public.admin_save_placement(text,integer,integer,boolean) to authenticated;

create or replace function public.admin_review_payment_request(p_id uuid,p_approved boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.payment_requests%rowtype;
begin
 perform private.require_admin();
 select * into r from public.payment_requests where id=p_id for update;
 if not found or r.status<>'pending' then raise exception 'request already reviewed'; end if;
 update public.payment_requests set status=case when p_approved then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id;
 if p_approved then
  if r.purpose='dues' then insert into public.ledger_entries(party_type,party_id,kind,amount,note,created_by) values('store',r.store_id,'settlement',-r.amount,'تسديد مستحقات · '||r.reference,auth.uid());
  elsif r.purpose='subscription' then perform private.activate_subscription(r.ref_id);
  elsif r.purpose='promotion' then perform private.activate_promotion(r.ref_id); end if;
 end if;
 perform private.notify(r.payer_id,'payment:review:'||p_id,case when p_approved then 'تم تأكيد دفعتك' else 'رُفض إثبات الدفع' end,r.amount||' د.ع · '||r.reference);
end $$;
revoke all on function public.admin_review_payment_request(uuid,boolean) from public,anon;
grant execute on function public.admin_review_payment_request(uuid,boolean) to authenticated;

create or replace function public.admin_ledger_entry(p_party_type text,p_party uuid,p_kind text,p_amount integer,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_kind not in ('payout','settlement','adjustment') or coalesce(p_amount,0)=0 or length(trim(coalesce(p_note,'')))<3 then raise exception 'invalid ledger entry'; end if;
 if p_party_type='store' and not exists(select 1 from public.stores where id=p_party) or p_party_type='driver' and not exists(select 1 from public.delivery_workers where user_id=p_party) then raise exception 'unknown party'; end if;
 insert into public.ledger_entries(party_type,party_id,kind,amount,note,created_by) values(p_party_type,p_party,p_kind,p_amount,trim(p_note),auth.uid());
end $$;
revoke all on function public.admin_ledger_entry(text,uuid,text,integer,text) from public,anon;
grant execute on function public.admin_ledger_entry(text,uuid,text,integer,text) to authenticated;

create or replace function public.admin_grant_subscription(p_store uuid,p_plan text,p_months integer) returns void language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 perform private.require_admin();
 insert into public.store_subscriptions(store_id,plan_id,months,amount) values(p_store,p_plan,p_months,0) returning id into v;
 perform private.activate_subscription(v);
end $$;
revoke all on function public.admin_grant_subscription(uuid,text,integer) from public,anon;
grant execute on function public.admin_grant_subscription(uuid,text,integer) to authenticated;

create or replace function public.admin_set_promotion(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_status='active' then perform private.activate_promotion(p_id);
 elsif p_status in ('rejected','cancelled') then update public.promotions set status=p_status,ends_at=least(coalesce(ends_at,now()),now()) where id=p_id;
 else raise exception 'invalid status'; end if;
end $$;
revoke all on function public.admin_set_promotion(uuid,text) from public,anon;
grant execute on function public.admin_set_promotion(uuid,text) to authenticated;

create or replace function public.admin_mark_refunded(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 update public.orders set payment_status='refunded' where id=p_order and payment_status='refund_due';
 if not found then raise exception 'no refund due'; end if;
end $$;
revoke all on function public.admin_mark_refunded(uuid) from public,anon;
grant execute on function public.admin_mark_refunded(uuid) to authenticated;

create or replace function public.admin_finance_summary(p_from timestamptz,p_to timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 perform private.require_admin();
 select jsonb_build_object(
  'orders_delivered',count(*) filter(where status='delivered'),
  'gmv',coalesce(sum(total) filter(where status='delivered'),0),
  'platform_fees',coalesce(sum(platform_fee) filter(where status='delivered'),0),
  'commissions',coalesce(sum(commission_amount) filter(where status='delivered'),0),
  'delivery_share',coalesce(sum(delivery_share_amount) filter(where status='delivered'),0),
  'online_paid',coalesce(sum(total) filter(where payment_status in ('paid','refund_due')),0),
  'refunds_due',coalesce(sum(total) filter(where payment_status='refund_due'),0),
  'orders_total',count(*),'orders_cancelled',count(*) filter(where status='cancelled'))
 into r from public.orders where created_at>=p_from and created_at<p_to;
 return r||jsonb_build_object(
  'subscriptions',coalesce((select sum(amount) from public.payment_requests where purpose='subscription' and status='approved' and reviewed_at>=p_from and reviewed_at<p_to),0)
   +coalesce((select sum(amount) from public.payment_intents where purpose='subscription' and status='paid' and paid_at>=p_from and paid_at<p_to),0),
  'promotions',coalesce((select sum(amount) from public.payment_requests where purpose='promotion' and status='approved' and reviewed_at>=p_from and reviewed_at<p_to),0)
   +coalesce((select sum(amount) from public.payment_intents where purpose='promotion' and status='paid' and paid_at>=p_from and paid_at<p_to),0),
  'store_receivable',coalesce((select sum(greatest(b,0)) from (select sum(amount) b from public.ledger_entries where party_type='store' group by party_id) x),0),
  'store_payable',coalesce((select -sum(least(b,0)) from (select sum(amount) b from public.ledger_entries where party_type='store' group by party_id) x),0),
  'driver_receivable',coalesce((select sum(amount_due) from public.delivery_workers),0),
  'driver_payable',coalesce((select -sum(least(b,0)) from (select sum(amount) b from public.ledger_entries where party_type='driver' group by party_id) x),0),
  'pending_requests',(select count(*) from public.payment_requests where status='pending'));
end $$;
revoke all on function public.admin_finance_summary(timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_finance_summary(timestamptz,timestamptz) to authenticated;

create or replace function public.admin_balances() returns jsonb language sql stable security definer set search_path='' as $$
 select case when not public.is_admin() then null else jsonb_build_object(
  'stores',coalesce((select jsonb_agg(jsonb_build_object('store_id',s.id,'name',s.name,'balance',coalesce(b.v,0),'plan',(private.store_plan(s.id)).name)) from public.stores s left join (select party_id,sum(amount) v from public.ledger_entries where party_type='store' group by party_id) b on b.party_id=s.id where s.approved),'[]'),
  'drivers',coalesce((select jsonb_agg(jsonb_build_object('user_id',w.user_id,'name',coalesce(d.full_name,p.full_name),'amount_due',w.amount_due,'credit',-coalesce(b.v,0))) from public.delivery_workers w join public.profiles p on p.id=w.user_id left join public.driver_profiles d on d.user_id=w.user_id left join (select party_id,sum(amount) v from public.ledger_entries where party_type='driver' group by party_id) b on b.party_id=w.user_id),'[]')) end
$$;
revoke all on function public.admin_balances() from public,anon;
grant execute on function public.admin_balances() to authenticated;

-- ===== Online payment intents (called by the payments Edge Function with the service role) =====
create or replace function public.payment_create_intent(p_user uuid,p_purpose text,p_refs uuid[],p_provider text) returns public.payment_intents language plpgsql security definer set search_path='' as $$
declare amount integer; v public.payment_intents%rowtype; enabled jsonb;
begin
 select payment_methods into enabled from public.platform_settings;
 if coalesce((enabled->>p_provider)::boolean,false) is false then raise exception 'payment method disabled'; end if;
 if cardinality(p_refs) not between 1 and 30 then raise exception 'invalid reference'; end if;
 if p_purpose='order' then
  if exists(select 1 from public.orders where id=any(p_refs) and (buyer_id<>p_user or payment_status<>'unpaid' or status='cancelled')) or (select count(*) from public.orders where id=any(p_refs))<>cardinality(p_refs) then raise exception 'orders not payable'; end if;
  select sum(total) into amount from public.orders where id=any(p_refs);
  update public.orders set payment_method=p_provider where id=any(p_refs);
 elsif p_purpose='subscription' then
  select sum(x.amount) into amount from public.store_subscriptions x join public.stores s on s.id=x.store_id where x.id=any(p_refs) and x.status='pending' and s.owner_id=p_user;
 elsif p_purpose='promotion' then
  select sum(x.amount) into amount from public.promotions x join public.stores s on s.id=x.store_id where x.id=any(p_refs) and x.status='pending' and s.owner_id=p_user;
 elsif p_purpose='dues' then
  select greatest(private.store_balance(s.id),0) into amount from public.stores s where s.id=p_refs[1] and s.owner_id=p_user;
 else raise exception 'invalid purpose'; end if;
 if amount is null or amount<250 then raise exception 'nothing to pay'; end if;
 insert into public.payment_intents(user_id,purpose,ref_ids,amount,provider) values(p_user,p_purpose,p_refs,amount,p_provider) returning * into v;
 return v;
end $$;
revoke all on function public.payment_create_intent(uuid,text,uuid[],text) from public,anon,authenticated;
grant execute on function public.payment_create_intent(uuid,text,uuid[],text) to service_role;

create or replace function public.payment_complete_intent(p_intent uuid,p_paid boolean,p_provider_ref text,p_details jsonb) returns public.payment_intents language plpgsql security definer set search_path='' as $$
declare v public.payment_intents%rowtype; r uuid;
begin
 select * into v from public.payment_intents where id=p_intent for update;
 if not found then raise exception 'unknown intent'; end if;
 if v.status<>'created' then return v; end if;
 update public.payment_intents set status=case when p_paid then 'paid' else 'failed' end,provider_ref=p_provider_ref,details=coalesce(p_details,'{}'),paid_at=case when p_paid then now() end where id=p_intent returning * into v;
 if not p_paid then return v; end if;
 if v.purpose='order' then
  update public.orders set payment_status=case when status='cancelled' then 'refund_due' else 'paid' end where id=any(v.ref_ids) and payment_status='unpaid';
 elsif v.purpose='subscription' then foreach r in array v.ref_ids loop perform private.activate_subscription(r); end loop;
 elsif v.purpose='promotion' then foreach r in array v.ref_ids loop perform private.activate_promotion(r); end loop;
 elsif v.purpose='dues' then insert into public.ledger_entries(party_type,party_id,kind,amount,note) values('store',v.ref_ids[1],'settlement',-v.amount,'تسديد إلكتروني · '||coalesce(p_provider_ref,''));
 end if;
 return v;
end $$;
revoke all on function public.payment_complete_intent(uuid,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_complete_intent(uuid,boolean,text,jsonb) to service_role;

grant usage on schema private to authenticated;
notify pgrst,'reload schema';
