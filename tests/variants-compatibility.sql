-- Additional transactional tests: successful edits, runtime taxonomy, legacy orders.
select set_config('request.jwt.claim.sub','a3e1a7fa-92d0-4f0d-b6b6-06f8bbfb8651',true);
set local role authenticated;
select public.save_product_bundle(t.product,'7dba0eae-96d6-4cdb-83d7-cc86d580d3a4',(select to_jsonb(p) from public.products p where p.id=t.product),(select jsonb_agg(to_jsonb(v)||jsonb_build_object('label',v.label||' محدث')) from public.product_variants v where v.product_id=t.product)) from variant_test_context t;
do $$ begin if exists(select 1 from public.order_items i join variant_test_context t on t.order_id=i.order_id where i.product_name like '%محدث%' or i.variant_snapshot->>'label' like '%محدث%') then raise exception 'edit mutated order snapshot';end if; end $$;
create temporary table legacy_test_context(product uuid,order_id uuid,category_id uuid);
grant all on legacy_test_context to authenticated;
insert into legacy_test_context(product) select public.save_product_bundle(null,'7dba0eae-96d6-4cdb-83d7-cc86d580d3a4','{"name":"اختبار منتج قديم","category":"قسم قديم","price":1000,"stock":4,"variant":"خيار قديم"}','[]');
select set_config('request.jwt.claim.sub','a1c6e708-8b35-4dbe-9714-b88f3e8fed6f',true);
update legacy_test_context set order_id=public.place_order('7dba0eae-96d6-4cdb-83d7-cc86d580d3a4',jsonb_build_array(jsonb_build_object('id',product,'quantity',1)),'اختبار قديم','00000000000','عنوان اختبار');
select set_config('request.jwt.claim.sub','a3e1a7fa-92d0-4f0d-b6b6-06f8bbfb8651',true);
select public.save_product_bundle(product,'7dba0eae-96d6-4cdb-83d7-cc86d580d3a4','{"name":"اختبار منتج قديم","price":1000,"stock":3,"expected_stock":3,"catalog_category_id":"b2000000-0000-4000-8000-000000000401","attributes":{},"store_category":"تجميع تجريبي"}','[{"attributes":{"size":"M"},"label":"M","price":1000,"stock":3,"available":true}]') from legacy_test_context;
select public.set_order_status(order_id,'cancelled') from legacy_test_context;
do $$ declare p uuid; begin select product into p from legacy_test_context;
 if (select legacy_stock_reserve from public.products where id=p)<>1 or (select stock from public.products where id=p)<>3 then raise exception 'legacy return corrupted variant stock';end if;
 if not exists(select 1 from public.seller_categories where store_id='7dba0eae-96d6-4cdb-83d7-cc86d580d3a4' and name='تجميع تجريبي') then raise exception 'seller grouping lost';end if;
 perform public.allocate_legacy_variant_stock(p,(select id from public.product_variants where product_id=p),1);
 if (select stock from public.products where id=p)<>4 or (select legacy_stock_reserve from public.products where id=p)<>0 then raise exception 'legacy return allocation failed';end if;
end $$;
select set_config('request.jwt.claim.sub','8ea30c35-4017-4630-92fc-7c6a40938344',true);
update legacy_test_context set category_id=public.save_catalog_category(null,null,'قسم اختبار ديناميكي','[{"key":"finish","label":"التشطيب","variant":true,"required":true,"type":"select","options":["مطفي","لامع"]}]',true);
select public.save_catalog_category(null,category_id,'فئة ديناميكية','[{"key":"length","label":"الطول","variant":false,"required":false,"type":"number","options":[]}]',true) from legacy_test_context;
-- A definition used by existing saleable variants cannot be removed.
do $$ begin
 begin perform public.save_catalog_category('b1000000-0000-4000-8000-000000000004',null,'ملابس','[]',true);raise exception 'used axis removed';exception when others then if sqlerrm='used axis removed' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','a3e1a7fa-92d0-4f0d-b6b6-06f8bbfb8651',true);
select public.save_product_bundle(null,'7dba0eae-96d6-4cdb-83d7-cc86d580d3a4',jsonb_build_object('name','منتج فئة جديدة','price',2000,'stock',0,'catalog_category_id',category_id,'attributes','{}'::jsonb),'[{"attributes":{"finish":"مطفي"},"label":"مطفي","price":2000,"stock":1,"available":true}]') from legacy_test_context;
reset role;
select 'PASS: successful versioned edits, immutable snapshots, legacy product orders and reserve allocation, admin-created required variant attribute' result;
