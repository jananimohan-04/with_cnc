// Planned timeline of work-order operations: a date range plus one or more time slots per day, expanded into one
// segment per day and slot. Dates are plain "YYYY-MM-DD" strings and times "HH:mm" (24-hour), never Date objects, so
// time zones cannot move a plan to another day.

export interface PlanSlot { start: string; end: string }
export interface PlanDraft { from: string; to: string; slots: PlanSlot[] }
export interface PlanSegment { date: string; start: string; end: string }

export const MAX_PLAN_DAYS = 92;

export const emptyPlan = (): PlanDraft => ({ from: '', to: '', slots: [{ start: '08:00', end: '12:00' }] });
export const planIsBlank = (p?: PlanDraft | null) => !p || (!p.from && !p.to);

export const toMinutes = (hhmm: string): number => {
  const [h, m] = String(hhmm || '').split(':').map(n => Number(n));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export const fmtTime12 = (hhmm: string): string => {
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60) % 24; const m = mins % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseYmd = (s: string): Date => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (s: string, n: number): string => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (from: string, to: string): number => Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86400000) + 1;

/** null when the plan is usable, else what is wrong with it. */
export function planError(p: PlanDraft): string | null {
  if (!p.from || !p.to) return 'Set the plan From and To dates.';
  if (p.to < p.from) return 'The To date must not be before the From date.';
  if (daysBetween(p.from, p.to) > MAX_PLAN_DAYS) return `A plan can cover at most ${MAX_PLAN_DAYS} days.`;
  if (p.slots.length === 0) return 'Add at least one time slot.';
  for (const s of p.slots) {
    if (!s.start || !s.end) return 'Set the start and end of every time slot.';
    if (toMinutes(s.end) <= toMinutes(s.start)) return 'Each time slot must end after it starts.';
  }
  const sorted = [...p.slots].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) return 'Time slots of the same day must not overlap.';
  }
  return null;
}

/** One segment per day of the range and slot of the plan. */
export function expandPlan(p: PlanDraft): PlanSegment[] {
  if (planError(p)) return [];
  const out: PlanSegment[] = [];
  const n = daysBetween(p.from, p.to);
  for (let i = 0; i < n; i++) {
    const date = addDays(p.from, i);
    for (const s of p.slots) out.push({ date, start: s.start, end: s.end });
  }
  return out;
}

export const segmentHours = (s: { start: string; end: string }) => Math.max(0, toMinutes(s.end) - toMinutes(s.start)) / 60;
export const planHours = (p: PlanDraft) => expandPlan(p).reduce((n, s) => n + segmentHours(s), 0);

const hhmm = (t: unknown) => String(t ?? '').slice(0, 5);

/** Rows from the database back into an editable plan. Returns null when the rows are not one regular plan
 *  (a continuous date range with the same slots every day), so nothing irregular is flattened by accident. */
export function planFromRows(rows: { plan_date: string; start_time: string; end_time: string }[]): PlanDraft | null {
  if (rows.length === 0) return emptyPlan();
  const byDate = new Map<string, PlanSlot[]>();
  for (const r of rows) {
    const d = String(r.plan_date).slice(0, 10);
    byDate.set(d, [...(byDate.get(d) ?? []), { start: hhmm(r.start_time), end: hhmm(r.end_time) }]);
  }
  const dates = [...byDate.keys()].sort();
  const key = (slots: PlanSlot[]) => [...slots].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)).map(s => `${s.start}-${s.end}`).join('|');
  const first = key(byDate.get(dates[0])!);
  const regular = dates.every((d, i) => key(byDate.get(d)!) === first && d === addDays(dates[0], i));
  if (!regular) return null;
  const slots = [...byDate.get(dates[0])!].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  return { from: dates[0], to: dates[dates.length - 1], slots };
}

export const isMissingTable = (err: any) => {
  const m = String(err?.message ?? '');
  return err?.code === 'PGRST205' || err?.code === '42P01' || /cnc_operation_plans/.test(m) && /(not find|does not exist|schema cache)/i.test(m);
};
