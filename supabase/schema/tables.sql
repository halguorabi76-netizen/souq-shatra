-- Snapshot of the production public schema (tables, constraints, indexes, RLS policies),
-- read from project nbktyynshqldyerqtjrd on 2026-10-14 before the revenue migration.
-- Reference only: the live database is the source of truth. Do not run against production.
-- Functions and triggers are not included; see db/*.sql and supabase/migrations/.

create table public.account_notifications (
  id uuid default gen_random_uuid() not null,
  recipient_id uuid not null,
  event_key text not null,
  event_kind text not null,
  title text not null,
  body text default ''::text not null,
  order_id uuid,
  product_id uuid,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint account_notifications_recipient_id_event_key_key UNIQUE (recipient_id, event_key),
  constraint account_notifications_pkey PRIMARY KEY (id),
  constraint account_notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  constraint account_notifications_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  constraint account_notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX account_notifications_inbox_idx ON public.account_notifications USING btree (recipient_id, created_at DESC);
CREATE INDEX account_notifications_product_idx ON public.account_notifications USING btree (product_id);
CREATE INDEX account_notifications_order_idx ON public.account_notifications USING btree (order_id);
alter table public.account_notifications enable row level security;
create policy "recipient marks read" on public.account_notifications as permissive for update to authenticated using (((recipient_id = ( SELECT auth.uid() AS uid)) AND ( SELECT is_active_user() AS is_active_user))) with check (((recipient_id = ( SELECT auth.uid() AS uid)) AND ( SELECT is_active_user() AS is_active_user)));
create policy "recipient reads notifications" on public.account_notifications as permissive for select to authenticated using (((recipient_id = ( SELECT auth.uid() AS uid)) AND ( SELECT is_active_user() AS is_active_user)));

create table public.catalog_categories (
  id uuid default gen_random_uuid() not null,
  parent_id uuid,
  name text not null,
  active boolean default true not null,
  "position" integer default 0 not null,
  attributes jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint catalog_categories_pkey PRIMARY KEY (id),
  constraint catalog_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES catalog_categories(id),
  constraint catalog_categories_attributes_check CHECK ((jsonb_typeof(attributes) = 'array'::text)),
  constraint catalog_categories_check CHECK ((parent_id IS DISTINCT FROM id)),
  constraint catalog_categories_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 80)))
);
CREATE INDEX catalog_categories_parent_idx ON public.catalog_categories USING btree (parent_id);
alter table public.catalog_categories enable row level security;
create policy "catalog readable" on public.catalog_categories as permissive for select to anon,authenticated using (true);

create table public.customer_addresses (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  label text not null,
  recipient_name text not null,
  phone text not null,
  phone_secondary text,
  address text not null,
  zone_id text not null,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  created_at timestamp with time zone default now() not null,
  constraint customer_addresses_pkey PRIMARY KEY (id),
  constraint customer_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint customer_addresses_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES delivery_zones(id),
  constraint customer_addresses_address_check CHECK (((length(TRIM(BOTH FROM address)) >= 3) AND (length(TRIM(BOTH FROM address)) <= 500))),
  constraint customer_addresses_label_check CHECK (((length(TRIM(BOTH FROM label)) >= 2) AND (length(TRIM(BOTH FROM label)) <= 80))),
  constraint customer_addresses_latitude_check CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
  constraint customer_addresses_longitude_check CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))),
  constraint customer_addresses_phone_check CHECK ((phone ~ '^[0-9]{10,11}$'::text)),
  constraint customer_addresses_phone_secondary_check CHECK (((phone_secondary IS NULL) OR (phone_secondary ~ '^[0-9]{10,11}$'::text))),
  constraint customer_addresses_recipient_name_check CHECK (((length(TRIM(BOTH FROM recipient_name)) >= 2) AND (length(TRIM(BOTH FROM recipient_name)) <= 120)))
);
CREATE INDEX customer_addresses_owner ON public.customer_addresses USING btree (user_id, created_at DESC);
alter table public.customer_addresses enable row level security;
create policy addresses_delete on public.customer_addresses as permissive for delete to authenticated using (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT is_active_user() AS is_active_user)));
create policy addresses_insert on public.customer_addresses as permissive for insert to authenticated with check (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT is_active_user() AS is_active_user)));
create policy addresses_read on public.customer_addresses as permissive for select to authenticated using (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT is_active_user() AS is_active_user)));
create policy addresses_update on public.customer_addresses as permissive for update to authenticated using (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT is_active_user() AS is_active_user))) with check (((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT is_active_user() AS is_active_user)));

create table public.delivery_batches (
  id uuid default gen_random_uuid() not null,
  buyer_id uuid not null,
  request_id uuid not null,
  latitude double precision not null,
  longitude double precision not null,
  quote jsonb not null,
  order_ids uuid[] default '{}'::uuid[] not null,
  created_at timestamp with time zone default now() not null,
  constraint delivery_batches_buyer_id_request_id_key UNIQUE (buyer_id, request_id),
  constraint delivery_batches_pkey PRIMARY KEY (id),
  constraint delivery_batches_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id),
  constraint delivery_batches_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
  constraint delivery_batches_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)))
);
alter table public.delivery_batches enable row level security;
create policy batch_read on public.delivery_batches as permissive for select to authenticated using ((is_active_user() AND ((buyer_id = auth.uid()) OR is_admin())));

create table public.delivery_config (
  key text not null,
  value numeric not null,
  updated_at timestamp with time zone default now() not null,
  constraint delivery_config_pkey PRIMARY KEY (key),
  constraint delivery_config_value_check CHECK (((value >= (0)::numeric) AND (value <= (1000000)::numeric)))
);
alter table public.delivery_config enable row level security;
create policy config_read on public.delivery_config as permissive for select to authenticated using (is_active_user());

create table public.delivery_declines (
  driver_id uuid not null,
  order_id uuid not null,
  constraint delivery_declines_pkey PRIMARY KEY (driver_id, order_id),
  constraint delivery_declines_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES delivery_workers(user_id),
  constraint delivery_declines_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
alter table public.delivery_declines enable row level security;

create table public.delivery_events (
  id bigint generated always as identity not null,
  order_id uuid not null,
  buyer_id uuid not null,
  driver_id uuid,
  store_id uuid not null,
  actor_id uuid,
  kind text not null,
  stage text,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint delivery_events_pkey PRIMARY KEY (id),
  constraint delivery_events_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id),
  constraint delivery_events_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES profiles(id),
  constraint delivery_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id),
  constraint delivery_events_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id)
);
CREATE INDEX delivery_events_stats_idx ON public.delivery_events USING btree (kind, created_at, driver_id, store_id, buyer_id);
alter table public.delivery_events enable row level security;
create policy events_admin_read on public.delivery_events as permissive for select to authenticated using ((is_active_user() AND is_admin()));

create table public.delivery_payments (
  id uuid default gen_random_uuid() not null,
  driver_id uuid not null,
  amount integer not null,
  receipt text not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  reviewed_at timestamp with time zone,
  constraint delivery_payments_pkey PRIMARY KEY (id),
  constraint delivery_payments_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES delivery_workers(user_id),
  constraint delivery_payments_amount_check CHECK ((amount > 0)),
  constraint delivery_payments_receipt_check CHECK (((length(TRIM(BOTH FROM receipt)) >= 3) AND (length(TRIM(BOTH FROM receipt)) <= 400))),
  constraint delivery_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);
alter table public.delivery_payments enable row level security;
create policy "payments visible" on public.delivery_payments as permissive for select to authenticated using (((driver_id = ( SELECT auth.uid() AS uid)) OR is_admin()));

create table public.delivery_settings (
  id boolean default true not null,
  platform_fee integer default 0 not null,
  delivery_fee integer default 0 not null,
  qi_number text default ''::text not null,
  constraint delivery_settings_pkey PRIMARY KEY (id),
  constraint delivery_settings_delivery_fee_check CHECK ((delivery_fee >= 0)),
  constraint delivery_settings_id_check CHECK (id),
  constraint delivery_settings_platform_fee_check CHECK ((platform_fee >= 0))
);
alter table public.delivery_settings enable row level security;
create policy "fees visible" on public.delivery_settings as permissive for select to anon,authenticated using (true);

create table public.delivery_tracking (
  order_id uuid not null,
  stage text default 'NEW'::text not null,
  store_accepted_at timestamp with time zone,
  ready_at timestamp with time zone,
  driver_accepted_at timestamp with time zone,
  picked_up_at timestamp with time zone,
  on_the_way_at timestamp with time zone,
  delivered_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  last_status_at timestamp with time zone default now() not null,
  queue_rank integer,
  started_at timestamp with time zone,
  late_reported_at timestamp with time zone,
  accepted_driver_id uuid,
  prep_time_snapshot integer,
  updated_at timestamp with time zone default now() not null,
  constraint delivery_tracking_pkey PRIMARY KEY (order_id),
  constraint delivery_tracking_accepted_driver_id_fkey FOREIGN KEY (accepted_driver_id) REFERENCES profiles(id),
  constraint delivery_tracking_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE INDEX delivery_queue_idx ON public.delivery_tracking USING btree (accepted_driver_id, queue_rank);
alter table public.delivery_tracking enable row level security;
create policy tracking_read on public.delivery_tracking as permissive for select to authenticated using ((is_active_user() AND (EXISTS ( SELECT 1 FROM orders o WHERE ((o.id = delivery_tracking.order_id) AND ((o.buyer_id = auth.uid()) OR (o.driver_id = auth.uid()) OR owns_store(o.store_id) OR is_admin()))))));

create table public.delivery_workers (
  user_id uuid not null,
  approved boolean default false not null,
  amount_due integer default 0 not null,
  debt_limit integer default 5000 not null,
  created_at timestamp with time zone default now() not null,
  constraint delivery_workers_pkey PRIMARY KEY (user_id),
  constraint delivery_workers_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id),
  constraint delivery_workers_amount_due_check CHECK ((amount_due >= 0)),
  constraint delivery_workers_debt_limit_check CHECK ((debt_limit > 0))
);
alter table public.delivery_workers enable row level security;
create policy "worker sees self or admin" on public.delivery_workers as permissive for select to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));

create table public.delivery_zones (
  id text not null,
  name text not null,
  fee integer not null,
  enabled boolean default true not null,
  constraint delivery_zones_pkey PRIMARY KEY (id),
  constraint delivery_zones_fee_check CHECK (((fee >= 0) AND (fee <= 100000))),
  constraint delivery_zones_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 80)))
);
alter table public.delivery_zones enable row level security;
create policy "published delivery zones" on public.delivery_zones as permissive for select to anon,authenticated using ((enabled OR (is_admin() AND is_active_user())));

create table public.driver_profiles (
  user_id uuid not null,
  full_name text not null,
  phone text not null,
  email text not null,
  address text not null,
  vehicle text not null,
  updated_at timestamp with time zone default now() not null,
  constraint driver_profiles_pkey PRIMARY KEY (user_id),
  constraint driver_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  constraint driver_profiles_address_check CHECK (((length(TRIM(BOTH FROM address)) >= 3) AND (length(TRIM(BOTH FROM address)) <= 500))),
  constraint driver_profiles_full_name_check CHECK (((length(TRIM(BOTH FROM full_name)) >= 2) AND (length(TRIM(BOTH FROM full_name)) <= 160))),
  constraint driver_profiles_phone_check CHECK ((phone ~ '^[0-9]{10,15}$'::text)),
  constraint driver_profiles_vehicle_check CHECK (((length(TRIM(BOTH FROM vehicle)) >= 2) AND (length(TRIM(BOTH FROM vehicle)) <= 160)))
);
alter table public.driver_profiles enable row level security;
create policy "driver profile private" on public.driver_profiles as permissive for select to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));

create table public.order_customer_actions (
  order_id uuid not null,
  buyer_id uuid not null,
  hidden_at timestamp with time zone,
  request_kind text,
  reason text default ''::text not null,
  updated_at timestamp with time zone default now() not null,
  constraint order_customer_actions_pkey PRIMARY KEY (order_id),
  constraint order_customer_actions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id),
  constraint order_customer_actions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  constraint order_customer_actions_reason_check CHECK ((length(reason) <= 500)),
  constraint order_customer_actions_request_kind_check CHECK ((request_kind = ANY (ARRAY['cancel'::text, 'return'::text])))
);
alter table public.order_customer_actions enable row level security;
create policy customer_actions_read on public.order_customer_actions as permissive for select to authenticated using ((is_active_user() AND ((buyer_id = ( SELECT auth.uid() AS uid)) OR is_admin() OR (EXISTS ( SELECT 1 FROM orders o WHERE ((o.id = order_customer_actions.order_id) AND owns_store(o.store_id)))))));

create table public.order_items (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  product_id uuid,
  product_name text not null,
  price integer not null,
  quantity integer not null,
  variant_id uuid,
  variant_snapshot jsonb default '{}'::jsonb not null,
  constraint order_items_pkey PRIMARY KEY (id),
  constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  constraint order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  constraint order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  constraint order_items_quantity_check CHECK ((quantity > 0))
);
CREATE INDEX order_items_variant_idx ON public.order_items USING btree (variant_id);
alter table public.order_items enable row level security;
create policy "driver reads assigned items" on public.order_items as permissive for select to authenticated using ((EXISTS ( SELECT 1 FROM orders o WHERE ((o.id = order_items.order_id) AND (o.driver_id = ( SELECT auth.uid() AS uid))))));
create policy "participants read items" on public.order_items as permissive for select to authenticated using ((EXISTS ( SELECT 1 FROM orders o WHERE ((o.id = order_items.order_id) AND ((o.buyer_id = ( SELECT auth.uid() AS uid)) OR owns_store(o.store_id) OR is_admin())))));

create table public.orders (
  id uuid default gen_random_uuid() not null,
  buyer_id uuid not null,
  store_id uuid not null,
  customer_name text not null,
  customer_phone text not null,
  address text not null,
  note text default ''::text not null,
  total integer not null,
  status text default 'new'::text not null,
  created_at timestamp with time zone default now() not null,
  driver_id uuid,
  platform_fee integer default 0 not null,
  delivery_fee integer default 0 not null,
  delivery_zone_id text,
  delivery_zone_name text,
  delivery_batch_id uuid,
  constraint orders_pkey PRIMARY KEY (id),
  constraint orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id),
  constraint orders_delivery_batch_id_fkey FOREIGN KEY (delivery_batch_id) REFERENCES delivery_batches(id),
  constraint orders_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES delivery_workers(user_id),
  constraint orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id),
  constraint orders_delivery_fee_check CHECK ((delivery_fee >= 0)),
  constraint orders_platform_fee_check CHECK ((platform_fee >= 0)),
  constraint orders_status_check CHECK ((status = ANY (ARRAY['new'::text, 'accepted'::text, 'delivery'::text, 'delivered'::text, 'cancelled'::text]))),
  constraint orders_total_check CHECK ((total > 0))
);
CREATE INDEX orders_driver_index ON public.orders USING btree (driver_id, created_at DESC);
CREATE INDEX orders_buyer_id_created_at_idx ON public.orders USING btree (buyer_id, created_at DESC);
CREATE INDEX orders_delivery_batch_idx ON public.orders USING btree (delivery_batch_id);
CREATE INDEX orders_store_id_created_at_idx ON public.orders USING btree (store_id, created_at DESC);
alter table public.orders enable row level security;
create policy "driver reads assigned order" on public.orders as permissive for select to authenticated using ((driver_id = ( SELECT auth.uid() AS uid)));
create policy "participants read orders" on public.orders as permissive for select to authenticated using (((buyer_id = ( SELECT auth.uid() AS uid)) OR owns_store(store_id) OR is_admin()));

create table public.product_interactions (
  user_id uuid not null,
  product_id uuid not null,
  kind text not null,
  created_at timestamp with time zone default now() not null,
  constraint product_interactions_pkey PRIMARY KEY (user_id, product_id, kind),
  constraint product_interactions_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  constraint product_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  constraint product_interactions_kind_check CHECK ((kind = ANY (ARRAY['favorite'::text, 'like'::text])))
);
CREATE INDEX product_interactions_product_idx ON public.product_interactions USING btree (product_id);
alter table public.product_interactions enable row level security;
create policy "own interactions add" on public.product_interactions as permissive for insert to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT is_active_user() AS is_active_user) AND (EXISTS ( SELECT 1 FROM (products p JOIN stores s ON ((s.id = p.store_id))) WHERE ((p.id = product_interactions.product_id) AND p.active AND (NOT p.blocked) AND s.approved AND (NOT s.removed) AND (s.owner_id <> auth.uid()))))));
create policy "own interactions read" on public.product_interactions as permissive for select to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "own interactions remove" on public.product_interactions as permissive for delete to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));

create table public.product_stock_movements (
  id uuid default gen_random_uuid() not null,
  store_id uuid not null,
  product_id uuid,
  variant_id uuid,
  product_name text not null,
  variant_label text default ''::text not null,
  delta integer not null,
  balance integer not null,
  reason text not null,
  actor_id uuid,
  order_id uuid,
  created_at timestamp with time zone default now() not null,
  constraint product_stock_movements_pkey PRIMARY KEY (id),
  constraint product_stock_movements_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  constraint product_stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  constraint product_stock_movements_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id),
  constraint product_stock_movements_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);
CREATE INDEX product_stock_movements_order_idx ON public.product_stock_movements USING btree (order_id);
CREATE INDEX product_stock_movements_product_idx ON public.product_stock_movements USING btree (product_id);
CREATE INDEX product_stock_movements_store_idx ON public.product_stock_movements USING btree (store_id, created_at DESC);
CREATE INDEX product_stock_movements_variant_idx ON public.product_stock_movements USING btree (variant_id);
alter table public.product_stock_movements enable row level security;
create policy "seller inventory history" on public.product_stock_movements as permissive for select to authenticated using (can_manage_approved_store(store_id));

create table public.product_variants (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  attributes jsonb default '{}'::jsonb not null,
  label text default ''::text not null,
  sku text default ''::text not null,
  barcode text default ''::text not null,
  price integer not null,
  sale_price integer,
  stock integer default 0 not null,
  image_path text,
  available boolean default true not null,
  weight numeric,
  archived boolean default false not null,
  version integer default 1 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint product_variants_pkey PRIMARY KEY (id),
  constraint product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  constraint product_variants_attributes_check CHECK ((jsonb_typeof(attributes) = 'object'::text)),
  constraint product_variants_barcode_check CHECK ((length(barcode) <= 80)),
  constraint product_variants_check CHECK (((sale_price > 0) AND (sale_price < price))),
  constraint product_variants_price_check CHECK ((price > 0)),
  constraint product_variants_sku_check CHECK ((length(sku) <= 80)),
  constraint product_variants_stock_check CHECK ((stock >= 0)),
  constraint product_variants_weight_check CHECK ((weight >= (0)::numeric))
);
CREATE INDEX product_variants_product_idx ON public.product_variants USING btree (product_id);
CREATE UNIQUE INDEX product_variants_sku_idx ON public.product_variants USING btree (product_id, sku) WHERE ((sku <> ''::text) AND (NOT archived));
CREATE INDEX product_variants_barcode_idx ON public.product_variants USING btree (barcode) WHERE (barcode <> ''::text);
CREATE UNIQUE INDEX product_variants_identity_idx ON public.product_variants USING btree (product_id, attributes) WHERE (NOT archived);
alter table public.product_variants enable row level security;
create policy "visible variants" on public.product_variants as permissive for select to anon,authenticated using ((EXISTS ( SELECT 1 FROM products p WHERE ((p.id = product_variants.product_id) AND (owns_store(p.store_id) OR is_admin() OR (p.active AND (NOT p.blocked) AND (NOT product_variants.archived) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = p.store_id) AND s.approved AND (NOT s.removed))))))))));

create table public.products (
  id uuid default gen_random_uuid() not null,
  store_id uuid not null,
  name text not null,
  description text default ''::text not null,
  category text default 'أخرى'::text not null,
  price integer not null,
  stock integer default 0 not null,
  image_path text,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  blocked boolean default false not null,
  sku text default ''::text not null,
  variant text default ''::text not null,
  low_stock_threshold integer default 5 not null,
  compare_at_price integer,
  store_category text,
  catalog_category_id uuid,
  attributes jsonb default '{}'::jsonb not null,
  has_variants boolean default false not null,
  legacy_stock_reserve integer default 0 not null,
  constraint products_pkey PRIMARY KEY (id),
  constraint products_catalog_category_id_fkey FOREIGN KEY (catalog_category_id) REFERENCES catalog_categories(id),
  constraint products_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  constraint product_compare_price_above_sale CHECK (((compare_at_price IS NULL) OR (compare_at_price > price))),
  constraint products_attributes_check CHECK ((jsonb_typeof(attributes) = 'object'::text)),
  constraint products_legacy_stock_reserve_check CHECK ((legacy_stock_reserve >= 0)),
  constraint products_low_stock_threshold_check CHECK ((low_stock_threshold >= 0)),
  constraint products_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 150))),
  constraint products_price_check CHECK ((price > 0)),
  constraint products_stock_check CHECK ((stock >= 0)),
  constraint products_store_category_check CHECK ((length(store_category) <= 80))
);
CREATE INDEX products_store_id_idx ON public.products USING btree (store_id);
CREATE INDEX products_catalog_category_idx ON public.products USING btree (catalog_category_id);
alter table public.products enable row level security;
create policy "approved seller delete gate" on public.products as restrictive for delete to authenticated using (can_manage_approved_store(store_id));
create policy "approved seller delete restriction" on public.products as restrictive for delete to authenticated using (can_manage_approved_store(store_id));
create policy "approved seller insert gate" on public.products as restrictive for insert to authenticated with check (can_manage_approved_store(store_id));
create policy "approved seller insert restriction" on public.products as restrictive for insert to authenticated with check (can_manage_approved_store(store_id));
create policy "approved seller update gate" on public.products as restrictive for update to authenticated using (can_manage_approved_store(store_id)) with check (can_manage_approved_store(store_id));
create policy "approved seller update restriction" on public.products as restrictive for update to authenticated using (can_manage_approved_store(store_id)) with check (can_manage_approved_store(store_id));
create policy "public approved products" on public.products as permissive for select to anon,authenticated using (((active AND (NOT blocked) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = products.store_id) AND s.approved AND (NOT s.removed))))) OR owns_store(store_id) OR is_admin()));
create policy "seller adds products" on public.products as permissive for insert to authenticated with check ((is_active_user() AND owns_store(store_id) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = products.store_id) AND (NOT s.removed))))));
create policy "seller deletes products" on public.products as permissive for delete to authenticated using ((is_active_user() AND owns_store(store_id) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = products.store_id) AND (NOT s.removed))))));
create policy "seller updates products" on public.products as permissive for update to authenticated using ((is_active_user() AND owns_store(store_id) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = products.store_id) AND (NOT s.removed)))))) with check ((is_active_user() AND owns_store(store_id) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = products.store_id) AND (NOT s.removed))))));

create table public.profiles (
  id uuid not null,
  role text default 'buyer'::text not null,
  full_name text default ''::text not null,
  phone text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  disabled boolean default false not null,
  username text,
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint professional_username_format CHECK (((username IS NULL) OR (username ~ '^[a-z][a-z0-9_]{2,29}$'::text))),
  constraint profiles_role_check CHECK ((role = ANY (ARRAY['buyer'::text, 'seller'::text, 'driver'::text, 'admin'::text])))
);
CREATE UNIQUE INDEX professional_username_unique ON public.profiles USING btree (lower(username)) WHERE (username IS NOT NULL);
alter table public.profiles enable row level security;
create policy "profile self or admin read" on public.profiles as permissive for select to authenticated using (((id = ( SELECT auth.uid() AS uid)) OR is_admin()));
create policy "profile self update" on public.profiles as permissive for update to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check ((id = ( SELECT auth.uid() AS uid)));

create table public.seller_categories (
  id uuid default gen_random_uuid() not null,
  store_id uuid not null,
  name text not null,
  active boolean default true not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint seller_categories_store_id_name_key UNIQUE (store_id, name),
  constraint seller_categories_pkey PRIMARY KEY (id),
  constraint seller_categories_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  constraint seller_categories_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
);
alter table public.seller_categories enable row level security;
create policy categories_add on public.seller_categories as permissive for insert to authenticated with check (can_manage_approved_store(store_id));
create policy categories_edit on public.seller_categories as permissive for update to authenticated using (can_manage_approved_store(store_id)) with check (can_manage_approved_store(store_id));
create policy categories_public on public.seller_categories as permissive for select to anon,authenticated using ((active AND (deleted_at IS NULL) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = seller_categories.store_id) AND s.approved AND (NOT s.removed))))));
create policy categories_read on public.seller_categories as permissive for select to authenticated using (can_manage_approved_store(store_id));

create table public.seller_customers (
  id uuid default gen_random_uuid() not null,
  store_id uuid not null,
  customer_key text not null,
  buyer_id uuid,
  name text not null,
  phone text default ''::text not null,
  address text default ''::text not null,
  province text default ''::text not null,
  customer_group text default ''::text not null,
  tags text[] default '{}'::text[] not null,
  note text default ''::text not null,
  blocked boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint seller_customers_store_id_customer_key_key UNIQUE (store_id, customer_key),
  constraint seller_customers_pkey PRIMARY KEY (id),
  constraint seller_customers_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE SET NULL,
  constraint seller_customers_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  constraint seller_customers_address_check CHECK ((length(address) <= 500)),
  constraint seller_customers_check CHECK (((NOT blocked) OR (buyer_id IS NOT NULL))),
  constraint seller_customers_customer_group_check CHECK ((length(customer_group) <= 80)),
  constraint seller_customers_customer_key_check CHECK (((length(customer_key) >= 1) AND (length(customer_key) <= 100))),
  constraint seller_customers_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 120))),
  constraint seller_customers_note_check CHECK ((length(note) <= 2000)),
  constraint seller_customers_phone_check CHECK ((length(phone) <= 40)),
  constraint seller_customers_province_check CHECK ((length(province) <= 80)),
  constraint seller_customers_tags_check CHECK ((cardinality(tags) <= 20))
);
alter table public.seller_customers enable row level security;
create policy customers_add on public.seller_customers as permissive for insert to authenticated with check ((can_manage_approved_store(store_id) AND ((buyer_id IS NULL) OR (EXISTS ( SELECT 1 FROM orders o WHERE ((o.store_id = seller_customers.store_id) AND (o.buyer_id = seller_customers.buyer_id)))))));
create policy customers_edit on public.seller_customers as permissive for update to authenticated using (can_manage_approved_store(store_id)) with check (can_manage_approved_store(store_id));
create policy customers_read on public.seller_customers as permissive for select to authenticated using (can_manage_approved_store(store_id));

create table public.seller_workspace_settings (
  store_id uuid not null,
  settings jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  constraint seller_workspace_settings_pkey PRIMARY KEY (store_id),
  constraint seller_workspace_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  constraint seller_workspace_settings_settings_check CHECK (((jsonb_typeof(settings) = 'object'::text) AND (octet_length((settings)::text) <= 16000)))
);
alter table public.seller_workspace_settings enable row level security;
create policy "approved owner adds workspace" on public.seller_workspace_settings as permissive for insert to authenticated with check (can_manage_approved_store(store_id));
create policy "approved owner edits workspace" on public.seller_workspace_settings as permissive for update to authenticated using (can_manage_approved_store(store_id)) with check (can_manage_approved_store(store_id));
create policy "approved owner reads workspace" on public.seller_workspace_settings as permissive for select to authenticated using (can_manage_approved_store(store_id));

create table public.store_pickups (
  store_id uuid not null,
  pickup_address text not null,
  latitude double precision,
  longitude double precision,
  constraint store_pickups_pkey PRIMARY KEY (store_id),
  constraint store_pickups_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  constraint store_pickups_pickup_address_check CHECK (((length(TRIM(BOTH FROM pickup_address)) >= 3) AND (length(TRIM(BOTH FROM pickup_address)) <= 500))),
  constraint valid_pickup_coordinates CHECK ((((latitude IS NULL) AND (longitude IS NULL)) OR ((latitude IS NOT NULL) AND (longitude IS NOT NULL) AND ((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)) AND ((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)))))
);
alter table public.store_pickups enable row level security;
create policy "owner reads pickup" on public.store_pickups as permissive for select to authenticated using (((EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_pickups.store_id) AND (s.owner_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin)));

create table public.stores (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  name text not null,
  description text default ''::text not null,
  address text default ''::text not null,
  phone text default ''::text not null,
  social_url text default ''::text not null,
  approved boolean default false not null,
  created_at timestamp with time zone default now() not null,
  removed boolean default false not null,
  storefront_settings jsonb default '{}'::jsonb not null,
  image_path text,
  store_kind text,
  username text,
  verified boolean default false not null,
  prep_time_min integer,
  constraint stores_owner_id_key UNIQUE (owner_id),
  constraint stores_pkey PRIMARY KEY (id),
  constraint stores_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
  constraint physical_store_address_required CHECK (((store_kind IS DISTINCT FROM 'physical'::text) OR ((address IS NOT NULL) AND ((length(TRIM(BOTH FROM address)) >= 3) AND (length(TRIM(BOTH FROM address)) <= 500))))),
  constraint store_image_own_folder CHECK (((image_path IS NULL) OR ((length(image_path) <= 400) AND (image_path ~~ ((id)::text || '/%'::text)) AND (image_path ~ '^[a-zA-Z0-9/_\.\-]+$'::text)))),
  constraint stores_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 100))),
  constraint stores_prep_time_min_check CHECK (((prep_time_min >= 0) AND (prep_time_min <= 1440))),
  constraint stores_store_kind_check CHECK ((store_kind = ANY (ARRAY['physical'::text, 'online'::text])))
);
CREATE UNIQUE INDEX store_username_unique ON public.stores USING btree (lower(username)) WHERE (username IS NOT NULL);
alter table public.stores enable row level security;
create policy "admin approves store" on public.stores as permissive for update to authenticated using (is_admin()) with check (is_admin());
create policy "approved seller store edit gate" on public.stores as restrictive for update to authenticated using (can_manage_approved_store(id)) with check (can_manage_approved_store(id));
create policy "owner edits store" on public.stores as permissive for update to authenticated using ((owner_id = ( SELECT auth.uid() AS uid))) with check ((owner_id = ( SELECT auth.uid() AS uid)));
create policy "public approved stores" on public.stores as permissive for select to anon,authenticated using (((approved AND (NOT removed)) OR (owner_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
