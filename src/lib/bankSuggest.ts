// Suggests the Type / Ledger / Party of an imported bank row from its description.
// Order of trust: GSTIN -> registered company name -> your "Others" list -> keyword (salary, rent ...) -> personal.
// Pure functions; a suggestion only fills what the user has not chosen, and it is shown as automatic so it can be changed.

import type { EntryType, ImportRow, Other } from './bankImport';

export interface PartyRef { id: string; name: string; gst?: string; kind: 'Customer' | 'Supplier' }
export interface LedgerRef { id: string; code: string; name: string }
export interface SuggestCtx {
  parties: PartyRef[];
  receivable?: LedgerRef;   // Trade Receivables (customers)
  payable?: LedgerRef;      // Trade Payables (suppliers)
  income: LedgerRef[];
  expense: LedgerRef[];
  types: EntryType[];
  others: Other[];
  /** This company's own name: a description that carries it is a transfer between its own accounts. */
  ownName?: string;
}
export interface Suggestion { party?: string; ledgerId?: string; typeId?: string; reason: string }

const typeFits = (t: EntryType, d: 'IN' | 'OUT' | null) => t.direction === 'ANY' || d === null || t.direction === d;

const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;
const STOP = new Set(['PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP', 'CO', 'COMPANY', 'AND', 'THE', 'OF', 'M', 'S', 'MS', 'INDIA', 'INDUSTRIES', 'ENTERPRISES']);

const tokens = (s: string): string[] => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(t => t.length >= 2 && !STOP.has(t));
const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Registered party mentioned in the text: by GSTIN (or the same PAN), else by name. */
export function matchParty(desc: string, parties: PartyRef[], dir: 'IN' | 'OUT' | null): { party: PartyRef; how: string } | null {
  const text = desc.toUpperCase();
  const gstins = Array.from(text.matchAll(GSTIN)).map(m => m[0]);
  for (const g of gstins) {
    const exact = parties.filter(p => p.gst && squash(p.gst) === g);
    const byPan = exact.length ? exact : parties.filter(p => p.gst && squash(p.gst).slice(2, 12) === g.slice(2, 12));
    const pick = pickByDirection(byPan, dir);
    if (pick) return { party: pick, how: `GSTIN ${g} matches ${pick.name}` };
  }
  const hay = ` ${tokens(text).join(' ')} `;
  const flat = squash(text);
  let best: { p: PartyRef; score: number } | null = null; let tie = false;
  for (const p of parties) {
    const tk = tokens(p.name);
    if (!tk.length) continue;
    const full = squash(p.name);
    let score = 0;
    if (full.length >= 5 && flat.includes(full)) score = full.length + 10;
    else if (tk.length >= 2 && tk.every(t => hay.includes(` ${t} `))) score = tk.join('').length;
    else if (tk.length === 1 && tk[0].length >= 5 && hay.includes(` ${tk[0]} `)) score = tk[0].length - 2;
    if (!score) continue;
    if (!best || score > best.score) { best = { p, score }; tie = false; }
    else if (score === best.score && p.name !== best.p.name) tie = true;
  }
  if (best && !tie) {
    const same = parties.filter(p => squash(p.name) === squash(best!.p.name));
    const pick = pickByDirection(same, dir) ?? best.p;
    return { party: pick, how: `Name matches ${pick.name}` };
  }
  return null;
}

/** A company that is both customer and supplier: money in -> customer, money out -> supplier. */
function pickByDirection(list: PartyRef[], dir: 'IN' | 'OUT' | null): PartyRef | null {
  if (!list.length) return null;
  const want = dir === 'OUT' ? 'Supplier' : 'Customer';
  return list.find(p => p.kind === want) ?? list[0];
}

interface KeywordRule { key: string; desc: RegExp; ledger: RegExp; dir?: 'IN' | 'OUT' }
const RULES: KeywordRule[] = [
  { key: 'Salary', desc: /\b(salary|salaries|sal|wages?|payroll|stipend|bonus)\b/i, ledger: /salar|wage|payroll|staff|employee/i, dir: 'OUT' },
  { key: 'Rent', desc: /\brent\b/i, ledger: /\brent/i },
  { key: 'Electricity', desc: /\b(eb|tneb|tangedco|electricity|power\s*bill|bescom|msedcl)\b/i, ledger: /electric|power/i, dir: 'OUT' },
  { key: 'Interest', desc: /\b(interest|int\.?\s*(pd|paid|coll|debit)|intt)\b/i, ledger: /interest/i },
  { key: 'Bank charges', desc: /\b(chgs?|charges?|sms\s*chg|service\s*charge|processing\s*fee|annual\s*fee|amc)\b/i, ledger: /bank.*(charge|fee)|charges|commission/i, dir: 'OUT' },
  { key: 'Tax', desc: /\b(gst|tds|income\s*tax|advance\s*tax|professional\s*tax|pf|epf|esi)\b/i, ledger: /\b(gst|tds|tax|pf|esi)\b/i, dir: 'OUT' },
  { key: 'Transport', desc: /\b(freight|transport|courier|lorry|logistics|carriage)\b/i, ledger: /freight|transport|carriage|courier/i, dir: 'OUT' },
  { key: 'Fuel', desc: /\b(fuel|petrol|diesel|hpcl|bpcl|iocl)\b/i, ledger: /fuel|petrol|diesel/i, dir: 'OUT' },
  { key: 'Telephone / internet', desc: /\b(airtel|jio|vodafone|bsnl|broadband|telephone|recharge|internet)\b/i, ledger: /telephone|phone|internet|communication|mobile/i, dir: 'OUT' },
  { key: 'Insurance', desc: /\b(insurance|lic|premium)\b/i, ledger: /insurance/i, dir: 'OUT' },
  { key: 'Loan / EMI', desc: /\b(emi|loan|instalment|installment)\b/i, ledger: /loan|emi/i },
  { key: 'Repairs', desc: /\b(repairs?|maintenance)\b/i, ledger: /repair|maintenance/i, dir: 'OUT' },
];
const PERSONAL = /\b(personal|self|owner|drawings?|home|family|domestic|household)\b/i;

