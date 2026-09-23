-- =====================================================================================
-- ARGUS CNC ERP — accounting foundation (double-entry journal) + financial reports
--
-- Run AFTER 20260923000000_multi_company_auth.sql, in the Supabase SQL editor.
-- One transaction: if anything fails, nothing is changed.
--
--   Source transaction ─► journal entry (+ lines) ─► ledger ─► account balances ─► reports
--
-- * chart_of_accounts / financial_years / journal_entries / journal_entry_lines are
--   company-isolated exactly like every other business table (company_id + RLS).
-- * The browser can only READ them. Writes go through the erp_* functions below, or are
--   posted automatically by triggers on the source modules:
--     cnc_invoices         → Dr Trade Receivables / Cr Sales   (+ receipt when status = Paid)
--     cnc_goods_receipts   → Dr Inventory + GST Input / Cr Trade Payables   (status = Posted)
--     cnc_stock_movements  → Dr Cost of Materials Consumed / Cr Inventory   (type = Issue)
-- * Every journal must balance (checked at commit). Amounts are numeric(18,2).
-- * Go-live: existing invoices are posted; existing stock is brought in once as an
--   "Opening stock" entry valued at stock_qty × unit_price (credit: Opening Balance Equity).
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 1. Financial-year setting per company (month the financial year starts; 4 = April)
-- -------------------------------------------------------------------------------------
alter table public.companies add column if not exists fy_start_month int not null default 4
  check (fy_start_month between 1 and 12);

-- -------------------------------------------------------------------------------------
-- 2. Tables
-- -------------------------------------------------------------------------------------
create table if not exists public.financial_years (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'Open' check (status in ('Open', 'Closed')),
  created_at  timestamptz not null default now(),
  check (end_date > start_date)
);

create table if not exists public.chart_of_accounts (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  name          text not null,
  parent_id     uuid references public.chart_of_accounts (id),
  account_type  text not null check (account_type in ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
  -- Set on the top Balance Sheet groups: drives Current / Non-Current totals and the current ratio.
  bs_class      text check (bs_class in ('NON_CURRENT', 'CURRENT')),
  is_group      boolean not null default false,
  -- Stable handle used by automatic postings (e.g. TRADE_RECEIVABLES). Null for user accounts.
  system_key    text,
  sort_order    int not null default 0,
  status        text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at    timestamptz not null default now()
);

create table if not exists public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  entry_no      text not null,
  entry_date    date not null,
  voucher_type  text not null check (voucher_type in ('Journal', 'Receipt', 'Payment', 'Contra', 'Sales', 'Purchase', 'Stock', 'Opening')),
  narration     text,
  reference     text,
  source_type   text,          -- e.g. 'invoice', 'grn', 'stock_issue'; null for manual vouchers
  source_id     text,
  is_system     boolean not null default false,
  created_by    text,
  created_at    timestamptz not null default now()
);

create table if not exists public.journal_entry_lines (
  id                uuid primary key default gen_random_uuid(),
  journal_entry_id  uuid not null references public.journal_entries (id) on delete cascade,
  account_id        uuid not null references public.chart_of_accounts (id),
  party_name        text,
  debit             numeric(18, 2) not null default 0 check (debit >= 0),
  credit            numeric(18, 2) not null default 0 check (credit >= 0),
  line_no           int not null default 0,
  check (debit = 0 or credit = 0),
  check (debit > 0 or credit > 0)
);

-- Company isolation (company_id column, trigger, RLS) — same as the other business tables.
select public.erp_secure_table('financial_years');
select public.erp_secure_table('chart_of_accounts');
select public.erp_secure_table('journal_entries');
select public.erp_secure_table('journal_entry_lines');

create unique index if not exists financial_years_company_start_key on public.financial_years (company_id, start_date);
create unique index if not exists chart_of_accounts_company_code_key on public.chart_of_accounts (company_id, code);
create unique index if not exists chart_of_accounts_company_key_key on public.chart_of_accounts (company_id, system_key) where system_key is not null;
create unique index if not exists journal_entries_company_no_key on public.journal_entries (company_id, entry_no);
create unique index if not exists journal_entries_source_key on public.journal_entries (company_id, source_type, source_id) where source_type is not null;
create index if not exists journal_entries_company_date_idx on public.journal_entries (company_id, entry_date);
create index if not exists journal_entry_lines_entry_idx on public.journal_entry_lines (journal_entry_id);
create index if not exists journal_entry_lines_account_idx on public.journal_entry_lines (account_id);

-- Read-only from the browser: reports are calculated, never typed in.
revoke insert, update, delete on public.financial_years, public.chart_of_accounts,
  public.journal_entries, public.journal_entry_lines from authenticated;

-- References must stay inside one company.
drop trigger if exists zz_erp_same_company_parent_id on public.chart_of_accounts;
create trigger zz_erp_same_company_parent_id before insert or update on public.chart_of_accounts
  for each row execute function public.erp_check_same_company('parent_id', 'chart_of_accounts');
drop trigger if exists zz_erp_same_company_journal_entry_id on public.journal_entry_lines;
create trigger zz_erp_same_company_journal_entry_id before insert or update on public.journal_entry_lines
  for each row execute function public.erp_check_same_company('journal_entry_id', 'journal_entries');
drop trigger if exists zz_erp_same_company_account_id on public.journal_entry_lines;
create trigger zz_erp_same_company_account_id before insert or update on public.journal_entry_lines
  for each row execute function public.erp_check_same_company('account_id', 'chart_of_accounts');

-- Every journal entry must balance. Checked when the transaction commits, so an entry can
-- be written line by line.
create or replace function public.erp_check_journal_balanced()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce(new.journal_entry_id, old.journal_entry_id);
  v_debit numeric;
  v_credit numeric;
begin
  if not exists (select 1 from public.journal_entries where id = v_id) then
    return null; -- the whole entry was deleted
  end if;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_debit, v_credit
  from public.journal_entry_lines where journal_entry_id = v_id;
  if v_debit <> v_credit or v_debit = 0 then
    raise exception 'Journal entry is not balanced (debit %, credit %)', v_debit, v_credit using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists erp_journal_balanced on public.journal_entry_lines;
create constraint trigger erp_journal_balanced after insert or update or delete on public.journal_entry_lines
  deferrable initially deferred for each row execute function public.erp_check_journal_balanced();

