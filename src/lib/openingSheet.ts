// Opening Balances sheet: the SAME format is used to export (download, edit in Excel) and to import (upload it back).
// One header row, then one row per bank / company / product. Rows that already have an opening entry carry its Entry No:
// a Draft is updated by the import, a Posted entry is left alone (reverse it first), a row without an Entry No becomes a new draft.

import { num, toIsoDate, type OpeningDraft, type OpeningEntry, type OpeningLookups } from './openingBalances';

export type SheetTab = 'BANK' | 'PARTY' | 'STOCK';
type Cell = string | number;

export const SHEET_HEADERS: Record<SheetTab, string[]> = {
  BANK: ['Entry No', 'Bank / Cash Account', 'Code', 'Opening Date', 'Debit (Money Out)', 'Credit (Money In)', 'Status'],
  PARTY: ['Entry No', 'Company', 'As', 'Opening Date', 'Invoice Ref', 'Due Date', 'Debit (Money Out)', 'Credit (Money In)', 'Status'],
  STOCK: ['Entry No', 'Product Code', 'Product Name', 'Warehouse', 'Opening Qty', 'Unit Cost', 'Opening Date', 'Status'],
};

const key = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
/** Money-in (Credit box) balance types; everything else is money-out (Debit box). Same rule as the Add form. */
const isMoneyIn = (bt: string | null) => { const b = key(bt); return b.startsWith('debit') || b === 'receivable'; };
const moneyInType = (t: 'BANK' | 'CUSTOMER' | 'SUPPLIER') => (t === 'BANK' ? 'Debit' : t === 'CUSTOMER' ? 'Receivable' : 'Debit Balance');
const moneyOutType = (t: 'BANK' | 'CUSTOMER' | 'SUPPLIER') => (t === 'BANK' ? 'Overdraft' : t === 'CUSTOMER' ? 'Credit Balance' : 'Payable');

/** The sheet to download: header + every bank / company / product, with its opening if it has one. */
export function buildSheet(tab: SheetTab, lookups: OpeningLookups, entries: OpeningEntry[]): Cell[][] {
  const live = entries.filter(e => e.status !== 'Reversed');
  const out: Cell[][] = [SHEET_HEADERS[tab]];
  if (tab === 'BANK') {
    for (const b of lookups.banks) {
      const en = live.filter(e => e.entry_type === 'BANK' && e.account_id === b.id);
      if (!en.length) out.push(['', b.name, b.code, '', '', '', '']);
      for (const e of en) out.push([e.entry_no, b.name, b.code, e.opening_date, isMoneyIn(e.balance_type) ? '' : e.amount, isMoneyIn(e.balance_type) ? e.amount : '', e.status]);
    }
  } else if (tab === 'PARTY') {
    const names = new Map<string, { name: string; cust?: string; sup?: string }>();
    for (const c of lookups.customers) { const k = key(c.name); names.set(k, { ...(names.get(k) ?? { name: c.name }), cust: c.id }); }
    for (const s of lookups.suppliers) { const k = key(s.name); names.set(k, { ...(names.get(k) ?? { name: s.name }), sup: s.id }); }
    for (const [k, c] of Array.from(names.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name))) {
      const kinds: ('CUSTOMER' | 'SUPPLIER')[] = [...(c.cust ? ['CUSTOMER' as const] : []), ...(c.sup ? ['SUPPLIER' as const] : [])];
      for (const kind of kinds) {
        const en = live.filter(e => e.entry_type === kind && (e.party_id === (kind === 'CUSTOMER' ? c.cust : c.sup) || key(e.party_name) === k));
        if (!en.length) out.push(['', c.name, kind === 'CUSTOMER' ? 'Customer' : 'Supplier', '', '', '', '', '', '']);
        for (const e of en) out.push([e.entry_no, c.name, kind === 'CUSTOMER' ? 'Customer' : 'Supplier', e.opening_date, e.invoice_ref ?? '', e.due_date ?? '',
          isMoneyIn(e.balance_type) ? '' : e.amount, isMoneyIn(e.balance_type) ? e.amount : '', e.status]);
      }
    }
  } else {
    const whName = (id: string | null | undefined) => lookups.warehouses.find(w => w.id === id)?.name ?? '';
    for (const i of lookups.items) {
      const en = live.filter(e => e.entry_type === 'STOCK' && e.item_id === i.id && e.item_kind === i.kind);
      if (!en.length) out.push(['', i.code ?? '', i.name, '', '', '', '', '']);
      for (const e of en) out.push([e.entry_no, i.code ?? '', i.name, e.warehouse_name ?? whName(e.warehouse_id), e.qty ?? '', e.unit_cost ?? '', e.opening_date, e.status]);
    }
  }
  return out;
}

