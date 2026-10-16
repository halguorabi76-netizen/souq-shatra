-- Local stand-in for the parts of Supabase that the SQL in this repository relies on.
-- Used only by tests/db/run.sh on a throwaway Postgres; never run against production.
create extension if not exists pgcrypto;
do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end$$;
create schema if not exists auth;
create schema if not exists private;
create schema if not exists storage;
create schema if not exists extensions;
grant usage on schema public,auth,storage to anon,authenticated,service_role;

create table auth.users(id uuid primary key default gen_random_uuid(), email text unique, phone text unique, raw_user_meta_data jsonb not null default '{}', raw_app_meta_data jsonb not null default '{}', created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'anon')$$;
grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;

create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;

do $$begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
end$$;
