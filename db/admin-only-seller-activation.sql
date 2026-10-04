
create or replace function public.register_store(p_name text,p_phone text,p_address text,p_description text,p_social_url text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 raise exception 'تفعيل البيع متاح من الإدارة فقط. تواصل معنا لطلب الانضمام.';
end; $$;

create or replace function public.can_manage_approved_store(p_store uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.is_active_user() and (
 public.is_admin() or exists(select 1 from public.stores s where s.id=p_store and s.owner_id=auth.uid() and s.approved and not s.removed));
$$;
revoke all on function public.can_manage_approved_store(uuid) from public,anon;
grant execute on function public.can_manage_approved_store(uuid) to authenticated;

create policy "approved seller insert gate" on public.products as restrictive for insert to authenticated
with check(public.can_manage_approved_store(store_id));
create policy "approved seller update gate" on public.products as restrictive for update to authenticated
using(public.can_manage_approved_store(store_id)) with check(public.can_manage_approved_store(store_id));
create policy "approved seller delete gate" on public.products as restrictive for delete to authenticated
using(public.can_manage_approved_store(store_id));
create policy "approved seller store edit gate" on public.stores as restrictive for update to authenticated
using(public.can_manage_approved_store(id)) with check(public.can_manage_approved_store(id));

create or replace function public.can_upload_store_image(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.stores s join public.profiles p on p.id=s.owner_id
 where s.id::text=split_part(p_path,'/',1) and s.owner_id=auth.uid() and not p.disabled and s.approved and not s.removed);
$$;
create policy "approved seller image delete gate" on storage.objects as restrictive for delete to authenticated
using(bucket_id <> 'products' or exists(select 1 from public.stores s where s.id::text=split_part(name,'/',1) and public.can_manage_approved_store(s.id)));

create or replace function public.admin_activate_seller(p_user uuid,p_name text,p_phone text,p_address text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.is_admin() or not public.is_active_user() then raise exception 'admin required'; end if;
 perform 1 from public.profiles where id=p_user and not disabled for update;
 if not found then raise exception 'account missing or disabled'; end if;
 if length(trim(coalesce(p_name,'')))<2 or length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'))<10 or length(trim(coalesce(p_address,'')))<3 then
 raise exception 'اسم المتجر ورقم الهاتف والعنوان مطلوبة'; end if;
 select id into v_id from public.stores where owner_id=p_user for update;
 if v_id is null then
 insert into public.stores(owner_id,name,phone,address,approved,removed)
 values(p_user,trim(p_name),trim(p_phone),trim(p_address),true,false) returning id into v_id;
 else
 update public.stores set name=trim(p_name),phone=trim(p_phone),address=trim(p_address),approved=true,removed=false where id=v_id;
 end if;
 update public.profiles set role='seller' where id=p_user and role='buyer';
 return v_id;
end; $$;
revoke all on function public.admin_activate_seller(uuid,text,text,text) from public,anon;
grant execute on function public.admin_activate_seller(uuid,text,text,text) to authenticated;
