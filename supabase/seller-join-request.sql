create or replace function public.request_seller_join(p_first text,p_last text,p_name text,p_phone text,p_address text,p_description text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_store public.stores%rowtype;
begin
 if v_user is null then raise exception 'sign in required'; end if;
 perform 1 from public.profiles where id=v_user and not disabled for update;
 if not found then raise exception 'account disabled or unavailable'; end if;
 if length(trim(coalesce(p_first,''))) not between 1 and 80 or length(trim(coalesce(p_last,''))) not between 1 and 80
 or length(trim(coalesce(p_name,''))) not between 2 and 100 or coalesce(p_phone,'') !~ '^[0-9]{10,15}$'
 or length(trim(coalesce(p_address,''))) not between 3 and 500 or length(coalesce(p_description,''))>1000 then raise exception 'invalid seller details'; end if;
 select * into v_store from public.stores where owner_id=v_user for update;
 if found and (v_store.approved or v_store.removed) then raise exception 'store already approved or removed'; end if;
 update public.profiles set full_name=trim(p_first)||' '||trim(p_last),phone=p_phone where id=v_user;
 if v_store.id is null then
  insert into public.stores(owner_id,name,phone,address,description,approved,removed)
  values(v_user,trim(p_name),p_phone,trim(p_address),trim(coalesce(p_description,'')),false,false) returning * into v_store;
 else
  update public.stores set name=trim(p_name),phone=p_phone,address=trim(p_address),description=trim(coalesce(p_description,'')) where id=v_store.id returning * into v_store;
 end if;
 return v_store.id;
end; $$;
revoke all on function public.request_seller_join(text,text,text,text,text,text) from public,anon;
grant execute on function public.request_seller_join(text,text,text,text,text,text) to authenticated;
drop policy if exists "approved seller insert restriction" on public.products;
create policy "approved seller insert restriction" on public.products as restrictive for insert to authenticated with check(public.can_manage_approved_store(store_id));
drop policy if exists "approved seller update restriction" on public.products;
create policy "approved seller update restriction" on public.products as restrictive for update to authenticated using(public.can_manage_approved_store(store_id)) with check(public.can_manage_approved_store(store_id));
drop policy if exists "approved seller delete restriction" on public.products;
create policy "approved seller delete restriction" on public.products as restrictive for delete to authenticated using(public.can_manage_approved_store(store_id));
