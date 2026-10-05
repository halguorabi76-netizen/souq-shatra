-- Additive catalog and independent inventory; historical products/orders stay intact.
create table public.catalog_categories (
 id uuid primary key default gen_random_uuid(), parent_id uuid references public.catalog_categories(id),
 name text not null check(length(trim(name)) between 2 and 80), active boolean not null default true,
 position integer not null default 0, attributes jsonb not null default '[]' check(jsonb_typeof(attributes)='array'),
 created_at timestamptz not null default now(), check(parent_id is distinct from id)
);
create index catalog_categories_parent_idx on public.catalog_categories(parent_id);
alter table public.catalog_categories enable row level security;
revoke all on public.catalog_categories from anon,authenticated;
grant select on public.catalog_categories to anon,authenticated;
create policy "catalog readable" on public.catalog_categories for select to anon,authenticated using(true);
alter table public.products add column store_category text check(length(store_category)<=80), add column catalog_category_id uuid references public.catalog_categories(id), add column attributes jsonb not null default '{}' check(jsonb_typeof(attributes)='object'), add column has_variants boolean not null default false, add column legacy_stock_reserve integer not null default 0 check(legacy_stock_reserve>=0);
create index products_catalog_category_idx on public.products(catalog_category_id);
create table public.product_variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
 attributes jsonb not null default '{}' check(jsonb_typeof(attributes)='object'), label text not null default '',
 sku text not null default '' check(length(sku)<=80), barcode text not null default '' check(length(barcode)<=80),
 price integer not null check(price>0), sale_price integer check(sale_price>0 and sale_price<price),
 stock integer not null default 0 check(stock>=0), image_path text, available boolean not null default true,
 weight numeric check(weight>=0), archived boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants(product_id);
create unique index product_variants_identity_idx on public.product_variants(product_id,attributes) where not archived;
create unique index product_variants_sku_idx on public.product_variants(product_id,sku) where sku<>'' and not archived;
create index product_variants_barcode_idx on public.product_variants(barcode) where barcode<>'';
alter table public.product_variants enable row level security;
revoke all on public.product_variants from anon,authenticated;
grant select on public.product_variants to anon,authenticated;
create policy "visible variants" on public.product_variants for select to anon,authenticated using(exists(select 1 from public.products p where p.id=product_id and ((public.owns_store(p.store_id) or public.is_admin()) or (p.active and not p.blocked and not archived and exists(select 1 from public.stores s where s.id=p.store_id and s.approved and not s.removed)))));
alter table public.order_items add column variant_id uuid references public.product_variants(id) on delete set null, add column variant_snapshot jsonb not null default '{}';
create index order_items_variant_idx on public.order_items(variant_id);
create table public.product_stock_movements (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 product_id uuid references public.products(id) on delete set null, variant_id uuid references public.product_variants(id) on delete set null,
 product_name text not null, variant_label text not null default '', delta integer not null, balance integer not null,
 reason text not null, actor_id uuid, order_id uuid references public.orders(id) on delete set null, created_at timestamptz not null default now()
);
create index product_stock_movements_store_idx on public.product_stock_movements(store_id,created_at desc);
create index product_stock_movements_product_idx on public.product_stock_movements(product_id);
create index product_stock_movements_variant_idx on public.product_stock_movements(variant_id);
create index product_stock_movements_order_idx on public.product_stock_movements(order_id);
alter table public.product_stock_movements enable row level security;
revoke all on public.product_stock_movements from anon,authenticated;
grant select on public.product_stock_movements to authenticated;
create policy "seller inventory history" on public.product_stock_movements for select to authenticated using(public.can_manage_approved_store(store_id));

