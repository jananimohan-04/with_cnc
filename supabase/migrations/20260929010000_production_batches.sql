-- =====================================================================================
-- ARGUS CNC ERP — Production batches + operation-level rejections
--
-- New table: public.cnc_production_batches
-- Each row is ONE production batch (a partial or full production completion)
-- linked to the same Sales Order / Work Order. It records gross produced,
-- good (accepted), rejected and rework quantities plus the rejection reason,
-- so partial production, batch-wise delivery and invoice eligibility can all
-- reconcile from the same authoritative rows.
--
-- Also adds: public.cnc_work_order_operations.rejected_qty
--
-- * Additive only: no existing table, policy or function is modified.
-- * Company isolation via public.erp_secure_table (RLS + company trigger +
--   grants), same as every other business table. The browser never sends
--   company_id.
-- * No foreign keys to base tables (their remote column types pre-date the
--   repo migrations); references are indexed uuid/text columns.
-- * Frontend treats this table as best-effort: core quantities always flow
--   through cnc_work_orders (completed / rejected), which already exist.
-- =====================================================================================

begin;

create table if not exists public.cnc_production_batches (
  id                  uuid primary key default gen_random_uuid(),
  sales_order_id      text,
  sales_order_no      text,
  work_order_id       uuid,
  wo_no               text,
  product_name        text,
  part_no             text,
  batch_no            text not null,
  gross_qty           numeric(18, 2) not null default 0 check (gross_qty >= 0),
  good_qty            numeric(18, 2) not null default 0 check (good_qty >= 0),
  rejected_qty        numeric(18, 2) not null default 0 check (rejected_qty >= 0),
  rework_qty          numeric(18, 2) not null default 0 check (rework_qty >= 0),
  rejection_type      text,
  rejection_reason    text,
  notes               text,
  operation           text,
  machine             text,
  operator            text,
  idempotency_key     text,
  created_by          text,
  created_at          timestamptz not null default now()
);

select public.erp_secure_table('cnc_production_batches');

-- One retry/submit of the same batch approval must never double-count:
-- NULL keys stay distinct, equal keys collide.
create unique index if not exists cnc_pb_idempotency_key
  on public.cnc_production_batches (idempotency_key);

-- Fast lookup of one sales order's batches (reconciliation) and one work
-- order's batches (traceability).
create index if not exists cnc_pb_so_no_idx
  on public.cnc_production_batches (sales_order_no);
create index if not exists cnc_pb_wo_idx
  on public.cnc_production_batches (work_order_id);

-- Operation-level rejected quantity (machine log / production completion is
-- the source of actual results: planned vs gross vs good vs rejected).
alter table public.cnc_work_order_operations
  add column if not exists rejected_qty numeric(18, 2) not null default 0
    check (rejected_qty >= 0);

commit;
