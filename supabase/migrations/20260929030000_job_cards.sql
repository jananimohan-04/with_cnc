-- =====================================================================================
-- ARGUS CNC ERP — Job Card execution columns (additive only)
--
-- Reuses public.cnc_job_cards (created by earlier flows: release, scheduling,
-- legacy screens). No table is created, renamed or dropped; no data moves.
--
-- New nullable columns:
--   work_order_id / operation_id  stable links (legacy rows keep the
--                                work_order text + op_no convention)
--   sales_order_no / customer / part_no   denormalized references for the
--                                dashboard (no new joins on every render)
--   rework_qty                   rework quantity (good/rejected already exist
--                                as qty_completed / qty_rejected)
--   rejection_type / rejection_reason / rejection_notes
--   actual_start / actual_end / completed_at (execution stamps; planned
--                                values are never overwritten)
--   created_by / updated_by      audit identity from the app session
--
-- Scheduling convention is preserved: the scheduled start keeps living in
-- created_at (duration derives from setup + qty x cycle), so no schedule
-- columns are added here.
-- Duplicate protection for (work_order_id, operation_id) is enforced in the
-- app (an active card blocks reissue); no unique index is added so legacy
-- free-form rows can never break this migration.
-- =====================================================================================

begin;

alter table public.cnc_job_cards
  add column if not exists work_order_id uuid,
  add column if not exists operation_id uuid,
  add column if not exists sales_order_no text,
  add column if not exists customer text,
  add column if not exists part_no text,
  add column if not exists rework_qty numeric(18, 2) not null default 0
    check (rework_qty >= 0),
  add column if not exists rejection_type text,
  add column if not exists rejection_reason text,
  add column if not exists rejection_notes text,
  add column if not exists actual_start timestamptz,
  add column if not exists actual_end timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists created_by text,
  add column if not exists updated_by text;

create index if not exists cnc_jc_wo_idx
  on public.cnc_job_cards (work_order_id);

create index if not exists cnc_jc_op_idx
  on public.cnc_job_cards (operation_id);

-- Trace a production batch back to the executing job card (nullable: batch
-- rows written before this migration simply carry no card reference).
alter table public.cnc_production_batches
  add column if not exists job_card_id uuid,
  add column if not exists job_no text;

create index if not exists cnc_pb_job_idx
  on public.cnc_production_batches (job_card_id);

commit;
