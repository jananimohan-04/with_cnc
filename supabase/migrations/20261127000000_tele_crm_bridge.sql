-- Tele CRM: bridge calling (the provider calls the agent's own mobile first, then connects the customer).
-- Adds only columns to the existing Tele CRM tables. Run after 20261126000000_tele_crm.sql. Idempotent.
--
--   tele_agents.mobile_e164        the agent's own mobile, as +91...
--   tele_agents.mobile_status      none | pending (provider verification call in progress) | verified
--   tele_agents.mobile_verified_at when the provider confirmed the number
--   tele_agents.call_via           mobile (bridge call to the verified mobile) | browser (call from the computer)
--   tele_calls.call_mode           browser | bridge
-- The mobile fields are written only by the server (after the provider's verification); an agent changes only their
-- own call_via, through tele_set_call_via().

begin;

alter table public.tele_agents add column if not exists mobile_e164 text not null default '';
alter table public.tele_agents add column if not exists mobile_status text not null default 'none';
alter table public.tele_agents add column if not exists mobile_verified_at timestamptz;
alter table public.tele_agents add column if not exists call_via text not null default 'mobile';
alter table public.tele_calls  add column if not exists call_mode text not null default 'browser';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tele_agents_mobile_status_check') then
    alter table public.tele_agents add constraint tele_agents_mobile_status_check check (mobile_status in ('none', 'pending', 'verified'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tele_agents_call_via_check') then
    alter table public.tele_agents add constraint tele_agents_call_via_check check (call_via in ('mobile', 'browser'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tele_calls_call_mode_check') then
    alter table public.tele_calls add constraint tele_calls_call_mode_check check (call_mode in ('browser', 'bridge'));
  end if;
end $$;

create or replace function public.tele_set_call_via(p_via text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_via not in ('mobile', 'browser') then raise exception 'Unknown calling method'; end if;
  update public.tele_agents set call_via = p_via where user_id = public.tele_me();
end;
$$;
revoke all on function public.tele_set_call_via(text) from public, anon;
grant execute on function public.tele_set_call_via(text) to authenticated;

commit;
