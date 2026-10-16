-- Join requests reach the admin page: someone who wants to sell or deliver leaves their details
-- from the sign-up form (no account needed yet). The admin sees them with a bell notice, approves
-- (which approves the number for sign-up) or rejects. Admins can also reject a pending driver.

create table if not exists public.professional_join_requests(
 id uuid primary key default gen_random_uuid(),
 phone_tail text not null check(phone_tail ~ '^7[0-9]{9}$'),
 role text not null check(role in ('seller','driver')),
 full_name text not null check(char_length(btrim(full_name)) between 2 and 120),
 details jsonb not null default '{}'::jsonb check(pg_column_size(details)<4000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 decided_at timestamptz
);
create unique index if not exists professional_join_requests_open on public.professional_join_requests(phone_tail,role) where status='pending';
alter table public.professional_join_requests enable row level security;
revoke all on public.professional_join_requests from anon,authenticated;

-- Public: leave a request. One open request per number and role; a global brake against floods.
create or replace function public.request_professional_join(p_phone text,p_role text,p_name text,p_details jsonb) returns text language plpgsql security definer set search_path='' as $$
declare v_tail text:=private.phone_tail(p_phone); v_id uuid; v_admin uuid; v_details jsonb:='{}'::jsonb; k text;
begin
 if v_tail !~ '^7[0-9]{9}$' then raise exception 'invalid phone'; end if;
 if p_role not in ('seller','driver') then raise exception 'invalid role'; end if;
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'invalid name'; end if;
 if exists(select 1 from public.professional_invites where phone_tail=v_tail and role=p_role and used_at is null) then return 'approved'; end if;
 if (select count(*) from public.professional_join_requests where created_at>now()-interval '1 hour')>=40 then raise exception 'busy'; end if;
 foreach k in array array['zone','address','store_name','store_kind','store_desc','vehicle','lat','lon'] loop
  if jsonb_typeof(p_details->k) in ('string','number') then v_details:=v_details||jsonb_build_object(k,left(p_details->>k,300)); end if;
 end loop;
 select id into v_id from public.professional_join_requests where phone_tail=v_tail and role=p_role and status='pending';
 if v_id is not null then
  update public.professional_join_requests set full_name=btrim(p_name),details=v_details,created_at=now() where id=v_id;
  return 'pending';
 end if;
 insert into public.professional_join_requests(phone_tail,role,full_name,details) values(v_tail,p_role,btrim(p_name),v_details) returning id into v_id;
 for v_admin in select p.id from public.profiles p where p.role='admin' and not p.disabled loop
  insert into public.account_notifications(recipient_id,event_key,event_kind,title,body)
  values(v_admin,'join:'||v_id,'join_request',case when p_role='seller' then 'طلب انضمام كبائع' else 'طلب انضمام كسائق توصيل' end,btrim(p_name)||' · 0'||v_tail||' — افتح «موافقة بائع أو سائق» للموافقة أو الرفض')
  on conflict(recipient_id,event_key) do nothing;
 end loop;
 return 'sent';
end $$;

create or replace function public.admin_join_requests() returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_admin();
 return query select jsonb_build_object('id',r.id,'phone','0'||r.phone_tail,'role',r.role,'name',r.full_name,'details',r.details,'created_at',r.created_at)
  from public.professional_join_requests r where r.status='pending' order by r.created_at desc limit 200;
end $$;

-- Approve = approve the number for sign-up; reject = close the request.
create or replace function public.admin_decide_join_request(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.professional_join_requests;
begin
 perform private.require_admin();
 select * into r from public.professional_join_requests where id=p_id and status='pending' for update;
 if not found then raise exception 'request not found'; end if;
 if p_approve then
  insert into public.professional_invites(phone_tail,role,note) values(r.phone_tail,r.role,left(r.full_name,200)) on conflict(phone_tail,role) do nothing;
 end if;
 update public.professional_join_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_at=now() where id=p_id;
 update public.account_notifications set read_at=now() where event_key='join:'||p_id and read_at is null;
end $$;

-- Reject a driver who is not approved: their application is removed and the account is a customer again.
create or replace function public.admin_reject_driver(p_driver uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if exists(select 1 from public.delivery_workers where user_id=p_driver and approved) then raise exception 'stop the driver first'; end if;
 delete from public.driver_profiles where user_id=p_driver;
 if exists(select 1 from public.orders where driver_id=p_driver) or exists(select 1 from public.delivery_payments where driver_id=p_driver) or exists(select 1 from public.delivery_declines where driver_id=p_driver) then
  update public.delivery_workers set approved=false where user_id=p_driver;
 else
  delete from public.delivery_workers where user_id=p_driver;
 end if;
 update public.profiles set role='buyer' where id=p_driver and role='driver';
 insert into public.account_notifications(recipient_id,event_key,event_kind,title,body)
 values(p_driver,'driver:rejected:'||gen_random_uuid(),'approval','لم تتم الموافقة على طلب التوصيل','تواصل مع الدعم لمعرفة التفاصيل. يمكنك الاستمرار في استخدام حسابك كزبون.');
end $$;

revoke all on function public.request_professional_join(text,text,text,jsonb),public.admin_join_requests(),public.admin_decide_join_request(uuid,boolean),public.admin_reject_driver(uuid) from public,anon;
grant execute on function public.request_professional_join(text,text,text,jsonb) to anon,authenticated;
grant execute on function public.admin_join_requests(),public.admin_decide_join_request(uuid,boolean),public.admin_reject_driver(uuid) to authenticated;

notify pgrst,'reload schema';