-- -------------------------------------------------------------------------------------
-- 3. Default chart of accounts (seeded once per company; editable afterwards)
-- -------------------------------------------------------------------------------------
create or replace function public.erp_seed_chart_of_accounts(p_company uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.chart_of_accounts where company_id = p_company) then
    return;
  end if;

  insert into public.chart_of_accounts (company_id, code, name, account_type, bs_class, is_group, system_key, sort_order)
  select p_company, v.code, v.name, v.account_type, v.bs_class, v.is_group, v.system_key, v.sort_order
  from (values
    -- code, name, parent, type, bs_class, group, key, sort
    ('1000', 'Non-Current Assets',               null,   'ASSET',     'NON_CURRENT', true,  null,                10),
    ('1100', 'Fixed Assets (Net)',               '1000', 'ASSET',     null,          true,  'FIXED_ASSETS',      11),
    ('1110', 'Land & Building',                  '1100', 'ASSET',     null,          false, null,                12),
    ('1120', 'Plant & Machinery',                '1100', 'ASSET',     null,          false, null,                13),
    ('1130', 'Furniture & Office Equipment',     '1100', 'ASSET',     null,          false, null,                14),
    ('1190', 'Accumulated Depreciation',         '1100', 'ASSET',     null,          false, 'ACCUMULATED_DEPRECIATION', 15),
    ('1200', 'Capital Work in Progress',         '1000', 'ASSET',     null,          false, null,                16),
    ('1300', 'Security Deposits',                '1000', 'ASSET',     null,          false, null,                17),
    ('1500', 'Current Assets',                   null,   'ASSET',     'CURRENT',     true,  null,                20),
    ('1510', 'Inventory',                        '1500', 'ASSET',     null,          true,  'INVENTORY',         21),
    ('1511', 'Raw Materials',                    '1510', 'ASSET',     null,          false, 'INV_RAW',           22),
    ('1512', 'Work in Progress',                 '1510', 'ASSET',     null,          false, 'INV_WIP',           23),
    ('1513', 'Finished Goods & Components',      '1510', 'ASSET',     null,          false, 'INV_FG',            24),
    ('1520', 'Trade Receivables (Customers)',    '1500', 'ASSET',     null,          false, 'TRADE_RECEIVABLES', 25),
    ('1530', 'Cash in Hand',                     '1500', 'ASSET',     null,          false, 'CASH',              26),
    ('1540', 'Bank Balances',                    '1500', 'ASSET',     null,          true,  'BANK_GROUP',        27),
    ('1541', 'Bank Account',                     '1540', 'ASSET',     null,          false, 'BANK_DEFAULT',      28),
    ('1550', 'Advances & Other Receivables',     '1500', 'ASSET',     null,          false, null,                29),
    ('1560', 'Prepaid Expenses',                 '1500', 'ASSET',     null,          false, null,                30),
    ('1570', 'Other Current Assets',             '1500', 'ASSET',     null,          true,  null,                31),
    ('1571', 'GST Input Tax Credit',             '1570', 'ASSET',     null,          false, 'GST_INPUT',         32),
    ('1579', 'Other Current Assets',             '1570', 'ASSET',     null,          false, null,                33),
    ('2000', 'Liabilities',                      null,   'LIABILITY', null,          true,  null,                40),
    ('2100', 'Non-Current Liabilities',          '2000', 'LIABILITY', 'NON_CURRENT', true,  null,                41),
    ('2110', 'Term Loans (Bank)',                '2100', 'LIABILITY', null,          false, null,                42),
    ('2120', 'Other Long Term Liabilities',      '2100', 'LIABILITY', null,          false, null,                43),
    ('2500', 'Current Liabilities',              '2000', 'LIABILITY', 'CURRENT',     true,  null,                44),
    ('2510', 'Trade Payables (Suppliers)',       '2500', 'LIABILITY', null,          false, 'TRADE_PAYABLES',    45),
    ('2520', 'Short Term Loans / OD',            '2500', 'LIABILITY', null,          false, null,                46),
    ('2530', 'Statutory Liabilities (GST, TDS, PF, ESI)', '2500', 'LIABILITY', null, true,  'STATUTORY',         47),
    ('2531', 'GST Output Payable',               '2530', 'LIABILITY', null,          false, 'GST_OUTPUT',        48),
    ('2532', 'TDS Payable',                      '2530', 'LIABILITY', null,          false, null,                49),
    ('2533', 'PF / ESI Payable',                 '2530', 'LIABILITY', null,          false, null,                50),
    ('2540', 'Other Current Liabilities',        '2500', 'LIABILITY', null,          false, null,                51),
    ('3000', 'Equity',                           null,   'EQUITY',    null,          true,  null,                60),
    ('3100', 'Capital Account',                  '3000', 'EQUITY',    null,          false, 'CAPITAL',           61),
    ('3200', 'Retained Earnings',                '3000', 'EQUITY',    null,          false, 'RETAINED_EARNINGS', 62),
    ('3300', 'Opening Balance Equity',           '3000', 'EQUITY',    null,          false, 'OPENING_EQUITY',    63),
    ('4000', 'Income',                           null,   'INCOME',    null,          true,  null,                70),
    ('4100', 'Sales Revenue',                    '4000', 'INCOME',    null,          false, 'SALES',             71),
    ('4200', 'Other Income',                     '4000', 'INCOME',    null,          false, null,                72),
    ('5000', 'Expenses',                         null,   'EXPENSE',   null,          true,  null,                80),
    ('5100', 'Cost of Materials Consumed',       '5000', 'EXPENSE',   null,          false, 'MATERIAL_CONSUMED', 81),
    ('5200', 'Direct Expenses',                  '5000', 'EXPENSE',   null,          false, null,                82),
    ('5300', 'Salaries & Wages',                 '5000', 'EXPENSE',   null,          false, null,                83),
    ('5400', 'Power & Fuel',                     '5000', 'EXPENSE',   null,          false, null,                84),
    ('5500', 'Repairs & Maintenance',            '5000', 'EXPENSE',   null,          false, null,                85),
    ('5600', 'Depreciation',                     '5000', 'EXPENSE',   null,          false, 'DEPRECIATION',      86),
    ('5900', 'Other Expenses',                   '5000', 'EXPENSE',   null,          false, null,                87)
  ) as v(code, name, parent_code, account_type, bs_class, is_group, system_key, sort_order);

  update public.chart_of_accounts child
  set parent_id = parent.id
  from (values
    ('1100','1000'),('1110','1100'),('1120','1100'),('1130','1100'),('1190','1100'),('1200','1000'),('1300','1000'),
    ('1510','1500'),('1511','1510'),('1512','1510'),('1513','1510'),('1520','1500'),('1530','1500'),('1540','1500'),
    ('1541','1540'),('1550','1500'),('1560','1500'),('1570','1500'),('1571','1570'),('1579','1570'),
    ('2100','2000'),('2110','2100'),('2120','2100'),('2500','2000'),('2510','2500'),('2520','2500'),('2530','2500'),
    ('2531','2530'),('2532','2530'),('2533','2530'),('2540','2500'),
    ('3100','3000'),('3200','3000'),('3300','3000'),
    ('4100','4000'),('4200','4000'),
    ('5100','5000'),('5200','5000'),('5300','5000'),('5400','5000'),('5500','5000'),('5600','5000'),('5900','5000')
  ) as link(code, parent_code)
  join public.chart_of_accounts parent on parent.company_id = p_company and parent.code = link.parent_code
  where child.company_id = p_company and child.code = link.code;
