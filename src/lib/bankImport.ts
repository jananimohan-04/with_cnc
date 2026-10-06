// Bank statement import: parse pasted / uploaded CSV or TAB rows, validate each row, flag duplicates.
// Pure functions only (no network) so every rule is unit-tested.

export interface ImportRow {
  id: string;
  line: number;
  date: string | null;       // yyyy-mm-dd
  rawDate: string;
  description: string;
  reference: string;
  debit: number;             // money out
  credit: number;            // money in
  balance: number | null;
  /** Chosen by the user (or by a Type's default): the other side of the entry. */
  typeId: string;
  ledgerId: string;
  party: string;
}

export type RowIssue = 'Invalid date' | 'No amount' | 'Both debit and credit' | 'Invalid amount' | 'Duplicate in file' | 'Already saved' | 'No type or ledger';

export interface Parsed { rows: ImportRow[]; headerFound: boolean; delimiter: string; skipped: number; warnings: string[] }

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

/** dd-mm-yyyy, dd/mm/yy, yyyy-mm-dd, dd-Mon-yyyy, dd Mon yyyy -> yyyy-mm-dd, or null when it is not a real date. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let mt = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
  if (mt) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]+(\d{2,4})$/.exec(s))) {
    const mm = MONTHS[mt[2].slice(0, 3).toLowerCase()]; if (!mm) return null;
    d = +mt[1]; m = mm; y = +mt[3];
  } else if ((mt = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T].*)?$/.exec(s))) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
  else return null;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || y < 1990 || y > 2100) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "1,23,456.50", "(500)", "500 Dr", "-500", "" -> number | null (null = unreadable) | 0 for blank. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (s === '' || s === '-' || /^nil$/i.test(s)) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/₹|rs\.?|inr/gi, '').trim();
  if (/(dr|cr)\.?$/i.test(s)) { s = s.replace(/\s*(dr|cr)\.?$/i, ''); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  s = s.replace(/[,\s]/g, '');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
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

const HEADERS: Record<string, RegExp> = {
  date: /^(txn\.?\s*date|transaction\s*date|value\s*date|posting\s*date|date)$/i,
  description: /^(narration|description|particulars|details|remarks|transaction\s*remarks|txn\s*description)$/i,
  reference: /^(ref(erence)?(\s*no\.?)?|chq\.?\s*\/?\s*ref\.?\s*no\.?|cheque(\s*no\.?)?|utr(\s*no\.?)?|txn\s*id|transaction\s*id)$/i,
  debit: /^(debit|withdrawal(s)?(\s*amt\.?)?|withdrawal\s*amount|dr\.?|paid\s*out|money\s*out)$/i,
  credit: /^(credit|deposit(s)?(\s*amt\.?)?|deposit\s*amount|cr\.?|paid\s*in|money\s*in)$/i,
  balance: /^(balance|closing\s*balance|running\s*balance)$/i,
  amount: /^(amount|txn\s*amount|transaction\s*amount)$/i,
};

/** Excel turns long cheque / UTR numbers into 4.00E+11, which is the same for many rows and not a real reference. */
const cleanReference = (r: string): string => (/^\d+(\.\d+)?e\+\d+$/i.test(r.trim()) ? '' : r.trim());

/** Parses pasted/uploaded text into rows. Understands a header row (any order); otherwise assumes
 *  Date, Description, Reference, Debit, Credit, Balance. */
