-- Client error reports: when the app breaks or the screen stops responding on a phone, the page
-- records a short technical note (error text, where it happened, which element covered the screen)
-- so the problem can be found without the user describing it. No personal data is stored.

create table if not exists public.client_errors(
 id bigint generated always as identity primary key,
 user_id uuid,
 kind text not null check(kind in ('error','rejection','blocked')),
 message text not null check(char_length(message)<=500),
 detail text not null default '' check(char_length(detail)<=2000),
 page text not null default '' check(char_length(page)<=200),
 build text not null default '' check(char_length(build)<=60),
 agent text not null default '' check(char_length(agent)<=300),
 created_at timestamptz not null default now()
);
create index if not exists client_errors_recent on public.client_errors(created_at desc);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon,authenticated;

create or replace function public.log_client_error(p_kind text,p_message text,p_detail text,p_page text,p_build text,p_agent text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_kind not in ('error','rejection','blocked') then return; end if;
 -- A global brake so a broken page on many phones cannot flood the table.
 if (select count(*) from public.client_errors where created_at>now()-interval '1 hour')>=300 then return; end if;
 insert into public.client_errors(user_id,kind,message,detail,page,build,agent)
 values(auth.uid(),p_kind,left(coalesce(p_message,''),500),left(coalesce(p_detail,''),2000),left(coalesce(p_page,''),200),left(coalesce(p_build,''),60),left(coalesce(p_agent,''),300));
 delete from public.client_errors where created_at<now()-interval '30 days';
end $$;
revoke all on function public.log_client_error(text,text,text,text,text,text) from public;
grant execute on function public.log_client_error(text,text,text,text,text,text) to anon,authenticated;

notify pgrst,'reload schema';