end;
$$;

create or replace function public.erp_seed_company_accounts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.erp_seed_chart_of_accounts(new.id);
  return new;
end;
$$;

drop trigger if exists erp_seed_company_accounts on public.companies;
create trigger erp_seed_company_accounts after insert on public.companies
  for each row execute function public.erp_seed_company_accounts();

-- -------------------------------------------------------------------------------------
-- 4. Internal posting helpers (not callable from the browser)
-- -------------------------------------------------------------------------------------

-- The financial year containing p_date, created from the company's start month if missing.
create or replace function public.erp_ensure_financial_year(p_company uuid, p_date date)
returns public.financial_years
language plpgsql security definer set search_path = ''
as $$
declare
  fy public.financial_years;
  v_month int;
  v_start date;
  v_end date;
begin
  select * into fy from public.financial_years
  where company_id = p_company and p_date between start_date and end_date;
  if fy.id is not null then return fy; end if;

  select fy_start_month into v_month from public.companies where id = p_company;
  v_month := coalesce(v_month, 4);
  v_start := make_date(extract(year from p_date)::int - case when extract(month from p_date) < v_month then 1 else 0 end, v_month, 1);
  v_end := (v_start + interval '1 year' - interval '1 day')::date;

  insert into public.financial_years (company_id, name, start_date, end_date)
  values (p_company,
          case when v_month = 1 then 'FY ' || extract(year from v_start)
               else 'FY ' || extract(year from v_start) || ' - ' || lpad(((extract(year from v_start)::int + 1) % 100)::text, 2, '0') end,
          v_start, v_end)
  on conflict do nothing;

  select * into fy from public.financial_years
  where company_id = p_company and p_date between start_date and end_date;
  return fy;
end;
$$;

create or replace function public.erp_account_id(p_company uuid, p_key text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.chart_of_accounts where company_id = p_company and system_key = p_key
$$;

create or replace function public.erp_next_entry_no(p_company uuid, p_voucher text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_prefix text := case p_voucher
    when 'Receipt' then 'RV' when 'Payment' then 'PV' when 'Contra' then 'CV' when 'Sales' then 'SV'
    when 'Purchase' then 'PU' when 'Stock' then 'ST' when 'Opening' then 'OB' else 'JV' end;
  v_next int;
begin
  perform pg_advisory_xact_lock(hashtext('erp_journal_no_' || p_company::text));
  select coalesce(max(substring(entry_no from '(\d+)$')::int), 0) + 1 into v_next
  from public.journal_entries where company_id = p_company and entry_no like v_prefix || '-%';
  return v_prefix || '-' || lpad(v_next::text, 5, '0');
end;
$$;

-- (Re)writes the automatic journal of one source record. Lines: [{key | account_id, debit, credit, party}].
-- An empty/zero set of lines removes the journal (e.g. an invoice that is no longer Paid).
create or replace function public.erp_post_system_journal(
  p_company uuid, p_source_type text, p_source_id text, p_date date, p_voucher text,
  p_narration text, p_reference text, p_lines jsonb)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_fy public.financial_years;
  l jsonb;
  v_account uuid;
  v_debit numeric;
  v_credit numeric;
  n int := 0;
begin
  select id into v_id from public.journal_entries
  where company_id = p_company and source_type = p_source_type and source_id = p_source_id;

  if p_lines is null or not exists (
       select 1 from jsonb_array_elements(p_lines) x
       where coalesce((x ->> 'debit')::numeric, 0) + coalesce((x ->> 'credit')::numeric, 0) > 0) then
    if v_id is not null then delete from public.journal_entries where id = v_id; end if;
    return null;
  end if;

  v_fy := public.erp_ensure_financial_year(p_company, p_date);
  if v_fy.status = 'Closed' then
    raise exception '% is closed; this transaction cannot be posted', v_fy.name using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.journal_entries (company_id, entry_no, entry_date, voucher_type, narration, reference,
                                        source_type, source_id, is_system, created_by)
    values (p_company, public.erp_next_entry_no(p_company, p_voucher), p_date, p_voucher, p_narration, p_reference,
            p_source_type, p_source_id, true, 'System')
    returning id into v_id;
  else
    update public.journal_entries
    set entry_date = p_date, voucher_type = p_voucher, narration = p_narration, reference = p_reference
    where id = v_id;
    delete from public.journal_entry_lines where journal_entry_id = v_id;
  end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_debit := round(coalesce((l ->> 'debit')::numeric, 0), 2);
    v_credit := round(coalesce((l ->> 'credit')::numeric, 0), 2);
    continue when v_debit = 0 and v_credit = 0;
    v_account := coalesce((l ->> 'account_id')::uuid, public.erp_account_id(p_company, l ->> 'key'));
    if v_account is null then
      raise exception 'Account "%" is missing from the chart of accounts', l ->> 'key';
    end if;
    n := n + 1;
    insert into public.journal_entry_lines (company_id, journal_entry_id, account_id, party_name, debit, credit, line_no)
    values (p_company, v_id, v_account, nullif(l ->> 'party', ''), v_debit, v_credit, n);
  end loop;
  return v_id;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 5. Automatic postings from the source modules
-- -------------------------------------------------------------------------------------

-- Sales invoice → receivable; "Paid" → receipt into the default bank account.
create or replace function public.erp_post_invoice()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_amount numeric;
  v_date date;
  v_label text;
begin
  if tg_op = 'DELETE' then
    delete from public.journal_entries
    where company_id = old.company_id and source_type in ('invoice', 'invoice_receipt') and source_id = old.id::text;
    return old;
  end if;

  v_amount := round(coalesce(new.amount::numeric, 0), 2);
  v_date := coalesce(new.invoice_date::date, new.created_at::date, public.erp_today());
  v_label := 'Invoice ' || coalesce(new.invoice_no, '') || coalesce(' — ' || new.customer_name, '');

  perform public.erp_post_system_journal(new.company_id, 'invoice', new.id::text, v_date, 'Sales',
    'Sales: ' || v_label, new.invoice_no,
    jsonb_build_array(
      jsonb_build_object('key', 'TRADE_RECEIVABLES', 'debit', v_amount, 'party', new.customer_name),
      jsonb_build_object('key', 'SALES', 'credit', v_amount)));

  perform public.erp_post_system_journal(new.company_id, 'invoice_receipt', new.id::text, v_date, 'Receipt',
    'Receipt against ' || v_label, new.invoice_no,
    case when new.status = 'Paid' then jsonb_build_array(
      jsonb_build_object('key', 'BANK_DEFAULT', 'debit', v_amount),
      jsonb_build_object('key', 'TRADE_RECEIVABLES', 'credit', v_amount, 'party', new.customer_name)) end);
  return new;
end;
$$;

drop trigger if exists zz_erp_post_journal on public.cnc_invoices;
create trigger zz_erp_post_journal after insert or update or delete on public.cnc_invoices
  for each row execute function public.erp_post_invoice();

-- Posted goods receipt → inventory (+ GST input) against the supplier's payable.
-- Value = received qty × PO unit price; purchase-order items store the GST % in tax_amount.
create or replace function public.erp_post_goods_receipt()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_supplier text;
  v_lines jsonb;
  v_total numeric;
begin
  if tg_op = 'DELETE' then
    delete from public.journal_entries where company_id = old.company_id and source_type = 'grn' and source_id = old.id::text;
    return old;
  end if;

  if new.status is distinct from 'Posted' then
    perform public.erp_post_system_journal(new.company_id, 'grn', new.id::text, public.erp_today(), 'Purchase', null, null, null);
    return new;
  end if;

  select s.name into v_supplier from public.cnc_suppliers s where s.id = new.supplier_id;

  with valued as (
    select case when gi.part_id is not null and gi.raw_material_id is null then 'INV_FG' else 'INV_RAW' end as inv_key,
           round(coalesce(gi.received_qty, 0)::numeric * coalesce(poi.unit_price, 0)::numeric, 2) as value,
           round(round(coalesce(gi.received_qty, 0)::numeric * coalesce(poi.unit_price, 0)::numeric, 2)
                 * coalesce(poi.tax_amount, 0)::numeric / 100, 2) as tax
    from public.cnc_goods_receipt_items gi
    left join public.cnc_purchase_order_items poi on poi.id = gi.purchase_order_item_id
    where gi.goods_receipt_id = new.id
  ),
  per_account as (
    select inv_key as key, sum(value) as amount from valued group by inv_key
    union all
    select 'GST_INPUT', sum(tax) from valued
  )
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'debit', amount)) filter (where amount > 0), '[]'::jsonb),
         coalesce(sum(amount), 0)
  into v_lines, v_total
  from per_account;

  perform public.erp_post_system_journal(new.company_id, 'grn', new.id::text,
    coalesce(new.receipt_date::date, public.erp_today()), 'Purchase',
    'Goods receipt ' || coalesce(new.grn_number, '') || coalesce(' — ' || v_supplier, ''),
    coalesce(new.supplier_invoice_no, new.grn_number),
    case when v_total > 0 then v_lines || jsonb_build_array(
      jsonb_build_object('key', 'TRADE_PAYABLES', 'credit', v_total, 'party', v_supplier)) end);
  return new;
