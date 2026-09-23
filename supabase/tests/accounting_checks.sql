-- =====================================================================================
-- Accounting / Balance Sheet checks for the ARGUS CNC ERP.
--
-- Run in the Supabase SQL editor AFTER both migrations. Everything is ROLLED BACK at the
-- end. A failing check stops with "FAILED Ax: ...". Success ends with the single row
-- "ALL ACCOUNTING CHECKS PASSED".
-- =====================================================================================

begin;

select set_config('request.jwt.claims', '', true);

-- Test-only helper (dropped by the final ROLLBACK): inserts a row using only the columns the
-- test cares about. Any other NOT NULL column without a default gets a harmless value of the
-- right type (a parent row is created for required foreign keys), so the checks work whatever
-- extra required columns the live tables have. Runs with the caller's rights: RLS and the
-- company trigger apply exactly as for the app.
create or replace function public.erp_test_insert(p_table text, p_values jsonb)
returns jsonb
language plpgsql
as $$
declare
  c record;
  v jsonb := p_values;
  v_parent jsonb;
  v_cols text;
  r jsonb;
begin
  for c in
    select col.column_name, col.data_type, col.udt_name,
           fk.ref_table, fk.ref_column
    from information_schema.columns col
    left join lateral (
      select rt.relname::text as ref_table, ra.attname::text as ref_column
      from pg_constraint k
      join pg_class t on t.oid = k.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      join pg_class rt on rt.oid = k.confrelid
      join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
      where k.contype = 'f' and n.nspname = 'public' and t.relname = p_table
        and array_length(k.conkey, 1) = 1 and a.attname = col.column_name
      limit 1
    ) fk on true
    where col.table_schema = 'public' and col.table_name = p_table
      and col.is_nullable = 'NO' and col.column_default is null
      and col.is_generated = 'NEVER' and col.identity_generation is null
      and col.column_name <> 'company_id'   -- set by the company trigger (or given by the test)
  loop
    continue when v ? c.column_name;
    if c.ref_table is not null and c.ref_table <> p_table then
      v_parent := public.erp_test_insert(c.ref_table,
        case when v ? 'company_id' then jsonb_build_object('company_id', v -> 'company_id') else '{}'::jsonb end);
      v := v || jsonb_build_object(c.column_name, v_parent -> c.ref_column);
    else
      v := v || jsonb_build_object(c.column_name, case
        when c.data_type in ('smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision') then to_jsonb(0)
        when c.data_type = 'boolean' then to_jsonb(false)
        when c.data_type = 'date' then to_jsonb(public.erp_today())
        when c.data_type like 'timestamp%' then to_jsonb(now())
        when c.data_type like 'time%' then to_jsonb('00:00'::text)
        when c.data_type = 'uuid' then to_jsonb(gen_random_uuid())
        when c.data_type in ('json', 'jsonb') then '{}'::jsonb
        when c.data_type = 'ARRAY' then '[]'::jsonb
        when c.data_type = 'USER-DEFINED' then to_jsonb((
          select e.enumlabel::text from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = c.udt_name order by e.enumsortorder limit 1))
        when c.column_name like '%id' then to_jsonb(gen_random_uuid()::text)
        else to_jsonb('ERP-TEST'::text) end);
    end if;
  end loop;

  select string_agg(format('%I', k), ', ') into v_cols from jsonb_object_keys(v) k;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I.*)',
                 p_table, v_cols, v_cols, p_table, p_table)
    into r using v;
  return r;
end;
$$;
grant execute on function public.erp_test_insert(text, jsonb) to authenticated;


