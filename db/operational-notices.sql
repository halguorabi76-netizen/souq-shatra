-- Operational inbox: retain validated reactions but stop their notifications.
-- Existing order, approval and professional sign-in triggers are unchanged.
begin;
create or replace function private.notify_product_interaction() returns trigger
 language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype; s public.stores%rowtype;
begin
 select * into p from public.products where id=new.product_id;
 select * into s from public.stores where id=p.store_id;
 if new.user_id is distinct from auth.uid() or not public.is_active_user() or not p.active or p.blocked or not s.approved or s.removed or s.owner_id=new.user_id then
  raise exception 'interaction not allowed';
 end if;
 return new;
end $$;
revoke all on function private.notify_product_interaction() from public,anon,authenticated;

create or replace function private.notify_inventory_state() returns trigger
 language plpgsql security definer set search_path='' as $$
declare recipient uuid; current_state text; previous_state text; label text;
begin
 if new.stock=old.stock and new.low_stock_threshold=old.low_stock_threshold then return new; end if;
 current_state:=case when new.stock=0 then 'empty' when new.stock<=new.low_stock_threshold then 'low' else 'ready' end;
 previous_state:=case when old.stock=0 then 'empty' when old.stock<=old.low_stock_threshold then 'low' else 'ready' end;
 if current_state=previous_state then return new; end if;
 select owner_id into recipient from public.stores where id=new.store_id and approved and not removed;
 if recipient is null then return new; end if;
 label:=case current_state when 'empty' then 'نفد مخزون المنتج' when 'low' then 'تحذير: مخزون المنتج منخفض' else 'تم تجديد مخزون المنتج' end;
 insert into public.account_notifications(recipient_id,event_key,event_kind,title,body,product_id)
 values(recipient,'inventory:'||new.id||':'||gen_random_uuid(),'inventory',label,new.name||' · الكمية الحالية: '||new.stock,new.id);
 return new;
end $$;
revoke all on function private.notify_inventory_state() from public,anon,authenticated;
create trigger inventory_state_notice after update of stock,low_stock_threshold on public.products
 for each row execute function private.notify_inventory_state();

create or replace function private.notify_delivery_balance() returns trigger
 language plpgsql security definer set search_path='' as $$
declare label text;
begin
 if new.amount_due=old.amount_due and new.debt_limit=old.debt_limit then return new; end if;
 if new.amount_due>0 and new.amount_due>=new.debt_limit and (old.amount_due=0 or old.amount_due<old.debt_limit) then
  label:='تحذير: بلغت حد المستحقات للتطبيق';
 elsif new.amount_due>old.amount_due then label:='لديك مبلغ مستحق للتطبيق';
 elsif new.amount_due=0 and old.amount_due>0 then label:='تم تسديد مستحقات التطبيق';
 elsif new.amount_due<old.amount_due then label:='تم تحديث رصيد المستحقات';
 else return new; end if;
 insert into public.account_notifications(recipient_id,event_key,event_kind,title,body)
 values(new.user_id,'balance:'||new.user_id||':'||gen_random_uuid(),'payment',label,'المبلغ المتبقي: '||new.amount_due||' د.ع · حد المستحقات: '||new.debt_limit||' د.ع');
 return new;
end $$;
revoke all on function private.notify_delivery_balance() from public,anon,authenticated;
create trigger delivery_balance_notice after update of amount_due,debt_limit on public.delivery_workers
 for each row execute function private.notify_delivery_balance();
commit;
