-- Leads CRM: Meta / LinkedIn app keys pasted on the Integrations page (by a BI Super Admin) instead of being added to
-- the server environment. Values are encrypted by the server; the browser can never read or write this table.
-- Idempotent: safe to run more than once. Run after 20261203000000_crm_integrations.sql.

begin;

create table if not exists public.crm_app_settings (
  key         text primary key,
  value       text not null,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint crm_app_settings_key_format check (key ~ '^[A-Z0-9_]{1,64}$')
);

alter table public.crm_app_settings enable row level security;
-- no policies: only the server (service role) reads and writes it
revoke all on public.crm_app_settings from public, anon, authenticated;
grant select, insert, update, delete on public.crm_app_settings to service_role;

commit;
