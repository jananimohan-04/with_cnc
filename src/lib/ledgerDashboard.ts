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
  /** Bills only (invoice / inward): what is still unpaid after receipts already linked to it. */
  due?: number;
  /** Bank rows only: true when the receipt / payment is already linked to a specific invoice. */
  linked?: boolean;
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const day = (v: unknown): string => String(v ?? '').slice(0, 10);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function fromBank(rows: BankRow[]): LedgerLine[] {
  return rows.map(r => ({
    id: `bank:${r.id}`, source: 'Bank' as const, date: day(r.txn_date), ref: r.reference_no ?? '',
    particulars: r.account_name ?? '', narration: r.mode || r.description || '',
    debit: r.direction === 'OUT' ? r2(num(r.amount)) : 0, credit: r.direction === 'IN' ? r2(num(r.amount)) : 0,
    party: r.party_name ?? '', ledgerType: r.party_type ?? '', linked: !!r.invoice_id,
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
      due: credit ? undefined : Math.max(0, i.balance !== undefined && i.balance !== null && i.balance !== '' ? num(i.balance) : total - num(i.received)),
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
      party: String(r.party_name ?? ''), ledgerType: 'Supplier', due: r2(amount),
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

export interface ReceivablePayable { receivable: number; payable: number; customers: number; suppliers: number }
/** Receivable = what customers owe (debit balances on Customer ledgers). Payable = what we owe suppliers (credit balances on Supplier ledgers). */
export function receivablePayable(lines: LedgerLine[]): ReceivablePayable {
  const out = { receivable: 0, payable: 0, customers: 0, suppliers: 0 };
  for (const e of summarizeByParty(lines)) {
    if (e.ledgerType === 'Customer' && e.balance > 0) { out.receivable = r2(out.receivable + e.balance); out.customers++; }
    else if (e.ledgerType === 'Supplier' && e.balance < 0) { out.payable = r2(out.payable - e.balance); out.suppliers++; }
  }
  return out;
}

export interface Settlement { state: 'Completed' | 'Part' | 'Pending'; paid: number; left: number; days: number }
const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const dayNumber = (iso: string) => { const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`); return Number.isFinite(t) ? Math.floor(t / 86400000) : NaN; };

/** Which invoices / inward bills the bank statement has settled.
 *  Receipts from a customer (and payments to a supplier) that are not tied to one invoice are applied to that party's
 *  bills oldest first. Anything still unpaid counts the days since the bill's date: 0 = today, 1, 2, 3 ... */
export function settleDocuments(lines: LedgerLine[], today: string): Map<string, Settlement> {
  const out = new Map<string, Settlement>();
  const pool = new Map<string, number>();
  for (const l of lines) {
    if (l.source !== 'Bank' || l.linked || !l.party.trim()) continue;
    const key = l.ledgerType === 'Customer' && l.credit > 0 ? `C|${nameKey(l.party)}` : l.ledgerType === 'Supplier' && l.debit > 0 ? `S|${nameKey(l.party)}` : '';
    if (key) pool.set(key, r2((pool.get(key) ?? 0) + (l.credit || l.debit)));
  }
  const bills = lines.filter(l => l.due !== undefined && (l.source === 'Invoice' || l.source === 'Inward'))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const now = dayNumber(today);
  for (const b of bills) {
    const amount = b.source === 'Invoice' ? b.debit : b.credit;
    let left = r2(b.due ?? 0);
    const key = `${b.source === 'Invoice' ? 'C' : 'S'}|${nameKey(b.party)}`;
    const avail = pool.get(key) ?? 0;
    if (left > 0.005 && avail > 0) { const use = Math.min(avail, left); pool.set(key, r2(avail - use)); left = r2(left - use); }
    const paid = r2(Math.max(0, amount - left));
    const d = dayNumber(b.date);
    const days = Number.isFinite(d) && Number.isFinite(now) ? Math.max(0, now - d) : 0;
    out.set(b.id, { state: left <= 0.005 ? 'Completed' : paid > 0.005 ? 'Part' : 'Pending', paid, left: Math.max(0, left), days });
  }
  return out;
}