const findLedger = (list: LedgerRef[], re: RegExp) => list.find(l => re.test(l.name));
const findType = (types: EntryType[], name: string) => types.find(t => t.name.trim().toLowerCase() === name.toLowerCase());

export function suggestRow(r: ImportRow, ctx: SuggestCtx): Suggestion | null {
  const desc = `${r.description} ${r.reference}`.trim();
  if (!desc) return null;
  const dir = r.credit > 0 && !(r.debit > 0) ? 'IN' : r.debit > 0 && !(r.credit > 0) ? 'OUT' : null;

  // Own account: money moving between this company's own accounts is INTERNAL, never a customer or supplier.
  const own = squash(ctx.ownName ?? '');
  if (own.length >= 5 && squash(desc).includes(own)) {
    const t = findType(ctx.types, 'INTERNAL');
    if (t) return { typeId: t.id, ledgerId: t.ledgerId || undefined, party: ctx.ownName, reason: 'Own company name: transfer between your own accounts' };
  }
  // 1 + 2: a registered company (GSTIN first, then name) -> receivable for customers, payable for suppliers
  const hit = matchParty(desc, ctx.parties, dir);
  if (hit) {
    const ledger = hit.party.kind === 'Customer' ? ctx.receivable : ctx.payable;
    const t = findType(ctx.types, hit.party.kind === 'Customer' ? 'CUSTOMER' : 'SUPPLIER');
    return { party: hit.party.name, ledgerId: ledger?.id, typeId: t && typeFits(t, dir) ? t.id : undefined, reason: `${hit.how}${ledger ? ` → ${ledger.name}` : ''}` };
  }
  // 3: a name from your Others list (its kind is a Type)
  const flat = squash(desc);
  const other = ctx.others.find(o => squash(o.name).length >= 4 && flat.includes(squash(o.name)));
  if (other) {
    const t = findType(ctx.types, other.kind);
    return { party: other.name, typeId: t?.id, ledgerId: t?.ledgerId || undefined, reason: `Matches ${other.name} (${other.kind})` };
  }
  // 4: keywords -> an existing ledger of that kind
  const pool = dir === 'IN' ? [...ctx.income, ...ctx.expense] : [...ctx.expense, ...ctx.income];
  for (const rule of RULES) {
    if (rule.dir && dir && rule.dir !== dir) continue;
    if (!rule.desc.test(desc)) continue;
    const l = findLedger(pool, rule.ledger);
    if (l) {
      const t = [findType(ctx.types, rule.key), rule.key === 'Salary' ? findType(ctx.types, 'SALARY') : undefined, findType(ctx.types, dir === 'IN' ? 'INCOME' : 'EXPENSE')]
        .find(x => x && typeFits(x, dir));
      return { ledgerId: l.id, typeId: t?.id, reason: `Looks like ${rule.key} → ${l.code} ${l.name}` };
    }
  }
  // 5: personal
  if (PERSONAL.test(desc)) {
    const t = findType(ctx.types, 'PERSONAL');
    if (t) return { typeId: t.id, ledgerId: t.ledgerId || undefined, reason: 'Looks personal' };
  }
  return null;
}

/** Fills only what is still empty on each row. */
export function suggestRows(rows: ImportRow[], ctx: SuggestCtx): ImportRow[] {
  return rows.map(r => {
    if (r.ledgerId && r.typeId) return r;
    const s = suggestRow(r, ctx);
    if (!s) return r;
    const next: ImportRow = { ...r };
    let used = false;
    if (!r.party && s.party) { next.party = s.party; used = true; }
    if (!r.typeId && s.typeId) { next.typeId = s.typeId; used = true; }
    if (!r.ledgerId && s.ledgerId) { next.ledgerId = s.ledgerId; used = true; }
    if (!next.ledgerId && next.typeId) next.ledgerId = ctx.types.find(t => t.id === next.typeId)?.ledgerId ?? '';
    if (used) next.auto = s.reason;
    return next;
  });
}
