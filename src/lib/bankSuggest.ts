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
  /** Entries you saved earlier (the learning material): the same payer / payee gets the same Type, Ledger and Party. */
  history?: HistoryItem[];
}
export interface HistoryItem { description: string; typeName?: string; party?: string; direction?: 'IN' | 'OUT' }
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


/* ---------- who is on the other side? (read from the way Indian banks write the narration) ---------- */
export interface Counterparty { name: string; key: string; kind: 'neft' | 'mb' | 'upi' | 'imps' | 'clg' | 'ift'; business: boolean }
const BIZ = /\b(ENGINEERING|ENGINEERS?|WORKS|TOOLS?|INDUSTR(?:Y|IES)|ENTERPRISES?|TRADERS?|TRADING|PVT|PRIVATE|LTD|LIMITED|LLP|CO|COMPANY|SOLUTIONS?|ASSOCIATES|MACHIN(?:E|ES|ING)|AUTOMATION|HARDWARE|AGENCIES|CORPORATION|SERVICES|FABRICATORS?|FOUNDRY|PATTERN|PRECISION|SYSTEMS|TECHNOLOGIES|MOTORS|STEELS?|METALS?|PLASTICS?|POLYMERS?|MANUFACTURING|EXPORTS?|IMPORTS?|SALES|AGENCY|MARKETING|INFRA|CONSTRUCTIONS?|ELECTRICALS?|ELECTRONICS|CASTINGS?|FORGINGS?|DIES|MOULDS?|MOLDS?)\b/i;
const tidy = (v: string) => v.replace(/\s+/g, ' ').replace(/^[\s\-/:,]+|[\s\-/:,.]+$/g, '').trim();
const isBiz = (n: string) => BIZ.test(n);

