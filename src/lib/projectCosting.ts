// Project Costing: the machine-cost and planned-cost rules, kept free of React so they can be tested.

/** Minutes between two timestamps (a run still open counts up to `now`); null when it cannot be worked out. */
export function spanMinutes(start: unknown, end: unknown, now: number = Date.now()): number | null {
  const st = start ? new Date(String(start)).getTime() : NaN;
  const en = end ? new Date(String(end)).getTime() : now;
  return Number.isFinite(st) && Number.isFinite(en) && en > st ? Math.round((en - st) / 60000) : null;
}

export interface ProcessRate {
  id?: string | null;
  process_code?: string | null;
  process_name?: string | null;
  cost_per_hour?: number | string | null;
  hourly_rate?: number | string | null;
  cost_per_component?: number | string | null;
  setup_cost?: number | string | null;
  minimum_charge?: number | string | null;
  machine_type?: string | null;
}

export interface ValuedOperation {
  [k: string]: unknown;
  hours: number;
  rate: number;
  compSetup: number;
  cost: number;
  matched: boolean;
}

export function matchProcessRate(procRates: ProcessRate[] | null | undefined, nameOrCode: unknown, machine?: unknown): ProcessRate | null {
  if (!nameOrCode && !machine) return null;
  const n = (s: unknown) => String(s ?? '').toLowerCase().trim().replace(/[-_/]/g, ' ').replace(/\s+/g, ' ');
  const target = n(nameOrCode);
  const targetMach = n(machine);
  const list = procRates ?? [];

  // 1. Exact match on process_code
  if (target) {
    const f = list.find((p) => n(p.process_code) === target);
    if (f) return f;
  }
  // 2. Exact match on process_name
  if (target) {
    const f = list.find((p) => n(p.process_name) === target);
    if (f) return f;
  }
  // 3. Substring / inclusion match on process_name
  if (target) {
    const f = list.find((p) => {
      const pn = n(p.process_name);
      return pn && (pn.includes(target) || target.includes(pn));
    });
    if (f) return f;
  }
  // 4. Exact match on machine_type
  if (targetMach) {
    const f = list.find((p: any) => {
      const mt = n(p.machine_type);
      return mt && (mt === targetMach || mt.includes(targetMach) || targetMach.includes(mt));
    });
    if (f) return f;
  }
  // 5. Machine in process_name or vice versa
  if (targetMach) {
    const f = list.find((p: any) => {
      const pn = n(p.process_name);
      return pn && (pn.includes(targetMach) || targetMach.includes(pn));
    });
    if (f) return f;
  }
  // 6. Target in machine_type
  if (target) {
    const f = list.find((p: any) => {
      const mt = n(p.machine_type);
      return mt && (mt === target || mt.includes(target) || target.includes(mt));
    });
    if (f) return f;
  }

  return null;
}

/**
 * Machine cost of the in-house operations (job cards run in Scheduling / Production):
 *   hours = the logged minutes of the run (actual start to end, HH:mm plan slots, or cycle+setup);
 *   cost  = hours x the process's cost per hour (Process Master) + (qty x cost per component) + setup cost.
 * An operation whose name matches no Process Master process with a cost per hour is shown but not added to the total.
 */