end;
$$;

drop trigger if exists zz_erp_post_journal on public.cnc_goods_receipts;
create trigger zz_erp_post_journal after insert or update or delete on public.cnc_goods_receipts
  for each row execute function public.erp_post_goods_receipt();

-- Material issued to production → cost of materials consumed, valued at the item's unit price.
create or replace function public.erp_post_stock_issue()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_price numeric;
  v_key text := 'INV_RAW';
  v_value numeric;
begin
  if tg_op = 'DELETE' then
    delete from public.journal_entries where company_id = old.company_id and source_type = 'stock_issue' and source_id = old.id::text;
    return old;
  end if;

  if new.type is distinct from 'Issue' then
    perform public.erp_post_system_journal(new.company_id, 'stock_issue', new.id::text, public.erp_today(), 'Stock', null, null, null);
    return new;
  end if;

  select rm.unit_price into v_price from public.cnc_raw_materials rm
  where rm.company_id = new.company_id and (rm.material_code = new.material or rm.name = new.material)
  order by (rm.material_code = new.material) desc limit 1;
  if v_price is null then
    select p.unit_price into v_price from public.cnc_parts p
    where p.company_id = new.company_id and (p.part_no = new.material or p.part_name = new.material) limit 1;
    if v_price is not null then v_key := 'INV_FG'; end if;
  end if;
  v_value := round(abs(coalesce(new.qty::numeric, 0)) * coalesce(v_price, 0), 2);

  perform public.erp_post_system_journal(new.company_id, 'stock_issue', new.id::text,
    coalesce(new.date::date, public.erp_today()), 'Stock',
    'Material issued: ' || coalesce(new.material, '') || coalesce(' (' || new.reference || ')', ''), new.reference,
    case when v_value > 0 then jsonb_build_array(
      jsonb_build_object('key', 'MATERIAL_CONSUMED', 'debit', v_value),
      jsonb_build_object('key', v_key, 'credit', v_value)) end);
  return new;
end;
$$;

drop trigger if exists zz_erp_post_journal on public.cnc_stock_movements;
create trigger zz_erp_post_journal after insert or update or delete on public.cnc_stock_movements
  for each row execute function public.erp_post_stock_issue();

-- -------------------------------------------------------------------------------------
-- 6. Report scope + calculation helpers
-- -------------------------------------------------------------------------------------

-- The single company a report is calculated for: your own, or (Super Admin) the one selected.
create or replace function public.erp_report_company()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare u public.company_users := public.erp_current_user();
begin
  if u.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if u.role = 'SUPER_ADMIN' then
    if u.active_company_id is null then
      raise exception 'Select a company in the top bar to work with its accounts' using errcode = '22023';
    end if;
    return u.active_company_id;
  end if;
  return u.company_id;
end;
$$;

-- Debit/credit per account (own postings only) for a date window.
create or replace function public.erp_account_movements(p_company uuid, p_from date, p_to date)
returns table (account_id uuid, debit numeric, credit numeric)
language sql stable security definer set search_path = ''
as $$
  select l.account_id, sum(l.debit), sum(l.credit)
  from public.journal_entry_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  where e.company_id = p_company and l.company_id = p_company
    and (p_from is null or e.entry_date >= p_from)
    and e.entry_date <= p_to
  group by l.account_id
$$;

-- Net profit (income − expenses) for a date window.
create or replace function public.erp_net_profit(p_company uuid, p_from date, p_to date)
returns numeric
language sql stable security definer set search_path = ''
as $$
    -- income (credit − debit) minus expenses (debit − credit) = Σ(credit − debit) over both
  select coalesce(sum(m.credit - m.debit), 0)
  from public.erp_account_movements(p_company, p_from, p_to) m
  join public.chart_of_accounts a on a.id = m.account_id
  where a.account_type in ('INCOME', 'EXPENSE')
