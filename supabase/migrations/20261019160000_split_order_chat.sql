-- Order chats split in two: the customer talks to the store (products, changes, preparation) and,
-- separately, to the driver (location, arrival, hand-over). Each thread has only its two people.
-- Old shared «order» threads stay readable.

alter table public.chat_messages drop constraint if exists chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check check(kind in ('used','order','store','driver'));

create or replace function private.chat_members(p_kind text,p_ref uuid,p_buyer uuid) returns uuid[] language sql stable security definer set search_path='' as $$
 select case p_kind
  when 'used' then (select array[p_buyer,l.owner_id] from public.used_listings l where l.id=p_ref and l.owner_id<>p_buyer)
  when 'order' then (select array_remove(array[o.buyer_id,s.owner_id,o.driver_id],null) from public.orders o join public.stores s on s.id=o.store_id where o.id=p_ref and o.buyer_id=p_buyer)
  when 'store' then (select array[o.buyer_id,s.owner_id] from public.orders o join public.stores s on s.id=o.store_id where o.id=p_ref and o.buyer_id=p_buyer and s.owner_id<>o.buyer_id)
  when 'driver' then (select array[o.buyer_id,o.driver_id] from public.orders o where o.id=p_ref and o.buyer_id=p_buyer and o.driver_id is not null and o.driver_id<>o.buyer_id)
 end
$$;
revoke all on function private.chat_members(text,uuid,uuid) from public,anon,authenticated;

create or replace function public.send_chat_message(p_kind text,p_ref uuid,p_buyer uuid,p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_members uuid[]; v_id uuid; v_name text; v_title text; v_body text:=btrim(coalesce(p_body,'')); r uuid;
begin
 if v_user is null or not public.is_active_user() then raise exception 'login required'; end if;
 if p_kind not in ('used','order','store','driver') or char_length(v_body) not between 1 and 1000 then raise exception 'invalid message'; end if;
 v_members:=private.chat_members(p_kind,p_ref,p_buyer);
 if v_members is null or not v_user=any(v_members) then raise exception 'not allowed'; end if;
 if p_kind='used' then
  -- Only the interested buyer opens a used-item thread, and only while the item is on sale.
  if not exists(select 1 from public.chat_messages where kind='used' and ref_id=p_ref and buyer_id=p_buyer) then
   if v_user<>p_buyer then raise exception 'not allowed'; end if;
   if not exists(select 1 from public.used_listings where id=p_ref and status='active' and expires_at>now()) then raise exception 'item unavailable'; end if;
  end if;
 end if;
 if (select count(*) from public.chat_messages where sender_id=v_user and created_at>now()-interval '1 minute')>=20 then raise exception 'too many messages'; end if;
 insert into public.chat_messages(kind,ref_id,buyer_id,sender_id,body) values(p_kind,p_ref,p_buyer,v_user,v_body) returning id into v_id;
 select nullif(btrim(full_name),'') into v_name from public.profiles where id=v_user;
 v_title:=case when p_kind='used' then 'رسالة عن «'||coalesce((select title from public.used_listings where id=p_ref),'غرض')||'»'
  when p_kind='driver' then 'رسالة التوصيل · الطلب #'||upper(right(p_ref::text,6))
  when p_kind='store' then 'رسالة المتجر · الطلب #'||upper(right(p_ref::text,6))
  else 'رسالة عن الطلب #'||upper(right(p_ref::text,6)) end;
 foreach r in array v_members loop
  if r<>v_user then
   insert into public.account_notifications(recipient_id,event_key,event_kind,title,body)
   values(r,'chat:'||p_kind||':'||p_ref||':'||p_buyer,'message',v_title,coalesce(v_name,'')||': '||left(v_body,120))
   on conflict(recipient_id,event_key) do update set title=excluded.title,body=excluded.body,read_at=null,created_at=now();
  end if;
 end loop;
 return v_id;
end $$;
revoke all on function public.send_chat_message(text,uuid,uuid,text) from public,anon;
grant execute on function public.send_chat_message(text,uuid,uuid,text) to authenticated;

create or replace function private.purge_orders(p_orders uuid[]) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if coalesce(cardinality(p_orders),0)=0 then return 0; end if;
 delete from public.chat_messages where kind in ('order','store','driver') and ref_id=any(p_orders);
 delete from public.delivery_tracking where order_id=any(p_orders);
 delete from public.delivery_events where order_id=any(p_orders);
 delete from public.ledger_entries where order_id=any(p_orders);
 delete from public.orders where id=any(p_orders);
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function private.purge_orders(uuid[]) from public,anon,authenticated;

notify pgrst,'reload schema';
