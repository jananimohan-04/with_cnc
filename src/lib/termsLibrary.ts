// Reusable terms & conditions templates for quotations. Stored in this browser, per company
// (no database table yet). The first time a company opens the library it is seeded with three
// common templates; after that the stored list, even if emptied, is never re-seeded.

export interface TermsTemplate { id: string; title: string; body: string; createdAt: string }
export interface TermsStore { templates: TermsTemplate[]; defaultId: string | null }

export const STANDARD_TERMS = [
  '1. Prices are ex-works unless specifically agreed in writing.',
  '2. Delivery lead time will be confirmed upon receipt of formal purchase order.',
  '3. Taxes (GST) will be charged extra as applicable at the time of invoicing.',
  '4. Payment terms: 50% advance along with PO, balance 50% prior to dispatch.',
  '5. This quotation is valid for 15 days from the date of issue.',
  '6. ARGUS CNC warranty applies as per standard manufacturing defect guidelines.',
].join('\n');

const SEEDS: { id: string; title: string; body: string }[] = [
  { id: 'seed-standard', title: 'Standard Commercial Terms', body: STANDARD_TERMS },
  { id: 'seed-advance', title: '100% Advance Payment Terms', body: [
    '1. 100% payment in advance along with confirmed purchase order.',
    '2. Goods once sold will not be taken back or exchanged.',
    '3. GST and all applicable statutory levies will be charged extra.',
    '4. Validity of quotation: 7 days due to material price volatility.'].join('\n') },
  { id: 'seed-net30', title: 'Credit Net 30 Days', body: [
    '1. Payment within 30 days from the invoice date.',
    '2. Interest @ 18% p.a. will be levied on overdue payments.',
    '3. Quotation valid for 30 days.',
    '4. Freight and insurance extra as actuals.'].join('\n') },
];

const key = (companyId: string | null | undefined) => `argus.terms.${companyId ?? 'all'}`;
const seeded = (): TermsStore => ({
  templates: SEEDS.map((s, i) => ({ ...s, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() })),
  defaultId: SEEDS[0].id,
});

export function loadTerms(companyId: string | null | undefined): TermsStore {
  try {
    const raw = localStorage.getItem(key(companyId));
    if (raw === null) return seeded();
    const v = JSON.parse(raw);
    const templates: TermsTemplate[] = Array.isArray(v?.templates)
      ? v.templates.filter((t: TermsTemplate) => t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.body === 'string') : [];
    const defaultId = templates.some(t => t.id === v?.defaultId) ? v.defaultId : null;
    return { templates, defaultId };
  } catch { return seeded(); }
}

export function saveTerms(companyId: string | null | undefined, s: TermsStore): boolean {
  try { localStorage.setItem(key(companyId), JSON.stringify(s)); return true; } catch { return false; }
}

/** Text a new quotation starts with: the default template, else the built-in standard terms. */
export function defaultTermsText(companyId: string | null | undefined): string {
  const s = loadTerms(companyId);
  return s.templates.find(t => t.id === s.defaultId)?.body ?? STANDARD_TERMS;
}

export type TermsErrors = Partial<Record<'title' | 'body', string>>;
export function validateTemplate(title: string, body: string, existing: TermsTemplate[], editingId?: string): TermsErrors {
  const e: TermsErrors = {};
  const t = title.trim();
  if (!t) e.title = 'Template name is required';
  else if (existing.some(x => x.id !== editingId && x.title.trim().toLowerCase() === t.toLowerCase())) e.title = 'A template with this name already exists';
  if (!body.trim()) e.body = 'Terms text is required';
  return e;
}

export function addTemplate(s: TermsStore, title: string, body: string, makeDefault: boolean, id: string): TermsStore {
  const t: TermsTemplate = { id, title: title.trim(), body: body.trim(), createdAt: new Date().toISOString() };
  return { templates: [...s.templates, t], defaultId: makeDefault || s.defaultId === null ? id : s.defaultId };
}

export function updateTemplate(s: TermsStore, id: string, title: string, body: string, makeDefault: boolean): TermsStore {
  return {
    templates: s.templates.map(t => (t.id === id ? { ...t, title: title.trim(), body: body.trim() } : t)),
    defaultId: makeDefault ? id : s.defaultId,
  };
}

/** Removing the default hands the role to the first remaining template (or none). */
export function removeTemplate(s: TermsStore, id: string): TermsStore {
  const templates = s.templates.filter(t => t.id !== id);
  return { templates, defaultId: s.defaultId === id ? templates[0]?.id ?? null : s.defaultId };
}

export function filterTemplates(list: TermsTemplate[], q: string): TermsTemplate[] {
  const t = q.trim().toLowerCase();
  return t ? list.filter(x => x.title.toLowerCase().includes(t) || x.body.toLowerCase().includes(t)) : list;
}
