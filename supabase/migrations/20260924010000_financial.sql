-- =====================================================================================
-- ARGUS CNC ERP — financial layer: GST invoices + bank & cash ledger
--
-- Run AFTER 20260923000000, 20260923010000 and 20260924000000. One transaction.
--
-- * cnc_invoices is THE invoice record (the Sales Pipeline already writes to it, so the
--   Invoices page and the pipeline show the same rows). This migration only ADDS columns
--   and a line-items table; the pipeline's simple insert keeps working.
-- * cnc_bank_transactions is THE bank/cash ledger. A customer receipt, supplier payment,
--   bank transfer or cash entry is one row here; each posts a journal to the accounts:
--     Customer receipt   → Dr Bank/Cash / Cr Trade Receivables (or an income/advance account)
--     Supplier payment   → Dr Trade Payables (or an expense account) / Cr Bank/Cash
--     Bank transfer      → Dr destination bank / Cr source bank (paired by transfer_group)
--   So the Bank & Cash page, the invoice's received/balance, the Ledger and the Balance
--   Sheet all read from one place.
-- * An invoice's Received = Σ receipts allocated to it; Balance = Total − Received; the
--   status shown is derived (Paid / Partially Paid / Overdue / Pending) — Cancelled and
--   Credit Note are stored on the invoice.
-- * Go-live: existing invoices already marked Paid/Completed get a matching receipt so the
--   received figures reconcile, and existing invoices are back-filled with a tax split.
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 1. Company GST settings (state code drives intra- vs inter-state tax split)
-- -------------------------------------------------------------------------------------
alter table public.companies add column if not exists gstin text;
alter table public.companies add column if not exists state_code text;      -- e.g. '33' Tamil Nadu
alter table public.companies add column if not exists default_gst_rate numeric not null default 18;
alter table public.companies add column if not exists invoice_prefix text not null default 'INV';
alter table public.companies add column if not exists bank_details text;     -- printed on the invoice

-- -------------------------------------------------------------------------------------
-- 2. Invoice columns (all optional / defaulted so existing inserts keep working)
-- -------------------------------------------------------------------------------------
alter table public.cnc_invoices add column if not exists invoice_type text not null default 'Sales Invoice'
  check (invoice_type in ('Sales Invoice', 'Proforma Invoice', 'Credit Note'));
alter table public.cnc_invoices add column if not exists customer_id text;
alter table public.cnc_invoices add column if not exists sales_order_id text;
alter table public.cnc_invoices add column if not exists delivery_id text;
alter table public.cnc_invoices add column if not exists quotation_id text;
alter table public.cnc_invoices add column if not exists po_no text;
alter table public.cnc_invoices add column if not exists dc_no text;
alter table public.cnc_invoices add column if not exists customer_gstin text;
alter table public.cnc_invoices add column if not exists billing_address text;
alter table public.cnc_invoices add column if not exists place_of_supply text;      -- state code
alter table public.cnc_invoices add column if not exists basic_value numeric not null default 0;
alter table public.cnc_invoices add column if not exists discount_amount numeric not null default 0;
alter table public.cnc_invoices add column if not exists taxable_value numeric not null default 0;
alter table public.cnc_invoices add column if not exists cgst numeric not null default 0;
alter table public.cnc_invoices add column if not exists sgst numeric not null default 0;
alter table public.cnc_invoices add column if not exists igst numeric not null default 0;
alter table public.cnc_invoices add column if not exists round_off numeric not null default 0;
alter table public.cnc_invoices add column if not exists due_date date;
alter table public.cnc_invoices add column if not exists payment_terms text;
alter table public.cnc_invoices add column if not exists notes text;
alter table public.cnc_invoices add column if not exists cancelled boolean not null default false;
alter table public.cnc_invoices add column if not exists cancelled_reason text;
alter table public.cnc_invoices add column if not exists credit_note_of text;        -- invoice this CN reverses
alter table public.cnc_invoices add column if not exists created_by text;
alter table public.cnc_invoices add column if not exists updated_at timestamptz not null default now();

create index if not exists cnc_invoices_company_date_idx on public.cnc_invoices (company_id, invoice_date);

create table if not exists public.cnc_invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   text not null,
  line_no      int not null default 0,
  description  text not null,
  hsn          text,
  quantity     numeric not null default 0,
  unit         text,
  rate         numeric not null default 0,
  discount_pct numeric not null default 0,
  gst_rate     numeric not null default 0,
  amount       numeric not null default 0,   -- taxable value of the line
  created_at   timestamptz not null default now()
);
select public.erp_secure_table('cnc_invoice_items');
create index if not exists cnc_invoice_items_invoice_idx on public.cnc_invoice_items (invoice_id);
revoke insert, update, delete on public.cnc_invoice_items from authenticated;

-- -------------------------------------------------------------------------------------
-- 3. Bank & cash ledger
-- -------------------------------------------------------------------------------------
create table if not exists public.cnc_bank_transactions (
  id                 uuid primary key default gen_random_uuid(),
  txn_no             text not null,
  txn_date           date not null,
  kind               text not null check (kind in ('Receipt', 'Payment', 'Contra', 'Cash Receipt', 'Cash Payment')),
  direction          text not null check (direction in ('IN', 'OUT')),
  account_id         uuid not null references public.chart_of_accounts (id),   -- the bank/cash account moved
  contra_account_id  uuid references public.chart_of_accounts (id),            -- the other side (transfer / expense / income)
  party_type         text check (party_type in ('Customer', 'Supplier', 'Other')),
  party_name         text,
  customer_id        text,
  supplier_id        text,
  invoice_id         text,            -- customer receipt applied to this invoice
  amount             numeric not null check (amount > 0),
  mode               text,            -- NEFT / RTGS / Cheque / UPI / Cash …
  reference_no       text,
  description        text,
  status             text not null default 'Cleared' check (status in ('Cleared', 'Pending', 'Cancelled')),
  transfer_group     uuid,            -- pairs the two legs of a bank transfer
  source_type        text,
  source_id          text,
  journal_entry_id   uuid references public.journal_entries (id) on delete set null,
  created_by         text,
  created_at         timestamptz not null default now()
);
select public.erp_secure_table('cnc_bank_transactions');
create unique index if not exists cnc_bank_transactions_no_key on public.cnc_bank_transactions (company_id, txn_no);
create index if not exists cnc_bank_transactions_date_idx on public.cnc_bank_transactions (company_id, txn_date);
create index if not exists cnc_bank_transactions_invoice_idx on public.cnc_bank_transactions (company_id, invoice_id);
create index if not exists cnc_bank_transactions_account_idx on public.cnc_bank_transactions (company_id, account_id);
revoke insert, update, delete on public.cnc_bank_transactions from authenticated;

