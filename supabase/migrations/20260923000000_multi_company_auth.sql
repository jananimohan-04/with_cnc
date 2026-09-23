-- =====================================================================================
-- ARGUS CNC ERP — multi-company tenancy + Google-only ERP authorization
--
-- Run once in the Supabase SQL editor (it runs as `postgres`). The whole script is one
-- transaction: if any statement fails, nothing is changed.
--
-- Data safety: no business rows are deleted or re-created. The script only ADDS a
-- `company_id` column to each business table and fills it with "Argus Technology".
-- The last statement returns a per-table report of row counts before/after.
--
-- Not touched: the CNC Vault tables (cncvault_*), which belong to the separate
-- pixel-perfect-app and have their own access model.
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 1. Companies (tenants)
-- -------------------------------------------------------------------------------------
create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  company_name    text not null,
  code            text unique,
  status          text not null default 'Active' check (status in ('Active', 'Inactive')),
  -- The company that receives enquiries from the customer portal (/portal). Exactly one.
  portal_default  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists companies_name_key on public.companies (lower(company_name));
create unique index if not exists companies_one_portal_default on public.companies (portal_default) where portal_default;

insert into public.companies (company_name, code, status, portal_default)
select 'Argus Technology', 'ARGUS', 'Active', true
where not exists (select 1 from public.companies where lower(company_name) = 'argus technology');

-- -------------------------------------------------------------------------------------
-- 2. ERP users — authorization records only. No passwords: identity comes from Google.
-- -------------------------------------------------------------------------------------
create table if not exists public.company_users (
  id                 uuid primary key default gen_random_uuid(),
  auth_user_id       uuid unique references auth.users (id) on delete set null,
  company_id         uuid references public.companies (id),
  email              text not null,
  full_name          text not null default '',
  role               text not null check (role in ('SUPER_ADMIN', 'COMPANY_ADMIN', 'USER')),
  status             text not null default 'Active' check (status in ('Active', 'Inactive')),
  -- Super Admin only: company currently being viewed (null = all companies).
  active_company_id  uuid references public.companies (id) on delete set null,
  last_login_at      timestamptz,
  created_by         uuid references public.company_users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint company_users_company_required check (role = 'SUPER_ADMIN' or company_id is not null),
  constraint company_users_email_normalized check (email = lower(btrim(email)))
);
create unique index if not exists company_users_email_key on public.company_users (email);
create index if not exists company_users_company_idx on public.company_users (company_id);

-- Initial accounts. Neither gets a password; both must sign in with Google.
insert into public.company_users (email, role, company_id, active_company_id, status)
select 'jananimohan44@gmail.com', 'SUPER_ADMIN', null, c.id, 'Active'
from public.companies c where c.code = 'ARGUS'
on conflict (email) do nothing;

insert into public.company_users (email, role, company_id, status)
select 'argushexadoc2021@gmail.com', 'COMPANY_ADMIN', c.id, 'Active'
from public.companies c where c.code = 'ARGUS'
on conflict (email) do nothing;

-- Link to Google identities that already exist in Supabase Auth (others link on first login).
update public.company_users cu
set auth_user_id = i.user_id
from auth.identities i
where cu.auth_user_id is null
  and i.provider = 'google'
  and lower(i.identity_data ->> 'email') = cu.email
  and not exists (select 1 from public.company_users x where x.auth_user_id = i.user_id);

-- -------------------------------------------------------------------------------------
-- 3. Identity helpers (SECURITY DEFINER so RLS policies can call them cheaply)
-- -------------------------------------------------------------------------------------

-- Email of the caller's Google identity — only when the current session was obtained via
-- OAuth. A password/magic-link session for the same email therefore gets no ERP access.
create or replace function public.erp_google_email()
returns text
language sql stable security definer set search_path = ''
as $$
  select lower(i.identity_data ->> 'email')
  from auth.identities i
  where i.user_id = auth.uid()
    and i.provider = 'google'
    and exists (
      select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
      where a ->> 'method' = 'oauth'
    )
  order by i.created_at
  limit 1
