-- Rollback-only fixtures: no production data is changed.
do $$
declare seller uuid:=gen_random_uuid(); seller2 uuid:=gen_random_uuid(); buyer uuid:=gen_random_uuid(); driver uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); store1 uuid:=gen_random_uuid();store2 uuid:=gen_random_uuid();product1 uuid:=gen_random_uuid();product2 uuid:=gen_random_uuid();q jsonb;ids jsonb;retry jsonb;groups jsonb; o uuid;o2 uuid;request uuid:=gen_random_uuid();settings public.delivery_settings%rowtype;r jsonb;n integer;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(seller,'qa-route-'||seller||'@example.invalid','{"full_name":"QA Seller"}'),(seller2,'qa-route-'||seller2||'@example.invalid','{"full_name":"QA Seller 2"}'),(buyer,'qa-route-'||buyer||'@example.invalid','{"full_name":"QA Buyer"}'),(driver,'qa-route-'||driver||'@example.invalid','{"full_name":"QA Driver"}'),(stranger,'qa-route-'||stranger||'@example.invalid','{}'),(admin_id,'qa-route-'||admin_id||'@example.invalid','{}');
 update public.profiles set role='admin' where id=admin_id;
 insert into public.stores(id,owner_id,name,phone,address,approved) values(store1,seller,'QA Route Store','07811111111','QA pickup',true),(store2,seller2,'QA Route Store 2','07811111111','QA pickup 2',true);
 insert into public.store_pickups(store_id,pickup_address,latitude,longitude) values(store1,'QA pickup',31.409,46.1727),(store2,'QA pickup 2',31.415918,46.1727);
 insert into public.products(id,store_id,name,price,stock) values(product1,store1,'QA Product',1000,10),(product2,store2,'QA Product 2',2000,10);
 perform set_config('request.jwt.claim.sub',buyer::text,true);
 if not private.address_has_phone('منطقة ٠٧٨١٢٣٤٥٦٧٨') or not private.address_has_phone('078 123 456 78') or private.address_has_phone('الحي 12 بيت 4') then raise exception 'address validation failed';end if;
 q:=public.quote_delivery_route(array[store1,store2],31.42975,46.1727);
 if (q->>'delivery_fee')::integer<>3000 or q ? 'expected_min' or q ? 'config' then raise exception 'example fee/internal time incorrect: %',q;end if;
 if abs((private.delivery_quote(array[store1,store2],31.42975,46.1727)->>'expected_min')::numeric-31)>.1 then raise exception 'internal expected time incorrect';end if;
 select * into settings from public.delivery_settings where id=true;
 groups:=jsonb_build_array(jsonb_build_object('store',store1,'lines',jsonb_build_array(jsonb_build_object('id',product1,'quantity',1))),jsonb_build_object('store',store2,'lines',jsonb_build_array(jsonb_build_object('id',product2,'quantity',1))));
 begin perform public.place_route_order(groups,'QA Buyer','07833333333','','QA address','',31.42975,46.1727,3250,q->>'fingerprint',settings.platform_fee,gen_random_uuid());raise exception 'tampered fee accepted';exception when others then if sqlerrm='tampered fee accepted' then raise;end if;end;
 ids:=public.place_route_order(groups,'QA Buyer','07833333333','07844444444','QA address','QA note',31.42975,46.1727,3000,q->>'fingerprint',settings.platform_fee,request);
 retry:=public.place_route_order(groups,'QA Buyer','07833333333','07844444444','QA address','QA note',31.42975,46.1727,3000,q->>'fingerprint',settings.platform_fee,request);
 if ids<>retry then raise exception 'idempotency failed';end if;
 select id into o from public.orders where id in(select value::uuid from jsonb_array_elements_text(ids)) and store_id=store1;select id into o2 from public.orders where id in(select value::uuid from jsonb_array_elements_text(ids)) and store_id=store2;
 if (select sum(delivery_fee) from public.orders where id in(o,o2))<>3000 or (select stock from public.products where id=product1)<>9 then raise exception 'fee split or inventory incorrect';end if;
 perform set_config('request.jwt.claim.sub',seller::text,true);
 r:=public.participant_orders(p_order=>o);
 if r->0->>'customer_phone' is not null or (r->0->>'note') like '%07844444444%' then raise exception 'seller contact leak';end if;
 perform public.set_order_status(o,'accepted');perform public.delivery_stage(o,'READY');
 perform set_config('request.jwt.claim.sub',seller2::text,true);perform public.set_order_status(o2,'accepted');
 perform set_config('request.jwt.claim.sub',driver::text,true);
 perform public.request_driver_application('QA Driver','07822222222','qa-route-'||driver||'@example.invalid','QA address','QA motorcycle');update public.delivery_workers set approved=true where user_id=driver;
 r:=public.delivery_offer_details();if r::text like '%07833333333%' or r::text like '%07844444444%' then raise exception 'offer phone leak';end if;
 perform public.claim_route_delivery(o);
 if (select count(*) from public.orders where id in(o,o2) and driver_id=driver)<>2 then raise exception 'batch claim not atomic';end if;
 if public.participant_orders(p_order=>o)->0->>'customer_phone'<>'07833333333' then raise exception 'assigned driver missing contact';end if;
 perform public.reorder_delivery(array[o2,o]);if (select queue_rank from public.delivery_tracking where order_id=o2)<>1 then raise exception 'reorder failed';end if;
 perform set_config('request.jwt.claim.sub',buyer::text,true);
 begin perform public.customer_order_action(o,'cancel','');raise exception 'cancel before late permitted';exception when others then if sqlerrm='cancel before late permitted' then raise;end if;end;
 begin perform public.customer_delivery_action(o,'late');raise exception 'early late permitted';exception when others then if sqlerrm='early late permitted' then raise;end if;end;
 select count(*) into n from public.account_notifications where order_id=o;
 r:=public.customer_delivery_action(o,'help');if r->>'phone'<>'07822222222' then raise exception 'help number incorrect';end if;
 if (select count(*) from public.account_notifications where order_id=o)<>n then raise exception 'help sends notification';end if;
 update public.delivery_tracking set driver_accepted_at=now()-interval '121 minutes',last_status_at=now()-interval '1 minute' where order_id=o;
 if not private.delivery_is_stalled(o) then raise exception 'total stall missing';end if;
 update public.delivery_tracking set driver_accepted_at=now(),last_status_at=now()-interval '91 minutes' where order_id=o;
 if not private.delivery_is_stalled(o) then raise exception 'status stall missing';end if;
 perform public.customer_delivery_action(o,'late');perform public.customer_delivery_action(o,'late');
 if (select count(*) from public.delivery_events where order_id=o and kind='late')<>1 then raise exception 'duplicate report';end if;
 perform public.customer_order_action(o,'cancel','late');perform public.customer_order_action(o,'cancel','late');
 if (select stock from public.products where id=product1)<>10 then raise exception 'late cancel stock restore not exactly once';end if;
 if not exists(select 1 from public.delivery_events where order_id=o and kind='cancel' and driver_id=driver and details->>'after_driver'='true') then raise exception 'cancel audit missing';end if;
 -- Starting delivery records its time/rank, keeps existing completion and avoids duplicate fees.
 perform set_config('request.jwt.claim.sub',driver::text,true);
 perform public.delivery_stage(o2,'PICKED_UP');perform public.delivery_stage(o2,'ON_THE_WAY');
 if (select started_at is null or on_the_way_at is null or queue_rank<>1 from public.delivery_tracking where order_id=o2) then raise exception 'start delivery metadata missing';end if;
 perform public.delivery_step(o2,'delivered');select amount_due into n from public.delivery_workers where user_id=driver;perform public.delivery_step(o2,'delivered');
 if (select amount_due from public.delivery_workers where user_id=driver)<>n then raise exception 'completion charged twice';end if;
 -- Three matching cancellations are informational only and alert administrators.
 for n in 1..2 loop
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  o2:=public.place_order(store1,jsonb_build_array(jsonb_build_object('id',product1,'quantity',1)),'QA Buyer','07833333333','QA address','');
  perform set_config('request.jwt.claim.sub',driver::text,true);perform public.claim_delivery(o2);
  update public.delivery_tracking set last_status_at=now()-interval '91 minutes' where order_id=o2;
  perform set_config('request.jwt.claim.sub',buyer::text,true);perform public.customer_delivery_action(o2,'late');perform public.customer_order_action(o2,'cancel','late');
 end loop;
 if not exists(select 1 from public.account_notifications where recipient_id=admin_id and title='تكرار الإلغاء بعد قبول السائق') then raise exception 'repeat warning missing';end if;
 if (select approved from public.delivery_workers where user_id=driver) is not true then raise exception 'automatic penalty applied';end if;
 perform set_config('request.jwt.claim.sub',stranger::text,true);if public.participant_orders(p_order=>o)<>'[]' then raise exception 'stranger can read';end if;
 begin perform public.admin_delivery_config('{"BASE_FEE":2000}');raise exception 'nonadmin config permitted';exception when others then if sqlerrm='nonadmin config permitted' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);perform public.admin_delivery_config('{"BASE_FEE":2000}');
 if (select sum(delivery_fee) from public.orders where delivery_batch_id=(select delivery_batch_id from public.orders where id=o))<>3000 then raise exception 'confirmed fee changed';end if;
 if has_column_privilege('authenticated','public.orders','customer_phone','SELECT') or has_column_privilege('authenticated','public.orders','note','SELECT') or has_function_privilege('anon','public.participant_orders(uuid,uuid,uuid,uuid)','EXECUTE') or has_table_privilege('authenticated','public.delivery_tracking','UPDATE') then raise exception 'grants leak';end if;
perform set_config('qa.route.order',o::text,true);perform set_config('qa.route.buyer',buyer::text,true);perform set_config('qa.route.driver',driver::text,true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.route.buyer'),true);
do $$ declare r jsonb;begin
 r:=public.participant_orders(p_order=>current_setting('qa.route.order')::uuid);
 if jsonb_array_length(r)<>1 then raise exception 'authenticated buyer cannot read own order';end if;
 begin perform customer_phone from public.orders limit 1;raise exception 'direct number exposed';exception when insufficient_privilege then null;end;
 begin perform note from public.orders limit 1;raise exception 'direct notes exposed';exception when insufficient_privilege then null;end;
 begin update public.delivery_tracking set stage='READY';raise exception 'direct update permitted';exception when insufficient_privilege then null;end;
 begin perform public.admin_delivery_config('{"BASE_FEE":3000}');raise exception 'config writes exposed';exception when others then if sqlerrm='config writes exposed' then raise;end if;end;
end $$;
reset role;