$$;

-- Accounts with their own signed balance and the rolled-up total of their subtree.
-- Sign: ASSET/EXPENSE = debit − credit, LIABILITY/EQUITY/INCOME = credit − debit.
create or replace function public.erp_account_tree(p_company uuid, p_from date, p_to date, p_types text[])
returns table (id uuid, parent_id uuid, code text, name text, account_type text, bs_class text,
               is_group boolean, system_key text, sort_order int, level int, own numeric, amount numeric)
language sql stable security definer set search_path = ''
as $$
  with recursive accts as (
    select a.* from public.chart_of_accounts a
    where a.company_id = p_company and a.account_type = any (p_types)
  ),
  own as (
    select a.id,
           coalesce(case when a.account_type in ('ASSET', 'EXPENSE') then m.debit - m.credit else m.credit - m.debit end, 0) as own
    from accts a
    left join public.erp_account_movements(p_company, p_from, p_to) m on m.account_id = a.id
  ),
  closure as (
    select a.id as ancestor, a.id as descendant from accts a
    union all
    select c.ancestor, child.id from closure c join accts child on child.parent_id = c.descendant
  ),
  depth as (
    select a.id, 0 as level from accts a where a.parent_id is null
    union all
    select child.id, d.level + 1 from depth d join accts child on child.parent_id = d.id
  )
  select a.id, a.parent_id, a.code, a.name, a.account_type, a.bs_class, a.is_group, a.system_key, a.sort_order,
         d.level, o.own, (select coalesce(sum(o2.own), 0) from closure c join own o2 on o2.id = c.descendant where c.ancestor = a.id)
  from accts a
  join own o on o.id = a.id
  join depth d on d.id = a.id
$$;

-- One voucher as JSON (internal: callers enforce the company scope).
create or replace function public.erp_journal_json(p_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'entry_no', e.entry_no, 'entry_date', e.entry_date, 'voucher_type', e.voucher_type,
    'narration', e.narration, 'reference', e.reference, 'source_type', e.source_type, 'source_id', e.source_id,
    'is_system', e.is_system, 'created_by', e.created_by, 'created_at', e.created_at,
    'total', (select coalesce(sum(l.debit), 0)::text from public.journal_entry_lines l where l.journal_entry_id = e.id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'account_id', l.account_id, 'account_code', a.code, 'account_name', a.name, 'party', l.party_name,
                'debit', l.debit::text, 'credit', l.credit::text) order by l.line_no), '[]'::jsonb)
              from public.journal_entry_lines l join public.chart_of_accounts a on a.id = l.account_id
              where l.journal_entry_id = e.id))
  from public.journal_entries e where e.id = p_id
$$;

-- -------------------------------------------------------------------------------------
-- 7. Report functions (callable by signed-in ERP users; scoped to one company)
-- -------------------------------------------------------------------------------------

-- Financial years of the current company (creates the current one if needed).
create or replace function public.erp_financial_years()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  v_first date;
begin
  perform public.erp_ensure_financial_year(v_company, public.erp_today());
  select min(entry_date) into v_first from public.journal_entries where company_id = v_company;
  if v_first is not null then perform public.erp_ensure_financial_year(v_company, v_first); end if;
  return jsonb_build_object(
    'company', (select jsonb_build_object('id', c.id, 'company_name', c.company_name, 'fy_start_month', c.fy_start_month)
                from public.companies c where c.id = v_company),
    'today', public.erp_today(),
    'years', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', f.id, 'name', f.name, 'start_date', f.start_date, 'end_date', f.end_date, 'status', f.status,
                'is_current', public.erp_today() between f.start_date and f.end_date) order by f.start_date desc), '[]')
              from public.financial_years f where f.company_id = v_company));
end;
$$;