drop trigger if exists zz_erp_same_company_account_id on public.cnc_bank_transactions;
create trigger zz_erp_same_company_account_id before insert or update on public.cnc_bank_transactions
  for each row execute function public.erp_check_same_company('account_id', 'chart_of_accounts');

-- -------------------------------------------------------------------------------------
-- 4. Helpers
-- -------------------------------------------------------------------------------------

-- Received so far against an invoice (customer receipts minus any reversals), excluding
-- cancelled rows. A Credit Note's own total is treated as fully "received" (it is a reversal).
create or replace function public.erp_invoice_received(p_company uuid, p_invoice_id text)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(case when direction = 'IN' then amount else -amount end), 0)
  from public.cnc_bank_transactions
  where company_id = p_company and invoice_id = p_invoice_id and status <> 'Cancelled'
$$;

-- Derived, human-facing status of an invoice.
create or replace function public.erp_invoice_status(p_company uuid, inv public.cnc_invoices)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when inv.cancelled then 'Cancelled'
    when inv.invoice_type = 'Credit Note' then 'Credit Note'
    when inv.invoice_type = 'Proforma Invoice' then 'Proforma'
    when public.erp_invoice_received(p_company, inv.id::text) >= round(coalesce(inv.amount, 0), 2) and coalesce(inv.amount, 0) > 0 then 'Paid'
    when public.erp_invoice_received(p_company, inv.id::text) > 0 then 'Partially Paid'
    when inv.due_date is not null and inv.due_date < public.erp_today(p_company) then 'Overdue'
    else 'Pending'
  end
$$;

create or replace function public.erp_next_number(p_company uuid, p_table regclass, p_col text, p_prefix text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare v_next int;
begin
  perform pg_advisory_xact_lock(hashtext('erp_num_' || p_table::text || p_prefix || p_company::text));
  execute format('select coalesce(max(substring(%I from ''(\d+)$'')::int), 0) + 1 from %s where company_id = $1 and %I like $2',
                 p_col, p_table, p_col)
    into v_next using p_company, p_prefix || '-%';
  return p_prefix || '-' || lpad(v_next::text, 5, '0');
end;
$$;

-- -------------------------------------------------------------------------------------
-- 5. Invoice accounting: post the tax split (replaces the accounting migration's version)
-- -------------------------------------------------------------------------------------
create or replace function public.erp_post_invoice()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric;
  v_taxable numeric;
  v_cgst numeric;
  v_sgst numeric;
  v_igst numeric;
  v_sign int;
  v_date date;
  v_label text;
  v_lines jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.journal_entries
    where company_id = old.company_id and source_type in ('invoice', 'invoice_receipt') and source_id = old.id::text;
    return old;
  end if;

  -- Proforma invoices are quotations in effect: no accounting entry.
  if new.invoice_type = 'Proforma Invoice' or new.cancelled then
    perform public.erp_post_system_journal(new.company_id, 'invoice', new.id::text, public.erp_today(new.company_id), 'Sales', null, null, null);
    return new;
  end if;

  v_total := round(coalesce(new.amount, 0), 2);
  v_taxable := round(coalesce(nullif(new.taxable_value, 0), new.basic_value - new.discount_amount, v_total), 2);
  v_cgst := round(coalesce(new.cgst, 0), 2);
  v_sgst := round(coalesce(new.sgst, 0), 2);
  v_igst := round(coalesce(new.igst, 0), 2);
  if v_taxable + v_cgst + v_sgst + v_igst = 0 then v_taxable := v_total; end if;   -- untaxed / legacy invoice
  -- A Credit Note reverses the sale: same accounts, opposite sign.
  v_sign := case when new.invoice_type = 'Credit Note' then -1 else 1 end;
  v_date := coalesce(new.invoice_date::date, new.created_at::date, public.erp_today(new.company_id));
  v_label := coalesce(new.invoice_type, 'Invoice') || ' ' || coalesce(new.invoice_no, '') || coalesce(' — ' || new.customer_name, '');

  v_lines := jsonb_build_array(
    jsonb_build_object('key', 'TRADE_RECEIVABLES', 'debit', v_sign * v_total, 'party', new.customer_name),
    jsonb_build_object('key', 'SALES', 'credit', v_sign * v_taxable));
  if v_cgst <> 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('key', 'GST_OUTPUT', 'credit', v_sign * v_cgst)); end if;
  if v_sgst <> 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('key', 'GST_OUTPUT', 'credit', v_sign * v_sgst)); end if;
  if v_igst <> 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('key', 'GST_OUTPUT', 'credit', v_sign * v_igst)); end if;

  -- Negative debits/credits are flipped so every line stays non-negative on its correct side.
  perform public.erp_post_system_journal(new.company_id, 'invoice', new.id::text, v_date, 'Sales',
    'Sales: ' || v_label, new.invoice_no, public.erp_normalize_lines(v_lines));
  return new;
end;
$$;

-- Turns signed debit/credit line amounts into non-negative postings on the right side.
create or replace function public.erp_normalize_lines(p_lines jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_agg(
    case
      when coalesce((l ->> 'debit')::numeric, 0) < 0
        then jsonb_build_object('key', l ->> 'key', 'account_id', l ->> 'account_id', 'party', l ->> 'party', 'credit', -(l ->> 'debit')::numeric)
      when coalesce((l ->> 'credit')::numeric, 0) < 0
        then jsonb_build_object('key', l ->> 'key', 'account_id', l ->> 'account_id', 'party', l ->> 'party', 'debit', -(l ->> 'credit')::numeric)
      else l
    end), '[]'::jsonb)
  from jsonb_array_elements(p_lines) l
$$;

-- -------------------------------------------------------------------------------------
-- 6. Bank transaction accounting
-- -------------------------------------------------------------------------------------
create or replace function public.erp_post_bank_txn()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_bank uuid;
  v_other uuid;
  v_amt numeric;
  v_lines jsonb;
  v_label text;
