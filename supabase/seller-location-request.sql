alter table public.store_pickups add column latitude double precision, add column longitude double precision;
alter table public.store_pickups add constraint valid_pickup_coordinates check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180));
create or replace function private.request_seller_join_map(p_first text,p_last text,p_name text,p_phone text,p_address text,p_description text,p_kind text,p_lat double precision,p_lon double precision)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_store uuid;
begin
 if not public.is_active_user() then raise exception 'active account required'; end if;
 if p_lat is null or p_lon is null or not(p_lat between -90 and 90 and p_lon between -180 and 180) then raise exception 'choose store location'; end if;
 v_store:=private.request_seller_join_location(p_first,p_last,p_name,p_phone,p_address,p_description,p_kind);
 update public.store_pickups set latitude=p_lat,longitude=p_lon where store_id=v_store;
 return v_store;
end $$;
revoke all on function private.request_seller_join_map(text,text,text,text,text,text,text,double precision,double precision) from public,anon;
grant execute on function private.request_seller_join_map(text,text,text,text,text,text,text,double precision,double precision) to authenticated;
create or replace function public.request_seller_join_map(p_first text,p_last text,p_name text,p_phone text,p_address text,p_description text,p_kind text,p_lat double precision,p_lon double precision)
returns uuid language sql set search_path='' as $$ select private.request_seller_join_map(p_first,p_last,p_name,p_phone,p_address,p_description,p_kind,p_lat,p_lon); $$;
revoke all on function public.request_seller_join_map(text,text,text,text,text,text,text,double precision,double precision) from public,anon;
grant execute on function public.request_seller_join_map(text,text,text,text,text,text,text,double precision,double precision) to authenticated;

create or replace function private.record_professional_entry(p_role text)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_session text:=auth.jwt()->>'session_id';
begin
 if v_user is null or not public.is_active_user() then raise exception 'active account required'; end if;
 if p_role not in ('seller','driver') or v_session is null then raise exception 'invalid professional entry'; end if;
 if not exists(select 1 from auth.sessions where id::text=v_session and user_id=v_user) then raise exception 'session unavailable'; end if;
 -- Applicants receive exactly one application notification, not a separate login notification.
 if p_role='seller' and not exists(select 1 from public.stores where owner_id=v_user and approved and not removed) then return; end if;
 if p_role='driver' and not exists(select 1 from public.delivery_workers where user_id=v_user and approved) then return; end if;
 perform private.professional_notice(v_user,p_role,'login','professional:'||p_role||':login:'||v_user||':'||v_session);
end $$;
revoke all on function private.record_professional_entry(text) from public,anon;
grant execute on function private.record_professional_entry(text) to authenticated;
CREATE OR REPLACE FUNCTION private.professional_notice(p_user uuid, p_role text, p_event text, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_body text; v_name text; v_email text;
begin
 select p.full_name,u.email into v_name,v_email from public.profiles p join auth.users u on u.id=p.id where p.id=p_user and not p.disabled;
 if not found then return; end if;
 v_body:=concat_ws(E'\n','الاسم: '||coalesce(nullif(v_name,''),'لم يُكمل الاسم بعد'),'البريد: '||v_email,'رقم الحساب: '||p_user);
 if p_role='seller' then
  select v_body||E'\n'||concat_ws(E'\n','المتجر: '||s.name,'الهاتف: '||s.phone,'نوع المتجر: '||case when s.store_kind='online' then 'إلكتروني' else 'واقعي' end,'العنوان / الاستلام: '||coalesce(k.pickup_address,s.address),'النشاط: '||coalesce(s.description,''),case when k.latitude is not null and k.longitude is not null then 'الموقع: https://www.google.com/maps?q='||k.latitude||','||k.longitude end,'رقم التواصل المكتوب يحتاج مطابقة مع رقم المرسل على واتساب.') into v_body
  from public.stores s left join public.store_pickups k on k.store_id=s.id where s.owner_id=p_user;
 else
  select v_body||E'\n'||concat_ws(E'\n','الاسم الكامل: '||d.full_name,'الهاتف: '||d.phone,'العنوان: '||d.address,'وسيلة التوصيل: '||d.vehicle) into v_body from public.driver_profiles d where d.user_id=p_user;
 end if;
 if v_body is null then v_body:=concat_ws(E'\n','الاسم: '||coalesce(nullif(v_name,''),'لم يُكمل الاسم بعد'),'البريد: '||v_email,'رقم الحساب: '||p_user,'لم تُستكمل بيانات طلب الانضمام بعد.'); end if;
 insert into public.account_notifications(recipient_id,event_key,event_kind,title,body)
 select p.id,p_key,case when p_event='login' then 'professional_login' else 'professional_join' end,
 case when p_event='login' then 'دخول حساب ' else 'طلب انضمام / تحديث بيانات ' end||case when p_role='seller' then 'بائع' else 'سائق توصيل' end,v_body
 from public.profiles p where p.role='admin' and not p.disabled
 on conflict(recipient_id,event_key) do update set title=excluded.title,body=excluded.body,read_at=null,created_at=now()
 where account_notifications.event_kind='professional_join';
end $function$
