// The Co-worker's guided entry: one question at a time ("What is the quantity?"), every question can be skipped, and when
// the last one is answered the whole record is read back for a check before it is saved.
// This file is only the logic (reading an answer, choosing the stage, the questions); the screen is in Copilot.tsx.
import { isoDateLoose } from './actions';
import { extractStageFieldsLocal } from './stageExtract';

export interface WizardField { key: string; label: string; labelTa: string; icon: string; required: boolean; example: string; /** the answers the form offers (a drop-down there) */ options?: string[] }
export interface WizardBox { id: string; name: string; nameTa: string; isNewOnly: boolean; fields: WizardField[] }

export type Answer =
  | { kind: 'value'; value: string | number }
  | { kind: 'skip' }
  | { kind: 'keep' }
  | { kind: 'invalid'; hint: string; hintTa: string };

export type Command = 'skip' | 'back' | 'cancel' | 'save' | 'no' | { edit: string } | null;

/**
 * The details that really cannot be blank: the form (or the database) refuses the record without them, so the Co-worker never
 * saves without them either. Everything else is optional or numbered automatically.
 */
export const HARD_REQUIRED: Record<string, string[]> = {
  enquiry: ['customer', 'part_name'],
  quotation: ['price'],
  inward: ['quantity', 'price'],        // the Inward form: "a purchase price is never assumed"
  finished_goods: ['quantity'],
  rejected: ['quantity', 'reason'],
  dc: ['quantity'],
  invoice: ['price'],                   // an invoice is never priced silently at zero
};

const NUMBER_KEYS = new Set(['quantity', 'price', 'amount', 'received_qty', 'rejected_qty', 'dispatch_qty', 'fg_qty', 'discount', 'gst']);
const PERCENT_KEYS = new Set(['discount', 'gst']);
const DATE_KEYS = new Set(['delivery_date', 'due_date', 'order_date', 'inward_date', 'invoice_date']);
export const fieldKind = (key: string): 'number' | 'date' | 'text' => (NUMBER_KEYS.has(key) ? 'number' : DATE_KEYS.has(key) ? 'date' : 'text');

// ---------------------------------------------------------------- numbers ("50", "1,200", "rs 120", "fifty", "two hundred and fifty")
const ONES: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

export function numberFrom(text: string): number | null {
  const t = text.toLowerCase().replace(/[₹,]/g, '').replace(/\brs\.?\b/g, ' ');
  const d = /(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|k|thousand)?/.exec(t);
  if (d) {
    let n = Number(d[1]);
    if (d[2]) n *= /lakh|lac/.test(d[2]) ? 100000 : 1000;
    return Number.isFinite(n) ? n : null;
  }
  // words
  const words = t.replace(/[-]/g, ' ').split(/[^a-z]+/).filter(Boolean);
  let total = 0; let current = 0; let seen = false;
  for (const w of words) {
    if (w in ONES) { current += ONES[w]; seen = true; }
    else if (w in TENS) { current += TENS[w]; seen = true; }
    else if (w === 'hundred' || w === 'hundreds') { current = (current || 1) * 100; seen = true; }
    else if (w === 'thousand') { total += (current || 1) * 1000; current = 0; seen = true; }
    else if (w === 'lakh' || w === 'lac' || w === 'lakhs') { total += (current || 1) * 100000; current = 0; seen = true; }
    else if (w === 'a' || w === 'and' || w === 'rupees' || w === 'rupee' || w === 'only' || w === 'pieces' || w === 'pcs' || w === 'nos' || w === 'is' || w === 'it' || w === 'the') { /* filler */ }
    else if (seen) break;
  }
  return seen ? total + current : null;
}