begin
  if tg_op = 'DELETE' then
    delete from public.journal_entries where company_id = old.company_id and source_type = 'bank_txn' and source_id = old.id::text;
    return old;
  end if;

  if new.status = 'Cancelled' then
    perform public.erp_post_system_journal(new.company_id, 'bank_txn', new.id::text, public.erp_today(new.company_id), 'Contra', null, null, null);
    return new;
  end if;

  v_bank := new.account_id;
  v_amt := round(new.amount, 2);
  v_label := new.kind || coalesce(' — ' || new.party_name, '') || coalesce(' (' || new.reference_no || ')', '');

  -- The "other side": explicit contra account, else the receivable/payable implied by the party.
  v_other := new.contra_account_id;
  if v_other is null then
    if new.direction = 'IN' then
      v_other := public.erp_account_id(new.company_id, 'TRADE_RECEIVABLES');
    else
      v_other := public.erp_account_id(new.company_id, 'TRADE_PAYABLES');
    end if;
  end if;

  if new.direction = 'IN' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_bank, 'debit', v_amt),
      jsonb_build_object('account_id', v_other, 'credit', v_amt, 'party', new.party_name));
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_other, 'debit', v_amt, 'party', new.party_name),
      jsonb_build_object('account_id', v_bank, 'credit', v_amt));
  end if;

  perform public.erp_post_system_journal(new.company_id, 'bank_txn', new.id::text,
    coalesce(new.txn_date, public.erp_today(new.company_id)),
    case when new.kind like 'Cash%' then 'Cash' when new.contra_account_id is not null and new.party_type is null then 'Contra'
         when new.direction = 'IN' then 'Receipt' else 'Payment' end,
    v_label, new.reference_no, v_lines);

  update public.cnc_bank_transactions set journal_entry_id = (
    select id from public.journal_entries where company_id = new.company_id and source_type = 'bank_txn' and source_id = new.id::text)
  where id = new.id and journal_entry_id is distinct from (
    select id from public.journal_entries where company_id = new.company_id and source_type = 'bank_txn' and source_id = new.id::text);
  return new;
end;
$$;

-- 'Cash' voucher type is allowed on journal_entries already; make sure 'Contra' etc. exist there.
drop trigger if exists zz_erp_post_bank_txn on public.cnc_bank_transactions;
create trigger zz_erp_post_bank_txn after insert or update or delete on public.cnc_bank_transactions
  for each row execute function public.erp_post_bank_txn();

-- Adjust the accounting voucher_type check to accept 'Cash' (used by cash entries).
do $$
begin
  alter table public.journal_entries drop constraint if exists journal_entries_voucher_type_check;
  alter table public.journal_entries add constraint journal_entries_voucher_type_check
    check (voucher_type in ('Journal', 'Receipt', 'Payment', 'Contra', 'Cash', 'Sales', 'Purchase', 'Stock', 'Opening'));
end;
$$;

-- -------------------------------------------------------------------------------------
-- 7. Read APIs — Invoices
-- -------------------------------------------------------------------------------------
create or replace function public.erp_invoice_json(inv public.cnc_invoices, p_company uuid, p_with_items boolean)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', inv.id::text, 'invoice_no', inv.invoice_no, 'invoice_type', inv.invoice_type, 'invoice_date', inv.invoice_date,
    'due_date', inv.due_date, 'customer_name', inv.customer_name, 'customer_id', inv.customer_id, 'customer_gstin', inv.customer_gstin,
    'billing_address', inv.billing_address, 'place_of_supply', inv.place_of_supply, 'po_no', inv.po_no, 'dc_no', inv.dc_no,
    'sales_order_id', inv.sales_order_id, 'delivery_id', inv.delivery_id, 'part_name', inv.part_name, 'quantity', inv.quantity,
    'basic_value', round(coalesce(inv.basic_value, 0), 2)::text, 'discount_amount', round(coalesce(inv.discount_amount, 0), 2)::text,
    'taxable_value', round(coalesce(nullif(inv.taxable_value, 0), inv.amount), 2)::text,
    'cgst', round(coalesce(inv.cgst, 0), 2)::text, 'sgst', round(coalesce(inv.sgst, 0), 2)::text, 'igst', round(coalesce(inv.igst, 0), 2)::text,
    'round_off', round(coalesce(inv.round_off, 0), 2)::text, 'total', round(coalesce(inv.amount, 0), 2)::text,
    'received', public.erp_invoice_received(p_company, inv.id::text)::text,
    'balance', (round(coalesce(inv.amount, 0), 2) - public.erp_invoice_received(p_company, inv.id::text))::text,
    'status', public.erp_invoice_status(p_company, inv), 'stored_status', inv.status, 'cancelled', inv.cancelled,
    'cancelled_reason', inv.cancelled_reason, 'credit_note_of', inv.credit_note_of, 'payment_terms', inv.payment_terms,
    'notes', inv.notes, 'created_by', inv.created_by, 'created_at', inv.created_at,
    'items', case when p_with_items then (
      select coalesce(jsonb_agg(jsonb_build_object('id', it.id, 'line_no', it.line_no, 'description', it.description,
        'hsn', it.hsn, 'quantity', it.quantity::text, 'unit', it.unit, 'rate', it.rate::text, 'discount_pct', it.discount_pct::text,
        'gst_rate', it.gst_rate::text, 'amount', it.amount::text) order by it.line_no), '[]')
      from public.cnc_invoice_items it where it.invoice_id = inv.id::text and it.company_id = p_company) else null end,
    'receipts', case when p_with_items then (
      select coalesce(jsonb_agg(jsonb_build_object('id', bt.id, 'txn_no', bt.txn_no, 'txn_date', bt.txn_date, 'amount', bt.amount::text,
        'mode', bt.mode, 'reference_no', bt.reference_no, 'direction', bt.direction, 'status', bt.status) order by bt.txn_date), '[]')
      from public.cnc_bank_transactions bt where bt.invoice_id = inv.id::text and bt.company_id = p_company and bt.status <> 'Cancelled') else null end)
$$;

create or replace function public.erp_invoices(p_type text default null, p_status text default null, p_customer text default null,
  p_search text default null, p_from date default null, p_to date default null, p_page int default 1, p_page_size int default 10)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  v_size int := least(greatest(coalesce(p_page_size, 10), 1), 500);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_total int;
  v_rows jsonb;