-- Privileged helpers live in the non-exposed private schema.
create or replace function private.catalog_definitions(p_category uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(parent.attributes,'[]'::jsonb)||c.attributes from public.catalog_categories c left join public.catalog_categories parent on parent.id=c.parent_id where c.id=p_category;
$$;
create or replace function private.validate_catalog_attributes(p_category uuid,p_values jsonb,p_variant boolean default false) returns void language plpgsql set search_path='' as $$
declare d jsonb; k text; v jsonb; defs jsonb;
begin
 if jsonb_typeof(p_values) is distinct from 'object' or octet_length(p_values::text)>20000 then raise exception 'invalid attributes'; end if;
 if p_category is null then if p_variant then raise exception 'category required for variants'; end if; return; end if;
 defs:=private.catalog_definitions(p_category);
 if defs is null then raise exception 'category unavailable'; end if;
 for k,v in select * from jsonb_each(p_values) loop
  select value into d from jsonb_array_elements(defs) where value->>'key'=k limit 1;
  if d is null then if p_variant then raise exception 'invalid attribute %',k; else continue; end if; end if;
  if p_variant and not coalesce((d->>'variant')::boolean,false) then raise exception 'invalid attribute %',k; end if;
  if jsonb_typeof(v)<>'string' or length(v#>>'{}')>500 then raise exception 'invalid attribute value'; end if;
  if d->>'type'='number' and (v#>>'{}')!~'^\d+(\.\d+)?$' then raise exception 'invalid numeric attribute'; end if;
  if d->>'type'='date' then perform (v#>>'{}')::date; end if;
  if d->>'type'='select' and jsonb_array_length(coalesce(d->'options','[]'))>0 and not (d->'options' ? (v#>>'{}')) then raise exception 'invalid attribute option'; end if;
 end loop;

end; $$;
create or replace function private.save_catalog_category(p_id uuid,p_parent uuid,p_name text,p_attributes jsonb,p_active boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); d jsonb; keys text[]:='{}';
begin
 if auth.uid() is null or not public.is_active_user() or not public.is_admin() then raise exception 'admin required'; end if;
 if p_active is null or jsonb_typeof(p_attributes) is distinct from 'array' or jsonb_array_length(p_attributes)>60 then raise exception 'invalid definitions'; end if;
 if p_parent is not null and not exists(select 1 from public.catalog_categories where id=p_parent and parent_id is null and id<>v_id) then raise exception 'invalid parent'; end if;
 if p_parent is not null and exists(select 1 from public.catalog_categories where parent_id=v_id) then raise exception 'category has children'; end if;
 for d in select value from jsonb_array_elements(p_attributes) loop
  if coalesce(d->>'key','')!~'^[a-z][a-z0-9_]{0,49}$' or length(coalesce(d->>'label','')) not between 1 and 80 or coalesce(d->>'type','') not in ('text','number','date','select') or jsonb_typeof(d->'variant') is distinct from 'boolean' or jsonb_typeof(d->'required') is distinct from 'boolean' or jsonb_typeof(d->'options') is distinct from 'array' or jsonb_array_length(d->'options')>100 or d->>'key'=any(keys) then raise exception 'invalid definition'; end if;
  if exists(select 1 from jsonb_array_elements(d->'options') v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>100) then raise exception 'invalid options'; end if;
  keys:=array_append(keys,d->>'key');
 end loop;
 if p_parent is not null and exists(select 1 from public.catalog_categories c,jsonb_array_elements(c.attributes) def(value) where c.id=p_parent and def.value->>'key'=any(keys)) then raise exception 'attribute already inherited'; end if;
 -- Removing a used variant axis would invalidate sellable identities; retain it or stop the category.
 if exists(select 1 from public.catalog_categories old,jsonb_array_elements(old.attributes) useddef(value) where old.id=v_id and coalesce((useddef.value->>'variant')::boolean,false) and not exists(select 1 from jsonb_array_elements(p_attributes) nd where nd->>'key'=useddef.value->>'key' and coalesce((nd->>'variant')::boolean,false)) and exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id left join public.catalog_categories c on c.id=p.catalog_category_id where (p.catalog_category_id=v_id or c.parent_id=v_id) and not v.archived and v.attributes ? (useddef.value->>'key'))) then raise exception 'variant attribute in use; keep definition'; end if;
 insert into public.catalog_categories(id,parent_id,name,attributes,active) values(v_id,p_parent,trim(p_name),p_attributes,p_active) on conflict(id) do update set parent_id=excluded.parent_id,name=excluded.name,attributes=excluded.attributes,active=excluded.active;
 return v_id;
end; $$;
revoke all on function private.save_catalog_category(uuid,uuid,text,jsonb,boolean) from public,anon;
grant execute on function private.save_catalog_category(uuid,uuid,text,jsonb,boolean) to authenticated;
create or replace function public.save_catalog_category(p_id uuid,p_parent uuid,p_name text,p_attributes jsonb,p_active boolean default true) returns uuid language sql security invoker set search_path='' as $$ select private.save_catalog_category(p_id,p_parent,p_name,p_attributes,p_active); $$;
revoke all on function public.save_catalog_category(uuid,uuid,text,jsonb,boolean) from public,anon;
grant execute on function public.save_catalog_category(uuid,uuid,text,jsonb,boolean) to authenticated;

create or replace function private.variant_inventory_version() returns trigger language plpgsql set search_path='' as $$
begin new.version:=case when tg_op='UPDATE' then old.version+1 else 1 end; new.updated_at:=now(); return new; end; $$;
create or replace function private.variant_inventory_after() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype; delta integer;
begin
 select * into p from public.products where id=new.product_id;
 delta:=new.stock-case when tg_op='UPDATE' then old.stock else 0 end;
 if delta<>0 then insert into public.product_stock_movements(store_id,product_id,variant_id,product_name,variant_label,delta,balance,reason,actor_id,order_id) values(p.store_id,p.id,new.id,p.name,new.label,delta,new.stock,coalesce(nullif(current_setting('souq.inventory_reason',true),''),'inventory_edit'),auth.uid(),nullif(current_setting('souq.inventory_order',true),'')::uuid); end if;
 update public.products set stock=coalesce((select sum(stock) from public.product_variants where product_id=new.product_id and not archived and available),0),price=coalesce((select min(coalesce(sale_price,price)) from public.product_variants where product_id=new.product_id and not archived),price),compare_at_price=null where id=new.product_id and has_variants;
 return new;
end; $$;
create trigger variant_inventory_before before insert or update on public.product_variants for each row execute function private.variant_inventory_version();
create trigger variant_inventory_after after insert or update on public.product_variants for each row execute function private.variant_inventory_after();
create or replace function private.product_inventory_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.has_variants and not new.has_variants and exists(select 1 from public.product_variants where product_id=old.id and not archived) then raise exception 'archive variants first'; end if;
 if new.has_variants then
 new.stock:=coalesce((select sum(stock) from public.product_variants where product_id=new.id and not archived and available),0);
 new.price:=coalesce((select min(coalesce(sale_price,price)) from public.product_variants where product_id=new.id and not archived),new.price); new.compare_at_price:=null;
 elsif tg_op='UPDATE' and new.stock<>old.stock then
 insert into public.product_stock_movements(store_id,product_id,product_name,delta,balance,reason,actor_id,order_id) values(new.store_id,new.id,new.name,new.stock-old.stock,new.stock,coalesce(nullif(current_setting('souq.inventory_reason',true),''),'inventory_edit'),auth.uid(),nullif(current_setting('souq.inventory_order',true),'')::uuid);
 end if;
 return new;
end; $$;
create trigger product_inventory_guard before update on public.products for each row execute function private.product_inventory_guard();

create or replace function private.save_product_bundle(p_id uuid,p_store uuid,p_product jsonb,p_variants jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); p public.products%rowtype; v jsonb; v_old public.product_variants%rowtype; v_vid uuid; ids uuid[]:='{}'; cid uuid; root_name text; hasv boolean; versions jsonb; d jsonb;
begin
 if auth.uid() is null or not public.can_manage_approved_store(p_store) then raise exception 'not permitted'; end if;
 if jsonb_typeof(p_product) is distinct from 'object' or jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants)>200 then raise exception 'invalid product bundle'; end if;
 select * into p from public.products where id=v_id for update;
 if p_id is not null and (not found or p.store_id<>p_store) then raise exception 'not permitted'; end if;
 cid:=nullif(p_product->>'catalog_category_id','')::uuid;
 if cid is not null then
 select coalesce(parent.name,c.name) into root_name from public.catalog_categories c left join public.catalog_categories parent on parent.id=c.parent_id where c.id=cid and c.active and coalesce(parent.active,true);
 if not found then raise exception 'category unavailable'; end if;
 end if;
 perform private.validate_catalog_attributes(cid,coalesce(p_product->'attributes','{}'));
 hasv:=jsonb_array_length(p_variants)>0;
 for d in select value from jsonb_array_elements(coalesce(private.catalog_definitions(cid),'[]')) loop
 if coalesce((d->>'required')::boolean,false) and coalesce(p_product->'attributes'->>(d->>'key'),'')='' and (not hasv or exists(select 1 from jsonb_array_elements(p_variants) ax(value) where not coalesce((ax.value->>'archived')::boolean,false) and coalesce(ax.value->'attributes'->>(d->>'key'),'')='')) then raise exception 'required attribute %',d->>'label'; end if;
 end loop;
 if p_id is not null and not p.has_variants and (p_product->>'expected_stock') is not null and p.stock<>(p_product->>'expected_stock')::integer then raise exception 'inventory changed; reload product'; end if;
 perform set_config('souq.inventory_reason','inventory_edit',true);perform set_config('souq.inventory_order','',true);
 select coalesce(jsonb_object_agg(id::text,version),'{}') into versions from public.product_variants where product_id=v_id;
 -- Existing identities remain alive; omissions are archived, never deleted.
 if p_id is not null then update public.product_variants set archived=true where product_id=v_id and not archived; end if;
 insert into public.products(id,store_id,name,description,category,price,compare_at_price,stock,image_path,sku,variant,low_stock_threshold,active,catalog_category_id,attributes,has_variants,store_category)
 values(v_id,p_store,p_product->>'name',coalesce(p_product->>'description',''),coalesce(root_name,p_product->>'category'),(p_product->>'price')::integer,(p_product->>'compare_at_price')::integer,coalesce((p_product->>'stock')::integer,0),p_product->>'image_path',coalesce(p_product->>'sku',''),coalesce(p_product->>'variant',''),coalesce((p_product->>'low_stock_threshold')::integer,5),coalesce((p_product->>'active')::boolean,true),cid,coalesce(p_product->'attributes','{}'),hasv,nullif(trim(p_product->>'store_category'),''))
 on conflict(id) do update set name=excluded.name,description=excluded.description,category=excluded.category,price=excluded.price,compare_at_price=excluded.compare_at_price,stock=excluded.stock,image_path=excluded.image_path,sku=excluded.sku,variant=excluded.variant,low_stock_threshold=excluded.low_stock_threshold,active=excluded.active,catalog_category_id=excluded.catalog_category_id,attributes=excluded.attributes,has_variants=excluded.has_variants,store_category=excluded.store_category;
 if nullif(trim(p_product->>'store_category'),'') is not null then insert into public.seller_categories(store_id,name) values(p_store,trim(p_product->>'store_category')) on conflict(store_id,name) do nothing; end if;
 for v in select value from jsonb_array_elements(p_variants) loop
 v_vid:=coalesce(nullif(v->>'id','')::uuid,gen_random_uuid());
 if v_vid=any(ids) then raise exception 'duplicate variant'; end if;
 select * into v_old from public.product_variants where id=v_vid;
 if found then
 if v_old.product_id<>v_id then raise exception 'foreign variant'; end if;
 -- Our archive operation increments version once; caller version is compared before that change.
 if (v->>'version') is null or (versions->>v_vid::text)::integer<>(v->>'version')::integer then raise exception 'inventory changed; reload product'; end if;
 end if;
 if not coalesce((v->>'archived')::boolean,false) then perform private.validate_catalog_attributes(cid,coalesce(v->'attributes','{}'),true); end if;
 if (select count(*) from jsonb_object_keys(coalesce(v->'attributes','{}')))=0 then raise exception 'variant options required'; end if;
 if length(coalesce(v->>'label',''))>500 then raise exception 'variant label too long'; end if;
 insert into public.product_variants(id,product_id,attributes,label,sku,barcode,price,sale_price,stock,image_path,available,weight,archived)
 values(v_vid,v_id,v->'attributes',coalesce(v->>'label',''),coalesce(v->>'sku',''),coalesce(v->>'barcode',''),(v->>'price')::integer,(v->>'sale_price')::integer,(v->>'stock')::integer,v->>'image_path',coalesce((v->>'available')::boolean,true),(v->>'weight')::numeric,coalesce((v->>'archived')::boolean,false))
 on conflict(id) do update set attributes=excluded.attributes,label=excluded.label,sku=excluded.sku,barcode=excluded.barcode,price=excluded.price,sale_price=excluded.sale_price,stock=excluded.stock,image_path=excluded.image_path,available=excluded.available,weight=excluded.weight,archived=excluded.archived;
 ids:=array_append(ids,v_vid);
 end loop;
 if hasv and not exists(select 1 from public.product_variants where product_id=v_id and not archived) then raise exception 'active variant required'; end if;
 return v_id;
end; $$;
revoke all on function private.save_product_bundle(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function private.save_product_bundle(uuid,uuid,jsonb,jsonb) to authenticated;
create or replace function public.save_product_bundle(p_id uuid,p_store uuid,p_product jsonb,p_variants jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.save_product_bundle(p_id,p_store,p_product,p_variants); $$;
revoke all on function public.save_product_bundle(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_product_bundle(uuid,uuid,jsonb,jsonb) to authenticated;

create or replace function public.place_order(p_store uuid,p_lines jsonb,p_name text,p_phone text,p_address text,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare v_order uuid; l jsonb; p public.products%rowtype; v public.product_variants%rowtype; qty integer; total bigint:=0; vid uuid; unit_price integer; snap jsonb;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required'; end if;
 if length(trim(coalesce(p_name,'')))<2 or length(trim(coalesce(p_phone,'')))<10 or length(trim(coalesce(p_address,'')))<3 then raise exception 'complete contact details'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'invalid basket'; end if;
 if not exists(select 1 from public.stores where id=p_store and approved and not removed) then raise exception 'store unavailable'; end if;
 if (select count(distinct (x->>'id')||':'||coalesce(x->>'variant_id','')) from jsonb_array_elements(p_lines) x)<>jsonb_array_length(p_lines) then raise exception 'duplicate product variant'; end if;
 -- Stable parent-first ordering shared by checkout, inventory edits and cancellation.
 for l in select value from jsonb_array_elements(p_lines) order by value->>'id',coalesce(value->>'variant_id','') loop
 qty:=(l->>'quantity')::integer;
 if qty is null or qty not between 1 and 100 then raise exception 'invalid quantity'; end if;
 select * into p from public.products where id=(l->>'id')::uuid and store_id=p_store and active and not blocked for update;
 if not found then raise exception 'product unavailable'; end if;
 vid:=nullif(l->>'variant_id','')::uuid;
 if p.has_variants then
 select * into v from public.product_variants where id=vid and product_id=p.id and available and not archived for update;
 if not found or v.stock<qty then raise exception 'product unavailable'; end if;
 unit_price:=coalesce(v.sale_price,v.price);
 else
 if vid is not null or p.stock<qty then raise exception 'product unavailable'; end if;
 unit_price:=p.price;
 end if;
 total:=total+unit_price::bigint*qty;
 end loop;
 if total>2000000000 then raise exception 'total too large'; end if;
 insert into public.orders(buyer_id,store_id,customer_name,customer_phone,address,note,total) values(auth.uid(),p_store,trim(p_name),trim(p_phone),trim(p_address),coalesce(p_note,''),total) returning id into v_order;
 perform set_config('souq.inventory_reason','order',true);perform set_config('souq.inventory_order',v_order::text,true);
 for l in select value from jsonb_array_elements(p_lines) order by value->>'id',coalesce(value->>'variant_id','') loop
 qty:=(l->>'quantity')::integer;select * into p from public.products where id=(l->>'id')::uuid;vid:=nullif(l->>'variant_id','')::uuid;snap:='{}';
 if p.has_variants then
 select * into v from public.product_variants where id=vid;
 unit_price:=coalesce(v.sale_price,v.price);snap:=jsonb_build_object('label',v.label,'attributes',v.attributes,'sku',v.sku,'barcode',v.barcode,'weight',v.weight,'image_path',v.image_path);
 update public.product_variants set stock=stock-qty where id=vid;
 else unit_price:=p.price;update public.products set stock=stock-qty where id=p.id; end if;
 insert into public.order_items(order_id,product_id,product_name,price,quantity,variant_id,variant_snapshot) values(v_order,p.id,p.name||case when p.has_variants then ' — '||v.label when p.variant<>'' then ' — '||p.variant else '' end,unit_price,qty,vid,snap);
 end loop;
 return v_order;
end; $$;
revoke all on function public.place_order(uuid,jsonb,text,text,text,text) from public,anon;
grant execute on function public.place_order(uuid,jsonb,text,text,text,text) to authenticated;

create or replace function public.set_order_status(p_order uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; i record;
begin
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'order not found'; end if;
 if auth.uid() is null or not public.is_active_user() or not (public.is_admin() or public.owns_store(o.store_id)) then raise exception 'not permitted'; end if;
 if not ((o.status='new' and p_status in ('accepted','cancelled')) or (o.status='accepted' and p_status='cancelled' and (o.driver_id is null or public.is_admin())) or (o.driver_id is null and o.status='delivery' and p_status='cancelled')) then raise exception 'invalid transition'; end if;
 update public.orders set status=p_status,driver_id=case when p_status='cancelled' then null else driver_id end where id=p_order;
 if p_status='cancelled' then
 perform set_config('souq.inventory_reason','cancelled_order',true);perform set_config('souq.inventory_order',p_order::text,true);
 for i in select product_id,variant_id,sum(quantity)::integer qty from public.order_items where order_id=p_order and product_id is not null group by product_id,variant_id order by product_id,variant_id loop
 perform 1 from public.products where id=i.product_id for update;
 if i.variant_id is not null then update public.product_variants set stock=stock+i.qty where id=i.variant_id and product_id=i.product_id;
 elsif not exists(select 1 from public.products where id=i.product_id and has_variants) then update public.products set stock=stock+i.qty where id=i.product_id;
 else
 -- Old orders predating conversion retain a separate legacy reserve; never credit an arbitrary size.
 update public.products set legacy_stock_reserve=legacy_stock_reserve+i.qty where id=i.product_id;
 insert into public.product_stock_movements(store_id,product_id,product_name,delta,balance,reason,actor_id,order_id) select store_id,id,name,i.qty,legacy_stock_reserve,'legacy_cancel_after_conversion',auth.uid(),p_order from public.products where id=i.product_id;
 end if;
 end loop;
 end if;
end; $$;
revoke all on function public.set_order_status(uuid,text) from public,anon;
grant execute on function public.set_order_status(uuid,text) to authenticated;
revoke all on function private.catalog_definitions(uuid),private.validate_catalog_attributes(uuid,jsonb,boolean),private.variant_inventory_version(),private.variant_inventory_after(),private.product_inventory_guard() from public,anon,authenticated;

create or replace function private.allocate_legacy_variant_stock(p_product uuid,p_variant uuid,p_quantity integer) returns void language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype; v public.product_variants%rowtype;
begin
 select * into p from public.products where id=p_product for update;
 if not found or auth.uid() is null or not public.can_manage_approved_store(p.store_id) then raise exception 'not permitted'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>p.legacy_stock_reserve then raise exception 'invalid reserve quantity'; end if;
 select * into v from public.product_variants where id=p_variant and product_id=p_product and not archived for update;
 if not found then raise exception 'variant unavailable'; end if;
 perform set_config('souq.inventory_reason','legacy_allocation',true);perform set_config('souq.inventory_order','',true);
 update public.products set legacy_stock_reserve=legacy_stock_reserve-p_quantity where id=p_product;
 update public.product_variants set stock=stock+p_quantity where id=p_variant;
end; $$;
revoke all on function private.allocate_legacy_variant_stock(uuid,uuid,integer) from public,anon;
grant execute on function private.allocate_legacy_variant_stock(uuid,uuid,integer) to authenticated;
create or replace function public.allocate_legacy_variant_stock(p_product uuid,p_variant uuid,p_quantity integer) returns void language sql security invoker set search_path='' as $$ select private.allocate_legacy_variant_stock(p_product,p_variant,p_quantity); $$;
revoke all on function public.allocate_legacy_variant_stock(uuid,uuid,integer) from public,anon;
grant execute on function public.allocate_legacy_variant_stock(uuid,uuid,integer) to authenticated;

-- Store merchandising groups remain independent of the global taxonomy.
create or replace function public.rename_seller_category(p_id uuid,p_name text) returns void language plpgsql security invoker set search_path='' as $$
declare c public.seller_categories%rowtype;
begin
 select * into c from public.seller_categories where id=p_id for update;
 if not found or not public.can_manage_approved_store(c.store_id) then raise exception 'store access denied'; end if;
 update public.seller_categories set name=trim(p_name) where id=p_id;
 update public.products set store_category=trim(p_name),category=case when catalog_category_id is null then trim(p_name) else category end where store_id=c.store_id and (store_category=c.name or (store_category is null and category=c.name));
end; $$;
notify pgrst,'reload schema';

grant usage on schema private to authenticated;
