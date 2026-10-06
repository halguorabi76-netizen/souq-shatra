begin;
do $$
declare s uuid:=gen_random_uuid();session uuid:=gen_random_uuid();store uuid;admin uuid;
begin
 select id into admin from public.profiles where role='admin' and not disabled limit 1;
 insert into auth.users(id,email,raw_user_meta_data) values(s,'map-test-'||s||'@example.invalid','{"full_name":"اختبار الموقع"}');
 insert into auth.sessions(id,user_id) values(session,s);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',s,'role','authenticated','session_id',session)::text,true);
 perform public.record_professional_entry('seller');
 if exists(select 1 from public.account_notifications where event_key='professional:seller:login:'||s||':'||session) then raise exception 'applicant login creates extra notice';end if;
 store:=public.request_seller_join_map('اختبار','الموقع','متجر اختبار موقع','07700000000','عنوان خاص','نشاط اختبار','online',31.409063,46.172704);
 if not exists(select 1 from public.store_pickups where store_id=store and latitude=31.409063 and longitude=46.172704) then raise exception 'coordinates not saved';end if;
 if (select count(*) from public.account_notifications where recipient_id=admin and event_key='professional:seller:join:'||s)<>1 then raise exception 'more than one application';end if;
 if not exists(select 1 from public.account_notifications where recipient_id=admin and event_key='professional:seller:join:'||s and body like '%https://www.google.com/maps?q=31.409063,46.172704%') then raise exception 'missing map in notice';end if;
 begin perform public.approve_store(store,true);raise exception 'buyer approved store';exception when others then if sqlerrm='buyer approved store' then raise;end if;end;
 begin perform public.request_seller_join_map('اختبار','الموقع','متجر اختبار','07700000000','العنوان','نشاط','online',91,46);raise exception 'invalid point accepted';exception when others then if sqlerrm='invalid point accepted' then raise;end if;end;
 perform public.request_seller_join_map('اختبار','الموقع','متجر اختبار موقع','07700000000','عنوان آخر','نشاط اختبار','online',31.4,46.1);
 if (select count(*) from public.account_notifications where recipient_id=admin and event_key='professional:seller:join:'||s)<>1 then raise exception 'repeat submit duplicates notice';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);
 perform public.approve_store(store,true);
 if not(select approved from public.stores where id=store) then raise exception 'direct admin approval failed';end if;
 if has_function_privilege('anon','public.request_seller_join_map(text,text,text,text,text,text,text,double precision,double precision)','execute') then raise exception 'anon can submit';end if;
end $$;
select 'PASS: GPS/map coordinates persisted privately, exactly one applicant notice, updated request deduplicated, owner can directly approve, buyer cannot approve, invalid locations rejected' as tests;
rollback;
