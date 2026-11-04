-- =====================================================================================
-- Company Menu Access: BI module access & Retail menus per company
-- =====================================================================================
begin;

-- 1. Ensure columns exist on public.companies for direct tracking & caching
alter table public.companies add column if not exists disabled_modules text[] not null default '{}';
alter table public.companies add column if not exists retail_menus text[] not null default '{}';

-- 2. Batch function to set disabled modules for a specific company
create or replace function public.erp_set_company_disabled_modules(p_company_id uuid, p_disabled_modules text[])
returns text[]
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_mod text;
  v_clean text[] := '{}';
begin
  if me.id is null or me.role != 'SUPER_ADMIN' then
    raise exception 'Only Super Admin can configure company module access' using errcode = '42501';
  end if;
  if p_company_id is null then
    raise exception 'Company ID is required';
  end if;

  -- Filter out non-swappable modules
  if p_disabled_modules is not null then
    select coalesce(array_agg(distinct m), '{}')
    into v_clean
    from unnest(p_disabled_modules) as m
    where m is not null and btrim(m) != '' and m not in ('dashboard', 'admin-access', 'settings');
  end if;

  -- 1. Update public.companies cache
  update public.companies
  set disabled_modules = v_clean, updated_at = now()
  where id = p_company_id;

  -- 2. Remove previous company-specific (non-global) rows in cnc_disabled_modules
  delete from public.cnc_disabled_modules
  where company_id = p_company_id and not is_global;

  -- 3. Insert new disabled rows for this company
  foreach v_mod in array v_clean loop
    insert into public.cnc_disabled_modules (company_id, module_key, disabled_by, is_global)
    values (p_company_id, v_mod, me.full_name, false)
    on conflict (company_id, module_key) do update
      set is_global = public.cnc_disabled_modules.is_global;
  end loop;

  return coalesce((select array_agg(d.module_key order by d.module_key)
                   from public.cnc_disabled_modules d
                   where d.company_id = p_company_id or d.is_global), '{}');
end;
$$;

-- 3. Function to set retail menus for a company
create or replace function public.erp_set_company_retail_menus(p_company_id uuid, p_retail_menus text[])
returns text[]
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_clean text[] := '{}';
begin
  if me.id is null or me.role != 'SUPER_ADMIN' then
    raise exception 'Only Super Admin can configure company retail menus' using errcode = '42501';
  end if;
  if p_company_id is null then
    raise exception 'Company ID is required';
  end if;

  if p_retail_menus is not null then
    select coalesce(array_agg(distinct m), '{}')
    into v_clean
    from unnest(p_retail_menus) as m
    where m is not null and btrim(m) != '';
  end if;

  update public.companies
  set retail_menus = v_clean, updated_at = now()
  where id = p_company_id;

  return v_clean;
end;
$$;

revoke all on function public.erp_set_company_disabled_modules(uuid, text[]) from public, anon;
revoke all on function public.erp_set_company_retail_menus(uuid, text[]) from public, anon;
grant execute on function public.erp_set_company_disabled_modules(uuid, text[]) to authenticated;
grant execute on function public.erp_set_company_retail_menus(uuid, text[]) to authenticated;

commit;
