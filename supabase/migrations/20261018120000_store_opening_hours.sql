-- Opening hours shown on the store page («مفتوح الآن» / «مغلق»). Set by the store owner; empty means
-- the store did not set hours. A closing time earlier than the opening time runs past midnight.
alter table public.stores add column if not exists open_time time;
alter table public.stores add column if not exists close_time time;
grant update(open_time,close_time) on public.stores to authenticated;
notify pgrst,'reload schema';
