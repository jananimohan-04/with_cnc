import { money } from './quotationCalc';

// Cost workings behind one quotation line: raw material (by weight), process / machining, other bought-out
// expenses and a profit margin. The total becomes the line's unit price.

export interface WorkRow { id: string; description: string; qty: string; rate: string }
export interface Workings {
  materials: WorkRow[]; // qty = weight in kg, rate = INR per kg
  processes: WorkRow[]; // qty = hours / units, rate = INR per unit
  others: WorkRow[];    // qty = quantity, rate = INR per piece
  marginPct: string;
}

export const emptyWorkings = (): Workings => ({ materials: [], processes: [], others: [], marginPct: '' });

const num = (s: string) => { const n = Number((s ?? '').trim().replace(/,/g, '')); return Number.isFinite(n) ? n : NaN; };

export const rowCost = (r: WorkRow): number => {
  if (r.qty.trim() === '' && r.rate.trim() === '') return 0;
  const q = num(r.qty), p = num(r.rate);
  return q >= 0 && p >= 0 ? money(q * p) : NaN;
};

export interface WorkingsResult { materials: number; processes: number; others: number; subtotal: number; profit: number; total: number; issues: string[] }

export function calcWorkings(w: Workings): WorkingsResult {
  const issues: string[] = [];
  const sum = (rows: WorkRow[], label: string) => rows.reduce((s, r, i) => {
    const c = rowCost(r);
    if (Number.isNaN(c)) { issues.push(`${label} row ${i + 1}: enter numbers of 0 or more`); return s; }
    return s + c;
  }, 0);
  const materials = money(sum(w.materials, 'Material'));
  const processes = money(sum(w.processes, 'Process'));
  const others = money(sum(w.others, 'Other expense'));
  const subtotal = money(materials + processes + others);
  const m = w.marginPct.trim() === '' ? 0 : num(w.marginPct);
  if (!(m >= 0 && m <= 1000)) issues.push('Profit margin must be between 0 and 1000%');
  const profit = m >= 0 && m <= 1000 ? money(subtotal * m / 100) : 0;
  return { materials, processes, others, subtotal, profit, total: money(subtotal + profit), issues };
}

/** True when the workings contain any entered row (so they are worth printing). */
export const hasWorkings = (w?: Workings): w is Workings =>
  !!w && [...w.materials, ...w.processes, ...w.others].some(r => r.description.trim() || r.qty.trim() || r.rate.trim());