export function valueOperations(ops: Record<string, unknown>[], procRates: ProcessRate[] | null | undefined): ValuedOperation[] {
  return (ops ?? []).map((x) => {
    const p = matchProcessRate(procRates, x.operation, x.machine);
    const qty = Number(x.qty_completed) > 0 ? Number(x.qty_completed) : Number(x.qty_planned) || Number(x.quantity) || 0;

    // 1. Direct hours if already calculated
    let hours = Number(x.hours) > 0 ? Number(x.hours) : (Number(x.machine_hours) > 0 ? Number(x.machine_hours) : 0);

    // 2. If hours not set, check actual_minutes
    const logged = Number(x.actual_minutes) || 0;
    if (hours <= 0 && logged > 0) {
      hours = logged / 60;
    }

    // 3. Check start_time and end_time ('HH:mm')
    if (hours <= 0 && x.start_time && x.end_time) {
      const [sh, sm] = String(x.start_time).split(':').map(Number);
      const [eh, em] = String(x.end_time).split(':').map(Number);
      const diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
      if (diff > 0) hours = diff / 60;
    }

    // 4. Check real timestamps actual_start to actual_end / completed_at / actual_finish
    if (hours <= 0) {
      const st = x.actual_start ? new Date(String(x.actual_start)).getTime() : NaN;
      const en = (x.actual_end || x.completed_at || x.actual_finish)
        ? new Date(String(x.actual_end || x.completed_at || x.actual_finish)).getTime()
        : NaN;

      if (Number.isFinite(st) && Number.isFinite(en) && en > st + 30000) {
        hours = (en - st) / 3600000;
      } else if (Number.isFinite(st) && ['Running', 'In Progress'].includes(String(x.status))) {
        hours = Math.max(0, (Date.now() - st) / 3600000);
      } else if (Number.isFinite(en)) {
        const cr = x.created_at ? new Date(String(x.created_at)).getTime() : NaN;
        if (Number.isFinite(cr) && en > cr + 60000 && (en - cr) < 72 * 3600000) {
          hours = (en - cr) / 3600000;
        }
      }
    }

    // 5. Fallback planned hours from cycle / setup
    if (hours <= 0) {
      const cycle = Number(x.cycle_time) || Number(x.est_cycle_time) || 0;
      const setup = Number(x.setup_time) || 0;
      if (cycle > 0 || setup > 0) {
        hours = (setup + (qty > 0 ? qty : 1) * cycle) / 60;
      }
    }

    // 6. If operation is Completed or has completed quantity, it cannot have 0 hours!
    // In CNC machining, a run slot is at least 1 hour (as defaulted in AddRunsModal: 1 hour)
    const isCompleted = ['Completed', 'Dispatched', 'Done'].includes(String(x.status)) || Number(x.qty_completed) > 0;
    if (hours <= 0 && isCompleted) {
      hours = Math.max(1, (qty > 0 ? qty : 1) * 0.5);
    }

    // Rates from Process Master or passed rates
    const rate = Number(p?.cost_per_hour ?? (p as any)?.hourly_rate) || Number(x.rate) || Number(x.machine_rate) || 0;
    const compCost = Number(p?.cost_per_component) || 0;
    const setupCost = Number(p?.setup_cost) || 0;
    const compSetup = (qty > 0 ? qty * compCost : compCost) + setupCost;

    let cost = Math.round((hours * rate + compSetup) * 100) / 100;
    if (cost <= 0 && Number(p?.minimum_charge) > 0) {
      cost = Number(p.minimum_charge);
    }

    const matched = (!!p && rate > 0) || Number(x.rate) > 0 || cost > 0;

    return {
      ...x,
      hours: Math.round(hours * 100) / 100,
      rate,
      compSetup,
      cost,
      matched,
    };
  });
}

export const machineCostTotal = (ops: ValuedOperation[]) => ops.reduce((s, x) => s + (x.matched ? x.cost : 0), 0);

/**
 * A key for comparing a product name written differently in different places:
 * "MOUNT BLOCK - 23-10-2026 12:15", "MOUNT BLOCK - CITADEL COMPLETE - 23-10-2026 12:15" and "Mount Block" all give "mount block".
 */
export function quoteNameKey(name: unknown): string {
  let s = String(name ?? '').trim();
  s = s.replace(/\s*[-•·]\s*\d{2}[-/.]\d{2}[-/.]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?/gi, '')
       .replace(/\s*[-•·]\s*\d{2}[A-Za-z]{3}\d{2}[-,]\s*\d{1,2}:?\d{2}(?:\s*[AP]M)?/gi, '')
       .replace(/\s*\(\s*\d+\s+products?\s*\)\s*$/i, '');
  return s.split(/\s+[-•·]\s+/)[0].trim().replace(/\s+/g, ' ').toLowerCase();
}
