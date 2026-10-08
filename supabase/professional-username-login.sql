-- Username lookup is restricted to the password-authentication backend.
create table if not exists private.professional_login_limits (
 key text primary key,
 window_start timestamptz not null,
 attempts integer not null
);
alter table private.professional_login_limits enable row level security;
create index if not exists professional_login_limits_expiry on private.professional_login_limits(window_start);
revoke all on private.professional_login_limits from public,anon,authenticated;

create or replace function private.prepare_professional_login(p_username text,p_role text,p_client_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_username text:=lower(trim(p_username)); v_key text; v_count integer; v_limited boolean:=false; v_email text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'backend required'; end if;
 if p_role not in ('seller','driver') or p_role is null or v_username is null or v_username !~ '^[a-z][a-z0-9_]{2,29}$' or p_client_key is null or p_client_key !~ '^[a-f0-9]{64}$' then return jsonb_build_object('limited',false,'email',null);end if;
 delete from private.professional_login_limits where window_start<now()-interval '1 day';
 -- Stable lock order and atomic increments across concurrent Edge instances.
 for v_key in select k from unnest(array['ip:'||p_client_key,'user:'||v_username]) k order by k loop
  insert into private.professional_login_limits as l(key,window_start,attempts) values(v_key,now(),1)
  on conflict(key) do update set
   attempts=case when l.window_start<now()-interval '15 minutes' then 1 else least(l.attempts+1,10000) end,
   window_start=case when l.window_start<now()-interval '15 minutes' then now() else l.window_start end
  returning attempts into v_count;
  if v_count>(case when left(v_key,3)='ip:' then 60 else 20 end) then v_limited:=true;end if;
 end loop;
 if v_limited then return jsonb_build_object('limited',true,'email',null);end if;
 select u.email into v_email from public.profiles p join auth.users u on u.id=p.id
 where lower(p.username)=v_username and not p.disabled
 and (p_role='seller' and exists(select 1 from public.stores s where s.owner_id=p.id and not s.removed)
 or p_role='driver' and exists(select 1 from public.delivery_workers w where w.user_id=p.id));
 return jsonb_build_object('limited',false,'email',v_email);
end;$$;
create or replace function public.prepare_professional_login(p_username text,p_role text,p_client_key text)
returns jsonb language sql security invoker set search_path='' as $$select private.prepare_professional_login(p_username,p_role,p_client_key);$$;
revoke all on function private.prepare_professional_login(text,text,text),public.prepare_professional_login(text,text,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.prepare_professional_login(text,text,text),public.prepare_professional_login(text,text,text) to service_role;
