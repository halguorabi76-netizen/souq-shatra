-- The assigned driver (and the store owner / admin) also receive the store's pickup
-- coordinates, so the driver can open Google Maps or Waze straight to the store.
-- Same visibility rule as pickup_address; nothing else changes.
CREATE OR REPLACE FUNCTION private.assigned_delivery_contacts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.is_active_user() then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('order_id',o.id,'driver_id',o.driver_id,'full_name',coalesce(d.full_name,p.full_name),'phone',coalesce(d.phone,p.phone),'vehicle',d.vehicle,
  'pickup_address',case when o.driver_id=auth.uid() or s.owner_id=auth.uid() or public.is_admin() then coalesce(l.pickup_address,s.address) else null end,
  'pickup_lat',case when o.driver_id=auth.uid() or s.owner_id=auth.uid() or public.is_admin() then l.latitude else null end,
  'pickup_lng',case when o.driver_id=auth.uid() or s.owner_id=auth.uid() or public.is_admin() then l.longitude else null end))
 from public.orders o join public.stores s on s.id=o.store_id left join public.profiles p on p.id=o.driver_id left join public.driver_profiles d on d.user_id=o.driver_id left join public.store_pickups l on l.store_id=s.id
 where (o.driver_id=auth.uid() or s.owner_id=auth.uid() or o.buyer_id=auth.uid() or public.is_admin()) and o.driver_id is not null),'[]'::jsonb);
end $function$;
notify pgrst,'reload schema';
