begin;
do $test$
declare seller uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); driver uuid:=gen_random_uuid(); v_name text:='login_'||left(replace(seller::text,'-',''),20); result jsonb; i integer;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(seller,'login-seller-'||seller||'@example.invalid','{"full_name":"Login Test"}'),(other,'login-other-'||other||'@example.invalid','{"full_name":"Login Test"}'),(driver,'login-driver-'||driver||'@example.invalid','{"full_name":"Login Test"}');
 insert into public.stores(owner_id,name,approved) values(seller,'اختبار اسم دخول مؤقت',true),(other,'اختبار اسم ثان مؤقت',true);
 insert into public.delivery_workers(user_id) values(driver);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',seller,'role','authenticated')::text,true);
 perform public.set_professional_username(upper(v_name));
 if (select username from public.stores where owner_id=seller)<>v_name then raise exception 'store name not synchronized';end if;
 foreach seller in array array[other,driver] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',seller,'role','authenticated')::text,true);
  begin perform public.set_professional_username(upper(v_name));raise exception 'duplicate accepted';exception when unique_violation then null;end;
 end loop;
 begin perform public.prepare_professional_login(v_name,'seller',repeat('a',64));raise exception 'user lookup accepted';exception when others then if sqlerrm='user lookup accepted' then raise;end if;end;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=public.prepare_professional_login(upper(v_name),'seller',repeat('a',64));
 if result->>'email' is null or (result->>'limited')::boolean then raise exception 'seller lookup failed';end if;
 if public.prepare_professional_login(v_name,'driver',repeat('a',64))->>'email' is not null then raise exception 'role mismatch accepted';end if;
 result:=public.prepare_professional_login('does_not_exist','seller',repeat('a',64));if result->>'email' is not null then raise exception 'unknown name matched';end if;
 for i in 1..21 loop result:=public.prepare_professional_login(v_name,'seller',repeat('b',64));end loop;
 if not (result->>'limited')::boolean or result->>'email' is not null then raise exception 'rate limiting failed';end if;
 if has_function_privilege('anon','public.prepare_professional_login(text,text,text)','execute') or has_function_privilege('authenticated','public.prepare_professional_login(text,text,text)','execute') then raise exception 'lookup exposed';end if;
end;$test$;
select 'PASS: case-insensitive names cannot repeat across sellers or drivers; private lookup respects role; rate limiting blocks repeated attempts' as result;
rollback;