$$;

-- The caller's active ERP user record (all-null row when there is none).
create or replace function public.erp_current_user()
returns public.company_users
language sql stable security definer set search_path = ''
as $$
  select cu.*
  from public.company_users cu
  left join public.companies c on c.id = cu.company_id
  where cu.auth_user_id = auth.uid()
    and cu.email = public.erp_google_email()
    and cu.status = 'Active'
    and (cu.role = 'SUPER_ADMIN' or c.status = 'Active')
  limit 1
$$;

create or replace function public.erp_is_super_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((public.erp_current_user()).role = 'SUPER_ADMIN', false)
$$;

-- Companies whose business data the caller may see. Empty for unknown/inactive accounts.
create or replace function public.erp_visible_company_ids()
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select case
    when u.id is null then '{}'::uuid[]
    when u.role = 'SUPER_ADMIN' and u.active_company_id is not null then array[u.active_company_id]
    when u.role = 'SUPER_ADMIN' then (select coalesce(array_agg(c.id), '{}') from public.companies c)
    else array[u.company_id]
  end
  from public.erp_current_user() u
$$;

-- Whether the caller may see a given company_users row (used by its RLS policy).
create or replace function public.erp_can_see_user(p_company_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    u.role = 'SUPER_ADMIN'
    or u.id = p_user_id
    or (u.role = 'COMPANY_ADMIN' and u.company_id = p_company_id),
    false)
  from public.erp_current_user() u
$$;

-- -------------------------------------------------------------------------------------
-- 4. Customer-portal helpers (portal customers are Google users with a portal_profiles
--    row; they are NOT ERP users and only ever see their own enquiry chain)
-- -------------------------------------------------------------------------------------
alter table public.portal_profiles add column if not exists company_id uuid references public.companies (id);
update public.portal_profiles set company_id = (select id from public.companies where portal_default) where company_id is null;
alter table public.portal_profiles alter column company_id set not null;

create or replace function public.erp_portal_profile_ids()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(id::text), '{}') from public.portal_profiles where auth_user_id = auth.uid()
$$;

create or replace function public.erp_portal_enquiry_ids()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(e.id::text), '{}')
  from public.cnc_enquiries e
  where auth.uid() is not null and e.portal_profile_id::text = any (public.erp_portal_profile_ids())
$$;

create or replace function public.erp_portal_quotation_ids()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(q.id::text), '{}')
  from public.cnc_quotations q
  where q.lead_id::text = any (public.erp_portal_enquiry_ids())
$$;

create or replace function public.erp_portal_sales_order_ids()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(o.id::text), '{}')
  from public.cnc_sales_orders o
  where o.quotation_id::text = any (public.erp_portal_quotation_ids())
$$;

create or replace function public.erp_portal_sales_order_nos()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(o.order_no::text), '{}')
  from public.cnc_sales_orders o
  where o.quotation_id::text = any (public.erp_portal_quotation_ids())
$$;

-- -------------------------------------------------------------------------------------
-- 5. Triggers: company_id is decided by the database, never by the browser
-- -------------------------------------------------------------------------------------
create or replace function public.erp_enforce_company_id()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  u public.company_users;
  v_portal_company uuid;
begin
  u := public.erp_current_user();

  if u.id is not null and u.role = 'SUPER_ADMIN' then
    -- Super Admin may write to any company; defaults to the company selected in the top bar.
    if tg_op = 'INSERT' then
      new.company_id := coalesce(new.company_id, u.active_company_id);
      if new.company_id is null then
        raise exception 'Select a company in the top bar before creating records.' using errcode = '23502';
      end if;
    end if;
  elsif u.id is not null then
    -- Company Admin / User: always their own company, whatever the client sent.
    if tg_op = 'INSERT' then new.company_id := u.company_id; else new.company_id := old.company_id; end if;
  elsif auth.uid() is not null then
    -- Portal customer (or an unregistered Google account): pinned to their portal company.
    select pp.company_id into v_portal_company
    from public.portal_profiles pp where pp.auth_user_id = auth.uid()
    order by pp.created_at limit 1;
    if tg_op = 'INSERT' then new.company_id := v_portal_company; else new.company_id := old.company_id; end if;
  end if;
  -- No auth context (SQL editor / service role): keep what the statement says.

  if tg_op = 'UPDATE' and new.company_id is null then
    new.company_id := old.company_id;
  end if;
  return new;
