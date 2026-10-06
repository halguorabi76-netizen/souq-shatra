begin;
do $$
declare s uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); store uuid; admin uuid;
begin
 select id into admin from public.profiles where role='admin' and not disabled limit 1;
 if admin is null then raise exception 'admin missing'; end if;
 insert into auth.users(id,email,raw_user_meta_data) values(s,'seller-test-'||s||'@example.invalid','{"full_name":"اختبار البائع"}'),(d,'driver-test-'||d||'@example.invalid','{"full_name":"اختبار السائق"}');
 insert into auth.sessions(id,user_id) values(session,s);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',s,'role','authenticated','session_id',session)::text,true);
 store:=public.request_seller_join_location('اختبار','البائع','متجر اختبار','07700000000','عنوان استلام الاختبار','نشاط اختبار','online');
 if (select approved from public.stores where id=store) then raise exception 'seller self-approved'; end if;
 if (select count(*) from public.account_notifications where recipient_id=admin and event_key='professional:seller:join:'||s)<>1 then raise exception 'seller notice duplicate or missing'; end if;
 if not exists(select 1 from public.account_notifications where recipient_id=admin and event_key='professional:seller:join:'||s and body like '%عنوان استلام الاختبار%' and body like '%07700000000%' and body like '%متجر اختبار%') then raise exception 'seller notice missing full details'; end if;
 perform public.record_professional_entry('seller'); perform public.record_professional_entry('seller');
 if (select count(*) from public.account_notifications where recipient_id=admin and event_key='professional:seller:login:'||s||':'||session)<>1 then raise exception 'login duplicate or missing'; end if;
 begin perform public.admin_account_profiles(); raise exception 'non-admin got profiles'; exception when others then if sqlerrm='non-admin got profiles' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',d,'role','authenticated')::text,true);
 perform public.request_driver_application('اختبار السائق','07700000001','driver-test-'||d||'@example.invalid','منطقة اختبار السائق','دراجة اختبار');
 if (select approved from public.delivery_workers where user_id=d) then raise exception 'driver self-approved'; end if;
 if not exists(select 1 from public.account_notifications where recipient_id=admin and event_key='professional:driver:join:'||d and body like '%دراجة اختبار%' and body like '%منطقة اختبار السائق%' and body like '%07700000001%') then raise exception 'driver notice missing full details'; end if;
 if has_function_privilege('anon','public.admin_account_profiles()','execute') or has_function_privilege('anon','public.record_professional_entry(text)','execute') or has_function_privilege('authenticated','private.professional_notice(uuid,text,text,text)','execute') then raise exception 'unsafe function grants'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);
 if not exists(select 1 from public.admin_account_profiles() where id=s and email='seller-test-'||s||'@example.invalid') then raise exception 'admin profile missing email'; end if;
end $$;
select 'PASS: seller/driver complete notices, pending approval, login deduplication, admin-only profiles and function grants; all fixtures rolled back' as test_result;
rollback;
