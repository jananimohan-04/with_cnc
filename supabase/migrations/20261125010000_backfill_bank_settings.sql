-- =====================================================================================
-- Backfill company-wide Bank Entry types & party mappings from existing transactions
--
-- Companies that already classified non-customer / non-supplier parties (such as
-- party_type = 'Other' or manual party names in cnc_bank_transactions) had no initial
-- row in cnc_bank_settings, so Manage Types looked empty until someone re-entered or
-- re-opened the original browser. This seeds cnc_bank_settings once per company
-- where others is still NULL without overwriting any saved settings.
-- =====================================================================================
begin;

with derived as (
  select distinct on (t.company_id, lower(btrim(t.party_name)))
    t.company_id,
    btrim(t.party_name) as party_name,
    case
      when lower(btrim(t.party_name)) = lower(btrim(c.company_name))
        or coalesce(t.description, '') ~* '(drawdown\s+from\s+casa|internal\s*(transfer|trans+action|trans|trf|fund\s*transfer)|inter\s*account|intra\s*bank|intra\s*transfer|self\s*(transfer|trans+action|trf)|own\s*account|sweep|contra)|oth[- ]*internal'
        then 'INTERNAL'
      when upper(btrim(coalesce(t.kind, ''))) in ('INTERNAL', 'SALARY', 'EXPENSE', 'INCOME', 'PERSONAL', 'OTHERS')
        then upper(btrim(t.kind))
      when coalesce(coa.name, '') ~* '\y(salar|wage|payroll|staff)'
        or coalesce(t.description, '') ~* '\y(salary|salaries|sal|wages?|payroll|staff)\y'
        then 'SALARY'
      when coalesce(coa.name, '') ~* '\y(loan|emi)\y'
        or coalesce(t.description, '') ~* '\y(emi|loan|instalment|installment)\y'
        then 'OTHERS'
      when coa.account_type = 'EXPENSE'
        then 'EXPENSE'
      when coa.account_type = 'INCOME'
        then 'INCOME'
      else 'OTHERS'
    end as mapped_kind
  from public.cnc_bank_transactions t
  join public.companies c on c.id = t.company_id
  left join public.chart_of_accounts coa on coa.id = t.contra_account_id
  where t.party_name is not null
    and btrim(t.party_name) <> ''
    and upper(btrim(t.party_name)) <> 'INTERNAL TRANSFER'
    and coalesce(t.party_type, '') not in ('Customer', 'Supplier')
    and not exists (
      select 1 from public.cnc_customers cu
      where cu.company_id = t.company_id
        and lower(btrim(cu.name)) = lower(btrim(t.party_name))
    )
    and not exists (
      select 1 from public.cnc_suppliers su
      where su.company_id = t.company_id
        and lower(btrim(su.name)) = lower(btrim(t.party_name))
    )
  order by
    t.company_id,
    lower(btrim(t.party_name)),
    case when coalesce(t.party_type, '') = 'Other' then 0 else 1 end,
    t.txn_date desc nulls last,
    t.created_at desc
),
per_company as (
  select
    d.company_id,
    jsonb_agg(
      jsonb_build_object('name', d.party_name, 'kind', d.mapped_kind)
      order by lower(d.party_name)
    ) as others_json
  from derived d
  group by d.company_id
)
insert into public.cnc_bank_settings (company_id, types, others, updated_by)
select
  p.company_id,
  null,
  p.others_json,
  'migration'
from per_company p
on conflict (company_id) do update
  set others = coalesce(public.cnc_bank_settings.others, excluded.others),
      updated_at = now()
where public.cnc_bank_settings.others is null;

commit;