end;
$$;

create or replace function public.erp_portal_profile_company()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (public.erp_current_user()).id is null and auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.company_id := (select id from public.companies where portal_default);
      new.auth_user_id := auth.uid();
    else
      new.company_id := old.company_id;
      new.auth_user_id := old.auth_user_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists aa_erp_company_id on public.portal_profiles;
create trigger aa_erp_company_id before insert or update on public.portal_profiles
  for each row execute function public.erp_portal_profile_company();

-- Linked records must stay inside one company (enquiry → quotation → sales order → delivery …).
-- TG_ARGV[0] = column holding the reference, TG_ARGV[1] = referenced table (matched on id).
create or replace function public.erp_check_same_company()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ref text := to_jsonb(new) ->> tg_argv[0];
  v_ref_company uuid;
begin
  if v_ref is null or v_ref = '' then return new; end if;
  execute format('select company_id from public.%I where id::text = $1', tg_argv[1])
    into v_ref_company using v_ref;
  if v_ref_company is not null and v_ref_company <> new.company_id then
    raise exception '%.% points to a record of another company', tg_table_name, tg_argv[0]
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.erp_touch_company_user()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  new.updated_at := now();
  -- A changed email must be re-linked by a Google login with the new address.
  if tg_op = 'UPDATE' and new.email is distinct from old.email then
    new.auth_user_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists erp_touch_company_user on public.company_users;
create trigger erp_touch_company_user before insert or update on public.company_users
  for each row execute function public.erp_touch_company_user();

-- -------------------------------------------------------------------------------------
-- 6. Pipeline comments table (the app already writes to it; it did not exist yet)
-- -------------------------------------------------------------------------------------
create table if not exists public.cnc_pipeline_comments (
  id           uuid primary key default gen_random_uuid(),
  record_id    text not null,
  comment      text not null,
  author_name  text,
  created_at   timestamptz not null default now()
);
create index if not exists cnc_pipeline_comments_record_idx on public.cnc_pipeline_comments (record_id);

-- The customer portal enquiry form collects these but had nowhere to store them.
alter table public.cnc_enquiries add column if not exists material text;
alter table public.cnc_enquiries add column if not exists description text;

