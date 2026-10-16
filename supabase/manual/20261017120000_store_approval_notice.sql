-- Sellers learn in the app when the admin approves (or pauses) their store, like drivers already do.
create or replace function private.store_approval_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.removed then return new; end if;
 if (tg_op='INSERT' and new.approved) or (tg_op='UPDATE' and new.approved is distinct from old.approved) then
  insert into public.account_notifications(recipient_id,event_key,event_kind,title,body)
  values(new.owner_id,'store:approval:'||gen_random_uuid(),'approval',
   case when new.approved then 'تمت الموافقة على متجرك' else 'تم إيقاف متجرك مؤقتًا' end,
   case when new.approved then 'افتح «حسابي» ثم «إدارة متجري» وابدأ بإضافة منتجاتك.' else 'تواصل مع الإدارة لمعرفة التفاصيل.' end);
 end if;
 return new;
end $$;
revoke all on function private.store_approval_notice() from public,anon,authenticated;
drop trigger if exists store_approval_notice on public.stores;
create trigger store_approval_notice after insert or update of approved on public.stores for each row execute function private.store_approval_notice();
