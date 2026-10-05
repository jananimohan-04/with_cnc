// Ledger Dashboard: one flat party ledger built from bank entries, invoices and inwards.
// Pure functions (no network) so every rule is unit-tested.
//
// Party-ledger convention (matches the sheet it replaces):
//   Debit  = the party owes us more      (sales invoice to a customer; money paid OUT of the bank)
//   Credit = the party owes us less / we owe them (money received IN; credit note; purchase inward from a supplier)
// Balance = total debit - total credit  (positive = Dr, negative = Cr).

import type { BankRow, InvoiceRow } from './finance';

export type LedgerSource = 'Bank' | 'Invoice' | 'Inward';

export interface LedgerLine {
  id: string;
  source: LedgerSource;
  date: string;          // yyyy-mm-dd ('' when unknown)
  ref: string;
  particulars: string;
  narration: string;
  debit: number;
  credit: number;
  party: string;
  ledgerType: string;
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const day = (v: unknown): string => String(v ?? '').slice(0, 10);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function fromBank(rows: BankRow[]): LedgerLine[] {
  return rows.map(r => ({
    id: `bank:${r.id}`, source: 'Bank' as const, date: day(r.txn_date), ref: r.reference_no ?? '',
    particulars: r.account_name ?? '', narration: r.mode || r.description || '',
    debit: r.direction === 'OUT' ? r2(num(r.amount)) : 0, credit: r.direction === 'IN' ? r2(num(r.amount)) : 0,
    party: r.party_name ?? '', ledgerType: r.party_type ?? '',
  }));
}

/** Cancelled invoices and Proformas are not accounting documents, so they are left out. */
export function fromInvoices(rows: InvoiceRow[]): LedgerLine[] {
  return rows.filter(i => !i.cancelled && i.invoice_type !== 'Proforma Invoice').map(i => {
    const credit = i.invoice_type === 'Credit Note';
    const total = r2(num(i.total));
    return {
      id: `inv:${i.id}`, source: 'Invoice' as const, date: day(i.invoice_date), ref: i.invoice_no ?? '',
      particulars: i.invoice_type || 'Sales Invoice', narration: i.dc_no ? `DC ${i.dc_no}` : (i.part_name ?? ''),
      debit: credit ? 0 : total, credit: credit ? total : 0, party: i.customer_name ?? '', ledgerType: 'Customer',
    };
  });
}

/** A purchase inward is what we owe the supplier: a credit on the supplier's ledger. */
export function fromInwards(rows: Record<string, unknown>[]): LedgerLine[] {
  return rows.filter(r => String(r.status ?? '') !== 'Deleted').map(r => {
    const direct = r.total_amount ?? r.total ?? r.amount;
    const q = num(r.quantity), p = num(r.price), d = num(r.discount), g = num(r.gst);
    const amount = direct !== undefined && direct !== null && direct !== '' ? num(direct) : q * p * (1 - d / 100) * (1 + g / 100);
    return {
      id: `inw:${String(r.id ?? r.inward_no)}`, source: 'Inward' as const, date: day(r.inward_date ?? r.created_at),
      ref: String(r.reference_no || r.inward_no || ''), particulars: `Inward ${String(r.category ?? '')}`.trim(),
      narration: String(r.part_name || r.product_name || ''), debit: 0, credit: r2(amount),
      party: String(r.party_name ?? ''), ledgerType: 'Supplier',
    };
  });
}

export interface LedgerFilter { from?: string; to?: string; particulars?: string; party?: string; search?: string; sources?: LedgerSource[] }

export function filterLines(lines: LedgerLine[], f: LedgerFilter): LedgerLine[] {
  const part = (f.particulars ?? '').trim().toLowerCase();
  const search = (f.search ?? '').trim().toLowerCase();
  return lines.filter(l => {
    if (f.sources && !f.sources.includes(l.source)) return false;
    if (f.from && (!l.date || l.date < f.from)) return false;
    if (f.to && (!l.date || l.date > f.to)) return false;
    if (part && !l.particulars.toLowerCase().includes(part)) return false;
    if (f.party && l.party.trim().toLowerCase() !== f.party.trim().toLowerCase()) return false;
    if (search && ![l.date, l.ref, l.particulars, l.narration, l.party, l.ledgerType, String(l.debit || ''), String(l.credit || '')].some(x => x.toLowerCase().includes(search))) return false;
    return true;
  });
}

export type SortKey = 'date' | 'ref' | 'particulars' | 'narration' | 'debit' | 'credit' | 'party' | 'ledgerType';
export function sortLines(lines: LedgerLine[], key: SortKey, dir: 'asc' | 'desc'): LedgerLine[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...lines].sort((a, b) => {
    const x = a[key], y = b[key];
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
    return c !== 0 ? c * m : a.id.localeCompare(b.id);
  });
}

export const dmy = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

export interface PartySummary { party: string; ledgerType: string; debit: number; credit: number; balance: number; entries: number }
export function summarizeByParty(lines: LedgerLine[]): PartySummary[] {
  const map = new Map<string, PartySummary>();
  for (const l of lines) {
    const key = l.party.trim().toLowerCase() || '(no party)';
    const e = map.get(key) ?? { party: l.party.trim() || '(no party)', ledgerType: l.ledgerType, debit: 0, credit: 0, balance: 0, entries: 0 };
    e.debit = r2(e.debit + l.debit); e.credit = r2(e.credit + l.credit); e.entries++;
    if (!e.ledgerType && l.ledgerType) e.ledgerType = l.ledgerType;
    map.set(key, e);
  }
  const out = [...map.values()].map(e => ({ ...e, balance: r2(e.debit - e.credit) }));
  return out.sort((a, b) => a.party.localeCompare(b.party, undefined, { sensitivity: 'base' }));
}

export interface StatementRow extends LedgerLine { balance: number }
export interface Statement { rows: StatementRow[]; opening: number; debit: number; credit: number; closing: number }
/** Party statement: everything before `from` is rolled into the opening balance, the rest runs chronologically. */
export function statementFor(lines: LedgerLine[], party: string, from?: string, to?: string): Statement {
  const mine = lines.filter(l => l.party.trim().toLowerCase() === party.trim().toLowerCase());
  const opening = r2(mine.filter(l => from && l.date && l.date < from).reduce((n, l) => n + l.debit - l.credit, 0));
  const inRange = mine.filter(l => (!from || !l.date || l.date >= from) && (!to || !l.date || l.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let bal = opening, debit = 0, credit = 0;
  const rows = inRange.map(l => { bal = r2(bal + l.debit - l.credit); debit = r2(debit + l.debit); credit = r2(credit + l.credit); return { ...l, balance: bal }; });
  return { rows, opening, debit, credit, closing: bal };
}
export const drCr = (n: number) => (n > 0 ? 'Dr' : n < 0 ? 'Cr' : '');