begin
  with base as (
    select inv, public.erp_invoice_status(v_company, inv) as st
    from public.cnc_invoices inv
    where inv.company_id = v_company
      and (nullif(p_type, '') is null or inv.invoice_type = p_type
           or (p_type = 'Cancelled' and inv.cancelled))
      and (nullif(p_customer, '') is null or inv.customer_id = p_customer or inv.customer_name = p_customer)
      and (p_from is null or inv.invoice_date >= p_from)
      and (p_to is null or inv.invoice_date <= p_to)
      and (v_q is null or inv.invoice_no ilike '%'||v_q||'%' or inv.customer_name ilike '%'||v_q||'%'
           or inv.po_no ilike '%'||v_q||'%' or inv.dc_no ilike '%'||v_q||'%' or inv.part_name ilike '%'||v_q||'%')
  ),
  filtered as (select * from base where nullif(p_status, '') is null or st = p_status)
  select (select count(*) from filtered),
         (select coalesce(jsonb_agg(public.erp_invoice_json((f.inv).*::public.cnc_invoices, v_company, false)
                   order by (f.inv).invoice_date desc nulls last, (f.inv).invoice_no desc), '[]')
          from (select inv from filtered order by (inv).invoice_date desc nulls last limit v_size offset (v_page-1)*v_size) f)
  into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows);
end;
$$;

create or replace function public.erp_invoice(p_id text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  inv public.cnc_invoices;
begin
  select * into inv from public.cnc_invoices where id::text = p_id and company_id = v_company;
  if inv.id is null then raise exception 'Invoice not found' using errcode = '22023'; end if;
  return public.erp_invoice_json(inv, v_company, true);
end;
$$;

create or replace function public.erp_invoices_summary(p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_company uuid := public.erp_report_company();
begin
  return (
    with inv as (
      select i.*, round(coalesce(i.amount,0),2) as total, public.erp_invoice_received(v_company, i.id::text) as rcv,
             public.erp_invoice_status(v_company, i) as st
      from public.cnc_invoices i
      where i.company_id = v_company and not i.cancelled and i.invoice_type <> 'Proforma Invoice'
        and (p_from is null or i.invoice_date >= p_from) and (p_to is null or i.invoice_date <= p_to))
    select jsonb_build_object(
      'total_invoices', count(*),
      'total_value', coalesce(sum(total), 0)::text,
      'total_received', coalesce(sum(rcv), 0)::text,
      'outstanding', coalesce(sum(total - rcv), 0)::text,
      'overdue_count', count(*) filter (where st = 'Overdue'),
      'overdue_amount', coalesce(sum(total - rcv) filter (where st = 'Overdue'), 0)::text,
      'by_status', (select coalesce(jsonb_object_agg(st, c), '{}') from (select st, count(*) c from inv group by st) s),
      'ageing', jsonb_build_object(
        'current', coalesce(sum(total - rcv) filter (where public.erp_today(v_company) - invoice_date <= 30), 0)::text,
        'd31_60', coalesce(sum(total - rcv) filter (where public.erp_today(v_company) - invoice_date between 31 and 60), 0)::text,
        'd61_90', coalesce(sum(total - rcv) filter (where public.erp_today(v_company) - invoice_date between 61 and 90), 0)::text,
        'd90_plus', coalesce(sum(total - rcv) filter (where public.erp_today(v_company) - invoice_date > 90), 0)::text),
      'top_customers', (select coalesce(jsonb_agg(jsonb_build_object('customer', customer_name, 'value', v::text) order by v desc), '[]')
                        from (select customer_name, sum(total) v from inv group by customer_name order by v desc limit 5) t),
      'monthly', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'invoiced', iv::text, 'received', rv::text) order by d), '[]')
                  from (select invoice_date d, sum(total) iv, sum(rcv) rv from inv
                        where invoice_date >= public.erp_today(v_company) - 30 group by invoice_date) m))
    from inv);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 8. Write APIs — Invoices
