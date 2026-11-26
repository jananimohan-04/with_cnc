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

/* ---------- memory: what you chose for the same description, payer / payee, or company before ---------- */
interface Mem { typeName?: string; party?: string; explicit: boolean; n: number; rank: number }
interface CompanyEntry { party: string; norm: string; squashed: string }
interface HistoryMemory {
  byDesc: Map<string, Mem>;
  byDescAny: Map<string, Mem>;
  byPattern: Map<string, Mem>;
  byPatternAny: Map<string, Mem>;
  byCompany: Map<string, Mem>;
  byCompanyAny: Map<string, Mem>;
  byCompanySquashed: Map<string, Mem>;
  companies: CompanyEntry[];
}

const normText = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const isUnknownType = (t: string | undefined) => !t || /^unknown$/i.test(t.trim());
const isPlaceholderParty = (p: string | undefined) => !p || p === '—' || p === '-';
const dirKey = (dir: 'IN' | 'OUT' | null | undefined, key: string) => `${dir ?? ''}|${key}`;

/** A key for narrations that name nobody (salary, petrol, interest ...): the text with the numbers / dates / ids taken out. */
const textKey = (desc: string): string => squash(desc.replace(/\b\d[\d/:.-]*\b/g, ' ').replace(/\b[A-Z0-9]{10,}\b/g, ' ')).slice(0, 40);
const stripType = (d: string, types: EntryType[]) => {
  const i = d.indexOf(' - ');
  if (i > 0 && types.some(t => t.name.trim().toLowerCase() === d.slice(0, i).trim().toLowerCase())) return { typeName: d.slice(0, i).trim() as string | undefined, rest: d.slice(i + 3) };
  return { typeName: undefined as string | undefined, rest: d };
};

const findType = (types: EntryType[], name: string) => types.find(t => t.name.trim().toLowerCase() === name.trim().toLowerCase());

function recordMem(map: Map<string, Mem>, key: string, cand: Omit<Mem, 'n'>, dirMatch = true): void {
  if (!key) return;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...cand, n: 1 });
    return;
  }
  existing.n += 1;
  // Most recent explicit entry wins (`cand.rank` is already >= existing.rank because items are scanned newest-first);
  // backfill missing explicit type or company from older entries for the same key.
  if (dirMatch && !existing.explicit && cand.explicit) {
    existing.typeName = cand.typeName;
    existing.explicit = true;
    existing.rank = cand.rank;
    if (cand.party) existing.party = cand.party;
  } else {
    if (!existing.typeName && cand.typeName) {
      existing.typeName = cand.typeName;
      existing.explicit = cand.explicit;
    }
    if (!existing.party && cand.party) existing.party = cand.party;
  }
}

function buildMemory(items: HistoryItem[], types: EntryType[]): HistoryMemory {
  const byDesc = new Map<string, Mem>();
  const byDescAny = new Map<string, Mem>();
  const byPattern = new Map<string, Mem>();
  const byPatternAny = new Map<string, Mem>();
  const byCompany = new Map<string, Mem>();
  const byCompanyAny = new Map<string, Mem>();
  const byCompanySquashed = new Map<string, Mem>();
  const seenCompany = new Map<string, CompanyEntry>();

  items.forEach((h, idx) => {   // newest entries first, so most recent edit/saved entry takes precedence
    const { typeName: fromDesc, rest } = stripType(h.description || '', types);
    const rawType = (h.typeName || fromDesc || '').trim();
    if (h.typeName && isUnknownType(h.typeName)) return;
    if (fromDesc && !h.typeName && isUnknownType(fromDesc)) return;
    const matched = rawType && !isUnknownType(rawType) ? findType(types, rawType) : undefined;
    const cleanParty = !isPlaceholderParty(h.party?.trim()) ? h.party!.trim() : undefined;
    if (!matched && !cleanParty) return;

    const cand = { typeName: matched?.name, party: cleanParty, explicit: !!matched, rank: idx };
    const dir = h.direction ?? null;

    // 1. Exact normalized description keys (supports short descriptions too)
    for (const d of [rest, h.description || '']) {
      const nk = normText(d);
      if (!nk) continue;
      if (dir) recordMem(byDesc, dirKey(dir, nk), cand);
      recordMem(byDescAny, nk, cand, false);
    }

    // 2. Counterparty / structural narration key
    const cp = counterparty(rest, dir);
    const patKey = cp && cp.key ? cp.key : textKey(rest);
    if (patKey && patKey.length >= 8) {
      if (dir) recordMem(byPattern, dirKey(dir, patKey), cand);
      recordMem(byPatternAny, patKey, cand, false);
    }

    // 3. Company -> Type mapping (only when an explicit Type exists)
    if (cleanParty && matched) {
      const ck = normText(cleanParty);
      if (dir) recordMem(byCompany, dirKey(dir, ck), cand);
      recordMem(byCompanyAny, ck, cand, false);
      const sq = squash(cleanParty);
      if (sq.length >= 4) recordMem(byCompanySquashed, sq, cand, false);
      if (!seenCompany.has(ck)) seenCompany.set(ck, { party: cleanParty, norm: ck, squashed: sq });
    }
  });

  const companies = Array.from(seenCompany.values()).sort((a, b) => b.norm.length - a.norm.length || b.party.length - a.party.length);
  return { byDesc, byDescAny, byPattern, byPatternAny, byCompany, byCompanyAny, byCompanySquashed, companies };
}

