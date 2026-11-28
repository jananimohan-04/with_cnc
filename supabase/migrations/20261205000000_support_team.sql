-- =====================================================================================
-- Support team: a new role SUPPORT for the technical support staff.
--
--   * A support person switches between companies in the top bar like the Super Admin, but only between the
--     companies NOT marked "Hidden from support" (Company Management). Argus Technologies (code ARGUS) is marked
--     hidden by this script; change it per company afterwards.
--   * The block is in the database (erp_visible_company_ids / companies policy / triggers), not only on screen.
--   * Support never gets the administration pages (User / Access / Company Management, Settings, Audit Logs,
--     Mail Integration), so they cannot widen their own access.
--   * "View only" per support person: they can look but not create, change or delete anything.
--   * Every company a support person opens is written to support_access_log (readable by the Super Admin).
--
-- Only the Super Admin can create support people, switch "View only", or hide a company from support.
-- Idempotent: safe to run more than once. One transaction.
-- =====================================================================================

begin;

-- ------------------------------------------------------------------ columns
alter table public.companies add column if not exists hidden_from_support boolean not null default false;
alter table public.company_users add column if not exists support_read_only boolean not null default false;

-- Argus Technologies' own data stays away from support (only on the first run: later choices are kept).
do $$
begin
  if not exists (select 1 from pg_class where relname = 'support_access_log' and relnamespace = 'public'::regnamespace) then
    update public.companies set hidden_from_support = true where code = 'ARGUS' or lower(company_name) in ('argus technology', 'argus technologies');
  end if;
end $$;

-- roles: + SUPPORT (no company of their own, like the Super Admin)
do $$
declare con record;
begin
  -- whatever the role check is called in this database, replace it
  for con in select conname from pg_constraint
              where conrelid = 'public.company_users'::regclass and contype = 'c'
                and pg_get_constraintdef(oid) ilike '%COMPANY_ADMIN%' loop
    execute format('alter table public.company_users drop constraint %I', con.conname);
  end loop;
end $$;
alter table public.company_users add constraint company_users_role_check check (role in ('SUPER_ADMIN', 'COMPANY_ADMIN', 'USER', 'SUPPORT'));
alter table public.company_users drop constraint if exists company_users_company_required;   -- (also removed by the loop above)
alter table public.company_users add constraint company_users_company_required check (role in ('SUPER_ADMIN', 'SUPPORT') or company_id is not null);

-- ------------------------------------------------------------------ access log
create table if not exists public.support_access_log (
  id            uuid primary key default gen_random_uuid(),
  support_user  uuid references public.company_users (id) on delete set null,
  email         text not null,
  company_id    uuid references public.companies (id) on delete set null,
  company_name  text,
  opened_at     timestamptz not null default now()
);
create index if not exists support_access_log_opened_idx on public.support_access_log (opened_at desc);
alter table public.support_access_log enable row level security;
revoke all on public.support_access_log from public, anon, authenticated;
grant select on public.support_access_log to authenticated;

-- ------------------------------------------------------------------ identity helpers
-- The caller's active BI user record. Super Admin and Support have no company of their own.
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
    and (cu.role in ('SUPER_ADMIN', 'SUPPORT') or c.status = 'Active')
  limit 1
$$;

create or replace function public.erp_is_support()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((public.erp_current_user()).role = 'SUPPORT', false) $$;

-- Companies the support team may open: every company not marked "Hidden from support".
create or replace function public.erp_support_company_ids()
returns uuid[]
language sql stable security definer set search_path = ''
as $$ select coalesce(array_agg(c.id), '{}') from public.companies c where not c.hidden_from_support $$;

-- A support person with "View only" switched on (false for everyone else).
create or replace function public.erp_support_read_only()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select u.role = 'SUPPORT' and u.support_read_only from public.erp_current_user() u), false) $$;

