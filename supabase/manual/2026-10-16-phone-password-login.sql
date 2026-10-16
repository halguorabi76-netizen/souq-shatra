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