function recallDirectional(exactMap: Map<string, Mem>, anyMap: Map<string, Mem>, key: string, dir: 'IN' | 'OUT' | null, types: EntryType[], allowPrefix = false): Mem | null {
  if (!key) return null;
  const pick = (m: Mem | undefined) => {
    if (!m) return null;
    if (!m.typeName) return m;
    const t = findType(types, m.typeName);
    return t && typeFits(t, dir) ? m : null;
  };
  if (dir) {
    const exactDir = pick(exactMap.get(dirKey(dir, key)));
    if (exactDir) return exactDir;
  }
  const exactAny = pick(anyMap.get(key));
  if (exactAny) return exactAny;
  if (!allowPrefix || key.length < 8) return null;

  let hit: Mem | null = null;
  const scan = (m: Map<string, Mem>, prefix?: string) => {
    m.forEach((v, k) => {
      if (hit) return;
      const rawK = prefix ? (k.startsWith(prefix) ? k.slice(prefix.length) : '') : k;
      if (rawK.length >= 8 && (rawK.startsWith(key) || key.startsWith(rawK))) hit = pick(v);
    });
  };
  if (dir) scan(exactMap, `${dir}|`);
  if (!hit) scan(anyMap);
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
const ledgerForType = (t: EntryType | undefined, ctx: SuggestCtx): string | undefined => {
  if (!t) return undefined;
  const nm = t.name.trim().toUpperCase();
  if (nm === 'CUSTOMER') return ctx.receivable?.id || t.ledgerId || undefined;
  if (nm === 'SUPPLIER') return ctx.payable?.id || t.ledgerId || undefined;
  return t.ledgerId || undefined;
};

const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function containsWholePhrase(haystack: string, phrase: string): boolean {
  const parts = phrase.trim().replace(/\s+/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  if (parts.length === 1 && parts[0].replace(/[^A-Za-z0-9]/g, '').length < 3) return false;
  try {
    return new RegExp(`(?:^|[^A-Za-z0-9])${parts.map(escRe).join('[\\s\\-/.,&]+')}(?:$|[^A-Za-z0-9])`, 'i').test(haystack);
  } catch {
    return false;
  }
}

/** Suggests Type (and Ledger) when a Company / Party name is given or recognized, referring to Manage Types, saved history, or registered parties. */
export function suggestForCompany(companyName: string, dir: 'IN' | 'OUT' | null, ctx: SuggestCtx, mem?: HistoryMemory): Suggestion | null {
  const trimmed = companyName.trim();
  if (!trimmed || isPlaceholderParty(trimmed)) return null;
  const nk = normText(trimmed);
  const sq = squash(trimmed);

  // 1. Manage Types rule for this exact company
  const other = ctx.others.find(o => normText(o.name) === nk || (sq.length >= 4 && squash(o.name) === sq));
  if (other) {
    const t = findType(ctx.types, other.kind);
    if (t && typeFits(t, dir)) {
      return { party: other.name, typeId: t.id, ledgerId: ledgerForType(t, ctx), reason: `Matches ${other.name} (${t.name})` };
    }
  }

  // 2. Existing saved transactions for this company
  const memory = mem ?? buildMemory(ctx.history ?? [], ctx.types);
  const coMem = recallDirectional(memory.byCompany, memory.byCompanyAny, nk, dir, ctx.types)
    ?? (sq.length >= 4 ? recallDirectional(memory.byCompanySquashed, memory.byCompanySquashed, sq, null, ctx.types) : null);
  if (coMem && coMem.typeName) {
    const t = findType(ctx.types, coMem.typeName);
    if (t && typeFits(t, dir)) {
      return { party: coMem.party || trimmed, typeId: t.id, ledgerId: ledgerForType(t, ctx), reason: `Matches existing entries for ${coMem.party || trimmed}: ${t.name}` };
    }
  }

  // 3. Registered Customer / Supplier
  const regMatches = ctx.parties.filter(p => normText(p.name) === nk || (sq.length >= 5 && squash(p.name) === sq));
  const reg = pickByDirection(regMatches, dir);
  if (reg) {
    const t = findType(ctx.types, reg.kind === 'Customer' ? 'CUSTOMER' : 'SUPPLIER');
    if (t && typeFits(t, dir)) {
      return { party: reg.name, typeId: t.id, ledgerId: ledgerForType(t, ctx), reason: `Registered ${reg.kind}: ${reg.name}` };
    }
  }
  return null;
}

const INTERNAL_WORDS = /\b(drawdown\s+from\s+casa|internal\s*(transfer|trans+action|trans|trf|fund\s*transfer)|inter\s*account|intra\s*bank|intra\s*transfer|self\s*(transfer|trans+action|trf)|own\s*account|sweep|contra)\b|oth[- ]*internal/i;
const withoutOwn = (desc: string, ownName?: string) => {
  const w = (ownName ?? '').trim().split(/\s+/).filter(Boolean);
  if (w.join('').length < 5) return desc;
  try { return desc.replace(new RegExp(w.map(escRe).join('[\\s\\-/]*'), 'gi'), ' '); } catch { return desc; }
};

export function suggestRow(r: ImportRow, ctx: SuggestCtx, mem?: HistoryMemory): Suggestion | null {
  const desc = `${r.description} ${r.reference}`.trim();
  const dir = r.credit > 0 && !(r.debit > 0) ? 'IN' : r.debit > 0 && !(r.credit > 0) ? 'OUT' : null;
  const memory = mem ?? buildMemory(ctx.history ?? [], ctx.types);
  if (!desc) return r.party.trim() ? suggestForCompany(r.party, dir, ctx, memory) : null;

  const cp = counterparty(r.description, dir);
  const own = squash(ctx.ownName ?? '');
  const cpIsOwn = !!cp && cp.name !== '' && own.length >= 5 && squash(cp.name).includes(own);
  const descHasOwn = own.length >= 5 && squash(desc).includes(own);
  const recv = (t: EntryType | undefined, party: PartyRef['kind'] | 'Customer' | 'Supplier') => (party === 'Customer' ? ctx.receivable : ctx.payable)?.id ?? t?.ledgerId ?? undefined;
  let rememberedParty: string | undefined;

  // 1: exact same description saved before -> autofill both Type and Company
  const stripped = stripType(r.description, ctx.types).rest;
  const descHit = recallDirectional(memory.byDesc, memory.byDescAny, normText(stripped), dir, ctx.types)
    ?? recallDirectional(memory.byDesc, memory.byDescAny, normText(r.description), dir, ctx.types);
  if (descHit) {
    if (descHit.party) rememberedParty = descHit.party;
    if (descHit.typeName) {
      const t = findType(ctx.types, descHit.typeName);
      if (t && typeFits(t, dir)) {
        return {
          typeId: t.id,
          ledgerId: ledgerForType(t, ctx),
          party: descHit.party,
          reason: `Same as ${descHit.n > 1 ? descHit.n + ' earlier entries' : 'an earlier entry'} for this description: ${t.name}`,
        };
      }
    }
  }

  // 2: own account. "ARGUS TECHNOLOGIES" as the *other* side of a payment from a customer is NOT a transfer:
  //    only when we are the counterparty (or nobody else is named) is it a move between our own accounts.
  if (descHasOwn && (cpIsOwn || !cp || !cp.name)) {
    const t = findType(ctx.types, 'INTERNAL');
    if (t) return { typeId: t.id, ledgerId: t.ledgerId || undefined, party: rememberedParty || ctx.ownName, reason: 'Own company name: transfer between your own accounts' };
  }
  const text = withoutOwn(desc, ctx.ownName);

  // 3: a name from your Manage Types (Others) list
  const flat = squash(text);
  const other = ctx.others.find(o => (cp && cp.name && normText(cp.name) === normText(o.name)) || (squash(o.name).length >= 4 && flat.includes(squash(o.name))) || containsWholePhrase(text, o.name));
  if (other) {
    const t = findType(ctx.types, other.kind);
    return { party: other.name, typeId: t?.id, ledgerId: ledgerForType(t, ctx), reason: `Matches ${other.name} (${other.kind})` };
  }

  // 4: learned from earlier entries with the same payer / payee or narration pattern
  const patHit = (cp && cp.key ? recallDirectional(memory.byPattern, memory.byPatternAny, cp.key, dir, ctx.types, true) : null)
    ?? recallDirectional(memory.byPattern, memory.byPatternAny, textKey(r.description), dir, ctx.types, true);
  if (patHit) {
    if (!rememberedParty && patHit.party) rememberedParty = patHit.party;
    if (patHit.typeName) {
      const t = findType(ctx.types, patHit.typeName);
      if (t && typeFits(t, dir)) {
        return {
          typeId: t.id,
          ledgerId: ledgerForType(t, ctx),
          party: patHit.party || rememberedParty,
          reason: `Same as ${patHit.n > 1 ? patHit.n + ' earlier entries' : 'an earlier entry'} for ${cp?.name || 'this narration'}: ${t.name}`,
        };
      }
    }
  }

  // 5: known company already present on the row or recalled from history
  const targetParty = r.party.trim() || rememberedParty;
  if (targetParty) {
    const byCo = suggestForCompany(targetParty, dir, ctx, memory);
    if (byCo) return { ...byCo, party: byCo.party || targetParty };
  }

  // 6: a company name from existing saved data appearing in the counterparty or narration
  const cpCompany = cp && cp.name
    ? memory.companies.find(c => c.norm === normText(cp.name) || (c.squashed.length >= 4 && c.squashed === squash(cp.name)))
    : undefined;
  const textCompany = cpCompany ?? memory.companies.find(c => containsWholePhrase(text, c.party));
  if (textCompany) {
    const byCo = suggestForCompany(textCompany.party, dir, ctx, memory);
    if (byCo) return { ...byCo, party: rememberedParty || byCo.party || textCompany.party };
  }

  // 7: a registered company: GSTIN, then the name in the narration, then the bank's short form of it
  const hit = (cp && cp.name ? matchParty(cp.name, ctx.parties, dir) : null) ?? matchParty(text, ctx.parties, dir);
  const pre = hit ? null : prefixParty(cp, ctx.parties, dir);
  const found = hit ? { party: hit.party, how: hit.how } : pre ? { party: pre, how: `${cp!.name} is the bank's short form of ${pre.name}` } : null;
  if (found) {
    const histCo = suggestForCompany(found.party.name, dir, ctx, memory);
    if (histCo) return { ...histCo, party: rememberedParty || histCo.party || found.party.name };
    const customer = found.party.kind === 'Customer';
    const ledger = customer ? ctx.receivable : ctx.payable;
    const t = findType(ctx.types, customer ? 'CUSTOMER' : 'SUPPLIER');
    return { party: rememberedParty || found.party.name, ledgerId: ledger?.id, typeId: t && typeFits(t, dir) ? t.id : undefined, reason: `${found.how}${ledger ? ` → ${ledger.name}` : ''}` };
  }

  // 8: the narration says what it is
  if (INTERNAL_WORDS.test(desc)) {
    const t = findType(ctx.types, 'INTERNAL') || ctx.types.find(x => /internal/i.test(x.name));
    if (t) return { typeId: t.id, ledgerId: t.ledgerId || undefined, party: rememberedParty || 'INTERNAL TRANSFER', reason: 'The bank calls this an internal transfer' };
  }
  const pool = dir === 'IN' ? [...ctx.income, ...ctx.expense] : [...ctx.expense, ...ctx.income];
  for (const rule of RULES) {
    if (rule.dir && dir && rule.dir !== dir) continue;
    if (!rule.desc.test(desc)) continue;
    const l = findLedger(pool, rule.ledger);
    const t = [findType(ctx.types, rule.key), rule.key === 'Salary' ? findType(ctx.types, 'SALARY') : undefined, findType(ctx.types, dir === 'IN' ? 'INCOME' : 'EXPENSE')]
      .find(x => x && typeFits(x, dir));
    if (l) return { ledgerId: l.id, typeId: t?.id, ...(rememberedParty ? { party: rememberedParty } : {}), reason: `Looks like ${rule.key} → ${l.code} ${l.name}` };
    if (t && (rule.key === 'Bank charges' || rule.key === 'Interest')) return { typeId: t.id, ledgerId: t.ledgerId || undefined, ...(rememberedParty ? { party: rememberedParty } : {}), reason: `Looks like ${rule.key} (no matching ledger yet: choose one)` };
  }

  // 9: not registered, but the shape of the payment says who it is
  if (cp && dir === 'IN' && (cp.kind === 'clg' || (cp.business && cp.kind !== 'ift') || (cp.kind === 'ift' && cp.business))) {
    const t = findType(ctx.types, 'CUSTOMER');
    if (t && typeFits(t, dir)) return { typeId: t.id, ledgerId: recv(t, 'Customer'), party: rememberedParty || cp.name || undefined, reason: cp.kind === 'clg' && !cp.name ? 'Cheque deposited (By Clg): normally a customer payment' : `${cp.name} paid you but is not in your customer list yet` };
  }
  if (cp && dir === 'OUT' && cp.business && cp.kind !== 'ift') {
    const t = findType(ctx.types, 'SUPPLIER');
    if (t && typeFits(t, dir)) return { typeId: t.id, ledgerId: recv(t, 'Supplier'), party: rememberedParty || cp.name, reason: `You paid ${cp.name}, who is not in your supplier list yet` };
  }

  // 10: personal
  if (PERSONAL.test(desc)) {
    const t = findType(ctx.types, 'PERSONAL');
    if (t) return { typeId: t.id, ledgerId: t.ledgerId || undefined, ...(rememberedParty ? { party: rememberedParty } : {}), reason: 'Looks personal' };
  }

  if (rememberedParty) return { party: rememberedParty, reason: `Matches earlier entry for ${rememberedParty}` };
  return null;
}

/** Fills only what is still empty on each row. What you chose yourself on other rows of this file is learned too. */
export function suggestRows(rows: ImportRow[], ctx: SuggestCtx): ImportRow[] {
  const typeName = (id: string) => ctx.types.find(t => t.id === id)?.name;
  const mine: HistoryItem[] = rows
    .filter(r => !r.auto && (r.typeId || r.party.trim()))
    .map(r => ({ description: r.description, typeName: r.typeId ? typeName(r.typeId) : undefined, party: r.party.trim() || undefined, direction: r.credit > 0 && !(r.debit > 0) ? 'IN' : 'OUT' }));
  const mem = buildMemory([...mine, ...(ctx.history ?? [])], ctx.types);
  const unknown = ctx.types.find(t => t.name.trim().toLowerCase() === 'unknown');
  return rows.map(r0 => {
    // a row still marked UNKNOWN is tried again (new history / new choices may now explain it)
    const r: ImportRow = r0.review ? { ...r0, typeId: '', ledgerId: '', review: false, auto: undefined } : r0;
    if (r.ledgerId && r.typeId && r.party) return r;
    const s = suggestRow(r, ctx, mem);
    if (!s) {
      if (!unknown || r.typeId || r.ledgerId) return r;
      return { ...r, typeId: unknown.id, ledgerId: unknown.ledgerId || '', review: true, auto: 'Could not be worked out: marked UNKNOWN. Check it: keep it to save as UNKNOWN, or choose the right Type / Ledger.' };
    }
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