-- Companies whose business data the caller may see. Empty for unknown/inactive accounts.
create or replace function public.erp_visible_company_ids()
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select case
    when u.id is null then '{}'::uuid[]
    when u.role = 'SUPER_ADMIN' and u.active_company_id is not null then array[u.active_company_id]
    when u.role = 'SUPER_ADMIN' then (select coalesce(array_agg(c.id), '{}') from public.companies c)
    when u.role = 'SUPPORT' and u.active_company_id is not null
         and u.active_company_id = any (public.erp_support_company_ids()) then array[u.active_company_id]
    when u.role = 'SUPPORT' then public.erp_support_company_ids()
    else array[u.company_id]
  end
  from public.erp_current_user() u
$$;

create or replace function public.erp_can_see_user(p_company_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    u.role = 'SUPER_ADMIN'
    or u.id = p_user_id
    or (u.role = 'COMPANY_ADMIN' and u.company_id = p_company_id)
    or (u.role = 'SUPPORT' and p_company_id = any (public.erp_support_company_ids())),
    false)
  from public.erp_current_user() u
$$;

-- Modules support never gets (they would let them widen their own access or read company secrets).
create or replace function public.erp_support_blocked_modules()
returns text[]
language sql immutable
as $$ select array['admin-users', 'admin-access', 'admin-companies', 'settings', 'audit-logs', 'email-integration'] $$;

create or replace function public.erp_has_perm(p_module text, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $fn$
  select case
    when public.erp_is_super_admin() then true
    when (select (public.erp_current_user()).role) = 'COMPANY_ADMIN' then true
    when (select (public.erp_current_user()).role) = 'SUPPORT' then
      not (p_module = any (public.erp_support_blocked_modules()))
      and (not public.erp_support_read_only() or p_action in ('view', 'export'))
    else coalesce((
      select bool_or(
        case p_action
          when 'view'    then p.can_view
          when 'create'  then p.can_create
          when 'edit'    then p.can_edit
          when 'delete'  then p.can_delete
          when 'approve' then p.can_approve
          when 'export'  then p.can_export
          else false
        end)
      from public.user_module_permissions p
      where p.user_id = (select (public.erp_current_user()).id)
        and p.module_key = p_module
    ), false)
  end;
$fn$;
revoke all on function public.erp_has_perm(text, text) from public, anon, authenticated;
grant execute on function public.erp_has_perm(text, text) to authenticated;

create or replace function public.erp_get_permissions()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $fn$
declare
  me record;
begin
  me := public.erp_current_user();
  if me is null or me.id is null then
    raise exception 'Not authorized';
  end if;
  return jsonb_build_object(
    'role', me.role,
    'is_admin', (me.role in ('SUPER_ADMIN', 'COMPANY_ADMIN')),
    'support_read_only', (me.role = 'SUPPORT' and me.support_read_only),
    'support_blocked', case when me.role = 'SUPPORT' then to_jsonb(public.erp_support_blocked_modules()) else '[]'::jsonb end,
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'module_key', p.module_key, 'can_view', p.can_view, 'can_create', p.can_create,
        'can_edit', p.can_edit, 'can_delete', p.can_delete,
        'can_approve', p.can_approve, 'can_export', p.can_export))
      from public.user_module_permissions p where p.user_id = me.id
    ), '[]'::jsonb)
  );
end;
$fn$;
revoke all on function public.erp_get_permissions() from public, anon, authenticated;
grant execute on function public.erp_get_permissions() to authenticated;

-- ------------------------------------------------------------------ company_id trigger
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
  elsif u.id is not null and u.role = 'SUPPORT' then
    -- Support: only the companies open to support, and nothing at all with "View only".
    if u.support_read_only then
      raise exception 'Your support access is view only.' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.company_id := coalesce(new.company_id, u.active_company_id);
      if new.company_id is null then
        raise exception 'Select a company in the top bar before creating records.' using errcode = '23502';
      end if;
    elsif new.company_id is distinct from old.company_id then
      new.company_id := old.company_id;
    end if;
    if not (new.company_id = any (public.erp_support_company_ids())) then
      raise exception 'This company is not open to the support team.' using errcode = '42501';
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

