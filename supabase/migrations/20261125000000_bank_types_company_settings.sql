-- =====================================================================================
-- Company-shared Bank Entry types & party mappings ("Add Types" and "Manage Types")
--
-- Previously these lists were kept only in browser localStorage, so entries saved by one
-- user did not appear when another user signed in to the same company. Storing them per
-- company in PostgreSQL shares them across all users and browsers in the company.
-- =====================================================================================
begin;

create table if not exists public.cnc_bank_settings (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  types       jsonb,
  others      jsonb,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

select public.erp_secure_table('cnc_bank_settings');
revoke insert, update, delete on public.cnc_bank_settings from authenticated;

create unique index if not exists cnc_bank_settings_company_key
  on public.cnc_bank_settings (company_id);

create or replace function public.erp_get_bank_settings()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid;
  v_types jsonb;
  v_others jsonb;
begin
  if me.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_company := public.erp_report_company();
  select s.types, s.others
    into v_types, v_others
    from public.cnc_bank_settings s
   where s.company_id = v_company;
  return jsonb_build_object('types', v_types, 'others', v_others);
end;
$$;

create or replace function public.erp_save_bank_settings(
  p_types jsonb default null,
  p_others jsonb default null
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid;
  v_types jsonb;
  v_others jsonb;
begin
  if me.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN')
     and not public.erp_has_perm('bank-entry', 'edit')
     and not public.erp_has_perm('bank-entry', 'create') then
    raise exception 'You do not have permission to change bank types' using errcode = '42501';
  end if;
  if p_types is not null and jsonb_typeof(p_types) <> 'array' then
    raise exception 'Bank types must be a list';
  end if;
  if p_others is not null and jsonb_typeof(p_others) <> 'array' then
    raise exception 'Party types must be a list';
  end if;

  v_company := public.erp_report_company();
  insert into public.cnc_bank_settings (company_id, types, others, updated_by)
  values (v_company, p_types, p_others, coalesce(nullif(me.full_name, ''), me.email))
  on conflict (company_id) do update
    set types = coalesce(excluded.types, public.cnc_bank_settings.types),
        others = coalesce(excluded.others, public.cnc_bank_settings.others),
        updated_by = excluded.updated_by,
        updated_at = now()
  returning types, others into v_types, v_others;

  return jsonb_build_object('types', v_types, 'others', v_others);
end;
$$;

revoke all on function public.erp_get_bank_settings() from public, anon;
revoke all on function public.erp_save_bank_settings(jsonb, jsonb) from public, anon;
grant execute on function public.erp_get_bank_settings() to authenticated;
grant execute on function public.erp_save_bank_settings(jsonb, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';