-- -------------------------------------------------------------------------------------
-- Create / edit an invoice with line items. p_invoice holds the header, p_items the lines.
create or replace function public.erp_save_invoice(p_invoice jsonb, p_items jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  co public.companies;
  v_id text := nullif(p_invoice ->> 'id', '');
  v_existing public.cnc_invoices;
  v_type text := coalesce(nullif(p_invoice ->> 'invoice_type', ''), 'Sales Invoice');
  v_pos text := nullif(p_invoice ->> 'place_of_supply', '');
  v_intra boolean;
  l jsonb;
  n int := 0;
  v_basic numeric := 0; v_disc numeric := 0; v_taxable numeric := 0; v_tax numeric := 0;
  v_line_taxable numeric; v_line_tax numeric; v_rate numeric;
  v_total numeric; v_round numeric; v_no text;
begin
  if me.id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into co from public.companies where id = v_company;
  v_intra := v_pos is null or co.state_code is null or v_pos = co.state_code;   -- same state → CGST+SGST, else IGST

  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one line item'; end if;

  if v_id is not null then
    select * into v_existing from public.cnc_invoices where id::text = v_id and company_id = v_company;
    if v_existing.id is null then raise exception 'Invoice not found'; end if;
    if v_existing.cancelled then raise exception 'A cancelled invoice cannot be edited'; end if;
    if public.erp_invoice_received(v_company, v_id) <> 0 then raise exception 'This invoice already has receipts; edit is blocked. Raise a credit note instead.'; end if;
  end if;

  -- Compute totals from the lines.
  for l in select * from jsonb_array_elements(p_items) loop
    v_rate := coalesce(nullif(l ->> 'gst_rate', '')::numeric, co.default_gst_rate);
    v_line_taxable := round(coalesce((l->>'quantity')::numeric,0) * coalesce((l->>'rate')::numeric,0)
                      * (1 - coalesce(nullif(l->>'discount_pct','')::numeric,0)/100), 2);
    v_line_tax := round(v_line_taxable * v_rate / 100, 2);
    v_basic := v_basic + round(coalesce((l->>'quantity')::numeric,0) * coalesce((l->>'rate')::numeric,0), 2);
    v_taxable := v_taxable + v_line_taxable;
    v_tax := v_tax + v_line_tax;
    n := n + 1;
  end loop;
  v_disc := round(v_basic - v_taxable, 2);
  v_total := v_taxable + v_tax;
  v_round := round(v_total) - v_total;
  v_total := round(v_total);

  v_no := coalesce(nullif(p_invoice ->> 'invoice_no', ''), v_existing.invoice_no,
                   public.erp_next_number(v_company, 'public.cnc_invoices', 'invoice_no',
                     case when v_type = 'Credit Note' then 'CN' when v_type = 'Proforma Invoice' then 'PI' else coalesce(co.invoice_prefix, 'INV') end));

  if v_id is null then
    v_id := public.erp_insert_json('cnc_invoices', jsonb_build_object(
      'company_id', v_company, 'invoice_no', v_no, 'invoice_type', v_type,
      'invoice_date', coalesce(nullif(p_invoice->>'invoice_date','')::date, public.erp_today(v_company)),
      'due_date', nullif(p_invoice->>'due_date','')::date, 'customer_name', p_invoice->>'customer_name',
      'customer_id', nullif(p_invoice->>'customer_id',''), 'customer_gstin', p_invoice->>'customer_gstin',
      'billing_address', p_invoice->>'billing_address', 'place_of_supply', v_pos, 'po_no', p_invoice->>'po_no',
      'dc_no', p_invoice->>'dc_no', 'sales_order_id', nullif(p_invoice->>'sales_order_id',''),
      'delivery_id', nullif(p_invoice->>'delivery_id',''), 'part_name', p_invoice->>'part_name',
      'quantity', coalesce(nullif(p_invoice->>'quantity','')::numeric, 0),
      'basic_value', v_basic, 'discount_amount', v_disc, 'taxable_value', v_taxable,
      'cgst', case when v_intra then round(v_tax/2,2) else 0 end, 'sgst', case when v_intra then v_tax - round(v_tax/2,2) else 0 end,
      'igst', case when v_intra then 0 else v_tax end, 'round_off', v_round, 'amount', v_total,
      'status', 'Sent', 'payment_terms', p_invoice->>'payment_terms', 'notes', p_invoice->>'notes',
      'credit_note_of', nullif(p_invoice->>'credit_note_of',''), 'created_by', me.full_name)) ->> 'id';
  else
    perform public.erp_update_json('cnc_invoices', v_id, v_company, jsonb_build_object(
      'invoice_no', v_no, 'invoice_type', v_type,
      'invoice_date', coalesce(nullif(p_invoice->>'invoice_date','')::date, v_existing.invoice_date),
      'due_date', nullif(p_invoice->>'due_date','')::date, 'customer_name', p_invoice->>'customer_name',
      'customer_id', nullif(p_invoice->>'customer_id',''), 'customer_gstin', p_invoice->>'customer_gstin',
      'billing_address', p_invoice->>'billing_address', 'place_of_supply', v_pos, 'po_no', p_invoice->>'po_no',
      'dc_no', p_invoice->>'dc_no', 'part_name', p_invoice->>'part_name',
      'quantity', coalesce(nullif(p_invoice->>'quantity','')::numeric, 0),
      'basic_value', v_basic, 'discount_amount', v_disc, 'taxable_value', v_taxable,
      'cgst', case when v_intra then round(v_tax/2,2) else 0 end, 'sgst', case when v_intra then v_tax - round(v_tax/2,2) else 0 end,
      'igst', case when v_intra then 0 else v_tax end, 'round_off', v_round, 'amount', v_total,
      'payment_terms', p_invoice->>'payment_terms', 'notes', p_invoice->>'notes', 'updated_at', now()));
    delete from public.cnc_invoice_items where invoice_id = v_id and company_id = v_company;
  end if;

  n := 0;
  for l in select * from jsonb_array_elements(p_items) loop
    n := n + 1;
    v_rate := coalesce(nullif(l ->> 'gst_rate', '')::numeric, co.default_gst_rate);
    perform public.erp_insert_json('cnc_invoice_items', jsonb_build_object(
      'company_id', v_company, 'invoice_id', v_id, 'line_no', n, 'description', coalesce(l->>'description',''),
      'hsn', l->>'hsn', 'quantity', coalesce((l->>'quantity')::numeric,0), 'unit', l->>'unit',
      'rate', coalesce((l->>'rate')::numeric,0), 'discount_pct', coalesce(nullif(l->>'discount_pct','')::numeric,0),
      'gst_rate', v_rate, 'amount', round(coalesce((l->>'quantity')::numeric,0) * coalesce((l->>'rate')::numeric,0)
                    * (1 - coalesce(nullif(l->>'discount_pct','')::numeric,0)/100), 2)));
  end loop;

  return jsonb_build_object('id', v_id, 'invoice_no', v_no);
end;
$$;

create or replace function public.erp_cancel_invoice(p_id text, p_reason text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  inv public.cnc_invoices;
begin
  select * into inv from public.cnc_invoices where id::text = p_id and company_id = v_company;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if public.erp_invoice_received(v_company, p_id) <> 0 then
    raise exception 'This invoice has receipts. Reverse the receipts or raise a credit note instead of cancelling.';
  end if;
  perform public.erp_update_json('cnc_invoices', p_id, v_company,
    jsonb_build_object('cancelled', true, 'status', 'Cancelled', 'cancelled_reason', nullif(btrim(p_reason), ''), 'updated_at', now()));
end;
$$;

-- Credit note against an invoice: copies its lines with negated intent (a real reversing document).
create or replace function public.erp_credit_note(p_invoice_id text, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  inv public.cnc_invoices;
  v_items jsonb;
begin
  select * into inv from public.cnc_invoices where id::text = p_invoice_id and company_id = v_company;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if inv.invoice_type = 'Credit Note' then raise exception 'Cannot raise a credit note against a credit note'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('description', description, 'hsn', hsn, 'quantity', quantity,
           'unit', unit, 'rate', rate, 'discount_pct', discount_pct, 'gst_rate', gst_rate) order by line_no), '[]')
  into v_items from public.cnc_invoice_items where invoice_id = p_invoice_id and company_id = v_company;
  if v_items = '[]'::jsonb then
    v_items := jsonb_build_array(jsonb_build_object('description', coalesce(inv.part_name, 'Credit note'),
      'quantity', coalesce(inv.quantity, 1), 'rate', round(coalesce(inv.taxable_value, inv.amount, 0) / greatest(coalesce(inv.quantity,1),1), 2),
      'gst_rate', case when coalesce(inv.amount,0) > coalesce(inv.taxable_value, inv.amount, 0)
                       then round((coalesce(inv.amount,0) - coalesce(nullif(inv.taxable_value,0), inv.amount)) * 100
                            / nullif(coalesce(nullif(inv.taxable_value,0), inv.amount), 0), 0) else 0 end));
  end if;

  return public.erp_save_invoice(jsonb_build_object('invoice_type', 'Credit Note', 'customer_name', inv.customer_name,
    'customer_id', inv.customer_id, 'customer_gstin', inv.customer_gstin, 'billing_address', inv.billing_address,
    'place_of_supply', inv.place_of_supply, 'po_no', inv.po_no, 'part_name', inv.part_name, 'credit_note_of', inv.id::text,
    'notes', 'Credit note against ' || inv.invoice_no || coalesce(' — ' || nullif(btrim(p_reason), ''), '')), v_items);
end;
$$;

-- -------------------------------------------------------------------------------------
-- 9. Bank & cash API
-- -------------------------------------------------------------------------------------
create or replace function public.erp_bank_accounts_json(p_company uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'system_key', a.system_key,
    'type', case when a.system_key = 'CASH' or a.name ilike '%cash%' then 'Cash' else 'Bank' end,
    'balance', coalesce((select sum(l.debit - l.credit) from public.journal_entry_lines l
                         join public.journal_entries e on e.id = l.journal_entry_id
                         where l.account_id = a.id and e.company_id = p_company and e.entry_date <= public.erp_today(p_company)), 0)::text)
    order by a.sort_order, a.code), '[]')
  from public.chart_of_accounts a
  where a.company_id = p_company and not a.is_group and a.status = 'Active'
    and (a.system_key in ('CASH', 'BANK_DEFAULT') or a.parent_id in (
      select id from public.chart_of_accounts where company_id = p_company and system_key = 'BANK_GROUP')
      or a.name ilike '%bank%' or a.name ilike '%cash%')
