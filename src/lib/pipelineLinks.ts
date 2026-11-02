// How the records of the Sales Pipeline belong together: an enquiry becomes a quotation, a quotation a sales order, an order an
// inward, and so on. The board uses these links so that one job is never shown in two columns at once, and so that deleting a
// record never silently pulls an earlier stage back while a later stage still stands on it.

/** "1001-02Nov26-1123AM" -> "1001" (the order-time stamp is only a suffix on the same unique number). */
export const baseNo = (s: unknown): string => String(s ?? '').trim().replace(/-\d{2}[A-Za-z]{3}\d{2}-\d{4}(AM|PM)$/, '');
const low = (s: unknown) => String(s ?? '').trim().toLowerCase();

interface Rows { quotes?: any[]; orders?: any[]; inwards?: any[] }

/**
 * Every number / id that a LATER stage points back to: the enquiry ids and numbers named by quotations, the enquiry numbers on
 * sales orders (and, through their quotation, the quotation's enquiry), and the project numbers on inwards.
 */
export function downstreamLeadKeys({ quotes = [], orders = [], inwards = [] }: Rows): Set<string> {
  const keys = new Set<string>();
  const add = (v: unknown) => { const s = low(v); if (!s) return; keys.add(s); const b = low(baseNo(v)); if (b) keys.add(b); };
  const quoteById = new Map(quotes.map((q) => [low(q.id), q]));
  for (const q of quotes) { add(q.lead_id); add(q.lead_no); add(q.enquiry_no); }
  for (const o of orders) {
    add(o.lead_no);
    const q = quoteById.get(low(o.quotation_id));
    if (q) { add(q.lead_id); add(q.lead_no); add(q.enquiry_no); }
  }
  for (const i of inwards) { add(i.project_name); add(i.enquiry_id); }
  return keys;
}

/** True when a later stage (quotation, order or inward) still stands on this enquiry. */
export function leadIsLinked(lead: any, keys: Set<string>): boolean {
  const ids = [lead?.id, lead?.lead_no, lead?.enquiry_no].map(low).filter(Boolean);
  const bases = [lead?.lead_no, lead?.enquiry_no].map((v) => low(baseNo(v))).filter(Boolean);
  return ids.some((k) => keys.has(k)) || bases.some((k) => keys.has(k));
}

const ACTIVE = ['New', 'Contacted', 'Qualified', 'Under Review'];

/**
 * The enquiries for the Enquiry column. An enquiry belongs there while nothing later stands on it. It comes back when its quotation
 * or order is deleted, but it never shows beside an inward / quotation / order that still exists for it (that was one job in two columns).
 */
export function enquiryColumnLeads(leads: any[], rows: Rows): any[] {
  const keys = downstreamLeadKeys(rows);
  return (leads ?? []).filter((l) => {
    const activeStatus = ACTIVE.includes(l.status) && (l.pipeline_stage === 'Enquiry' || !l.pipeline_stage);
    const movedOn = l.status === 'Quoted' || l.pipeline_stage === 'Quotation' || l.status === 'Converted';
    if (!activeStatus && !movedOn) return false;
    return !leadIsLinked(l, keys);
  });
}
