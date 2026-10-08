-- Exercise actual checkout/notification/claim/status functions; roll back every fixture.
begin;
do $$
declare s uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); o uuid; offers jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (s,'qa-dual-seller-'||s||'@example.invalid','{"full_name":"QA Seller"}'),
 (b,'qa-dual-buyer-'||b||'@example.invalid','{"full_name":"QA Buyer"}'),
 (d,'qa-dual-driver-'||d||'@example.invalid','{"full_name":"QA Driver"}'),
 (a,'qa-dual-admin-'||a||'@example.invalid','{"full_name":"QA Admin"}');
 update public.profiles set role='admin' where id=a;
 insert into public.stores(id,owner_id,name,phone,address,approved) values(m,s,'QA dual approval','07811111111','QA pickup',true);
 insert into public.products(id,store_id,name,price,stock) values(p,m,'QA dual approval product',1000,10);
 perform set_config('request.jwt.claim.sub',d::text,true);
 perform public.request_driver_application('QA Driver','07822222222','qa-dual-driver-'||d||'@example.invalid','QA address','QA motorcycle');
 update public.delivery_workers set approved=true where user_id=d;
 perform set_config('request.jwt.claim.sub',b::text,true);
 o:=public.place_order(m,jsonb_build_array(jsonb_build_object('id',p,'quantity',1)),'QA PRIVATE BUYER','07833333333','QA PRIVATE ADDRESS','');
 if not exists(select 1 from public.account_notifications where recipient_id=s and order_id=o and event_kind='order') then raise exception 'seller creation notice missing';end if;
 if not exists(select 1 from public.account_notifications where recipient_id=a and order_id=o and event_kind='order') then raise exception 'admin creation notice missing';end if;
 if not exists(select 1 from public.account_notifications where recipient_id=d and order_id=o and event_kind='delivery_offer' and body like '%× 1%') then raise exception 'driver creation notice missing';end if;
 perform set_config('request.jwt.claim.sub',d::text,true);
 offers:=public.delivery_offer_details();
 if not exists(select 1 from jsonb_array_elements(offers) x where x->>'order_id'=o::text) then raise exception 'new order unavailable before seller approval';end if;
 if offers::text like '%QA PRIVATE%' then raise exception 'unclaimed offer leaks buyer data';end if;
 perform public.claim_delivery(o);
 begin perform public.claim_delivery(o);raise exception 'duplicate claim accepted';exception when others then if sqlerrm='duplicate claim accepted' then raise;end if;end;
 begin perform public.delivery_step(o,'delivery');raise exception 'pickup before seller approval accepted';exception when others then if sqlerrm='pickup before seller approval accepted' then raise;end if;end;
 if not exists(select 1 from public.account_notifications where recipient_id=b and order_id=o and title='تمت الموافقة من قبل التوصيل') then raise exception 'buyer driver approval missing';end if;
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.set_order_status(o,'accepted');
 if not exists(select 1 from public.account_notifications where recipient_id=b and order_id=o and title='تمت الموافقة من قبل البائع') then raise exception 'buyer seller approval missing';end if;
 if not exists(select 1 from public.account_notifications where recipient_id=a and order_id=o and event_kind='status') then raise exception 'admin update missing';end if;
 perform set_config('request.jwt.claim.sub',d::text,true);
 perform public.delivery_step(o,'delivery');
 perform public.delivery_step(o,'delivered');
 if (select stock from public.products where id=p)<>9 then raise exception 'inventory changed twice';end if;
end $$;
rollback;
select 'PASS: three creation recipients, driver-first and seller approval, buyer notices, private offers, exclusive claims, pickup gate, stock; fixtures rolled back' result;