// ---------------------------------------------------------------- dates ("14 November 2026", "tomorrow", "next friday", "in 10 days", "after 2 weeks")
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function dateFrom(text: string, now: Date = new Date()): string {
  const t = text.toLowerCase().trim();
  if (!t) return '';
  const abs = isoDateLoose(text.trim());
  if (abs) return abs;
  const add = (days: number) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days); return ymd(d); };
  if (/\bday after tomorrow\b/.test(t)) return add(2);
  if (/\btomorrow\b/.test(t)) return add(1);
  if (/\btoday\b/.test(t)) return add(0);
  let m = /\b(?:in|after|within)?\s*(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten)\s*(day|week|month)s?\b/.exec(t);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : m[1] === 'a' ? 1 : (ONES[m[1]] ?? 0);
    if (n > 0) return add(m[2] === 'month' ? n * 30 : m[2] === 'week' ? n * 7 : n);
  }
  if (/\bnext week\b/.test(t)) return add(7);
  if (/\bnext month\b/.test(t)) return add(30);
  m = /\b(?:next\s+|this\s+|coming\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(t);
  if (m) {
    let diff = DAYS.indexOf(m[1]) - now.getDay();
    if (diff <= 0) diff += 7;
    return add(diff);
  }
  // "14 november" (no year): the next one that is not in the past
  const MON = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  m = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MON})[a-z]*`, 'i').exec(t) || null;
  const m2 = m ? null : new RegExp(`(${MON})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i').exec(t);
  const dayNo = m ? Number(m[1]) : m2 ? Number(m2[2]) : 0;
  const monTxt = m ? m[2] : m2 ? m2[1] : '';
  if (dayNo && monTxt) {
    const mo = MON.split('|').indexOf(monTxt.slice(0, 3).toLowerCase());
    for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
      const iso = isoDateLoose(`${dayNo} ${MON.split('|')[mo]} ${y}`);
      if (iso && iso >= ymd(now)) return iso;
    }
  }
  return '';
}

// ---------------------------------------------------------------- reading one answer
const SKIP = /^(?:skip|skip it|next|pass|leave it|leave|leave it blank|blank|none|nil|nothing|no|empty|n\/a|na|not now|later|illa|இல்லை|தவிர்|அடுத்து|வேண்டாம்)$/i;
const KEEP = /^(?:same|keep|keep it|keep same|as it is|as is|ok|okay|correct|yes|right|fine|சரி|ஆம்|அதே)$/i;