-- -------------------------------------------------------------------------------------
-- 7. Tenant every business table: add company_id, backfill Argus, trigger, RLS
-- -------------------------------------------------------------------------------------
-- Adds company_id + index + company trigger + isolation policy to one table. Existing rows are
-- assigned to p_default_company. Also used by later migrations for new tables.
create or replace function public.erp_secure_table(p_table text, p_default_company uuid default null)
returns void
language plpgsql
as $fn$
declare pol record;
begin
  execute format('alter table public.%I add column if not exists company_id uuid references public.companies (id)', p_table);
  if p_default_company is not null then
    execute format('update public.%I set company_id = $1 where company_id is null', p_table) using p_default_company;
  end if;
  execute format('alter table public.%I alter column company_id set not null', p_table);
  execute format('create index if not exists %I on public.%I (company_id)', p_table || '_company_id_idx', p_table);

  execute format('drop trigger if exists aa_erp_company_id on public.%I', p_table);
  execute format('create trigger aa_erp_company_id before insert or update on public.%I
                  for each row execute function public.erp_enforce_company_id()', p_table);

  -- Replace every existing policy (the old ones allowed anonymous full access).
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = p_table loop
    execute format('drop policy %I on public.%I', pol.policyname, p_table);
  end loop;
  execute format('alter table public.%I enable row level security', p_table);
  execute format('create policy erp_company_isolation on public.%I for all to authenticated
                  using (company_id = any ((select public.erp_visible_company_ids())::uuid[]))
                  with check (company_id = any ((select public.erp_visible_company_ids())::uuid[]))', p_table);

  execute format('revoke all on public.%I from anon', p_table);
  execute format('grant select, insert, update, delete on public.%I to authenticated', p_table);
end;
$fn$;
revoke all on function public.erp_secure_table(text, uuid) from public, anon, authenticated;

create temporary table erp_migration_report (
  table_name   text primary key,
  rows_before  bigint,
  rows_after   bigint,
  rows_argus   bigint
) on commit drop;

do $$
declare
  v_argus uuid := (select id from public.companies where code = 'ARGUS');
  t text;
  n_before bigint;
  n_after bigint;
  n_argus bigint;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname not like 'cncvault\_%'
      and c.relname not in ('companies', 'company_users', 'portal_profiles')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    order by c.relname
  loop
    execute format('select count(*) from public.%I', t) into n_before;

    perform public.erp_secure_table(t, v_argus);

    execute format('select count(*), count(*) filter (where company_id = $1) from public.%I', t)
      into n_after, n_argus using v_argus;
    insert into erp_migration_report values (t, n_before, n_after, n_argus);
  end loop;
end;
$$;

-- Same-company checks on the pipeline links (only where both columns exist).
do $$
declare
  link record;
begin
  for link in
    select * from (values
      ('cnc_quotations',        'lead_id',          'cnc_enquiries'),
      ('cnc_sales_orders',      'quotation_id',     'cnc_quotations'),
      ('cnc_sales_orders',      'customer_id',      'cnc_customers'),
      ('cnc_deliveries',        'sales_order_id',   'cnc_sales_orders'),
      ('cnc_deliveries',        'customer_id',      'cnc_customers'),
      ('cnc_customers',         'lead_id',          'cnc_enquiries'),
      ('cnc_material_requests', 'work_order_id',    'cnc_work_orders'),
      ('cnc_parts',             'preferred_supplier_id', 'cnc_suppliers'),
      ('cnc_raw_materials',     'preferred_supplier_id', 'cnc_suppliers')
    ) as l(tbl, col, ref_tbl)
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = link.tbl and column_name = link.col)
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = link.ref_tbl and column_name = 'company_id') then
      execute format('drop trigger if exists zz_erp_same_company_%s on public.%I', link.col, link.tbl);
      execute format('create trigger zz_erp_same_company_%s before insert or update on public.%I
                      for each row execute function public.erp_check_same_company(%L, %L)',
                     link.col, link.tbl, link.col, link.ref_tbl);
    end if;
  end loop;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 8. Customer-portal access (in addition to company isolation; policies are OR-ed)
-- -------------------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'portal_profiles' loop
    execute format('drop policy %I on public.portal_profiles', pol.policyname);
  end loop;
end;
$$;
alter table public.portal_profiles enable row level security;
create policy portal_profiles_own on public.portal_profiles for all to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy portal_profiles_erp_read on public.portal_profiles for select to authenticated
  using (company_id = any ((select public.erp_visible_company_ids())::uuid[]));
revoke all on public.portal_profiles from anon;
grant select, insert, update on public.portal_profiles to authenticated;

create policy portal_enquiries_read on public.cnc_enquiries for select to authenticated
  using (portal_profile_id::text = any ((select public.erp_portal_profile_ids())::text[]));
create policy portal_enquiries_create on public.cnc_enquiries for insert to authenticated
  with check (portal_profile_id::text = any ((select public.erp_portal_profile_ids())::text[]));
create policy portal_quotations_read on public.cnc_quotations for select to authenticated
  using (lead_id::text = any ((select public.erp_portal_enquiry_ids())::text[]));
create policy portal_sales_orders_read on public.cnc_sales_orders for select to authenticated
  using (quotation_id::text = any ((select public.erp_portal_quotation_ids())::text[]));
