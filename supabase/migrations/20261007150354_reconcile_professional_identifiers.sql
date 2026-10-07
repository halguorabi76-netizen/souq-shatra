-- Remove only this session's redundant scaffolding after the concurrent
-- professional-identifiers deployment. Keep usernames, rows and RLS intact.
do $$
begin
 if to_regclass('public.professional_username_unique') is null
 or not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='professional_username_format')
 or to_regprocedure('public.set_professional_username(text)') is null then
  raise exception 'Professional identifier replacement must be deployed first';
 end if;
end $$;
drop function if exists public.public_store_usernames();
drop function if exists private.public_store_usernames();
drop index if exists public.profiles_username_unique;
alter table public.profiles drop constraint if exists profiles_username_format;
revoke update(username) on public.profiles from authenticated;
revoke usage on schema private from anon;