create or replace function public.erp_balance_sheet(p_fy_id uuid, p_as_of date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  fy public.financial_years;
  v_re uuid;
  v_re_path uuid[];
  v_re_own numeric;
  v_re_level int;
  v_pnl_prior numeric;
  v_pnl_current numeric;
  v_rows jsonb;
  t_assets numeric; t_liab numeric; t_equity numeric; t_ca numeric; t_cl numeric; t_nca numeric; t_ncl numeric;
begin
  select * into fy from public.financial_years where id = p_fy_id and company_id = v_company;
  if fy.id is null then
    raise exception 'Financial year not found' using errcode = '22023';
  end if;
  if p_as_of is null or p_as_of < fy.start_date or p_as_of > fy.end_date then
    raise exception 'The as-on date must fall within % (% to %)', fy.name, fy.start_date, fy.end_date using errcode = '22023';
  end if;

  -- Profit & loss flows into equity: earlier years (brought forward) and this year up to the date.
  v_pnl_prior := public.erp_net_profit(v_company, null, fy.start_date - 1);
  v_pnl_current := public.erp_net_profit(v_company, fy.start_date, p_as_of);
  v_re := public.erp_account_id(v_company, 'RETAINED_EARNINGS');

  -- Retained Earnings and every group above it carry the P&L.
  with recursive up as (
    select id, parent_id from public.chart_of_accounts where id = v_re
    union all
    select a.id, a.parent_id from public.chart_of_accounts a join up on a.id = up.parent_id
  )
  select coalesce(array_agg(id), '{}') into v_re_path from up;

  with t as (
    select tr.*, tr.amount + case when tr.id = any (v_re_path) then v_pnl_prior + v_pnl_current else 0 end as amt
    from public.erp_account_tree(v_company, null, p_as_of, array['ASSET', 'LIABILITY', 'EQUITY']) tr
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'parent_id', t.parent_id, 'code', t.code, 'name', t.name, 'account_type', t.account_type,
      'bs_class', t.bs_class, 'is_group', t.is_group or t.id = v_re, 'system_key', t.system_key,
      'level', t.level, 'amount', t.amt::text, 'virtual', false) order by t.sort_order, t.code), '[]'::jsonb),
    coalesce(sum(t.amt) filter (where t.account_type = 'ASSET' and t.parent_id is null), 0),
    coalesce(sum(t.amt) filter (where t.account_type = 'LIABILITY' and t.parent_id is null), 0),
    coalesce(sum(t.amt) filter (where t.account_type = 'EQUITY' and t.parent_id is null), 0),
    -- Current / non-current totals come from the top-most groups that carry a bs_class.
    coalesce(sum(t.amt) filter (where t.account_type = 'ASSET' and t.bs_class = 'CURRENT' and p.bs_class is null), 0),
    coalesce(sum(t.amt) filter (where t.account_type = 'LIABILITY' and t.bs_class = 'CURRENT' and p.bs_class is null), 0),
    coalesce(sum(t.amt) filter (where t.account_type = 'ASSET' and t.bs_class = 'NON_CURRENT' and p.bs_class is null), 0),
    coalesce(sum(t.amt) filter (where t.account_type = 'LIABILITY' and t.bs_class = 'NON_CURRENT' and p.bs_class is null), 0),
    max(t.own) filter (where t.id = v_re),
    max(t.level) filter (where t.id = v_re)
  into v_rows, t_assets, t_liab, t_equity, t_ca, t_cl, t_nca, t_ncl, v_re_own, v_re_level
  from t left join t p on p.id = t.parent_id;

  -- Explain Retained Earnings: brought forward + this period's profit/loss.
  if v_re is not null then
    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object('id', 're_brought_forward', 'parent_id', v_re, 'code', '', 'account_type', 'EQUITY',
        'name', 'Balance brought forward (up to ' || to_char(fy.start_date - 1, 'DD Mon YYYY') || ')',
        'is_group', false, 'level', v_re_level + 1,
        'amount', (coalesce(v_re_own, 0) + v_pnl_prior)::text, 'virtual', true, 'link', 'ledger'),
      jsonb_build_object('id', 're_current_period', 'parent_id', v_re, 'code', '', 'account_type', 'EQUITY',
        'name', 'Profit / (Loss) for the period', 'is_group', false, 'level', v_re_level + 1,
        'amount', v_pnl_current::text, 'virtual', true, 'link', 'profit_loss'));
  end if;

  return jsonb_build_object(
    'company', (select company_name from public.companies where id = v_company),
    'financial_year', jsonb_build_object('id', fy.id, 'name', fy.name, 'start_date', fy.start_date, 'end_date', fy.end_date, 'status', fy.status),
    'as_of', p_as_of,
    'generated_at', now(),
    'has_data', exists (select 1 from public.journal_entries e where e.company_id = v_company and e.entry_date <= p_as_of),
    'rows', v_rows,
    'totals', jsonb_build_object(
      'assets', t_assets::text, 'liabilities', t_liab::text, 'equity', t_equity::text,
      'liabilities_and_equity', (t_liab + t_equity)::text,
      'current_assets', t_ca::text, 'current_liabilities', t_cl::text,
      'non_current_assets', t_nca::text, 'non_current_liabilities', t_ncl::text,
      'profit_current_period', v_pnl_current::text),
    'current_ratio', case when t_cl > 0 then round(t_ca / t_cl, 2)::text end,
    'balanced', t_assets = t_liab + t_equity,
    'difference', (t_assets - (t_liab + t_equity))::text);
end;
$$;

create or replace function public.erp_profit_and_loss(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  v_income numeric;
  v_expense numeric;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a valid period' using errcode = '22023';
  end if;
  select coalesce(sum(amount) filter (where account_type = 'INCOME' and parent_id is null), 0),
         coalesce(sum(amount) filter (where account_type = 'EXPENSE' and parent_id is null), 0)
  into v_income, v_expense
  from public.erp_account_tree(v_company, p_from, p_to, array['INCOME', 'EXPENSE']);

  return jsonb_build_object(
    'company', (select company_name from public.companies where id = v_company),
    'from', p_from, 'to', p_to,
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'parent_id', t.parent_id, 'code', t.code, 'name', t.name, 'account_type', t.account_type,
               'is_group', t.is_group, 'level', t.level, 'amount', t.amount::text) order by t.sort_order, t.code), '[]')
             from public.erp_account_tree(v_company, p_from, p_to, array['INCOME', 'EXPENSE']) t),
    'totals', jsonb_build_object('income', v_income::text, 'expenses', v_expense::text, 'net_profit', (v_income - v_expense)::text));
end;
$$;

-- Closing debit/credit per account. Balance-sheet accounts are cumulative to the as-on date;
-- income/expense accounts run from the start of the year, earlier years sit in Retained Earnings.
create or replace function public.erp_trial_balance(p_fy_id uuid, p_as_of date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  fy public.financial_years;
  v_prior numeric;
  v_rows jsonb;
begin
  select * into fy from public.financial_years where id = p_fy_id and company_id = v_company;
  if fy.id is null then raise exception 'Financial year not found' using errcode = '22023'; end if;
  if p_as_of < fy.start_date or p_as_of > fy.end_date then
    raise exception 'The as-on date must fall within %', fy.name using errcode = '22023';
  end if;
  v_prior := public.erp_net_profit(v_company, null, fy.start_date - 1);

  with bal as (
    select a.id, a.code, a.name, a.account_type, a.sort_order,
           coalesce(m.debit, 0) - coalesce(m.credit, 0) as net
    from public.chart_of_accounts a
    left join lateral (
      select sum(l.debit) as debit, sum(l.credit) as credit
      from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id
      where l.account_id = a.id and e.company_id = v_company and e.entry_date <= p_as_of
        and (a.account_type in ('ASSET', 'LIABILITY', 'EQUITY') or e.entry_date >= fy.start_date)
    ) m on true
    where a.company_id = v_company and not a.is_group
  ),
  adjusted as (
    select id, code, name, account_type, sort_order,
           net - case when id = public.erp_account_id(v_company, 'RETAINED_EARNINGS') then v_prior else 0 end as net
    from bal
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'code', code, 'name', name, 'account_type', account_type,
           'debit', greatest(net, 0)::text, 'credit', greatest(-net, 0)::text) order by sort_order, code), '[]')
  into v_rows from adjusted where net <> 0;

  return jsonb_build_object(
    'company', (select company_name from public.companies where id = v_company),
    'financial_year', jsonb_build_object('id', fy.id, 'name', fy.name, 'start_date', fy.start_date, 'end_date', fy.end_date),
    'as_of', p_as_of,
    'rows', v_rows,
    'totals', (select jsonb_build_object('debit', coalesce(sum((r ->> 'debit')::numeric), 0)::text,
                                         'credit', coalesce(sum((r ->> 'credit')::numeric), 0)::text)
               from jsonb_array_elements(v_rows) r));
end;
$$;

