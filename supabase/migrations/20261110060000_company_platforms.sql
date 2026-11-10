-- Company platforms: each company can have the Business Intelligence app and/or the Retail Store switched on or off.
--   BI off     -> the company's users cannot open BI; when they sign in they go straight to the Retail Store.
--   Retail off -> the Retail Store and the BI pages linked to it (Digital Store, Retail Orders, Partner & Online Sales) are hidden.
-- A Super Admin always sees everything (needed to switch things back on). Safe to run more than once.

begin;

alter table public.companies add column if not exists bi_enabled boolean not null default true;
alter table public.companies add column if not exists retail_enabled boolean not null default true;

create or replace function public.erp_set_company_platforms(p_company_id uuid, p_bi boolean, p_retail boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
begin
  if me.id is null or me.role != 'SUPER_ADMIN' then
    raise exception 'Only Super Admin can switch a company''s platforms' using errcode = '42501';
  end if;
  if p_company_id is null then raise exception 'Company ID is required'; end if;
  if not coalesce(p_bi, true) and not coalesce(p_retail, true) then
    raise exception 'Keep at least one platform (BI or Retail Store) on for the company';
  end if;
  update public.companies
     set bi_enabled = coalesce(p_bi, true), retail_enabled = coalesce(p_retail, true), updated_at = now()
   where id = p_company_id;
  if not found then raise exception 'Company not found'; end if;
  return jsonb_build_object('bi_enabled', coalesce(p_bi, true), 'retail_enabled', coalesce(p_retail, true));
end;
$$;

revoke all on function public.erp_set_company_platforms(uuid, boolean, boolean) from public, anon;
grant execute on function public.erp_set_company_platforms(uuid, boolean, boolean) to authenticated;

commit;
