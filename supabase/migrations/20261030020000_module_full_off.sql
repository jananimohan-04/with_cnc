-- =====================================================================================
-- "Full off": switch a module off for EVERYONE in a company
--
-- User Access already lets an administrator remove a module from one user. "Full off" is the company-wide version:
-- when a module is fully off, its menu, pages, pipeline column and KPI tile disappear for every user of that company,
-- administrators included, until it is switched on again (Access Management > the module's "Full off" switch).
--
-- It hides the module in the application (the same way the Retail Store's global menu kill-switch does); it does not
-- lock the database tables, so other modules that read the same data keep working.
-- Dashboard, Access Management and Settings can never be switched off, so there is always a way back.
--
-- Safe to re-run.
-- =====================================================================================
begin;

create table if not exists public.cnc_disabled_modules (
  id           uuid primary key default gen_random_uuid(),
  module_key   text not null,
  disabled_by  text,
  disabled_at  timestamptz not null default now()
);
select public.erp_secure_table('cnc_disabled_modules');
create unique index if not exists cnc_disabled_modules_company_module_key on public.cnc_disabled_modules (company_id, module_key);
-- written only by erp_set_module_off below
revoke insert, update, delete on public.cnc_disabled_modules from authenticated;

-- The modules that are fully off for a company (the caller's own company unless an administrator names another).
create or replace function public.erp_get_disabled_modules(p_company_id uuid default null)
returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid;
begin
  if me.id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_company_id is not null and me.role = 'SUPER_ADMIN' then
    v_company := p_company_id;
  elsif p_company_id is not null and p_company_id = me.company_id then
    v_company := p_company_id;
  elsif p_company_id is not null then
    raise exception 'Not authorized' using errcode = '42501';
  else
    v_company := public.erp_report_company();
  end if;
  return coalesce((select array_agg(d.module_key order by d.module_key) from public.cnc_disabled_modules d where d.company_id = v_company), '{}');
end;
$$;

-- Switches one module fully off or on again for a company. Only that company's administrators (or a Super Admin) may.
create or replace function public.erp_set_module_off(p_module text, p_off boolean, p_company_id uuid default null)
returns text[]
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid;
begin
  if me.id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only an administrator can switch a module fully off' using errcode = '42501';
  end if;
  if p_module is null or btrim(p_module) = '' then raise exception 'Choose a module'; end if;
  if p_module in ('dashboard', 'admin-access', 'settings') then
    raise exception 'This module cannot be switched off: it is how the other modules are switched back on' using errcode = '42501';
  end if;
  if p_company_id is not null and me.role = 'SUPER_ADMIN' then
    v_company := p_company_id;
  elsif p_company_id is not null and p_company_id = me.company_id then
    v_company := p_company_id;
  elsif p_company_id is not null then
    raise exception 'Not authorized' using errcode = '42501';
  else
    v_company := public.erp_report_company();
  end if;
  if v_company is null then raise exception 'Choose a company first'; end if;

  if p_off then
    insert into public.cnc_disabled_modules (company_id, module_key, disabled_by)
    values (v_company, p_module, me.full_name)
    on conflict (company_id, module_key) do nothing;
  else
    delete from public.cnc_disabled_modules where company_id = v_company and module_key = p_module;
  end if;
  return coalesce((select array_agg(d.module_key order by d.module_key) from public.cnc_disabled_modules d where d.company_id = v_company), '{}');
end;
$$;

revoke all on function public.erp_get_disabled_modules(uuid) from public, anon;
revoke all on function public.erp_set_module_off(text, boolean, uuid) from public, anon;
grant execute on function public.erp_get_disabled_modules(uuid) to authenticated;
grant execute on function public.erp_set_module_off(text, boolean, uuid) to authenticated;

commit;

select (select count(*) from public.cnc_disabled_modules) as modules_fully_off;
