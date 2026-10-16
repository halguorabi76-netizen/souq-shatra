-- Sign-in with phone number + password for customers, sellers and delivery workers.
-- The professional-login edge function (service role) turns a phone number into the private
-- sign-in addresses of matching accounts; browsers never see them. Attempts are rate limited.

create table if not exists private.phone_login_limits(
 key text primary key,
 window_start timestamptz not null,
 attempts integer not null
);
alter table private.phone_login_limits enable row level security;
revoke all on private.phone_login_limits from public,anon,authenticated;

create or replace function public.prepare_phone_login(p_phone text,p_role text,p_client_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tail text:=right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),10); v_key text; v_count integer; v_limited boolean:=false; v_emails jsonb;
begin
 if v_tail !~ '^7[0-9]{9}$' or p_role is null or p_role not in ('buyer','seller','driver') or coalesce(p_client_key,'') !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('limited',false,'emails','[]'::jsonb);
 end if;
 delete from private.phone_login_limits where window_start<now()-interval '1 day';
 for v_key in select k from unnest(array['ip:'||p_client_key,'phone:'||v_tail]) k order by k loop
  insert into private.phone_login_limits as l(key,window_start,attempts) values(v_key,now(),1)
  on conflict(key) do update set
   attempts=case when l.window_start<now()-interval '15 minutes' then 1 else least(l.attempts+1,10000) end,
   window_start=case when l.window_start<now()-interval '15 minutes' then now() else l.window_start end
  returning attempts into v_count;
  if v_count>(case when left(v_key,3)='ip:' then 60 else 10 end) then v_limited:=true; end if;
 end loop;
 if v_limited then return jsonb_build_object('limited',true,'emails','[]'::jsonb); end if;
 select coalesce(jsonb_agg(email),'[]'::jsonb) into v_emails from (
  select u.email from public.profiles p join auth.users u on u.id=p.id
  where not p.disabled and u.email is not null
   and (right(regexp_replace(coalesce(p.phone,''),'[^0-9]','','g'),10)=v_tail
    or right(regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'),10)=v_tail
    or p_role='seller' and exists(select 1 from public.stores s where s.owner_id=p.id and not s.removed and right(regexp_replace(coalesce(s.phone,''),'[^0-9]','','g'),10)=v_tail)
    or p_role='driver' and exists(select 1 from public.driver_profiles d where d.user_id=p.id and right(regexp_replace(coalesce(d.phone,''),'[^0-9]','','g'),10)=v_tail))
   and (p_role='buyer'
    or p_role='seller' and exists(select 1 from public.stores s where s.owner_id=p.id and not s.removed)
    or p_role='driver' and (exists(select 1 from public.delivery_workers w where w.user_id=p.id) or exists(select 1 from public.driver_profiles d where d.user_id=p.id)))
  order by u.created_at desc limit 3) m;
 return jsonb_build_object('limited',false,'emails',v_emails);
end $$;
revoke all on function public.prepare_phone_login(text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_phone_login(text,text,text) to service_role;

notify pgrst,'reload schema';
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