-- ---------- Fixtures ------------------------------------------------------------------
insert into public.companies (id, company_name, code, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ACC Test Company B', 'ACCTESTB', 'Active');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
       '{}', '{"provider":"google","providers":["google"]}', now(), now()
from (values
  ('a1111111-1111-4111-8111-111111111111', 'acc-super@erp-test.invalid'),
  ('a2222222-2222-4222-8222-222222222222', 'acc-admin-a@erp-test.invalid'),
  ('a5555555-5555-4555-8555-555555555555', 'acc-admin-b@erp-test.invalid')
) as u(id, email);
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'google', now(), now()
from auth.users u where u.email like 'acc-%@erp-test.invalid';

insert into public.company_users (email, full_name, role, status, company_id, auth_user_id)
select v.email, v.name, v.role, 'Active', c.id, v.auth_id::uuid
from (values
  ('acc-super@erp-test.invalid',   'Acc Super',   'SUPER_ADMIN',   null,       'a1111111-1111-4111-8111-111111111111'),
  ('acc-admin-a@erp-test.invalid', 'Acc Admin A', 'COMPANY_ADMIN', 'ARGUS',    'a2222222-2222-4222-8222-222222222222'),
  ('acc-admin-b@erp-test.invalid', 'Acc Admin B', 'COMPANY_ADMIN', 'ACCTESTB', 'a5555555-5555-4555-8555-555555555555')
) as v(email, name, role, company_code, auth_id)
left join public.companies c on c.code = v.company_code;

-- A supplier + purchase-order line for the goods receipt test (Argus).
select public.erp_test_insert('cnc_suppliers', jsonb_build_object('id', 'c0000000-0000-4000-8000-000000000001', 'name', 'ACC Test Steels',
  'company_id', (select id from public.companies where code = 'ARGUS')));
select public.erp_test_insert('cnc_purchase_order_items', jsonb_build_object('id', 'c0000000-0000-4000-8000-000000000002',
  'unit_price', 50, 'tax_amount', 18, 'company_id', (select id from public.companies where code = 'ARGUS')));

-- ---------- A1: go-live ---------------------------------------------------------------
do $$
declare v_argus uuid := (select id from public.companies where code = 'ARGUS');
begin
  if (select count(*) from public.chart_of_accounts where company_id = v_argus) < 40 then
    raise exception 'FAILED A1: Argus chart of accounts was not seeded';
  end if;
  if (select count(*) from public.chart_of_accounts where company_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') < 40 then
    raise exception 'FAILED A1: a new company did not get a chart of accounts';
  end if;
  if (select count(*) from public.journal_entries where company_id = v_argus and source_type = 'invoice')
     <> (select count(*) from public.cnc_invoices where company_id = v_argus and coalesce(amount::numeric, 0) > 0) then
    raise exception 'FAILED A1: existing invoices were not all posted';
  end if;
  if exists (select 1 from public.journal_entries e
             where (select sum(debit) from public.journal_entry_lines where journal_entry_id = e.id)
                <> (select sum(credit) from public.journal_entry_lines where journal_entry_id = e.id)) then
    raise exception 'FAILED A1: an unbalanced journal entry exists';
  end if;
end $$;

-- ---------- A2: transactions post into the ledger (as Argus Company Admin) -----------
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare
  s jsonb := public.erp_get_session();
  fy uuid;
  bs0 jsonb; bs1 jsonb;
  tr0 numeric; tr1 numeric;
  v_inv text; v_grn text;
  err boolean;
  acc_bank uuid; acc_capital uuid; acc_group uuid;
  led jsonb; tb jsonb; pl jsonb;
  rows_ jsonb;
  r jsonb;
begin
  if s ->> 'status' <> 'authorized' then raise exception 'FAILED A2: admin should log in, got %', s; end if;

  select (y ->> 'id')::uuid into fy from jsonb_array_elements(public.erp_financial_years() -> 'years') y where (y ->> 'is_current')::boolean;
  if fy is null then raise exception 'FAILED A2: no current financial year'; end if;

  bs0 := public.erp_balance_sheet(fy, public.erp_today());
  if not (bs0 ->> 'balanced')::boolean then raise exception 'FAILED A2: opening balance sheet does not balance: %', bs0 -> 'totals'; end if;
  select (x ->> 'amount')::numeric into tr0 from jsonb_array_elements(bs0 -> 'rows') x where x ->> 'system_key' = 'TRADE_RECEIVABLES';

  -- Sales invoice → receivable
  v_inv := public.erp_test_insert('cnc_invoices', jsonb_build_object('id', 'f0000000-0000-4000-8000-000000000031', 'invoice_no', 'ACC-INV-1',
    'customer_name', 'ACC Customer', 'amount', 1180, 'invoice_date', public.erp_today(), 'status', 'Sent')) ->> 'id';
  bs1 := public.erp_balance_sheet(fy, public.erp_today());
  select (x ->> 'amount')::numeric into tr1 from jsonb_array_elements(bs1 -> 'rows') x where x ->> 'system_key' = 'TRADE_RECEIVABLES';
  if tr1 - tr0 <> 1180 then raise exception 'FAILED A2: invoice did not raise Trade Receivables (% → %)', tr0, tr1; end if;

  -- Paid → receipt into bank, receivable cleared
  update public.cnc_invoices set status = 'Paid' where id::text = v_inv;
  bs1 := public.erp_balance_sheet(fy, public.erp_today());
  select (x ->> 'amount')::numeric into tr1 from jsonb_array_elements(bs1 -> 'rows') x where x ->> 'system_key' = 'TRADE_RECEIVABLES';
  if tr1 <> tr0 then raise exception 'FAILED A2: receipt did not clear the receivable'; end if;

  -- Posted goods receipt → inventory 500 + GST 90 / payable 590
  v_grn := public.erp_test_insert('cnc_goods_receipts', jsonb_build_object('id', 'f0000000-0000-4000-8000-000000000032', 'grn_number', 'ACC-GRN-1',
    'supplier_id', 'c0000000-0000-4000-8000-000000000001', 'receipt_date', public.erp_today(), 'status', 'Draft')) ->> 'id';
  -- The received item must exist in the inventory master (inventory migration), so use a real one.
  perform public.erp_test_insert('cnc_goods_receipt_items', jsonb_build_object(
    'id', 'f0000000-0000-4000-8000-000000000033', 'goods_receipt_id', 'f0000000-0000-4000-8000-000000000032',
    'purchase_order_item_id', 'c0000000-0000-4000-8000-000000000002', 'received_qty', 10,
    'raw_material_id', (select r.id::text from public.cnc_raw_materials r
                          where r.company_id = (select id from public.companies where code = 'ARGUS') limit 1),
    'material_code', (select r.material_code from public.cnc_raw_materials r
                        where r.company_id = (select id from public.companies where code = 'ARGUS') limit 1)));
  if exists (select 1 from public.journal_entries where source_type = 'grn' and source_id = v_grn::text) then
    raise exception 'FAILED A2: a draft goods receipt was posted';
  end if;
  update public.cnc_goods_receipts set status = 'Posted' where id::text = v_grn;
  if (select sum(l.credit) from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id
      join public.chart_of_accounts a on a.id = l.account_id
      where e.source_type = 'grn' and e.source_id = v_grn::text and a.system_key = 'TRADE_PAYABLES') <> 590 then
    raise exception 'FAILED A2: goods receipt did not credit Trade Payables with 590';
  end if;

  -- Stock issue → consumption at unit price (before the inventory migration only: afterwards the
  -- stock ledger is written through erp_issue_material, covered by inventory_checks.sql)
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'cnc_stock_movements' and column_name = 'item_id') then
  perform public.erp_test_insert('cnc_stock_movements', jsonb_build_object('id', 'f0000000-0000-4000-8000-000000000034', 'date', public.erp_today(),
    'type', 'Issue', 'qty', 2, 'reference', 'ACC-MR-1', 'material', coalesce(
      (select material_code from public.cnc_raw_materials where unit_price > 0 limit 1), 'ERP-TEST material')));
  end if;

  -- Manual voucher: capital introduced into bank
  select id into acc_bank from public.chart_of_accounts where system_key = 'BANK_DEFAULT';
  select id into acc_capital from public.chart_of_accounts where system_key = 'CAPITAL';
  select id into acc_group from public.chart_of_accounts where system_key = 'BANK_GROUP';
  perform public.erp_save_journal(null, public.erp_today(), 'Receipt', 'Capital introduced', 'ACC-CAP', jsonb_build_array(
    jsonb_build_object('account_id', acc_bank, 'debit', 10000),
    jsonb_build_object('account_id', acc_capital, 'credit', 10000)));

  err := false;
  begin
    perform public.erp_save_journal(null, public.erp_today(), 'Journal', 'unbalanced', null, jsonb_build_array(
      jsonb_build_object('account_id', acc_bank, 'debit', 100), jsonb_build_object('account_id', acc_capital, 'credit', 90)));
  exception when others then err := true; end;
  if not err then raise exception 'FAILED A2: an unbalanced voucher was accepted'; end if;

  err := false;
  begin
    perform public.erp_save_journal(null, public.erp_today(), 'Journal', 'group', null, jsonb_build_array(
      jsonb_build_object('account_id', acc_group, 'debit', 100), jsonb_build_object('account_id', acc_capital, 'credit', 100)));
  exception when others then err := true; end;
  if not err then raise exception 'FAILED A2: posting to a group account was accepted'; end if;

  err := false;
  begin
    perform public.erp_save_journal((select id from public.journal_entries where source_type = 'grn' and source_id = v_grn::text),
      public.erp_today(), 'Journal', 'edit system', null, jsonb_build_array(
      jsonb_build_object('account_id', acc_bank, 'debit', 1), jsonb_build_object('account_id', acc_capital, 'credit', 1)));
  exception when others then err := true; end;
  if not err then raise exception 'FAILED A2: an automatic entry was edited manually'; end if;

  err := false;
  begin
    insert into public.journal_entries (entry_no, entry_date, voucher_type) values ('HACK-1', public.erp_today(), 'Journal');
  exception when insufficient_privilege then err := true; end;
  if not err then raise exception 'FAILED A2: journal_entries is writable from the browser'; end if;

  err := false;
  begin
    perform public.erp_post_system_journal(gen_random_uuid(), 'x', 'x', public.erp_today(), 'Journal', null, null, '[]'::jsonb);
  exception when insufficient_privilege then err := true; end;
  if not err then raise exception 'FAILED A2: internal posting function is callable from the browser'; end if;

  err := false;
  begin perform public.erp_balance_sheet(fy, public.erp_today() + 800);
  exception when others then err := true; end;
  if not err then raise exception 'FAILED A2: an as-on date outside the financial year was accepted'; end if;

  -- Report consistency
  bs1 := public.erp_balance_sheet(fy, public.erp_today());
  if not (bs1 ->> 'balanced')::boolean then raise exception 'FAILED A2: balance sheet does not balance: %', bs1 -> 'totals'; end if;
  if (bs1 -> 'totals' ->> 'assets')::numeric <> (bs1 -> 'totals' ->> 'liabilities')::numeric + (bs1 -> 'totals' ->> 'equity')::numeric then
    raise exception 'FAILED A2: assets ≠ liabilities + equity';
  end if;
  if (bs1 ->> 'current_ratio') is distinct from
     round((bs1 -> 'totals' ->> 'current_assets')::numeric / nullif((bs1 -> 'totals' ->> 'current_liabilities')::numeric, 0), 2)::text then
    raise exception 'FAILED A2: current ratio is wrong';
  end if;

  -- Groups equal the sum of their children
  rows_ := bs1 -> 'rows';
  for r in select * from jsonb_array_elements(rows_) x where (x ->> 'is_group')::boolean loop
    if exists (select 1 from jsonb_array_elements(rows_) c where c ->> 'parent_id' = r ->> 'id')
       and (r ->> 'amount')::numeric <> (select sum((c ->> 'amount')::numeric) from jsonb_array_elements(rows_) c
                                          where c ->> 'parent_id' = r ->> 'id') then
      raise exception 'FAILED A2: group "%" does not equal the sum of its children', r ->> 'name';
    end if;
  end loop;

  -- Ledger closing = balance sheet amount; trial balance balances; P&L = period profit
  led := public.erp_account_ledger((select id from public.chart_of_accounts where system_key = 'BANK_DEFAULT'),
                                   (select start_date from public.financial_years where id = fy), public.erp_today());
  if (led ->> 'closing')::numeric <> (select (x ->> 'amount')::numeric from jsonb_array_elements(rows_) x where x ->> 'system_key' = 'BANK_DEFAULT') then
    raise exception 'FAILED A2: bank ledger closing % ≠ balance sheet', led ->> 'closing';
  end if;
  tb := public.erp_trial_balance(fy, public.erp_today());
  if (tb -> 'totals' ->> 'debit') <> (tb -> 'totals' ->> 'credit') then
    raise exception 'FAILED A2: trial balance does not balance: %', tb -> 'totals';
  end if;
  pl := public.erp_profit_and_loss((select start_date from public.financial_years where id = fy), public.erp_today());
  if (pl -> 'totals' ->> 'net_profit')::numeric <> (bs1 -> 'totals' ->> 'profit_current_period')::numeric then
    raise exception 'FAILED A2: P&L net profit ≠ balance sheet period profit';
  end if;
end $$;
reset role;

-- ---------- A3: company isolation ----------------------------------------------------
select set_config('request.jwt.claims', '', true);
select set_config('erp_test.argus_bank', (select id::text from public.chart_of_accounts
  where system_key = 'BANK_DEFAULT' and company_id = (select id from public.companies where code = 'ARGUS')), true);
select set_config('request.jwt.claims', '{"sub":"a5555555-5555-4555-8555-555555555555","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare
  fy uuid;
  bs jsonb;
  err boolean;
  v_argus_bank uuid := current_setting('erp_test.argus_bank')::uuid;
begin
  perform public.erp_get_session();
  select (y ->> 'id')::uuid into fy from jsonb_array_elements(public.erp_financial_years() -> 'years') y where (y ->> 'is_current')::boolean;
  bs := public.erp_balance_sheet(fy, public.erp_today());
  if (bs ->> 'has_data')::boolean or (bs -> 'totals' ->> 'assets')::numeric <> 0
     or (bs -> 'totals' ->> 'equity')::numeric <> 0 or (bs -> 'totals' ->> 'profit_current_period')::numeric <> 0
     or (public.erp_profit_and_loss(public.erp_today() - 400, public.erp_today()) -> 'totals' ->> 'net_profit')::numeric <> 0 then
    raise exception 'FAILED A3: Company B sees accounting data it does not own';
  end if;
  if exists (select 1 from public.journal_entries) or exists (select 1 from public.journal_entry_lines) then
    raise exception 'FAILED A3: Company B can read journal entries of another company';
  end if;
  if exists (select 1 from public.chart_of_accounts where company_id <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'FAILED A3: Company B can read another company''s chart of accounts';
  end if;

  err := false;
  begin
    perform public.erp_save_journal(null, public.erp_today(), 'Journal', 'cross-company', null, jsonb_build_array(
      jsonb_build_object('account_id', v_argus_bank, 'debit', 1),
      jsonb_build_object('account_id', (select id from public.chart_of_accounts where system_key = 'CAPITAL'), 'credit', 1)));
  exception when others then err := true; end;
  if not err then raise exception 'FAILED A3: Company B posted to an Argus account'; end if;

  err := false;
  begin perform public.erp_account_ledger(v_argus_bank, public.erp_today() - 30, public.erp_today());
  exception when others then err := true; end;
  if not err then raise exception 'FAILED A3: Company B read an Argus ledger'; end if;
end $$;
reset role;

-- ---------- A4: Super Admin must pick a company --------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth","timestamp":0}]}', true);
set local role authenticated;
do $$
declare err boolean := false;
begin
  perform public.erp_get_session();
  begin perform public.erp_financial_years();
  exception when others then err := true; end;
  if not err then raise exception 'FAILED A4: reports ran for "All companies" (would mix company data)'; end if;
  perform public.erp_set_active_company((select id from public.companies where code = 'ARGUS'));
  if (public.erp_financial_years() -> 'company' ->> 'company_name') <> 'Argus Technology' then
    raise exception 'FAILED A4: Super Admin could not open Argus accounts';
  end if;
end $$;
reset role;

select 'ALL ACCOUNTING CHECKS PASSED' as result;

rollback;
