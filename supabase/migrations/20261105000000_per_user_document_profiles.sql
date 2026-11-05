-- =====================================================================================
-- Quotation / Invoice / Delivery Challan profile: one per LOGIN instead of one per company
--
-- Before: one profile row per company and document type, so whatever one user saved was what the whole company printed.
-- Now:    each admin / user keeps their own profile for each document type, and their own PDFs print it.
--   * Nothing is erased. The old company-wide rows stay (owner_id is null) and are still shown to a login that has not
--     saved its own profile yet; the first Save by that login creates its own copy.
--   * Super Admin can list who created which profile (erp_list_company_profiles) in Settings > Profiles Created.
--
-- Safe to re-run.
-- =====================================================================================
begin;

alter table public.cnc_company_profiles add column if not exists owner_id uuid references public.company_users (id) on delete set null;
alter table public.cnc_company_profiles add column if not exists created_by_name text;
alter table public.cnc_company_profiles add column if not exists created_at timestamptz not null default now();

-- one profile per company, document type AND login (old shared rows have no owner and stay one per company/type)
drop index if exists public.cnc_company_profiles_company_kind_key;
drop index if exists public.cnc_company_profiles_company_key;
create unique index if not exists cnc_company_profiles_owner_kind_key
  on public.cnc_company_profiles (company_id, kind, coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop function if exists public.erp_get_company_profile(text);
drop function if exists public.erp_save_company_profile(jsonb, text);

-- The caller's OWN saved profile for one document type; if they have none yet, the company's older shared one (or null).
create or replace function public.erp_get_company_profile(p_kind text default 'quotation')
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid;
  v_data jsonb;
begin
  if me.id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_kind not in ('quotation', 'invoice', 'dc') then raise exception 'Unknown document type'; end if;
  v_company := public.erp_report_company();
  select p.data into v_data from public.cnc_company_profiles p
   where p.company_id = v_company and p.kind = p_kind and p.owner_id = me.id;
  if v_data is null then
    select p.data into v_data from public.cnc_company_profiles p
     where p.company_id = v_company and p.kind = p_kind and p.owner_id is null;
  end if;
  return v_data;
end;
$$;

-- Creates or replaces the caller's own profile for one document type (never touches anyone else's).
create or replace function public.erp_save_company_profile(p_data jsonb, p_kind text default 'quotation')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid;
  v_module text := case p_kind when 'invoice' then 'invoices' when 'dc' then 'delivery' else 'quotations' end;
  v_rows int;
begin
  if me.id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_kind not in ('quotation', 'invoice', 'dc') then raise exception 'Unknown document type'; end if;
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') and not public.erp_has_perm(v_module, 'edit') then
    raise exception 'You do not have permission to change this profile' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or not (p_data ? 'profile') then
    raise exception 'The company profile is not in the expected format';
  end if;
  v_company := public.erp_report_company();

  update public.cnc_company_profiles
     set data = p_data, updated_by = me.full_name, updated_at = now()
   where company_id = v_company and kind = p_kind and owner_id = me.id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    insert into public.cnc_company_profiles (company_id, kind, data, updated_by, owner_id, created_by_name)
    values (v_company, p_kind, p_data, me.full_name, me.id, me.full_name);
  end if;
end;
$$;

-- Super Admin: who created which profile, in every company.
create or replace function public.erp_list_company_profiles()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare me public.company_users := public.erp_current_user();
begin
  if me.id is null or me.role <> 'SUPER_ADMIN' then
    raise exception 'Only a Super Admin can see this' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'kind', p.kind,
      'company_id', p.company_id,
      'company_name', c.company_name,
      'owner_id', p.owner_id,
      'owner_name', coalesce(u.full_name, p.created_by_name, p.updated_by, ''),
      'owner_email', coalesce(u.email, ''),
      'owner_role', coalesce(u.role, ''),
      'org_name', coalesce(p.data -> 'profile' ->> 'orgName', ''),
      'gstin', coalesce(p.data -> 'profile' ->> 'gstin', ''),
      'has_logo', coalesce(p.data -> 'profile' ->> 'logo', '') <> '',
      'has_signature', coalesce(p.data -> 'profile' ->> 'signature', '') <> '',
      'sub_companies', coalesce(jsonb_array_length(p.data -> 'subs'), 0),
      'shared', p.owner_id is null,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ) order by c.company_name, u.full_name, p.kind)
    from public.cnc_company_profiles p
    join public.companies c on c.id = p.company_id
    left join public.company_users u on u.id = p.owner_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.erp_get_company_profile(text) from public, anon;
revoke all on function public.erp_save_company_profile(jsonb, text) from public, anon;
revoke all on function public.erp_list_company_profiles() from public, anon;
grant execute on function public.erp_get_company_profile(text) to authenticated;
grant execute on function public.erp_save_company_profile(jsonb, text) to authenticated;
grant execute on function public.erp_list_company_profiles() to authenticated;

commit;

select kind, count(*) filter (where owner_id is null) as shared_old, count(*) filter (where owner_id is not null) as per_user
from public.cnc_company_profiles group by kind order by kind;
