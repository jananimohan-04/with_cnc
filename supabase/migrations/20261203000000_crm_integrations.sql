-- Leads CRM inside BI: lead capture integrations (Facebook / Instagram lead ads through Meta, LinkedIn lead-gen
-- forms, a website form) — ported from Argus Leads (social_connections, integration_logs, webhook_events,
-- oauth_states in 202610200001..4). Idempotent: safe to run more than once. Run AFTER 20261202000000_leads_crm.sql.
--
--   crm_social_connections  one row per company per provider. Holds the provider tokens (Fernet ciphertext) and
--                           the website-form signing secret (settings.signing_secret): the browser can read only
--                           the safe columns (column grants below); every write is done by the BI server
--                           (server/crm/routes.cjs, service role), never from the browser.
--   crm_integration_logs    append-only audit log shown on the Integrations page.
--   crm_webhook_events      idempotency ledger for inbound deliveries: (provider, event_key) is unique.
--   crm_oauth_states        single-use OAuth state values (+ the PKCE verifier for LinkedIn). Server only.
--
-- Access (same as Argus Leads: integrations are owner / admin / manager only):
--   connections  select owner/admin/manager (safe columns only) · insert/delete owner/admin · update owner/admin/manager
--   logs         select owner/admin/manager · insert any member
--   webhooks     select owner/admin (rows that belong to a company)
--   oauth states select/insert/update owner/admin/manager (no browser grants: the server does it)

begin;

-- ---------------------------------------------------------------- connections
create table if not exists public.crm_social_connections (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies (id) on delete cascade,
  provider              text not null,
  status                text not null default 'not_connected',
  external_account_id   text,
  external_account_name text,
  page_id               text,
  ad_account_id         text,
  form_id               text,
  organization_id       text,
  access_token          text,
  refresh_token         text,
  token_expires_at      timestamptz,
  token_revoked_at      timestamptz,
  scopes                text[] not null default '{}'::text[],
  permissions           jsonb not null default '{}'::jsonb,
  settings              jsonb not null default '{}'::jsonb,
  sync_cursor           text,
  sync_enabled          boolean not null default true,
  last_sync_at          timestamptz,
  last_sync_status      text,
  last_error            text,
  last_error_at         timestamptz,
  connected_by          uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint crm_social_connections_provider_check
    check (provider in ('facebook', 'instagram', 'linkedin', 'website_form')),
  constraint crm_social_connections_status_check
    check (status in ('not_connected', 'setup_required', 'awaiting_approval', 'connected', 'expired', 'error', 'disconnected')),
  constraint crm_social_connections_sync_status_check
    check (last_sync_status is null or last_sync_status in ('success', 'partial', 'failed')),
  constraint crm_social_connections_account_length
    check (external_account_id is null or char_length(external_account_id) <= 255),
  constraint crm_social_connections_last_error_length
    check (last_error is null or char_length(last_error) <= 4000)
);

comment on table public.crm_social_connections is
  'Leads CRM: per-company external account connections. status reflects the real state reported by the provider. Tokens are server-only.';

create index if not exists crm_social_connections_company_idx on public.crm_social_connections (company_id);
create index if not exists crm_social_connections_company_provider_idx on public.crm_social_connections (company_id, provider);
create index if not exists crm_social_connections_status_idx on public.crm_social_connections (company_id, status);
-- webhook routing: which company owns this Facebook page / LinkedIn organization
create index if not exists crm_social_connections_page_idx on public.crm_social_connections (provider, page_id) where page_id is not null;
create index if not exists crm_social_connections_org_idx on public.crm_social_connections (provider, organization_id) where organization_id is not null;
create unique index if not exists crm_social_connections_company_provider_account_key
  on public.crm_social_connections (company_id, provider, external_account_id)
  where external_account_id is not null;
-- one connection per company per provider (the original enforced this for the website form; the app relies on it for all)
create unique index if not exists crm_social_connections_company_provider_key
  on public.crm_social_connections (company_id, provider);

drop trigger if exists trg_crm_social_connections_updated_at on public.crm_social_connections;
create trigger trg_crm_social_connections_updated_at before update on public.crm_social_connections
  for each row execute function public.crm_set_updated_at();