export function parseStatement(text: string): Parsed {
  // Real bank exports start with an account-details block and Excel pads rows with empty cells (",,,,,"), so
  // lines holding only delimiters are dropped and the header row is searched for further down.
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter(l => l.replace(/[\s,;\t"]/g, '') !== '');
  const warnings: string[] = [];
  if (!lines.length) return { rows: [], headerFound: false, delimiter: ',', skipped: 0, warnings };
  const head = lines.slice(0, 40);
  const delimiter = head.some(l => l.includes('\t')) ? '\t' : head.some(l => l.includes(';')) && !head.some(l => l.includes(',')) ? ';' : ',';

  let map: Record<string, number> = {};
  let headerFound = false;
  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    const cells = splitLine(lines[i], delimiter);
    const found: Record<string, number> = {};
    cells.forEach((c, idx) => { for (const [k, re] of Object.entries(HEADERS)) if (found[k] === undefined && re.test(c.trim())) found[k] = idx; });
    if (found.date !== undefined && (found.debit !== undefined || found.credit !== undefined || found.amount !== undefined)) { map = found; headerFound = true; start = i + 1; break; }
  }
  if (!headerFound) map = { date: 0, description: 1, reference: 2, debit: 3, credit: 4, balance: 5 };

  const rows: ImportRow[] = [];
  let skipped = 0;
  for (let i = start; i < lines.length; i++) {
    const c = splitLine(lines[i], delimiter);
    const get = (k: string) => (map[k] !== undefined ? (c[map[k]] ?? '') : '');
    if (c.every(x => x === '')) { skipped++; continue; }
    const rawDate = get('date');
    // Notes, "Total" / "Closing balance" lines and page footers (no digits in the date cell) are not entries.
    if (!parseDate(rawDate) && (!/\d/.test(rawDate) || (get('debit').trim() === '' && get('credit').trim() === '' && get('amount').trim() === ''))) { skipped++; continue; }
    let debit = parseAmount(get('debit'));
    let credit = parseAmount(get('credit'));
    if (map.amount !== undefined && map.debit === undefined && map.credit === undefined) {
      const a = parseAmount(get('amount'));
      const raw = get('amount').trim();
      if (a === null) { debit = null; credit = null; }
      else if (a < 0 || /dr\.?$/i.test(raw)) { debit = Math.abs(a); credit = 0; }
      else { credit = a; debit = 0; }
    }
    const bal = get('balance') === '' ? null : parseAmount(get('balance'));
    rows.push({
      id: `r${i}`, line: i + 1, date: parseDate(rawDate), rawDate,
      description: get('description'), reference: cleanReference(get('reference')),
      debit: debit === null ? NaN : Math.abs(debit), credit: credit === null ? NaN : Math.abs(credit),
      balance: bal, typeId: '', ledgerId: '', party: '',
    });
  }
  if (!headerFound) warnings.push('No header row found: assumed columns Date, Description, Reference, Debit, Credit, Balance.');
  return { rows, headerFound, delimiter, skipped, warnings };
}

export interface ExistingTxn { txn_date: string; amount: string | number; direction: 'IN' | 'OUT'; reference_no?: string | null }

/** Problems with each row (empty array = ready to save). `existing` = transactions already saved for this bank. */
export function validateRows(rows: ImportRow[], existing: ExistingTxn[] = [], requireLedger = true): Map<string, RowIssue[]> {
  const out = new Map<string, RowIssue[]>();
  const seen = new Map<string, string>();
  const saved = new Set(existing.map(e => `${String(e.txn_date).slice(0, 10)}|${e.direction}|${Number(e.amount).toFixed(2)}|${(e.reference_no ?? '').trim().toLowerCase()}`));
  for (const r of rows) {
    const issues: RowIssue[] = [];
    if (!r.date) issues.push('Invalid date');
    if (Number.isNaN(r.debit) || Number.isNaN(r.credit)) issues.push('Invalid amount');
    else if (r.debit > 0 && r.credit > 0) issues.push('Both debit and credit');
    else if (r.debit === 0 && r.credit === 0) issues.push('No amount');
    if (requireLedger && !r.ledgerId && !r.typeId) issues.push('No type or ledger');
    if (r.date && !Number.isNaN(r.debit) && !Number.isNaN(r.credit) && (r.debit > 0) !== (r.credit > 0)) {
      const dir = r.credit > 0 ? 'IN' : 'OUT';
      const key = `${r.date}|${dir}|${(r.credit || r.debit).toFixed(2)}|${r.reference.trim().toLowerCase()}`;
      if (saved.has(key)) issues.push('Already saved');
      else if (seen.has(key) && r.reference.trim() !== '') issues.push('Duplicate in file');
      seen.set(key, r.id);
    }
    out.set(r.id, issues);
  }
  return out;
}

// ---- Types and Others lists (kept in this browser, per company) ----
export interface EntryType { id: string; name: string; direction: 'IN' | 'OUT' | 'ANY'; ledgerId: string }
const KEY = (k: string, cid: string | null | undefined) => `argus.bank.${k}.${cid ?? 'all'}`;
const DEFAULT_TYPES: EntryType[] = [
  { id: 't-others', name: 'OTHERS', direction: 'ANY', ledgerId: '' },
  { id: 't-internal', name: 'INTERNAL', direction: 'ANY', ledgerId: '' },
];
export function loadTypes(cid: string | null | undefined): EntryType[] {
  try {
    const raw = localStorage.getItem(KEY('types', cid));
    if (raw === null) return DEFAULT_TYPES;
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((t: EntryType) => t && typeof t.id === 'string' && typeof t.name === 'string') : DEFAULT_TYPES;
  } catch { return DEFAULT_TYPES; }
}
export function saveTypes(cid: string | null | undefined, t: EntryType[]): boolean {
  try { localStorage.setItem(KEY('types', cid), JSON.stringify(t)); return true; } catch { return false; }
}
/** A named party that is not a customer or supplier. INTERNAL = your own accounts (e.g. a loan or OD account). */
export interface Other { name: string; /** the name of one of the Types */ kind: string }

export function loadOthers(cid: string | null | undefined): Other[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY('others', cid)) || '[]');
    if (!Array.isArray(a)) return [];
    // older versions stored plain names; they become OTHERS
    return a.flatMap((x: unknown): Other[] => {
      if (typeof x === 'string') return x.trim() ? [{ name: x.trim(), kind: 'OTHERS' }] : [];
      const o = x as { name?: unknown; kind?: unknown };
      return o && typeof o.name === 'string' && o.name.trim() ? [{ name: o.name.trim(), kind: typeof o.kind === 'string' && o.kind.trim() ? o.kind.trim() : 'OTHERS' }] : [];
    });
  } catch { return []; }
}
export function saveOthers(cid: string | null | undefined, o: Other[]): boolean {
  try { localStorage.setItem(KEY('others', cid), JSON.stringify(o)); return true; } catch { return false; }
}

/** Applies a Type's default ledger to rows that have none, and refuses a Type whose direction does not match the row. */
export function applyTypeDefaults(rows: ImportRow[], types: EntryType[]): ImportRow[] {
  return rows.map(r => {
    const t = types.find(x => x.id === r.typeId);
    if (!t) return r;
    return { ...r, ledgerId: r.ledgerId || t.ledgerId };
  });
}
export const rowDirection = (r: ImportRow): 'IN' | 'OUT' | null => (r.credit > 0 && !(r.debit > 0) ? 'IN' : r.debit > 0 && !(r.credit > 0) ? 'OUT' : null);
export const typeFitsRow = (t: EntryType, r: ImportRow): boolean => { const d = rowDirection(r); return t.direction === 'ANY' || d === null || t.direction === d; };