export function parseAnswer(field: WizardField, textRaw: string, prefill?: string | number | null, now: Date = new Date()): Answer {
  const text = textRaw.trim().replace(/[.!?]+$/g, '').trim();
  if (!text) return { kind: 'invalid', hint: 'I did not hear anything. Say the answer, or say skip.', hintTa: 'எதுவும் கேட்கவில்லை. பதிலைச் சொல்லுங்கள், அல்லது skip என்று சொல்லுங்கள்.' };
  if (SKIP.test(text)) return { kind: 'skip' };
  const hasPrefill = prefill !== undefined && prefill !== null && String(prefill) !== '';
  if (KEEP.test(text)) return hasPrefill ? { kind: 'keep' } : { kind: 'skip' };

  if (field.options?.length) {
    const hit = matchOption(field.key, text, field.options);
    if (!hit) return { kind: 'invalid', hint: `Please choose one: ${field.options.join(', ')}. Or say skip.`, hintTa: `ஒன்றைத் தேர்ந்தெடுக்கவும்: ${field.options.join(', ')}. அல்லது skip.` };
    return { kind: 'value', value: hit };
  }

  const kind = fieldKind(field.key);
  if (kind === 'number') {
    const n = numberFrom(text);
    if (n === null || n < 0) return { kind: 'invalid', hint: `I need a number for ${field.label.toLowerCase()}, for example ${field.example}. Or say skip.`, hintTa: `${field.labelTa}-க்கு ஒரு எண் தேவை, எ.கா: ${field.example}. அல்லது skip என்று சொல்லுங்கள்.` };
    if (PERCENT_KEYS.has(field.key) && n > 100) return { kind: 'invalid', hint: `${field.label} must be between 0 and 100 percent. Or say skip.`, hintTa: `${field.labelTa} 0 முதல் 100 வரை இருக்க வேண்டும். அல்லது skip.` };
    return { kind: 'value', value: n };
  }
  if (kind === 'date') {
    const d = dateFrom(text, now);
    if (!d) return { kind: 'invalid', hint: `I could not read that date. Say it like 14 November 2026, tomorrow, or in 10 days. Or say skip.`, hintTa: 'அந்தத் தேதியைப் புரிந்துகொள்ள முடியவில்லை. "14 November 2026", "tomorrow" அல்லது "in 10 days" என்று சொல்லுங்கள். அல்லது skip.' };
    return { kind: 'value', value: d };
  }
  if (field.key === 'validity') {
    const n = numberFrom(text);
    if (n === null) return { kind: 'invalid', hint: 'How many days is it valid? For example 30 days. Or say skip.', hintTa: 'எத்தனை நாட்கள் செல்லுபடியாகும்? எ.கா: 30 days. அல்லது skip.' };
    const unit = /week/i.test(text) ? 'Weeks' : /month/i.test(text) ? 'Months' : 'Days';
    return { kind: 'value', value: `${n} ${unit}` };
  }
  return { kind: 'value', value: text.replace(/^(?:it(?:'s| is)|is|the .{1,24}? is|name is|number is)\s+/i, '').trim() || text };
}

/** The word that must be in a sentence for a detail to count as "named" (a bare "60" is only ever the answer to the open question). */
const NAMED_BY: Record<string, RegExp> = {
  customer: /\b(?:customer|company|party|client)\b|கஸ்டமர்|கம்பெனி/i,
  part_name: /\b(?:part|product|item|material)\b|பார்ட்|பொருள்/i,
  quantity: /\b(?:qty|quantity|quantities|pcs|pieces|nos|units|numbers)\b|அளவு|எண்ணிக்கை/i,
  received_qty: /\b(?:received|qty|quantity|pcs|pieces)\b/i,
  price: /\b(?:price|prices|rate|cost|value|rs|rupees)\b|₹|விலை|தொகை/i,
  amount: /\b(?:amount|total|bill)\b/i,
  delivery_date: /\b(?:date|due|deliver|delivery)\b/i,
  order_date: /\b(?:order)\b.*\bdate\b|\bdate\b.*\border\b/i,
  inward_date: /\b(?:inward)\b.*\bdate\b|\bdate\b.*\binward\b/i,
  invoice_date: /\b(?:invoice)\b.*\bdate\b|\bdate\b.*\binvoice\b/i,
  discount: /\bdiscount\b/i,
  gst: /\bgst\b/i,
  reference_no: /\b(?:reference|ref)\b/i,
  eway_bill: /\b(?:e-?way|eway)\b/i,
  place_of_supply: /\bsupply\b/i,
  packaging: /\bpack(?:ing|aging)\b/i,
  due_date: /\b(?:date|due|payment)\b/i,
  validity: /\bvalid/i,
  po_no: /\b(?:po|p\.o\.|purchase)\b/i,
  inward_no: /\b(?:inward|inw)\b/i,
  heat_no: /\b(?:heat|batch|lot)\b/i,
  batch_no: /\b(?:heat|batch|lot)\b/i,
  dc_no: /\b(?:dc|challan)\b/i,
  invoice_no: /\b(?:invoice|inv|bill)\b/i,
  vehicle_no: /./,
  reason: /\b(?:reason|defect|cause|problem)\b|காரணம்/i,
  disposition: /\b(?:disposition|action|scrap|rework|return)\b/i,
  payment_terms: /\b(?:terms|payment)\b/i,
  remarks: /\b(?:remarks?|notes?|comments?)\b|குறிப்பு/i,
};

// What a person says for a drop-down answer (the form's own list), mapped to the exact value the form uses.
const OPTION_ALIASES: Record<string, [RegExp, string][]> = {
  category: [
    [/\bno\s*dc\b|\bnodc\b|without\s*dc/i, 'NO DC'],
    [/new\s*(?:part|project)|newpart/i, 'NEW PART'],
    [/customer\s*dc|\bdc\b|customer/i, 'CUSTOMER DC'],
    [/service/i, 'SERVICE PURCHASE'],
    [/goods|purchase|material/i, 'GOODS PURCHASE'],
    [/expense/i, 'EXPENSES'],
  ],
  doc_type: [
    [/proforma|pro\s*forma/i, 'Proforma Invoice'],
    [/credit/i, 'Credit Note'],
    [/tax|sales|invoice|normal|regular/i, 'Sales Invoice'],
  ],
  disposition: [
    [/scrap/i, 'Scrap'],
    [/rework|re-?work/i, 'Rework'],
    [/return|vendor|supplier/i, 'Return to vendor'],
    [/use\s*as\s*is|accept/i, 'Use as is'],
  ],
};

export function matchOption(key: string, text: string, options: string[]): string | null {
  const t = text.toLowerCase().trim();
  const exact = options.find((o) => o.toLowerCase() === t);
  if (exact) return exact;
  for (const [re, value] of OPTION_ALIASES[key] ?? []) {
    if (re.test(t)) { const o = options.find((x) => x.toLowerCase() === value.toLowerCase()); if (o) return o; }
  }
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const byWords = [...options].sort((a, b) => b.length - a.length).find((o) => words(o).every((w) => words(t).includes(w)));
  return byWords ?? null;
}

const jsonRows = (d: unknown): any[] => {
  let arr: any = d;
  if (typeof d === 'string' && d.trim().startsWith('[')) { try { arr = JSON.parse(d); } catch { arr = null; } }
  return Array.isArray(arr) ? arr.filter((x) => x && typeof x === 'object') : [];
};

/** What the form already knows when a record is chosen (its quantity, rate, PO number, today's date ...): "same" keeps it. */
export function prefillFor(boxId: string, source: { qty?: number; value?: number; raw?: any } | null, today: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const raw = source?.raw ?? {};
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null || String(v).trim() === '') return;
    if (typeof v === 'number' && (!Number.isFinite(v) || (v === 0 && k !== 'discount'))) return;
    out[k] = typeof v === 'number' ? v : String(v).trim();
  };
  const qty = Number(source?.qty) || Number(raw.quantity) || 0;
  const lines = [...jsonRows(raw.items), ...jsonRows(raw.description)];
  const lineRate = Number(raw.unit_price) > 0 ? Number(raw.unit_price) : lines.length === 1 ? Number(lines[0].unitPrice ?? lines[0].rate ?? lines[0].price) || 0 : 0;
  const gst = Number(raw.gst_percent) > 0 ? Number(raw.gst_percent) : lines.length ? Number(lines[0].gst) || 0 : 0;
  switch (boxId) {
    case 'quotation': put('quantity', qty); put('gst', gst || 18); put('discount', 0); break;
    case 'sales_order': put('order_date', today); put('quantity', qty); put('price', lineRate); put('gst', gst || 18); break;
    case 'inward': put('inward_date', today); put('quantity', qty); put('gst', gst || 18); put('discount', 0); break;
    case 'finished_goods': put('quantity', qty); break;
    case 'dc': put('quantity', qty); put('po_no', raw.customer_po_no || raw.po_no); break;
    case 'invoice': put('invoice_date', today); put('quantity', qty); put('price', lineRate || Number(raw.unit_price) || 0); put('gst', gst || 18); put('doc_type', 'Sales Invoice'); break;
    default: break;
  }
  return out;
}

/** "quantity 50 and price 120" said while another question is open: the details that were named are taken for their own questions. */
export function namedDetails(text: string, keys: string[]): Record<string, string | number> {
  const found = extractStageFieldsLocal(text);
  const out: Record<string, string | number> = {};
  for (const k of keys) {
    const v = found[k];
    if (v === undefined || v === '') continue;
    if (!(NAMED_BY[k] ?? /./).test(text)) continue;   // the number was not given a name: it answers the open question
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------- commands
export function parseCommand(textRaw: string, fields: WizardField[], lang: 'en' | 'ta' = 'en'): Command {
  const t = textRaw.trim().replace(/[.!?]+$/g, '').toLowerCase();
  if (/^(?:back|go back|previous|undo|பின்|முந்தைய)$/.test(t)) return 'back';
  if (/^(?:cancel|stop|exit|quit|abort|cancel it|ரத்து|நிறுத்து)$/.test(t)) return 'cancel';
  if (/^(?:save|save it|confirm|submit|yes save|save now|done|finish|சேமி|சேமிக்கவும்)$/.test(t)) return 'save';
  const m = /^(?:change|edit|correct|modify|update|மாற்று)\s+(?:the\s+)?(.+)$/.exec(t);
  if (m) {
    const want = m[1].trim();
    const f = fields.find((x) => x.key.replace(/_/g, ' ') === want || x.label.toLowerCase().includes(want) || want.includes(x.key.replace(/_/g, ' ')) || x.labelTa === want);
    if (f) return { edit: f.key };
  }
  void lang;
  return null;
}

// ---------------------------------------------------------------- the stage the person means
/** "enquiry to quotation" means the quotation (the target); a single name means that stage; several names without "to" mean the last one. */
export function stageFromSpeech(text: string, boxes: { id: string; name: string; nameTa?: string }[], aliases: Record<string, RegExp>): string | null {
  const hits: { id: string; at: number }[] = [];
  for (const b of boxes) {
    const res = [aliases[b.id], new RegExp(`\\b${b.name}\\b`, 'i'), b.nameTa ? new RegExp(b.nameTa, 'i') : null].filter(Boolean) as RegExp[];
    let at = -1;
    for (const r of res) { const m = new RegExp(r.source, r.flags.replace('g', '')).exec(text); if (m && (at < 0 || m.index < at)) at = m.index; }
    if (at >= 0) hits.push({ id: b.id, at });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.at - b.at);
  if (hits.length === 1) return hits[0].id;
  // "A from B": A is what is wanted (B is where it comes from). "A to B", "A into B", "A -> B" or just a list: the last one named.
  const between = text.slice(hits[0].at, hits[1].at);
  if (/\bfrom\b/i.test(between) || /\bfrom\b/i.test(text.slice(0, hits[0].at))) return /\bfrom\b/i.test(text.slice(0, hits[0].at)) ? hits[hits.length - 1].id : hits[0].id;
  return hits[hits.length - 1].id;
}

// ---------------------------------------------------------------- the questions
const QUESTION_EN: Record<string, string> = {
  customer: 'Which customer or company is this for?',
  part_name: 'What is the part or product name?',
  quantity: 'What is the quantity?',
  price: 'What is the rate, the price per piece?',
  remarks: 'Any remarks or notes?',
  validity: 'How long is the quotation valid?',
  payment_terms: 'What are the payment terms?',
  po_no: 'What is the customer PO number?',
  delivery_date: 'What is the delivery date?',
  inward_no: 'What is the inward number?',
  heat_no: 'What is the heat or batch number?',
  received_qty: 'How many pieces were received?',
  batch_no: 'What is the batch or lot number?',
  location: 'Which bin or rack is it stored in?',
  reason: 'What is the reason for the rejection?',
  disposition: 'What should be done with them, scrap, rework or return?',
  dc_no: 'What is the delivery challan number?',
  vehicle_no: 'What is the vehicle number?',
  invoice_no: 'What is the invoice number?',
  amount: 'What is the total invoice amount?',
  due_date: 'What is the payment due date?',
  discount: 'What is the discount percent? Say zero if none.',
  gst: 'What is the GST percent?',
  order_date: 'What is the order date?',
  inward_date: 'What is the inward date?',
  invoice_date: 'What is the invoice date?',
  reference_no: 'What is the reference number, the DC or invoice number that came with it?',
  category: 'Which category is it: customer DC, no DC, new part, goods purchase, service purchase, or expenses?',
  doc_type: 'Is it a tax invoice, a proforma invoice, or a credit note?',
  eway_bill: 'What is the e-way bill number?',
  place_of_supply: 'What is the place of supply?',
  packaging: 'What are the packaging details?',
};
const QUESTION_TA: Record<string, string> = {
  customer: 'எந்த வாடிக்கையாளருக்கு?',
  part_name: 'பாகத்தின் பெயர் என்ன?',
  quantity: 'அளவு எவ்வளவு?',
  price: 'ஒரு பீஸ் விலை என்ன?',
  remarks: 'ஏதாவது குறிப்பு உண்டா?',
  validity: 'கொட்டேஷன் எவ்வளவு நாள் செல்லுபடியாகும்?',
  payment_terms: 'பணம் செலுத்தும் விதிமுறைகள் என்ன?',
  po_no: 'வாடிக்கையாளர் PO எண் என்ன?',
  delivery_date: 'டெலிவரி தேதி என்ன?',
  order_date: 'ஆர்டர் தேதி என்ன?',
  inward_date: 'இன்வார்ட் தேதி என்ன?',
  invoice_date: 'இன்வாய்ஸ் தேதி என்ன?',
  due_date: 'பணம் செலுத்த வேண்டிய தேதி என்ன?',
  discount: 'தள்ளுபடி சதவீதம் எவ்வளவு? இல்லையென்றால் பூஜ்யம் என்று சொல்லுங்கள்.',
  gst: 'GST சதவீதம் எவ்வளவு?',
  reference_no: 'ரெஃபரன்ஸ் எண் என்ன? (DC அல்லது இன்வாய்ஸ் எண்)',
  category: 'எந்த வகை: customer DC, no DC, new part, goods purchase, service purchase, அல்லது expenses?',
  doc_type: 'இது tax invoice, proforma invoice, அல்லது credit note-ஆ?',
  inward_no: 'இன்வார்ட் எண் என்ன?',
  heat_no: 'ஹீட் அல்லது பேட்ச் எண் என்ன?',
  received_qty: 'எத்தனை பீஸ் வந்தது?',
  batch_no: 'பேட்ச் அல்லது லாட் எண் என்ன?',
  location: 'எந்த வேர்ஹவுஸ் அல்லது ரேக்கில் வைக்கப்படும்?',
  reason: 'நிராகரிப்புக்கான காரணம் என்ன?',
  disposition: 'அவற்றை என்ன செய்வது? scrap, rework, அல்லது return?',
  dc_no: 'டெலிவரி சலான் எண் என்ன?',
  vehicle_no: 'வாகன எண் என்ன?',
  eway_bill: 'இ-வே பில் எண் என்ன?',
  place_of_supply: 'சப்ளை செய்யும் இடம் எது?',
  packaging: 'பேக்கிங் விவரங்கள் என்ன?',
  invoice_no: 'இன்வாய்ஸ் எண் என்ன?',
  amount: 'மொத்த இன்வாய்ஸ் தொகை எவ்வளவு?',
};

export function questionFor(f: WizardField, boxId: string, lang: 'en' | 'ta'): string {
  if (lang === 'ta') return QUESTION_TA[f.key] ?? `${f.labelTa} என்ன?`;
  if (boxId === 'quotation' && f.key === 'price') return 'What is the unit rate, the price per piece you are quoting?';
  if (boxId === 'quotation' && f.key === 'remarks') return 'Any additional notes for the quotation?';
  if (boxId === 'inward' && f.key === 'price') return 'What is the purchase price per piece?';
  if (boxId === 'invoice' && f.key === 'price') return 'What is the rate per piece to bill?';
  if (boxId === 'sales_order' && f.key === 'price') return 'What is the confirmed rate, the price per piece?';
  if (boxId === 'dc' && f.key === 'remarks') return 'Any notes for the delivery challan?';
  if (boxId === 'finished_goods' && f.key === 'quantity') return 'How many finished pieces are ready?';
  if (boxId === 'finished_goods' && f.key === 'remarks') return 'What is the QC status?';
  if (boxId === 'dc' && f.key === 'quantity') return 'How many pieces are being dispatched?';
  if (boxId === 'rejected' && f.key === 'quantity') return 'How many pieces were rejected?';
  return QUESTION_EN[f.key] ?? `What is the ${f.label.toLowerCase()}?`;
}

export const isHardRequired = (boxId: string, key: string) => (HARD_REQUIRED[boxId] ?? []).includes(key);

/** Which details are still empty and cannot be left empty. */
export function missingHard(boxId: string, answers: Record<string, unknown>): string[] {
  return (HARD_REQUIRED[boxId] ?? []).filter((k) => {
    const v = answers[k];
    if (v === undefined || v === null || String(v).trim() === '') return true;
    return NUMBER_KEYS.has(k) && !(Number(v) > 0);   // a quantity or a rate of zero is the same as none
  });
}
