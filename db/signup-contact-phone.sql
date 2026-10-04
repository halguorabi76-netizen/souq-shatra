create or replace function public.new_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,full_name,phone)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),
 case when coalesce(new.raw_user_meta_data->>'contact_phone','') ~ '^[0-9]{10,15}$'
 then new.raw_user_meta_data->>'contact_phone' else '' end);
 return new;
end;
$$;