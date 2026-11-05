-- "+ New Category" on the Inventory page: adds a category for the signed-in company.
create or replace function public.erp_add_inventory_category(p_name text, p_kind text default 'PURCHASED')
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  v_name text := btrim(coalesce(p_name, ''));
  v_code text;
  v_kind text := case when upper(coalesce(p_kind, '')) = 'MANUFACTURED' then 'MANUFACTURED' else 'PURCHASED' end;
  v_id uuid;
begin
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only administrators can add categories' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Enter a category name'; end if;
  if exists (select 1 from public.inventory_categories where company_id = v_company and lower(name) = lower(v_name)) then
    raise exception 'Category "%" already exists', v_name;
  end if;
  v_code := upper(regexp_replace(v_name, '[^A-Za-z0-9]+', '_', 'g'));
  v_code := btrim(v_code, '_');
  if v_code = '' then v_code := 'CAT'; end if;
  while exists (select 1 from public.inventory_categories where company_id = v_company and code = v_code) loop
    v_code := v_code || '_' || floor(random() * 90 + 10)::int;
  end loop;
  insert into public.inventory_categories (company_id, code, name, kind, sort_order)
  values (v_company, v_code, v_name, v_kind,
          coalesce((select max(sort_order) from public.inventory_categories where company_id = v_company), 0) + 1)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'code', v_code, 'name', v_name, 'kind', v_kind);
end $$;
grant execute on function public.erp_add_inventory_category(text, text) to authenticated;