$$;

create or replace function public.erp_bank_filters()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_company uuid := public.erp_report_company(); me public.company_users := public.erp_current_user();
begin
  return jsonb_build_object(
    'company', (select jsonb_build_object('id', c.id, 'company_name', c.company_name) from public.companies c where c.id = v_company),
    'accounts', public.erp_bank_accounts_json(v_company),
    'expense_accounts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name) order by sort_order, code), '[]')
                         from public.chart_of_accounts where company_id = v_company and account_type = 'EXPENSE' and not is_group and status = 'Active'),
    'income_accounts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name) order by sort_order, code), '[]')
                        from public.chart_of_accounts where company_id = v_company and account_type = 'INCOME' and not is_group and status = 'Active'),
    'customers', (select coalesce(jsonb_agg(jsonb_build_object('id', id::text, 'name', name) order by name), '[]')
                  from public.cnc_customers where company_id = v_company),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', id::text, 'name', name) order by name), '[]')
                  from public.cnc_suppliers where company_id = v_company),
    'can_manage', me.role in ('SUPER_ADMIN', 'COMPANY_ADMIN'));
end;
$$;

create or replace function public.erp_bank_transactions(p_kind text default null, p_account_id text default null,
  p_type text default null, p_party text default null, p_search text default null,
  p_from date default null, p_to date default null, p_page int default 1, p_page_size int default 10)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company uuid := public.erp_report_company();
  v_size int := least(greatest(coalesce(p_page_size, 10), 1), 500);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_total int; v_rows jsonb;
begin
  with f as (
    select bt.id, bt.txn_no, bt.txn_date, bt.kind, bt.direction, bt.account_id,
           bt.contra_account_id, bt.party_type, bt.party_name, bt.customer_id, bt.supplier_id,
           bt.invoice_id, bt.amount, bt.mode, bt.reference_no, bt.description, bt.status,
           bt.transfer_group, bt.source_type, bt.source_id, bt.journal_entry_id,
           bt.created_by, bt.created_at, a.name as account_name
    from public.cnc_bank_transactions bt
    join public.chart_of_accounts a on a.id = bt.account_id
    where bt.company_id = v_company
      and (nullif(p_account_id,'') is null or bt.account_id::text = p_account_id)
      and (nullif(p_type,'') is null or bt.direction = p_type
           or (p_type = 'Transfer' and bt.transfer_group is not null)
           or (p_type = 'Cash' and bt.kind like 'Cash%'))
      and (nullif(p_kind,'') is null
           or (p_kind = 'Receipts' and bt.direction = 'IN' and bt.transfer_group is null)
           or (p_kind = 'Payments' and bt.direction = 'OUT' and bt.transfer_group is null)
           or (p_kind = 'Bank Transfer' and bt.transfer_group is not null)
           or (p_kind = 'Cash Entries' and bt.kind like 'Cash%'))
      and (nullif(p_party,'') is null or bt.customer_id = p_party or bt.supplier_id = p_party or bt.party_name = p_party)
      and (p_from is null or bt.txn_date >= p_from) and (p_to is null or bt.txn_date <= p_to)
      and (v_q is null or bt.reference_no ilike '%'||v_q||'%' or bt.description ilike '%'||v_q||'%'
           or bt.party_name ilike '%'||v_q||'%' or a.name ilike '%'||v_q||'%')
  )
  select (select count(*) from f),
         (select coalesce(jsonb_agg(jsonb_build_object(
            'id', id::text, 'txn_no', txn_no, 'txn_date', txn_date, 'kind', kind, 'direction', direction,
            'account_id', account_id::text, 'account_name', account_name, 'party_type', party_type, 'party_name', party_name,
            'customer_id', customer_id, 'supplier_id', supplier_id, 'invoice_id', invoice_id,
            'receipt', case when direction = 'IN' then amount::text else null end,
            'payment', case when direction = 'OUT' then amount::text else null end,
            'amount', amount::text, 'mode', mode, 'reference_no', reference_no, 'description', description,
            'status', status, 'transfer_group', transfer_group, 'created_by', created_by) order by txn_date desc, created_at desc), '[]')
          from (select id, txn_no, txn_date, kind, direction, account_id, party_type, party_name,
                       customer_id, supplier_id, invoice_id, amount, mode, reference_no, description,
                       status, transfer_group, created_by, created_at, account_name
                from f order by txn_date desc, created_at desc limit v_size offset (v_page-1)*v_size) p)
  into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows);
end;
$$;