-- ---------------------------------------------------------------- logs
create table if not exists public.crm_integration_logs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  connection_id  uuid references public.crm_social_connections (id) on delete set null,
  provider       text not null,
  level          text not null default 'info',
  event          text not null,
  message        text not null,
  status_code    integer,
  duration_ms    integer,
  request_id     text,
  payload        jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint crm_integration_logs_level_check check (level in ('debug', 'info', 'warn', 'error')),
  constraint crm_integration_logs_status_code_check check (status_code is null or (status_code between 100 and 599)),
  constraint crm_integration_logs_duration_check check (duration_ms is null or duration_ms >= 0),
  constraint crm_integration_logs_message_length check (char_length(message) <= 4000),
  constraint crm_integration_logs_event_length check (char_length(event) <= 100)
);

comment on table public.crm_integration_logs is
  'Leads CRM: audit log for OAuth handshakes, sync runs, webhook deliveries and provider errors.';

create index if not exists crm_integration_logs_company_created_idx on public.crm_integration_logs (company_id, created_at desc);
create index if not exists crm_integration_logs_connection_idx on public.crm_integration_logs (connection_id, created_at desc)
  where connection_id is not null;
create index if not exists crm_integration_logs_level_idx on public.crm_integration_logs (company_id, level, created_at desc);
create index if not exists crm_integration_logs_request_id_idx on public.crm_integration_logs (request_id)
  where request_id is not null;

-- ---------------------------------------------------------------- webhook ledger
create table if not exists public.crm_webhook_events (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references public.companies (id) on delete cascade,
  provider      text not null,
  event_key     text not null,
  event_type    text,
  signature     text,
  status        text not null default 'received',
  attempts      integer not null default 0,
  error         text,
  headers       jsonb not null default '{}'::jsonb,
  payload       jsonb not null default '{}'::jsonb,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  constraint crm_webhook_events_provider_check check (provider in ('facebook', 'instagram', 'linkedin', 'website_form')),
  constraint crm_webhook_events_status_check check (status in ('received', 'processed', 'duplicate', 'ignored', 'failed')),
  constraint crm_webhook_events_attempts_check check (attempts >= 0),
  constraint crm_webhook_events_error_length check (error is null or char_length(error) <= 4000)
);

comment on table public.crm_webhook_events is
  'Leads CRM: idempotency ledger, one row per unique provider event id. Duplicate deliveries map to the same key.';

create unique index if not exists crm_webhook_events_provider_event_key_key on public.crm_webhook_events (provider, event_key);
create index if not exists crm_webhook_events_received_idx on public.crm_webhook_events (provider, received_at desc);
create index if not exists crm_webhook_events_company_idx on public.crm_webhook_events (company_id, received_at desc)
  where company_id is not null;
create index if not exists crm_webhook_events_status_idx on public.crm_webhook_events (status, received_at desc);

-- ---------------------------------------------------------------- oauth states
create table if not exists public.crm_oauth_states (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  provider      text not null,
  state         text not null,
  code_verifier text,
  redirect_uri  text,
  metadata      jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users (id) on delete set null,
  expires_at    timestamptz not null default (now() + interval '10 minutes'),
  used_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint crm_oauth_states_provider_check check (provider in ('facebook', 'instagram', 'linkedin')),
  constraint crm_oauth_states_expiry_check check (expires_at > created_at)
);

comment on table public.crm_oauth_states is
  'Leads CRM: single-use OAuth state values (PKCE verifier for LinkedIn). Server only.';

create unique index if not exists crm_oauth_states_state_key on public.crm_oauth_states (state);
create index if not exists crm_oauth_states_company_provider_idx on public.crm_oauth_states (company_id, provider);
create index if not exists crm_oauth_states_expiry_idx on public.crm_oauth_states (expires_at) where used_at is null;

-- ---------------------------------------------------------------- row security (same rules as Argus Leads)
alter table public.crm_social_connections enable row level security;
alter table public.crm_integration_logs enable row level security;
alter table public.crm_webhook_events enable row level security;
alter table public.crm_oauth_states enable row level security;

