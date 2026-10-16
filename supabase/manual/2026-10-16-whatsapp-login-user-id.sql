-- WhatsApp usernames: Meta may now send the sender's WhatsApp user ID (from_user_id) instead of
-- their phone number. A sign-in is confirmed by either; accounts created from a user ID are found
-- again through app_metadata.wa_user_id.

alter table private.whatsapp_logins add column if not exists wa_user_id text check(wa_user_id is null or wa_user_id ~ '^[A-Za-z0-9._:-]{3,100}$');

create or replace function public.whatsapp_login_confirm(p_code text,p_phone text,p_wa_user_id text) returns boolean language plpgsql security definer set search_path='' as $$
declare v_phone text:=nullif(p_phone,''); v_user text:=nullif(p_wa_user_id,'');
begin
 if p_code !~ '^[0-9]{6}$' or (v_phone is null and v_user is null) then return false; end if;
 if v_phone is not null and v_phone !~ '^[0-9]{8,15}$' then return false; end if;
 if v_user is not null and v_user !~ '^[A-Za-z0-9._:-]{3,100}$' then return false; end if;
 update private.whatsapp_logins set phone=v_phone,wa_user_id=v_user,verified_at=now()
  where code=p_code and consumed_at is null and verified_at is null and expires_at>now();
 return found;
end $$;

-- Kept for the previous edge function version.
create or replace function public.whatsapp_login_confirm(p_code text,p_phone text) returns boolean language sql security definer set search_path='' as $$
 select public.whatsapp_login_confirm(p_code,p_phone,null)
$$;

create or replace function public.whatsapp_login_claim(p_code text,p_secret_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.whatsapp_logins; v_user auth.users;
begin
 select * into r from private.whatsapp_logins where code=p_code and secret_hash=p_secret_hash and consumed_at is null for update;
 if not found or (r.verified_at is null and r.expires_at<=now()) then return jsonb_build_object('status','expired'); end if;
 if r.verified_at is null then return jsonb_build_object('status','pending'); end if;
 update private.whatsapp_logins set consumed_at=now() where id=r.id;
 if r.phone is not null then select * into v_user from auth.users where phone=r.phone limit 1; end if;
 if v_user.id is null and r.wa_user_id is not null then select * into v_user from auth.users where raw_app_meta_data->>'wa_user_id'=r.wa_user_id limit 1; end if;
 return jsonb_build_object('status','verified','phone',r.phone,'wa_user_id',r.wa_user_id,'user_id',v_user.id,'email',v_user.email);
end $$;

revoke all on function public.whatsapp_login_confirm(text,text,text),public.whatsapp_login_confirm(text,text),public.whatsapp_login_claim(text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_login_confirm(text,text,text),public.whatsapp_login_confirm(text,text),public.whatsapp_login_claim(text,text) to service_role;

notify pgrst,'reload schema';
