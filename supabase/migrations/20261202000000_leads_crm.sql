-- Leads CRM (from the Argus Leads project) inside BI, at /crm. Idempotent: safe to run more than once.
--
-- Same data model and access rules as Argus Leads, on BI's own companies and people:
--   * tenant          = public.companies (BI)
--   * person          = the signed-in auth user (auth.uid()), linked to BI through company_users.auth_user_id
--   * Leads CRM role  = owner | admin | manager | salesperson | viewer
--       BI Super Admin / Company Admin            -> owner (always)
--       a row in crm_members                      -> that role (set on the CRM Team page)
--       otherwise "Leads CRM" View in BI Access Management -> salesperson
--       otherwise                                 -> no access
--
--   crm_members        role per person per company (only when it differs from the default)
--   crm_leads          leads                     crm_lead_notes      notes on a lead
--   crm_lead_activities  audit trail (triggers)  crm_follow_ups      scheduled follow-ups
--   crm_notifications  per-person notifications  crm_csv_imports     CSV import runs
--   crm_settings       per-company key/value settings
-- (Facebook / Instagram / LinkedIn / website-form capture comes in a later update.)

begin;

-- ---------------------------------------------------------------- roles
create table if not exists public.crm_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'salesperson' check (role in ('admin', 'manager', 'salesperson', 'viewer')),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  updated_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists crm_members_company_user_key on public.crm_members (company_id, user_id);