create or replace function public.erp_bank_summary(p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_company uuid := public.erp_report_company(); v_accounts jsonb := public.erp_bank_accounts_json(v_company);
begin
  return jsonb_build_object(
    'accounts', v_accounts,
    'total_bank', (select coalesce(sum((a->>'balance')::numeric),0)::text from jsonb_array_elements(v_accounts) a where a->>'type'='Bank'),
    'total_cash', (select coalesce(sum((a->>'balance')::numeric),0)::text from jsonb_array_elements(v_accounts) a where a->>'type'='Cash'),
    'total_receipts', (select coalesce(sum(amount),0)::text from public.cnc_bank_transactions
                       where company_id=v_company and direction='IN' and transfer_group is null and status<>'Cancelled'
                         and (p_from is null or txn_date>=p_from) and (p_to is null or txn_date<=p_to)),
    'total_payments', (select coalesce(sum(amount),0)::text from public.cnc_bank_transactions
                       where company_id=v_company and direction='OUT' and transfer_group is null and status<>'Cancelled'
                         and (p_from is null or txn_date>=p_from) and (p_to is null or txn_date<=p_to)),
    'pending_clearing', (select coalesce(sum(amount),0)::text from public.cnc_bank_transactions
                         where company_id=v_company and status='Pending'),
    'pending_count', (select count(*) from public.cnc_bank_transactions where company_id=v_company and status='Pending'),
    'receipts_vs_payments', (select coalesce(jsonb_agg(jsonb_build_object('week', wk, 'receipts', rc::text, 'payments', pm::text) order by wk), '[]')
      from (select date_trunc('week', txn_date)::date wk,
              sum(amount) filter (where direction='IN') rc, sum(amount) filter (where direction='OUT') pm
            from public.cnc_bank_transactions where company_id=v_company and transfer_group is null and status<>'Cancelled'
              and txn_date >= public.erp_today(v_company) - 35 group by 1) w),
    'expense_by_category', (select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'value', v::text) order by v desc), '[]')
      from (select coalesce(a.name, 'Uncategorised') nm, sum(l.debit) v
            from public.cnc_bank_transactions bt
            join public.journal_entries e on e.id = bt.journal_entry_id
            join public.journal_entry_lines l on l.journal_entry_id = e.id
            join public.chart_of_accounts a on a.id = l.account_id and a.account_type = 'EXPENSE'
            where bt.company_id=v_company and bt.direction='OUT' and bt.status<>'Cancelled'
              and (p_from is null or bt.txn_date>=p_from) and (p_to is null or bt.txn_date<=p_to)
            group by a.name having sum(l.debit) > 0) c));
end;
$$;