function splitLine(line: string, delim: string): string[] {
  if (delim === '\t') return line.split('\t').map(c => c.trim());
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export interface SheetImport { drafts: OpeningDraft[]; creates: number; updates: number; problems: string[] }

/** Reads an uploaded sheet (the exported format) into draft entries. Nothing is saved here. */
export function parseSheet(tab: SheetTab, text: string, lookups: OpeningLookups, entries: OpeningEntry[], today: string): SheetImport {
  const res: SheetImport = { drafts: [], creates: 0, updates: 0, problems: [] };
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.replace(/[\s,;\t"]/g, '') !== '');
  if (lines.length < 2) { res.problems.push('The file needs the header row and at least one data row.'); return res; }
  const delim = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const head = splitLine(lines[0], delim).map(norm);
  const col = (...names: string[]) => head.findIndex(h => names.includes(h));
  const cEntry = col('entryno', 'entrynumber');
  const cDate = col('openingdate', 'date');
  const cOut = col('debitmoneyout', 'debit', 'moneyout');
  const cIn = col('creditmoneyin', 'credit', 'moneyin');
  const byEntryNo = new Map(entries.filter(e => e.status !== 'Reversed').map(e => [key(e.entry_no), e]));
  const get = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');

  const sides = (cells: string[], line: number): { amount: number; moneyIn: boolean } | null => {
    const out = num(get(cells, cOut)), inn = num(get(cells, cIn));
    if (!(out > 0) && !(inn > 0)) return null;
    if (out > 0 && inn > 0) { res.problems.push(`Line ${line}: fill only one of Debit (Money Out) or Credit (Money In)`); return null; }
    return { amount: inn > 0 ? inn : out, moneyIn: inn > 0 };
  };
  /** The existing entry a row refers to: update a Draft, refuse a Posted one. */
  const existing = (cells: string[], line: number, type: string): { skip: boolean; id?: string } => {
    const no = get(cells, cEntry);
    if (!no) return { skip: false };
    const e = byEntryNo.get(key(no));
    if (!e) { res.problems.push(`Line ${line}: entry ${no} was not found`); return { skip: true }; }
    if (e.entry_type !== type) { res.problems.push(`Line ${line}: entry ${no} is not a ${type.toLowerCase()} entry`); return { skip: true }; }
    if (e.status !== 'Draft') { res.problems.push(`Line ${line}: ${no} is already ${e.status.toLowerCase()}; reverse it first to change it`); return { skip: true }; }
    return { skip: false, id: e.id };
  };
  const push = (d: OpeningDraft) => { res.drafts.push(d); if (d.id) res.updates++; else res.creates++; };

  lines.slice(1).forEach((raw, k) => {
    const line = k + 2;
    const cells = splitLine(raw, delim);
    const date = toIsoDate(get(cells, cDate)) || today;
    const s = sides(cells, line);
    if (tab === 'BANK') {
      const name = get(cells, col('bankcashaccount', 'bankaccount', 'bank', 'account', 'name')); const code = get(cells, col('code'));
      if (!s) return;
      const b = lookups.banks.find(x => (code && key(x.code) === key(code)) || key(x.name) === key(name));
      if (!b) { res.problems.push(`Line ${line}: bank "${name || code}" was not found`); return; }
      const ex = existing(cells, line, 'BANK'); if (ex.skip) return;
      if (!ex.id && entries.some(e => e.entry_type === 'BANK' && e.account_id === b.id && e.status !== 'Reversed')) { res.problems.push(`Line ${line}: ${b.name} already has an opening entry; change that row (with its Entry No) instead`); return; }
      push({ ...(ex.id ? { id: ex.id } : {}), entry_type: 'BANK', opening_date: date, account_id: b.id, balance_type: s.moneyIn ? moneyInType('BANK') : moneyOutType('BANK'), amount: s.amount, currency: 'INR' });
    } else if (tab === 'PARTY') {
      const name = get(cells, col('company', 'companyname', 'name')); const asText = key(get(cells, col('as', 'type')));
      if (!s) return;
      const cust = lookups.customers.find(x => key(x.name) === key(name));
      const sup = lookups.suppliers.find(x => key(x.name) === key(name));
      const kind: 'CUSTOMER' | 'SUPPLIER' | null = asText.startsWith('sup') && sup ? 'SUPPLIER' : asText.startsWith('cus') && cust ? 'CUSTOMER' : cust ? 'CUSTOMER' : sup ? 'SUPPLIER' : null;
      if (!kind) { res.problems.push(`Line ${line}: company "${name}" was not found`); return; }
      const ex = existing(cells, line, kind); if (ex.skip) return;
      const party = kind === 'CUSTOMER' ? cust! : sup!;
      push({ ...(ex.id ? { id: ex.id } : {}), entry_type: kind, opening_date: date, party_id: party.id, party_name: party.name, party_code: kind === 'SUPPLIER' ? (sup?.code ?? '') : '',
        balance_type: s.moneyIn ? moneyInType(kind) : moneyOutType(kind), invoice_ref: get(cells, col('invoiceref', 'invoice')), due_date: toIsoDate(get(cells, col('duedate', 'due'))), amount: s.amount, currency: 'INR' });
    } else {
      const code = get(cells, col('productcode', 'code', 'sku')); const name = get(cells, col('productname', 'name', 'product', 'item'));
      const qty = num(get(cells, col('openingqty', 'quantity', 'qty', 'openingquantity')));
      if (!(qty > 0)) return;
      const item = lookups.items.find(i => (code && key(i.code) === key(code)) || (name && key(i.name) === key(name)));
      if (!item) { res.problems.push(`Line ${line}: product "${code || name}" is not in the inventory master`); return; }
      const whText = get(cells, col('warehouse', 'location'));
      const wh = whText ? lookups.warehouses.find(w => key(w.name) === key(whText) || key(w.code) === key(whText)) : undefined;
      if (whText && !wh) { res.problems.push(`Line ${line}: warehouse "${whText}" was not found`); return; }
      const ex = existing(cells, line, 'STOCK'); if (ex.skip) return;
      const costText = get(cells, col('unitcost', 'cost', 'rate'));
      push({ ...(ex.id ? { id: ex.id } : {}), entry_type: 'STOCK', opening_date: date, item_kind: item.kind, item_id: item.id, warehouse_id: wh?.id ?? '', qty, unit_cost: costText ? num(costText) : item.rate, currency: 'INR' });
    }
  });
  if (!res.drafts.length && !res.problems.length) res.problems.push('No row has an opening amount filled in.');
  return res;
}
