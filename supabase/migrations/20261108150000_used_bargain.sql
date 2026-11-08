-- «لقطة»: the admin marks a used listing as a bargain; customers see it in the «لقطة» section.
create or replace function public.set_used_bargain(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'not permitted'; end if;
 update public.used_listings
    set details=case when coalesce(p_on,false) then coalesce(details,'{}'::jsonb)||'{"bargain":true}'::jsonb else coalesce(details,'{}'::jsonb)-'bargain' end
  where id=p_id;
 if not found then raise exception 'listing not found'; end if;
end $$;
revoke all on function public.set_used_bargain(uuid,boolean) from public,anon;
grant execute on function public.set_used_bargain(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