export function counterparty(desc: string, dir: 'IN' | 'OUT' | null): Counterparty | null {
  const d = desc.replace(/\s+/g, ' ').trim();
  let m: RegExpExecArray | null;
  // NEFT / RTGS:  NEFT Cr-<UTR>-<IFSC>-<NAME>--/ATTN/...
  if ((m = /\b(?:NEFT|RTGS)\s*(?:CR|DR)?[-\s]+[A-Z0-9]+[-\s]+[A-Z]{4}0[A-Z0-9]{6}[-\s]+(.+)$/i.exec(d))) {
    const name = tidy(m[1].split(/--|\/|\s-\s/)[0]);
    if (name) return { name, key: squash(name), kind: 'neft', business: isBiz(name) };
  }
  // Mobile banking:  MB/<acct>/<REMITTER>/<acct>/<BENEFICIARY>/<bank>
  if ((m = /^MB\/\d+\/([^/]+)\/[^/]*\/([^/]+)\//i.exec(d))) {
    const name = tidy(dir === 'OUT' ? m[2] : m[1]);
    if (name) return { name, key: squash(name), kind: 'mb', business: isBiz(name) };
  }
  // UPI:  UPI/CR|DR/<ref>/<NAME>/<BANK>/<handle>
  if ((m = /^UPI\/(?:CR|DR)\/[^/]*\/([^/]+)\/([A-Z]{3,5})\//i.exec(d))) {
    const name = tidy(m[1]);
    if (name) return { name, key: squash(name), kind: 'upi', business: isBiz(name) };
  }
  // IMPS:  IB-IMPS-DR/<NICKNAME>/<BANK>/**<last digits>
  if ((m = /IMPS-(?:DR|CR)\/([^/]+)\/([A-Z]{3,5})\/\**(\d+)/i.exec(d))) {
    const name = tidy(m[1]);
    return { name, key: `${squash(name)}${squash(m[2])}${m[3]}`, kind: 'imps', business: isBiz(name) };
  }
  // Cheque clearing:  By Clg: <bank + account>, <NAME>
  if ((m = /\bBy\s*Clg\s*:?\s*(.*)$/i.exec(d))) {
    const parts = m[1].split(',').map(tidy).filter(Boolean);
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    const name = last && /[A-Z]{3}/i.test(last) && !/^[\d\s]+$/.test(last) ? last : '';
    return { name, key: name ? squash(name) : '', kind: 'clg', business: !!name && isBiz(name) };
  }
  // Same-bank transfer:  IB IFT <no> <acct> <NAME> Online Transaction OTH-...
  if ((m = /IB\s*(?:IFT|ITG)\s*\d+\s+\d+\s+(.+?)(?:\s+Online\b|\s+OTH-|$)/i.exec(d))) {
    const name = tidy(m[1]);
    if (name) return { name, key: squash(name), kind: 'ift', business: isBiz(name) };
  }
  return null;
}

/* ---------- memory: what you chose for the same payer / payee before ---------- */
interface Mem { typeName?: string; party?: string; n: number }
const stripType = (d: string, types: EntryType[]) => {
  const i = d.indexOf(' - ');
  if (i > 0 && types.some(t => t.name.trim().toLowerCase() === d.slice(0, i).trim().toLowerCase())) return { typeName: d.slice(0, i).trim() as string | undefined, rest: d.slice(i + 3) };
  return { typeName: undefined as string | undefined, rest: d };
};
function buildMemory(items: HistoryItem[], types: EntryType[]): Map<string, Mem> {
  const votes = new Map<string, Map<string, Mem>>();
  for (const h of items) {
    const { typeName: fromDesc, rest } = stripType(h.description || '', types);
    const typeName = h.typeName || fromDesc;
    if (!typeName) continue;
    const cp = counterparty(rest, h.direction ?? null);
    if (!cp || !cp.key) continue;
    const slot = votes.get(cp.key) ?? new Map<string, Mem>();
    const id = `${typeName}|${h.party ?? ''}`;
    const cur = slot.get(id) ?? { typeName, party: h.party || undefined, n: 0 };
    cur.n++; slot.set(id, cur); votes.set(cp.key, slot);
  }
  const out = new Map<string, Mem>();
  votes.forEach((slot, key) => { out.set(key, Array.from(slot.values()).sort((a, b) => b.n - a.n)[0]); });
  return out;
}
function recall(mem: Map<string, Mem>, cp: Counterparty | null): Mem | null {
  if (!cp || !cp.key) return null;
  const exact = mem.get(cp.key);
  if (exact) return exact;
  let hit: Mem | null = null;
  mem.forEach((v, k) => { if (!hit && Math.min(k.length, cp.key.length) >= 8 && (k.startsWith(cp.key) || cp.key.startsWith(k))) hit = v; });
  return hit;
}

/** A short bank nickname / truncated name ("CRESTENGINEE", "Vinothkum") that is the start of exactly one registered name. */
function prefixParty(cp: Counterparty | null, parties: PartyRef[], dir: 'IN' | 'OUT' | null): PartyRef | null {
  if (!cp || !cp.name) return null;
  const k = squash(cp.name);
  if (k.length < 6) return null;
  const hits = parties.filter(p => { const f = squash(p.name); return f.length >= 6 && (f.startsWith(k) || k.startsWith(f)); });
  const names = new Set(hits.map(h => squash(h.name)));
  return names.size === 1 ? pickByDirection(hits, dir) : null;
}

interface KeywordRule { key: string; desc: RegExp; ledger: RegExp; dir?: 'IN' | 'OUT' }
const RULES: KeywordRule[] = [
  { key: 'Salary', desc: /\b(salary|salaries|sal|wages?|payroll|stipend|bonus)\b/i, ledger: /salar|wage|payroll|staff|employee/i, dir: 'OUT' },
  { key: 'Rent', desc: /\brent\b/i, ledger: /\brent/i },
  { key: 'Electricity', desc: /\b(eb|tneb|tangedco|electricity|power\s*bill|bescom|msedcl)\b/i, ledger: /electric|power/i, dir: 'OUT' },
  { key: 'Interest', desc: /\b(interest|int\.?\s*(pd|paid|coll|debit)|intt|capitalized)\b/i, ledger: /interest/i },
  { key: 'Bank charges', desc: /\b(chgs?|charges?|sms\s*(chg|alert)|service\s*charge|processing\s*fee|annual\s*fee|amc|(imps|neft|rtgs|upi)\s*sc|debit\s*card\s*(fee|charges?)|atm\s*(fee|chg))\b/i, ledger: /bank.*(charge|fee)|charges|commission/i, dir: 'OUT' },
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

const INTERNAL_WORDS = /\b(drawdown\s+from\s+casa|internal\s+transfer|own\s+account|self\s+transfer|inter\s*account|sweep)\b/i;
const withoutOwn = (desc: string, ownName?: string) => {
  const w = (ownName ?? '').trim().split(/\s+/).filter(Boolean);
  if (w.join('').length < 5) return desc;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try { return desc.replace(new RegExp(w.map(esc).join('[\\s\\-/]*'), 'gi'), ' '); } catch { return desc; }
};

export function suggestRow(r: ImportRow, ctx: SuggestCtx, mem?: Map<string, Mem>): Suggestion | null {
  const desc = `${r.description} ${r.reference}`.trim();
  if (!desc) return null;
  const dir = r.credit > 0 && !(r.debit > 0) ? 'IN' : r.debit > 0 && !(r.credit > 0) ? 'OUT' : null;
  const memory = mem ?? buildMemory(ctx.history ?? [], ctx.types);
  const cp = counterparty(r.description, dir);
  const own = squash(ctx.ownName ?? '');
  const cpIsOwn = !!cp && cp.name !== '' && own.length >= 5 && squash(cp.name).includes(own);
  const descHasOwn = own.length >= 5 && squash(desc).includes(own);
  const recv = (t: EntryType | undefined, party: PartyRef['kind'] | 'Customer' | 'Supplier') => (party === 'Customer' ? ctx.receivable : ctx.payable)?.id ?? t?.ledgerId ?? undefined;

  // 0: own account. "ARGUS TECHNOLOGIES" as the *other* side of a payment from a customer is NOT a transfer:
  //    only when we are the counterparty (or nobody else is named) is it a move between our own accounts.
  if (descHasOwn && (cpIsOwn || !cp || !cp.name)) {
    const t = findType(ctx.types, 'INTERNAL');
    if (t) return { typeId: t.id, ledgerId: t.ledgerId || undefined, party: ctx.ownName, reason: 'Own company name: transfer between your own accounts' };
  }
  const text = withoutOwn(desc, ctx.ownName);

  // 1 + 2: a registered company: GSTIN, then the name in the narration, then the bank's short form of it
  const hit = (cp && cp.name ? matchParty(cp.name, ctx.parties, dir) : null) ?? matchParty(text, ctx.parties, dir);
  const pre = hit ? null : prefixParty(cp, ctx.parties, dir);
  const found = hit ? { party: hit.party, how: hit.how } : pre ? { party: pre, how: `${cp!.name} is the bank's short form of ${pre.name}` } : null;
  if (found) {
    const customer = found.party.kind === 'Customer';
    const ledger = customer ? ctx.receivable : ctx.payable;
    const t = findType(ctx.types, customer ? 'CUSTOMER' : 'SUPPLIER');
    return { party: found.party.name, ledgerId: ledger?.id, typeId: t && typeFits(t, dir) ? t.id : undefined, reason: `${found.how}${ledger ? ` → ${ledger.name}` : ''}` };
  }

  // 3: learned from what you saved or chose before for the same payer / payee
  const seen = recall(memory, cp);
  if (seen && seen.typeName) {
    const t = findType(ctx.types, seen.typeName);
    if (t && typeFits(t, dir)) {
      const nm = t.name.toUpperCase();
      const led = nm === 'CUSTOMER' ? ctx.receivable?.id : nm === 'SUPPLIER' ? ctx.payable?.id : t.ledgerId || undefined;
      return { typeId: t.id, ledgerId: led, party: seen.party, reason: `Same as ${seen.n > 1 ? seen.n + ' earlier entries' : 'an earlier entry'} for ${cp?.name || 'this payer'}: ${t.name}` };
    }
  }

  // 4: a name from your Others list (its kind is a Type)
  const flat = squash(text);
  const other = ctx.others.find(o => squash(o.name).length >= 4 && flat.includes(squash(o.name)));
  if (other) {
    const t = findType(ctx.types, other.kind);
    return { party: other.name, typeId: t?.id, ledgerId: t?.ledgerId || undefined, reason: `Matches ${other.name} (${other.kind})` };
  }

  // 5: the narration says what it is
  if (INTERNAL_WORDS.test(desc)) {
    const t = findType(ctx.types, 'INTERNAL');
    if (t) return { typeId: t.id, ledgerId: t.ledgerId || undefined, reason: 'The bank calls this an internal transfer' };
  }
  const pool = dir === 'IN' ? [...ctx.income, ...ctx.expense] : [...ctx.expense, ...ctx.income];
  for (const rule of RULES) {
    if (rule.dir && dir && rule.dir !== dir) continue;
    if (!rule.desc.test(desc)) continue;
    const l = findLedger(pool, rule.ledger);
    const t = [findType(ctx.types, rule.key), rule.key === 'Salary' ? findType(ctx.types, 'SALARY') : undefined, findType(ctx.types, dir === 'IN' ? 'INCOME' : 'EXPENSE')]
      .find(x => x && typeFits(x, dir));
    if (l) return { ledgerId: l.id, typeId: t?.id, reason: `Looks like ${rule.key} → ${l.code} ${l.name}` };
    if (t && (rule.key === 'Bank charges' || rule.key === 'Interest')) return { typeId: t.id, ledgerId: t.ledgerId || undefined, reason: `Looks like ${rule.key} (no matching ledger yet: choose one)` };
  }

  // 6: not registered, but the shape of the payment says who it is
  if (cp && dir === 'IN' && (cp.kind === 'clg' || (cp.business && cp.kind !== 'ift') || (cp.kind === 'ift' && cp.business))) {
    const t = findType(ctx.types, 'CUSTOMER');
    if (t && typeFits(t, dir)) return { typeId: t.id, ledgerId: recv(t, 'Customer'), party: cp.name || undefined, reason: cp.kind === 'clg' && !cp.name ? 'Cheque deposited (By Clg): normally a customer payment' : `${cp.name} paid you but is not in your customer list yet` };
  }
  if (cp && dir === 'OUT' && cp.business && cp.kind !== 'ift') {
    const t = findType(ctx.types, 'SUPPLIER');
    if (t && typeFits(t, dir)) return { typeId: t.id, ledgerId: recv(t, 'Supplier'), party: cp.name, reason: `You paid ${cp.name}, who is not in your supplier list yet` };
  }

  // 7: personal
  if (PERSONAL.test(desc)) {
    const t = findType(ctx.types, 'PERSONAL');
    if (t) return { typeId: t.id, ledgerId: t.ledgerId || undefined, reason: 'Looks personal' };
  }
  return null;
}

/** Fills only what is still empty on each row. What you chose yourself on other rows of this file is learned too. */
export function suggestRows(rows: ImportRow[], ctx: SuggestCtx): ImportRow[] {
  const typeName = (id: string) => ctx.types.find(t => t.id === id)?.name;
  const mine: HistoryItem[] = rows.filter(r => r.typeId && !r.auto).map(r => ({ description: r.description, typeName: typeName(r.typeId), party: r.party || undefined, direction: r.credit > 0 && !(r.debit > 0) ? 'IN' : 'OUT' }));
  const mem = buildMemory([...(ctx.history ?? []), ...mine], ctx.types);
  return rows.map(r => {
    if (r.ledgerId && r.typeId) return r;
    const s = suggestRow(r, ctx, mem);
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
