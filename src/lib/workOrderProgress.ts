// How many pieces of a production order are FINISHED, worked out from its actual runs.
//
// A run records the pieces one process (turning, milling, grinding ...) got through. The same pieces pass through several
// processes, so the runs of different processes must not be added together: 2 pieces turned and the same 2 pieces milled are
// 2 finished pieces, not 4. The finished quantity is therefore the total of the busiest process (with a single process this is
// simply the sum of its runs).
import { supabase } from '@/lib/supabase';

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const processKey = (v: unknown) => String(v ?? '').trim().toLowerCase() || 'machining';

export interface RunLike { operation?: unknown; qty_completed?: unknown }

/** Pieces done per process, from a list of runs. */
export function doneByProcess(runs: RunLike[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of runs) m.set(processKey(r.operation), (m.get(processKey(r.operation)) ?? 0) + num(r.qty_completed));
  return m;
}

/** Finished pieces = the total of the busiest process. */
export function finishedFromRuns(runs: RunLike[]): number {
  let best = 0;
  for (const v of doneByProcess(runs).values()) best = Math.max(best, v);
  return best;
}

/**
 * Brings a production order's finished quantity in line with its runs (after a run was added, changed or deleted).
 * With runs left it is recomputed from them. With none left, what the deleted run(s) had added is taken off (`removed`).
 * An order that never had runs (finished through the Finished Goods form) is not touched.
 */
export async function syncWorkOrderCompleted(wo: { id?: unknown; wo_no?: unknown; completed?: unknown; quantity?: unknown; status?: unknown }, removed = 0): Promise<{ completed: number; status: string } | null> {
  if (!wo?.id || !wo?.wo_no) return null;
  const { data, error } = await supabase.from('cnc_job_cards').select('operation,qty_completed').eq('work_order', String(wo.wo_no));
  if (error) return null;
  const runs = (data ?? []) as RunLike[];
  let completed: number;
  if (runs.length > 0) completed = finishedFromRuns(runs);
  else if (removed > 0) completed = Math.max(0, num(wo.completed) - removed);
  else return null;
  const target = num(wo.quantity);
  const status = target > 0 && completed >= target ? 'Completed' : completed > 0 ? 'In Progress' : String(wo.status ?? 'Planned');
  const up = await supabase.from('cnc_work_orders').update({ completed, status }).eq('id', String(wo.id));
  if (up.error) throw new Error(`The finished quantity could not be updated: ${up.error.message}`);
  return { completed, status };
}

/**
 * Checks the pieces a new run would add. Pieces finished some other way (the Finished Goods form, "mark complete") count as done
 * for every process; the runs of the same process add up; the runs of another process do not.
 * Returns a message when it is too many, otherwise null.
 */
export function runExceeds(opts: {
  ordered: number;
  /** finished pieces of the part's orders that have no runs of their own */
  external: number;
  /** pieces already recorded for this process (saved runs plus the lines above in this save) */
  sameProcess: number;
  qty: number;
}): { left: number } | null {
  const left = Math.max(0, opts.ordered - opts.external - opts.sameProcess);
  return opts.ordered > 0 && opts.qty > left + 1e-9 ? { left } : null;
}
