-- «بِع غرضك» made simple: several photos and one description box. The title is the first line of the
-- description. The price may be left empty («السعر عند التواصل»). Cars and motorcycles add a few
-- details (make and model, year, mileage, gearbox, fuel, colour).

alter table public.used_listings add column if not exists image_paths text[] not null default '{}';
alter table public.used_listings add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.used_listings alter column price drop not null;
alter table public.used_listings drop constraint if exists used_listings_description_check;
alter table public.used_listings add constraint used_listings_description_check check(char_length(description)<=1500);
alter table public.used_listings drop constraint if exists used_listings_images_check;
alter table public.used_listings add constraint used_listings_images_check check(cardinality(image_paths)<=8);
alter table public.used_listings drop constraint if exists used_listings_details_check;
alter table public.used_listings add constraint used_listings_details_check check(pg_column_size(details)<2000);

create or replace function public.create_used_listing_simple(p_description text,p_price integer,p_images text[],p_details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); cfg public.platform_settings%rowtype; v_used integer; v_id uuid; v_text text:=btrim(coalesce(p_description,'')); v_title text; v_details jsonb:='{}'::jsonb; k text; img text;
begin
 if v_user is null or not public.is_active_user() then raise exception 'login required'; end if;
 if char_length(v_text) not between 3 and 1500 then raise exception 'invalid description'; end if;
 if p_price is not null and (p_price<0 or p_price>1000000000) then raise exception 'invalid price'; end if;
 if coalesce(cardinality(p_images),0) not between 1 and 8 then raise exception 'photo required'; end if;
 foreach img in array p_images loop
  if img is null or char_length(img)>200 or split_part(img,'/',1)<>v_user::text then raise exception 'invalid image'; end if;
 end loop;
 foreach k in array array['vehicle','make','year','km','gear','fuel','color'] loop
  if jsonb_typeof(p_details->k) in ('string','number') and btrim(p_details->>k)<>'' then v_details:=v_details||jsonb_build_object(k,left(btrim(p_details->>k),60)); end if;
 end loop;
 v_title:=left(btrim(split_part(v_text,E'\n',1)),60);
 if char_length(v_title)<2 then v_title:=left(v_text,60); end if;
 perform pg_advisory_xact_lock(hashtext('used_listing:'||v_user::text));
 select * into cfg from public.platform_settings where id=true;
 select count(*) into v_used from public.used_listings where owner_id=v_user and created_at>=private.used_month_start();
 if v_used>=cfg.used_monthly_limit then raise exception 'monthly_limit'; end if;
 insert into public.used_listings(owner_id,title,description,price,image_path,image_paths,details,expires_at)
 values(v_user,v_title,v_text,p_price,p_images[1],p_images,v_details,now()+make_interval(days=>cfg.used_listing_days))
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.create_used_listing_simple(text,integer,text[],jsonb) from public,anon;
grant execute on function public.create_used_listing_simple(text,integer,text[],jsonb) to authenticated;

notify pgrst,'reload schema';
