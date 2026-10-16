-- In-app messages and store ratings.
-- Threads: a used item (buyer ↔ owner) or an order (customer ↔ store owner ↔ driver). Members are
-- worked out from the item or order, never trusted from the browser. Every message also refreshes
-- one notification per recipient and thread, so the bell shows it without flooding.
-- Ratings: the customer rates a delivered order (stars + quick tags + short comment); everyone sees
-- the store's average.

create table if not exists public.chat_messages(
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('used','order')),
 ref_id uuid not null,
 buyer_id uuid not null references public.profiles(id) on delete cascade,
 sender_id uuid references public.profiles(id) on delete set null,
 body text not null check(char_length(btrim(body)) between 1 and 1000),
 created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread on public.chat_messages(kind,ref_id,buyer_id,created_at);
create index if not exists chat_messages_recent on public.chat_messages(created_at desc);

create or replace function private.chat_members(p_kind text,p_ref uuid,p_buyer uuid) returns uuid[] language sql stable security definer set search_path='' as $$
 select case p_kind
  when 'used' then (select array[p_buyer,l.owner_id] from public.used_listings l where l.id=p_ref and l.owner_id<>p_buyer)
  when 'order' then (select array_remove(array[o.buyer_id,s.owner_id,o.driver_id],null) from public.orders o join public.stores s on s.id=o.store_id where o.id=p_ref and o.buyer_id=p_buyer)
 end
$$;
revoke all on function private.chat_members(text,uuid,uuid) from public,anon,authenticated;

create or replace function public.chat_can_read(p_kind text,p_ref uuid,p_buyer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (auth.uid()=any(coalesce(private.chat_members(p_kind,p_ref,p_buyer),'{}')) or (public.is_admin() and public.is_active_user()))
$$;
revoke all on function public.chat_can_read(text,uuid,uuid) from public;
grant execute on function public.chat_can_read(text,uuid,uuid) to authenticated;

alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon,authenticated;
grant select on public.chat_messages to authenticated;
drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages for select to authenticated using(public.chat_can_read(kind,ref_id,buyer_id));

create or replace function public.send_chat_message(p_kind text,p_ref uuid,p_buyer uuid,p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_members uuid[]; v_id uuid; v_name text; v_title text; v_body text:=btrim(coalesce(p_body,'')); r uuid;
begin
 if v_user is null or not public.is_active_user() then raise exception 'login required'; end if;
 if p_kind not in ('used','order') or char_length(v_body) not between 1 and 1000 then raise exception 'invalid message'; end if;
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

-- ===== Store ratings =====
create table if not exists public.store_ratings(
 order_id uuid primary key references public.orders(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 buyer_id uuid not null references public.profiles(id) on delete cascade,
 stars integer not null check(stars between 1 and 5),
 tags text[] not null default '{}',
 comment text not null default '' check(char_length(comment)<=300),
 created_at timestamptz not null default now()
);
create index if not exists store_ratings_store on public.store_ratings(store_id);
alter table public.store_ratings enable row level security;
revoke all on public.store_ratings from anon,authenticated;
grant select on public.store_ratings to authenticated;
drop policy if exists store_ratings_read on public.store_ratings;
create policy store_ratings_read on public.store_ratings for select to authenticated using(
 buyer_id=(select auth.uid()) or exists(select 1 from public.stores s where s.id=store_id and s.owner_id=(select auth.uid())) or (select public.is_admin()));

create or replace function public.rate_order(p_order uuid,p_stars integer,p_tags text[],p_comment text) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 select * into o from public.orders where id=p_order;
 if not found or o.buyer_id is distinct from auth.uid() or not public.is_active_user() then raise exception 'not allowed'; end if;
 if o.status<>'delivered' then raise exception 'rate after delivery'; end if;
 if p_stars is null or p_stars not between 1 and 5 then raise exception 'invalid stars'; end if;
 if not coalesce(p_tags,'{}')<@array['سريع','طازج','تغليف ممتاز','سعر مناسب','تعامل راقٍ','مطابق للصورة','تأخر','غير مطابق']::text[] then raise exception 'invalid tags'; end if;
 insert into public.store_ratings(order_id,store_id,buyer_id,stars,tags,comment) values(p_order,o.store_id,o.buyer_id,p_stars,coalesce(p_tags,'{}'),left(btrim(coalesce(p_comment,'')),300))
 on conflict(order_id) do update set stars=excluded.stars,tags=excluded.tags,comment=excluded.comment,created_at=now();
end $$;
revoke all on function public.rate_order(uuid,integer,text[],text) from public,anon;
grant execute on function public.rate_order(uuid,integer,text[],text) to authenticated;

-- Public summary without any customer identity: average, count and the most mentioned good tags.
create or replace function public.store_rating_summary() returns table(store_id uuid,rating numeric,ratings integer,top_tags text[]) language sql stable security definer set search_path='' as $$
 select r.store_id,round(avg(r.stars)::numeric,1),count(*)::integer,
  (select array_agg(t order by n desc) from (select t,count(*) n from public.store_ratings x,unnest(x.tags) t where x.store_id=r.store_id and t not in ('تأخر','غير مطابق') group by t order by n desc limit 3) top)
 from public.store_ratings r join public.stores s on s.id=r.store_id where s.approved and not s.removed group by r.store_id
$$;
revoke all on function public.store_rating_summary() from public;
grant execute on function public.store_rating_summary() to anon,authenticated;

notify pgrst,'reload schema';
