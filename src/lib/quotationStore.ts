import { calcTotals } from './quotationCalc';
import type { QuoteDoc } from './quotationDocument';

// Saved quotations, kept in this browser per company (no quotation table in the database yet).
// Every quotation that is saved, exported or sent lands here, numbered #1, #2, #3 in order.

export interface SavedQuote extends QuoteDoc {
  id: string;
  seq: number;
  savedAt: string;
  total: number;
}

export interface QuoteIdent { id: string; seq: number; quoteNo: string }

const key = (companyId: string | null | undefined) => `argus.quotations.${companyId ?? 'all'}`;
const DRAFT_KEY = (companyId: string | null | undefined) => `argus.quotation.reuse.${companyId ?? 'all'}`;

export const makeQuoteNo = (date: string, seq: number) => `QT-${date.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`;

const isQuote = (q: unknown): q is Partial<SavedQuote> & { lines: unknown[]; clients: unknown[] } =>
  !!q && typeof q === 'object' && Array.isArray((q as SavedQuote).lines) && Array.isArray((q as SavedQuote).clients);

/** Newest first. Entries saved by earlier versions (no id / seq) are numbered by their position. */
export function loadQuotes(companyId: string | null | undefined): SavedQuote[] {
  let raw: unknown[] = [];
  try { const v = JSON.parse(localStorage.getItem(key(companyId)) || '[]'); if (Array.isArray(v)) raw = v; } catch { /* unreadable: treat as empty */ }
  const valid = raw.filter(isQuote);
  const n = valid.length;
  const out = valid.map((q, i): SavedQuote => ({
    ...(q as unknown as SavedQuote),
    id: q.id ?? `legacy-${i}-${q.quoteNo ?? ''}`,
    seq: typeof q.seq === 'number' ? q.seq : n - i,
    savedAt: q.savedAt ?? new Date(0).toISOString(),
    total: typeof q.total === 'number' ? q.total : calcTotals(q.lines as SavedQuote['lines'], q.tax as SavedQuote['tax']).total,
  }));
  return out.sort((a, b) => b.seq - a.seq);
}

function write(companyId: string | null | undefined, list: SavedQuote[]): boolean {
  try { localStorage.setItem(key(companyId), JSON.stringify(list)); return true; } catch { return false; }
}

export const nextSeq = (list: SavedQuote[]) => list.reduce((m, q) => Math.max(m, q.seq), 0) + 1;

/** Reserves the identity (id, number) for a quotation about to be saved for the first time. */
export function newIdent(companyId: string | null | undefined, date: string): QuoteIdent {
  const seq = nextSeq(loadQuotes(companyId));
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `q${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  return { id, seq, quoteNo: makeQuoteNo(date, seq) };
}

/** Inserts or replaces (same id) a quotation. Returns false if storage is unavailable. */
export function upsertQuote(companyId: string | null | undefined, doc: QuoteDoc, ident: QuoteIdent): boolean {
  const list = loadQuotes(companyId);
  const entry: SavedQuote = { ...doc, quoteNo: ident.quoteNo, id: ident.id, seq: ident.seq, savedAt: new Date().toISOString(), total: calcTotals(doc.lines, doc.tax).total };
  const i = list.findIndex(q => q.id === ident.id);
  if (i >= 0) list[i] = entry; else list.push(entry);
  return write(companyId, list);
}

export function deleteQuote(companyId: string | null | undefined, id: string): boolean {
  return write(companyId, loadQuotes(companyId).filter(q => q.id !== id));
}

/** Hand-off from the library to the Create Quotation page ("Reuse"). */
export function stashForReuse(companyId: string | null | undefined, q: SavedQuote): boolean {
  try { sessionStorage.setItem(DRAFT_KEY(companyId), JSON.stringify(q)); return true; } catch { return false; }
}
export function takeReuse(companyId: string | null | undefined): SavedQuote | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY(companyId));
    if (!raw) return null;
    sessionStorage.removeItem(DRAFT_KEY(companyId));
    const q = JSON.parse(raw);
    return isQuote(q) ? (q as SavedQuote) : null;
  } catch { return null; }
}

export interface QuoteFilter { text: string; quoteNo: string; client: string; from: string; to: string }
export const noFilter: QuoteFilter = { text: '', quoteNo: '', client: '', from: '', to: '' };

export function filterQuotes(list: SavedQuote[], f: QuoteFilter): SavedQuote[] {
  const t = f.text.trim().toLowerCase();
  const no = f.quoteNo.trim().replace(/^#/, '').toLowerCase();
  return list.filter(q => {
    if (t && !(q.clients.some(c => c.name.toLowerCase().includes(t)) || q.lines.some(l => l.description.toLowerCase().includes(t)))) return false;
    if (no && String(q.seq) !== no && q.quoteNo.toLowerCase() !== no) return false;
    if (f.client && !q.clients.some(c => c.name === f.client)) return false;
    if (f.from && q.date < f.from) return false;
    if (f.to && q.date > f.to) return false;
    return true;
  });
}

export const clientNames = (list: SavedQuote[]) =>
  [...new Set(list.flatMap(q => q.clients.map(c => c.name)))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
