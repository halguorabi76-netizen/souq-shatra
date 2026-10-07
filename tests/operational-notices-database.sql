-- Isolated test of actual database triggers. All fixtures and notices roll back.
begin;
do $$
declare s record; p uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); n integer;
begin
 select id,owner_id into strict s from public.stores where approved and not removed limit 1;
 insert into auth.users(id,email,raw_user_meta_data) values
 (b,'qa-notice-buyer-'||b||'@example.invalid','{"full_name":"QA Buyer"}'),
 (d,'qa-notice-driver-'||d||'@example.invalid','{"full_name":"QA Driver"}');
 insert into public.products(id,store_id,name,price,stock,low_stock_threshold) values(p,s.id,'QA inventory notice',1000,10,5);
 perform set_config('request.jwt.claim.sub',b::text,true);
 insert into public.product_interactions(user_id,product_id,kind) values(b,p,'like'),(b,p,'favorite');
 if exists(select 1 from public.account_notifications where product_id=p) then raise exception 'reaction generated notification';end if;
 if (select count(*) from public.product_interactions where product_id=p)<>2 then raise exception 'reactions lost';end if;
 update public.products set stock=5 where id=p;
 update public.products set stock=4 where id=p;
 if (select count(*) from public.account_notifications where product_id=p and event_kind='inventory')<>1 then raise exception 'low stock absent or duplicated';end if;
 update public.products set stock=0 where id=p;
 update public.products set stock=10 where id=p;
 if (select count(*) from public.account_notifications where product_id=p and event_kind='inventory' and recipient_id=s.owner_id)<>3 then raise exception 'inventory state transitions missing';end if;
 insert into public.delivery_workers(user_id) values(d);
 update public.delivery_workers set amount_due=1000 where user_id=d;
 update public.delivery_workers set amount_due=5000 where user_id=d;
 update public.delivery_workers set amount_due=5000 where user_id=d;
 update public.delivery_workers set amount_due=0 where user_id=d;
 if (select count(*) from public.account_notifications where recipient_id=d and event_kind='payment')<>3 then raise exception 'balance events missing or duplicated';end if;
 if not exists(select 1 from public.account_notifications where recipient_id=d and title='تحذير: بلغت حد المستحقات للتطبيق') then raise exception 'debt limit warning missing';end if;
 if position('professional_notice' in pg_get_functiondef('private.record_professional_entry(text)'::regprocedure))=0 then raise exception 'professional sign-in notification removed';end if;
 if position('account_notifications' in pg_get_functiondef('private.notify_order_activity()'::regprocedure))=0 then raise exception 'order notices removed';end if;
end $$;
rollback;
select 'PASS: reactions retained without notices; inventory transitions, balance warnings, sign-in and orders retained; all fixtures rolled back' result;
