-- Additive correction: preserve all stored orders, contacts and existing preparation values.
-- Missing preparation time stays unknown; routing uses zero only for the internal estimate.
alter table public.stores alter column prep_time_min drop not null;
alter table public.stores alter column prep_time_min drop default;
alter table public.delivery_tracking alter column prep_time_snapshot drop not null;
alter table public.delivery_tracking alter column prep_time_snapshot drop default;

create or replace function private.participant_orders(p_buyer uuid default null,p_store uuid default null,p_driver uuid default null,p_order uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_user() then return '[]';end if;
 return coalesce((select jsonb_agg((to_jsonb(o)-'customer_phone'-'note'-'address')||jsonb_build_object(
 'customer_phone',case when public.is_admin() or o.buyer_id=auth.uid() or o.driver_id=auth.uid() or (o.driver_id is not null and public.owns_store(o.store_id)) then o.customer_phone else null end,
 'address',case when public.is_admin() or o.buyer_id=auth.uid() or o.driver_id=auth.uid() or (o.driver_id is not null and public.owns_store(o.store_id)) then o.address else regexp_replace(o.address,'[0-9٠-٩۰-۹]([[:space:]()+.−-]*[0-9٠-٩۰-۹]){6,}','[رقم مخفي]','g') end,
 'note',case when public.is_admin() or o.buyer_id=auth.uid() or o.driver_id=auth.uid() or (o.driver_id is not null and public.owns_store(o.store_id)) then o.note else regexp_replace(o.note,'[0-9٠-٩۰-۹]([[:space:]()+.−-]*[0-9٠-٩۰-۹]){6,}','[رقم مخفي]','g') end,
 'order_items',coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id=o.id),'[]'),
 'order_customer_actions',(select to_jsonb(a) from public.order_customer_actions a where a.order_id=o.id),
 'tracking',to_jsonb(t)-'prep_time_snapshot', 'can_report_late',private.delivery_is_stalled(o.id),
 'route_km',b.quote->'route_km','route',b.quote->'route','customer_lat',b.latitude,'customer_lng',b.longitude,
 'internal',case when public.is_admin() then private.delivery_assessment(o.id) else null end) order by o.created_at desc)
 from public.orders o left join public.delivery_tracking t on t.order_id=o.id left join public.delivery_batches b on b.id=o.delivery_batch_id
 where (public.is_admin() or o.buyer_id=auth.uid() or public.owns_store(o.store_id) or o.driver_id=auth.uid())
 and (p_buyer is null or o.buyer_id=p_buyer) and (p_store is null or o.store_id=p_store) and (p_driver is null or o.driver_id=p_driver) and (p_order is null or o.id=p_order)),'[]');
end $$;

create or replace function private.customer_delivery_action(p_order uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;t public.delivery_tracking%rowtype; report jsonb; contact text;
begin
 if auth.uid() is null or not public.is_active_user() then raise exception 'active account required';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.buyer_id<>auth.uid() or o.driver_id is null or o.status in ('cancelled','delivered') then raise exception 'not permitted';end if;
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

create or replace function private.save_store_delivery(p_store uuid,p_lat double precision,p_lng double precision,p_prep integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_user() or not (public.owns_store(p_store) or public.is_admin()) then raise exception 'store owner required';end if;
 if (p_prep is not null and p_prep not between 0 and 1440) or p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid store location';end if;
 update public.stores set prep_time_min=p_prep where id=p_store;
 insert into public.store_pickups(store_id,pickup_address,latitude,longitude) select s.id,coalesce(nullif(l.pickup_address,''),nullif(s.address,''),'موقع الاستلام'),p_lat,p_lng from public.stores s left join public.store_pickups l on l.store_id=s.id where s.id=p_store on conflict(store_id) do update set latitude=excluded.latitude,longitude=excluded.longitude;
end $$;

create or replace function private.delivery_quote(p_stores uuid[],p_lat double precision,p_lng double precision) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 select coalesce(max(s.prep_time_min),0),jsonb_agg(jsonb_build_object('store',s.id,'lat',l.latitude,'lng',l.longitude,'prep',s.prep_time_min) order by s.id) into prep,snapshot from public.stores s join public.store_pickups l on l.store_id=s.id where s.id=any(p_stores);
 return jsonb_build_object('route',route,'route_km',km,'extra_stores',cardinality(route)-1,'delivery_fee',round(((cfg->>'BASE_FEE')::numeric+km::numeric*(cfg->>'PER_KM_FEE')::numeric+(cardinality(route)-1)*(cfg->>'EXTRA_STORE_FEE')::numeric)/(cfg->>'FEE_ROUNDING')::numeric)*(cfg->>'FEE_ROUNDING')::numeric,
 'expected_min',prep+km*(cfg->>'MIN_PER_KM')::numeric+(cfg->>'BUFFER_MIN')::numeric+(cardinality(route)-1)*(cfg->>'EXTRA_STORE_MIN')::numeric,
 'high_fee',km>(cfg->>'MAX_ROUTE_KM')::numeric or cardinality(route)>(cfg->>'MAX_STORES')::numeric,'fingerprint',md5(cfg::text||snapshot::text),'config',cfg);
end $$;
