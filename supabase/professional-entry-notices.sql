-- Professional applications and sign-in notifications. No self-approval.
create or replace function private.professional_notice(p_user uuid,p_role text,p_event text,p_key text)
returns void language plpgsql security definer set search_path='' as $$
declare v_body text; v_name text; v_email text;
begin
 select p.full_name,u.email into v_name,v_email from public.profiles p join auth.users u on u.id=p.id where p.id=p_user and not p.disabled;
 if not found then return; end if;
 v_body:=concat_ws(E'\n','الاسم: '||coalesce(nullif(v_name,''),'لم يُكمل الاسم بعد'),'البريد: '||v_email,'رقم الحساب: '||p_user);
 if p_role='seller' then
  select v_body||E'\n'||concat_ws(E'\n','المتجر: '||s.name,'الهاتف: '||s.phone,'نوع المتجر: '||case when s.store_kind='online' then 'إلكتروني' else 'واقعي' end,'العنوان / الاستلام: '||coalesce(k.pickup_address,s.address),'النشاط: '||coalesce(s.description,'')) into v_body
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
end $$;
revoke all on function private.professional_notice(uuid,text,text,text) from public,anon,authenticated;

create or replace function private.professional_application_notice()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_role text;
begin
 if tg_table_name='stores' then
  if new.approved or new.removed then return new; end if;
  if tg_op='UPDATE' and row(new.name,new.phone,new.address,new.description,new.store_kind) is not distinct from row(old.name,old.phone,old.address,old.description,old.store_kind) then return new; end if;
  v_user:=new.owner_id;v_role:='seller';
 else
  if tg_op='UPDATE' and row(new.full_name,new.phone,new.email,new.address,new.vehicle) is not distinct from row(old.full_name,old.phone,old.email,old.address,old.vehicle) then return new; end if;
  v_user:=new.user_id;v_role:='driver';
 end if;
 perform private.professional_notice(v_user,v_role,'join','professional:'||v_role||':join:'||v_user);
 return new;
end $$;
revoke all on function private.professional_application_notice() from public,anon,authenticated;
create trigger professional_store_notice after insert or update on public.stores for each row execute function private.professional_application_notice();
create trigger professional_driver_notice after insert or update on public.driver_profiles for each row execute function private.professional_application_notice();

create or replace function private.record_professional_entry(p_role text)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_session text:=auth.jwt()->>'session_id';
begin
 if v_user is null or not public.is_active_user() then raise exception 'active account required'; end if;
 if p_role not in ('seller','driver') or v_session is null then raise exception 'invalid professional entry'; end if;
 if not exists(select 1 from auth.sessions where id::text=v_session and user_id=v_user) then raise exception 'session unavailable'; end if;
 perform private.professional_notice(v_user,p_role,'login','professional:'||p_role||':login:'||v_user||':'||v_session);
end $$;
revoke all on function private.record_professional_entry(text) from public,anon;
grant execute on function private.record_professional_entry(text) to authenticated;
create or replace function public.record_professional_entry(p_role text)
returns void language sql set search_path='' as $$ select private.record_professional_entry(p_role); $$;
revoke all on function public.record_professional_entry(text) from public,anon;
grant execute on function public.record_professional_entry(text) to authenticated;

create or replace function private.admin_account_profiles()
returns table(id uuid,full_name text,phone text,role text,disabled boolean,created_at timestamptz,email text)
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() or not public.is_active_user() then raise exception 'admin required'; end if;
 return query select p.id,p.full_name,p.phone,p.role,p.disabled,p.created_at,u.email::text from public.profiles p join auth.users u on u.id=p.id order by p.created_at desc;
end $$;
revoke all on function private.admin_account_profiles() from public,anon;
grant execute on function private.admin_account_profiles() to authenticated;
create or replace function public.admin_account_profiles()
returns table(id uuid,full_name text,phone text,role text,disabled boolean,created_at timestamptz,email text)
language sql set search_path='' as $$ select * from private.admin_account_profiles(); $$;
revoke all on function public.admin_account_profiles() from public,anon;
grant execute on function public.admin_account_profiles() to authenticated;
create or replace function private.professional_pickup_notice()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 select owner_id into v_user from public.stores where id=new.store_id and not approved and not removed;
 if v_user is not null then
 perform private.professional_notice(v_user,'seller','join','professional:seller:join:'||v_user);
 end if;
 return new;
end $$;
revoke all on function private.professional_pickup_notice() from public,anon,authenticated;
create trigger professional_pickup_notice after insert or update on public.store_pickups for each row execute function private.professional_pickup_notice();