create policy portal_work_orders_read on public.cnc_work_orders for select to authenticated
  using (sales_order::text = any ((select public.erp_portal_sales_order_nos())::text[]));
create policy portal_deliveries_read on public.cnc_deliveries for select to authenticated
  using (sales_order_id::text = any ((select public.erp_portal_sales_order_ids())::text[]));

-- -------------------------------------------------------------------------------------
-- 9. Companies / users: readable per role, writable ONLY through the functions below
-- -------------------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.company_users enable row level security;

drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select to authenticated
  using (public.erp_is_super_admin() or id = (select (public.erp_current_user()).company_id));

drop policy if exists company_users_read on public.company_users;
create policy company_users_read on public.company_users for select to authenticated
  using (public.erp_can_see_user(company_id, id));

revoke all on public.companies, public.company_users from anon, authenticated;
grant select on public.companies, public.company_users to authenticated;

-- Session bootstrap: called by the app right after Google sign-in.
create or replace function public.erp_get_session()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  u public.company_users;
  c public.companies;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'signed_out');
  end if;

  select lower(au.email), coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', '')
    into v_email, v_name
  from auth.users au where au.id = v_uid;

  if public.erp_google_email() is null then
    return jsonb_build_object('status', 'not_google', 'email', v_email);
  end if;
  v_email := public.erp_google_email();

  select * into u from public.company_users where email = v_email;
  if u.id is null then
    return jsonb_build_object('status', 'not_registered', 'email', v_email);
  end if;
  if u.auth_user_id is not null and u.auth_user_id <> v_uid then
    return jsonb_build_object('status', 'account_conflict', 'email', v_email);
  end if;
  if u.status <> 'Active' then
    return jsonb_build_object('status', 'inactive', 'email', v_email);
  end if;
  if u.role <> 'SUPER_ADMIN' then
    select * into c from public.companies where id = u.company_id;
    if c.id is null or c.status <> 'Active' then
      return jsonb_build_object('status', 'company_inactive', 'email', v_email);
    end if;
  end if;

  update public.company_users
  set auth_user_id = v_uid,
      last_login_at = now(),
      full_name = case when full_name = '' then v_name else full_name end
  where id = u.id
  returning * into u;

  if u.role = 'SUPER_ADMIN' then
    select * into c from public.companies where id = u.active_company_id;
  end if;

  return jsonb_build_object(
    'status', 'authorized',
    'email', v_email,
    'user', jsonb_build_object(
      'id', u.id, 'email', u.email, 'full_name', u.full_name, 'role', u.role, 'status', u.status,
      'company_id', u.company_id, 'active_company_id', u.active_company_id),
    'company', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'company_name', c.company_name, 'code', c.code, 'status', c.status) end,
    'companies', case when u.role = 'SUPER_ADMIN' then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'company_name', x.company_name, 'code', x.code, 'status', x.status) order by x.company_name), '[]')
      from public.companies x) else '[]'::jsonb end);
end;
$$;