-- Record a receipt / payment / cash entry. Posts the journal via the trigger.
create or replace function public.erp_add_bank_entry(p_entry jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  v_dir text := p_entry ->> 'direction';
  v_acc uuid := nullif(p_entry->>'account_id','')::uuid;
  v_contra uuid := nullif(p_entry->>'contra_account_id','')::uuid;
  v_amt numeric := round(coalesce((p_entry->>'amount')::numeric, 0), 2);
  v_is_cash boolean;
  v_no text;
  v_id text;
begin
  if me.role not in ('SUPER_ADMIN', 'COMPANY_ADMIN') then raise exception 'Only administrators can record bank/cash entries' using errcode='42501'; end if;
  if v_dir not in ('IN','OUT') then raise exception 'Choose receipt or payment'; end if;
  if v_amt <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if v_acc is null or not exists (select 1 from public.chart_of_accounts where id = v_acc and company_id = v_company and not is_group) then
    raise exception 'Choose a valid bank or cash account';
  end if;
  if nullif(p_entry->>'invoice_id','') is not null and not exists (
       select 1 from public.cnc_invoices where id::text = p_entry->>'invoice_id' and company_id = v_company) then
    raise exception 'Linked invoice not found';
  end if;
  v_is_cash := coalesce((select system_key = 'CASH' or name ilike '%cash%' from public.chart_of_accounts where id = v_acc), false);
  v_no := public.erp_next_number(v_company, 'public.cnc_bank_transactions', 'txn_no', case when v_dir='IN' then 'RV' else 'PV' end);

  v_id := public.erp_insert_json('cnc_bank_transactions', jsonb_build_object(
    'company_id', v_company, 'txn_no', v_no,
    'txn_date', coalesce(nullif(p_entry->>'txn_date','')::date, public.erp_today(v_company)),
    'kind', case when v_is_cash then (case when v_dir='IN' then 'Cash Receipt' else 'Cash Payment' end)
                 else (case when v_dir='IN' then 'Receipt' else 'Payment' end) end,
    'direction', v_dir, 'account_id', v_acc, 'contra_account_id', v_contra,
    'party_type', nullif(p_entry->>'party_type',''), 'party_name', nullif(p_entry->>'party_name',''),
    'customer_id', nullif(p_entry->>'customer_id',''), 'supplier_id', nullif(p_entry->>'supplier_id',''),
    'invoice_id', nullif(p_entry->>'invoice_id',''), 'amount', v_amt, 'mode', nullif(p_entry->>'mode',''),
    'reference_no', nullif(p_entry->>'reference_no',''), 'description', nullif(p_entry->>'description',''),
    'status', coalesce(nullif(p_entry->>'status',''), 'Cleared'), 'source_type', nullif(p_entry->>'source_type',''),
    'source_id', nullif(p_entry->>'source_id',''), 'created_by', me.full_name)) ->> 'id';
  return jsonb_build_object('id', v_id, 'txn_no', v_no);
end;
$$;

-- Bank transfer: two paired legs (out of source, into destination).
create or replace function public.erp_bank_transfer(p_from_account text, p_to_account text, p_amount numeric,
  p_date date, p_mode text, p_reference text, p_description text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me public.company_users := public.erp_current_user();
  v_company uuid := public.erp_report_company();
  v_from uuid := nullif(p_from_account,'')::uuid;
  v_to uuid := nullif(p_to_account,'')::uuid;
  v_amt numeric := round(coalesce(p_amount,0),2);
  v_grp uuid := gen_random_uuid();
  v_date date := coalesce(p_date, public.erp_today(v_company));
  v_no text;
begin
  if me.role not in ('SUPER_ADMIN','COMPANY_ADMIN') then raise exception 'Only administrators can transfer funds' using errcode='42501'; end if;
  if v_from is null or v_to is null or v_from = v_to then raise exception 'Choose two different accounts'; end if;
  if v_amt <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if not exists (select 1 from public.chart_of_accounts where id = v_from and company_id = v_company)
     or not exists (select 1 from public.chart_of_accounts where id = v_to and company_id = v_company) then
    raise exception 'Account not found';
  end if;

  v_no := public.erp_next_number(v_company, 'public.cnc_bank_transactions', 'txn_no', 'CV');
  perform public.erp_insert_json('cnc_bank_transactions', jsonb_build_object(
    'company_id', v_company, 'txn_no', v_no, 'txn_date', v_date, 'kind', 'Contra', 'direction', 'OUT',
    'account_id', v_from, 'contra_account_id', v_to, 'amount', v_amt, 'mode', nullif(p_mode,''),
    'reference_no', nullif(p_reference,''), 'description', coalesce(nullif(p_description,''), 'Transfer to account'),
    'transfer_group', v_grp, 'created_by', me.full_name));
  perform public.erp_insert_json('cnc_bank_transactions', jsonb_build_object(
    'company_id', v_company, 'txn_no', v_no || '-B', 'txn_date', v_date, 'kind', 'Contra', 'direction', 'IN',
    'account_id', v_to, 'contra_account_id', v_from, 'amount', v_amt, 'mode', nullif(p_mode,''),
    'reference_no', nullif(p_reference,''), 'description', coalesce(nullif(p_description,''), 'Transfer from account'),
    'transfer_group', v_grp, 'created_by', me.full_name));
  return jsonb_build_object('txn_no', v_no, 'transfer_group', v_grp);
end;
$$;

create or replace function public.erp_bank_set_status(p_id text, p_status text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare me public.company_users := public.erp_current_user(); v_company uuid := public.erp_report_company();
begin
  if me.role not in ('SUPER_ADMIN','COMPANY_ADMIN') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_status not in ('Cleared','Pending','Cancelled') then raise exception 'Invalid status'; end if;
  if not public.erp_update_json('cnc_bank_transactions', p_id, v_company, jsonb_build_object('status', p_status)) then
    raise exception 'Transaction not found';
  end if;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 10. Go-live: back-fill tax split + reconcile already-paid invoices
-- -------------------------------------------------------------------------------------
do $$
declare co record; inv record; v_tax numeric; v_no text;
begin
  for co in select id, coalesce(default_gst_rate, 18) as rate, state_code from public.companies loop
    -- Split existing totals into taxable + GST at the company's default rate (best effort).
    update public.cnc_invoices i
    set taxable_value = round(coalesce(i.amount,0) / (1 + co.rate/100), 2),
        basic_value   = round(coalesce(i.amount,0) / (1 + co.rate/100), 2),
        cgst = round((coalesce(i.amount,0) - round(coalesce(i.amount,0)/(1+co.rate/100),2))/2, 2),
        sgst = (coalesce(i.amount,0) - round(coalesce(i.amount,0)/(1+co.rate/100),2)) - round((coalesce(i.amount,0) - round(coalesce(i.amount,0)/(1+co.rate/100),2))/2, 2)
    where i.company_id = co.id and coalesce(i.taxable_value,0) = 0 and coalesce(i.amount,0) > 0
      and coalesce(i.invoice_type,'Sales Invoice') <> 'Proforma Invoice' and not coalesce(i.cancelled,false);

    -- A single line item so the preview has something to show.
    insert into public.cnc_invoice_items (company_id, invoice_id, line_no, description, quantity, unit, rate, gst_rate, amount)
    select co.id, i.id::text, 1, coalesce(i.part_name, 'Goods'), coalesce(nullif(i.quantity,0), 1), 'Nos',
           round(coalesce(i.taxable_value, i.amount, 0) / greatest(coalesce(nullif(i.quantity,0),1),1), 2), co.rate,
           coalesce(i.taxable_value, i.amount, 0)
    from public.cnc_invoices i
    where i.company_id = co.id and not exists (select 1 from public.cnc_invoice_items x where x.invoice_id = i.id::text)
      and coalesce(i.amount,0) > 0 and coalesce(i.invoice_type,'Sales Invoice') <> 'Proforma Invoice';

    -- Existing invoices already marked Paid/Completed get a matching cash receipt so they reconcile.
    for inv in select * from public.cnc_invoices
               where company_id = co.id and lower(coalesce(status,'')) in ('paid','completed')
                 and coalesce(amount,0) > 0 and not coalesce(cancelled,false)
                 and coalesce(invoice_type,'Sales Invoice') = 'Sales Invoice' loop
      if public.erp_invoice_received(co.id, inv.id::text) = 0 then
        v_no := public.erp_next_number(co.id, 'public.cnc_bank_transactions', 'txn_no', 'RV');
        perform public.erp_insert_json('cnc_bank_transactions', jsonb_build_object(
          'company_id', co.id, 'txn_no', v_no, 'txn_date', coalesce(inv.invoice_date::date, public.erp_today(co.id)),
          'kind', 'Receipt', 'direction', 'IN',
          'account_id', public.erp_account_id(co.id, 'BANK_DEFAULT'),
          'party_type', 'Customer', 'party_name', inv.customer_name, 'invoice_id', inv.id::text,
          'amount', round(inv.amount,2), 'mode', 'Opening', 'reference_no', inv.invoice_no,
          'description', 'Payment recorded at go-live for ' || inv.invoice_no, 'created_by', 'System'));
      end if;
    end loop;
  end loop;
end;
$$;

-- Re-post every invoice so the tax split reaches the accounts (values unchanged).
update public.cnc_invoices set updated_at = now();

-- -------------------------------------------------------------------------------------
-- 11. Privileges
-- -------------------------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname in (
      'erp_invoice_received','erp_invoice_status','erp_invoice_json','erp_normalize_lines','erp_post_invoice',
      'erp_post_bank_txn','erp_bank_accounts_json','erp_next_number')
  loop execute format('revoke all on function %s from public, anon, authenticated', f); end loop;

  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname in (
      'erp_invoices','erp_invoice','erp_invoices_summary','erp_save_invoice','erp_cancel_invoice','erp_credit_note',
      'erp_bank_filters','erp_bank_transactions','erp_bank_summary','erp_add_bank_entry','erp_bank_transfer','erp_bank_set_status')
  loop execute format('revoke all on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
end;
$$;

select
  (select count(*) from public.cnc_invoices) as invoices,
  (select count(*) from public.cnc_invoice_items) as invoice_items,
  (select count(*) from public.cnc_bank_transactions) as bank_transactions;

commit;
