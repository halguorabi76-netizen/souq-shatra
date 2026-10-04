-- Seller workspace: additive changes; existing records remain intact.
alter table public.stores add column if not exists storefront_settings jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists sku text not null default '';
alter table public.products add column if not exists variant text not null default '';
alter table public.products add column if not exists low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0);
grant update(storefront_settings) on public.stores to authenticated;
grant update(sku,variant,low_stock_threshold) on public.products to authenticated;
create table if not exists public.seller_workspace_settings (
 store_id uuid primary key references public.stores(id) on delete cascade,
 settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 16000),
 updated_at timestamptz not null default now()
);
alter table public.seller_workspace_settings enable row level security;
revoke all on public.seller_workspace_settings from anon, authenticated;
grant select, insert, update on public.seller_workspace_settings to authenticated;
create policy "approved owner reads workspace" on public.seller_workspace_settings for select to authenticated using (public.can_manage_approved_store(store_id));
create policy "approved owner adds workspace" on public.seller_workspace_settings for insert to authenticated with check (public.can_manage_approved_store(store_id));
create policy "approved owner edits workspace" on public.seller_workspace_settings for update to authenticated using (public.can_manage_approved_store(store_id)) with check (public.can_manage_approved_store(store_id));
create or replace function public.save_seller_workspace(p_store uuid,p_settings jsonb,p_appearance jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 if not public.can_manage_approved_store(p_store) then raise exception 'متجرك غير معتمد أو لا تملك صلاحية تعديله'; end if;
 if jsonb_typeof(p_appearance) <> 'object' or jsonb_typeof(p_settings) <> 'object' then raise exception 'إعدادات غير صحيحة'; end if;
 if coalesce(p_appearance->>'color','red') not in ('red','blue','green','violet','brown') or coalesce(p_appearance->>'mode','light') not in ('light','dark') or coalesce(p_appearance->>'icons','outline') not in ('outline','soft') then raise exception 'اختر مظهرًا صحيحًا'; end if;
 update public.stores set storefront_settings = jsonb_build_object('color',coalesce(p_appearance->>'color','red'),'mode',coalesce(p_appearance->>'mode','light'),'icons',coalesce(p_appearance->>'icons','outline')) where id=p_store;
 if not found then raise exception 'تعذر تحديث المتجر'; end if;
 insert into public.seller_workspace_settings(store_id,settings,updated_at) values(p_store,p_settings,now()) on conflict(store_id) do update set settings=excluded.settings,updated_at=excluded.updated_at;
end;
$$;
revoke all on function public.save_seller_workspace(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_seller_workspace(uuid,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