-- Ledger of one account (a group includes all accounts below it) with running balance.
create or replace function public.erp_account_ledger(p_account_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  a public.chart_of_accounts;
  v_sign int;
  v_opening numeric;
  v_open_from date;
  v_lines jsonb;
  v_ids uuid[];
begin
  select * into a from public.chart_of_accounts where id = p_account_id and company_id = v_company;
  if a.id is null then raise exception 'Account not found' using errcode = '22023'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Choose a valid period' using errcode = '22023'; end if;
  v_sign := case when a.account_type in ('ASSET', 'EXPENSE') then 1 else -1 end;
  -- Income/expense balances restart every financial year.
  v_open_from := case when a.account_type in ('INCOME', 'EXPENSE')
                      then (public.erp_ensure_financial_year(v_company, p_from)).start_date end;

  with recursive sub as (
    select id from public.chart_of_accounts where id = a.id
    union all
    select c.id from public.chart_of_accounts c join sub on c.parent_id = sub.id where c.company_id = v_company
  )
  select array_agg(id) into v_ids from sub;

  select coalesce(sum(l.debit - l.credit), 0) * v_sign into v_opening
  from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id
  where e.company_id = v_company and l.account_id = any (v_ids)
    and e.entry_date < p_from and (v_open_from is null or e.entry_date >= v_open_from);

  select coalesce(jsonb_agg(x order by x ->> 'sort'), '[]') into v_lines
  from (
    select jsonb_build_object(
      'sort', to_char(e.entry_date, 'YYYYMMDD') || e.entry_no || lpad(l.line_no::text, 4, '0'),
      'journal_id', e.id, 'entry_no', e.entry_no, 'entry_date', e.entry_date, 'voucher_type', e.voucher_type,
      'narration', e.narration, 'reference', e.reference, 'source_type', e.source_type, 'source_id', e.source_id,
      'account', ac.name, 'party', l.party_name, 'debit', l.debit::text, 'credit', l.credit::text,
      'balance', (v_opening + v_sign * sum(l.debit - l.credit) over (
                   order by e.entry_date, e.entry_no, l.line_no rows between unbounded preceding and current row))::text) as x
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id
    join public.chart_of_accounts ac on ac.id = l.account_id
    where e.company_id = v_company and l.account_id = any (v_ids)
      and e.entry_date between p_from and p_to
  ) q;

  return jsonb_build_object(
    'account', jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name, 'account_type', a.account_type, 'is_group', a.is_group),
    'from', p_from, 'to', p_to,
    'opening', v_opening::text,
    'lines', v_lines,
    'totals', (select jsonb_build_object('debit', coalesce(sum((x ->> 'debit')::numeric), 0)::text,
                                         'credit', coalesce(sum((x ->> 'credit')::numeric), 0)::text)
               from jsonb_array_elements(v_lines) x),
    'closing', (v_opening + v_sign * coalesce((select sum((x ->> 'debit')::numeric - (x ->> 'credit')::numeric)
                                               from jsonb_array_elements(v_lines) x), 0))::text);
end;
$$;

-- Chart of accounts of the current company.
create or replace function public.erp_chart_of_accounts()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'parent_id', a.parent_id, 'code', a.code, 'name', a.name, 'account_type', a.account_type,
    'bs_class', a.bs_class, 'is_group', a.is_group, 'system_key', a.system_key, 'status', a.status,
    'has_postings', exists (select 1 from public.journal_entry_lines l where l.account_id = a.id))
    order by a.sort_order, a.code), '[]'::jsonb)
  from public.chart_of_accounts a
  where a.company_id = public.erp_report_company()
$$;

-- Vouchers of the current company in a period (newest first), with their lines.
create or replace function public.erp_journal_entries(p_from date, p_to date)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(public.erp_journal_json(e.id) order by e.entry_date desc, e.entry_no desc), '[]'::jsonb)
  from public.journal_entries e
  where e.company_id = public.erp_report_company() and e.entry_date between p_from and p_to
$$;

