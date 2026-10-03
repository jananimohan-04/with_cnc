// Quotation arithmetic. All money is rounded to whole paise at each step so the printed
// figures always add up to the printed total.

import type { Workings } from './quotationWorkings';

export const QUOTE_UNITS = ['Nos', 'Pcs', 'Kg', 'Set', 'Mtr', 'Ft', 'Sq.Ft', 'Ltr', 'Lot', 'Hrs'] as const;

export interface QuoteLine {
  id: string;
  hsn: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  /** Discount in percent (0-100). */
  discount: string;
  /** Cost build-up behind the unit price (see WorkingsModal). */
  workings?: Workings;
}

export interface QuoteTaxInput { cgst: string; sgst: string; igst: string }

export interface LineResult {
  discountedUnit: number;
  amount: number;
  /** True when the row has a description or any number typed, so it counts in totals and exports. */
  active: boolean;
  /** Per-field problems for a row that is in use. */
  issues: Partial<Record<'qty' | 'unitPrice' | 'discount', string>>;
}

export interface QuoteTotals {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  roundOff: number;
  total: number;
}

const toNum = (s: string): number => {
  const t = (s ?? '').trim().replace(/,/g, '');
  if (t === '') return NaN;
  return Number(t);
};

/** Rounds to 2 decimals without binary drift (1.005 -> 1.01). */
export const money = (n: number): number => Math.round((n + Number.EPSILON) * 100 + (n < 0 ? -1e-9 : 1e-9)) / 100;

export const emptyLine = (id: string): QuoteLine => ({ id, hsn: '', description: '', qty: '1', unit: 'Pcs', unitPrice: '', discount: '' });

export function calcLine(l: QuoteLine): LineResult {
  const qty = toNum(l.qty);
  const price = toNum(l.unitPrice);
  const disc = l.discount.trim() === '' ? 0 : toNum(l.discount);
  const active = l.description.trim() !== '' || l.unitPrice.trim() !== '';
  const issues: LineResult['issues'] = {};
  if (active) {
    if (!(qty > 0)) issues.qty = 'Quantity must be greater than 0';
    if (!(price >= 0)) issues.unitPrice = 'Enter a unit price';
    if (!(disc >= 0 && disc <= 100)) issues.discount = 'Discount must be 0-100%';
  }
  if (!active || Object.keys(issues).length) return { discountedUnit: 0, amount: 0, active, issues };
  const discountedUnit = money(price * (1 - disc / 100));
  return { discountedUnit, amount: money(discountedUnit * qty), active, issues };
}

export function calcTotals(lines: QuoteLine[], tax: QuoteTaxInput): QuoteTotals {
  const subtotal = money(lines.reduce((s, l) => s + calcLine(l).amount, 0));
  const pct = (s: string) => { const n = toNum(s); return n > 0 && n <= 100 ? n : 0; };
  const cgst = money(subtotal * pct(tax.cgst) / 100);
  const sgst = money(subtotal * pct(tax.sgst) / 100);
  const igst = money(subtotal * pct(tax.igst) / 100);
  const taxTotal = money(cgst + sgst + igst);
  const exact = money(subtotal + taxTotal);
  const total = Math.round(exact);
  return { subtotal, cgst, sgst, igst, taxTotal, roundOff: money(total - exact), total };
}

export interface QuoteIssue { message: string }

/** What stops a quotation being sent / saved. Empty list means it is ready. */
export function validateQuote(clientCount: number, lines: QuoteLine[]): QuoteIssue[] {
  const out: QuoteIssue[] = [];
  if (clientCount === 0) out.push({ message: 'Add or select at least one client.' });
  const rows = lines.map(calcLine);
  if (!rows.some(r => r.active)) out.push({ message: 'Add at least one product.' });
  rows.forEach((r, i) => { for (const m of Object.values(r.issues)) out.push({ message: `Row ${i + 1}: ${m}` }); });
  return out;
}
