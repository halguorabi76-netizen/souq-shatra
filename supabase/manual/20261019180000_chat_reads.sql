-- Read receipts: each person in a chat thread keeps the time they last read it. The other person sees
-- two brown ticks on a message that reached the server, and two blue ticks once it was read.
create table if not exists public.chat_reads(
 kind text not null check(kind in ('used','order','store','driver')),
 ref_id uuid not null,
 buyer_id uuid not null references public.profiles(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 read_at timestamptz not null default now(),
 primary key(kind,ref_id,buyer_id,user_id)
);
alter table public.chat_reads enable row level security;
revoke all on public.chat_reads from anon,authenticated;
grant select on public.chat_reads to authenticated;
drop policy if exists chat_reads_read on public.chat_reads;
create policy chat_reads_read on public.chat_reads for select to authenticated using(public.chat_can_read(kind,ref_id,buyer_id));

create or replace function public.mark_chat_read(p_kind text,p_ref uuid,p_buyer uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or not public.is_active_user() then return; end if;
 if not v_user=any(coalesce(private.chat_members(p_kind,p_ref,p_buyer),'{}')) then return; end if;
 insert into public.chat_reads(kind,ref_id,buyer_id,user_id,read_at) values(p_kind,p_ref,p_buyer,v_user,now())
 on conflict(kind,ref_id,buyer_id,user_id) do update set read_at=now();
 update public.account_notifications set read_at=now() where recipient_id=v_user and event_key='chat:'||p_kind||':'||p_ref||':'||p_buyer and read_at is null;
end $$;
revoke all on function public.mark_chat_read(text,uuid,uuid) from public,anon;
grant execute on function public.mark_chat_read(text,uuid,uuid) to authenticated;

notify pgrst,'reload schema';