drop policy if exists crm_social_connections_select on public.crm_social_connections;
create policy crm_social_connections_select on public.crm_social_connections for select to authenticated
  using (public.crm_has_role(company_id, array['owner', 'admin', 'manager']));
drop policy if exists crm_social_connections_insert on public.crm_social_connections;
create policy crm_social_connections_insert on public.crm_social_connections for insert to authenticated
  with check (public.crm_has_role(company_id, array['owner', 'admin']));
drop policy if exists crm_social_connections_update on public.crm_social_connections;
create policy crm_social_connections_update on public.crm_social_connections for update to authenticated
  using (public.crm_has_role(company_id, array['owner', 'admin', 'manager']))
  with check (public.crm_has_role(company_id, array['owner', 'admin', 'manager']));
drop policy if exists crm_social_connections_delete on public.crm_social_connections;
create policy crm_social_connections_delete on public.crm_social_connections for delete to authenticated
  using (public.crm_has_role(company_id, array['owner', 'admin']));

-- The original read the log through its server, which allowed owner/admin/manager ("integration:read"); here the
-- browser reads the table directly, so the same rule is applied by the database.
drop policy if exists crm_integration_logs_select on public.crm_integration_logs;
create policy crm_integration_logs_select on public.crm_integration_logs for select to authenticated
  using (public.crm_has_role(company_id, array['owner', 'admin', 'manager']));
drop policy if exists crm_integration_logs_insert on public.crm_integration_logs;
create policy crm_integration_logs_insert on public.crm_integration_logs for insert to authenticated
  with check (public.crm_is_member(company_id));

drop policy if exists crm_webhook_events_select on public.crm_webhook_events;
create policy crm_webhook_events_select on public.crm_webhook_events for select to authenticated
  using (company_id is not null and public.crm_has_role(company_id, array['owner', 'admin']));

drop policy if exists crm_oauth_states_select on public.crm_oauth_states;
create policy crm_oauth_states_select on public.crm_oauth_states for select to authenticated
  using (public.crm_has_role(company_id, array['owner', 'admin', 'manager']));
drop policy if exists crm_oauth_states_insert on public.crm_oauth_states;
create policy crm_oauth_states_insert on public.crm_oauth_states for insert to authenticated
  with check (public.crm_has_role(company_id, array['owner', 'admin', 'manager']));
drop policy if exists crm_oauth_states_update on public.crm_oauth_states;
create policy crm_oauth_states_update on public.crm_oauth_states for update to authenticated
  using (public.crm_has_role(company_id, array['owner', 'admin', 'manager']))
  with check (public.crm_has_role(company_id, array['owner', 'admin', 'manager']));

-- ---------------------------------------------------------------- grants
-- Nothing for anon. The browser (authenticated) may only READ: the connection's safe columns (never access_token,
-- refresh_token, settings — which holds the website-form signing secret — or sync_cursor), the log and the
-- webhook ledger. All writes and the OAuth states are handled by the BI server with the service role.
revoke all on public.crm_social_connections from anon, authenticated;
revoke all on public.crm_integration_logs   from anon, authenticated;
revoke all on public.crm_webhook_events     from anon, authenticated;
revoke all on public.crm_oauth_states       from anon, authenticated;

grant select (id, company_id, provider, status, external_account_id, external_account_name, page_id, ad_account_id,
              form_id, organization_id, token_expires_at, token_revoked_at, scopes, permissions, sync_enabled,
              last_sync_at, last_sync_status, last_error, last_error_at, connected_by, created_at, updated_at)
  on public.crm_social_connections to authenticated;
grant select on public.crm_integration_logs to authenticated;
grant select on public.crm_webhook_events   to authenticated;

grant all on public.crm_social_connections to service_role;
grant all on public.crm_integration_logs   to service_role;
grant all on public.crm_webhook_events     to service_role;
grant all on public.crm_oauth_states       to service_role;

-- The server checks the caller's Leads CRM role with crm_role_for() and stores captured leads, using the service role.
grant execute on function public.crm_role_for(uuid, uuid) to service_role;
grant select, insert, update on public.crm_leads to service_role;

commit;
