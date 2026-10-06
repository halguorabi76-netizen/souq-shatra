begin;
do $test$
declare seller uuid:=gen_random_uuid();buyer uuid:=gen_random_uuid();store uuid:=gen_random_uuid();p uuid;o uuid;cid uuid;attrs jsonb;rows jsonb;vid uuid;ver int;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(seller,'options-seller-'||seller||'@example.invalid','{"full_name":"اختبار خيارات"}'),(buyer,'options-buyer-'||buyer||'@example.invalid','{"full_name":"اختبار مخزون"}');
 update public.profiles set role='seller' where id=seller;
 insert into public.stores(id,owner_id,name,approved) values(store,seller,'متجر اختبار خيارات مؤقت',true);
 select id into cid from public.catalog_categories where name='قمصان وتيشيرتات';
 attrs:='{"material":"قطن","_custom_options":[{"key":"custom_roast","label":"خيار خاص","icon":"🏷️","type":"select","options":["فاتح","غامق"],"variant":true,"required":false}],"_color_swatches":{"أزرق خاص":"#125abc"}}';
 rows:='[{"attributes":{"color":"أزرق خاص","size":"M","custom_roast":"فاتح"},"label":"أزرق خاص M فاتح","price":1000,"stock":5,"available":true},{"attributes":{"color":"أزرق خاص","size":"L","custom_roast":"غامق"},"label":"أزرق خاص L غامق","price":1200,"stock":3,"available":true}]';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',seller,'role','authenticated')::text,true);
 p:=public.save_product_bundle(null,store,jsonb_build_object('name','اختبار خيارات','price',1000,'stock',0,'catalog_category_id',cid,'attributes',attrs),rows);
 if (select stock from public.products where id=p)<>8 then raise exception 'incorrect aggregate stock';end if;
 if (select attributes->'_custom_options'->0->>'label' from public.products where id=p)<>'خيار خاص' then raise exception 'custom definitions lost';end if;
 -- Optional-only: no forced size, color or appliances data.
 perform public.save_product_bundle(null,store,jsonb_build_object('name','اختبار بلا خيارات','price',1000,'stock',7,'catalog_category_id',cid,'attributes','{}'::jsonb),'[]');
 begin perform private.validate_catalog_attributes(cid,'{"custom_unknown":"x"}',true,attrs);raise exception 'unknown custom allowed';exception when others then if sqlerrm='unknown custom allowed' then raise;end if;end;
 begin perform private.product_custom_definitions('{"_custom_options":[{"key":"price","label":"x","icon":"🏷️","type":"text","variant":true,"options":[]}]}');raise exception 'reserved key allowed';exception when others then if sqlerrm='reserved key allowed' then raise;end if;end;
 begin perform private.product_custom_definitions('{"_color_swatches":{"x":"url(javascript:bad)"}}');raise exception 'unsafe css allowed';exception when others then if sqlerrm='unsafe css allowed' then raise;end if;end;
 begin perform private.validate_catalog_attributes(cid,'{"count":"x"}',false,'{}');exception when others then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',buyer,'role','authenticated')::text,true);
 begin perform public.save_product_bundle(null,store,jsonb_build_object('name','غير مسموح','price',1000,'stock',1),'[]');raise exception 'buyer saved product';exception when others then if sqlerrm='buyer saved product' then raise;end if;end;
 select id into vid from public.product_variants where product_id=p and attributes->>'size'='M';
 o:=public.place_order(store,jsonb_build_array(jsonb_build_object('id',p,'variant_id',vid,'quantity',2)),'اختبار','07700000000','عنوان اختبار');
 if (select stock from public.product_variants where id=vid)<>3 or (select stock from public.products where id=p)<>6 then raise exception 'incorrect variant decrement';end if;
 if (select variant_snapshot->'attributes'->>'custom_roast' from public.order_items where order_id=o)<>'فاتح' then raise exception 'custom order snapshot lost';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',seller,'role','authenticated')::text,true);
 perform public.set_order_status(o,'cancelled');
 if (select stock from public.products where id=p)<>8 then raise exception 'incorrect restore';end if;
 select jsonb_agg(to_jsonb(v)) into rows from public.product_variants v where product_id=p;
 perform public.save_product_bundle(p,store,jsonb_build_object('name','اختبار محفوظ','price',1000,'stock',0,'catalog_category_id',cid,'attributes',attrs),rows);
 if not exists(select 1 from public.product_variants where id=vid and stock=5) then raise exception 'identity or stock lost';end if;
 begin perform public.save_product_bundle(p,store,jsonb_build_object('name','قديم','price',1000,'stock',0,'catalog_category_id',cid,'attributes',attrs),rows);raise exception 'stale inventory accepted';exception when others then if sqlerrm='stale inventory accepted' then raise;end if;end;
 if (select count(*) from public.product_variants where product_id=p and not archived)<>2 then raise exception 'failed save archived variants';end if;
 if has_function_privilege('anon','public.save_product_bundle(uuid,uuid,jsonb,jsonb)','execute') or has_function_privilege('authenticated','private.product_custom_definitions(jsonb)','execute') then raise exception 'unsafe grants';end if;
end;$test$;
select 'PASS: optional fields, custom schema validation, buyer denial, independent stock, checkout snapshot, cancellation, edit identity and stale version' as result;
rollback;
