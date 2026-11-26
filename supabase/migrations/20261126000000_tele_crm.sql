-- Tele CRM: cloud-phone calling, contacts, call history, recordings, follow-ups and telecallers (Sales > Tele CRM, /telecrm).
-- Idempotent: safe to run more than once.
--
--   tele_settings        one row per company: routing, ring time, recording / consent / retention / download policy
--   tele_numbers         the company's cloud business numbers (only the server adds them, after checking the provider)
--   tele_agents          telecallers / supervisors and what each may do (call out, receive, listen, download)
--   tele_contacts        people who call or are called (patients, enquiries, appointments, customers ...)
--   tele_calls           one row per call; written ONLY by the server from the provider's webhooks
--   tele_recordings      recording references (never a public link); written ONLY by the server
--   tele_call_notes      notes written after a call
--   tele_followups       follow-up calls to make
--   tele_routing_rules   optional rules: which telecallers ring for which number / contact type
--   tele_webhook_events  provider event ids already handled (stops duplicate records when the provider retries)
--   tele_audit           important actions (calls started, recordings played / downloaded / deleted, settings changed)
--
-- Every table is limited to the company (erp_secure_table). On top of that, a telecaller sees only their own
-- contacts, calls, recordings and follow-ups; company admins and Tele CRM supervisors see the whole company.

begin;

-- ---------------------------------------------------------------- tables
create table if not exists public.tele_settings (
  id                    uuid primary key default gen_random_uuid(),
  routing_mode          text not null default 'assigned_then_all' check (routing_mode in ('assigned_then_all', 'ring_all', 'round_robin')),
  ring_seconds          int  not null default 25 check (ring_seconds between 10 and 90),
  record_calls          boolean not null default false,
  announce_recording    boolean not null default true,
  announcement_text     text not null default 'This call may be recorded for quality and training purposes.',
  retention_days        int  not null default 90 check (retention_days between 1 and 3650),
  allow_download        boolean not null default false,
  missed_call_followup  boolean not null default true,
  updated_at            timestamptz not null default now()
);

