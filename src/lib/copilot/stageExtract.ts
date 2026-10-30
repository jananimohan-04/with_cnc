// Reads what a person says about a pipeline stage ("delivery due date 14 November 2026, unit price 200, PO 4500123")
// into field values. This is the offline / no-key fallback; ChatGPT does the same job when a key is set.
import { isoDateLoose } from './actions';

/** "blank", "none", "nothing"... : the person is saying a field has no value. */
export const BLANK_WORD = /^(?:blank|none|nil|nothing|no|empty|null|n\/a|na|skip|illa|இல்லை)$/i;

const num = (s: string) => Number(s.replace(/,/g, ''));
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const DATE_RE = new RegExp(
  `(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH},?\\s+\\d{4}|${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})`,
  'i',
);
// an identifier must contain a digit (so "order notes" is never read as a PO number)
const ID = '([A-Za-z0-9][A-Za-z0-9\\-_/]*)';
const withDigit = (v: string | undefined) => (v && /\d/.test(v) ? v.trim() : '');

export function extractStageFieldsLocal(text: string): Record<string, any> {
  const clean = text.trim().replace(/\s+/g, ' ');
  const res: Record<string, any> = {};
  if (!clean) return res;
  const set = (k: string, v: unknown) => { if (v !== '' && v != null && !(typeof v === 'number' && !Number.isFinite(v))) res[k] = v; };
  const tail = (v: string) => v.trim().replace(/^(?:is|as|are|to|of|:|=|-)\s*/i, '').trim();

  // free text first, so its words are not mistaken for numbers / ids below
  const remM = /\b(?:remarks?|notes?|comments?|குறிப்பு)\s*(?:is|as|:|=)?\s*(.+)$/i.exec(clean);
  let body = clean;
  if (remM) {
    const r = tail(remM[1]);
    if (r && !BLANK_WORD.test(r)) set('remarks', r);
    body = clean.slice(0, remM.index).trim();
  }

  const custM = /(?:customer|company|party|client|கஸ்டமர்|கம்பெனி)\s*(?:is|name|as|:)?\s*([A-Za-z0-9\s&.\-]+?)(?=\s*(?:part|product|item|qty|quantity|price|rate|value|po|order|date|பார்ட்|விலை|$))/i.exec(body);
  if (custM && custM[1].trim()) set('customer', custM[1].trim());

  const partM = /(?:part|product|item|material|பார்ட்|பொருள்)\s*(?:name|is|as|:)?\s*([A-Za-z0-9\s&.\-]+?)(?=\s*(?:qty|quantity|price|rate|value|po|customer|company|date|விலை|$))/i.exec(body);
  if (partM && partM[1].trim()) set('part_name', partM[1].trim());

  const qtyM = /(?:qty|quantity|quantities|count|pieces|pcs|nos|அளவு|எண்ணிக்கை)\s*(?:is|are|as|to|of|:|=)?\s*(\d+(?:\.\d+)?)/i.exec(body)
    || /(\d+(?:\.\d+)?)\s*(?:pcs|pieces|nos|numbers|units)\b/i.exec(body);
  if (qtyM) { set('quantity', num(qtyM[1])); if (/receiv/i.test(body)) set('received_qty', num(qtyM[1])); }

  // money: "unit price 200", "union prices 200" (a common mis-hearing of "unit"), "amount ₹6,000", "rate is 120"
  const amtM = /(?:invoice\s+amount|total\s+amount|total|amount)\s*(?:is|as|of|:|=)?\s*(?:rs\.?|₹)?\s*(\d[\d,]*(?:\.\d+)?)/i.exec(body);
  if (amtM) set('amount', num(amtM[1]));
  const priceM = /(?:\b(?:unit|union|confirmed|target)\s*)?\b(?:prices?|rate|cost|value|விலை|தொகை|ரூபாய்|rs\.?|₹)\s*(?:is|are|as|to|of|:|=)?\s*(?:rs\.?|₹)?\s*(\d[\d,]*(?:\.\d+)?)/i.exec(body);
  if (priceM) set('price', num(priceM[1]));
  if (res.amount == null && priceM && /invoice|bill/i.test(body)) set('amount', num(priceM[1]));

  const dateM = DATE_RE.exec(body);
  if (dateM) {
    const iso = isoDateLoose(dateM[1]);
    if (iso) {
      if (/\bdue\b|payment/i.test(body) && !/deliver/i.test(body)) set('due_date', iso);
      else { set('delivery_date', iso); if (/\bdue\b/i.test(body)) set('due_date', iso); }
    }
  }

  const poM = new RegExp(`\\b(?:po|p\\.o\\.|purchase\\s*order)\\s*(?:no\\.?|number)?\\s*(?:is|as|:|=|-)?\\s*${ID}`, 'i').exec(body);
  set('po_no', withDigit(poM?.[1]));
  const inwM = new RegExp(`\\b(?:inward|inw)\\s*(?:no\\.?|number)?\\s*(?:is|as|:|=|-)?\\s*${ID}`, 'i').exec(body);
  set('inward_no', withDigit(inwM?.[1]));
  const heatM = new RegExp(`\\b(?:heat|batch|lot)\\s*(?:no\\.?|number)?\\s*(?:is|as|:|=|-)?\\s*${ID}`, 'i').exec(body);
  const heat = withDigit(heatM?.[1]);
  if (heat) { set('heat_no', heat); set('batch_no', heat); }
  const dcM = new RegExp(`\\b(?:dc|delivery\\s*challan)\\s*(?:no\\.?|number)?\\s*(?:is|as|:|=|-)?\\s*${ID}`, 'i').exec(body);
  set('dc_no', withDigit(dcM?.[1]));
  const invM = new RegExp(`\\b(?:invoice|inv|bill)\\s*(?:no\\.?|number)?\\s*(?:is|as|:|=|-)?\\s*${ID}`, 'i').exec(body);
  set('invoice_no', withDigit(invM?.[1]));

  const plate = /\b([A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{0,3}[\s-]?\d{3,4})\b/i.exec(body);
  if (plate) set('vehicle_no', plate[1].toUpperCase().replace(/\s+/g, '-'));

  const rsnM = /(?:reason|defect|cause|problem|காரணம்)\s*(?:is|as|:|=|-)?\s*(.+?)(?=\s+(?:qty|quantity|disposition|action|location)\b|$)/i.exec(body);
  if (rsnM && !BLANK_WORD.test(rsnM[1].trim())) set('reason', rsnM[1].trim());
  const dispM = /(?:disposition|action)\s*(?:is|as|:|=|-)?\s*(scrap|rework|return(?:\s+to\s+vendor)?|use\s+as\s+is)/i.exec(body);
  if (dispM) set('disposition', dispM[1]);

  const valM = /(?:validity|valid(?:\s+for|\s+till)?)\s*(?:period|is|as|:|=)?\s*(\d+\s*(?:days?|weeks?|months?))/i.exec(body);
  if (valM) set('validity', valM[1]);
  const payM = /(?:payment\s*terms?|terms)\s*(?:is|as|:|=)?\s*(.+?)(?=\s+(?:validity|valid|price|rate|delivery|unit|notes?|remarks?)\b|$)/i.exec(body);
  if (payM && !BLANK_WORD.test(payM[1].trim())) set('payment_terms', payM[1].trim());

  const locM = /(?:location|bin|rack)\s*(?:is|as|:|=)?\s*([A-Za-z0-9\- ]+?)(?=\s+(?:batch|lot|qty|quantity)\b|$)/i.exec(body);
  if (locM && locM[1].trim() && !BLANK_WORD.test(locM[1].trim())) set('location', locM[1].trim());

  // a bare number said on its own ("120") is the price
  if (res.price == null && res.amount == null) {
    const bare = /^(?:rs\.?|₹)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:rs|rupees|inr)?$/i.exec(body);
    if (bare) set('price', num(bare[1]));
  }
  return res;
}
