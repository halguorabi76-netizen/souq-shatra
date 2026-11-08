-- «قابل للتفاوض»: the seller may mark a used listing's price as negotiable.
-- Same function as live; the only change is that details may also carry negotiable=true.
CREATE OR REPLACE FUNCTION public.create_used_listing_simple(p_description text, p_price integer, p_images text[], p_details jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if jsonb_typeof(p_details->'negotiable')='boolean' and (p_details->>'negotiable')::boolean then v_details:=v_details||'{"negotiable":true}'::jsonb; end if;
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
end $function$;
notify pgrst,'reload schema';
