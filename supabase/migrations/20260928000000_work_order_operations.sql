-- =====================================================================================
-- ARGUS CNC ERP — Production Order Operations (work order routing lines)
--
-- New table: public.cnc_work_order_operations
-- Each row is one manufacturing operation of a Production Order / Work Order,
-- chosen from Process Master (stable process_code reference, never a duplicated
-- name). Consumed later by:
--   * Scheduling  — via work_order_id + operation_sequence (+ auto-created
--                    cnc_job_cards on release, using existing job-card columns)
--   * Machine Log — traceable via work_order_id / operation / process / machine
--   * Finished Goods — eligibility still reads cnc_work_orders quantity/completed
--
-- * Additive only: no existing table, policy or function is modified.
-- * Company isolation via public.erp_secure_table (RLS + company trigger + grants),
--   same as every other business table. The browser never sends company_id.
-- * No foreign keys to base tables (their remote column types pre-date the repo
--   migrations); references are indexed uuid/text columns + denormalized codes.
-- =====================================================================================

begin;

create table if not exists public.cnc_work_order_operations (
  id                  uuid primary key default gen_random_uuid(),
  work_order_id       uuid not null,
  sales_order_id      text,
  sales_order_no      text,
  process_id          uuid,
  process_code        text not null,
  process_name        text,
  operation_sequence  int not null,
  machine             text,
  operator            text,
  planned_qty         numeric(18, 2) not null default 0 check (planned_qty >= 0),
  completed_qty       numeric(18, 2) not null default 0 check (completed_qty >= 0),
  est_cycle_time      numeric(18, 2) not null default 0 check (est_cycle_time >= 0),
  setup_time          numeric(18, 2) not null default 0 check (setup_time >= 0),
  actual_minutes      numeric(18, 2) not null default 0 check (actual_minutes >= 0),
  status              text not null default 'Pending'
                      check (status in ('Pending', 'In Progress', 'Completed', 'On Hold', 'Cancelled')),
  planned_start       timestamptz,
  planned_finish      timestamptz,
  actual_start        timestamptz,
  actual_finish       timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

select public.erp_secure_table('cnc_work_order_operations');

-- Sequence is unique per work order (per company).
create unique index if not exists cnc_woo_company_wo_seq_key
  on public.cnc_work_order_operations (company_id, work_order_id, operation_sequence);

-- Fast lookup of one order's routing in sequence order.
create index if not exists cnc_woo_wo_seq_idx
  on public.cnc_work_order_operations (work_order_id, operation_sequence);

commit;
