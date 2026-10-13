-- Additive delivery operations. Never rewrites historical orders or inventory.
create table public.delivery_config (
 key text primary key, value numeric not null check(value>=0 and value<=1000000), updated_at timestamptz not null default now()
);
insert into public.delivery_config(key,value) values
 ('ROAD_FACTOR',1.3),('BASE_FEE',1000),('PER_KM_FEE',500),('EXTRA_STORE_FEE',500),('MAX_ROUTE_KM',8),('MAX_STORES',3),('FEE_ROUNDING',250),('STALL_TOTAL_MIN',120),('STALL_STATUS_MIN',90),('MIN_PER_KM',3),('BUFFER_MIN',5),('EXTRA_STORE_MIN',7);
alter table public.delivery_config enable row level security;
revoke all on public.delivery_config from anon,authenticated;
grant select on public.delivery_config to authenticated;
create policy config_read on public.delivery_config for select to authenticated using(public.is_active_user());
alter table public.stores add column prep_time_min integer not null default 10 check(prep_time_min between 0 and 1440);
create table public.delivery_batches (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references public.profiles(id), request_id uuid not null,
 latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180),
 quote jsonb not null, order_ids uuid[] not null default '{}', created_at timestamptz not null default now(), unique(buyer_id,request_id)
);
alter table public.orders add column delivery_batch_id uuid references public.delivery_batches(id);
create index orders_delivery_batch_idx on public.orders(delivery_batch_id);
create table public.delivery_tracking (
 order_id uuid primary key references public.orders(id), stage text not null default 'NEW',
 store_accepted_at timestamptz, ready_at timestamptz, driver_accepted_at timestamptz, picked_up_at timestamptz, on_the_way_at timestamptz, delivered_at timestamptz, cancelled_at timestamptz,
 last_status_at timestamptz not null default now(), queue_rank integer, started_at timestamptz, late_reported_at timestamptz,
 accepted_driver_id uuid references public.profiles(id), prep_time_snapshot integer not null default 10,
 updated_at timestamptz not null default now()
);
create index delivery_queue_idx on public.delivery_tracking(accepted_driver_id,queue_rank);
create table public.delivery_events (
 id bigint generated always as identity primary key, order_id uuid not null references public.orders(id), buyer_id uuid not null references public.profiles(id),
 driver_id uuid references public.profiles(id), store_id uuid not null references public.stores(id), actor_id uuid,
 kind text not null, stage text, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index delivery_events_stats_idx on public.delivery_events(kind,created_at,driver_id,store_id,buyer_id);
alter table public.delivery_batches enable row level security;
alter table public.delivery_tracking enable row level security;
alter table public.delivery_events enable row level security;
revoke all on public.delivery_batches,public.delivery_tracking,public.delivery_events from anon,authenticated;
grant select on public.delivery_tracking,public.delivery_events to authenticated;
create policy batch_read on public.delivery_batches for select to authenticated using(public.is_active_user() and (buyer_id=auth.uid() or public.is_admin()));
create policy tracking_read on public.delivery_tracking for select to authenticated using(public.is_active_user() and exists(select 1 from public.orders o where o.id=order_id and (o.buyer_id=auth.uid() or o.driver_id=auth.uid() or public.owns_store(o.store_id) or public.is_admin())));
create policy events_admin_read on public.delivery_events for select to authenticated using(public.is_active_user() and public.is_admin());

create function private.delivery_settings_json() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_object_agg(key,value) from public.delivery_config$$;
revoke all on function private.delivery_settings_json() from public,anon,authenticated;
create function private.address_has_phone(value text) returns boolean language sql immutable set search_path='' as $$
 select regexp_replace(translate(coalesce(value,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[[:space:]()+.−-]','','g') ~ '[0-9]{7,}'
$$;
revoke all on function private.address_has_phone(text) from public,anon,authenticated;
create function private.road_km(a_lat double precision,a_lng double precision,b_lat double precision,b_lng double precision,factor numeric) returns double precision language sql immutable set search_path='' as $$
 select 6371 * 2 * asin(sqrt(least(1.0,power(sin(radians(b_lat-a_lat)/2),2)+cos(radians(a_lat))*cos(radians(b_lat))*power(sin(radians(b_lng-a_lng)/2),2)))) * factor
$$;
revoke all on function private.road_km(double precision,double precision,double precision,double precision,numeric) from public,anon,authenticated;
create function private.delivery_quote(p_stores uuid[],p_lat double precision,p_lng double precision) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb:=private.delivery_settings_json(); remaining uuid[]; route uuid[]; current_id uuid; next_id uuid; lat double precision; lng double precision; nlat double precision; nlng double precision; km double precision:=0; prep integer; snapshot jsonb;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required';end if;
 if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'حدد موقعك على الخريطة';end if;
 if cardinality(p_stores) not between 1 and 30 or (select count(distinct x) from unnest(p_stores) x)<>cardinality(p_stores) then raise exception 'invalid stores';end if;
 if exists(select 1 from unnest(p_stores) as wanted(store_id) left join public.stores s on s.id=wanted.store_id left join public.store_pickups l on l.store_id=wanted.store_id where s.id is null or not s.approved or s.removed or l.latitude is null or l.longitude is null) then raise exception 'لم يحدد أحد المتاجر موقع الاستلام بعد؛ تواصل مع المتجر';end if;
 current_id:=p_stores[1];route:=array[current_id];remaining:=array_remove(p_stores,current_id);
 select latitude,longitude into lat,lng from public.store_pickups where store_id=current_id;
 while cardinality(remaining)>0 loop
  select store_id,latitude,longitude into next_id,nlat,nlng from public.store_pickups where store_id=any(remaining) order by private.road_km(lat,lng,latitude,longitude,(cfg->>'ROAD_FACTOR')::numeric),store_id limit 1;
  km:=km+private.road_km(lat,lng,nlat,nlng,(cfg->>'ROAD_FACTOR')::numeric);route:=array_append(route,next_id);remaining:=array_remove(remaining,next_id);lat:=nlat;lng:=nlng;
 end loop;
 km:=km+private.road_km(lat,lng,p_lat,p_lng,(cfg->>'ROAD_FACTOR')::numeric);
 select max(s.prep_time_min),jsonb_agg(jsonb_build_object('store',s.id,'lat',l.latitude,'lng',l.longitude,'prep',s.prep_time_min) order by s.id) into prep,snapshot from public.stores s join public.store_pickups l on l.store_id=s.id where s.id=any(p_stores);
 return jsonb_build_object('route',route,'route_km',km,'extra_stores',cardinality(route)-1,'delivery_fee',round(((cfg->>'BASE_FEE')::numeric+km::numeric*(cfg->>'PER_KM_FEE')::numeric+(cardinality(route)-1)*(cfg->>'EXTRA_STORE_FEE')::numeric)/(cfg->>'FEE_ROUNDING')::numeric)*(cfg->>'FEE_ROUNDING')::numeric,
 'expected_min',prep+km*(cfg->>'MIN_PER_KM')::numeric+(cfg->>'BUFFER_MIN')::numeric+(cardinality(route)-1)*(cfg->>'EXTRA_STORE_MIN')::numeric,
 'high_fee',km>(cfg->>'MAX_ROUTE_KM')::numeric or cardinality(route)>(cfg->>'MAX_STORES')::numeric,'fingerprint',md5(cfg::text||snapshot::text),'config',cfg);
end $$;
revoke all on function private.delivery_quote(uuid[],double precision,double precision) from public,anon;
grant execute on function private.delivery_quote(uuid[],double precision,double precision) to authenticated;
create function public.quote_delivery_route(p_stores uuid[],p_lat double precision,p_lng double precision) returns jsonb language sql set search_path='' as $$select private.delivery_quote(p_stores,p_lat,p_lng)-'expected_min'-'config'$$;
revoke all on function public.quote_delivery_route(uuid[],double precision,double precision) from public,anon;
grant execute on function public.quote_delivery_route(uuid[],double precision,double precision) to authenticated;

create function private.place_route_order(p_groups jsonb,p_name text,p_phone text,p_phone2 text,p_address text,p_note text,p_lat double precision,p_lng double precision,p_expected_fee integer,p_fingerprint text,p_platform_fee integer,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[]; q jsonb; batch uuid; g jsonb; o uuid; result jsonb:='[]';fee integer; settings public.delivery_settings%rowtype; part_fee integer;part_index integer:=0;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request::text,0));
 select id into batch from public.delivery_batches where buyer_id=auth.uid() and request_id=p_request;
 if found then return (select to_jsonb(order_ids) from public.delivery_batches where id=batch);end if;
 if p_request is null or jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups) not between 1 and 30 then raise exception 'invalid basket';end if;
 if private.address_has_phone(p_address) or private.address_has_phone(p_note) then raise exception 'لا تكتب رقم هاتفك هنا';end if;
 if coalesce(p_phone2,'')<>'' and p_phone2 !~ '^[0-9]{10,15}$' then raise exception 'invalid secondary phone';end if;
 select array_agg((value->>'store')::uuid order by ord) into ids from jsonb_array_elements(p_groups) with ordinality as x(value,ord);
 perform 1 from public.delivery_config order by key for share;
 perform 1 from public.store_pickups where store_id=any(ids) order by store_id for share;
 perform 1 from public.stores where id=any(ids) order by id for share;
 q:=private.delivery_quote(ids,p_lat,p_lng);fee:=(q->>'delivery_fee')::integer;
 select * into settings from public.delivery_settings where id=true for share;
 if fee is distinct from p_expected_fee or q->>'fingerprint' is distinct from p_fingerprint or settings.platform_fee is distinct from p_platform_fee then raise exception 'delivery fee changed';end if;
 insert into public.delivery_batches(buyer_id,request_id,latitude,longitude,quote) values(auth.uid(),p_request,p_lat,p_lng,q) returning id into batch;
 for g in select value from jsonb_array_elements(p_groups) order by value->>'store' loop
  o:=public.place_order((g->>'store')::uuid,g->'lines',p_name,p_phone,p_address,coalesce(p_note,'')||case when coalesce(p_phone2,'')<>'' then ' | رقم هاتف بديل: '||p_phone2 else '' end||' | موقع الزبون: https://www.google.com/maps?q='||p_lat||','||p_lng);
  part_index:=part_index+1;part_fee:=fee/cardinality(ids)+case when part_index=1 then fee%cardinality(ids) else 0 end;
  update public.orders set total=total-delivery_fee+part_fee,delivery_fee=part_fee,delivery_batch_id=batch where id=o;
  result:=result||jsonb_build_array(o);
 end loop;
 update public.delivery_batches set order_ids=array(select value::uuid from jsonb_array_elements_text(result)) where id=batch;
 return result;
end $$;
revoke all on function private.place_route_order(jsonb,text,text,text,text,text,double precision,double precision,integer,text,integer,uuid) from public,anon;
grant execute on function private.place_route_order(jsonb,text,text,text,text,text,double precision,double precision,integer,text,integer,uuid) to authenticated;
create function public.place_route_order(p_groups jsonb,p_name text,p_phone text,p_phone2 text,p_address text,p_note text,p_lat double precision,p_lng double precision,p_expected_fee integer,p_fingerprint text,p_platform_fee integer,p_request uuid) returns jsonb language sql set search_path='' as $$select private.place_route_order(p_groups,p_name,p_phone,p_phone2,p_address,p_note,p_lat,p_lng,p_expected_fee,p_fingerprint,p_platform_fee,p_request)$$;
revoke all on function public.place_route_order(jsonb,text,text,text,text,text,double precision,double precision,integer,text,integer,uuid) from public,anon;
grant execute on function public.place_route_order(jsonb,text,text,text,text,text,double precision,double precision,integer,text,integer,uuid) to authenticated;

create function private.record_delivery_event(p_order uuid,p_kind text,p_stage text default null,p_details jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.delivery_events(order_id,buyer_id,driver_id,store_id,actor_id,kind,stage,details)
 select o.id,o.buyer_id,coalesce(o.driver_id,t.accepted_driver_id),o.store_id,auth.uid(),p_kind,p_stage,p_details from public.orders o left join public.delivery_tracking t on t.order_id=o.id where o.id=p_order
$$;
revoke all on function private.record_delivery_event(uuid,text,text,jsonb) from public,anon,authenticated;
create function private.track_delivery_order() returns trigger language plpgsql security definer set search_path='' as $$
declare v_stage text; t public.delivery_tracking%rowtype; n integer;
begin
 if tg_op='INSERT' then
  insert into public.delivery_tracking(order_id,last_status_at,prep_time_snapshot) values(new.id,new.created_at,(select prep_time_min from public.stores where id=new.store_id));
  perform private.record_delivery_event(new.id,'stage','NEW');return new;
 end if;
 insert into public.delivery_tracking(order_id,last_status_at,prep_time_snapshot) values(new.id,now(),(select prep_time_min from public.stores where id=new.store_id)) on conflict do nothing;
 select * into t from public.delivery_tracking where order_id=new.id for update;
 if new.driver_id is distinct from old.driver_id and new.driver_id is not null then
  perform pg_advisory_xact_lock(hashtextextended(new.driver_id::text,0));
  select coalesce(max(queue_rank),0)+1 into n from public.delivery_tracking x join public.orders o on o.id=x.order_id where o.driver_id=new.driver_id and o.status not in ('delivered','cancelled');
  update public.delivery_tracking set driver_accepted_at=now(),accepted_driver_id=new.driver_id,queue_rank=n,stage='DRIVER_ACCEPTED',last_status_at=now(),updated_at=now() where order_id=new.id;
  perform private.record_delivery_event(new.id,'stage','DRIVER_ACCEPTED');
 end if;
 if new.status is distinct from old.status then
  v_stage:=case new.status when 'new' then 'NEW' when 'accepted' then 'STORE_ACCEPTED' when 'delivery' then 'ON_THE_WAY' when 'delivered' then 'DELIVERED' when 'cancelled' then 'CANCELLED' end;
  update public.delivery_tracking set stage=v_stage,store_accepted_at=case when new.status='accepted' then now() else store_accepted_at end,
   on_the_way_at=case when new.status='delivery' then now() else on_the_way_at end,delivered_at=case when new.status='delivered' then now() else delivered_at end,cancelled_at=case when new.status='cancelled' then now() else cancelled_at end,last_status_at=now(),updated_at=now() where order_id=new.id;
  perform private.record_delivery_event(new.id,'stage',v_stage);
  if new.status='cancelled' then
   if t.accepted_driver_id is not null then
    insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,order_id) values(t.accepted_driver_id,'order:status:'||new.id||':cancelled','status','أُلغي الطلب','تم إلغاء الطلب من الزبون بعد بلاغ التأخر.',new.id) on conflict do nothing;
   end if;
   perform private.record_delivery_event(new.id,'cancel',v_stage,jsonb_build_object('after_driver',t.driver_accepted_at is not null,'timeline',to_jsonb(t),'batch',new.delivery_batch_id));
   select count(*) into n from public.delivery_events e where e.kind='cancel' and e.buyer_id=new.buyer_id and e.driver_id=t.accepted_driver_id and e.store_id=new.store_id and e.details->>'after_driver'='true' and e.created_at>=now()-interval '30 days';
   if n>=3 then
    insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,order_id)
    select id,'delivery:repeat:'||new.buyer_id||':'||t.accepted_driver_id||':'||new.store_id||':'||to_char(now(),'YYYY-MM-DD'),'warning','تكرار الإلغاء بعد قبول السائق','تكرر الإلغاء بين نفس الزبون والسائق والمتجر '||n||' مرات خلال 30 يومًا. للمراجعة اليدوية فقط.',new.id from public.profiles where role='admin' and not disabled on conflict do nothing;
   end if;
  end if;
 end if;return new;
end $$;
revoke all on function private.track_delivery_order() from public,anon,authenticated;
create trigger delivery_route_history after insert or update of status,driver_id on public.orders for each row execute function private.track_delivery_order();

create function private.delivery_is_stalled(p_order uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(o.status not in ('delivered','cancelled') and o.driver_id is not null and
 ((t.on_the_way_at is null and now()>=t.driver_accepted_at+make_interval(mins=>(c->>'STALL_TOTAL_MIN')::integer)) or now()>=t.last_status_at+make_interval(mins=>(c->>'STALL_STATUS_MIN')::integer)),false)
 from public.orders o join public.delivery_tracking t on t.order_id=o.id cross join (select private.delivery_settings_json() c) cfg where o.id=p_order
$$;
revoke all on function private.delivery_is_stalled(uuid) from public,anon,authenticated;
create function private.delivery_assessment(p_order uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('timeline',to_jsonb(t),'queue_rank',t.queue_rank,'active_orders',(select count(*) from public.orders a where a.driver_id=o.driver_id and a.status not in ('delivered','cancelled')),'expected_min',b.quote->'expected_min','stalled',private.delivery_is_stalled(o.id),
 'inference',case when t.store_accepted_at is null then 'بانتظار قبول المتجر؛ لا توجد أوقات كافية للجزم' when t.ready_at is null and now()>t.store_accepted_at+make_interval(mins=>t.prep_time_snapshot) then 'تأخر تجهيز المتجر (استنتاج معلوماتي)' when t.ready_at>t.store_accepted_at+make_interval(mins=>t.prep_time_snapshot) then 'تجاوز المتجر وقت التجهيز (استنتاج معلوماتي)' when t.ready_at is not null and coalesce(t.delivered_at,now())>t.ready_at+make_interval(secs=>coalesce((b.quote->>'expected_min')::double precision,120)*60) then 'تأخر لدى السائق بعد التجهيز (استنتاج معلوماتي)' else 'الأوقات المتاحة لا تحدد المتسبب؛ مراجعة يدوية' end)
 from public.orders o left join public.delivery_tracking t on t.order_id=o.id left join public.delivery_batches b on b.id=o.delivery_batch_id where o.id=p_order
$$;
revoke all on function private.delivery_assessment(uuid) from public,anon,authenticated;
create function private.customer_delivery_action(p_order uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;t public.delivery_tracking%rowtype; report jsonb; contact text;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.buyer_id<>auth.uid() or o.driver_id is null or o.status='cancelled' or (p_action='late' and o.status='delivered') then raise exception 'not permitted';end if;
 if p_action='help' then
  perform private.record_delivery_event(o.id,'help',null,private.delivery_assessment(o.id));
  select coalesce(d.phone,p.phone) into contact from public.profiles p left join public.driver_profiles d on d.user_id=p.id where p.id=o.driver_id;
  return jsonb_build_object('phone',contact);
 elsif p_action='late' then
  if not private.delivery_is_stalled(o.id) then raise exception 'لم تتحقق مدة التأخر بعد';end if;
  select * into t from public.delivery_tracking where order_id=o.id for update;
  if t.late_reported_at is null then
   report:=private.delivery_assessment(o.id);update public.delivery_tracking set late_reported_at=now(),updated_at=now() where order_id=o.id;
   perform private.record_delivery_event(o.id,'late',null,report);
   insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,order_id)
   select id,'delivery:late:'||o.id,'warning','بلاغ تأخر طلب','طلب #'||right(o.id::text,6)||' · ترتيب الطلب: '||coalesce(report->>'queue_rank','غير مسجل')||' · الطلبات النشطة: '||coalesce(report->>'active_orders','0')||' · '||(report->>'inference')||' · سجل المراحل: '||coalesce((report->'timeline')::text,'{}'),o.id from public.profiles where role='admin' and not disabled on conflict do nothing;
  end if;return jsonb_build_object('cancel_allowed',true);
 end if;raise exception 'invalid action';
end $$;
revoke all on function private.customer_delivery_action(uuid,text) from public,anon;
grant execute on function private.customer_delivery_action(uuid,text) to authenticated;
create function public.customer_delivery_action(p_order uuid,p_action text) returns jsonb language sql set search_path='' as $$select private.customer_delivery_action(p_order,p_action)$$;
revoke all on function public.customer_delivery_action(uuid,text) from public,anon;
grant execute on function public.customer_delivery_action(uuid,text) to authenticated;

create function private.delivery_stage(p_order uuid,p_stage text) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;t public.delivery_tracking%rowtype;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.status in ('delivered','cancelled') then raise exception 'invalid order';end if;
 select * into t from public.delivery_tracking where order_id=o.id for update;
 if p_stage='READY' then
  if not public.owns_store(o.store_id) or o.status<>'accepted' then raise exception 'store acceptance required';end if;
  if t.ready_at is not null then return;end if;
  update public.delivery_tracking set ready_at=now(),stage=p_stage,last_status_at=now(),updated_at=now() where order_id=o.id;
 elsif p_stage in ('PICKED_UP','ON_THE_WAY') then
  if o.driver_id is distinct from auth.uid() or not exists(select 1 from public.delivery_workers where user_id=auth.uid() and approved) or o.status not in ('accepted','delivery') then raise exception 'assigned driver required';end if;
  if p_stage='PICKED_UP' then
   if t.picked_up_at is not null then return;end if;
   update public.delivery_tracking set picked_up_at=now(),stage=p_stage,last_status_at=now(),updated_at=now() where order_id=o.id;
  else
   if t.on_the_way_at is not null then return;end if;
   perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
   update public.delivery_tracking x set queue_rank=queue_rank+1,updated_at=now() from public.orders a where a.id=x.order_id and a.driver_id=auth.uid() and a.status not in ('delivered','cancelled') and a.id<>o.id;
   update public.delivery_tracking set queue_rank=1 where order_id=o.id;
   -- Preserve existing delivery_step transition and finance behavior.
   update public.delivery_tracking set started_at=now(),picked_up_at=coalesce(picked_up_at,now()),updated_at=now() where order_id=o.id;
   perform public.delivery_step(o.id,'delivery');
  end if;
 else raise exception 'invalid stage';end if;
 perform private.record_delivery_event(o.id,'stage',p_stage,private.delivery_assessment(o.id));
end $$;
revoke all on function private.delivery_stage(uuid,text) from public,anon;
grant execute on function private.delivery_stage(uuid,text) to authenticated;
create function public.delivery_stage(p_order uuid,p_stage text) returns void language sql set search_path='' as $$select private.delivery_stage(p_order,p_stage)$$;
revoke all on function public.delivery_stage(uuid,text) from public,anon;
grant execute on function public.delivery_stage(uuid,text) to authenticated;
create function private.reorder_delivery(p_orders uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare current_ids uuid[];
begin
 if auth.uid() is null or not public.is_active_user() or not exists(select 1 from public.delivery_workers where user_id=auth.uid() and approved) then raise exception 'driver required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select array_agg(id order by id) into current_ids from public.orders where driver_id=auth.uid() and status not in ('delivered','cancelled');
 if current_ids is distinct from (select array_agg(x order by x) from unnest(p_orders) x) then raise exception 'queue changed';end if;
 update public.delivery_tracking t set queue_rank=x.rank,updated_at=now() from unnest(p_orders) with ordinality x(id,rank) where t.order_id=x.id;
 perform private.record_delivery_event(p_orders[1],'reorder',null,jsonb_build_object('orders',p_orders));
end $$;
revoke all on function private.reorder_delivery(uuid[]) from public,anon;
grant execute on function private.reorder_delivery(uuid[]) to authenticated;
create function public.reorder_delivery(p_orders uuid[]) returns void language sql set search_path='' as $$select private.reorder_delivery(p_orders)$$;
revoke all on function public.reorder_delivery(uuid[]) from public,anon;
grant execute on function public.reorder_delivery(uuid[]) to authenticated;

-- Read through an authorized, masked API; direct phone/note columns are unavailable.
create function private.participant_orders(p_buyer uuid default null,p_store uuid default null,p_driver uuid default null,p_order uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_user() then return '[]';end if;
 return coalesce((select jsonb_agg((to_jsonb(o)-'customer_phone'-'note'-'address')||jsonb_build_object(
 'customer_phone',case when public.is_admin() or o.buyer_id=auth.uid() or o.driver_id=auth.uid() then o.customer_phone else null end,
 'address',case when public.is_admin() or o.buyer_id=auth.uid() or o.driver_id=auth.uid() then o.address else regexp_replace(o.address,'[0-9٠-٩۰-۹]([[:space:]()+.−-]*[0-9٠-٩۰-۹]){6,}','[رقم مخفي]','g') end,
 'note',case when public.is_admin() or o.buyer_id=auth.uid() or o.driver_id=auth.uid() then o.note else regexp_replace(o.note,'[0-9٠-٩۰-۹]([[:space:]()+.−-]*[0-9٠-٩۰-۹]){6,}','[رقم مخفي]','g') end,
 'order_items',coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id=o.id),'[]'),
 'order_customer_actions',(select to_jsonb(a) from public.order_customer_actions a where a.order_id=o.id),
 'tracking',to_jsonb(t)-'prep_time_snapshot', 'can_report_late',private.delivery_is_stalled(o.id),
 'route_km',b.quote->'route_km','route',b.quote->'route','customer_lat',b.latitude,'customer_lng',b.longitude,
 'internal',case when public.is_admin() then private.delivery_assessment(o.id) else null end) order by o.created_at desc)
 from public.orders o left join public.delivery_tracking t on t.order_id=o.id left join public.delivery_batches b on b.id=o.delivery_batch_id
 where (public.is_admin() or o.buyer_id=auth.uid() or public.owns_store(o.store_id) or o.driver_id=auth.uid())
 and (p_buyer is null or o.buyer_id=p_buyer) and (p_store is null or o.store_id=p_store) and (p_driver is null or o.driver_id=p_driver) and (p_order is null or o.id=p_order)),'[]');
end $$;
revoke all on function private.participant_orders(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function private.participant_orders(uuid,uuid,uuid,uuid) to authenticated;
create function public.participant_orders(p_buyer uuid default null,p_store uuid default null,p_driver uuid default null,p_order uuid default null) returns jsonb language sql set search_path='' as $$select private.participant_orders(p_buyer,p_store,p_driver,p_order)$$;
revoke all on function public.participant_orders(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.participant_orders(uuid,uuid,uuid,uuid) to authenticated;
-- Safe columns remain readable for existing RLS relationships and statistics.
revoke select on public.orders from authenticated,anon;
do $$declare cols text;begin
 select string_agg(quote_ident(column_name),',') into cols from information_schema.columns where table_schema='public' and table_name='orders' and column_name not in ('customer_phone','address','note');
 execute 'grant select ('||cols||') on public.orders to authenticated';
end $$;

create or replace function private.delivery_offer_details() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_user() then return '[]';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('order_id',d.order_id,'store_name',d.store_name,'created_at',d.created_at,
 'address',regexp_replace(o.address,'[0-9٠-٩۰-۹]([[:space:]()+.−-]*[0-9٠-٩۰-۹]){6,}','[رقم مخفي]','g'),'latitude',b.latitude,'longitude',b.longitude,'route_km',b.quote->'route_km',
 'delivery_fee',case when o.delivery_batch_id is null then d.delivery_fee else (select sum(a.delivery_fee) from public.orders a where a.delivery_batch_id=o.delivery_batch_id and a.status<>'cancelled') end,'batch_id',o.delivery_batch_id))
 from public.available_delivery_orders() d join public.orders o on o.id=d.order_id left join public.delivery_batches b on b.id=o.delivery_batch_id),'[]');
end $$;

create function private.claim_route_delivery(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare batch uuid; member record;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required';end if;
 select delivery_batch_id into batch from public.orders where id=p_order;
 if batch is null then perform private.claim_delivery_existing(p_order);return;end if;
 perform 1 from public.delivery_batches where id=batch for update;
 for member in select id,status,driver_id from public.orders where delivery_batch_id=batch order by id for update loop
  if member.status='cancelled' then continue;end if;
  if member.status not in ('new','accepted') or member.driver_id is not null then raise exception 'order no longer available';end if;
  perform private.claim_delivery_existing(member.id);
 end loop;
end $$;
revoke all on function private.claim_route_delivery(uuid) from public,anon;
grant execute on function private.claim_route_delivery(uuid) to authenticated;
create function public.claim_route_delivery(p_order uuid) returns void language sql set search_path='' as $$select private.claim_route_delivery(p_order)$$;
revoke all on function public.claim_route_delivery(uuid) from public,anon;
grant execute on function public.claim_route_delivery(uuid) to authenticated;

create function private.admin_delivery_config(p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item record;n numeric;
begin
 if auth.uid() is null or not public.is_admin() or not public.is_active_user() then raise exception 'admin required';end if;
 if jsonb_typeof(p_values)<>'object' then raise exception 'invalid config';end if;
 for item in select * from jsonb_each_text(p_values) loop
  n:=item.value::numeric;
  if n is null or n<0 or n>1000000 or not exists(select 1 from public.delivery_config where key=item.key) or
   (item.key in ('ROAD_FACTOR','FEE_ROUNDING','STALL_TOTAL_MIN','STALL_STATUS_MIN','MAX_STORES') and n<=0) or
   (item.key<>'ROAD_FACTOR' and n<>trunc(n)) then raise exception 'invalid config';end if;
  update public.delivery_config set value=n,updated_at=now() where key=item.key;
 end loop;
end $$;
revoke all on function private.admin_delivery_config(jsonb) from public,anon;
grant execute on function private.admin_delivery_config(jsonb) to authenticated;
create function public.admin_delivery_config(p_values jsonb) returns void language sql set search_path='' as $$select private.admin_delivery_config(p_values)$$;
revoke all on function public.admin_delivery_config(jsonb) from public,anon;
grant execute on function public.admin_delivery_config(jsonb) to authenticated;
create function private.save_store_delivery(p_store uuid,p_lat double precision,p_lng double precision,p_prep integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_user() or not (public.owns_store(p_store) or public.is_admin()) then raise exception 'store owner required';end if;
 if p_prep is null or p_prep not between 0 and 1440 or p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid store location';end if;
 update public.stores set prep_time_min=p_prep where id=p_store;
 insert into public.store_pickups(store_id,pickup_address,latitude,longitude) select s.id,coalesce(nullif(l.pickup_address,''),nullif(s.address,''),'موقع الاستلام'),p_lat,p_lng from public.stores s left join public.store_pickups l on l.store_id=s.id where s.id=p_store on conflict(store_id) do update set latitude=excluded.latitude,longitude=excluded.longitude;
end $$;
revoke all on function private.save_store_delivery(uuid,double precision,double precision,integer) from public,anon;
grant execute on function private.save_store_delivery(uuid,double precision,double precision,integer) to authenticated;
create function public.save_store_delivery(p_store uuid,p_lat double precision,p_lng double precision,p_prep integer) returns void language sql set search_path='' as $$select private.save_store_delivery(p_store,p_lat,p_lng,p_prep)$$;
revoke all on function public.save_store_delivery(uuid,double precision,double precision,integer) from public,anon;
grant execute on function public.save_store_delivery(uuid,double precision,double precision,integer) to authenticated;

-- Customer order management; preserve financial and inventory history.
CREATE OR REPLACE FUNCTION public.set_order_status(p_order uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.orders%rowtype; i record;
begin
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'order not found'; end if;
 if auth.uid() is null or not public.is_active_user() or not (public.is_admin() or public.owns_store(o.store_id) or (o.buyer_id=auth.uid() and p_status='cancelled' and ((o.status in ('new','accepted') and o.driver_id is null) or (o.status in ('new','accepted','delivery') and exists(select 1 from public.delivery_tracking where order_id=o.id and late_reported_at is not null))))) then raise exception 'not permitted'; end if;
 if not ((o.buyer_id=auth.uid() and p_status='cancelled' and o.status in ('new','accepted','delivery') and exists(select 1 from public.delivery_tracking where order_id=o.id and late_reported_at is not null)) or (o.status='new' and p_status in ('accepted','cancelled')) or (o.status='accepted' and p_status='cancelled' and (o.driver_id is null or public.is_admin())) or (o.driver_id is null and o.status='delivery' and p_status='cancelled')) then raise exception 'invalid transition'; end if;
 update public.orders set status=p_status,driver_id=case when p_status='cancelled' then null else driver_id end where id=p_order;
 if p_status='cancelled' then
 perform set_config('souq.inventory_reason','cancelled_order',true);perform set_config('souq.inventory_order',p_order::text,true);
 for i in select product_id,variant_id,sum(quantity)::integer qty from public.order_items where order_id=p_order and product_id is not null group by product_id,variant_id order by product_id,variant_id loop
 perform 1 from public.products where id=i.product_id for update;
 if i.variant_id is not null then update public.product_variants set stock=stock+i.qty where id=i.variant_id and product_id=i.product_id;
 elsif not exists(select 1 from public.products where id=i.product_id and has_variants) then update public.products set stock=stock+i.qty where id=i.product_id;
 else
 -- Old orders predating conversion retain a separate legacy reserve; never credit an arbitrary size.
 update public.products set legacy_stock_reserve=legacy_stock_reserve+i.qty where id=i.product_id;
 insert into public.product_stock_movements(store_id,product_id,product_name,delta,balance,reason,actor_id,order_id) select store_id,id,name,i.qty,legacy_stock_reserve,'legacy_cancel_after_conversion',auth.uid(),p_order from public.products where id=i.product_id;
 end if;
 end loop;
 end if;
end; $function$
;

-- Existing historical timestamps stay unknown; baseline only applies to new tracking rows.
insert into public.delivery_tracking(order_id,stage,accepted_driver_id,queue_rank,prep_time_snapshot)
select o.id,case o.status when 'accepted' then 'STORE_ACCEPTED' when 'delivery' then 'ON_THE_WAY' when 'delivered' then 'DELIVERED' when 'cancelled' then 'CANCELLED' else case when o.driver_id is not null then 'DRIVER_ACCEPTED' else 'NEW' end end,
o.driver_id,case when o.driver_id is not null then row_number() over(partition by o.driver_id order by o.created_at)::integer else null end,s.prep_time_min
from public.orders o join public.stores s on s.id=o.store_id on conflict do nothing;

alter function public.customer_order_action(uuid,text,text) set schema private;
alter function private.customer_order_action(uuid,text,text) rename to customer_order_action_existing;
revoke all on function private.customer_order_action_existing(uuid,text,text) from public,anon,authenticated;
create function private.customer_order_action(p_order uuid,p_action text,p_reason text default '') returns text language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.buyer_id<>auth.uid() then raise exception 'not permitted';end if;
 if p_action='cancel' and o.driver_id is not null and o.status in ('new','accepted','delivery') then
  if not exists(select 1 from public.delivery_tracking where order_id=o.id and late_reported_at is not null) then raise exception 'لا يمكن إلغاء الطلب بعد قبول سائق التوصيل';end if;
  perform public.set_order_status(o.id,'cancelled');return 'cancelled';
 end if;
 return private.customer_order_action_existing(p_order,p_action,p_reason);
end $$;
revoke all on function private.customer_order_action(uuid,text,text) from public,anon;
grant execute on function private.customer_order_action(uuid,text,text) to authenticated;
create function public.customer_order_action(p_order uuid,p_action text,p_reason text default '') returns text language sql set search_path='' as $$select private.customer_order_action(p_order,p_action,p_reason)$$;
revoke all on function public.customer_order_action(uuid,text,text) from public,anon;
grant execute on function public.customer_order_action(uuid,text,text) to authenticated;
-- Live updates contain no customer phone number.
do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='delivery_tracking') then alter publication supabase_realtime add table public.delivery_tracking;end if;
end $$;

alter function public.claim_delivery(uuid) set schema private;
alter function private.claim_delivery(uuid) rename to claim_delivery_existing;
revoke all on function private.claim_delivery_existing(uuid) from public,anon,authenticated;
create function public.claim_delivery(p_order uuid) returns void language sql set search_path='' as $$select private.claim_route_delivery(p_order)$$;
revoke all on function public.claim_delivery(uuid) from public,anon;
grant execute on function public.claim_delivery(uuid) to authenticated;

create function private.validate_order_address() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.address_has_phone(new.address) then raise exception 'لا تكتب رقم هاتفك هنا';end if;
 return new;
end $$;
revoke all on function private.validate_order_address() from public,anon,authenticated;
create trigger delivery_address_phone_guard before insert or update of address on public.orders for each row execute function private.validate_order_address();
create trigger customer_address_phone_guard before insert or update of address on public.customer_addresses for each row execute function private.validate_order_address();
