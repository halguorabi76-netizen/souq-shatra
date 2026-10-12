begin;
do $$
declare s uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); o uuid; second_order uuid; n integer;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (s,'qa-order-seller-'||s||'@example.invalid','{"full_name":"QA Seller"}'),
 (b,'qa-order-buyer-'||b||'@example.invalid','{"full_name":"QA Buyer"}'),
 (d,'qa-order-driver-'||d||'@example.invalid','{"full_name":"QA Driver"}');
 insert into public.stores(id,owner_id,name,phone,address,approved) values(m,s,'QA order management','07811111111','QA pickup',true);
 insert into public.products(id,store_id,name,price,stock) values(p,m,'QA item',1000,10);
 perform set_config('request.jwt.claim.sub',d::text,true);
 perform public.request_driver_application('QA Driver','07822222222','qa-order-driver-'||d||'@example.invalid','QA address','QA motorcycle');
 update public.delivery_workers set approved=true where user_id=d;
 perform set_config('request.jwt.claim.sub',b::text,true);
 o:=public.place_order(m,jsonb_build_array(jsonb_build_object('id',p,'quantity',1)),'QA Buyer','07833333333','QA ADDRESS','');
 perform public.customer_order_action(o,'cancel','');
 perform public.customer_order_action(o,'cancel','');
 if (select stock from public.products where id=p)<>10 then raise exception 'cancel inventory not exactly once';end if;
 perform public.customer_order_action(o,'hide','');
 perform public.customer_order_action(o,'restore','');
 if exists(select 1 from public.order_customer_actions where order_id=o and hidden_at is not null) then raise exception 'restore failed';end if;
 second_order:=public.place_order(m,jsonb_build_array(jsonb_build_object('id',p,'quantity',1)),'QA Buyer','07833333333','QA ADDRESS','');
 perform set_config('request.jwt.claim.sub',d::text,true);
 perform public.claim_delivery(second_order);
 begin perform public.customer_order_action(second_order,'hide','');raise exception 'other account can hide';exception when others then if sqlerrm='other account can hide' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.customer_order_action(second_order,'cancel','changed my mind');
 perform public.customer_order_action(second_order,'cancel','changed my mind');
 if (select status from public.orders where id=second_order)<>'new' or (select stock from public.products where id=p)<>9 then raise exception 'assigned cancellation changed state';end if;
 if (select count(*) from public.account_notifications where recipient_id=s and order_id=second_order and title='طلب إلغاء من الزبون')<>1 then raise exception 'request notification missing or duplicate';end if;
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.set_order_status(second_order,'accepted');
 perform set_config('request.jwt.claim.sub',d::text,true);
 perform public.delivery_step(second_order,'delivered');
 select amount_due into n from public.delivery_workers where user_id=d;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.customer_order_action(second_order,'return','wrong item');
 perform public.customer_order_action(second_order,'return','wrong item');
 perform public.customer_order_action(second_order,'hide','');
 if (select stock from public.products where id=p)<>9 or (select amount_due from public.delivery_workers where user_id=d)<>n or (select status from public.orders where id=second_order)<>'delivered' then raise exception 'return altered accounting';end if;
 if not exists(select 1 from public.order_customer_actions where order_id=second_order and request_kind='return' and reason='wrong item' and hidden_at is not null) then raise exception 'hide lost request';end if;
 if has_function_privilege('anon','public.customer_order_action(uuid,text,text)','execute') then raise exception 'anonymous can execute';end if;
 if has_table_privilege('authenticated','public.order_customer_actions','update') then raise exception 'direct writes allowed';end if;
end $$;
rollback;
select 'PASS: own-account guard, cancellation restores inventory once, assigned cancellation review, return preserves fees and stock, notifications once, hide and restore, restricted grants; fixtures rolled back' result;