create table if not exists public.tele_numbers (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  e164          text not null,                     -- +9198xxxxxxxx
  label         text not null default '',
  provider_ref  text not null default '',          -- the provider's id for the number
  is_default    boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.tele_agents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.company_users (id) on delete cascade,
  role             text not null default 'telecaller' check (role in ('telecaller', 'supervisor')),
  can_call_out     boolean not null default true,
  can_receive      boolean not null default true,
  can_listen       boolean not null default false,
  can_download     boolean not null default false,
  presence         text not null default 'available' check (presence in ('available', 'away')),
  active           boolean not null default true,
  last_assigned_at timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.tele_contacts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null default '',
  phone            text not null,                  -- as typed
  phone_key        text not null default '',       -- last 10 digits, for matching callers
  email            text not null default '',
  contact_type     text not null default 'Enquiry', -- Patient, Enquiry, Appointment, Customer ... (company-defined)
  status           text not null default 'New',     -- New, In progress, Converted, Closed, Do not call
  assigned_user_id uuid references public.company_users (id) on delete set null,
  next_followup_at timestamptz,
  notes            text not null default '',
  created_by       uuid references public.company_users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.tele_calls (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_call_id   text not null,                -- the provider's id of the first leg
  provider_leg_id    text not null default '',     -- the other leg (customer side of an outgoing call)
  direction          text not null check (direction in ('inbound', 'outbound')),
  status             text not null default 'initiated', -- initiated, ringing, in-progress, completed, missed, busy, failed, rejected, cancelled
  from_number        text not null default '',
  to_number          text not null default '',
  customer_number    text not null default '',
  number_id          uuid references public.tele_numbers (id) on delete set null,
  contact_id         uuid references public.tele_contacts (id) on delete set null,
  agent_user_id      uuid references public.company_users (id) on delete set null,
  started_at         timestamptz not null default now(),
  answered_at        timestamptz,
  ended_at           timestamptz,
  duration_seconds   int not null default 0,
  ring_seconds       int not null default 0,
  transferred_to     uuid references public.company_users (id) on delete set null,
  route_plan         jsonb not null default '[]',  -- inbound: the telecaller groups to ring, in order
  error_text         text not null default '',
  updated_at         timestamptz not null default now()
);

create table if not exists public.tele_recordings (
  id                 uuid primary key default gen_random_uuid(),
  call_id            uuid not null references public.tele_calls (id) on delete cascade,
  provider           text not null,
  provider_recording_id text not null,
  duration_seconds   int not null default 0,
  channels           int not null default 1,
  status             text not null default 'available' check (status in ('available', 'deleted', 'failed')),
  delete_after       timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now()
);

create table if not exists public.tele_call_notes (
  id          uuid primary key default gen_random_uuid(),
  call_id     uuid references public.tele_calls (id) on delete cascade,
  contact_id  uuid references public.tele_contacts (id) on delete cascade,
  author_id   uuid references public.company_users (id) on delete set null,
  body        text not null default '',
  outcome     text not null default '',            -- Interested, Call back, Appointment booked, Not interested, Wrong number ...
  created_at  timestamptz not null default now()
);

create table if not exists public.tele_followups (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references public.tele_contacts (id) on delete cascade,
  call_id          uuid references public.tele_calls (id) on delete set null,
  assigned_user_id uuid references public.company_users (id) on delete set null,
  due_at           timestamptz not null,
  note             text not null default '',
  status           text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  done_at          timestamptz,
  created_by       uuid references public.company_users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create table if not exists public.tele_routing_rules (
  id             uuid primary key default gen_random_uuid(),
  name           text not null default '',
  number_id      uuid references public.tele_numbers (id) on delete cascade,   -- null = any number
  contact_type   text not null default '',                                     -- '' = any caller
  agent_user_ids uuid[] not null default '{}',
  priority       int not null default 100,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.tele_webhook_events (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null,
  event_key   text not null,
  received_at timestamptz not null default now()
);

create table if not exists public.tele_audit (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.company_users (id) on delete set null,
  action     text not null,
  target     text not null default '',
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- company isolation
select public.erp_secure_table('tele_settings');
select public.erp_secure_table('tele_numbers');
select public.erp_secure_table('tele_agents');
select public.erp_secure_table('tele_contacts');
select public.erp_secure_table('tele_calls');
select public.erp_secure_table('tele_recordings');
select public.erp_secure_table('tele_call_notes');
select public.erp_secure_table('tele_followups');
select public.erp_secure_table('tele_routing_rules');
select public.erp_secure_table('tele_webhook_events');
select public.erp_secure_table('tele_audit');

-- ---------------------------------------------------------------- indexes / uniqueness
create unique index if not exists tele_settings_company_key on public.tele_settings (company_id);
create unique index if not exists tele_numbers_e164_key on public.tele_numbers (e164);           -- a number belongs to one company
create unique index if not exists tele_agents_user_key on public.tele_agents (company_id, user_id);
create index if not exists tele_contacts_phone_idx on public.tele_contacts (company_id, phone_key);
create index if not exists tele_contacts_assigned_idx on public.tele_contacts (company_id, assigned_user_id);
create unique index if not exists tele_calls_provider_key on public.tele_calls (provider, provider_call_id);
create index if not exists tele_calls_started_idx on public.tele_calls (company_id, started_at desc);
create index if not exists tele_calls_agent_idx on public.tele_calls (company_id, agent_user_id, started_at desc);
create index if not exists tele_calls_contact_idx on public.tele_calls (company_id, contact_id);
create index if not exists tele_calls_leg_idx on public.tele_calls (provider, provider_leg_id);
create unique index if not exists tele_recordings_provider_key on public.tele_recordings (provider, provider_recording_id);
create index if not exists tele_recordings_call_idx on public.tele_recordings (company_id, call_id);
create index if not exists tele_recordings_delete_idx on public.tele_recordings (status, delete_after);
create index if not exists tele_notes_call_idx on public.tele_call_notes (company_id, call_id);
create index if not exists tele_notes_contact_idx on public.tele_call_notes (company_id, contact_id);
create index if not exists tele_followups_due_idx on public.tele_followups (company_id, status, due_at);
create index if not exists tele_followups_user_idx on public.tele_followups (company_id, assigned_user_id, status);
create unique index if not exists tele_webhook_events_key on public.tele_webhook_events (provider, event_key);
create index if not exists tele_audit_created_idx on public.tele_audit (company_id, created_at desc);

-- ---------------------------------------------------------------- who manages Tele CRM
-- Company admins, the Super Admin and Tele CRM supervisors see and manage everything of the company.
create or replace function public.tele_is_manager()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.erp_current_user() u
    where u.id is not null and (
      u.role in ('SUPER_ADMIN', 'COMPANY_ADMIN')
      or exists (select 1 from public.tele_agents a where a.user_id = u.id and a.role = 'supervisor' and a.active)
    )
  )
$$;
revoke all on function public.tele_is_manager() from public, anon;
grant execute on function public.tele_is_manager() to authenticated;

create or replace function public.tele_me()
returns uuid
language sql stable security definer set search_path = ''
as $$ select (public.erp_current_user()).id $$;
revoke all on function public.tele_me() from public, anon;
grant execute on function public.tele_me() to authenticated;

-- the signed-in person is filled in automatically
alter table public.tele_contacts   alter column created_by set default public.tele_me();
alter table public.tele_followups  alter column created_by set default public.tele_me();
alter table public.tele_call_notes alter column author_id  set default public.tele_me();
alter table public.tele_audit      alter column actor_id   set default public.tele_me();

-- ---------------------------------------------------------------- own-records limits (restrictive: added to the company rule)
drop policy if exists tele_contacts_own on public.tele_contacts;
create policy tele_contacts_own on public.tele_contacts as restrictive for all to authenticated
  using (public.tele_is_manager() or assigned_user_id = public.tele_me() or created_by = public.tele_me())
  with check (public.tele_is_manager() or assigned_user_id = public.tele_me() or assigned_user_id is null);

drop policy if exists tele_calls_own on public.tele_calls;
create policy tele_calls_own on public.tele_calls as restrictive for all to authenticated
  using (public.tele_is_manager() or agent_user_id = public.tele_me() or transferred_to = public.tele_me());

drop policy if exists tele_recordings_own on public.tele_recordings;
create policy tele_recordings_own on public.tele_recordings as restrictive for all to authenticated
  using (public.tele_is_manager() or exists (
    select 1 from public.tele_calls c where c.id = call_id and (c.agent_user_id = public.tele_me() or c.transferred_to = public.tele_me())));

drop policy if exists tele_followups_own on public.tele_followups;
create policy tele_followups_own on public.tele_followups as restrictive for all to authenticated
  using (public.tele_is_manager() or assigned_user_id = public.tele_me() or created_by = public.tele_me())
  with check (public.tele_is_manager() or assigned_user_id = public.tele_me() or created_by = public.tele_me());

drop policy if exists tele_notes_own on public.tele_call_notes;
create policy tele_notes_own on public.tele_call_notes as restrictive for all to authenticated
  using (public.tele_is_manager() or author_id = public.tele_me()
         or exists (select 1 from public.tele_contacts t where t.id = contact_id and t.assigned_user_id = public.tele_me()))
  with check (author_id = public.tele_me());

-- settings, agents, rules and audit: everyone in Tele CRM may read; only managers change
drop policy if exists tele_settings_manage on public.tele_settings;
create policy tele_settings_manage on public.tele_settings as restrictive for all to authenticated
  using (true) with check (public.tele_is_manager());
drop policy if exists tele_agents_manage on public.tele_agents;
create policy tele_agents_manage on public.tele_agents as restrictive for all to authenticated
  using (true) with check (public.tele_is_manager());
drop policy if exists tele_rules_manage on public.tele_routing_rules;
create policy tele_rules_manage on public.tele_routing_rules as restrictive for all to authenticated
  using (true) with check (public.tele_is_manager());
drop policy if exists tele_audit_read on public.tele_audit;
create policy tele_audit_read on public.tele_audit as restrictive for all to authenticated
  using (public.tele_is_manager()) with check (actor_id = public.tele_me());

-- what only the server may write (it uses its own key; the browser can only read these)
revoke insert, update, delete on public.tele_numbers from authenticated;
revoke insert, update, delete on public.tele_calls from authenticated;
revoke insert, update, delete on public.tele_recordings from authenticated;
revoke all on public.tele_webhook_events from authenticated;
revoke update, delete on public.tele_audit from authenticated;

-- a telecaller may set only their own presence (available / away)
create or replace function public.tele_set_presence(p_presence text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_presence not in ('available', 'away') then raise exception 'Unknown presence'; end if;
  update public.tele_agents set presence = p_presence where user_id = public.tele_me();
end;
$$;
revoke all on function public.tele_set_presence(text) from public, anon;
grant execute on function public.tele_set_presence(text) to authenticated;

-- live updates of the call list (row security still applies)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tele_calls') then
    execute 'alter publication supabase_realtime add table public.tele_calls';
  end if;
end $$;

commit;
