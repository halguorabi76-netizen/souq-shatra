-- The admin activates WhatsApp sign-in from the admin page instead of the Supabase dashboard.
-- The Meta app secret is write-only: the admin can replace it but no browser can read it back.

create table if not exists private.whatsapp_login_config(
 id integer primary key default 1 check(id=1),
 number text check(number is null or number ~ '^[0-9]{8,15}$'),
 verify_token text not null default replace(gen_random_uuid()::text,'-',''),
 app_secret text check(app_secret is null or length(app_secret) between 16 and 200),
 updated_at timestamptz not null default now(),
 last_webhook_at timestamptz,
 last_login_at timestamptz
);
insert into private.whatsapp_login_config(id) values(1) on conflict do nothing;
alter table private.whatsapp_login_config enable row level security;
revoke all on private.whatsapp_login_config from public,anon,authenticated;

-- What the admin page shows (never the secret itself).
create or replace function public.admin_whatsapp_login_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.whatsapp_login_config;
begin
 perform private.require_admin();
 select * into c from private.whatsapp_login_config where id=1;
 return jsonb_build_object('number',c.number,'verify_token',c.verify_token,'has_secret',c.app_secret is not null,
  'enabled',c.number is not null and c.app_secret is not null,'last_webhook_at',c.last_webhook_at,'last_login_at',c.last_login_at,'updated_at',c.updated_at);
end $$;

-- Saves the number and, when given, a new app secret (empty keeps the stored one).
create or replace function public.admin_save_whatsapp_login(p_number text,p_app_secret text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_number text:=regexp_replace(coalesce(p_number,''),'[^0-9]','','g');
begin
 perform private.require_admin();
 if v_number like '00%' then v_number:=substr(v_number,3); end if;
 if v_number like '07%' then v_number:='964'||substr(v_number,2); end if;
 if v_number<>'' and v_number !~ '^[0-9]{8,15}$' then raise exception 'رقم واتساب غير صحيح'; end if;
 if nullif(trim(coalesce(p_app_secret,'')),'') is not null and length(trim(p_app_secret)) not between 16 and 200 then raise exception 'المفتاح السري غير صحيح'; end if;
 update private.whatsapp_login_config set number=nullif(v_number,''),
  app_secret=coalesce(nullif(trim(coalesce(p_app_secret,'')),''),app_secret),updated_at=now() where id=1;
 return public.admin_whatsapp_login_status();
end $$;

-- Read by the whatsapp-login edge function only.
create or replace function public.whatsapp_login_config() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('number',number,'verify_token',verify_token,'app_secret',app_secret) from private.whatsapp_login_config where id=1
$$;
create or replace function public.whatsapp_login_seen(p_kind text) returns void language sql security definer set search_path='' as $$
 update private.whatsapp_login_config set last_webhook_at=case when p_kind='webhook' then now() else last_webhook_at end,
  last_login_at=case when p_kind='login' then now() else last_login_at end where id=1
$$;

revoke all on function public.admin_whatsapp_login_status(),public.admin_save_whatsapp_login(text,text),public.whatsapp_login_config(),public.whatsapp_login_seen(text) from public,anon,authenticated;
grant execute on function public.admin_whatsapp_login_status(),public.admin_save_whatsapp_login(text,text) to authenticated;
grant execute on function public.whatsapp_login_config(),public.whatsapp_login_seen(text) to service_role;

notify pgrst,'reload schema';