-- Super Admin: choose which company's data is shown (null = all companies).
create or replace function public.erp_set_active_company(p_company_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare u public.company_users := public.erp_current_user();
begin
  if u.id is null or u.role <> 'SUPER_ADMIN' then
    raise exception 'Only the Super Admin can switch companies' using errcode = '42501';
  end if;
  if p_company_id is not null and not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found';
  end if;
  update public.company_users set active_company_id = p_company_id where id = u.id;
end;
$$;

-- Create (p_id null) or update an ERP user. All role/company rules are enforced here.
create or replace function public.erp_save_user(
  p_id uuid, p_email text, p_full_name text, p_role text, p_status text, p_company_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  target public.company_users;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_company uuid;
  saved public.company_users;
begin
  if me.id is null or me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only administrators can manage users' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid Google account email address';
  end if;
  if p_role not in ('COMPANY_ADMIN', 'USER') then
    raise exception 'Role must be COMPANY_ADMIN or USER' using errcode = '42501';
  end if;
  if p_status not in ('Active', 'Inactive') then
    raise exception 'Status must be Active or Inactive';
  end if;

  if me.role = 'COMPANY_ADMIN' then
    if p_company_id is not null and p_company_id <> me.company_id then
      raise exception 'You can only manage users of your own company' using errcode = '42501';
    end if;
    if p_role <> 'USER' then
      raise exception 'Company admins can only assign the USER role' using errcode = '42501';
    end if;
    v_company := me.company_id;
  else
    v_company := p_company_id;
    if v_company is null or not exists (select 1 from public.companies where id = v_company) then
      raise exception 'Select a valid company';
    end if;
  end if;

  if p_id is null then
    begin
      insert into public.company_users (email, full_name, role, status, company_id, created_by)
      values (v_email, coalesce(btrim(p_full_name), ''), p_role, p_status, v_company, me.id)
      returning * into saved;
    exception when unique_violation then
      raise exception 'A user with the email % already exists', v_email;
    end;
  else
    select * into target from public.company_users where id = p_id;
    if target.id is null then
      raise exception 'User not found';
    end if;
    if target.role = 'SUPER_ADMIN' then
      raise exception 'Super Admin accounts cannot be changed here' using errcode = '42501';
    end if;
    if me.role = 'COMPANY_ADMIN' and (target.company_id <> me.company_id or target.role <> 'USER') then
      raise exception 'You can only edit USER accounts of your own company' using errcode = '42501';
    end if;
    begin
      update public.company_users
      set email = v_email, full_name = coalesce(btrim(p_full_name), ''), role = p_role,
          status = p_status, company_id = v_company
      where id = p_id
      returning * into saved;
    exception when unique_violation then
      raise exception 'A user with the email % already exists', v_email;
    end;
  end if;

  return to_jsonb(saved);
end;
$$;

-- Super Admin: create (p_id null) or update a company.
create or replace function public.erp_save_company(p_id uuid, p_company_name text, p_code text, p_status text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare saved public.companies;
begin
  if not public.erp_is_super_admin() then
    raise exception 'Only the Super Admin can manage companies' using errcode = '42501';
  end if;
  if coalesce(btrim(p_company_name), '') = '' then
    raise exception 'Company name is required';
  end if;
  if p_status not in ('Active', 'Inactive') then
    raise exception 'Status must be Active or Inactive';
  end if;
  begin
    if p_id is null then
      insert into public.companies (company_name, code, status)
      values (btrim(p_company_name), nullif(upper(btrim(p_code)), ''), p_status)
      returning * into saved;
    else
      update public.companies
      set company_name = btrim(p_company_name), code = nullif(upper(btrim(p_code)), ''),
          status = p_status, updated_at = now()
      where id = p_id
      returning * into saved;
      if saved.id is null then raise exception 'Company not found'; end if;
    end if;
  exception when unique_violation then
    raise exception 'A company with that name or code already exists';
  end;
  return to_jsonb(saved);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 10. Function privileges: nothing is callable anonymously
-- -------------------------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'erp\_%' or p.proname = 'post_goods_receipt')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'post_goods_receipt' and p.prosecdef) then
    raise warning 'post_goods_receipt is SECURITY DEFINER and bypasses RLS: review it so it only touches the caller''s company';
  end if;
end;
$$;

-- Views run with their owner's rights and would bypass RLS; make them respect the caller.
do $$
declare v text;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'v' and c.relname not like 'cncvault\_%'
  loop
    execute format('alter view public.%I set (security_invoker = true)', v);
    execute format('revoke all on public.%I from anon', v);
  end loop;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 11. Report — every row must be accounted for and belong to Argus Technology
-- -------------------------------------------------------------------------------------
select table_name, rows_before, rows_after, rows_argus,
       (rows_before = rows_after and rows_after = rows_argus) as ok
from erp_migration_report
order by ok, table_name;

commit;
