-- Integration test. Always rolls back all temporary accounts, requests and inventory changes.
begin;
do $$
declare b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); s record; p uuid;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (b,'qa-buyer-'||b||'@example.invalid','{"full_name":"QA Buyer"}'),
 (d,'qa-driver-'||d||'@example.invalid','{"full_name":"QA Driver"}'),
 (x,'qa-other-'||x||'@example.invalid','{"full_name":"QA Other"}');
 select * into strict s from public.stores where approved and not removed limit 1;
 select id into strict p from public.products where store_id=s.id and active and not blocked and stock>0 limit 1;
 perform set_config('qa.buyer',b::text,true);perform set_config('qa.driver',d::text,true);perform set_config('qa.other',x::text,true);
 perform set_config('qa.store',s.id::text,true);perform set_config('qa.owner',s.owner_id::text,true);perform set_config('qa.product',p::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
select public.save_store_location(current_setting('qa.store')::uuid,'online','QA PRIVATE PICKUP');
do $$ begin
 if (select address from public.stores where id=current_setting('qa.store')::uuid)<>'' then raise exception 'online pickup exposed publicly'; end if;
 begin perform public.save_store_location(current_setting('qa.store')::uuid,'physical','');raise exception 'missing physical address accepted'; exception when others then if sqlerrm='missing physical address accepted' then raise; end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.buyer'),true);
insert into public.product_interactions(user_id,product_id,kind) values(auth.uid(),current_setting('qa.product')::uuid,'favorite');
delete from public.product_interactions where user_id=auth.uid() and product_id=current_setting('qa.product')::uuid and kind='favorite';
insert into public.product_interactions(user_id,product_id,kind) values(auth.uid(),current_setting('qa.product')::uuid,'favorite'),(auth.uid(),current_setting('qa.product')::uuid,'like');
do $$ begin
 if exists(select 1 from public.account_notifications) then raise exception 'buyer sees seller notification'; end if;
 if exists(select 1 from public.store_pickups) then raise exception 'buyer sees private pickup'; end if;
end $$;
select set_config('qa.order',public.place_order(current_setting('qa.store')::uuid,jsonb_build_array(jsonb_build_object('id',current_setting('qa.product'),'quantity',1)),'QA CUSTOMER SECRET','07811111111','QA CUSTOMER ADDRESS','')::text,true);
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
do $$ begin
 if exists(select 1 from public.account_notifications where event_key like 'interaction:'||current_setting('qa.buyer')||':%') then raise exception 'social reaction generated notification';end if;
 if not exists(select 1 from public.account_notifications where order_id=current_setting('qa.order')::uuid and event_kind='order' and body like '%× 1%') then raise exception 'order items absent from notice';end if;
end $$;
select public.set_order_status(current_setting('qa.order')::uuid,'accepted');
select set_config('request.jwt.claim.sub',current_setting('qa.driver'),true);
select public.request_driver_application('QA Driver','07822222222','qa-driver-'||current_setting('qa.driver')||'@example.invalid','QA address','QA motorcycle');
do $$ begin
 if public.delivery_offer_details()<>'[]'::jsonb then raise exception 'pending driver sees offers'; end if;
 if exists(select 1 from public.orders where id=current_setting('qa.order')::uuid) then raise exception 'pending driver sees customer'; end if;
end $$;
reset role;
insert into public.delivery_workers(user_id) values(current_setting('qa.other')::uuid);
do $$ begin
 begin update public.delivery_workers set approved=true where user_id=current_setting('qa.other')::uuid;raise exception 'incomplete driver approved';exception when others then if sqlerrm='incomplete driver approved' then raise;end if;end;
end $$;
update public.delivery_workers set approved=true where user_id=current_setting('qa.driver')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.driver'),true);
do $$ declare offer jsonb;begin
 select x into strict offer from jsonb_array_elements(public.delivery_offer_details()) x where x->>'order_id'=current_setting('qa.order');
 if offer::text like '%QA CUSTOMER%' or offer ? 'customer_phone' or offer ? 'address' then raise exception 'offer leaks customer'; end if;
 if jsonb_array_length(offer->'items')<>1 then raise exception 'offer missing product';end if;
end $$;
select public.claim_delivery(current_setting('qa.order')::uuid);
do $$ begin
 if not exists(select 1 from public.orders where id=current_setting('qa.order')::uuid and customer_name='QA CUSTOMER SECRET') then raise exception 'assigned driver missing customer';end if;
 if not exists(select 1 from jsonb_array_elements(public.assigned_delivery_contacts()) x where x->>'order_id'=current_setting('qa.order') and x->>'pickup_address'='QA PRIVATE PICKUP') then raise exception 'assigned driver missing pickup';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
do $$ begin
 if not exists(select 1 from jsonb_array_elements(public.assigned_delivery_contacts()) x where x->>'order_id'=current_setting('qa.order') and x->>'full_name'='QA Driver' and x->>'phone'='07822222222') then raise exception 'seller missing driver identity';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true);
do $$ begin
 if exists(select 1 from public.account_notifications) then raise exception 'other user sees notification';end if;
 if exists(select 1 from public.driver_profiles) then raise exception 'other user sees driver profile';end if;
 if public.assigned_delivery_contacts()<>'[]'::jsonb then raise exception 'other user sees driver contact';end if;
 begin perform public.claim_delivery(current_setting('qa.order')::uuid);raise exception 'double claim accepted';exception when others then if sqlerrm='double claim accepted' then raise;end if;end;
 begin perform public.save_store_location(current_setting('qa.store')::uuid,'physical','QA hacked address');raise exception 'foreign store edit accepted';exception when others then if sqlerrm='foreign store edit accepted' then raise;end if;end;
end $$;
reset role;
rollback;
select 'PASS: notification privacy, order items, pending-driver gate, offer privacy, exclusive assignment, driver contact, private pickup; all test data rolled back' result;
