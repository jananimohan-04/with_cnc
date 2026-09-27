-- =====================================================================================
-- ARGUS CNC ERP — Costing sheets & final pricing versions
--
-- New table: public.cnc_costing_sheets
-- Each row is one saved version of a quotation/product costing sheet. History is
-- append-only: saving or approving writes a NEW version row, never updates or
-- deletes a previous one, so every approved price stays auditable.
--
-- What is stored per version:
--   * quotation snapshot (number, price, qty, tax, discount) — a snapshot, the
--     cnc_quotations master row itself is never modified by costing.
--   * lines (jsonb): material lines, machine & labour lines, process lines,
--     including manual adjustments explicitly flagged {manual: true}.
--   * calculated_price (system), approved_price (user), adjustment (diff).
--
-- Source masters (cnc_quotations, cnc_bom, cnc_raw_materials, cnc_job_cards,
-- cnc_work_order_operations, cnc_processes) are only READ by the costing UI.
--
-- * Additive only: no existing table, policy or function is modified.
-- * Company isolation via public.erp_secure_table (RLS + company trigger + grants),
--   same as every other business table. The browser never sends company_id.
-- =====================================================================================

begin;

create table if not exists public.cnc_costing_sheets (
  id                  uuid primary key default gen_random_uuid(),
  quotation_id        text,
  quotation_no        text not null default '',
  sales_order_id      text,
  sales_order_no      text,
  product_code        text not null default '',
  product_name        text not null default '',
  quantity            numeric(18, 2) not null default 0 check (quantity >= 0),
  costing_date        date,
  status              text not null default 'Draft'
                      check (status in ('Draft', 'Calculated', 'Approved')),
  version             int not null default 1 check (version >= 1),
  quotation_price     numeric(18, 2) not null default 0 check (quotation_price >= 0),
  calculated_price    numeric(18, 2) not null default 0 check (calculated_price >= 0),
  approved_price      numeric(18, 2) check (approved_price is null or approved_price >= 0),
  adjustment          numeric(18, 2) not null default 0,
  lines               jsonb not null default '{}',
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

select public.erp_secure_table('cnc_costing_sheets');

-- One version chain per quotation + product (per company).
create unique index if not exists cnc_costing_sheets_ver_key
  on public.cnc_costing_sheets (company_id, quotation_no, product_code, version);

-- Fast lookup of a sheet's latest version.
create index if not exists cnc_costing_sheets_quote_idx
  on public.cnc_costing_sheets (quotation_no, product_code, version desc);

commit;
