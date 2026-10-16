-- WhatsApp sign-in replies: with a permanent access token saved from the admin page, the
-- whatsapp-login edge function answers each code message ("تم تأكيد رقمك") inside the free
-- customer-service window. The token is write-only, like the app secret.

alter table private.whatsapp_login_config add column if not exists access_token text check(access_token is null or length(access_token) between 40 and 1000);

create or replace function public.admin_whatsapp_login_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.whatsapp_login_config;
begin
 perform private.require_admin();
 select * into c from private.whatsapp_login_config where id=1;
 return jsonb_build_object('number',c.number,'verify_token',c.verify_token,'has_secret',c.app_secret is not null,'has_token',c.access_token is not null,
  'enabled',c.number is not null and c.app_secret is not null,'last_webhook_at',c.last_webhook_at,'last_login_at',c.last_login_at,'updated_at',c.updated_at);
end $$;

drop function if exists public.admin_save_whatsapp_login(text,text);
create or replace function public.admin_save_whatsapp_login(p_number text,p_app_secret text default null,p_access_token text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_number text:=regexp_replace(coalesce(p_number,''),'[^0-9]','','g'); v_token text:=nullif(trim(coalesce(p_access_token,'')),'');
begin
 perform private.require_admin();
 if v_number like '00%' then v_number:=substr(v_number,3); end if;
 if v_number like '07%' then v_number:='964'||substr(v_number,2); end if;
 if v_number<>'' and v_number !~ '^[0-9]{8,15}$' then raise exception 'رقم واتساب غير صحيح'; end if;
 if nullif(trim(coalesce(p_app_secret,'')),'') is not null and length(trim(p_app_secret)) not between 16 and 200 then raise exception 'المفتاح السري غير صحيح'; end if;
 if v_token is not null and (length(v_token) not between 40 and 1000 or v_token ~ '\s') then raise exception 'رمز الإرسال غير صحيح'; end if;
 update private.whatsapp_login_config set number=nullif(v_number,''),
  app_secret=coalesce(nullif(trim(coalesce(p_app_secret,'')),''),app_secret),
  access_token=coalesce(v_token,access_token),updated_at=now() where id=1;
 return public.admin_whatsapp_login_status();
end $$;

create or replace function public.whatsapp_login_config() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('number',number,'verify_token',verify_token,'app_secret',app_secret,'access_token',access_token) from private.whatsapp_login_config where id=1
$$;

revoke all on function public.admin_whatsapp_login_status(),public.admin_save_whatsapp_login(text,text,text),public.whatsapp_login_config() from public,anon,authenticated;
grant execute on function public.admin_whatsapp_login_status(),public.admin_save_whatsapp_login(text,text,text) to authenticated;
grant execute on function public.whatsapp_login_config() to service_role;

notify pgrst,'reload schema';
