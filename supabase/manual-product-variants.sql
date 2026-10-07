CREATE OR REPLACE FUNCTION private.product_inventory_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='UPDATE' and old.has_variants and not new.has_variants and exists(select 1 from public.product_variants where product_id=old.id and not archived) then raise exception 'archive variants first'; end if;
 if new.has_variants then
 new.stock:=coalesce((select sum(stock) from public.product_variants where product_id=new.id and not archived and available),0);
 if new.attributes->>'_manual_variants' is distinct from 'true' then new.price:=coalesce((select min(coalesce(sale_price,price)) from public.product_variants where product_id=new.id and not archived),new.price); new.compare_at_price:=null; end if;
 elsif tg_op='UPDATE' and new.stock<>old.stock then
 insert into public.product_stock_movements(store_id,product_id,product_name,delta,balance,reason,actor_id,order_id) values(new.store_id,new.id,new.name,new.stock-old.stock,new.stock,coalesce(nullif(current_setting('souq.inventory_reason',true),''),'inventory_edit'),auth.uid(),nullif(current_setting('souq.inventory_order',true),'')::uuid);
 end if;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION private.validate_catalog_attributes(p_category uuid, p_values jsonb, p_variant boolean, p_product_attributes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d jsonb; k text; v jsonb; defs jsonb; customs jsonb;
begin
 if jsonb_typeof(p_values) is distinct from 'object' or octet_length(p_values::text)>20000 then raise exception 'invalid attributes'; end if;
 customs:=private.product_custom_definitions(p_product_attributes);

 defs:=private.catalog_definitions(p_category);
 if p_category is not null and defs is null then raise exception 'category unavailable'; end if;
 defs:=coalesce(defs,'[]')||customs;
 if p_variant and (select count(*) from jsonb_object_keys(p_values))>12 then raise exception 'too many variant axes'; end if;
 for k,v in select * from jsonb_each(p_values) loop
  if not p_variant and k in ('_custom_options','_color_swatches') then continue; end if;
  select value into d from jsonb_array_elements(defs) where value->>'key'=k limit 1;
  if d is null then
   if p_variant or k like 'custom\_%' escape '\' then raise exception 'invalid attribute %',k; else continue; end if;
  end if;
  if p_variant and not coalesce((d->>'variant')::boolean,false) then raise exception 'invalid attribute %',k; end if;
  if jsonb_typeof(v) is distinct from 'string' or length(trim(v#>>'{}')) not between 1 and 500 then raise exception 'invalid attribute value'; end if;
  if d->>'type'='number' and (v#>>'{}')!~'^[0-9]+([.][0-9]+)?$' then raise exception 'invalid numeric attribute'; end if;
  if d->>'type'='date' then
   if (v#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid date'; end if;
   perform (v#>>'{}')::date;
  end if;
  -- Options are suggestions: uncommon colors, sizes and merchant values stay usable.
 end loop;
end; $function$;

CREATE OR REPLACE FUNCTION private.variant_inventory_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.products%rowtype; delta integer;
begin
 select * into p from public.products where id=new.product_id;
 delta:=new.stock-case when tg_op='UPDATE' then old.stock else 0 end;
 if delta<>0 then insert into public.product_stock_movements(store_id,product_id,variant_id,product_name,variant_label,delta,balance,reason,actor_id,order_id) values(p.store_id,p.id,new.id,p.name,new.label,delta,new.stock,coalesce(nullif(current_setting('souq.inventory_reason',true),''),'inventory_edit'),auth.uid(),nullif(current_setting('souq.inventory_order',true),'')::uuid); end if;
 update public.products set stock=coalesce((select sum(stock) from public.product_variants where product_id=new.product_id and not archived and available),0),price=case when p.attributes->>'_manual_variants'='true' then price else coalesce((select min(coalesce(sale_price,price)) from public.product_variants where product_id=new.product_id and not archived),price) end,compare_at_price=case when p.attributes->>'_manual_variants'='true' then compare_at_price else null end where id=new.product_id and has_variants;
 return new;
end; $function$;