-- ------------------------------------------------------------------ "View only": no insert / update / delete
-- Restrictive policies are AND-ed with the normal ones, so they only ever take rights away (and only from a
-- support person with View only). Added to every company table now, and to new ones by erp_secure_table.
create or replace function public.erp_add_support_view_only(p_table text)
returns void
language plpgsql
as $fn$
begin
  execute format('drop policy if exists erp_support_view_only_ins on public.%I', p_table);
  execute format('drop policy if exists erp_support_view_only_upd on public.%I', p_table);
  execute format('drop policy if exists erp_support_view_only_del on public.%I', p_table);
  execute format('create policy erp_support_view_only_ins on public.%I as restrictive for insert to authenticated
                  with check (not (select public.erp_support_read_only()))', p_table);
  execute format('create policy erp_support_view_only_upd on public.%I as restrictive for update to authenticated
                  using (not (select public.erp_support_read_only()))', p_table);
  execute format('create policy erp_support_view_only_del on public.%I as restrictive for delete to authenticated
                  using (not (select public.erp_support_read_only()))', p_table);
end;
$fn$;
revoke all on function public.erp_add_support_view_only(text) from public, anon, authenticated;

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
  perform public.erp_add_support_view_only(p_table);

  execute format('revoke all on public.%I from anon', p_table);
  execute format('grant select, insert, update, delete on public.%I to authenticated', p_table);
end;
$fn$;
revoke all on function public.erp_secure_table(text, uuid) from public, anon, authenticated;

do $$
declare t text;
begin
  for t in select distinct tablename from pg_policies where schemaname = 'public' and policyname = 'erp_company_isolation' loop
    perform public.erp_add_support_view_only(t);
  end loop;
end $$;

-- ------------------------------------------------------------------ companies / users
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select to authenticated
  using (
    ((public.erp_is_super_admin() or id = (select (public.erp_current_user()).company_id))
      and (public.erp_has_perm('admin-companies', 'view') or id = (select (public.erp_current_user()).company_id)))
    or (public.erp_is_support() and id = any (public.erp_support_company_ids()))
  );

drop policy if exists support_access_log_read on public.support_access_log;
create policy support_access_log_read on public.support_access_log for select to authenticated
  using (public.erp_is_super_admin());

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
  if u.role not in ('SUPER_ADMIN', 'SUPPORT') then
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
  elsif u.role = 'SUPPORT' then
    select * into c from public.companies where id = u.active_company_id and not hidden_from_support;
  end if;

  return jsonb_build_object(
    'status', 'authorized',
    'email', v_email,
    'user', jsonb_build_object(
      'id', u.id, 'email', u.email, 'full_name', u.full_name, 'role', u.role, 'status', u.status,
      'company_id', u.company_id, 'active_company_id', case when u.role = 'SUPPORT' then c.id else u.active_company_id end,
      'support_read_only', (u.role = 'SUPPORT' and u.support_read_only)),
    'company', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'company_name', c.company_name, 'code', c.code, 'status', c.status) end,
    'companies', case
      when u.role = 'SUPER_ADMIN' then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'company_name', x.company_name, 'code', x.code, 'status', x.status) order by x.company_name), '[]')
        from public.companies x)
      when u.role = 'SUPPORT' then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'company_name', x.company_name, 'code', x.code, 'status', x.status) order by x.company_name), '[]')
        from public.companies x where not x.hidden_from_support)
      else '[]'::jsonb end);
end;
$$;

