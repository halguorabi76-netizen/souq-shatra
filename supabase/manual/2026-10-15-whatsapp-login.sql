-- Free WhatsApp sign-in ("reverse code"): the customer sends a short code from their own
-- WhatsApp to the Souq Al-Shatra number. Receiving messages costs nothing, and the sender's
-- number proves ownership of the phone. Only the whatsapp-login edge function (service role)
-- touches these records; browsers never read them.

create table if not exists private.whatsapp_logins(
 id uuid primary key default gen_random_uuid(),
 code text not null check(code ~ '^[0-9]{6}$'),
 secret_hash text not null check(secret_hash ~ '^[0-9a-f]{64}$'),
 client_key text not null,
 phone text check(phone is null or phone ~ '^[0-9]{8,15}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 verified_at timestamptz,
 consumed_at timestamptz
);
-- One live request per code; finished or expired rows no longer block reuse.
create unique index if not exists whatsapp_logins_live_code on private.whatsapp_logins(code) where consumed_at is null;
create index if not exists whatsapp_logins_client on private.whatsapp_logins(client_key,created_at);
alter table private.whatsapp_logins enable row level security;
revoke all on private.whatsapp_logins from public,anon,authenticated;

-- Starts a request and returns its 6-digit code, or {limited:true}.
create or replace function public.whatsapp_login_start(p_secret_hash text,p_client_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_code text;
begin
 delete from private.whatsapp_logins where created_at<now()-interval '1 day';
 update private.whatsapp_logins set consumed_at=now() where consumed_at is null and expires_at<now();
 if (select count(*) from private.whatsapp_logins where client_key=p_client_key and created_at>now()-interval '10 minutes')>=5 then return jsonb_build_object('limited',true); end if;
 for i in 1..20 loop
  v_code:=lpad((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint % 1000000)::text,6,'0');
  begin
   insert into private.whatsapp_logins(code,secret_hash,client_key) values(v_code,p_secret_hash,p_client_key);
   return jsonb_build_object('code',v_code);
  exception when unique_violation then null;
  end;
 end loop;
 raise exception 'no free code';
end $$;

-- Called for each incoming WhatsApp message: links the sender's number to a live code.
create or replace function public.whatsapp_login_confirm(p_code text,p_phone text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_code !~ '^[0-9]{6}$' or p_phone !~ '^[0-9]{8,15}$' then return false; end if;
 update private.whatsapp_logins set phone=p_phone,verified_at=now()
  where code=p_code and consumed_at is null and verified_at is null and expires_at>now();
 return found;
end $$;

-- The browser that started the request (holder of the secret) collects the result once.
create or replace function public.whatsapp_login_claim(p_code text,p_secret_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.whatsapp_logins; v_user auth.users;
begin
 select * into r from private.whatsapp_logins where code=p_code and secret_hash=p_secret_hash and consumed_at is null for update;
 if not found or (r.verified_at is null and r.expires_at<=now()) then return jsonb_build_object('status','expired'); end if;
 if r.verified_at is null then return jsonb_build_object('status','pending'); end if;
 update private.whatsapp_logins set consumed_at=now() where id=r.id;
 select * into v_user from auth.users where phone=r.phone limit 1;
 return jsonb_build_object('status','verified','phone',r.phone,'user_id',v_user.id,'email',v_user.email);
end $$;

revoke all on function public.whatsapp_login_start(text,text),public.whatsapp_login_confirm(text,text),public.whatsapp_login_claim(text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_login_start(text,text),public.whatsapp_login_confirm(text,text),public.whatsapp_login_claim(text,text) to service_role;

notify pgrst,'reload schema';
