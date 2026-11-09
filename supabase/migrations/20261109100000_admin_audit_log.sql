-- Admin activity log: every insert, change or removal an admin makes on the main tables
-- is recorded with who did it and when. Only admins can read the log; nobody can edit it.
create table if not exists public.admin_audit(
  id bigint generated always as identity primary key,
  actor uuid,
  actor_name text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name text not null,
  row_id text,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit(created_at desc);
alter table public.admin_audit enable row level security;
drop policy if exists admin_audit_read on public.admin_audit;
create policy admin_audit_read on public.admin_audit for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.admin_audit from anon, authenticated;
grant select on public.admin_audit to authenticated;

create or replace function private.log_admin_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_old jsonb; v_new jsonb; v_changes jsonb:='{}'::jsonb; k text; v_id text;
begin
  if auth.uid() is null or not public.is_admin() then return coalesce(new, old); end if;
  v_old:=case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new:=case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_id:=coalesce(v_new->>'id', v_old->>'id', v_new->>'user_id', v_old->>'user_id', v_new->>'store_id', v_old->>'store_id');
  if tg_op='UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if v_new->k is distinct from v_old->k then v_changes:=v_changes||jsonb_build_object(k, jsonb_build_object('from',v_old->k,'to',v_new->k)); end if;
    end loop;
    if v_changes='{}'::jsonb then return new; end if;
  elsif tg_op='INSERT' then v_changes:=v_new;
  else v_changes:=v_old;
  end if;
  if octet_length(v_changes::text)>8000 then v_changes:=jsonb_build_object('note','تغيير كبير، اختُصر في السجل'); end if;
  insert into public.admin_audit(actor,actor_name,action,table_name,row_id,changes)
  values(auth.uid(),(select full_name from public.profiles where id=auth.uid()),tg_op,tg_table_name,v_id,v_changes);
  return coalesce(new, old);
end $$;
revoke all on function private.log_admin_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['stores','products','product_variants','used_listings','profiles','platform_settings','delivery_settings','delivery_config','delivery_zones','delivery_workers','driver_profiles','home_banners','catalog_categories','professional_invites','orders','delivery_payments','workspace_reset_phones'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists admin_audit_%1$s on public.%1$I', t);
      execute format('create trigger admin_audit_%1$s after insert or update or delete on public.%1$I for each row execute function private.log_admin_change()', t);
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