-- Super Admin / Support: choose which company's data is shown (null = all the companies they may see).
create or replace function public.erp_set_active_company(p_company_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  u public.company_users := public.erp_current_user();
  v_name text;
begin
  if u.id is null or u.role not in ('SUPER_ADMIN', 'SUPPORT') then
    raise exception 'Only the Super Admin and the support team can switch companies' using errcode = '42501';
  end if;
  if p_company_id is not null then
    select company_name into v_name from public.companies
     where id = p_company_id and (u.role = 'SUPER_ADMIN' or not hidden_from_support);
    if v_name is null then
      raise exception 'Company not found';
    end if;
  end if;
  update public.company_users set active_company_id = p_company_id where id = u.id;
  if u.role = 'SUPPORT' then
    insert into public.support_access_log (support_user, email, company_id, company_name)
    values (u.id, u.email, p_company_id, coalesce(v_name, 'All companies open to support'));
  end if;
end;
$$;

-- Create (p_id null) or update a BI user. All role/company rules are enforced here.
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
  if p_role not in ('SUPER_ADMIN', 'COMPANY_ADMIN', 'USER', 'SUPPORT') then
    raise exception 'Role must be SUPER_ADMIN, COMPANY_ADMIN, USER or SUPPORT' using errcode = '42501';
  end if;
  if p_role in ('SUPER_ADMIN', 'SUPPORT') and me.role <> 'SUPER_ADMIN' then
    raise exception 'Only the Super Admin can grant Super Admin or support team access' using errcode = '42501';
  end if;
  if p_status not in ('Active', 'Inactive') then
    raise exception 'Status must be Active or Inactive';
  end if;

  if me.role = 'COMPANY_ADMIN' then
    if p_company_id is not null and p_company_id <> me.company_id then
      raise exception 'You can only manage users of your own company' using errcode = '42501';
    end if;
    if p_role not in ('USER', 'COMPANY_ADMIN') then
      raise exception 'Company admins can only assign the USER or COMPANY_ADMIN role' using errcode = '42501';
    end if;
    v_company := me.company_id;
  elsif p_role in ('SUPER_ADMIN', 'SUPPORT') then
    -- Super Admins and the support team span companies: no company is stored.
    v_company := null;
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
    if target.role in ('SUPER_ADMIN', 'SUPPORT') then
      if me.role <> 'SUPER_ADMIN' then
        raise exception 'Super Admin and support team accounts cannot be changed here' using errcode = '42501';
      end if;
      if target.id = me.id and p_role <> 'SUPER_ADMIN' then
        raise exception 'You cannot remove your own Super Admin access' using errcode = '42501';
      end if;
    end if;
    if me.role = 'COMPANY_ADMIN' then
      if target.company_id is distinct from me.company_id or target.role in ('SUPER_ADMIN', 'SUPPORT') then
        raise exception 'You can only edit users of your own company' using errcode = '42501';
      end if;
      if target.id = me.id and p_role <> me.role then
        raise exception 'You cannot change your own role' using errcode = '42501';
      end if;
    end if;
    begin
      update public.company_users
      set email = v_email, full_name = coalesce(btrim(p_full_name), ''), role = p_role,
          status = p_status, company_id = v_company,
          active_company_id = case when p_role in ('SUPER_ADMIN', 'SUPPORT') then active_company_id else null end
      where id = p_id
      returning * into saved;
    exception when unique_violation then
      raise exception 'A user with the email % already exists', v_email;
    end;
  end if;

  return to_jsonb(saved);
end;
$$;

-- Super Admin: switch "View only" for a support person.
create or replace function public.erp_set_support_read_only(p_user_id uuid, p_read_only boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.erp_is_super_admin() then
    raise exception 'Only the Super Admin can change support access' using errcode = '42501';
  end if;
  update public.company_users set support_read_only = coalesce(p_read_only, false) where id = p_user_id and role = 'SUPPORT';
  if not found then raise exception 'Support team member not found'; end if;
end;
$$;

-- Super Admin: hide a company from the support team (or open it again).
create or replace function public.erp_set_company_hidden_from_support(p_company_id uuid, p_hidden boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.erp_is_super_admin() then
    raise exception 'Only the Super Admin can change this' using errcode = '42501';
  end if;
  update public.companies set hidden_from_support = coalesce(p_hidden, false), updated_at = now() where id = p_company_id;
  if not found then raise exception 'Company not found'; end if;
end;
$$;

-- ------------------------------------------------------------------ privileges
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('erp_current_user', 'erp_is_support', 'erp_support_company_ids', 'erp_support_read_only',
                        'erp_visible_company_ids', 'erp_can_see_user', 'erp_support_blocked_modules', 'erp_get_session',
                        'erp_set_active_company', 'erp_save_user', 'erp_set_support_read_only', 'erp_set_company_hidden_from_support')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