-- The Leads CRM role of any person in a company (null = no access).
create or replace function public.crm_role_for(p_company_id uuid, p_user uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  cu public.company_users;
  m public.crm_members;
begin
  if p_company_id is null or p_user is null then return null; end if;
  select * into cu from public.company_users
   where auth_user_id = p_user and status = 'Active' and (company_id = p_company_id or role = 'SUPER_ADMIN')
   order by (role = 'SUPER_ADMIN') limit 1;
  if cu.id is null then return null; end if;
  if cu.role in ('SUPER_ADMIN', 'COMPANY_ADMIN') then return 'owner'; end if;
  select * into m from public.crm_members where company_id = p_company_id and user_id = p_user;
  if m.id is not null then return case when m.status = 'active' then m.role else null end; end if;
  if exists (select 1 from public.user_module_permissions p where p.user_id = cu.id and p.module_key = 'leads-crm' and p.can_view) then
    return 'salesperson';
  end if;
  return null;
end;
$$;
revoke all on function public.crm_role_for(uuid, uuid) from public, anon;
grant execute on function public.crm_role_for(uuid, uuid) to authenticated;

-- The signed-in person's role in a company they can see.
create or replace function public.crm_role(p_company_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case when p_company_id = any (public.erp_visible_company_ids()) then public.crm_role_for(p_company_id, auth.uid()) end
$$;
revoke all on function public.crm_role(uuid) from public, anon;
grant execute on function public.crm_role(uuid) to authenticated;

create or replace function public.crm_is_member(p_company_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.crm_role(p_company_id) is not null $$;
revoke all on function public.crm_is_member(uuid) from public, anon;
grant execute on function public.crm_is_member(uuid) to authenticated;

create or replace function public.crm_has_role(p_company_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.crm_role(p_company_id) = any (p_roles), false) $$;
revoke all on function public.crm_has_role(uuid, text[]) from public, anon;
grant execute on function public.crm_has_role(uuid, text[]) to authenticated;

-- People of the company with their CRM role (for the Team page, assignment pickers and names).
create or replace function public.crm_people(p_company_id uuid)
returns table (user_id uuid, company_user_id uuid, full_name text, email text, bi_role text, role text, has_signed_in boolean)
language sql stable security definer set search_path = ''
as $$
  select cu.auth_user_id, cu.id, coalesce(nullif(cu.full_name, ''), cu.email), cu.email, cu.role,
         public.crm_role_for(p_company_id, cu.auth_user_id), cu.auth_user_id is not null
    from public.company_users cu
   where public.crm_is_member(p_company_id)
     and cu.status = 'Active'
     and (cu.company_id = p_company_id
          or (cu.role = 'SUPER_ADMIN' and exists (select 1 from public.crm_members m where m.company_id = p_company_id and m.user_id = cu.auth_user_id))
          or (cu.role = 'SUPER_ADMIN' and cu.auth_user_id = auth.uid()))
   order by 3
$$;
revoke all on function public.crm_people(uuid) from public, anon;
grant execute on function public.crm_people(uuid) to authenticated;

-- Change a person's CRM role (owner / admin only; only an owner may make someone admin).
-- p_role 'none' takes CRM access away from that person.
create or replace function public.crm_set_role(p_company_id uuid, p_user uuid, p_role text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me text := public.crm_role(p_company_id);
  target text := public.crm_role_for(p_company_id, p_user);
  cu public.company_users;
begin
  if me is null or me not in ('owner', 'admin') then raise exception 'Only an owner or admin can change roles.' using errcode = '42501'; end if;
  if p_role not in ('admin', 'manager', 'salesperson', 'viewer', 'none') then raise exception 'Unknown role.' using errcode = '22023'; end if;
  select * into cu from public.company_users where auth_user_id = p_user and status = 'Active' and (company_id = p_company_id or role = 'SUPER_ADMIN') limit 1;
  if cu.id is null then raise exception 'This person is not in the company (add them in BI first).' using errcode = 'P0002'; end if;
  if cu.role in ('SUPER_ADMIN', 'COMPANY_ADMIN') then raise exception 'BI admins are always owners of the CRM.' using errcode = '42501'; end if;
  if (p_role = 'admin' or target = 'admin') and me <> 'owner' then raise exception 'Only an owner can grant or change the admin role.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role.' using errcode = '42501'; end if;
  insert into public.crm_members (company_id, user_id, role, status, updated_by)
  values (p_company_id, p_user, case when p_role = 'none' then 'viewer' else p_role end,
          case when p_role = 'none' then 'suspended' else 'active' end, auth.uid())
  on conflict (company_id, user_id) do update
     set role = excluded.role, status = excluded.status, updated_by = excluded.updated_by, updated_at = now();
  return public.crm_role_for(p_company_id, p_user);
end;
$$;
revoke all on function public.crm_set_role(uuid, uuid, text) from public, anon;
grant execute on function public.crm_set_role(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------- data tables
create table if not exists public.crm_leads (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  full_name         text not null,
  email             text,
  phone             text,
  organization      text,
  job_title         text,
  website           text,
  source            text not null default 'manual',
  campaign          text,
  external_id       text,
  status            text not null default 'new',
  priority          text not null default 'medium',
  assigned_to       uuid references auth.users (id) on delete set null,
  created_by        uuid references auth.users (id) on delete set null,
  tags              text[] not null default '{}'::text[],
  notes             text,
  sort_order        double precision not null default 0,
  next_follow_up_at timestamptz,
  archived_at       timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint crm_leads_full_name_not_blank check (char_length(btrim(full_name)) > 0),
  constraint crm_leads_full_name_length    check (char_length(full_name) <= 200),
  constraint crm_leads_id_company_key      unique (id, company_id),
  constraint crm_leads_email_length        check (email is null or char_length(email) <= 320),
  constraint crm_leads_source_check check (source in ('facebook', 'instagram', 'linkedin', 'website_form', 'csv_import', 'manual', 'referral', 'email', 'phone', 'event', 'other')),
  constraint crm_leads_status_check check (status in ('new', 'contacted', 'follow_up', 'qualified', 'proposal', 'converted', 'lost')),
  constraint crm_leads_priority_check check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint crm_leads_external_id_length check (external_id is null or char_length(external_id) <= 255),
  constraint crm_leads_sort_order_check check (sort_order >= 0 and sort_order < 1000000000),
  constraint crm_leads_campaign_length check (campaign is null or char_length(campaign) <= 200),
  constraint crm_leads_organization_length check (organization is null or char_length(organization) <= 200),
  constraint crm_leads_job_title_length check (job_title is null or char_length(job_title) <= 200),
  constraint crm_leads_website_length check (website is null or char_length(website) <= 500),
  constraint crm_leads_phone_length check (phone is null or char_length(phone) <= 50),
  constraint crm_leads_notes_length check (notes is null or char_length(notes) <= 20000),
  constraint crm_leads_tags_bounded check (array_length(tags, 1) is null or array_length(tags, 1) <= 50),
  constraint crm_leads_not_archived_and_deleted check (archived_at is null or deleted_at is null)
);

create table if not exists public.crm_lead_notes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  lead_id     uuid not null,
  author_id   uuid references auth.users (id) on delete set null,
  body        text not null,
  is_pinned   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crm_lead_notes_body_not_blank check (char_length(btrim(body)) > 0),
  constraint crm_lead_notes_body_length check (char_length(body) <= 10000),
  constraint crm_lead_notes_lead_company_fk foreign key (lead_id, company_id) references public.crm_leads (id, company_id) on delete cascade
);

create table if not exists public.crm_lead_activities (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  lead_id     uuid not null,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  field       text,
  old_value   text,
  new_value   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint crm_lead_activities_action_check check (action in ('created', 'updated', 'status_changed', 'assignment_changed', 'archived', 'unarchived', 'deleted', 'restored', 'imported', 'note_added', 'follow_up_created', 'follow_up_completed', 'bulk_updated', 'score_changed')),
  constraint crm_lead_activities_lead_company_fk foreign key (lead_id, company_id) references public.crm_leads (id, company_id) on delete cascade
);

create table if not exists public.crm_follow_ups (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  lead_id       uuid not null,
  created_by    uuid references auth.users (id) on delete set null,
  assigned_to   uuid references auth.users (id) on delete set null,
  type          text not null default 'call',
  title         text not null,
  description   text,
  scheduled_at  timestamptz not null,
  duration_min  integer,
  status        text not null default 'pending',
  completed_at  timestamptz,
  cancelled_at  timestamptz,
  cancel_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint crm_follow_ups_title_not_blank check (char_length(btrim(title)) > 0),
  constraint crm_follow_ups_title_length check (char_length(title) <= 300),
  constraint crm_follow_ups_type_check check (type in ('call', 'email', 'meeting', 'demo', 'task', 'other')),
  constraint crm_follow_ups_status_check check (status in ('pending', 'completed', 'cancelled')),
  constraint crm_follow_ups_duration_check check (duration_min is null or duration_min > 0),
  constraint crm_follow_ups_completion_check check ((status = 'completed' and completed_at is not null) or (status <> 'completed' and completed_at is null)),
  constraint crm_follow_ups_cancellation_check check ((status = 'cancelled' and cancelled_at is not null) or (status <> 'cancelled' and cancelled_at is null)),
  constraint crm_follow_ups_description_length check (description is null or char_length(description) <= 5000),
  constraint crm_follow_ups_cancel_reason_length check (cancel_reason is null or char_length(cancel_reason) <= 500),
  constraint crm_follow_ups_lead_company_fk foreign key (lead_id, company_id) references public.crm_leads (id, company_id) on delete cascade
);

create table if not exists public.crm_notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        text not null default 'system',
  title       text not null,
  body        text,
  link        text,
  metadata    jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint crm_notifications_title_not_blank check (char_length(btrim(title)) > 0),
  constraint crm_notifications_type_check check (type in ('system', 'assignment', 'follow_up', 'mention', 'integration', 'team', 'lead')),
  constraint crm_notifications_body_length check (body is null or char_length(body) <= 2000),
  constraint crm_notifications_link_length check (link is null or char_length(link) <= 1000)
);

create table if not exists public.crm_csv_imports (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  filename       text not null,
  status         text not null default 'pending',
  total_rows     integer not null default 0,
  imported_rows  integer not null default 0,
  duplicate_rows integer not null default 0,
  error_rows     integer not null default 0,
  mapping        jsonb not null default '{}'::jsonb,
  errors         jsonb not null default '[]'::jsonb,
  created_by     uuid references auth.users (id) on delete set null,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint crm_csv_imports_status_check check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint crm_csv_imports_counts_check check (total_rows >= 0 and imported_rows >= 0 and duplicate_rows >= 0 and error_rows >= 0),
  constraint crm_csv_imports_counts_consistent check (imported_rows + duplicate_rows + error_rows <= total_rows),
  constraint crm_csv_imports_filename_length check (char_length(filename) between 1 and 300)
);

create table if not exists public.crm_settings (
  company_id  uuid not null references public.companies (id) on delete cascade,
  key         text not null,
  value       jsonb not null default '{}'::jsonb,
  updated_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (company_id, key),
  constraint crm_settings_key_format check (key ~ '^[a-z0-9_]{1,64}$')
);

-- ---------------------------------------------------------------- indexes
create index if not exists crm_leads_company_status_sort_idx on public.crm_leads (company_id, status, sort_order) where deleted_at is null;
create index if not exists crm_leads_company_created_idx on public.crm_leads (company_id, created_at desc);
create index if not exists crm_leads_company_updated_idx on public.crm_leads (company_id, updated_at desc);
create index if not exists crm_leads_company_assigned_idx on public.crm_leads (company_id, assigned_to);
create index if not exists crm_leads_company_created_by_idx on public.crm_leads (company_id, created_by);
create index if not exists crm_leads_company_email_lower_idx on public.crm_leads (company_id, lower(email)) where email is not null;
create index if not exists crm_leads_company_full_name_lower_idx on public.crm_leads (company_id, lower(full_name));
create index if not exists crm_leads_company_next_follow_up_idx on public.crm_leads (company_id, next_follow_up_at) where next_follow_up_at is not null;
create index if not exists crm_leads_tags_gin_idx on public.crm_leads using gin (tags);
create unique index if not exists crm_leads_company_source_external_id_key on public.crm_leads (company_id, source, external_id)
  where external_id is not null and btrim(external_id) <> '' and deleted_at is null;
create index if not exists crm_lead_notes_lead_created_idx on public.crm_lead_notes (lead_id, created_at desc);
create index if not exists crm_lead_activities_lead_created_idx on public.crm_lead_activities (lead_id, created_at desc);
create index if not exists crm_lead_activities_company_created_idx on public.crm_lead_activities (company_id, created_at desc);
create index if not exists crm_follow_ups_lead_idx on public.crm_follow_ups (lead_id);
create index if not exists crm_follow_ups_company_status_scheduled_idx on public.crm_follow_ups (company_id, status, scheduled_at);
create index if not exists crm_follow_ups_assigned_pending_idx on public.crm_follow_ups (assigned_to, scheduled_at) where status = 'pending';
create index if not exists crm_notifications_user_idx on public.crm_notifications (user_id, created_at desc);
create index if not exists crm_notifications_company_user_unread_idx on public.crm_notifications (company_id, user_id) where read_at is null;
create index if not exists crm_csv_imports_company_created_idx on public.crm_csv_imports (company_id, created_at desc);

-- ---------------------------------------------------------------- triggers
create or replace function public.crm_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['crm_members', 'crm_leads', 'crm_lead_notes', 'crm_follow_ups', 'crm_csv_imports', 'crm_settings'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I for each row execute function public.crm_set_updated_at()', t, t);
  end loop;
end $$;

create or replace function public.crm_log_lead_created()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.crm_lead_activities (company_id, lead_id, actor_id, action, metadata)
  values (new.company_id, new.id, auth.uid(), 'created', jsonb_build_object('source', new.source, 'status', new.status));
  return new;
end;
$$;
drop trigger if exists trg_crm_leads_log_insert on public.crm_leads;
create trigger trg_crm_leads_log_insert after insert on public.crm_leads for each row execute function public.crm_log_lead_created();

create or replace function public.crm_log_lead_updated()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if new.status is distinct from old.status then
    insert into public.crm_lead_activities (company_id, lead_id, actor_id, action, field, old_value, new_value, metadata)
    values (new.company_id, new.id, v_actor, 'status_changed', 'status', old.status, new.status, jsonb_build_object('lead_name', new.full_name));
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.crm_lead_activities (company_id, lead_id, actor_id, action, field, old_value, new_value, metadata)
    values (new.company_id, new.id, v_actor, 'assignment_changed', 'assigned_to', old.assigned_to::text, new.assigned_to::text, jsonb_build_object('lead_name', new.full_name));
    if new.assigned_to is not null and new.assigned_to is distinct from v_actor then
      insert into public.crm_notifications (company_id, user_id, type, title, body, link, metadata)
      values (new.company_id, new.assigned_to, 'assignment', 'New lead assigned to you', new.full_name || ' was assigned to you.',
              '/leads/' || new.id, jsonb_build_object('lead_id', new.id, 'lead_name', new.full_name));
    end if;
  end if;
  if new.archived_at is distinct from old.archived_at then
    insert into public.crm_lead_activities (company_id, lead_id, actor_id, action, metadata)
    values (new.company_id, new.id, v_actor, case when new.archived_at is not null then 'archived' else 'unarchived' end, jsonb_build_object('lead_name', new.full_name));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_crm_leads_log_update on public.crm_leads;
create trigger trg_crm_leads_log_update after update on public.crm_leads for each row execute function public.crm_log_lead_updated();

-- a lead created already assigned to someone else also notifies them
create or replace function public.crm_notify_new_assignee()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    insert into public.crm_notifications (company_id, user_id, type, title, body, link, metadata)
    values (new.company_id, new.assigned_to, 'assignment', 'New lead assigned to you', new.full_name || ' was assigned to you.',
            '/leads/' || new.id, jsonb_build_object('lead_id', new.id, 'lead_name', new.full_name));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_crm_leads_notify_insert on public.crm_leads;
create trigger trg_crm_leads_notify_insert after insert on public.crm_leads for each row execute function public.crm_notify_new_assignee();

create or replace function public.crm_log_follow_up_activity()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_lead_activities (company_id, lead_id, actor_id, action, metadata)
    values (new.company_id, new.lead_id, auth.uid(), 'follow_up_created', jsonb_build_object('title', new.title, 'scheduled_at', new.scheduled_at));
  elsif new.status = 'completed' and old.status <> 'completed' then
    insert into public.crm_lead_activities (company_id, lead_id, actor_id, action, metadata)
    values (new.company_id, new.lead_id, auth.uid(), 'follow_up_completed', jsonb_build_object('title', new.title));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_crm_follow_ups_activity on public.crm_follow_ups;
create trigger trg_crm_follow_ups_activity after insert or update on public.crm_follow_ups for each row execute function public.crm_log_follow_up_activity();

revoke all on function public.crm_log_lead_created() from public;
revoke all on function public.crm_log_lead_updated() from public;
revoke all on function public.crm_notify_new_assignee() from public;
revoke all on function public.crm_log_follow_up_activity() from public;

-- ---------------------------------------------------------------- row security (same rules as Argus Leads)
alter table public.crm_members enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_lead_notes enable row level security;
alter table public.crm_lead_activities enable row level security;
alter table public.crm_follow_ups enable row level security;
alter table public.crm_notifications enable row level security;
alter table public.crm_csv_imports enable row level security;
alter table public.crm_settings enable row level security;

drop policy if exists crm_members_select on public.crm_members;
create policy crm_members_select on public.crm_members for select to authenticated using (public.crm_is_member(company_id));
-- crm_members is written only through crm_set_role()

drop policy if exists crm_leads_select on public.crm_leads;
create policy crm_leads_select on public.crm_leads for select to authenticated using (public.crm_is_member(company_id));
drop policy if exists crm_leads_insert on public.crm_leads;
create policy crm_leads_insert on public.crm_leads for insert to authenticated
  with check (public.crm_has_role(company_id, array['owner', 'admin', 'manager', 'salesperson']));
drop policy if exists crm_leads_update on public.crm_leads;
create policy crm_leads_update on public.crm_leads for update to authenticated
  using (public.crm_has_role(company_id, array['owner', 'admin', 'manager'])
         or (public.crm_has_role(company_id, array['salesperson']) and (assigned_to = auth.uid() or created_by = auth.uid())))
  with check (public.crm_has_role(company_id, array['owner', 'admin', 'manager'])
         or (public.crm_has_role(company_id, array['salesperson']) and (assigned_to = auth.uid() or created_by = auth.uid())));
drop policy if exists crm_leads_delete on public.crm_leads;
create policy crm_leads_delete on public.crm_leads for delete to authenticated using (public.crm_has_role(company_id, array['owner', 'admin']));

drop policy if exists crm_lead_notes_select on public.crm_lead_notes;
create policy crm_lead_notes_select on public.crm_lead_notes for select to authenticated using (public.crm_is_member(company_id));
drop policy if exists crm_lead_notes_insert on public.crm_lead_notes;
create policy crm_lead_notes_insert on public.crm_lead_notes for insert to authenticated
  with check (public.crm_has_role(company_id, array['owner', 'admin', 'manager', 'salesperson']) and author_id = auth.uid());
drop policy if exists crm_lead_notes_update on public.crm_lead_notes;
create policy crm_lead_notes_update on public.crm_lead_notes for update to authenticated
  using (public.crm_is_member(company_id) and (author_id = auth.uid() or public.crm_has_role(company_id, array['owner', 'admin', 'manager'])))
  with check (public.crm_is_member(company_id));
drop policy if exists crm_lead_notes_delete on public.crm_lead_notes;
create policy crm_lead_notes_delete on public.crm_lead_notes for delete to authenticated
  using (public.crm_is_member(company_id) and (author_id = auth.uid() or public.crm_has_role(company_id, array['owner', 'admin', 'manager'])));

drop policy if exists crm_lead_activities_select on public.crm_lead_activities;
create policy crm_lead_activities_select on public.crm_lead_activities for select to authenticated using (public.crm_is_member(company_id));
drop policy if exists crm_lead_activities_insert on public.crm_lead_activities;
create policy crm_lead_activities_insert on public.crm_lead_activities for insert to authenticated
  with check (public.crm_has_role(company_id, array['owner', 'admin', 'manager', 'salesperson']) and actor_id = auth.uid());

drop policy if exists crm_follow_ups_select on public.crm_follow_ups;
create policy crm_follow_ups_select on public.crm_follow_ups for select to authenticated using (public.crm_is_member(company_id));
drop policy if exists crm_follow_ups_insert on public.crm_follow_ups;
create policy crm_follow_ups_insert on public.crm_follow_ups for insert to authenticated
  with check (public.crm_has_role(company_id, array['owner', 'admin', 'manager', 'salesperson']));
drop policy if exists crm_follow_ups_update on public.crm_follow_ups;
create policy crm_follow_ups_update on public.crm_follow_ups for update to authenticated
  using (public.crm_has_role(company_id, array['owner', 'admin', 'manager'])
         or (public.crm_has_role(company_id, array['salesperson']) and (assigned_to = auth.uid() or created_by = auth.uid())))
  with check (public.crm_is_member(company_id));
drop policy if exists crm_follow_ups_delete on public.crm_follow_ups;
create policy crm_follow_ups_delete on public.crm_follow_ups for delete to authenticated using (public.crm_has_role(company_id, array['owner', 'admin']));

drop policy if exists crm_notifications_select on public.crm_notifications;
create policy crm_notifications_select on public.crm_notifications for select to authenticated using (user_id = auth.uid() and public.crm_is_member(company_id));
drop policy if exists crm_notifications_update on public.crm_notifications;
create policy crm_notifications_update on public.crm_notifications for update to authenticated
  using (user_id = auth.uid() and public.crm_is_member(company_id)) with check (user_id = auth.uid() and public.crm_is_member(company_id));
drop policy if exists crm_notifications_delete on public.crm_notifications;
create policy crm_notifications_delete on public.crm_notifications for delete to authenticated using (user_id = auth.uid() and public.crm_is_member(company_id));
-- follow-up reminders and similar: a member may notify a colleague in the same company
drop policy if exists crm_notifications_insert on public.crm_notifications;
create policy crm_notifications_insert on public.crm_notifications for insert to authenticated
  with check (public.crm_has_role(company_id, array['owner', 'admin', 'manager', 'salesperson']) and public.crm_role_for(company_id, user_id) is not null);

drop policy if exists crm_csv_imports_select on public.crm_csv_imports;
create policy crm_csv_imports_select on public.crm_csv_imports for select to authenticated using (public.crm_is_member(company_id));
drop policy if exists crm_csv_imports_insert on public.crm_csv_imports;
create policy crm_csv_imports_insert on public.crm_csv_imports for insert to authenticated
  with check (public.crm_has_role(company_id, array['owner', 'admin', 'manager', 'salesperson']));
drop policy if exists crm_csv_imports_update on public.crm_csv_imports;
create policy crm_csv_imports_update on public.crm_csv_imports for update to authenticated
  using (public.crm_is_member(company_id) and (created_by = auth.uid() or public.crm_has_role(company_id, array['owner', 'admin', 'manager'])))
  with check (public.crm_is_member(company_id));
drop policy if exists crm_csv_imports_delete on public.crm_csv_imports;
create policy crm_csv_imports_delete on public.crm_csv_imports for delete to authenticated using (public.crm_has_role(company_id, array['owner', 'admin']));

drop policy if exists crm_settings_select on public.crm_settings;
create policy crm_settings_select on public.crm_settings for select to authenticated using (public.crm_is_member(company_id));
drop policy if exists crm_settings_insert on public.crm_settings;
create policy crm_settings_insert on public.crm_settings for insert to authenticated with check (public.crm_has_role(company_id, array['owner', 'admin']));
drop policy if exists crm_settings_update on public.crm_settings;
create policy crm_settings_update on public.crm_settings for update to authenticated
  using (public.crm_has_role(company_id, array['owner', 'admin'])) with check (public.crm_has_role(company_id, array['owner', 'admin']));
drop policy if exists crm_settings_delete on public.crm_settings;
create policy crm_settings_delete on public.crm_settings for delete to authenticated using (public.crm_has_role(company_id, array['owner']));

do $$
declare t text;
begin
  foreach t in array array['crm_members', 'crm_leads', 'crm_lead_notes', 'crm_lead_activities', 'crm_follow_ups', 'crm_notifications', 'crm_csv_imports', 'crm_settings'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
revoke insert, update, delete on public.crm_members from authenticated;

commit;
