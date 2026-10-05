-- Add store identity and optional real discounts without changing existing prices or orders.
alter table public.stores add column if not exists image_path text;
alter table public.products add column if not exists compare_at_price integer;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.stores'::regclass and conname='store_image_own_folder') then
  alter table public.stores add constraint store_image_own_folder check(image_path is null or (length(image_path)<=400 and image_path like id::text || '/%' and image_path ~ '^[a-zA-Z0-9/_\.\-]+$'));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='product_compare_price_above_sale') then
  alter table public.products add constraint product_compare_price_above_sale check(compare_at_price is null or compare_at_price>price);
 end if;
end $$;
grant update(image_path,description) on public.stores to authenticated;
grant update(compare_at_price) on public.products to authenticated;
notify pgrst, 'reload schema';