create or replace function public.erp_journal_entry(p_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select public.erp_journal_json(e.id) from public.journal_entries e
  where e.id = p_id and e.company_id = public.erp_report_company()
$$;

-- -------------------------------------------------------------------------------------
-- 8. Manual vouchers and chart-of-accounts maintenance
-- -------------------------------------------------------------------------------------

-- Create (p_id null) or replace a manual voucher. p_lines: [{account_id, debit, credit, party}]
create or replace function public.erp_save_journal(
  p_id uuid, p_entry_date date, p_voucher_type text, p_narration text, p_reference text, p_lines jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  v_fy public.financial_years;
  v_existing public.journal_entries;
  v_id uuid;
  v_no text;
  l jsonb;
  v_acc public.chart_of_accounts;
  v_debit numeric;
  v_credit numeric;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  n int := 0;
begin
  if p_voucher_type not in ('Journal', 'Receipt', 'Payment', 'Contra', 'Opening') then
    raise exception 'Voucher type must be Journal, Receipt, Payment, Contra or Opening';
  end if;
  if p_entry_date is null then raise exception 'Voucher date is required'; end if;
  if p_lines is null or jsonb_array_length(p_lines) < 2 then
    raise exception 'A voucher needs at least two lines';
  end if;

  v_fy := public.erp_ensure_financial_year(v_company, p_entry_date);
  if v_fy.status = 'Closed' then raise exception '% is closed', v_fy.name using errcode = '42501'; end if;

  if p_id is not null then
    select * into v_existing from public.journal_entries where id = p_id and company_id = v_company;
    if v_existing.id is null then raise exception 'Voucher not found'; end if;
    if v_existing.is_system then
      raise exception 'Automatic entries are corrected in their source module (%), not here', v_existing.source_type
        using errcode = '42501';
    end if;
    if (public.erp_ensure_financial_year(v_company, v_existing.entry_date)).status = 'Closed' then
      raise exception 'The voucher belongs to a closed financial year' using errcode = '42501';
    end if;
  end if;

  if p_id is null then
    insert into public.journal_entries (company_id, entry_no, entry_date, voucher_type, narration, reference, created_by)
    values (v_company, public.erp_next_entry_no(v_company, p_voucher_type), p_entry_date, p_voucher_type,
            nullif(btrim(p_narration), ''), nullif(btrim(p_reference), ''), me.full_name)
    returning id, entry_no into v_id, v_no;
  else
    update public.journal_entries
    set entry_date = p_entry_date, voucher_type = p_voucher_type,
        narration = nullif(btrim(p_narration), ''), reference = nullif(btrim(p_reference), '')
    where id = p_id returning id, entry_no into v_id, v_no;
    delete from public.journal_entry_lines where journal_entry_id = v_id;
  end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_debit := round(coalesce(nullif(l ->> 'debit', '')::numeric, 0), 2);
    v_credit := round(coalesce(nullif(l ->> 'credit', '')::numeric, 0), 2);
    if v_debit < 0 or v_credit < 0 or (v_debit > 0 and v_credit > 0) or (v_debit = 0 and v_credit = 0) then
      raise exception 'Each line needs either a debit or a credit amount';
    end if;
    select * into v_acc from public.chart_of_accounts
    where id = nullif(l ->> 'account_id', '')::uuid and company_id = v_company;
    if v_acc.id is null then raise exception 'Unknown account on line %', n + 1; end if;
    if v_acc.is_group then raise exception '"%" is a group; post to an account under it', v_acc.name; end if;
    if v_acc.status <> 'Active' then raise exception '"%" is inactive', v_acc.name; end if;
    n := n + 1;
    insert into public.journal_entry_lines (company_id, journal_entry_id, account_id, party_name, debit, credit, line_no)
    values (v_company, v_id, v_acc.id, nullif(btrim(l ->> 'party'), ''), v_debit, v_credit, n);
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  end loop;

  if v_total_debit <> v_total_credit then
    raise exception 'Debits (%) and credits (%) must be equal', v_total_debit, v_total_credit using errcode = '23514';
  end if;
  return jsonb_build_object('id', v_id, 'entry_no', v_no);
end;
$$;

create or replace function public.erp_delete_journal(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  e public.journal_entries;
begin
  select * into e from public.journal_entries where id = p_id and company_id = v_company;
  if e.id is null then raise exception 'Voucher not found'; end if;
  if e.is_system then
    raise exception 'Automatic entries are removed in their source module' using errcode = '42501';
  end if;
  if (public.erp_ensure_financial_year(v_company, e.entry_date)).status = 'Closed' then
    raise exception 'The voucher belongs to a closed financial year' using errcode = '42501';
  end if;
  delete from public.journal_entries where id = p_id;
end;
$$;

-- Admins: add (p_id null) or edit an account. Type and classification come from the parent.
create or replace function public.erp_save_account(
  p_id uuid, p_parent_id uuid, p_code text, p_name text, p_is_group boolean, p_status text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  v_parent public.chart_of_accounts;
  v_existing public.chart_of_accounts;
  saved public.chart_of_accounts;
begin
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then
    raise exception 'Only administrators can change the chart of accounts' using errcode = '42501';
  end if;
  if coalesce(btrim(p_code), '') = '' or coalesce(btrim(p_name), '') = '' then
    raise exception 'Account code and name are required';
  end if;
  if coalesce(p_status, 'Active') not in ('Active', 'Inactive') then raise exception 'Invalid status'; end if;

  if p_id is null then
    select * into v_parent from public.chart_of_accounts where id = p_parent_id and company_id = v_company;
    if v_parent.id is null or not v_parent.is_group then
      raise exception 'Choose a parent group for the new account';
    end if;
    begin
      insert into public.chart_of_accounts (company_id, code, name, parent_id, account_type, is_group, sort_order, status)
      values (v_company, btrim(p_code), btrim(p_name), v_parent.id, v_parent.account_type, coalesce(p_is_group, false),
              v_parent.sort_order, coalesce(p_status, 'Active'))
      returning * into saved;
    exception when unique_violation then
      raise exception 'Account code % is already used', btrim(p_code);
    end;
  else
    select * into v_existing from public.chart_of_accounts where id = p_id and company_id = v_company;
    if v_existing.id is null then raise exception 'Account not found'; end if;
    if coalesce(p_is_group, false) <> v_existing.is_group and (
         exists (select 1 from public.journal_entry_lines where account_id = p_id)
         or exists (select 1 from public.chart_of_accounts where parent_id = p_id)) then
      raise exception 'An account with postings or sub-accounts cannot change between group and ledger';
    end if;
    if v_existing.system_key is not null and coalesce(p_status, 'Active') <> 'Active' then
      raise exception 'System account "%" is used by automatic postings and must stay active', v_existing.name;
    end if;
    begin
      update public.chart_of_accounts
      set code = btrim(p_code), name = btrim(p_name), is_group = coalesce(p_is_group, false), status = coalesce(p_status, 'Active')
      where id = p_id returning * into saved;
    exception when unique_violation then
      raise exception 'Account code % is already used', btrim(p_code);
    end;
  end if;
  return to_jsonb(saved);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 9. Privileges: reports/vouchers for signed-in users; posting internals for nobody
-- -------------------------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'erp_check_journal_balanced', 'erp_seed_chart_of_accounts', 'erp_seed_company_accounts',
      'erp_ensure_financial_year', 'erp_account_id', 'erp_next_entry_no', 'erp_post_system_journal',
      'erp_post_invoice', 'erp_post_goods_receipt', 'erp_post_stock_issue',
      'erp_account_movements', 'erp_net_profit', 'erp_account_tree', 'erp_journal_json')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'erp_report_company', 'erp_financial_years', 'erp_balance_sheet', 'erp_profit_and_loss',
      'erp_trial_balance', 'erp_account_ledger', 'erp_save_journal', 'erp_delete_journal', 'erp_save_account',
      'erp_chart_of_accounts', 'erp_journal_entries', 'erp_journal_entry')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 10. Go-live: chart of accounts for every company, post existing invoices / goods
--     receipts, and bring existing stock in as an opening entry.
-- -------------------------------------------------------------------------------------
do $$
declare
  c record;
  v_raw numeric;
  v_fg numeric;
begin
  for c in select id from public.companies loop
    perform public.erp_seed_chart_of_accounts(c.id);

    select coalesce(sum(round(coalesce(stock_qty, 0)::numeric * coalesce(unit_price, 0)::numeric, 2)), 0) into v_raw
    from public.cnc_raw_materials where company_id = c.id and coalesce(stock_qty, 0) > 0;
    select coalesce(sum(round(coalesce(stock_qty, 0)::numeric * coalesce(unit_price, 0)::numeric, 2)), 0) into v_fg
    from public.cnc_parts where company_id = c.id and coalesce(stock_qty, 0) > 0;

    perform public.erp_post_system_journal(c.id, 'opening_stock', c.id::text, public.erp_today(), 'Opening',
      'Opening stock at accounting go-live (stock qty × unit price)', null,
      case when v_raw + v_fg > 0 then jsonb_build_array(
        jsonb_build_object('key', 'INV_RAW', 'debit', v_raw),
        jsonb_build_object('key', 'INV_FG', 'debit', v_fg),
        jsonb_build_object('key', 'OPENING_EQUITY', 'credit', v_raw + v_fg)) end);
  end loop;
end;
$$;

-- Re-save existing source rows so their triggers post them (values are unchanged).
update public.cnc_invoices set status = status;
update public.cnc_goods_receipts set status = status where status = 'Posted';

select
  (select count(*) from public.chart_of_accounts) as accounts,
  (select count(*) from public.journal_entries) as journal_entries,
  (select count(*) from public.journal_entry_lines) as journal_lines,
  (select count(*) from public.financial_years) as financial_years;

commit;
