// Job Card shared logic: status flow, numbering, eligibility, quantities and
// production-result recording. A job card always originates from an eligible
// Work Order Operation — never as standalone text — and references it via
// work_order_id / operation_id (legacy rows keep work_order + op_no).
//
// Quantities: Planned = qty_planned, Good = qty_completed, Rejected =
// qty_rejected, Rework = rework_qty, Gross = good + rejected (derived),
// Remaining = planned − good (derived). Good and rejected stay separate;
// only good quantity is ever eligible downstream (existing batch logic).

import { supabase } from '@/lib/supabase';
import { isMissingRelation, num, recordProductionBatch } from '@/lib/orderQuantities';

export const JC_STATUSES = [
  'Draft', 'Ready', 'Scheduled', 'In Progress', 'On Hold', 'Completed', 'Cancelled',
] as const;

/** Allowed next statuses. Legacy statuses (Planned/Pending/New/…) enter the
 *  flow through Ready so old and scheduling-created cards stay actionable. */
export const JC_TRANSITIONS: Record<string, string[]> = {
  Draft: ['Ready', 'Cancelled'],
  Ready: ['Scheduled', 'Cancelled'],
  Scheduled: ['In Progress', 'On Hold', 'Cancelled'],
  'In Progress': ['On Hold', 'Completed'],
  'On Hold': ['Scheduled', 'In Progress', 'Cancelled'],
  Completed: [],
  Cancelled: [],
  Planned: ['Ready', 'Scheduled', 'Cancelled'],
  New: ['Ready', 'Cancelled'],
  Pending: ['Ready', 'Cancelled'],
};

export const canTransition = (from: any, to: string): boolean =>
  (JC_TRANSITIONS[String(from ?? '')] ?? []).includes(to);

/** A card blocks reissue for its operation while active. */
export const isActiveCard = (j: any): boolean =>
  !['Cancelled', 'Completed'].includes(String(j?.status ?? ''));

/** Work orders eligible for job-card creation (spec §4). */
export const isEligibleWO = (wo: any): boolean =>
  ['Planned', 'Planning', 'Released', 'In Progress'].includes(String(wo?.status ?? ''));

/** An operation is selectable when it is not finished and has no active card. */
export const isSelectableOp = (op: any, activeCards: any[]): boolean => {
  if (['Completed', 'Cancelled'].includes(String(op?.status ?? ''))) return false;
  return !activeCards.some(
    (j) => String(j.operation_id ?? '') !== '' && String(j.operation_id) === String(op.id),
  );
};

export const grossOf = (j: any): number => num(j?.qty_completed) + num(j?.qty_rejected);
export const remainingOf = (j: any): number => Math.max(0, num(j?.qty_planned) - num(j?.qty_completed));

/** Minutes for setup + qty × cycle (engine convention). */
export const durationMins = (setupMin: any, qty: any, cycleMin: any): number =>
  Math.max(0, num(setupMin) + num(qty) * num(cycleMin));

/** Unique JC number with an existence check (same pattern as WO numbering). */
export async function generateJobNo(): Promise<string> {
  const prefix = `JC-${new Date().getFullYear()}-`;
  for (let i = 0; i < 25; i++) {
    const candidate = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      const { data, error } = await supabase.from('cnc_job_cards').select('id').eq('job_no', candidate).limit(1);
      if (!error && (data ?? []).length === 0) return candidate;
    } catch { /* retry */ }
  }
  return `${prefix}${Date.now().toString().slice(-4)}`;
}

/** Tolerant update: drops keys the cloud schema predates, then applies. */
export async function updateJobTolerant(id: string, patch: Record<string, any>): Promise<void> {
  let remaining: Record<string, any> = { ...patch };
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await supabase.from('cnc_job_cards').update(remaining).eq('id', id);
    if (!error) return;
    if (isMissingRelation(error)) {
      const m = /Could not find the '([A-Za-z0-9_]+)' column/.exec(String((error as any)?.message || ''));
      if (m && Object.prototype.hasOwnProperty.call(remaining, m[1])) {
        delete remaining[m[1]];
        continue;
      }
    }
    throw error;
  }
  throw new Error('Job card update failed after retries.');
}

/** Move a card through the controlled flow, stamping execution/audit fields. */
export async function transitionJob(job: any, to: string, user: string): Promise<void> {
  if (!canTransition(job?.status, to)) {
    throw new Error(`Cannot move a ${String(job?.status ?? 'unknown')} job card to ${to}.`);
  }
  const patch: Record<string, any> = { status: to, updated_by: user || null };
  if (to === 'In Progress' && !job?.actual_start) patch.actual_start = new Date().toISOString();
  if (to === 'Completed') {
    if (!job?.actual_start) patch.actual_start = new Date().toISOString();
    patch.actual_end = new Date().toISOString();
    patch.completed_at = new Date().toISOString();
  }
  await updateJobTolerant(String(job.id), patch);
}

export interface JobResultInput {
  gross: number;
  good: number;
  rejected: number;
  rework: number;
  rejectionType: string;
  rejectionReason: string;
  notes: string;
}

/**
 * Record an INCREMENTAL production result on an In-Progress job card.
 * Writes a traceable production batch (existing mechanism, job-linked) and
 * accumulates the card totals. Rejected quantity never touches work-order
 * completed / FG stock — only good quantity is downstream-eligible.
 */
export async function recordJobResult(
  job: any,
  wo: any | null,
  r: JobResultInput,
  user: string,
): Promise<void> {
  const batchNo = `${String(job.job_no)}-R${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const op = (Array.isArray((job as any)?._op) ? (job as any)._op[0] : null) ?? null;
  await recordProductionBatch({
    salesOrderId: null,
    salesOrderNo: (String(job.sales_order_no ?? wo?.sales_order ?? wo?.order_no ?? '') || null),
    workOrderId: (job.work_order_id ?? wo?.id ?? null) as any,
    woNo: (String(job.work_order ?? wo?.wo_no ?? '') || null),
    productName: (String(job.part_name ?? wo?.part_name ?? '') || null),
    partNo: (String(job.part_no ?? wo?.part_no ?? '') || null),
    batchNo,
    grossQty: r.gross,
    goodQty: r.good,
    rejectedQty: r.rejected,
    reworkQty: r.rework,
    rejectionType: r.rejected > 0 ? r.rejectionType : null,
    rejectionReason: r.rejected > 0 ? r.rejectionReason : null,
    notes: r.notes || null,
    operation: (String(op?.process_name ?? op?.process_code ?? job.operation ?? '') || null),
    machine: (String(job.machine ?? '') || null),
    operator: (String(job.operator ?? '') || null),
    createdBy: user || null,
    idempotencyKey: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `jr-${Date.now()}-${Math.random()}`,
    jobCardId: String(job.id),
    jobNo: String(job.job_no),
  } as any);
  await updateJobTolerant(String(job.id), {
    qty_completed: num(job.qty_completed) + r.good,
    qty_rejected: num(job.qty_rejected) + r.rejected,
    rework_qty: num(job.rework_qty) + r.rework,
    rejection_type: r.rejected > 0 ? r.rejectionType : job.rejection_type ?? null,
    rejection_reason: r.rejected > 0 ? r.rejectionReason : job.rejection_reason ?? null,
    rejection_notes: (r.notes || job.rejection_notes || null),
    updated_by: user || null,
  });
}
