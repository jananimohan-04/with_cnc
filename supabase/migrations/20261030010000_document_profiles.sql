-- =====================================================================================
-- Company profile per document: Quotation, Invoice and Delivery Challan
--
-- The Company Profile (logo, signature, GSTIN, address, phones, e-mails, bank details, sub-companies) was one row per
-- company and only quotations used it. Invoices and delivery challans now have their own profile, set up the same way:
--   Settings > Quotation / Invoice / Delivery Challan profile (also the "Profile" button on each page).
-- One row per company AND document type; the invoice and challan PDFs print their own profile.
--
-- Safe to re-run. Existing quotation profiles keep working unchanged (they become kind = 'quotation').
-- =====================================================================================
begin;

-- (the same table as 20261025000000_company_profiles.sql: created here too, so this file works on its own)
create table if not exists public.cnc_company_profiles (
  id          uuid primary key default gen_random_uuid(),
  data        jsonb not null,
  updated_by  text,
  updated_at  timestamptz not null default now()
);
select public.erp_secure_table('cnc_company_profiles');
revoke insert, update, delete on public.cnc_company_profiles from authenticated;

alter table public.cnc_company_profiles add column if not exists kind text not null default 'quotation';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cnc_company_profiles_kind_check') then
    alter table public.cnc_company_profiles
      add constraint cnc_company_profiles_kind_check check (kind in ('quotation', 'invoice', 'dc'));
  end if;
end
$$;

-- one profile per company per document type (it used to be one per company)
drop index if exists public.cnc_company_profiles_company_key;
create unique index if not exists cnc_company_profiles_company_kind_key on public.cnc_company_profiles (company_id, kind);

-- the one-argument-less versions are replaced (a default argument next to them would make the call ambiguous)
drop function if exists public.erp_get_company_profile();
drop function if exists public.erp_save_company_profile(jsonb);

-- The saved profile of the caller's company for one document type (null if none yet).
create or replace function public.erp_get_company_profile(p_kind text default 'quotation')
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid;
begin
  if me.id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_kind not in ('quotation', 'invoice', 'dc') then raise exception 'Unknown document type'; end if;
  v_company := public.erp_report_company();
  return (select p.data from public.cnc_company_profiles p where p.company_id = v_company and p.kind = p_kind);
end;
$$;

-- Creates or replaces the profile of the caller's company for one document type.
-- Administrators, or members with the edit grant of that document's module, may save it.
create or replace function public.erp_save_company_profile(p_data jsonb, p_kind text default 'quotation')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid;
  v_module text := case p_kind when 'invoice' then 'invoices' when 'dc' then 'delivery' else 'quotations' end;
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
  insert into public.cnc_company_profiles (company_id, kind, data, updated_by)
  values (v_company, p_kind, p_data, me.full_name)
  on conflict (company_id, kind) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

revoke all on function public.erp_get_company_profile(text) from public, anon;
revoke all on function public.erp_save_company_profile(jsonb, text) from public, anon;
grant execute on function public.erp_get_company_profile(text) to authenticated;
grant execute on function public.erp_save_company_profile(jsonb, text) to authenticated;

commit;

select kind, count(*) as profiles from public.cnc_company_profiles group by kind order by kind;
